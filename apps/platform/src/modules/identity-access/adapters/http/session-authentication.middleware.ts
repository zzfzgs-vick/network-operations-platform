import {
  Injectable,
  UnauthorizedException,
  type NestMiddleware,
} from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";

import { requestIdFrom } from "../../../../http/request-id.js";
import { SessionRejectedError } from "../../application/session.js";
import { PostgresSessionService } from "../postgres/postgres-session-service.js";
import { attachAuthenticatedUser } from "./permission.guard.js";
import { AUTHENTICATED_SESSION_COOKIE, cookieValue } from "./session-cookie.js";

@Injectable()
export class SessionAuthenticationMiddleware implements NestMiddleware {
  constructor(private readonly sessions: PostgresSessionService) {}

  async use(
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ) {
    const token = cookieValue(
      request.headers.cookie,
      AUTHENTICATED_SESSION_COOKIE,
    );
    if (!token) {
      next();
      return;
    }
    try {
      const session =
        request.headers["x-user-activity"] === "1"
          ? await this.sessions.recordUserActivity(
              token,
              requestIdFrom(request),
            )
          : await this.sessions.validateAuthenticated(
              token,
              requestIdFrom(request),
            );
      if (session.principal)
        attachAuthenticatedUser(request, session.principal);
    } catch (error) {
      if (!(error instanceof SessionRejectedError)) throw error;
      response.setHeader("X-Session-Status", error.reason);
      throw new UnauthorizedException("Authentication failed");
    }
    next();
  }
}
