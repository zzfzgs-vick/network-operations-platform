import {
  ForbiddenException,
  Injectable,
  type NestMiddleware,
} from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";

import { readWebOriginConfig } from "../../../../config/public.js";
import { requestIdFrom } from "../../../../http/request-id.js";
import {
  CsrfMetrics,
  SessionRejectedError,
} from "../../application/session.js";
import { PostgresSessionService } from "../postgres/postgres-session-service.js";
import {
  AUTHENTICATED_SESSION_COOKIE,
  PRE_AUTHENTICATION_COOKIE,
  cookieValue,
} from "./session-cookie.js";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class BrowserCsrfMiddleware implements NestMiddleware {
  private readonly allowedOrigin = readWebOriginConfig().origin;

  constructor(
    private readonly sessions: PostgresSessionService,
    private readonly metrics: CsrfMetrics,
  ) {}

  async use(
    request: IncomingMessage,
    _response: ServerResponse,
    next: () => void,
  ) {
    if (safeMethods.has(request.method ?? "GET")) {
      next();
      return;
    }
    const path = (request.url ?? "/").split("?", 1)[0]?.toLowerCase();
    if (path?.startsWith("/internal/")) {
      next();
      return;
    }
    if (request.headers.origin) {
      if (request.headers.origin !== this.allowedOrigin)
        return this.reject("origin-mismatch");
    } else {
      const referer = request.headers.referer;
      if (!referer) return this.reject("missing-origin");
      try {
        if (new URL(referer).origin !== this.allowedOrigin)
          return this.reject("origin-mismatch");
      } catch {
        return this.reject("origin-mismatch");
      }
    }
    if (request.headers["x-csrf-confirm"] !== "1")
      return this.reject("missing-confirmation");

    const authenticated = cookieValue(
      request.headers.cookie,
      AUTHENTICATED_SESSION_COOKIE,
    );
    const preAuthentication = cookieValue(
      request.headers.cookie,
      PRE_AUTHENTICATION_COOKIE,
    );
    const sessionToken = authenticated ?? preAuthentication;
    if (sessionToken) {
      const csrfToken = request.headers["x-csrf-token"];
      if (typeof csrfToken !== "string") return this.reject("missing-token");
      try {
        const valid = await this.sessions.validateCsrf(
          sessionToken,
          csrfToken,
          authenticated ? "AUTHENTICATED" : "PRE_AUTH",
          requestIdFrom(request),
        );
        if (!valid) return this.reject("invalid-token");
      } catch (error) {
        if (!(error instanceof SessionRejectedError)) throw error;
        return this.reject("invalid-token");
      }
    }
    next();
  }

  private reject(reason: Parameters<CsrfMetrics["record"]>[0]): never {
    this.metrics.record(reason);
    throw new ForbiddenException("Request was rejected");
  }
}
