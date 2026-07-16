import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import { readTotpConfig, type TotpConfig } from "../../../../config/public.js";
import { withTransaction } from "../../../../database/database.js";
import type { AuditEventInput } from "../../../audit/public.js";
import type { PermissionCode } from "../../application/authorization.js";
import { PostgresAuthorizationService } from "./postgres-authorization-service.js";
import { PostgresSessionService } from "./postgres-session-service.js";
import {
  replaceRecoveryCodeSet,
  verifyRecoveryCode,
} from "../../application/mfa-recovery.js";
import {
  decryptTotpSecret,
  totpStep,
  validateTotp,
} from "../../application/totp.js";
import { verifyPassword } from "../../password.js";

interface AuditAppender {
  append(client: PoolClient, input: AuditEventInput): Promise<unknown>;
}

const RECENT_MFA_WINDOW_MS = 10 * 60 * 1000;
const tokenDigest = (value: string) =>
  createHash("sha256").update(value, "utf8").digest();

function boundedOperation(value: string) {
  if (!/^[a-z][a-z0-9._:-]{2,127}$/u.test(value)) {
    throw new MfaRecoveryRejectedError();
  }
  return value;
}

function boundedReason(value: string) {
  if (!/^[a-z][a-z0-9._-]{2,63}$/u.test(value)) {
    throw new MfaRecoveryRejectedError();
  }
  return value;
}

export class MfaRecoveryRejectedError extends Error {
  constructor() {
    super("MFA recovery failed");
    this.name = "MfaRecoveryRejectedError";
  }
}

export class PostgresMfaRecoveryService {
  constructor(
    private readonly poolSource: Pool | (() => Pool),
    private readonly audit: AuditAppender,
    private readonly sessions: PostgresSessionService,
    private readonly authorization: PostgresAuthorizationService,
    private readonly totpConfig: TotpConfig = readTotpConfig(),
  ) {}

  private get pool() {
    return typeof this.poolSource === "function"
      ? this.poolSource()
      : this.poolSource;
  }

