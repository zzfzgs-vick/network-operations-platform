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
  loadedConfigurationCategories,
  readRuntimeHealthConfig,
  readRuntimeIdentityConfig,
} from "../../config/public.js";
import { ServiceAuthenticationMetrics } from "../../config/service-auth.js";
import {
  DatabaseModule,
  DatabaseService,
} from "../../database/database.module.js";
import { RuntimeLifecycle } from "../../lifecycle.js";
import {
  AuthorizationMetrics,
  CsrfMetrics,
  PublicEndpoint,
  SessionMetrics,
  TotpMetrics,
} from "../identity-access/public.js";
import { SessionSseMetrics } from "../sse/session-sse.js";
import {
  PlatformHealthStore,
  type ReliableWorkMetrics,
  type WorkerHeartbeatStatus,
} from "./platform-health.js";

type DependencyName = "postgresql" | "victoriametrics" | "vmalert" | "worker";
type DependencyStatus = "AVAILABLE" | "STALE" | "UNAVAILABLE";

interface DependencyHealth {
  readonly status: DependencyStatus;
  readonly lastSuccessAt?: string;
}

const processStartedAt = new Date().toISOString();
export { readRuntimeHealthConfig } from "../../config/public.js";

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

  constructor(
    private readonly database: DatabaseService,
    private readonly lifecycle: RuntimeLifecycle,
  ) {}

  get lifecycleState() {
    return this.lifecycle.state;
  }

  private get store() {
    return new PlatformHealthStore(this.database.pool);
  }

  private async checkPostgreSql(): Promise<DependencyStatus> {
    return (await this.database.checkReadiness()) ? "AVAILABLE" : "UNAVAILABLE";
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
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("dependency health check timed out")),
          this.config.timeoutMs,
        );
        timer.unref();
      });
      const result = await Promise.race([operation(), timeout]).finally(() => {
        if (timer) clearTimeout(timer);
      });
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
    if (this.lifecycle.state !== "RUNNING") {
      return {
        service: "platform-api",
        status: "NOT_READY" as const,
        version: readRuntimeIdentityConfig().version,
        startedAt: processStartedAt,
        checkedAt: new Date().toISOString(),
        lifecycle: this.lifecycle.state,
        dependencies: {},
      };
    }
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
      version: readRuntimeIdentityConfig().version,
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
    private readonly serviceAuthentication: ServiceAuthenticationMetrics,
    private readonly authorization: AuthorizationMetrics,
    private readonly sessions: SessionMetrics,
    private readonly totp: TotpMetrics,
    private readonly csrf: CsrfMetrics,
    private readonly sse: SessionSseMetrics,
  ) {}

  @Get("health/live")
  @PublicEndpoint()
  liveness() {
    return {
      service: "platform-api",
      status: "ALIVE",
      version: readRuntimeIdentityConfig().version,
      startedAt: processStartedAt,
    };
  }

  @Get("health/ready")
  @PublicEndpoint()
  async readiness(
    @Res({ passthrough: true }) response: { status(code: number): unknown },
  ) {
    const health = await this.health.readiness();
    response.status(health.status === "READY" ? 200 : 503);
    return health;
  }

  @Get("metrics")
  @PublicEndpoint()
  @Header("content-type", "text/plain; version=0.0.4; charset=utf-8")
  async metrics() {
    const health = await this.health.readiness();
    const reliable = await this.health.reliableWorkMetrics();
    const requests = this.requests.snapshot();
    const authenticationFailures = this.serviceAuthentication.snapshot();
    const authorizationDecisions = this.authorization.snapshot();
    const sessionEvents = this.sessions.snapshot();
    const totpEvents = this.totp.snapshot();
    const csrfRejections = this.csrf.snapshot();
    const sseClosures = this.sse.snapshot();
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
      metric(
        "nop_runtime_accepting_work",
        "Whether this runtime accepts new work.",
        "gauge",
        this.health.lifecycleState === "RUNNING" ? 1 : 0,
      ),
      "# HELP nop_runtime_configuration_loaded Validated runtime configuration categories loaded by this process.",
      "# TYPE nop_runtime_configuration_loaded gauge",
      ...loadedConfigurationCategories.map(
        (category) =>
          `nop_runtime_configuration_loaded{category="${category}"} 1`,
      ),
      "# HELP nop_internal_service_auth_failures_total Failed internal service authentication attempts.",
      "# TYPE nop_internal_service_auth_failures_total counter",
      ...authenticationFailures.map(
        (failure) =>
          `nop_internal_service_auth_failures_total{service="${failure.service}",reason="${failure.reason}"} ${failure.count}`,
      ),
      "# HELP nop_authorization_decisions_total User authorization decisions by stable Permission and outcome.",
      "# TYPE nop_authorization_decisions_total counter",
      ...authorizationDecisions.map(
        (decision) =>
          `nop_authorization_decisions_total{permission="${decision.permission}",outcome="${decision.outcome}"} ${decision.count}`,
      ),
      "# HELP nop_web_session_events_total Opaque Web Session lifecycle events by bounded event and reason.",
      "# TYPE nop_web_session_events_total counter",
      ...sessionEvents.map(
        (item) =>
          `nop_web_session_events_total{event="${item.event}",reason="${item.reason}"} ${item.count}`,
      ),
      "# HELP nop_totp_events_total TOTP enrollment and verification outcomes by bounded category.",
      "# TYPE nop_totp_events_total counter",
      ...totpEvents.map(
        (item) =>
          `nop_totp_events_total{event="${item.event}",outcome="${item.outcome}"} ${item.count}`,
      ),
      "# HELP nop_csrf_rejections_total Browser CSRF rejections by bounded reason.",
      "# TYPE nop_csrf_rejections_total counter",
      ...csrfRejections.map(
        (item) =>
          `nop_csrf_rejections_total{reason="${item.reason}"} ${item.count}`,
      ),
      "# HELP nop_sse_session_closures_total SSE session closures by bounded reason.",
      "# TYPE nop_sse_session_closures_total counter",
      ...sseClosures.map(
        (item) =>
          `nop_sse_session_closures_total{reason="${item.reason}"} ${item.count}`,
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
        version: readRuntimeIdentityConfig().version,
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
    RuntimeLifecycle,
    RuntimeHealthService,
    ApiRequestMetrics,
    { provide: APP_INTERCEPTOR, useExisting: ApiRequestMetrics },
  ],
  exports: [RuntimeLifecycle],
})
export class PlatformHealthApiModule {}

@Module({
  imports: [DatabaseModule],
  providers: [RuntimeLifecycle, WorkerHeartbeatService],
  exports: [RuntimeLifecycle],
})
export class PlatformHealthWorkerModule {}
