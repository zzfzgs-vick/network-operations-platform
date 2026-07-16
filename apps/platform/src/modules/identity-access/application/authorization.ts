export const PERMISSION_CODES = [
  "users.read",
  "users.manage",
  "roles.manage",
  "sessions.revoke",
  "assets.read",
  "assets.manage",
  "credentials.manage",
  "topology.read",
  "topology.manage",
  "topology.confirm",
  "observations.read",
  "observations.reprobe",
  "alerts.read",
  "alerts.acknowledge",
  "alerts.configure",
  "incidents.manage",
  "audit.read",
  "dashboard.executive.read",
  "system.configure",
  "authentication.manage",
  "sessions.manage",
  "backup.manage",
  "restore.execute",
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

export const SENSITIVE_PERMISSION_CODES = new Set<PermissionCode>([
  "users.manage",
  "roles.manage",
  "credentials.manage",
  "system.configure",
  "authentication.manage",
  "sessions.manage",
  "backup.manage",
  "restore.execute",
]);

export interface AuthenticatedUserPrincipal {
  readonly kind: "platform-user";
  readonly userId: string;
  readonly authorizationVersion: number;
}

export interface AuthorizationContext {
  readonly requestId?: string;
  readonly correlationId?: string;
}

export interface RoleSummary {
  readonly roleId: string;
  readonly roleKey: string | null;
  readonly name: string;
  readonly permissions: readonly PermissionCode[];
}

export interface UserAuthorizer {
  authorize(
    principal: AuthenticatedUserPrincipal | undefined,
    permission: PermissionCode | undefined,
    context?: AuthorizationContext,
  ): Promise<boolean>;
}

export const USER_AUTHORIZER = Symbol("user-authorizer");

export class AuthorizationDeniedError extends Error {
  constructor() {
    super("Access is forbidden");
    this.name = "AuthorizationDeniedError";
  }
}

export class AuthorizationMetrics {
  private readonly counts = new Map<string, number>();

  record(
    permission: PermissionCode | "undeclared",
    outcome: "allowed" | "denied",
  ) {
    const key = `${permission}:${outcome}`;
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }

  snapshot() {
    return [...this.counts.entries()].map(([key, count]) => {
      const separator = key.lastIndexOf(":");
      return {
        permission: key.slice(0, separator) as PermissionCode | "undeclared",
        outcome: key.slice(separator + 1) as "allowed" | "denied",
        count,
      } as const;
    });
  }
}
