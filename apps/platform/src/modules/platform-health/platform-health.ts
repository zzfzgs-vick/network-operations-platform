import type { Pool } from "pg";

const stableValuePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

function stableValue(value: string, name: string, maximumLength: number) {
  if (
    value.length < 1 ||
    value.length > maximumLength ||
    !stableValuePattern.test(value)
  ) {
    throw new Error(`${name} must be a bounded stable value`);
  }
  return value;
}

export interface WorkerInstance {
  readonly workerType: string;
  readonly instanceId: string;
  readonly startedAt: Date;
  readonly version: string;
}

export interface WorkerHeartbeatStatus {
  readonly status: "AVAILABLE" | "STALE" | "UNAVAILABLE";
  readonly instanceId?: string;
  readonly lastHeartbeatAt?: Date;
}

export interface ReliableWorkMetrics {
  readonly inboxDuplicates: number;
  readonly inboxPending: number;
  readonly outboxPending: number;
  readonly jobsReady: number;
  readonly jobsCompleted: number;
  readonly jobsDeadLetter: number;
  readonly activeLeases: number;
  readonly oldestReadyJobSeconds: number;
}

export class PlatformHealthStore {
  constructor(private readonly pool: Pool) {}

  async recordHeartbeat(instance: WorkerInstance) {
    await this.pool.query(
      `
        insert into public.platform_worker_heartbeats (
          worker_type, instance_id, started_at, last_heartbeat_at, version, status
        ) values ($1, $2, $3, clock_timestamp(), $4, 'RUNNING')
        on conflict (worker_type, instance_id) do update
        set started_at = excluded.started_at,
            last_heartbeat_at = clock_timestamp(),
            version = excluded.version,
            status = 'RUNNING'
      `,
      [
        stableValue(instance.workerType, "workerType", 32),
        stableValue(instance.instanceId, "instanceId", 128),
        instance.startedAt,
        stableValue(instance.version, "version", 64),
      ],
    );
  }

  async stopHeartbeat(workerType: string, instanceId: string) {
    await this.pool.query(
      `
        update public.platform_worker_heartbeats
        set status = 'STOPPED', last_heartbeat_at = clock_timestamp()
        where worker_type = $1 and instance_id = $2
      `,
      [
        stableValue(workerType, "workerType", 32),
        stableValue(instanceId, "instanceId", 128),
      ],
    );
  }

  async readWorkerHeartbeat(
    workerType: string,
    staleAfterMs: number,
  ): Promise<WorkerHeartbeatStatus> {
    if (!Number.isInteger(staleAfterMs) || staleAfterMs < 1) {
      throw new Error("staleAfterMs must be a positive integer");
    }
    const result = await this.pool.query<{
      instance_id: string;
      last_heartbeat_at: Date;
      status: string;
      stale: boolean;
    }>(
      `
        select instance_id,
               last_heartbeat_at,
               status,
               last_heartbeat_at < clock_timestamp() - $2 * interval '1 millisecond' as stale
        from public.platform_worker_heartbeats
        where worker_type = $1
        order by last_heartbeat_at desc
        limit 1
      `,
      [stableValue(workerType, "workerType", 32), staleAfterMs],
    );
    const row = result.rows[0];
    if (!row || row.status !== "RUNNING") return { status: "UNAVAILABLE" };
    return {
      status: row.stale ? "STALE" : "AVAILABLE",
      instanceId: row.instance_id,
      lastHeartbeatAt: row.last_heartbeat_at,
    };
  }

  async readReliableWorkMetrics(): Promise<ReliableWorkMetrics> {
    const result = await this.pool.query<{
      inbox_duplicates: string;
      inbox_pending: string;
      outbox_pending: string;
      jobs_ready: string;
      jobs_completed: string;
      jobs_dead_letter: string;
      active_leases: string;
      oldest_ready_job_seconds: number;
    }>(`
      select
        (select duplicate_count from public.reliable_inbox_observability where singleton)
          as inbox_duplicates,
        (select count(*) from public.reliable_inbox_messages where status = 'PENDING')
          as inbox_pending,
        (select count(*) from public.reliable_outbox_messages where delivered_at is null)
          as outbox_pending,
        (select count(*) from public.reliable_background_jobs where status = 'READY')
          as jobs_ready,
        (select count(*) from public.reliable_background_jobs where status = 'COMPLETED')
          as jobs_completed,
        (select count(*) from public.reliable_background_jobs where status = 'DEAD_LETTER')
          as jobs_dead_letter,
        (select count(*) from public.reliable_worker_leases
          where lease_expires_at > clock_timestamp()) as active_leases,
        coalesce((select extract(epoch from (clock_timestamp() - min(available_at)))
          from public.reliable_background_jobs where status = 'READY'), 0)::double precision
          as oldest_ready_job_seconds
    `);
    const row = result.rows[0];
    if (!row) throw new Error("Reliable Work metrics query returned no row");
    return {
      inboxDuplicates: Number(row.inbox_duplicates),
      inboxPending: Number(row.inbox_pending),
      outboxPending: Number(row.outbox_pending),
      jobsReady: Number(row.jobs_ready),
      jobsCompleted: Number(row.jobs_completed),
      jobsDeadLetter: Number(row.jobs_dead_letter),
      activeLeases: Number(row.active_leases),
      oldestReadyJobSeconds: Math.max(0, row.oldest_ready_job_seconds),
    };
  }
}
