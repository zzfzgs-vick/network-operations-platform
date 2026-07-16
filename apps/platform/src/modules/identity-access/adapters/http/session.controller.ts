import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";

import { requestIdFrom } from "../../../../http/request-id.js";
import { AuthenticationRejectedError } from "../../application/authentication-provider.js";
import { SessionRejectedError } from "../../application/session.js";
import { PostgresSessionService } from "../postgres/postgres-session-service.js";
import { PublicEndpoint } from "./permission.guard.js";
import {
  AUTHENTICATED_SESSION_COOKIE,
  PRE_AUTHENTICATION_COOKIE,
  clearedSessionCookies,
  cookieValue,
  sessionCookie,
} from "./session-cookie.js";

function credentials(body: unknown) {
  if (
    !body ||
    typeof body !== "object" ||
    !("username" in body) ||
    !("password" in body) ||
    typeof body.username !== "string" ||
    typeof body.password !== "string" ||
    body.username.length > 256 ||
    Buffer.byteLength(body.password, "utf8") > 1024
  ) {
    throw new BadRequestException("Login request is invalid");
  }
  return { username: body.username, password: body.password };
}

@Controller("api/auth")
export class SessionController {
  constructor(private readonly sessions: PostgresSessionService) {}

  @Post("login")
  @HttpCode(200)
  @PublicEndpoint()
  async login(
    @Body() body: unknown,
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const input = credentials(body);
    try {
      const currentTokens = [
        cookieValue(request.headers.cookie, AUTHENTICATED_SESSION_COOKIE),
        cookieValue(request.headers.cookie, PRE_AUTHENTICATION_COOKIE),
      ].filter((value): value is string => value !== undefined);
      const session = await this.sessions.login({
        ...input,
        source: request.socket.remoteAddress ?? "unknown",
        clientSummary:
          typeof request.headers["user-agent"] === "string"
            ? request.headers["user-agent"]
            : "unspecified",
        requestId: requestIdFrom(request),
        currentTokens,
      });
      response.setHeader("Set-Cookie", [
        ...clearedSessionCookies(),
        sessionCookie(session),
      ]);
      response.setHeader("X-CSRF-Token", session.csrfToken);
      response.setHeader("Cache-Control", "no-store");
      return {
        status:
          session.type === "PRE_AUTH"
            ? "PRE_AUTHENTICATION_REQUIRED"
            : "AUTHENTICATED",
        expiresAt: session.expiresAt,
        requestId: requestIdFrom(request),
      };
    } catch (error) {
      if (
        error instanceof AuthenticationRejectedError ||
        error instanceof SessionRejectedError
      ) {
        throw new UnauthorizedException("Authentication failed");
      }
      throw error;
    }
  }

  @Post("logout")
  @HttpCode(204)
  @PublicEndpoint()
  async logout(
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const tokens = new Set(
      [
        cookieValue(request.headers.cookie, AUTHENTICATED_SESSION_COOKIE),
        cookieValue(request.headers.cookie, PRE_AUTHENTICATION_COOKIE),
      ].filter((value): value is string => value !== undefined),
    );
    await Promise.all(
      [...tokens].map((token) =>
        this.sessions.logout(token, requestIdFrom(request)),
      ),
    );
    response.setHeader("Set-Cookie", clearedSessionCookies());
  }
}
