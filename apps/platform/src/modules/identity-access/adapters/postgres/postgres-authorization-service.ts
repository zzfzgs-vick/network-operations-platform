import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import { withTransaction } from "../../../../database/database.js";
import type { AuditEventInput } from "../../../audit/public.js";
import {
  AuthorizationDeniedError,
  AuthorizationMetrics,
  PERMISSION_CODES,
  SENSITIVE_PERMISSION_CODES,
  type AuthorizationContext,
  type AuthenticatedUserPrincipal,
  type PermissionCode,
  type RoleSummary,
  type UserAuthorizer,
} from "../../application/authorization.js";
import { revokeUserSessions } from "./postgres-session-service.js";

interface AuditAppender {
  append(client: PoolClient, input: AuditEventInput): Promise<unknown>;
}

type DecisionReason =
  | "allowed"
  | "disabled"
  | "permission-not-declared"
  | "permission-not-granted"
  | "principal-missing"
  | "user-not-found"
  | "version-mismatch";

interface Decision {
  readonly allowed: boolean;
  readonly reason: DecisionReason;
  readonly sensitive: boolean;
}

const permissionSet = new Set<string>(PERMISSION_CODES);

function normalizeRoleName(name: string) {
  const display = name.trim();
  const normalized = display.normalize("NFKC").toLocaleLowerCase("en-US");
  if (
    Array.from(display).length < 3 ||
    Array.from(display).length > 64 ||
    !/^[\p{L}\p{N}][\p{L}\p{N} ._-]{2,63}$/u.test(normalized)
  ) {
    throw new Error("Role name must be a bounded display name");
  }
  return { display, normalized } as const;
}

function assertPermissionCodes(
  permissions: readonly PermissionCode[],
): readonly PermissionCode[] {
  const unique = [...new Set(permissions)];
  if (
    unique.length !== permissions.length ||
    unique.some((permission) => !permissionSet.has(permission))
  ) {
    throw new Error("Role permissions must use unique stable Permission codes");
  }
  return unique.sort();
}

function version(value: string | number) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("Authorization version is invalid");
  }
  return parsed;
}

export class PostgresAuthorizationService implements UserAuthorizer {
  constructor(
    private readonly poolSource: Pool | (() => Pool),
    private readonly audit: AuditAppender,
    readonly metrics = new AuthorizationMetrics(),
  ) {}

  private get pool() {
    return typeof this.poolSource === "function"
      ? this.poolSource()
      : this.poolSource;
  }

  async authorize(
    principal: AuthenticatedUserPrincipal | undefined,
    permission: PermissionCode | undefined,
    context: AuthorizationContext = {},
  ) {
    return withTransaction(this.pool, async (client) => {
      const decision = await this.decision(client, principal, permission);
      await this.recordDecision(
        client,
        principal,
        permission,
        context,
        decision,
      );
      return decision.allowed;
    });
  }

  async getAuthorizationState(userId: string) {
    const user = await this.pool.query<{
      status: "ENABLED" | "DISABLED";
      authorization_version: string;
    }>(
      "select status, authorization_version from public.platform_users where user_id = $1",
      [userId],
    );
    const row = user.rows[0];
    if (!row) throw new Error("Platform user not found");
    const permissions = await this.pool.query<{
      permission_code: PermissionCode;
    }>(
      `select distinct rp.permission_code
         from public.user_role_assignments ura
         join public.role_permissions rp on rp.role_id = ura.role_id
        where ura.user_id = $1
        order by rp.permission_code`,
      [userId],
    );
    return {
      userId,
      status: row.status,
      authorizationVersion: version(row.authorization_version),
      permissions: permissions.rows.map((item) => item.permission_code),
    } as const;
  }