  async issueStepUp(input: {
    readonly sessionToken: string;
    readonly operation: string;
    readonly password?: string;
    readonly totpCode?: string;
    readonly source?: string;
    readonly requestId?: string;
  }) {
    const requestedOperation = boundedOperation(input.operation);
    const session = await this.sessions.validateAuthenticated(
      input.sessionToken,
      input.requestId,
    );
    const principal = session.principal!;
    const token = randomBytes(32).toString("base64url");
    try {
      return await withTransaction(this.pool, async (client) => {
        const state = await client.query<{
          mfa_verified_at: Date | null;
          absolute_expires_at: Date;
          authenticator_id: string | null;
          secret_ciphertext: Buffer | null;
          secret_nonce: Buffer | null;
          secret_tag: Buffer | null;
          key_version: string | null;
          last_accepted_step: string | null;
          password_hash: string;
          now: Date;
        }>(
          `select s.mfa_verified_at, s.absolute_expires_at,
                a.authenticator_id, a.secret_ciphertext, a.secret_nonce,
                a.secret_tag, a.key_version, a.last_accepted_step,
                lc.password_hash,
                clock_timestamp() as now
           from public.web_sessions s
           join public.platform_users u on u.user_id = s.user_id
           join public.local_credentials lc on lc.user_id = s.user_id
           join public.platform_session_generation g on g.singleton_id = 1
           join public.totp_authenticators a
             on a.user_id = s.user_id and a.status = 'ACTIVE'
          where s.session_id = $1 and s.user_id = $2 and s.revoked_at is null
            and u.status = 'ENABLED'
            and s.authorization_version = u.authorization_version
            and s.credential_version = lc.credential_version
            and s.generation_id = g.generation_id
            and s.absolute_expires_at > clock_timestamp()
            and s.idle_expires_at > clock_timestamp()
          for update of s, u, lc, a, g`,
          [session.sessionId, principal.userId],
        );
        const row = state.rows[0];
        if (!row?.mfa_verified_at || !row.authenticator_id) {
          throw new MfaRecoveryRejectedError();
        }
        if (
          await this.isMfaThrottled(
            client,
            principal.userId,
            input.source ?? "unknown",
          )
        ) {
          throw new MfaRecoveryRejectedError();
        }
        if (requestedOperation !== "mfa.recovery-codes.regenerate") {
          const recoveryConfirmed = await client.query<{ confirmed: boolean }>(
            `select exists (
             select 1 from public.mfa_recovery_code_sets
              where user_id = $1 and invalidated_at is null
                and confirmed_at is not null
                and expires_at > clock_timestamp()
           ) as confirmed`,
            [principal.userId],
          );
          if (!recoveryConfirmed.rows[0]?.confirmed) {
            throw new MfaRecoveryRejectedError();
          }
        }
        const recent =
          row.mfa_verified_at.getTime() >=
          row.now.getTime() - RECENT_MFA_WINDOW_MS;
        if (!recent) {
          if (
            !input.totpCode ||
            !input.password ||
            !row.secret_ciphertext ||
            !row.secret_nonce ||
            !row.secret_tag ||
            !row.key_version
          ) {
            throw new MfaRecoveryRejectedError();
          }
          if (!(await verifyPassword(row.password_hash, input.password))) {
            throw new MfaRecoveryRejectedError();
          }
          const secret = decryptTotpSecret(
            {
              ciphertext: row.secret_ciphertext,
              nonce: row.secret_nonce,
              tag: row.secret_tag,
              keyVersion: row.key_version,
            },
            `authenticator:${principal.userId}:${row.authenticator_id}`,
            this.totpConfig,
          );
          const delta = validateTotp(secret, input.totpCode, row.now.getTime());
          const accepted =
            delta === null ? undefined : totpStep(row.now.getTime()) + delta;
          if (
            accepted === undefined ||
            (row.last_accepted_step !== null &&
              Number(row.last_accepted_step) >= accepted)
          ) {
            throw new MfaRecoveryRejectedError();
          }
          await client.query(
            "update public.totp_authenticators set last_accepted_step = $2 where authenticator_id = $1",
            [row.authenticator_id, accepted],
          );
          await client.query(
            "delete from public.totp_user_auth_throttle where user_id = $1",
            [principal.userId],
          );
          await client.query(
            "delete from public.totp_source_auth_throttle where source_hash = $1",
            [this.sourceHash(input.source ?? "unknown")],
          );
        }
        const proofExpiresAt = recent
          ? row.mfa_verified_at.getTime() + RECENT_MFA_WINDOW_MS
          : row.now.getTime() + RECENT_MFA_WINDOW_MS;
        const expiresAt = new Date(
          Math.min(row.absolute_expires_at.getTime(), proofExpiresAt),
        );
        const grantId = randomUUID();
        await client.query(
          `insert into public.mfa_step_up_grants
           (grant_id, user_id, session_id, operation, token_hash, issued_at, expires_at)
         values ($1, $2, $3, $4, $5, $6, $7)`,
          [
            grantId,
            principal.userId,
            session.sessionId,
            requestedOperation,
            tokenDigest(token),
            row.now,
            expiresAt,
          ],
        );
        await this.audit.append(client, {
          actor: { type: "USER", id: principal.userId },
          eventType: "MFA.STEP_UP_ISSUED",
          source: "mfa-recovery",
          outcome: "SUCCESS",
          resource: { type: "mfa-step-up", id: grantId },
          ...(input.requestId === undefined
            ? {}
            : { requestId: input.requestId }),
          details: { metadata: { operation: requestedOperation } },
        });
        return {
          token,
          operation: requestedOperation,
          expiresAt: expiresAt.toISOString(),
        };
      });
    } catch (error) {
      if (error instanceof MfaRecoveryRejectedError) {
        await this.recordMfaDenial({
          userId: principal.userId,
          source: input.source ?? "unknown",
          eventType: "MFA.STEP_UP_DENIED",
          operation: requestedOperation,
          ...(input.requestId === undefined
            ? {}
            : { requestId: input.requestId }),
        });
      }
      throw error;
    }
  }

