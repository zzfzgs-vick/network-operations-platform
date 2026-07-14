import { randomInt, randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import { withTransaction } from "../../database/database.js";

const stableValuePattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;

function stableValue(value: string, name: string, maxLength: number) {
  if (
    value.length < 1 ||
    value.length > maxLength ||
    !stableValuePattern.test(value)
  ) {
    throw new Error(`${name} must be a bounded stable value`);
  }
  return value;
}

export interface InboxInput {
  readonly sourceId: string;
  readonly idempotencyKey: string;
  readonly messageKind: string;
  readonly payloadReference: string;
}

export interface InboxMessage extends InboxInput {
  readonly inboxMessageId: string;
}

export interface OutboxInput {
  readonly destination: string;
  readonly idempotencyKey: string;
  readonly payloadReference: string;
}

export interface JobInput {
  readonly jobType: string;
  readonly idempotencyKey: string;
  readonly payloadReference: string;
  readonly priority: number;
  readonly maxAttempts: number;
}

export interface ClaimedJob {
  readonly jobId: string;
  readonly jobType: string;
  readonly payloadReference: string;
  readonly attemptCount: number;
  readonly maxAttempts: number;
}

export type FailureCategory =
  | "TRANSIENT_DATABASE"
  | "DEPENDENCY_UNAVAILABLE"
  | "TIMEOUT"
  | "INVALID_DATA"
  | "IDENTITY_UNRESOLVED"
  | "VERSION_MISMATCH"
  | "PERMANENT_BUSINESS"
  | "UNKNOWN";

export interface JobFailure {
  readonly category: FailureCategory;
  readonly code: string;
  readonly retryable: boolean;
  readonly baseDelayMs: number;
}

export interface DeadLetterRecord {
  readonly deadLetterId: string;
  readonly jobId: string;
  readonly attemptNumber: number;
  readonly failureCategory: FailureCategory;
  readonly failureCode: string;
}

function boundedInteger(
  value: number,
  name: string,
  minimum: number,
  maximum: number,
) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return value;
}

export class ReliableWorkStore {
  constructor(private readonly pool: Pool) {}

  async acceptInbox(input: InboxInput) {
    const inboxMessageId = randomUUID();
    const values = [
      inboxMessageId,
      stableValue(input.sourceId, "sourceId", 128),
      stableValue(input.idempotencyKey, "idempotencyKey", 128),
      stableValue(input.messageKind, "messageKind", 64),
      stableValue(input.payloadReference, "payloadReference", 256),
    ];
    const inserted = await this.pool.query<{ inbox_message_id: string }>(
      `
        insert into public.reliable_inbox_messages (
          inbox_message_id, source_id, idempotency_key, message_kind, payload_reference
        ) values ($1, $2, $3, $4, $5)
        on conflict (source_id, idempotency_key) do nothing
        returning inbox_message_id
      `,
      values,
    );
    const accepted = inserted.rowCount === 1;

    if (accepted) return { inboxMessageId, accepted } as const;

    await this.pool
      .query(
        `
          update public.reliable_inbox_observability
          set duplicate_count = duplicate_count + 1,
              updated_at = clock_timestamp()
          where singleton
        `,
      )
      .catch(() => undefined);

    const existing = await this.pool.query<{ inbox_message_id: string }>(
      `
        select inbox_message_id
        from public.reliable_inbox_messages
        where source_id = $1 and idempotency_key = $2
      `,
      values.slice(1, 3),
    );
    return {
      inboxMessageId: existing.rows[0]?.inbox_message_id ?? inboxMessageId,
      accepted,
    } as const;
  }

