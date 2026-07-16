import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import type { WebSessionConfig } from "../../../../config/public.js";
import { withTransaction } from "../../../../database/database.js";
import type { AuditEventInput } from "../../../audit/public.js";
import { PostgresLocalIdentityService } from "./postgres-local-identity-service.js";
import {
  SessionMetrics,
  SessionRejectedError,
  type IssuedWebSession,
  type SessionRevocationReason,
  type ValidatedWebSession,
  type WebSessionType,
} from "../../application/session.js";

interface AuditAppender {
  append(client: PoolClient, input: AuditEventInput): Promise<unknown>;
}

interface SessionRow {
  readonly session_id: string;
  readonly user_id: string;
  readonly session_type: WebSessionType;
  readonly generation_id: string;
  readonly current_generation_id: string;
  readonly authorization_version: string;
  readonly current_authorization_version: string;
  readonly credential_version: number;
  readonly current_credential_version: number;
  readonly status: "ENABLED" | "DISABLED";
  readonly idle_expires_at: Date | null;
  readonly absolute_expires_at: Date;
  readonly revoked_at: Date | null;
}

const tokenDigest = (token: string) =>
  createHash("sha256").update(token, "utf8").digest();

const bounded = (
  value: string | undefined,
  fallback: string,
  maximum: number,
) =>
  Array.from(value ?? "")
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127 ? "?" : character;
    })
    .join("")
    .slice(0, maximum) || fallback;

export async function revokeUserSessions(
  client: PoolClient,
  audit: AuditAppender,
  input: {
    readonly userId: string;
    readonly reason: Extract<
      SessionRevocationReason,
      "USER_DISABLED" | "PASSWORD_CHANGED" | "AUTHORIZATION_CHANGED"
    >;
    readonly requestId?: string;
    readonly actor?: AuditEventInput["actor"];
  },
) {
  const revoked = await client.query(
    `update public.web_sessions
        set revoked_at = clock_timestamp(), revocation_reason = $2
      where user_id = $1 and revoked_at is null`,
    [input.userId, input.reason],
  );
  if (!revoked.rowCount) return 0;
  await audit.append(client, {
    actor: input.actor ?? { type: "SYSTEM", id: "identity-access" },
    eventType: "SESSION.USER_SESSIONS_REVOKED",
    source: "web-session",
    outcome: "SUCCESS",
    resource: { type: "platform-user", id: input.userId },
    ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    details: {
      reasonCategory: input.reason.toLowerCase().replaceAll("_", "-"),
      metadata: { revokedCount: revoked.rowCount },
    },
  });
  return revoked.rowCount;
}

export class PostgresSessionService {
  private localIdentity: PostgresLocalIdentityService | undefined;

  constructor(
    private readonly poolSource: Pool | (() => Pool),
    private readonly audit: AuditAppender,
    private readonly config: WebSessionConfig,
    readonly metrics = new SessionMetrics(),
  ) {}

  private get pool() {
    return typeof this.poolSource === "function"
      ? this.poolSource()
      : this.poolSource;
  }

  private get identity() {
    this.localIdentity ??= new PostgresLocalIdentityService(
      this.pool,
      this.audit,
    );
    return this.localIdentity;
  }