  async consumeStepUp(input: {
    readonly sessionToken: string;
    readonly stepUpToken: string;
    readonly operation: string;
    readonly requestId?: string;
  }) {
    const requestedOperation = boundedOperation(input.operation);
    const session = await this.sessions.validateAuthenticated(
      input.sessionToken,
      input.requestId,
    );
    return withTransaction(this.pool, async (client) => {
      await this.consumeGrant(
        client,
        session.sessionId,
        session.principal!.userId,
        input.stepUpToken,
        requestedOperation,
        session.principal!.authorizationVersion,
      );
      await this.audit.append(client, {
        actor: { type: "USER", id: session.principal!.userId },
        eventType: "MFA.STEP_UP_CONSUMED",
        source: "mfa-recovery",
        outcome: "SUCCESS",
        resource: { type: "web-session", id: session.sessionId },
        ...(input.requestId === undefined
          ? {}
          : { requestId: input.requestId }),
        details: { metadata: { operation: requestedOperation } },
      });
      return true;
    });
  }

  async confirmRecoveryCodes(input: {
    readonly sessionToken: string;
    readonly requestId?: string;
  }) {
    const session = await this.sessions.validateAuthenticated(
      input.sessionToken,
      input.requestId,
    );
    return withTransaction(this.pool, async (client) => {
      await this.assertLiveAuthority(
        client,
        session.sessionId,
        session.principal!.userId,
        session.principal!.authorizationVersion,
      );
      const confirmed = await client.query<{ set_id: string }>(
        `update public.mfa_recovery_code_sets
            set confirmed_at = clock_timestamp()
          where user_id = $1 and invalidated_at is null
            and confirmed_at is null and expires_at > clock_timestamp()
          returning set_id`,
        [session.principal!.userId],
      );
      if (confirmed.rowCount !== 1) throw new MfaRecoveryRejectedError();
      await this.audit.append(client, {
        actor: { type: "USER", id: session.principal!.userId },
        eventType: "MFA.RECOVERY_CODES_CONFIRMED",
        source: "mfa-recovery",
        outcome: "SUCCESS",
        resource: {
          type: "mfa-recovery-code-set",
          id: confirmed.rows[0]!.set_id,
        },
        ...(input.requestId === undefined
          ? {}
          : { requestId: input.requestId }),
      });
      return true;
    });
  }

  async regenerateRecoveryCodes(input: {
    readonly sessionToken: string;
    readonly stepUpToken: string;
    readonly requestId?: string;
  }) {
    const requestedOperation = "mfa.recovery-codes.regenerate";
    const session = await this.sessions.validateAuthenticated(
      input.sessionToken,
      input.requestId,
    );
    return withTransaction(this.pool, async (client) => {
      await this.consumeGrant(
        client,
        session.sessionId,
        session.principal!.userId,
        input.stepUpToken,
        requestedOperation,
        session.principal!.authorizationVersion,
      );
      const replacement = await replaceRecoveryCodeSet(
        client,
        session.principal!.userId,
      );
      await this.audit.append(client, {
        actor: { type: "USER", id: session.principal!.userId },
        eventType: "MFA.RECOVERY_CODES_REGENERATED",
        source: "mfa-recovery",
        outcome: "SUCCESS",
        resource: { type: "platform-user", id: session.principal!.userId },
        ...(input.requestId === undefined
          ? {}
          : { requestId: input.requestId }),
        details: { metadata: { count: replacement.codes.length } },
      });
      return replacement;
    });
  }