  processNextInbox(
    messageKind: string,
    handler: (client: PoolClient, message: InboxMessage) => Promise<unknown>,
  ) {
    return withTransaction(this.pool, async (client) => {
      const result = await client.query<{
        inbox_message_id: string;
        source_id: string;
        idempotency_key: string;
        message_kind: string;
        payload_reference: string;
      }>(
        `
          select inbox_message_id, source_id, idempotency_key, message_kind, payload_reference
          from public.reliable_inbox_messages
          where status = 'PENDING' and message_kind = $1
          order by received_at, inbox_message_id
          for update skip locked
          limit 1
        `,
        [stableValue(messageKind, "messageKind", 64)],
      );
      const row = result.rows[0];
      if (!row) return false;

      await handler(client, {
        inboxMessageId: row.inbox_message_id,
        sourceId: row.source_id,
        idempotencyKey: row.idempotency_key,
        messageKind: row.message_kind,
        payloadReference: row.payload_reference,
      });
      await client.query(
        `
          update public.reliable_inbox_messages
          set status = 'COMPLETED', completed_at = clock_timestamp()
          where inbox_message_id = $1
        `,
        [row.inbox_message_id],
      );
      return true;
    });
  }

  async appendOutbox(client: PoolClient, input: OutboxInput) {
    const result = await client.query<{ outbox_message_id: string }>(
      `
        insert into public.reliable_outbox_messages (
          outbox_message_id, destination, idempotency_key, payload_reference
        ) values ($1, $2, $3, $4)
        on conflict (destination, idempotency_key) do nothing
        returning outbox_message_id
      `,
      [
        randomUUID(),
        stableValue(input.destination, "destination", 64),
        stableValue(input.idempotencyKey, "idempotencyKey", 128),
        stableValue(input.payloadReference, "payloadReference", 256),
      ],
    );
    return result.rows[0]?.outbox_message_id ?? null;
  }

  async enqueueJob(input: JobInput) {
    const jobId = randomUUID();
    const values = [
      jobId,
      stableValue(input.jobType, "jobType", 64),
      stableValue(input.idempotencyKey, "idempotencyKey", 128),
      stableValue(input.payloadReference, "payloadReference", 256),
      boundedInteger(input.priority, "priority", 0, 100),
      boundedInteger(input.maxAttempts, "maxAttempts", 1, 100),
    ];
    const inserted = await this.pool.query<{ job_id: string }>(
      `
        insert into public.reliable_background_jobs (
          job_id, job_type, idempotency_key, payload_reference, priority, max_attempts
        ) values ($1, $2, $3, $4, $5, $6)
        on conflict (job_type, idempotency_key) do nothing
        returning job_id
      `,
      values,
    );
    if (inserted.rows[0])
      return { jobId: inserted.rows[0].job_id, accepted: true } as const;

    const existing = await this.pool.query<{ job_id: string }>(
      `select job_id from public.reliable_background_jobs where job_type = $1 and idempotency_key = $2`,
      values.slice(1, 3),
    );
    return {
      jobId: existing.rows[0]?.job_id ?? jobId,
      accepted: false,
    } as const;
  }

  claimReadyJobs(
    leaseOwner: string,
    limit: number,
    leaseDurationMs: number,
  ): Promise<readonly ClaimedJob[]> {
    const owner = stableValue(leaseOwner, "leaseOwner", 128);
    const claimLimit = boundedInteger(limit, "limit", 1, 100);
    const duration = boundedInteger(
      leaseDurationMs,
      "leaseDurationMs",
      1,
      86_400_000,
    );

    return withTransaction(this.pool, async (client) => {
      const candidates = await client.query<{
        job_id: string;
        job_type: string;
        payload_reference: string;
        attempt_count: number;
        max_attempts: number;
      }>(
        `
          select j.job_id, j.job_type, j.payload_reference, j.attempt_count, j.max_attempts
          from public.reliable_background_jobs j
          where j.status = 'READY'
            and j.available_at <= clock_timestamp()
            and not exists (
              select 1 from public.reliable_worker_leases l
              where l.job_id = j.job_id and l.lease_expires_at > clock_timestamp()
            )
          order by
            (j.priority + least(100, floor(extract(epoch from (clock_timestamp() - j.created_at)) / 60))) desc,
            j.available_at,
            j.job_id
          for update of j skip locked
          limit $1
        `,
        [claimLimit],
      );
      const claimed: ClaimedJob[] = [];

      for (const row of candidates.rows) {
        await client.query(
          `
            update public.reliable_job_attempts
            set outcome = 'LEASE_EXPIRED',
                failure_category = 'TIMEOUT',
                failure_code = 'LEASE_EXPIRED',
                completed_at = clock_timestamp()
            where job_id = $1 and outcome = 'RUNNING'
          `,
          [row.job_id],
        );
        await client.query(
          `
            insert into public.reliable_worker_leases (
              job_id, lease_owner, lease_expires_at, renewed_at
            ) values ($1, $2, clock_timestamp() + $3 * interval '1 millisecond', clock_timestamp())
            on conflict (job_id) do update
            set lease_owner = excluded.lease_owner,
                lease_expires_at = excluded.lease_expires_at,
                renewed_at = excluded.renewed_at
          `,
          [row.job_id, owner, duration],
        );
        const updated = await client.query<{ attempt_count: number }>(
          `
            update public.reliable_background_jobs
            set attempt_count = attempt_count + 1,
                cycle_attempt_count = cycle_attempt_count + 1,
                started_at = coalesce(started_at, clock_timestamp())
            where job_id = $1
            returning attempt_count
          `,
          [row.job_id],
        );
        const attemptCount =
          updated.rows[0]?.attempt_count ?? row.attempt_count + 1;
        await client.query(
          `
            insert into public.reliable_job_attempts (
              attempt_id, job_id, attempt_number, lease_owner
            ) values ($1, $2, $3, $4)
          `,
          [randomUUID(), row.job_id, attemptCount, owner],
        );
        claimed.push({
          jobId: row.job_id,
          jobType: row.job_type,
          payloadReference: row.payload_reference,
          attemptCount,
          maxAttempts: row.max_attempts,
        });
      }

      return claimed;
    });
  }