  async login(input: {
    readonly username: string;
    readonly password: string;
    readonly source: string;
    readonly clientSummary?: string;
    readonly requestId?: string;
    readonly currentTokens?: readonly string[];
  }): Promise<IssuedWebSession> {
    const user = await this.identity.authenticate(input);
    const needsMfa = await this.hasSensitivePermission(user.userId);
    const type: WebSessionType =
      user.mustChangePassword || needsMfa ? "PRE_AUTH" : "AUTHENTICATED";
    const token = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(32).toString("base64url");
    const sessionId = randomUUID();

    const outcome = await withTransaction(this.pool, async (client) => {
      const now = await this.databaseNow(client);
      const duration =
        type === "PRE_AUTH"
          ? this.config.preAuthenticationTimeoutMs
          : this.config.absoluteTimeoutMs;
      const expiresAt = new Date(now.getTime() + duration);
      const idleExpiresAt =
        type === "AUTHENTICATED"
          ? new Date(
              Math.min(
                now.getTime() + this.config.idleTimeoutMs,
                expiresAt.getTime(),
              ),
            )
          : null;
      for (const currentToken of new Set(input.currentTokens ?? [])) {
        const rotated = await client.query<{
          session_id: string;
          user_id: string;
        }>(
          `update public.web_sessions
              set revoked_at = clock_timestamp(), revocation_reason = 'ROTATED'
            where token_hash = $1 and revoked_at is null
            returning session_id, user_id`,
          [tokenDigest(currentToken)],
        );
        const previous = rotated.rows[0];
        if (previous) {
          await this.audit.append(client, {
            actor: { type: "USER", id: user.userId },
            eventType: "SESSION.ROTATED",
            source: "web-session",
            outcome: "SUCCESS",
            resource: { type: "web-session", id: previous.session_id },
            ...(input.requestId === undefined
              ? {}
              : { requestId: input.requestId }),
            details: {
              metadata: { accountChanged: previous.user_id !== user.userId },
            },
          });
          this.metrics.record("rotated", "explicit");
        }
      }
      const generation = await client.query<{ generation_id: string }>(
        "select generation_id from public.platform_session_generation where singleton_id = 1",
      );
      await client.query(
        `insert into public.web_sessions (
          session_id, user_id, session_type, token_hash, csrf_token_hash, generation_id,
          authorization_version, credential_version, authentication_strength,
          password_verified_at, last_activity_at, idle_expires_at,
          absolute_expires_at, request_id, source_address, user_agent_summary
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8, 'PASSWORD', $9,
          $10, $11, $12, $13, $14, $15
        )`,
        [
          sessionId,
          user.userId,
          type,
          tokenDigest(token),
          tokenDigest(csrfToken),
          generation.rows[0]!.generation_id,
          user.authorizationVersion,
          user.credentialVersion,
          now,
          type === "AUTHENTICATED" ? now : null,
          idleExpiresAt,
          expiresAt,
          input.requestId ?? null,
          bounded(input.source, "unknown", 128),
          bounded(input.clientSummary, "unspecified", 256),
        ],
      );
      await this.audit.append(client, {
        actor: { type: "USER", id: user.userId },
        eventType: "SESSION.CREATED",
        source: "web-session",
        outcome: "SUCCESS",
        resource: { type: "web-session", id: sessionId },
        ...(input.requestId === undefined
          ? {}
          : { requestId: input.requestId }),
        details: {
          metadata: { sessionType: type.toLowerCase().replace("_", "-") },
        },
      });
      this.metrics.record(
        "created",
        type === "AUTHENTICATED" ? "authenticated" : "pre-auth",
      );
      return {
        sessionId,
        type,
        token,
        csrfToken,
        expiresAt: expiresAt.toISOString(),
      };
    });
    return outcome;
  }

  validateAuthenticated(token: string, requestId?: string) {
    return this.validate(token, "AUTHENTICATED", requestId);
  }

  validatePreAuthentication(token: string, requestId?: string) {
    return this.validate(token, "PRE_AUTH", requestId);
  }

