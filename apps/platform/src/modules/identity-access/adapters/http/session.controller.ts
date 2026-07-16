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
import { TotpRejectedError } from "../../application/totp.js";
import {
  MfaRecoveryRejectedError,
  PostgresMfaRecoveryService,
} from "../postgres/postgres-mfa-recovery-service.js";
import { PostgresSessionService } from "../postgres/postgres-session-service.js";
import { PublicEndpoint, RequirePermission } from "./permission.guard.js";
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
  const emergencyReason =
    "emergencyReason" in body && typeof body.emergencyReason === "string"
      ? body.emergencyReason
      : undefined;
  if (
    emergencyReason !== undefined &&
    !/^[a-z][a-z0-9._-]{2,63}$/u.test(emergencyReason)
  ) {
    throw new BadRequestException("Login request is invalid");
  }
  return {
    username: body.username,
    password: body.password,
    ...(emergencyReason === undefined ? {} : { emergencyReason }),
  };
}

function totpCode(body: unknown) {
  if (
    !body ||
    typeof body !== "object" ||
    !("code" in body) ||
    typeof body.code !== "string" ||
    !/^\d{6}$/u.test(body.code)
  ) {
    throw new BadRequestException("TOTP request is invalid");
  }
  return body.code;
}

@Controller("api/auth")
export class SessionController {
  constructor(
    private readonly sessions: PostgresSessionService,
    private readonly recovery: PostgresMfaRecoveryService,
  ) {}

  private authenticatedToken(request: IncomingMessage) {
    const token = cookieValue(
      request.headers.cookie,
      AUTHENTICATED_SESSION_COOKIE,
    );
    if (!token) throw new UnauthorizedException("Authentication failed");
    return token;
  }

  private preAuthenticationToken(request: IncomingMessage) {
    const token = cookieValue(
      request.headers.cookie,
      PRE_AUTHENTICATION_COOKIE,
    );
    if (!token) throw new UnauthorizedException("Authentication failed");
    return token;
  }

  private recoveryInput(body: unknown) {
    if (
      !body ||
      typeof body !== "object" ||
      !("recoveryCode" in body) ||
      typeof body.recoveryCode !== "string" ||
      body.recoveryCode.length > 64
    ) {
      throw new BadRequestException("MFA request is invalid");
    }
    return body.recoveryCode;
  }

  private stepUpInput(body: unknown) {
    if (
      !body ||
      typeof body !== "object" ||
      !("operation" in body) ||
      typeof body.operation !== "string" ||
      !/^[a-z][a-z0-9._:-]{2,127}$/u.test(body.operation) ||
      ("password" in body && typeof body.password !== "string") ||
      ("password" in body &&
        typeof body.password === "string" &&
        Buffer.byteLength(body.password, "utf8") > 1024) ||
      ("totpCode" in body &&
        (typeof body.totpCode !== "string" || !/^\d{6}$/u.test(body.totpCode)))
    ) {
      throw new BadRequestException("MFA request is invalid");
    }
    return {
      operation: body.operation,
      ...("password" in body && typeof body.password === "string"
        ? { password: body.password }
        : {}),
      ...("totpCode" in body && typeof body.totpCode === "string"
        ? { totpCode: body.totpCode }
        : {}),
    };
  }

  private protectedActionInput(body: unknown) {
    if (
      !body ||
      typeof body !== "object" ||
      !("stepUpToken" in body) ||
      typeof body.stepUpToken !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/u.test(body.stepUpToken)
    ) {
      throw new BadRequestException("MFA request is invalid");
    }
    return body.stepUpToken;
  }

