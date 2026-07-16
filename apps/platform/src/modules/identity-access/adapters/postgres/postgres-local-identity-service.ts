import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import { withTransaction } from "../../../../database/database.js";
import type { AuditContext, AuditEventInput } from "../../../audit/public.js";
import {
  AuthenticationRejectedError,
  BootstrapClosedError,
  type AuthenticationProvider,
  type AuthenticationResult,
  type PlatformUser,
  type PlatformUserStatus,
} from "../../application/authentication-provider.js";
import { hashPassword, verifyPassword } from "../../password.js";
import { revokeUserSessions } from "./postgres-session-service.js";

const LOCKOUT_DURATION_SECONDS = 30;

interface AuditAppender {
  append(client: PoolClient, input: AuditEventInput): Promise<unknown>;
}

interface LocalUserRecord {
  readonly userId: string;
  readonly username: string;
  readonly usernameNormalized: string;
  readonly status: PlatformUserStatus;
  readonly mustChangePassword: boolean;
  readonly credentialVersion: number;
  readonly authorizationVersion: number;
  readonly passwordHash: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface LocalUserRow {
  readonly user_id: string;
  readonly username: string;
  readonly username_normalized: string;
  readonly status: PlatformUserStatus;
  readonly must_change_password: boolean;
  readonly credential_version: number;
  readonly authorization_version: string;
  readonly password_hash: string;
  readonly created_at: Date;
  readonly updated_at: Date;
}

function normalizeUsername(username: string) {
  const display = username.trim();
  const normalized = display.normalize("NFKC").toLocaleLowerCase("en-US");
  if (
    Array.from(display).length < 3 ||
    Array.from(display).length > 64 ||
    !/^[\p{L}\p{N}][\p{L}\p{N}._-]{2,63}$/u.test(normalized)
  ) {
    throw new Error("Username must be a bounded account name");
  }
  return { display, normalized } as const;
}

function mapUser(row: LocalUserRecord): PlatformUser {
  return {
    userId: row.userId,
    username: row.username,
    status: row.status,
    mustChangePassword: row.mustChangePassword,
    credentialVersion: row.credentialVersion,
    authorizationVersion: row.authorizationVersion,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapRecord(row: LocalUserRow): LocalUserRecord {
  return {
    userId: row.user_id,
    username: row.username,
    usernameNormalized: row.username_normalized,
    status: row.status,
    mustChangePassword: row.must_change_password,
    credentialVersion: row.credential_version,
    authorizationVersion: Number(row.authorization_version),
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function postgresCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function bucketKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function boundedAuditText(value: string | undefined, fallback: string) {
  const bounded = Array.from(value ?? "")
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127 ? "?" : character;
    })
    .join("")
    .slice(0, 128);
  return bounded || fallback;
}

let dummyHash: Promise<string> | undefined;
function authenticationDummyHash() {
  dummyHash ??= hashPassword(randomBytes(32).toString("base64url"));
  return dummyHash;
}

export class PostgresLocalIdentityService implements AuthenticationProvider {
  private readonly counters = {
    authenticationSucceeded: 0,
    authenticationFailed: 0,
    lockoutApplied: 0,
    lockoutDurationSeconds: LOCKOUT_DURATION_SECONDS,
    bootstrapSucceeded: 0,
    bootstrapFailed: 0,
  };

  constructor(
    private readonly pool: Pool,
    private readonly audit: AuditAppender,
  ) {}

  get metrics() {
    return Object.freeze({ ...this.counters });
  }

  async bootstrapAdministrator(input: {
    readonly username: string;
    readonly password: string;
    readonly requestId?: string;
  }): Promise<PlatformUser> {
    const username = normalizeUsername(input.username);
    const passwordHash = await hashPassword(input.password, {
      username: username.normalized,
    });
    const userId = randomUUID();

    try {
      const user = await this.transaction(async (transaction) => {
        if (await this.lockBootstrapState(transaction)) {
          throw new BootstrapClosedError();
        }
        if (await this.hasUsers(transaction)) {
          throw new BootstrapClosedError();
        }

        const row = await this.insertUser(transaction, {
          userId,
          username,
          passwordHash,
        });
        await this.appendAudit(transaction, {
          actor: { type: "SYSTEM", id: "local-bootstrap" },
          eventType: "IDENTITY.ADMIN_BOOTSTRAPPED",
          source: "identity-bootstrap",
          outcome: "SUCCESS",
          resource: { type: "platform-user", id: userId },
          ...(input.requestId === undefined
            ? {}
            : { requestId: input.requestId }),
          idempotencyKey: "initial-administrator",
          details: { changedFields: ["username", "status"] },
        });
        await this.completeBootstrap(transaction, userId);
        return mapUser(row);
      });
      this.counters.bootstrapSucceeded += 1;
      return user;
    } catch (error) {
      this.counters.bootstrapFailed += 1;
      if (this.isUniqueViolation(error)) {
        throw new Error("Username is unavailable", { cause: error });
      }
      throw error;
    }
  }

  async createUser(input: {
    readonly username: string;
    readonly password: string;
    readonly audit: AuditContext;
  }) {
    const username = normalizeUsername(input.username);
    const passwordHash = await hashPassword(input.password, {
      username: username.normalized,
    });
    const userId = randomUUID();
    try {
      return await this.transaction(async (transaction) => {
        if (!(await this.lockBootstrapState(transaction))) {
          throw new Error("Administrator bootstrap is required");
        }

        const row = await this.insertUser(transaction, {
          userId,
          username,
          passwordHash,
        });
        await this.appendUserAudit(transaction, input.audit, {
          eventType: "IDENTITY.USER_CREATED",
          userId,
          changedFields: ["username", "status"],
        });
        return mapUser(row);
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new Error("Username is unavailable", { cause: error });
      }
      throw error;
    }
  }

  async renameUser(input: {
    readonly userId: string;
    readonly username: string;
    readonly audit: AuditContext;
  }) {
    const username = normalizeUsername(input.username);
    try {
      return await this.transaction(async (transaction) => {
        if (
          !(await this.persistUsername(transaction, input.userId, username))
        ) {
          throw new Error("Platform user not found");
        }
        await this.appendUserAudit(transaction, input.audit, {
          eventType: "IDENTITY.USER_RENAMED",
          userId: input.userId,
          changedFields: ["username"],
        });
        return mapUser(
          (await this.readUser("userId", input.userId, transaction))!,
        );
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new Error("Username is unavailable", { cause: error });
      }
      throw error;
    }
  }

  disableUser(input: {
    readonly userId: string;
    readonly audit: AuditContext;
  }) {
    return this.setStatus(input.userId, "DISABLED", input.audit);
  }

  enableUser(input: { readonly userId: string; readonly audit: AuditContext }) {
    return this.setStatus(input.userId, "ENABLED", input.audit);
  }

  async changeInitialPassword(input: {
    readonly userId: string;
    readonly currentPassword: string;
    readonly newPassword: string;
    readonly audit: AuditContext;
  }) {
    const existing = await this.readUser("userId", input.userId);
    if (
      !existing ||
      !existing.mustChangePassword ||
      !(await verifyPassword(existing.passwordHash, input.currentPassword))
    ) {
      throw new AuthenticationRejectedError();
    }
    const nextHash = await hashPassword(input.newPassword, {
      username: existing.usernameNormalized,
    });
    return this.transaction(async (transaction) => {
      const current = await this.readUser(
        "userId",
        input.userId,
        transaction,
        true,
      );
      if (
        !current ||
        !current.mustChangePassword ||
        current.passwordHash !== existing.passwordHash
      ) {
        throw new AuthenticationRejectedError();
      }
      await this.updatePassword(transaction, input.userId, nextHash, false);
      await revokeUserSessions(transaction, this.audit, {
        userId: input.userId,
        reason: "PASSWORD_CHANGED",
        ...(input.audit.requestId === undefined
          ? {}
          : { requestId: input.audit.requestId }),
        actor: input.audit.actor,
      });
      await this.appendUserAudit(transaction, input.audit, {
        eventType: "IDENTITY.INITIAL_PASSWORD_CHANGED",
        userId: input.userId,
        changedFields: ["credential", "mustChangePassword"],
      });
      return mapUser(
        (await this.readUser("userId", input.userId, transaction))!,
      );
    });
  }

  async resetPassword(input: {
    readonly userId: string;
    readonly newPassword: string;
    readonly audit: AuditContext;
  }) {
    const existing = await this.readUser("userId", input.userId);
    if (!existing) throw new Error("Platform user not found");
    const nextHash = await hashPassword(input.newPassword, {
      username: existing.usernameNormalized,
    });
    return this.transaction(async (transaction) => {
      const current = await this.readUser(
        "userId",
        input.userId,
        transaction,
        true,
      );
      if (!current) throw new Error("Platform user not found");
      await this.updatePassword(transaction, input.userId, nextHash, true);
      await revokeUserSessions(transaction, this.audit, {
        userId: input.userId,
        reason: "PASSWORD_CHANGED",
        ...(input.audit.requestId === undefined
          ? {}
          : { requestId: input.audit.requestId }),
        actor: input.audit.actor,
      });
      await this.appendUserAudit(transaction, input.audit, {
        eventType: "IDENTITY.PASSWORD_RESET",
        userId: input.userId,
        changedFields: ["credential", "mustChangePassword"],
      });
      return mapUser(
        (await this.readUser("userId", input.userId, transaction))!,
      );
    });
  }

  async authenticate(input: {
    readonly username: string;
    readonly password: string;
    readonly source: string;
    readonly clientSummary?: string;
    readonly requestId?: string;
  }): Promise<AuthenticationResult> {
    let username: ReturnType<typeof normalizeUsername> | undefined;
    try {
      username = normalizeUsername(input.username);
    } catch {
      username = undefined;
    }
    const accountIdentity =
      username?.normalized ?? `invalid:${input.username.slice(0, 128)}`;
    const accountBucket = bucketKey(accountIdentity);
    const sourceAddress = boundedAuditText(input.source, "unknown");
    const clientSummary = boundedAuditText(input.clientSummary, "unspecified");
    const sourceBucket = bucketKey(sourceAddress);
    const initial = username
      ? await this.readUser("usernameNormalized", username.normalized)
      : undefined;
    const targetHash =
      initial?.passwordHash ?? (await authenticationDummyHash());
    const passwordMatches = await verifyPassword(targetHash, input.password);

    const outcome = await this.transaction(async (transaction) => {
      const current = username
        ? await this.readUser(
            "usernameNormalized",
            username.normalized,
            transaction,
            true,
          )
        : undefined;
      const locked = await this.hasActiveThrottle(
        transaction,
        accountBucket,
        sourceBucket,
      );
      const accepted =
        Boolean(current) &&
        current?.status === "ENABLED" &&
        current.passwordHash === initial?.passwordHash &&
        passwordMatches &&
        !locked;

      if (!accepted || !current) {
        const failureLocked = await this.recordFailure(
          transaction,
          accountBucket,
          sourceBucket,
          LOCKOUT_DURATION_SECONDS,
        );
        await this.appendAudit(transaction, {
          actor: { type: "UNKNOWN" },
          eventType: "IDENTITY.AUTHENTICATION_FAILED",
          source: "local-authentication",
          outcome: "DENIED",
          failureCategory: "INVALID_CREDENTIAL",
          ...(current === undefined
            ? {}
            : {
                resource: {
                  type: "platform-user",
                  id: current.userId,
                },
              }),
          ...(input.requestId === undefined
            ? {}
            : { requestId: input.requestId }),
          details: {
            reasonCategory: "credential-invalid",
            metadata: {
              ...(username === undefined
                ? {}
                : { candidateUser: username.normalized }),
              clientSummary,
              sourceAddress,
              temporarilyLocked: failureLocked,
            },
          },
        });
        return { user: null, locked: failureLocked } as const;
      }

      await this.clearThrottle(transaction, accountBucket, sourceBucket);
      await this.appendAudit(transaction, {
        actor: { type: "USER", id: current.userId },
        eventType: "IDENTITY.AUTHENTICATION_SUCCEEDED",
        source: "local-authentication",
        outcome: "SUCCESS",
        resource: { type: "platform-user", id: current.userId },
        ...(input.requestId === undefined
          ? {}
          : { requestId: input.requestId }),
        details: { metadata: { clientSummary, sourceAddress } },
      });
      return { user: mapUser(current), locked: false } as const;
    });
    if (!outcome.user) {
      this.counters.authenticationFailed += 1;
      if (outcome.locked) this.counters.lockoutApplied += 1;
      throw new AuthenticationRejectedError();
    }
    this.counters.authenticationSucceeded += 1;
    return outcome.user;
  }

  private async setStatus(
    userId: string,
    status: PlatformUserStatus,
    audit: AuditContext,
  ) {
    return this.transaction(async (transaction) => {
      if (!(await this.updateStatus(transaction, userId, status))) {
        throw new Error("Platform user not found");
      }
      if (status === "DISABLED") {
        await revokeUserSessions(transaction, this.audit, {
          userId,
          reason: "USER_DISABLED",
          ...(audit.requestId === undefined
            ? {}
            : { requestId: audit.requestId }),
          actor: audit.actor,
        });
      }
      await this.appendUserAudit(transaction, audit, {
        eventType:
          status === "ENABLED"
            ? "IDENTITY.USER_ENABLED"
            : "IDENTITY.USER_DISABLED",
        userId,
        changedFields: ["status"],
      });
      return mapUser((await this.readUser("userId", userId, transaction))!);
    });
  }

  private async appendUserAudit(
    transaction: PoolClient,
    context: AuditContext,
    input: {
      readonly eventType: string;
      readonly userId: string;
      readonly changedFields: readonly string[];
    },
  ) {
    await this.appendAudit(transaction, {
      ...context,
      eventType: input.eventType,
      source: "identity-access",
      outcome: "SUCCESS",
      resource: { type: "platform-user", id: input.userId },
      details: { changedFields: input.changedFields },
    });
  }

  private isUniqueViolation(error: unknown) {
    return postgresCode(error) === "23505";
  }

  private transaction<T>(work: (client: PoolClient) => Promise<T>) {
    return withTransaction(this.pool, work);
  }

  private appendAudit(client: PoolClient, input: AuditEventInput) {
    return this.audit.append(client, input);
  }

  private async readUser(
    field: "userId" | "usernameNormalized",
    value: string,
    client: Pool | PoolClient = this.pool,
    lock = false,
  ) {
    const column = field === "userId" ? "user_id" : "username_normalized";
    const result = await client.query<LocalUserRow>(
      `select u.user_id, u.username, u.username_normalized, u.status,
              u.authorization_version, c.must_change_password,
              c.credential_version, c.password_hash, u.created_at, u.updated_at
         from public.platform_users u
         join public.local_credentials c on c.user_id = u.user_id
        where u.${column} = $1
        ${lock ? "for update of u, c" : ""}`,
      [value],
    );
    return result.rows[0] ? mapRecord(result.rows[0]) : undefined;
  }

  private async lockBootstrapState(client: PoolClient) {
    const result = await client.query<{ initialized_at: Date | null }>(
      `select initialized_at from public.platform_bootstrap_state
        where singleton_id = 1 for update`,
    );
    return result.rows[0]?.initialized_at ?? null;
  }

  private async hasUsers(client: PoolClient) {
    const result = await client.query<{ exists: boolean }>(
      "select exists(select 1 from public.platform_users) as exists",
    );
    return result.rows[0]?.exists ?? false;
  }

  private async insertUser(
    client: PoolClient,
    input: {
      readonly userId: string;
      readonly username: ReturnType<typeof normalizeUsername>;
      readonly passwordHash: string;
    },
  ) {
    await client.query(
      `insert into public.platform_users
         (user_id, username, username_normalized, status)
       values ($1, $2, $3, 'ENABLED')`,
      [input.userId, input.username.display, input.username.normalized],
    );
    await client.query(
      `insert into public.local_credentials (user_id, password_hash)
       values ($1, $2)`,
      [input.userId, input.passwordHash],
    );
    return (await this.readUser("userId", input.userId, client))!;
  }

  private async completeBootstrap(client: PoolClient, userId: string) {
    await client.query(
      `insert into public.user_role_assignments (user_id, role_id)
       select $1, role_id from public.roles
        where role_key = 'system-administrator'
       on conflict do nothing`,
      [userId],
    );
    await client.query(
      `update public.platform_bootstrap_state
          set administrator_user_id = $1, initialized_at = clock_timestamp()
        where singleton_id = 1`,
      [userId],
    );
  }

  private async persistUsername(
    client: PoolClient,
    userId: string,
    username: ReturnType<typeof normalizeUsername>,
  ) {
    const result = await client.query(
      `update public.platform_users
          set username = $2, username_normalized = $3,
              updated_at = clock_timestamp()
        where user_id = $1`,
      [userId, username.display, username.normalized],
    );
    return result.rowCount === 1;
  }

  private async updatePassword(
    client: PoolClient,
    userId: string,
    passwordHash: string,
    mustChangePassword: boolean,
  ) {
    await client.query(
      `update public.local_credentials
          set password_hash = $2, must_change_password = $3,
              credential_version = credential_version + 1,
              updated_at = clock_timestamp()
        where user_id = $1`,
      [userId, passwordHash, mustChangePassword],
    );
  }

  private async updateStatus(
    client: PoolClient,
    userId: string,
    status: PlatformUserStatus,
  ) {
    const result = await client.query(
      `update public.platform_users
          set status = $2,
              authorization_version = authorization_version + 1,
              updated_at = clock_timestamp()
        where user_id = $1`,
      [userId, status],
    );
    return result.rowCount === 1;
  }

  private async hasActiveThrottle(
    client: PoolClient,
    accountBucket: string,
    sourceBucket: string,
  ) {
    const result = await client.query<{ locked: boolean }>(
      `select exists (
         select 1 from public.local_auth_throttle
          where ((bucket_type = 'ACCOUNT' and bucket_key = $1)
             or (bucket_type = 'SOURCE' and bucket_key = $2))
            and locked_until > clock_timestamp()
       ) as locked`,
      [accountBucket, sourceBucket],
    );
    return result.rows[0]?.locked ?? false;
  }

  private async clearThrottle(
    client: PoolClient,
    accountBucket: string,
    sourceBucket: string,
  ) {
    await client.query(
      `delete from public.local_auth_throttle
        where (bucket_type = 'ACCOUNT' and bucket_key = $1)
           or (bucket_type = 'SOURCE' and bucket_key = $2)`,
      [accountBucket, sourceBucket],
    );
  }

  private async recordFailure(
    client: PoolClient,
    accountBucket: string,
    sourceBucket: string,
    lockoutDurationSeconds: number,
  ) {
    let locked = false;
    for (const [bucketType, key] of [
      ["ACCOUNT", accountBucket],
      ["SOURCE", sourceBucket],
    ] as const) {
      const result = await client.query<{ locked_until: Date | null }>(
        `insert into public.local_auth_throttle
           (bucket_type, bucket_key, failure_count, locked_until)
         values ($1, $2, 1, null)
         on conflict (bucket_type, bucket_key) do update set
           failure_count = least(100, case
             when public.local_auth_throttle.updated_at < clock_timestamp() - interval '15 minutes'
               then 1
             else public.local_auth_throttle.failure_count + 1
           end),
           locked_until = case
             when public.local_auth_throttle.locked_until > clock_timestamp()
               then public.local_auth_throttle.locked_until
             when (case
               when public.local_auth_throttle.updated_at < clock_timestamp() - interval '15 minutes'
                 then 1
               else public.local_auth_throttle.failure_count + 1
             end) >= 5
               then clock_timestamp() + ($3 * interval '1 second')
             else public.local_auth_throttle.locked_until
           end,
           updated_at = clock_timestamp()
         returning locked_until`,
        [bucketType, key, lockoutDurationSeconds],
      );
      if (result.rows[0]?.locked_until) locked = true;
    }
    return locked;
  }
}