  async recoverWithCode(input: {
    readonly preAuthenticationToken: string;
    readonly recoveryCode: string;
    readonly source?: string;
    readonly requestId?: string;
  }) {
    const session = await this.sessions.validatePreAuthentication(
      input.preAuthenticationToken,
      input.requestId,
    );
    try {
      return await withTransaction(this.pool, async (client) => {
        const owner = await client.query<{ user_id: string }>(
          `select s.user_id from public.web_sessions s
         join public.mfa_challenges c on c.session_id = s.session_id
         where s.session_id = $1 and s.revoked_at is null
           and c.purpose = 'MFA_VERIFY' and c.completed_at is null
           and c.expires_at > clock_timestamp()
           and c.attempt_count < c.max_attempts
           and not exists (
             select 1 from public.totp_user_auth_throttle t
              where t.user_id = s.user_id
                and t.locked_until > clock_timestamp()
           )
           and not exists (
             select 1 from public.totp_source_auth_throttle t
              where t.source_hash = $2
                and t.locked_until > clock_timestamp()
           )
         for update of s, c`,
          [session.sessionId, this.sourceHash(input.source ?? "unknown")],
        );
        const userId = owner.rows[0]?.user_id;
        if (!userId) throw new MfaRecoveryRejectedError();
        const activeSet = await client.query<{ set_id: string }>(
          `select set_id from public.mfa_recovery_code_sets
          where user_id = $1 and invalidated_at is null
            and expires_at > clock_timestamp()
          for update`,
          [userId],
        );
        const setId = activeSet.rows[0]?.set_id;
        if (!setId) throw new MfaRecoveryRejectedError();
        const available = await client.query<{
          code_id: string;
          code_hash: string;
        }>(
          `select code_id, code_hash from public.mfa_recovery_codes
          where set_id = $1 and consumed_at is null
            and expires_at > clock_timestamp()
          order by code_id for update`,
          [setId],
        );
        let matched: string | undefined;
        for (const candidate of available.rows) {
          if (
            await verifyRecoveryCode(candidate.code_hash, input.recoveryCode)
          ) {
            matched = candidate.code_id;
            break;
          }
        }
        if (!matched) throw new MfaRecoveryRejectedError();
        const consumed = await client.query(
          `update public.mfa_recovery_codes set consumed_at = clock_timestamp()
          where code_id = $1 and consumed_at is null`,
          [matched],
        );
        if (consumed.rowCount !== 1) throw new MfaRecoveryRejectedError();
        await client.query(
          "update public.mfa_recovery_code_sets set invalidated_at = clock_timestamp() where set_id = $1 and invalidated_at is null",
          [setId],
        );
        await client.query(
          "delete from public.totp_user_auth_throttle where user_id = $1",
          [userId],
        );
        await this.resetFactors(client, userId);
        await this.audit.append(client, {
          actor: { type: "USER", id: userId },
          eventType: "MFA.RECOVERY_CODE_USED",
          source: "mfa-recovery",
          outcome: "SUCCESS",
          resource: { type: "platform-user", id: userId },
          ...(input.requestId === undefined
            ? {}
            : { requestId: input.requestId }),
          details: { metadata: { highPriority: true } },
        });
        return { status: "MFA_ENROLLMENT_REQUIRED" as const };
      });
    } catch (error) {
      if (error instanceof MfaRecoveryRejectedError) {
        await this.recordMfaDenial({
          ...(session.principal?.userId === undefined
            ? {}
            : { userId: session.principal.userId }),
          sessionId: session.sessionId,
          source: input.source ?? "unknown",
          eventType: "MFA.RECOVERY_CODE_DENIED",
          operation: "mfa.recovery-code.use",
          ...(input.requestId === undefined
            ? {}
            : { requestId: input.requestId }),
        });
      }
      throw error;
    }
  }

  async resetMfa(input: {
    readonly actorSessionToken: string;
    readonly stepUpToken: string;
    readonly userId: string;
    readonly reason: string;
    readonly requestId?: string;
  }) {
    const session = await this.sessions.validateAuthenticated(
      input.actorSessionToken,
      input.requestId,
    );
    const principal = session.principal!;
    if (
      !(await this.authorization.authorize(
        principal,
        "authentication.manage",
        input.requestId === undefined ? {} : { requestId: input.requestId },
      ))
    ) {
      throw new MfaRecoveryRejectedError();
    }
    const reason = boundedReason(input.reason);
    return withTransaction(this.pool, async (client) => {
      await this.consumeGrant(
        client,
        session.sessionId,
        principal.userId,
        input.stepUpToken,
        `mfa.reset:${input.userId}`,
        principal.authorizationVersion,
        "authentication.manage",
      );
      await this.resetFactors(client, input.userId);
      await this.audit.append(client, {
        actor: { type: "USER", id: principal.userId },
        eventType: "MFA.ADMIN_RESET",
        source: "mfa-recovery",
        outcome: "SUCCESS",
        resource: { type: "platform-user", id: input.userId },
        ...(input.requestId === undefined
          ? {}
          : { requestId: input.requestId }),
        details: {
          reasonCategory: reason,
          metadata: { highPriority: true },
        },
      });
      return true;
    });
  }

