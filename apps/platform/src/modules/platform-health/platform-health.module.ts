import {
  CallHandler,
  Controller,
  Get,
  Header,
  Injectable,
  Module,
  Res,
  type ExecutionContext,
  type NestInterceptor,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import type { Observable } from "rxjs";
import { tap } from "rxjs";

import {
  DatabaseModule,
  DatabaseService,
} from "../../database/database.module.js";
import {
  PlatformHealthStore,
  type ReliableWorkMetrics,
  type WorkerHeartbeatStatus,
} from "./platform-health.js";

type Environment = Readonly<Record<string, string | undefined>>;
type DependencyName = "postgresql" | "victoriametrics" | "vmalert" | "worker";
type DependencyStatus = "AVAILABLE" | "STALE" | "UNAVAILABLE";

interface DependencyHealth {
  readonly status: DependencyStatus;
  readonly lastSuccessAt?: string;
}

interface RuntimeHealthConfig {
  readonly victoriaMetricsUrl: URL;
  readonly vmAlertUrl: URL;
  readonly timeoutMs: number;
  readonly heartbeatIntervalMs: number;
  readonly heartbeatStaleAfterMs: number;
  readonly workerInstanceId: string;
}

const processStartedAt = new Date().toISOString();
const stableValuePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

function positiveInteger(
  environment: Environment,
  name: string,
  fallback: number,
) {
  const raw = environment[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function boundedValue(
  environment: Environment,
  name: string,
  fallback: string,
  maximumLength: number,
) {
  const value = environment[name]?.trim() || fallback;
  if (value.length > maximumLength || !stableValuePattern.test(value)) {
    throw new Error(`${name} must be a bounded stable value`);
  }
  return value;
}

function serviceUrl(environment: Environment, name: string, fallback: string) {
  const url = new URL(environment[name] ?? fallback);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password
  ) {
    throw new Error(`${name} must be an HTTP URL without credentials`);
  }
  return url;
}

export function readRuntimeHealthConfig(
  environment: Environment = process.env,
): RuntimeHealthConfig {
  const heartbeatIntervalMs = positiveInteger(
    environment,
    "WORKER_HEARTBEAT_INTERVAL_MS",
    5_000,
  );
  const heartbeatStaleAfterMs = positiveInteger(
    environment,
    "WORKER_HEARTBEAT_STALE_AFTER_MS",
    15_000,
  );
  if (heartbeatStaleAfterMs <= heartbeatIntervalMs) {
    throw new Error(
      "WORKER_HEARTBEAT_STALE_AFTER_MS must exceed WORKER_HEARTBEAT_INTERVAL_MS",
    );
  }
  return {
    victoriaMetricsUrl: serviceUrl(
      environment,
      "VICTORIAMETRICS_URL",
      "http://127.0.0.1:8428",
    ),
    vmAlertUrl: serviceUrl(environment, "VMALERT_URL", "http://127.0.0.1:8880"),
    timeoutMs: positiveInteger(
      environment,
      "PLATFORM_HEALTH_TIMEOUT_MS",
      2_000,
    ),
    heartbeatIntervalMs,
    heartbeatStaleAfterMs,
    workerInstanceId: boundedValue(
      environment,
      "WORKER_INSTANCE_ID",
      "platform-worker-local",
      128,
    ),
  };
}

@Injectable()
class ApiRequestMetrics implements NestInterceptor {
  private successes = 0;
  private errors = 0;

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context
      .switchToHttp()
      .getResponse<{ statusCode: number }>();
    return next.handle().pipe(
      tap({
        next: () => {
          if (response.statusCode >= 400) {
            this.errors += 1;
          } else {
            this.successes += 1;
          }
        },
        error: () => {
          this.errors += 1;
        },
      }),
    );
  }

  snapshot() {
    return { successes: this.successes, errors: this.errors };
  }
}

@Injectable()
class RuntimeHealthService {
  private readonly config = readRuntimeHealthConfig();
  private readonly lastSuccess = new Map<DependencyName, string>();

  constructor(private readonly database: DatabaseService) {}

  private get store() {
    return new PlatformHealthStore(this.database.pool);
  }

  private async checkPostgreSql(): Promise<DependencyStatus> {
    await this.database.pool.query("select 1");
    return this.database.status.compatible ? "AVAILABLE" : "UNAVAILABLE";
  }

  private async checkHttp(url: URL): Promise<DependencyStatus> {
    const endpoint = new URL("/-/healthy", url);
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    return response.ok ? "AVAILABLE" : "UNAVAILABLE";
  }

  private checkWorker(): Promise<WorkerHeartbeatStatus> {
    return this.store.readWorkerHeartbeat(
      "platform-worker",
      this.config.heartbeatStaleAfterMs,
    );
  }

  private async check(
    name: DependencyName,
    operation: () => Promise<DependencyStatus | WorkerHeartbeatStatus>,
  ): Promise<DependencyHealth> {
    try {
      const result = await operation();
      const status = typeof result === "string" ? result : result.status;
      if (status === "AVAILABLE") {
        this.lastSuccess.set(name, new Date().toISOString());
      }
      const lastSuccessAt = this.lastSuccess.get(name);
      return lastSuccessAt ? { status, lastSuccessAt } : { status };
    } catch {
      const lastSuccessAt = this.lastSuccess.get(name);
      return lastSuccessAt
        ? { status: "UNAVAILABLE", lastSuccessAt }
        : { status: "UNAVAILABLE" };
    }
  }

  async readiness() {
    const entries = await Promise.all([
      this.check("postgresql", () => this.checkPostgreSql()),
      this.check("victoriametrics", () =>
        this.checkHttp(this.config.victoriaMetricsUrl),
      ),
      this.check("vmalert", () => this.checkHttp(this.config.vmAlertUrl)),
      this.check("worker", () => this.checkWorker()),
    ]);
    const dependencies = {
      postgresql: entries[0],
      victoriametrics: entries[1],
      vmalert: entries[2],
      worker: entries[3],
    };
    return {
      service: "platform-api",
      status: entries.every((dependency) => dependency.status === "AVAILABLE")
        ? ("READY" as const)
        : ("NOT_READY" as const),
      version: process.env.APP_VERSION ?? "dev",
      startedAt: processStartedAt,
      checkedAt: new Date().toISOString(),
      dependencies,
    };
  }

  async reliableWorkMetrics(): Promise<ReliableWorkMetrics | undefined> {
    try {
      return await this.store.readReliableWorkMetrics();
    } catch {
      return undefined;
    }
  }
}

function metric(
  name: string,
  help: string,
  type: "counter" | "gauge",
  value: number,
) {
  return `# HELP ${name} ${help}\n# TYPE ${name} ${type}\n${name} ${value}`;
}

@Controller()
class PlatformHealthController {
  constructor(
    private readonly health: RuntimeHealthService,
    private readonly requests: ApiRequestMetrics,
  ) {}

  @Get("health/live")
  liveness() {
    return {
      service: "platform-api",
      status: "ALIVE",
      version: process.env.APP_VERSION ?? "dev",
      startedAt: processStartedAt,
    };
  }

  @Get("health/ready")
  async readiness(
    @Res({ passthrough: true }) response: { status(code: number): unknown },
  ) {
    const health = await this.health.readiness();
    response.status(health.status === "READY" ? 200 : 503);
    return health;
  }

  @Get("metrics")
  @Header("content-type", "text/plain; version=0.0.4; charset=utf-8")
  async metrics() {
    const health = await this.health.readiness();
    const reliable = await this.health.reliableWorkMetrics();
    const requests = this.requests.snapshot();
    const lines = [
      metric(
        "nop_api_requests_success_total",
        "Successful Platform API requests.",
        "counter",
        requests.successes,
      ),
      metric(
        "nop_api_requests_error_total",
        "Failed Platform API requests.",
        "counter",
        requests.errors,
      ),
      "# HELP nop_runtime_dependency_available Dependency readiness (1 available, 0 unavailable or stale).",
      "# TYPE nop_runtime_dependency_available gauge",
      ...Object.entries(health.dependencies).map(
        ([name, dependency]) =>
          `nop_runtime_dependency_available{dependency="${name}"} ${dependency.status === "AVAILABLE" ? 1 : 0}`,
      ),
    ];
    if (reliable) {
      lines.push(
        metric(
          "nop_reliable_inbox_duplicates_total",
          "Duplicate Inbox submissions observed by the idempotency path.",
          "counter",
          reliable.inboxDuplicates,
        ),
        metric(
          "nop_reliable_inbox_pending",
          "Pending Inbox messages.",
          "gauge",
          reliable.inboxPending,
        ),
        metric(
          "nop_reliable_outbox_pending",
          "Undelivered Outbox messages.",
          "gauge",
          reliable.outboxPending,
        ),
        "# HELP nop_reliable_jobs Background jobs by bounded status.",
        "# TYPE nop_reliable_jobs gauge",
        `nop_reliable_jobs{status="ready"} ${reliable.jobsReady}`,
        `nop_reliable_jobs{status="completed"} ${reliable.jobsCompleted}`,
        `nop_reliable_jobs{status="dead_letter"} ${reliable.jobsDeadLetter}`,
        metric(
          "nop_reliable_active_leases",
          "Unexpired background-job leases.",
          "gauge",
          reliable.activeLeases,
        ),
        metric(
          "nop_reliable_oldest_ready_job_seconds",
          "Age of the oldest ready background job.",
          "gauge",
          reliable.oldestReadyJobSeconds,
        ),
      );
    }
    return `${lines.join("\n")}\n`;
  }
}

@Injectable()
class WorkerHeartbeatService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly config = readRuntimeHealthConfig();
  private readonly startedAt = new Date();
  private timer: NodeJS.Timeout | undefined;
  private writing = false;

  constructor(private readonly database: DatabaseService) {}

  private async writeHeartbeat() {
    if (this.writing || !this.database.status.connected) return;
    this.writing = true;
    try {
      await new PlatformHealthStore(this.database.pool).recordHeartbeat({
        workerType: "platform-worker",
        instanceId: this.config.workerInstanceId,
        startedAt: this.startedAt,
        version: process.env.APP_VERSION ?? "dev",
      });
    } catch {
      console.error("platform-worker heartbeat write failed");
    } finally {
      this.writing = false;
    }
  }

  async onApplicationBootstrap() {
    if (!this.database.status.connected) return;
    await this.writeHeartbeat();
    this.timer = setInterval(
      () => void this.writeHeartbeat(),
      this.config.heartbeatIntervalMs,
    );
    this.timer.unref();
  }

  async onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    if (!this.database.status.connected) return;
    await Promise.race([
      new PlatformHealthStore(this.database.pool).stopHeartbeat(
        "platform-worker",
        this.config.workerInstanceId,
      ),
      new Promise<void>((resolve) =>
        setTimeout(resolve, this.config.timeoutMs).unref(),
      ),
    ]).catch(() => undefined);
  }
}

@Module({
  imports: [DatabaseModule],
  controllers: [PlatformHealthController],
  providers: [
    RuntimeHealthService,
    ApiRequestMetrics,
    { provide: APP_INTERCEPTOR, useExisting: ApiRequestMetrics },
  ],
})
export class PlatformHealthApiModule {}

@Module({ imports: [DatabaseModule], providers: [WorkerHeartbeatService] })
export class PlatformHealthWorkerModule {}
