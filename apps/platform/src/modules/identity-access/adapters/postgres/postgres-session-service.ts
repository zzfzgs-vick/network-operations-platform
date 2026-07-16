import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import {
  readTotpConfig,
  type TotpConfig,
  type WebSessionConfig,
} from "../../../../config/public.js";
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
import {
  TotpMetrics,
  TotpRejectedError,
  decryptTotpSecret,
  encryptTotpSecret,
  newTotpSecret,
  totpStep,
  totpUri,
  validateTotp,
} from "../../application/totp.js";

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

type MfaPurpose = "MFA_ENROLLMENT" | "MFA_VERIFY";

const mfaMetricEvent = (purpose?: MfaPurpose): "enrollment" | "verification" =>
  purpose === "MFA_ENROLLMENT" ? "enrollment" : "verification";

interface MfaChallengeRow {
  readonly challenge_id: string;
  readonly session_id: string;
  readonly user_id: string;
  readonly purpose: MfaPurpose;
  readonly attempt_count: number;
  readonly max_attempts: number;
  readonly expires_at: Date;
  readonly completed_at: Date | null;
  readonly password_verified_at: Date;
  readonly authorization_version: string;
  readonly credential_version: number;
  readonly username: string;
}

interface SecretRow {
  readonly secret_id: string;
  readonly secret_ciphertext: Buffer;
  readonly secret_nonce: Buffer;
  readonly secret_tag: Buffer;
  readonly key_version: string;
  readonly last_accepted_step: string | null;
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

const sourceDigest = (source: string) =>
  createHash("sha256")
    .update(bounded(source, "unknown", 128))
    .digest("hex");

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
    private readonly totpConfig: TotpConfig = readTotpConfig(),
    readonly totpMetrics = new TotpMetrics(),
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
    const hasAuthenticator = needsMfa
      ? await this.hasActiveTotpAuthenticator(user.userId)
      : false;
    const nextStep = user.mustChangePassword
      ? ("PASSWORD_CHANGE" as const)
      : needsMfa
        ? hasAuthenticator
          ? ("MFA_VERIFY" as const)
          : ("MFA_ENROLLMENT" as const)
        : undefined;
    const type: WebSessionType = nextStep ? "PRE_AUTH" : "AUTHENTICATED";
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
      if (nextStep === "MFA_ENROLLMENT" || nextStep === "MFA_VERIFY") {
        await client.query(
          `insert into public.mfa_challenges (
             challenge_id, session_id, user_id, purpose, source_hash,
             max_attempts, expires_at
           ) values ($1, $2, $3, $4, $5, $6, $7)`,
          [
            randomUUID(),
            sessionId,
            user.userId,
            nextStep,
            sourceDigest(input.source),
            this.totpConfig.challengeMaxAttempts,
            expiresAt,
          ],
        );
      }
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
        ...(nextStep === undefined ? {} : { nextStep }),
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