  async unbindMfa(input: {
    readonly sessionToken: string;
    readonly stepUpToken: string;
    readonly reason: string;
    readonly requestId?: string;
  }) {
    const session = await this.sessions.validateAuthenticated(
      input.sessionToken,
      input.requestId,
    );
    const principal = session.principal!;
    const reason = boundedReason(input.reason);
    return withTransaction(this.pool, async (client) => {
      await this.consumeGrant(
        client,
        session.sessionId,
        principal.userId,
        input.stepUpToken,
        "mfa.unbind",
        principal.authorizationVersion,
      );
      const sensitive = await client.query<{ present: boolean }>(
        `select exists (
           select 1
             from public.user_role_assignments ura
             join public.role_permissions rp on rp.role_id = ura.role_id
             join public.permissions p on p.permission_code = rp.permission_code
            where ura.user_id = $1 and p.sensitive
         ) as present`,
        [principal.userId],
      );
      if (sensitive.rows[0]?.present) throw new MfaRecoveryRejectedError();
      await this.resetFactors(client, principal.userId);
      await this.audit.append(client, {
        actor: { type: "USER", id: principal.userId },
        eventType: "MFA.UNBOUND",
        source: "mfa-recovery",
        outcome: "SUCCESS",
        resource: { type: "platform-user", id: principal.userId },
        ...(input.requestId === undefined
          ? {}
          : { requestId: input.requestId }),
        details: {
          reasonCategory: reason,
          metadata: { highPriority: true },
        },
      });
      return true;
    });
  }

  async setEmergencyAdministrator(input: {
    readonly actorSessionToken: string;
    readonly stepUpToken: string;
    readonly userId: string;
    readonly enabled: boolean;
    readonly requestId?: string;
  }) {
    const session = await this.sessions.validateAuthenticated(
      input.actorSessionToken,
      input.requestId,
    );
    const principal = session.principal!;
    if (
      !(await this.authorization.authorize(
        principal,
        "authentication.manage",
        input.requestId === undefined ? {} : { requestId: input.requestId },
      ))
    ) {
      throw new MfaRecoveryRejectedError();
    }
    return withTransaction(this.pool, async (client) => {
      await this.consumeGrant(
        client,
        session.sessionId,
        principal.userId,
        input.stepUpToken,
        `emergency-administrator:${input.userId}`,
        principal.authorizationVersion,
        "authentication.manage",
      );
      if (input.enabled) {
        const designated = await client.query(
          `insert into public.emergency_administrators (user_id, enabled)
           select $1, true
             from public.totp_authenticators
            where user_id = $1 and status = 'ACTIVE'
           on conflict (user_id) do update set
             enabled = true, updated_at = clock_timestamp()`,
          [input.userId],
        );
        if (designated.rowCount !== 1) throw new MfaRecoveryRejectedError();
      } else {
        const revoked = await client.query(
          `update public.emergency_administrators
              set enabled = false, updated_at = clock_timestamp()
            where user_id = $1`,
          [input.userId],
        );
        if (revoked.rowCount !== 1) throw new MfaRecoveryRejectedError();
      }
      await this.audit.append(client, {
        actor: { type: "USER", id: principal.userId },
        eventType: input.enabled
          ? "MFA.EMERGENCY_ADMIN_ENABLED"
          : "MFA.EMERGENCY_ADMIN_REVOKED",
        source: "mfa-recovery",
        outcome: "SUCCESS",
        resource: { type: "platform-user", id: input.userId },
        ...(input.requestId === undefined
          ? {}
          : { requestId: input.requestId }),
        details: { changedFields: ["emergencyAdministrator"] },
      });
      return true;
    });
  }