  async listDefaultRoles(): Promise<readonly RoleSummary[]> {
    const result = await this.pool.query<{
      role_id: string;
      role_key: string;
      name: string;
      permissions: PermissionCode[];
    }>(
      `select r.role_id, r.role_key, r.name,
              coalesce(array_agg(rp.permission_code order by rp.permission_code)
                filter (where rp.permission_code is not null), '{}') as permissions
         from public.roles r
         left join public.role_permissions rp on rp.role_id = r.role_id
        where r.system_template
        group by r.role_id
        order by r.role_key`,
    );
    return result.rows.map((row) => ({
      roleId: row.role_id,
      roleKey: row.role_key,
      name: row.name,
      permissions: row.permissions,
    }));
  }

  createRole(input: {
    readonly actor: AuthenticatedUserPrincipal;
    readonly name: string;
    readonly permissions: readonly PermissionCode[];
    readonly context?: AuthorizationContext;
  }) {
    const name = normalizeRoleName(input.name);
    const permissions = assertPermissionCodes(input.permissions);
    const roleId = randomUUID();
    return this.authorizedMutation(
      input.actor,
      input.context,
      async (client) => {
        await client.query(
          `insert into public.roles
           (role_id, name, name_normalized, system_template)
         values ($1, $2, $3, false)`,
          [roleId, name.display, name.normalized],
        );
        await this.replacePermissions(client, roleId, permissions);
        await this.appendChange(client, input.actor, input.context, {
          eventType: "AUTHORIZATION.ROLE_CREATED",
          resourceType: "role",
          resourceId: roleId,
          changedFields: ["name", "permissions"],
          metadata: { permissionCount: permissions.length },
        });
        return this.readRole(client, roleId);
      },
    );
  }

  renameRole(input: {
    readonly actor: AuthenticatedUserPrincipal;
    readonly roleId: string;
    readonly name: string;
    readonly context?: AuthorizationContext;
  }) {
    const name = normalizeRoleName(input.name);
    return this.authorizedMutation(
      input.actor,
      input.context,
      async (client) => {
        const changed = await client.query(
          `update public.roles
            set name = $2, name_normalized = $3, updated_at = clock_timestamp()
          where role_id = $1`,
          [input.roleId, name.display, name.normalized],
        );
        if (changed.rowCount !== 1) throw new Error("Role not found");
        await this.appendChange(client, input.actor, input.context, {
          eventType: "AUTHORIZATION.ROLE_RENAMED",
          resourceType: "role",
          resourceId: input.roleId,
          changedFields: ["name"],
        });
        return this.readRole(client, input.roleId);
      },
    );
  }

  setRolePermissions(input: {
    readonly actor: AuthenticatedUserPrincipal;
    readonly roleId: string;
    readonly permissions: readonly PermissionCode[];
    readonly context?: AuthorizationContext;
  }) {
    const permissions = assertPermissionCodes(input.permissions);
    return this.authorizedMutation(
      input.actor,
      input.context,
      async (client) => {
        await this.lockRole(client, input.roleId);
        const current = await this.readRole(client, input.roleId);
        if (
          current.permissions.length === permissions.length &&
          current.permissions.every(
            (item, index) => item === permissions[index],
          )
        ) {
          return current;
        }
        await this.replacePermissions(client, input.roleId, permissions);
        await this.refreshAssignedUserMfaStates(client, input.roleId);
        const revokedSessions = await this.incrementAssignedUserVersions(
          client,
          input.roleId,
        );
        if (revokedSessions > 0) {
          await this.audit.append(client, {
            actor: { type: "USER", id: input.actor.userId },
            eventType: "SESSION.ROLE_PERMISSION_CHANGE_REVOKED",
            source: "web-session",
            outcome: "SUCCESS",
            resource: { type: "role", id: input.roleId },
            ...(input.context?.requestId === undefined
              ? {}
              : { requestId: input.context.requestId }),
            details: {
              reasonCategory: "authorization-changed",
              metadata: { revokedCount: revokedSessions },
            },
          });
        }
        await this.appendChange(client, input.actor, input.context, {
          eventType: "AUTHORIZATION.ROLE_PERMISSIONS_CHANGED",
          resourceType: "role",
          resourceId: input.roleId,
          changedFields: ["permissions"],
          metadata: { permissionCount: permissions.length },
        });
        return this.readRole(client, input.roleId);
      },
    );
  }