  async beginTotpEnrollment(input: {
    readonly preAuthenticationToken: string;
    readonly requestId?: string;
  }) {
    const session = await this.validatePreAuthentication(
      input.preAuthenticationToken,
      input.requestId,
    );
    const enrollmentId = randomUUID();
    const secret = newTotpSecret();
    const outcome = await withTransaction(this.pool, async (client) => {
      const challenge = await client.query<{
        user_id: string;
        username: string;
        created_at: Date;
        expires_at: Date;
      }>(
        `select c.user_id, u.username, timing.database_now as created_at,
                least(
                  c.expires_at,
                  timing.database_now + ($2::bigint * interval '1 millisecond')
                ) as expires_at
           from public.mfa_challenges c
           join public.web_sessions s on s.session_id = c.session_id
           join public.platform_users u on u.user_id = c.user_id
           join public.local_credentials lc on lc.user_id = c.user_id
           join public.platform_session_generation g on g.singleton_id = 1
          cross join lateral (
            select clock_timestamp() as database_now
          ) timing
          where c.session_id = $1 and c.purpose = 'MFA_ENROLLMENT'
            and c.completed_at is null and s.revoked_at is null
            and u.status = 'ENABLED'
            and s.authorization_version = u.authorization_version
            and s.credential_version = lc.credential_version
            and s.generation_id = g.generation_id
            and s.absolute_expires_at > timing.database_now
            and (s.idle_expires_at is null or s.idle_expires_at > timing.database_now)
            and c.expires_at > timing.database_now
          for update of c, s, u, lc, g`,
        [session.sessionId, this.totpConfig.enrollmentTimeoutMs],
      );
      const row = challenge.rows[0];
      if (!row) return undefined;
      const encrypted = encryptTotpSecret(
        secret,
        `enrollment:${row.user_id}:${enrollmentId}`,
        this.totpConfig,
      );
      await client.query(
        "delete from public.totp_enrollments where user_id = $1",
        [row.user_id],
      );
      await client.query(
        `insert into public.totp_enrollments (
           enrollment_id, user_id, secret_ciphertext, secret_nonce,
           secret_tag, key_version, created_at, expires_at
         ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          enrollmentId,
          row.user_id,
          encrypted.ciphertext,
          encrypted.nonce,
          encrypted.tag,
          encrypted.keyVersion,
          row.created_at,
          row.expires_at,
        ],
      );
      await this.audit.append(client, {
        actor: { type: "USER", id: row.user_id },
        eventType: "MFA.ENROLLMENT_STARTED",
        source: "totp",
        outcome: "SUCCESS",
        resource: { type: "totp-enrollment", id: enrollmentId },
        ...(input.requestId === undefined
          ? {}
          : { requestId: input.requestId }),
      });
      return {
        secret,
        uri: totpUri(secret, row.username),
        expiresAt: row.expires_at.toISOString(),
      };
    });
    if (!outcome) {
      this.totpMetrics.record("enrollment", "invalid");
      throw new TotpRejectedError("enrollment-required");
    }
    this.totpMetrics.record("enrollment", "started");
    return outcome;
  }

  async completeTotp(input: {
    readonly preAuthenticationToken: string;
    readonly code: string;
    readonly source: string;
    readonly clientSummary?: string;
    readonly requestId?: string;
  }): Promise<IssuedWebSession> {
    const session = await this.validatePreAuthentication(
      input.preAuthenticationToken,
      input.requestId,
    );
    const sourceHash = sourceDigest(input.source);
    const token = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(32).toString("base64url");
    const nextSessionId = randomUUID();
    const outcome = await withTransaction(this.pool, async (client) => {
      const challenge = await client.query<MfaChallengeRow>(
        `select c.challenge_id, c.session_id, c.user_id, c.purpose,
                c.attempt_count, c.max_attempts, c.expires_at, c.completed_at,
                s.password_verified_at, u.authorization_version,
                lc.credential_version, u.username
           from public.mfa_challenges c
           join public.web_sessions s on s.session_id = c.session_id
           join public.platform_users u on u.user_id = c.user_id
           join public.local_credentials lc on lc.user_id = c.user_id
           join public.platform_session_generation g on g.singleton_id = 1
          where c.session_id = $1 and c.completed_at is null
            and s.revoked_at is null and s.session_type = 'PRE_AUTH'
            and u.status = 'ENABLED'
            and s.authorization_version = u.authorization_version
            and s.credential_version = lc.credential_version
            and s.generation_id = g.generation_id
            and s.absolute_expires_at > clock_timestamp()
            and (s.idle_expires_at is null or s.idle_expires_at > clock_timestamp())
          for update of c, s, u, lc, g`,
        [session.sessionId],
      );
      const row = challenge.rows[0];
      const now = await this.databaseNow(client);
      if (!row || row.expires_at <= now) {
        if (row)
          await this.appendMfaFailure(client, row, "challenge-expired", input);
        return {
          rejected: "challenge-expired" as const,
          event: mfaMetricEvent(row?.purpose),
        };
      }
      if (row.attempt_count >= row.max_attempts) {
        return {
          rejected: "throttled" as const,
          event: mfaMetricEvent(row.purpose),
        };
      }
      const throttled = await client.query<{ locked: boolean }>(
        `select exists (
           select 1 from public.totp_source_auth_throttle
            where source_hash = $2
              and locked_until > clock_timestamp()
           union all
           select 1 from public.totp_user_auth_throttle
            where user_id = $1 and locked_until > clock_timestamp()
         ) as locked`,
        [row.user_id, sourceHash],
      );
      if (throttled.rows[0]?.locked) {
        return {
          rejected: "throttled" as const,
          event: mfaMetricEvent(row.purpose),
        };
      }

      const secretResult =
        row.purpose === "MFA_ENROLLMENT"
          ? await client.query<SecretRow>(
              `select enrollment_id as secret_id, secret_ciphertext,
                      secret_nonce, secret_tag, key_version,
                      null::bigint as last_accepted_step
                 from public.totp_enrollments
                where user_id = $1 and expires_at > clock_timestamp()
                for update`,
              [row.user_id],
            )
          : await client.query<SecretRow>(
              `select authenticator_id as secret_id, secret_ciphertext,
                      secret_nonce, secret_tag, key_version, last_accepted_step
                 from public.totp_authenticators
                where user_id = $1 and status = 'ACTIVE'
                for update`,
              [row.user_id],
            );
      const stored = secretResult.rows[0];
      if (!stored) {
        await this.appendMfaFailure(client, row, "enrollment-required", input);
        return {
          rejected: "enrollment-required" as const,
          event: mfaMetricEvent(row.purpose),
        };
      }
      const binding =
        row.purpose === "MFA_ENROLLMENT"
          ? `enrollment:${row.user_id}:${stored.secret_id}`
          : `authenticator:${row.user_id}:${stored.secret_id}`;
      const secret = decryptTotpSecret(
        {
          ciphertext: stored.secret_ciphertext,
          nonce: stored.secret_nonce,
          tag: stored.secret_tag,
          keyVersion: stored.key_version,
        },
        binding,
        this.totpConfig,
      );
      const delta = validateTotp(secret, input.code, now.getTime());
      const acceptedStep =
        delta === null ? undefined : totpStep(now.getTime()) + delta;
      const replay =
        acceptedStep !== undefined &&
        stored.last_accepted_step !== null &&
        Number(stored.last_accepted_step) >= acceptedStep;
      if (acceptedStep === undefined || replay) {
        const reason = replay ? "replay" : "invalid";
        const throttledNow = await this.recordTotpFailure(
          client,
          row,
          sourceHash,
        );
        const rejection = throttledNow ? "throttled" : reason;
        await this.appendMfaFailure(client, row, rejection, input);
        return {
          rejected: rejection,
          event: mfaMetricEvent(row.purpose),
        } as const;
      }

      let authorizationVersion = Number(row.authorization_version);
      if (row.purpose === "MFA_ENROLLMENT") {
        const authenticatorId = randomUUID();
        const encrypted = encryptTotpSecret(
          secret,
          `authenticator:${row.user_id}:${authenticatorId}`,
          this.totpConfig,
        );
        await client.query(
          `insert into public.totp_authenticators (
             authenticator_id, user_id, secret_ciphertext, secret_nonce,
             secret_tag, key_version, status, last_accepted_step, verified_at
           ) values ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, $8)`,
          [
            authenticatorId,
            row.user_id,
            encrypted.ciphertext,
            encrypted.nonce,
            encrypted.tag,
            encrypted.keyVersion,
            acceptedStep,
            now,
          ],
        );
        await client.query(
          "delete from public.totp_enrollments where enrollment_id = $1",
          [stored.secret_id],
        );
        const updated = await client.query<{ authorization_version: string }>(
          `update public.platform_users
              set mfa_state = 'ENROLLED',
                  authorization_version = authorization_version + 1,
                  updated_at = clock_timestamp()
            where user_id = $1
            returning authorization_version`,
          [row.user_id],
        );
        authorizationVersion = Number(updated.rows[0]!.authorization_version);
      } else {
        await client.query(
          `update public.totp_authenticators
              set last_accepted_step = $2
            where authenticator_id = $1 and status = 'ACTIVE'`,
          [stored.secret_id, acceptedStep],
        );
      }
      await client.query(
        "delete from public.totp_user_auth_throttle where user_id = $1",
        [row.user_id],
      );
      await client.query(
        "update public.mfa_challenges set completed_at = $2 where challenge_id = $1",
        [row.challenge_id, now],
      );
      if (row.purpose === "MFA_ENROLLMENT") {
        await client.query(
          `update public.web_sessions
              set revoked_at = clock_timestamp(),
                  revocation_reason = 'AUTHORIZATION_CHANGED'
            where user_id = $1 and revoked_at is null`,
          [row.user_id],
        );
      } else {
        await client.query(
          `update public.web_sessions
              set revoked_at = clock_timestamp(), revocation_reason = 'ROTATED'
            where session_id = $1 and revoked_at is null`,
          [row.session_id],
        );
      }
      const expiresAt = new Date(now.getTime() + this.config.absoluteTimeoutMs);
      const idleExpiresAt = new Date(
        Math.min(
          now.getTime() + this.config.idleTimeoutMs,
          expiresAt.getTime(),
        ),
      );
      const generation = await client.query<{ generation_id: string }>(
        "select generation_id from public.platform_session_generation where singleton_id = 1",
      );
      await client.query(
        `insert into public.web_sessions (
           session_id, user_id, session_type, token_hash, csrf_token_hash,
           generation_id, authorization_version, credential_version,
           authentication_strength, password_verified_at, mfa_verified_at,
           last_activity_at, idle_expires_at, absolute_expires_at, request_id,
           source_address, user_agent_summary
         ) values (
           $1, $2, 'AUTHENTICATED', $3, $4, $5, $6, $7, 'PASSWORD_MFA',
           $8, $9, $9, $10, $11, $12, $13, $14
         )`,
        [
          nextSessionId,
          row.user_id,
          tokenDigest(token),
          tokenDigest(csrfToken),
          generation.rows[0]!.generation_id,
          authorizationVersion,
          row.credential_version,
          row.password_verified_at,
          now,
          idleExpiresAt,
          expiresAt,
          input.requestId ?? null,
          bounded(input.source, "unknown", 128),
          bounded(input.clientSummary, "unspecified", 256),
        ],
      );
      await this.audit.append(client, {
        actor: { type: "USER", id: row.user_id },
        eventType:
          row.purpose === "MFA_ENROLLMENT"
            ? "MFA.ENROLLMENT_COMPLETED"
            : "MFA.VERIFICATION_SUCCEEDED",
        source: "totp",
        outcome: "SUCCESS",
        resource: { type: "platform-user", id: row.user_id },
        ...(input.requestId === undefined
          ? {}
          : { requestId: input.requestId }),
      });
      await this.audit.append(client, {
        actor: { type: "USER", id: row.user_id },
        eventType: "SESSION.MFA_CREATED",
        source: "web-session",
        outcome: "SUCCESS",
        resource: { type: "web-session", id: nextSessionId },
        ...(input.requestId === undefined
          ? {}
          : { requestId: input.requestId }),
      });
      return {
        issued: {
          sessionId: nextSessionId,
          type: "AUTHENTICATED" as const,
          token,
          csrfToken,
          expiresAt: expiresAt.toISOString(),
        },
        event: mfaMetricEvent(row.purpose),
        clockSkew: delta !== 0,
      };
    });
    if ("rejected" in outcome) {
      const metricOutcome =
        outcome.rejected === "challenge-expired"
          ? "expired"
          : outcome.rejected === "enrollment-required"
            ? "invalid"
            : outcome.rejected;
      this.totpMetrics.record(outcome.event, metricOutcome);
      throw new TotpRejectedError(outcome.rejected);
    }
    this.totpMetrics.record(outcome.event, "success");
    if (outcome.clockSkew) {
      this.totpMetrics.record(outcome.event, "clock-skew");
    }
    this.metrics.record("rotated", "explicit");
    this.metrics.record("created", "authenticated");
    return outcome.issued;
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

  private async hasActiveTotpAuthenticator(userId: string) {
    const result = await this.pool.query<{ active: boolean }>(
      `select exists (
         select 1 from public.totp_authenticators
          where user_id = $1 and status = 'ACTIVE'
       ) as active`,
      [userId],
    );
    return result.rows[0]?.active ?? false;
  }

  private async recordTotpFailure(
    client: PoolClient,
    challenge: MfaChallengeRow,
    sourceHash: string,
  ) {
    const attempt = await client.query<{ attempt_count: number }>(
      `update public.mfa_challenges
          set attempt_count = least(max_attempts, attempt_count + 1)
        where challenge_id = $1
        returning attempt_count`,
      [challenge.challenge_id],
    );
    const sourceThrottle = await client.query<{ locked: boolean }>(
      `insert into public.totp_source_auth_throttle
         (source_hash, failure_count, locked_until)
       values ($1, 1, null)
       on conflict (source_hash) do update set
         failure_count = case
           when public.totp_source_auth_throttle.updated_at <
                clock_timestamp() - ($3::integer * interval '1 millisecond')
             then 1
           else least(100, public.totp_source_auth_throttle.failure_count + 1)
         end,
         locked_until = case
           when public.totp_source_auth_throttle.updated_at <
                clock_timestamp() - ($3::integer * interval '1 millisecond')
             then null
           when public.totp_source_auth_throttle.failure_count + 1 >= $2
             then clock_timestamp() + ($3::integer * interval '1 millisecond')
           else public.totp_source_auth_throttle.locked_until
         end,
         updated_at = clock_timestamp()
       returning coalesce(locked_until > clock_timestamp(), false) as locked`,
      [sourceHash, challenge.max_attempts, this.totpConfig.throttleDurationMs],
    );
    const userThrottle = await client.query<{ locked: boolean }>(
      `insert into public.totp_user_auth_throttle
         (user_id, failure_count, locked_until)
       values ($1, 1, null)
       on conflict (user_id) do update set
         failure_count = least(100, public.totp_user_auth_throttle.failure_count + 1),
         locked_until = case
           when public.totp_user_auth_throttle.failure_count + 1 >= $2
             then clock_timestamp() + ($3::integer * interval '1 millisecond')
           else public.totp_user_auth_throttle.locked_until
         end,
         updated_at = clock_timestamp()
       returning coalesce(locked_until > clock_timestamp(), false) as locked`,
      [
        challenge.user_id,
        challenge.max_attempts,
        this.totpConfig.throttleDurationMs,
      ],
    );
    return (
      (attempt.rows[0]?.attempt_count ?? 0) >= challenge.max_attempts ||
      (sourceThrottle.rows[0]?.locked ?? false) ||
      (userThrottle.rows[0]?.locked ?? false)
    );
  }

  private appendMfaFailure(
    client: PoolClient,
    challenge: MfaChallengeRow,
    reason:
      | "invalid"
      | "replay"
      | "throttled"
      | "enrollment-required"
      | "challenge-expired",
    input: { readonly requestId?: string },
  ) {
    return this.audit.append(client, {
      actor: { type: "USER", id: challenge.user_id },
      eventType:
        challenge.purpose === "MFA_ENROLLMENT"
          ? "MFA.ENROLLMENT_FAILED"
          : "MFA.VERIFICATION_FAILED",
      source: "totp",
      outcome: "DENIED",
      failureCategory: "MFA_REJECTED",
      resource: { type: "mfa-challenge", id: challenge.challenge_id },
      ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
      details: { reasonCategory: reason },
    });
  }

  private async databaseNow(client: PoolClient) {
    const result = await client.query<{ now: Date }>(
      "select clock_timestamp() as now",
    );
    return result.rows[0]!.now;
  }
}