  private administrativeInput(body: unknown) {
    const stepUpToken = this.protectedActionInput(body);
    if (
      !body ||
      typeof body !== "object" ||
      !("userId" in body) ||
      typeof body.userId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        body.userId,
      )
    ) {
      throw new BadRequestException("MFA request is invalid");
    }
    return { stepUpToken, userId: body.userId };
  }

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
        ...(session.nextStep === undefined
          ? {}
          : { nextStep: session.nextStep }),
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

  @Post("mfa/enrollment")
  @HttpCode(200)
  @PublicEndpoint()
  async beginTotpEnrollment(
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const preAuthenticationToken = cookieValue(
      request.headers.cookie,
      PRE_AUTHENTICATION_COOKIE,
    );
    if (!preAuthenticationToken)
      throw new UnauthorizedException("Authentication failed");
    try {
      const enrollment = await this.sessions.beginTotpEnrollment({
        preAuthenticationToken,
        requestId: requestIdFrom(request),
      });
      response.setHeader("Cache-Control", "no-store");
      return { ...enrollment, requestId: requestIdFrom(request) };
    } catch (error) {
      if (
        error instanceof TotpRejectedError ||
        error instanceof SessionRejectedError
      ) {
        throw new UnauthorizedException("Authentication failed");
      }
      throw error;
    }
  }

  @Post("mfa/verify")
  @HttpCode(200)
  @PublicEndpoint()
  async verifyTotp(
    @Body() body: unknown,
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const preAuthenticationToken = cookieValue(
      request.headers.cookie,
      PRE_AUTHENTICATION_COOKIE,
    );
    if (!preAuthenticationToken)
      throw new UnauthorizedException("Authentication failed");
    try {
      const session = await this.sessions.completeTotp({
        preAuthenticationToken,
        code: totpCode(body),
        source: request.socket.remoteAddress ?? "unknown",
        clientSummary:
          typeof request.headers["user-agent"] === "string"
            ? request.headers["user-agent"]
            : "unspecified",
        requestId: requestIdFrom(request),
      });
      response.setHeader("Set-Cookie", [
        ...clearedSessionCookies(),
        sessionCookie(session),
      ]);
      response.setHeader("X-CSRF-Token", session.csrfToken);
      response.setHeader("Cache-Control", "no-store");
      return {
        status: "AUTHENTICATED",
        expiresAt: session.expiresAt,
        ...(session.recoveryCodes === undefined
          ? {}
          : {
              recoveryCodes: session.recoveryCodes,
              recoveryCodesConfirmationRequired: true,
            }),
        requestId: requestIdFrom(request),
      };
    } catch (error) {
      if (
        error instanceof TotpRejectedError ||
        error instanceof SessionRejectedError
      ) {
        throw new UnauthorizedException("Authentication failed");
      }
      throw error;
    }
  }

  @Post("mfa/recovery")
  @HttpCode(200)
  @PublicEndpoint()
  async recoverTotp(
    @Body() body: unknown,
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    try {
      const result = await this.recovery.recoverWithCode({
        preAuthenticationToken: this.preAuthenticationToken(request),
        recoveryCode: this.recoveryInput(body),
        source: request.socket.remoteAddress ?? "unknown",
        requestId: requestIdFrom(request),
      });
      response.setHeader("Set-Cookie", clearedSessionCookies());
      response.setHeader("Cache-Control", "no-store");
      return { ...result, requestId: requestIdFrom(request) };
    } catch (error) {
      if (
        error instanceof MfaRecoveryRejectedError ||
        error instanceof SessionRejectedError
      ) {
        throw new UnauthorizedException("Authentication failed");
      }
      throw error;
    }
  }

  @Post("mfa/recovery-codes/confirm")
  @HttpCode(204)
  @PublicEndpoint()
  async confirmRecoveryCodes(@Req() request: IncomingMessage) {
    try {
      await this.recovery.confirmRecoveryCodes({
        sessionToken: this.authenticatedToken(request),
        requestId: requestIdFrom(request),
      });
    } catch (error) {
      if (
        error instanceof MfaRecoveryRejectedError ||
        error instanceof SessionRejectedError
      ) {
        throw new UnauthorizedException("Authentication failed");
      }
      throw error;
    }
  }

  @Post("mfa/step-up")
  @HttpCode(200)
  @PublicEndpoint()
  async issueStepUp(
    @Body() body: unknown,
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    try {
      const result = await this.recovery.issueStepUp({
        sessionToken: this.authenticatedToken(request),
        ...this.stepUpInput(body),
        source: request.socket.remoteAddress ?? "unknown",
        requestId: requestIdFrom(request),
      });
      response.setHeader("Cache-Control", "no-store");
      return { ...result, requestId: requestIdFrom(request) };
    } catch (error) {
      if (
        error instanceof MfaRecoveryRejectedError ||
        error instanceof SessionRejectedError
      ) {
        throw new UnauthorizedException("MFA operation failed");
      }
      throw error;
    }
  }

  @Post("mfa/recovery-codes/regenerate")
  @HttpCode(200)
  @PublicEndpoint()
  async regenerateRecoveryCodes(
    @Body() body: unknown,
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    try {
      const replacement = await this.recovery.regenerateRecoveryCodes({
        sessionToken: this.authenticatedToken(request),
        stepUpToken: this.protectedActionInput(body),
        requestId: requestIdFrom(request),
      });
      response.setHeader("Cache-Control", "no-store");
      return {
        recoveryCodes: replacement.codes,
        requestId: requestIdFrom(request),
      };
    } catch (error) {
      if (
        error instanceof MfaRecoveryRejectedError ||
        error instanceof SessionRejectedError
      ) {
        throw new UnauthorizedException("MFA operation failed");
      }
      throw error;
    }
  }

  @Post("mfa/unbind")
  @HttpCode(204)
  @PublicEndpoint()
  async unbindMfa(@Body() body: unknown, @Req() request: IncomingMessage) {
    const stepUpToken = this.protectedActionInput(body);
    if (
      !body ||
      typeof body !== "object" ||
      !("reason" in body) ||
      typeof body.reason !== "string"
    ) {
      throw new BadRequestException("MFA request is invalid");
    }
    try {
      await this.recovery.unbindMfa({
        sessionToken: this.authenticatedToken(request),
        stepUpToken,
        reason: body.reason,
        requestId: requestIdFrom(request),
      });
    } catch (error) {
      if (
        error instanceof MfaRecoveryRejectedError ||
        error instanceof SessionRejectedError
      ) {
        throw new UnauthorizedException("MFA operation failed");
      }
      throw error;
    }
  }

  @Post("admin/mfa/reset")
  @HttpCode(204)
  @RequirePermission("authentication.manage")
  async resetMfa(@Body() body: unknown, @Req() request: IncomingMessage) {
    const input = this.administrativeInput(body);
    if (
      !body ||
      typeof body !== "object" ||
      !("reason" in body) ||
      typeof body.reason !== "string"
    ) {
      throw new BadRequestException("MFA request is invalid");
    }
    try {
      await this.recovery.resetMfa({
        actorSessionToken: this.authenticatedToken(request),
        ...input,
        reason: body.reason,
        requestId: requestIdFrom(request),
      });
    } catch (error) {
      if (error instanceof MfaRecoveryRejectedError) {
        throw new UnauthorizedException("MFA operation failed");
      }
      throw error;
    }
  }

  @Post("admin/emergency-administrator")
  @HttpCode(204)
  @RequirePermission("authentication.manage")
  async setEmergencyAdministrator(
    @Body() body: unknown,
    @Req() request: IncomingMessage,
  ) {
    const input = this.administrativeInput(body);
    if (
      !body ||
      typeof body !== "object" ||
      !("enabled" in body) ||
      typeof body.enabled !== "boolean"
    ) {
      throw new BadRequestException("MFA request is invalid");
    }
    try {
      await this.recovery.setEmergencyAdministrator({
        actorSessionToken: this.authenticatedToken(request),
        ...input,
        enabled: body.enabled,
        requestId: requestIdFrom(request),
      });
    } catch (error) {
      if (error instanceof MfaRecoveryRejectedError) {
        throw new UnauthorizedException("MFA operation failed");
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