  async breakGlass(input: {
    readonly userId: string;
    readonly reason: string;
  }) {
    const reason = boundedReason(input.reason);
    return withTransaction(this.pool, async (client) => {
      const target = await client.query(
        `select e.user_id from public.emergency_administrators e
         join public.platform_users u on u.user_id = e.user_id
         where e.user_id = $1 and e.enabled and u.status = 'ENABLED'
         for update of e, u`,
        [input.userId],
      );
      if (target.rowCount !== 1) throw new MfaRecoveryRejectedError();
      await this.resetFactors(client, input.userId);
      await client.query(
        `update public.local_credentials
            set must_change_password = true,
                credential_version = credential_version + 1,
                updated_at = clock_timestamp()
          where user_id = $1`,
        [input.userId],
      );
      await client.query(
        "update public.emergency_administrators set enabled = false, updated_at = clock_timestamp() where user_id = $1",
        [input.userId],
      );
      await this.audit.append(client, {
        actor: { type: "SYSTEM", id: "host-break-glass" },
        eventType: "MFA.HOST_BREAK_GLASS_USED",
        source: "host-break-glass",
        outcome: "SUCCESS",
        resource: { type: "platform-user", id: input.userId },
        details: {
          reasonCategory: reason,
          metadata: { highPriority: true },
        },
      });
      return true;
    });
  }

  private async consumeGrant(
    client: PoolClient,
    sessionId: string,
    userId: string,
    token: string,
    requestedOperation: string,
    authorizationVersion: number,
    requiredPermission?: PermissionCode,
  ) {
    await this.assertLiveAuthority(
      client,
      sessionId,
      userId,
      authorizationVersion,
      requiredPermission,
    );
    const consumed = await client.query(
      `update public.mfa_step_up_grants
          set consumed_at = clock_timestamp()
        where token_hash = $1 and session_id = $2 and user_id = $3
          and operation = $4 and consumed_at is null
          and expires_at > clock_timestamp()
        returning grant_id`,
      [tokenDigest(token), sessionId, userId, requestedOperation],
    );
    if (consumed.rowCount !== 1) throw new MfaRecoveryRejectedError();
  }

  private async assertLiveAuthority(
    client: PoolClient,
    sessionId: string,
    userId: string,
    authorizationVersion: number,
    requiredPermission?: PermissionCode,
  ) {
    const authority = await client.query(
      `select s.session_id
           from public.web_sessions s
           join public.platform_users u on u.user_id = s.user_id
           join public.local_credentials lc on lc.user_id = s.user_id
           join public.platform_session_generation g on g.singleton_id = 1
          where s.session_id = $1 and s.user_id = $2
            and s.revoked_at is null and u.status = 'ENABLED'
            and s.authorization_version = u.authorization_version
            and s.authorization_version = $3
            and s.credential_version = lc.credential_version
            and s.generation_id = g.generation_id
            and s.absolute_expires_at > clock_timestamp()
            and s.idle_expires_at > clock_timestamp()
          for update of s, u, lc, g`,
      [sessionId, userId, authorizationVersion],
    );
    if (authority.rowCount !== 1) throw new MfaRecoveryRejectedError();
    if (requiredPermission) {
      const granted = await client.query<{ allowed: boolean }>(
        `select exists (
           select 1
             from public.user_role_assignments ura
             join public.role_permissions rp on rp.role_id = ura.role_id
            where ura.user_id = $1 and rp.permission_code = $2
         ) as allowed`,
        [userId, requiredPermission],
      );
      if (!granted.rows[0]?.allowed) throw new MfaRecoveryRejectedError();
    }
  }

  private async resetFactors(client: PoolClient, userId: string) {
    await client.query(
      `update public.totp_authenticators
          set status = 'REVOKED', revoked_at = clock_timestamp()
        where user_id = $1 and status = 'ACTIVE'`,
      [userId],
    );
    await client.query(
      "delete from public.totp_enrollments where user_id = $1",
      [userId],
    );
    await client.query(
      "update public.mfa_recovery_code_sets set invalidated_at = clock_timestamp() where user_id = $1 and invalidated_at is null",
      [userId],
    );
    await client.query(
      "update public.mfa_challenges set completed_at = clock_timestamp() where user_id = $1 and completed_at is null",
      [userId],
    );
    const updated = await client.query(
      `update public.platform_users
          set mfa_state = 'MFA_ENROLLMENT_REQUIRED',
              authorization_version = authorization_version + 1,
              updated_at = clock_timestamp()
        where user_id = $1`,
      [userId],
    );
    if (updated.rowCount !== 1) throw new MfaRecoveryRejectedError();
    await client.query(
      `update public.web_sessions
          set revoked_at = clock_timestamp(),
              revocation_reason = 'RECOVERY_INVALIDATION'
        where user_id = $1 and revoked_at is null`,
      [userId],
    );
  }

