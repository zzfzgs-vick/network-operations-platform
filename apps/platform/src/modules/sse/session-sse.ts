import type {
  SessionClosureReason,
  SessionLifecycleEvent,
} from "@nop/contracts";
import { CONTRACT_VERSION } from "@nop/contracts";
import {
  Controller,
  Get,
  Injectable,
  Res,
  UnauthorizedException,
  Req,
} from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";

import { readWebSessionConfig } from "../../config/public.js";
import { requestIdFrom } from "../../http/request-id.js";
import {
  PublicEndpoint,
  SessionRejectedError,
} from "../identity-access/public.js";
import { PostgresSessionService } from "../identity-access/adapters/postgres/postgres-session-service.js";
import {
  AUTHENTICATED_SESSION_COOKIE,
  cookieValue,
} from "../identity-access/adapters/http/session-cookie.js";

@Injectable()
export class SessionSseMetrics {
  private readonly counts = new Map<SessionClosureReason, number>();

  record(reason: SessionClosureReason) {
    this.counts.set(reason, (this.counts.get(reason) ?? 0) + 1);
  }

  snapshot() {
    return [...this.counts].map(([reason, count]) => ({ reason, count }));
  }
}

const event = (
  type: SessionLifecycleEvent["event"],
  input: Partial<SessionLifecycleEvent> = {},
): SessionLifecycleEvent => ({
  contractVersion: CONTRACT_VERSION,
  event: type,
  occurredAt: new Date().toISOString(),
  stale: type === "CLOSED",
  reauthenticationRequired: type === "CLOSED",
  ...input,
});

function writeEvent(response: ServerResponse, value: SessionLifecycleEvent) {
  response.write(`event: session.${value.event.toLowerCase()}\n`);
  response.write(`data: ${JSON.stringify(value)}\n\n`);
}

function closureReason(error: unknown): SessionClosureReason {
  if (!(error instanceof SessionRejectedError)) return "UNAVAILABLE";
  const reasons: Record<SessionRejectedError["reason"], SessionClosureReason> =
    {
      unauthenticated: "UNAUTHENTICATED",
      "idle-expired": "IDLE_EXPIRED",
      "absolute-expired": "ABSOLUTE_EXPIRED",
      revoked: "REVOKED",
      "authorization-changed": "AUTHORIZATION_CHANGED",
      "credential-changed": "CREDENTIAL_CHANGED",
      "mfa-required": "UNAUTHENTICATED",
    };
  return reasons[error.reason];
}

@Controller("events")
export class SessionSseController {
  private readonly intervalMs = readWebSessionConfig().revalidationIntervalMs;

  constructor(
    private readonly sessions: PostgresSessionService,
    private readonly metrics: SessionSseMetrics,
  ) {}

  @Get("session")
  @PublicEndpoint()
  async connect(
    @Req() request: IncomingMessage,
    @Res() response: ServerResponse,
  ) {
    const token = cookieValue(
      request.headers.cookie,
      AUTHENTICATED_SESSION_COOKIE,
    );
    if (!token) throw new UnauthorizedException("Authentication failed");
    await this.sessions.validateAuthenticated(token, requestIdFrom(request));

    response.statusCode = 200;
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();
    const connectedAt = new Date().toISOString();
    writeEvent(response, event("CONNECTED", { lastSuccessfulAt: connectedAt }));

    let checking = false;
    const timer = setInterval(async () => {
      if (checking || response.destroyed) return;
      checking = true;
      try {
        await this.sessions.validateAuthenticated(
          token,
          requestIdFrom(request),
        );
        response.write(": heartbeat\n\n");
      } catch (error) {
        const reason = closureReason(error);
        this.metrics.record(reason);
        writeEvent(
          response,
          event("CLOSED", { reason, lastSuccessfulAt: connectedAt }),
        );
        clearInterval(timer);
        response.end();
      } finally {
        checking = false;
      }
    }, this.intervalMs);
    timer.unref();
    response.once("close", () => clearInterval(timer));
  }
}