  async validateCsrf(
    sessionToken: string,
    csrfToken: string,
    expectedType: WebSessionType,
    requestId?: string,
  ) {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(csrfToken)) return false;
    const session = await this.validate(sessionToken, expectedType, requestId);
    const result = await this.pool.query<{ valid: boolean }>(
      `select exists (
         select 1 from public.web_sessions
          where session_id = $1 and csrf_token_hash = $2 and revoked_at is null
       ) as valid`,
      [session.sessionId, tokenDigest(csrfToken)],
    );
    return result.rows[0]?.valid ?? false;
  }

  async recordUserActivity(token: string, requestId?: string) {
    const session = await this.validateAuthenticated(token, requestId);
    await this.pool.query(
      `update public.web_sessions
          set last_activity_at = clock_timestamp(),
              idle_expires_at = least(
                absolute_expires_at,
                clock_timestamp() + ($2::integer * interval '1 millisecond')
              )
        where session_id = $1 and revoked_at is null`,
      [session.sessionId, this.config.idleTimeoutMs],
    );
    return session;
  }

  async logout(token: string, requestId?: string) {
    return withTransaction(this.pool, async (client) => {
      const result = await client.query<{
        session_id: string;
        user_id: string;
      }>(
        `update public.web_sessions
            set revoked_at = clock_timestamp(), revocation_reason = 'LOGOUT'
          where token_hash = $1 and revoked_at is null
          returning session_id, user_id`,
        [tokenDigest(token)],
      );
      const session = result.rows[0];
      if (!session) return false;
      await this.audit.append(client, {
        actor: { type: "USER", id: session.user_id },
        eventType: "SESSION.LOGGED_OUT",
        source: "web-session",
        outcome: "SUCCESS",
        resource: { type: "web-session", id: session.session_id },
        ...(requestId === undefined ? {} : { requestId }),
      });
      this.metrics.record("revoked", "explicit");
      return true;
    });
  }

  async invalidateAllAfterRecovery(requestId?: string) {
    return withTransaction(this.pool, async (client) => {
      const generationId = randomUUID();
      await client.query(
        `update public.platform_session_generation
            set generation_id = $1, updated_at = clock_timestamp()
          where singleton_id = 1`,
        [generationId],
      );
      const revoked = await client.query(
        `update public.web_sessions
            set revoked_at = clock_timestamp(),
                revocation_reason = 'RECOVERY_INVALIDATION'
          where revoked_at is null`,
      );
      await this.audit.append(client, {
        actor: { type: "SYSTEM", id: "disaster-recovery" },
        eventType: "SESSION.RECOVERY_INVALIDATED",
        source: "web-session",
        outcome: "SUCCESS",
        ...(requestId === undefined ? {} : { requestId }),
        details: { metadata: { revokedCount: revoked.rowCount ?? 0 } },
      });
      this.metrics.record("revoked", "recovery", revoked.rowCount ?? 0);
      return revoked.rowCount ?? 0;
    });
  }

  private async validate(
    token: string,
    expectedType: WebSessionType,
    requestId?: string,
  ): Promise<ValidatedWebSession> {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) {
      this.metrics.record("rejected", "invalid");
      throw new SessionRejectedError();
    }
    const outcome = await withTransaction(this.pool, async (client) => {
      const result = await client.query<SessionRow>(
        `select s.session_id, s.user_id, s.session_type, s.generation_id,
                g.generation_id as current_generation_id,
                s.authorization_version, u.authorization_version as current_authorization_version,
                s.credential_version, c.credential_version as current_credential_version,
                u.status, s.idle_expires_at, s.absolute_expires_at, s.revoked_at
           from public.web_sessions s
           join public.platform_users u on u.user_id = s.user_id
           join public.local_credentials c on c.user_id = s.user_id
           join public.platform_session_generation g on g.singleton_id = 1
          where s.token_hash = $1
          for update of s`,
        [tokenDigest(token)],
      );
      const row = result.rows[0];
      if (!row || row.revoked_at || row.session_type !== expectedType) {
        return {
          rejected: true as const,
          rejection: row?.revoked_at
            ? ("revoked" as const)
            : ("unauthenticated" as const),
          metricEvent: "rejected" as const,
          metricReason: "invalid" as const,
        };
      }
      const now = await this.databaseNow(client);
      let reason: SessionRevocationReason | undefined;
      let rejection: SessionRejectedError["reason"] = "revoked";
      let metricEvent: "expired" | "revoked" | "version-mismatch" = "revoked";
      let metricReason:
        "idle" | "absolute" | "authorization" | "credential" | "recovery" =
        "recovery";
      if (row.generation_id !== row.current_generation_id) {
        reason = "GENERATION_MISMATCH";
      } else if (row.status !== "ENABLED") {
        reason = "USER_DISABLED";
      } else if (
        Number(row.authorization_version) !==
        Number(row.current_authorization_version)
      ) {
        reason = "AUTHORIZATION_CHANGED";
        rejection = "authorization-changed";
        metricEvent = "version-mismatch";
        metricReason = "authorization";
      } else if (row.credential_version !== row.current_credential_version) {
        reason = "PASSWORD_CHANGED";
        rejection = "credential-changed";
        metricEvent = "revoked";
        metricReason = "credential";
      } else if (row.absolute_expires_at <= now) {
        reason = "ABSOLUTE_EXPIRED";
        rejection = "absolute-expired";
        metricEvent = "expired";
        metricReason = "absolute";
      } else if (row.idle_expires_at && row.idle_expires_at <= now) {
        reason = "IDLE_EXPIRED";
        rejection = "idle-expired";
        metricEvent = "expired";
        metricReason = "idle";
      }
      if (reason) {
        await client.query(
          `update public.web_sessions
              set revoked_at = clock_timestamp(), revocation_reason = $2
            where session_id = $1 and revoked_at is null`,
          [row.session_id, reason],
        );
        await this.audit.append(client, {
          actor: { type: "USER", id: row.user_id },
          eventType: "SESSION.REJECTED",
          source: "web-session",
          outcome: "DENIED",
          failureCategory: "SESSION_INVALID",
          resource: { type: "web-session", id: row.session_id },
          ...(requestId === undefined ? {} : { requestId }),
          details: {
            reasonCategory: reason.toLowerCase().replaceAll("_", "-"),
          },
        });
        return {
          rejected: true as const,
          rejection,
          metricEvent,
          metricReason,
        };
      }
      return {
        rejected: false as const,
        value: {
          sessionId: row.session_id,
          type: row.session_type,
          ...(row.session_type === "AUTHENTICATED"
            ? {
                principal: {
                  kind: "platform-user" as const,
                  userId: row.user_id,
                  authorizationVersion: Number(row.authorization_version),
                  sessionId: row.session_id,
                },
              }
            : {}),
          expiresAt: row.absolute_expires_at.toISOString(),
        },
      };
    });
    if (outcome.rejected) {
      this.metrics.record(outcome.metricEvent, outcome.metricReason);
      throw new SessionRejectedError(outcome.rejection);
    }
    this.metrics.record(
      "validated",
      expectedType === "AUTHENTICATED" ? "authenticated" : "pre-auth",
    );
    return outcome.value;
  }

  private async hasSensitivePermission(userId: string) {
    const result = await this.pool.query<{ required: boolean }>(
      `select exists (
         select 1
           from public.user_role_assignments ura
           join public.role_permissions rp on rp.role_id = ura.role_id
           join public.permissions p on p.permission_code = rp.permission_code
          where ura.user_id = $1 and p.sensitive
       ) as required`,
      [userId],
    );
    return result.rows[0]?.required ?? false;
  }

  private async databaseNow(client: PoolClient) {
    const result = await client.query<{ now: Date }>(
      "select clock_timestamp() as now",
    );
    return result.rows[0]!.now;
  }
}