  assignRole(input: {
    readonly actor: AuthenticatedUserPrincipal;
    readonly userId: string;
    readonly roleId: string;
    readonly context?: AuthorizationContext;
  }) {
    return this.authorizedMutation(
      input.actor,
      input.context,
      async (client) => {
        const inserted = await client.query(
          `insert into public.user_role_assignments
           (user_id, role_id, assigned_by_user_id)
         values ($1, $2, $3)
         on conflict do nothing`,
          [input.userId, input.roleId, input.actor.userId],
        );
        if (inserted.rowCount === 1) {
          await this.refreshUserMfaState(client, input.userId);
          await this.incrementUserVersion(client, input.userId);
          await revokeUserSessions(client, this.audit, {
            userId: input.userId,
            reason: "AUTHORIZATION_CHANGED",
            ...(input.context?.requestId === undefined
              ? {}
              : { requestId: input.context.requestId }),
            actor: { type: "USER", id: input.actor.userId },
          });
          await this.appendChange(client, input.actor, input.context, {
            eventType: "AUTHORIZATION.ROLE_ASSIGNED",
            resourceType: "platform-user",
            resourceId: input.userId,
            changedFields: ["roles", "authorizationVersion"],
            metadata: { roleId: input.roleId },
          });
        }
        return inserted.rowCount === 1;
      },
    );
  }

  removeRole(input: {
    readonly actor: AuthenticatedUserPrincipal;
    readonly userId: string;
    readonly roleId: string;
    readonly context?: AuthorizationContext;
  }) {
    return this.authorizedMutation(
      input.actor,
      input.context,
      async (client) => {
        const removed = await client.query(
          "delete from public.user_role_assignments where user_id = $1 and role_id = $2",
          [input.userId, input.roleId],
        );
        if (removed.rowCount === 1) {
          await this.refreshUserMfaState(client, input.userId);
          await this.incrementUserVersion(client, input.userId);
          await revokeUserSessions(client, this.audit, {
            userId: input.userId,
            reason: "AUTHORIZATION_CHANGED",
            ...(input.context?.requestId === undefined
              ? {}
              : { requestId: input.context.requestId }),
            actor: { type: "USER", id: input.actor.userId },
          });
          await this.appendChange(client, input.actor, input.context, {
            eventType: "AUTHORIZATION.ROLE_REMOVED",
            resourceType: "platform-user",
            resourceId: input.userId,
            changedFields: ["roles", "authorizationVersion"],
            metadata: { roleId: input.roleId },
          });
        }
        return removed.rowCount === 1;
      },
    );
  }

  private async authorizedMutation<T>(
    actor: AuthenticatedUserPrincipal,
    context: AuthorizationContext | undefined,
    mutation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const outcome = await withTransaction(this.pool, async (client) => {
      const decision = await this.decision(client, actor, "roles.manage", true);
      await this.recordDecision(
        client,
        actor,
        "roles.manage",
        context ?? {},
        decision,
      );
      if (!decision.allowed) return { allowed: false } as const;
      return { allowed: true, value: await mutation(client) } as const;
    });
    if (!outcome.allowed) throw new AuthorizationDeniedError();
    return outcome.value;
  }