  async renewLease(jobId: string, leaseOwner: string, leaseDurationMs: number) {
    const duration = boundedInteger(
      leaseDurationMs,
      "leaseDurationMs",
      1,
      86_400_000,
    );
    const result = await this.pool.query(
      `
        update public.reliable_worker_leases
        set lease_expires_at = clock_timestamp() + $3 * interval '1 millisecond',
            renewed_at = clock_timestamp()
        where job_id = $1
          and lease_owner = $2
          and lease_expires_at > clock_timestamp()
      `,
      [
        stableValue(jobId, "jobId", 128),
        stableValue(leaseOwner, "leaseOwner", 128),
        duration,
      ],
    );
    return result.rowCount === 1;
  }

  completeJobWithOutbox(
    jobId: string,
    leaseOwner: string,
    outbox: OutboxInput,
  ) {
    const id = stableValue(jobId, "jobId", 128);
    const owner = stableValue(leaseOwner, "leaseOwner", 128);

    return withTransaction(this.pool, async (client) => {
      const active = await client.query<{ attempt_count: number }>(
        `
          select j.attempt_count
          from public.reliable_background_jobs j
          join public.reliable_worker_leases l on l.job_id = j.job_id
          where j.job_id = $1
            and j.status = 'READY'
            and l.lease_owner = $2
            and l.lease_expires_at > clock_timestamp()
          for update of j
        `,
        [id, owner],
      );
      const attemptCount = active.rows[0]?.attempt_count;
      if (!attemptCount) throw new Error("Job lease is not active");

      await this.appendOutbox(client, outbox);
      await client.query(
        `
          update public.reliable_background_jobs
          set status = 'COMPLETED', completed_at = clock_timestamp()
          where job_id = $1
        `,
        [id],
      );
      await client.query(
        `
          update public.reliable_job_attempts
          set outcome = 'SUCCEEDED', completed_at = clock_timestamp()
          where job_id = $1 and attempt_number = $2
        `,
        [id, attemptCount],
      );
      await client.query(
        `delete from public.reliable_worker_leases where job_id = $1`,
        [id],
      );
    });
  }