  private sourceHash(source: string) {
    return createHash("sha256")
      .update(Array.from(source).slice(0, 128).join(""), "utf8")
      .digest("hex");
  }

  private async isMfaThrottled(
    client: PoolClient,
    userId: string,
    source: string,
  ) {
    const result = await client.query<{ locked: boolean }>(
      `select exists (
         select 1 from public.totp_user_auth_throttle
          where user_id = $1 and locked_until > clock_timestamp()
         union all
         select 1 from public.totp_source_auth_throttle
          where source_hash = $2 and locked_until > clock_timestamp()
       ) as locked`,
      [userId, this.sourceHash(source)],
    );
    return result.rows[0]?.locked ?? false;
  }

  private async recordMfaDenial(input: {
    readonly userId?: string;
    readonly sessionId?: string;
    readonly source: string;
    readonly eventType: string;
    readonly operation: string;
    readonly requestId?: string;
  }) {
    await withTransaction(this.pool, async (client) => {
      let userId = input.userId;
      if (!userId && input.sessionId) {
        const owner = await client.query<{ user_id: string }>(
          "select user_id from public.web_sessions where session_id = $1",
          [input.sessionId],
        );
        userId = owner.rows[0]?.user_id;
      }
      if (input.sessionId) {
        await client.query(
          `update public.mfa_challenges
              set attempt_count = least(max_attempts, attempt_count + 1)
            where session_id = $1 and completed_at is null`,
          [input.sessionId],
        );
      }
      if (userId) {
        await client.query(
          `insert into public.totp_user_auth_throttle
             (user_id, failure_count, locked_until)
           values ($1, 1, null)
           on conflict (user_id) do update set
             failure_count = least(100, public.totp_user_auth_throttle.failure_count + 1),
             locked_until = case
               when public.totp_user_auth_throttle.locked_until > clock_timestamp()
                 then public.totp_user_auth_throttle.locked_until
               when public.totp_user_auth_throttle.failure_count + 1 >= $2
                 then clock_timestamp() + ($3::integer * interval '1 millisecond')
               else public.totp_user_auth_throttle.locked_until
             end,
             updated_at = clock_timestamp()`,
          [
            userId,
            this.totpConfig.challengeMaxAttempts,
            this.totpConfig.throttleDurationMs,
          ],
        );
        await client.query(
          `insert into public.totp_source_auth_throttle
             (source_hash, failure_count, locked_until)
           values ($1, 1, null)
           on conflict (source_hash) do update set
             failure_count = least(100, public.totp_source_auth_throttle.failure_count + 1),
             locked_until = case
               when public.totp_source_auth_throttle.locked_until > clock_timestamp()
                 then public.totp_source_auth_throttle.locked_until
               when public.totp_source_auth_throttle.failure_count + 1 >= $2
                 then clock_timestamp() + ($3::integer * interval '1 millisecond')
               else public.totp_source_auth_throttle.locked_until
             end,
             updated_at = clock_timestamp()`,
          [
            this.sourceHash(input.source),
            this.totpConfig.challengeMaxAttempts,
            this.totpConfig.throttleDurationMs,
          ],
        );
      }
      await this.audit.append(client, {
        actor: userId ? { type: "USER", id: userId } : { type: "UNKNOWN" },
        eventType: input.eventType,
        source: "mfa-recovery",
        outcome: "DENIED",
        failureCategory: "MFA_REJECTED",
        ...(input.requestId === undefined
          ? {}
          : { requestId: input.requestId }),
        details: {
          reasonCategory: "mfa-rejected",
          metadata: { operation: input.operation },
        },
      });
    });
  }
}