  private async decision(
    client: PoolClient,
    principal: AuthenticatedUserPrincipal | undefined,
    permission: PermissionCode | undefined,
    lockUser = false,
  ): Promise<Decision> {
    if (!permission || !permissionSet.has(permission)) {
      return {
        allowed: false,
        reason: "permission-not-declared",
        sensitive: false,
      };
    }
    if (!principal || principal.kind !== "platform-user") {
      return { allowed: false, reason: "principal-missing", sensitive: false };
    }
    const user = await client.query<{
      status: "ENABLED" | "DISABLED";
      authorization_version: string;
    }>(
      `select status, authorization_version
         from public.platform_users
        where user_id = $1${lockUser ? " for update" : ""}`,
      [principal.userId],
    );
    const row = user.rows[0];
    if (!row)
      return { allowed: false, reason: "user-not-found", sensitive: false };
    if (row.status !== "ENABLED") {
      return { allowed: false, reason: "disabled", sensitive: false };
    }
    if (version(row.authorization_version) !== principal.authorizationVersion) {
      return { allowed: false, reason: "version-mismatch", sensitive: false };
    }
    const granted = await client.query<{ granted: boolean }>(
      `select exists (
         select 1
           from public.user_role_assignments ura
           join public.role_permissions rp on rp.role_id = ura.role_id
          where ura.user_id = $1 and rp.permission_code = $2
       ) as granted`,
      [principal.userId, permission],
    );
    if (!granted.rows[0]?.granted) {
      return {
        allowed: false,
        reason: "permission-not-granted",
        sensitive: false,
      };
    }
    return {
      allowed: true,
      reason: "allowed",
      sensitive: SENSITIVE_PERMISSION_CODES.has(permission),
    };
  }

  private async recordDecision(
    client: PoolClient,
    principal: AuthenticatedUserPrincipal | undefined,
    permission: PermissionCode | undefined,
    context: AuthorizationContext,
    decision: Decision,
  ) {
    const metricPermission =
      permission && permissionSet.has(permission) ? permission : "undeclared";
    const userPrincipal =
      principal?.kind === "platform-user" ? principal : undefined;
    this.metrics.record(
      metricPermission,
      decision.allowed ? "allowed" : "denied",
    );
    if (decision.allowed && !decision.sensitive) return;
    await this.audit.append(client, {
      actor: userPrincipal
        ? { type: "USER", id: userPrincipal.userId }
        : { type: "UNKNOWN" },
      eventType: decision.allowed
        ? "AUTHORIZATION.SENSITIVE_PERMISSION_ALLOWED"
        : "AUTHORIZATION.PERMISSION_DENIED",
      source: "authorization",
      outcome: decision.allowed ? "SUCCESS" : "DENIED",
      ...(decision.allowed ? {} : { failureCategory: "PERMISSION_DENIED" }),
      ...(context.requestId === undefined
        ? {}
        : { requestId: context.requestId }),
      ...(context.correlationId === undefined
        ? {}
        : { correlationId: context.correlationId }),
      details: {
        reasonCategory: decision.reason,
        metadata: { permission: metricPermission },
      },
    });
  }

  private async appendChange(
    client: PoolClient,
    actor: AuthenticatedUserPrincipal,
    context: AuthorizationContext | undefined,
    change: {
      readonly eventType: string;
      readonly resourceType: string;
      readonly resourceId: string;
      readonly changedFields: readonly string[];
      readonly metadata?: Record<string, string | number>;
    },
  ) {
    await this.audit.append(client, {
      actor: { type: "USER", id: actor.userId },
      eventType: change.eventType,
      source: "authorization",
      outcome: "SUCCESS",
      resource: { type: change.resourceType, id: change.resourceId },
      ...(context?.requestId === undefined
        ? {}
        : { requestId: context.requestId }),
      ...(context?.correlationId === undefined
        ? {}
        : { correlationId: context.correlationId }),
      details: {
        changedFields: change.changedFields,
        ...(change.metadata === undefined ? {} : { metadata: change.metadata }),
      },
    });
  }