  failJob(jobId: string, leaseOwner: string, failure: JobFailure) {
    const id = stableValue(jobId, "jobId", 128);
    const owner = stableValue(leaseOwner, "leaseOwner", 128);
    const category = stableValue(failure.category, "failureCategory", 32);
    const code = stableValue(failure.code, "failureCode", 64);
    const baseDelayMs = boundedInteger(
      failure.baseDelayMs,
      "baseDelayMs",
      1,
      3_600_000,
    );

    return withTransaction(this.pool, async (client) => {
      const active = await client.query<{
        attempt_count: number;
        cycle_attempt_count: number;
        max_attempts: number;
      }>(
        `
          select j.attempt_count, j.cycle_attempt_count, j.max_attempts
          from public.reliable_background_jobs j
          join public.reliable_worker_leases l on l.job_id = j.job_id
          where j.job_id = $1
            and j.status = 'READY'
            and l.lease_owner = $2
            and l.lease_expires_at > clock_timestamp()
          for update of j
        `,
        [id, owner],
      );
      const job = active.rows[0];
      if (!job) throw new Error("Job lease is not active");

      const deadLetter =
        !failure.retryable || job.cycle_attempt_count >= job.max_attempts;
      const outcome = deadLetter ? "DEAD_LETTERED" : "RETRY_SCHEDULED";
      await client.query(
        `
          update public.reliable_job_attempts
          set outcome = $3,
              failure_category = $4,
              failure_code = $5,
              completed_at = clock_timestamp()
          where job_id = $1 and attempt_number = $2
        `,
        [id, job.attempt_count, outcome, category, code],
      );

      if (deadLetter) {
        await client.query(
          `
            update public.reliable_background_jobs
            set status = 'DEAD_LETTER',
                failure_category = $2,
                last_error_summary = $3
            where job_id = $1
          `,
          [id, category, code],
        );
        await client.query(
          `
            insert into public.reliable_dead_letters (
              dead_letter_id, job_id, attempt_number, failure_category, failure_code
            ) values ($1, $2, $3, $4, $5)
          `,
          [randomUUID(), id, job.attempt_count, category, code],
        );
      } else {
        const exponentialDelay = Math.min(
          3_600_000,
          baseDelayMs * 2 ** (job.attempt_count - 1),
        );
        const jitterMs = randomInt(
          Math.max(1, Math.floor(exponentialDelay / 4) + 1),
        );
        await client.query(
          `
            update public.reliable_background_jobs
            set available_at = clock_timestamp() + $2 * interval '1 millisecond',
                failure_category = $3,
                last_error_summary = $4
            where job_id = $1
          `,
          [id, exponentialDelay + jitterMs, category, code],
        );
      }

      await client.query(
        `delete from public.reliable_worker_leases where job_id = $1`,
        [id],
      );
      return deadLetter
        ? ("DEAD_LETTER" as const)
        : ("RETRY_SCHEDULED" as const);
    });
  }

  async listActiveDeadLetters(): Promise<readonly DeadLetterRecord[]> {
    const result = await this.pool.query<{
      dead_letter_id: string;
      job_id: string;
      attempt_number: number;
      failure_category: FailureCategory;
      failure_code: string;
    }>(
      `
        select dead_letter_id, job_id, attempt_number, failure_category, failure_code
        from public.reliable_dead_letters
        where retried_at is null
        order by created_at, dead_letter_id
      `,
    );
    return result.rows.map((row) => ({
      deadLetterId: row.dead_letter_id,
      jobId: row.job_id,
      attemptNumber: row.attempt_number,
      failureCategory: row.failure_category,
      failureCode: row.failure_code,
    }));
  }

  retryDeadLetter(deadLetterId: string, retryActor: string) {
    const id = stableValue(deadLetterId, "deadLetterId", 128);
    const actor = stableValue(retryActor, "retryActor", 128);

    return withTransaction(this.pool, async (client) => {
      const active = await client.query<{ job_id: string }>(
        `
          select job_id
          from public.reliable_dead_letters
          where dead_letter_id = $1 and retried_at is null
          for update
        `,
        [id],
      );
      const jobId = active.rows[0]?.job_id;
      if (!jobId) throw new Error("Dead Letter is not active");

      await client.query(
        `
          update public.reliable_dead_letters
          set retried_at = clock_timestamp(), retry_actor = $2
          where dead_letter_id = $1
        `,
        [id, actor],
      );
      await client.query(
        `
          update public.reliable_background_jobs
          set status = 'READY',
              available_at = clock_timestamp(),
              cycle_attempt_count = 0,
              started_at = null,
              completed_at = null,
              failure_category = null,
              last_error_summary = null
          where job_id = $1
        `,
        [jobId],
      );
      await client.query(
        `delete from public.reliable_worker_leases where job_id = $1`,
        [jobId],
      );
    });
  }
}