  private async readRole(
    client: PoolClient,
    roleId: string,
  ): Promise<RoleSummary> {
    const result = await client.query<{
      role_id: string;
      role_key: string | null;
      name: string;
      permissions: PermissionCode[];
    }>(
      `select r.role_id, r.role_key, r.name,
              coalesce(array_agg(rp.permission_code order by rp.permission_code)
                filter (where rp.permission_code is not null), '{}') as permissions
         from public.roles r
         left join public.role_permissions rp on rp.role_id = r.role_id
        where r.role_id = $1
        group by r.role_id`,
      [roleId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Role not found");
    return {
      roleId: row.role_id,
      roleKey: row.role_key,
      name: row.name,
      permissions: row.permissions,
    };
  }

  private async lockRole(client: PoolClient, roleId: string) {
    const result = await client.query(
      "select role_id from public.roles where role_id = $1 for update",
      [roleId],
    );
    if (result.rowCount !== 1) throw new Error("Role not found");
  }

  private async replacePermissions(
    client: PoolClient,
    roleId: string,
    permissions: readonly PermissionCode[],
  ) {
    await client.query(
      "delete from public.role_permissions where role_id = $1",
      [roleId],
    );
    if (permissions.length) {
      await client.query(
        `insert into public.role_permissions (role_id, permission_code)
         select $1, unnest($2::varchar[])`,
        [roleId, permissions],
      );
    }
  }

  private async incrementAssignedUserVersions(
    client: PoolClient,
    roleId: string,
  ) {
    await client.query(
      `update public.platform_users u
          set authorization_version = authorization_version + 1,
              updated_at = clock_timestamp()
        where exists (
          select 1 from public.user_role_assignments ura
           where ura.role_id = $1 and ura.user_id = u.user_id
        )`,
      [roleId],
    );
    const revoked = await client.query(
      `update public.web_sessions s
          set revoked_at = clock_timestamp(),
              revocation_reason = 'AUTHORIZATION_CHANGED'
        where s.revoked_at is null and exists (
          select 1 from public.user_role_assignments ura
           where ura.role_id = $1 and ura.user_id = s.user_id
        )`,
      [roleId],
    );
    return revoked.rowCount ?? 0;
  }

  private refreshAssignedUserMfaStates(client: PoolClient, roleId: string) {
    return client.query(
      `update public.platform_users u
          set mfa_state = case
            when exists (
              select 1 from public.totp_authenticators a
               where a.user_id = u.user_id and a.status = 'ACTIVE'
            ) then 'ENROLLED'
            when exists (
              select 1
                from public.user_role_assignments ura
                join public.role_permissions rp on rp.role_id = ura.role_id
                join public.permissions p on p.permission_code = rp.permission_code
               where ura.user_id = u.user_id and p.sensitive
            ) then 'MFA_ENROLLMENT_REQUIRED'
            else 'NOT_REQUIRED'
          end,
          updated_at = clock_timestamp()
        where exists (
          select 1 from public.user_role_assignments ura
           where ura.role_id = $1 and ura.user_id = u.user_id
        )`,
      [roleId],
    );
  }

  private refreshUserMfaState(client: PoolClient, userId: string) {
    return client.query(
      `update public.platform_users u
          set mfa_state = case
            when exists (
              select 1 from public.totp_authenticators a
               where a.user_id = u.user_id and a.status = 'ACTIVE'
            ) then 'ENROLLED'
            when exists (
              select 1
                from public.user_role_assignments ura
                join public.role_permissions rp on rp.role_id = ura.role_id
                join public.permissions p on p.permission_code = rp.permission_code
               where ura.user_id = u.user_id and p.sensitive
            ) then 'MFA_ENROLLMENT_REQUIRED'
            else 'NOT_REQUIRED'
          end,
          updated_at = clock_timestamp()
        where u.user_id = $1`,
      [userId],
    );
  }

  private async incrementUserVersion(client: PoolClient, userId: string) {
    const updated = await client.query(
      `update public.platform_users
          set authorization_version = authorization_version + 1,
              updated_at = clock_timestamp()
        where user_id = $1`,
      [userId],
    );
    if (updated.rowCount !== 1) throw new Error("Platform user not found");
  }
}
