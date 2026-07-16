import type { AuthenticatedUserPrincipal } from "./authorization.js";

export type WebSessionType = "PRE_AUTH" | "AUTHENTICATED";
export type SessionRevocationReason =
  | "LOGOUT"
  | "ROTATED"
  | "USER_DISABLED"
  | "PASSWORD_CHANGED"
  | "AUTHORIZATION_CHANGED"
  | "IDLE_EXPIRED"
  | "ABSOLUTE_EXPIRED"
  | "RECOVERY_INVALIDATION"
  | "GENERATION_MISMATCH";

export interface IssuedWebSession {
  readonly sessionId: string;
  readonly type: WebSessionType;
  readonly token: string;
  readonly csrfToken: string;
  readonly expiresAt: string;
  readonly nextStep?: "PASSWORD_CHANGE" | "MFA_ENROLLMENT" | "MFA_VERIFY";
  readonly recoveryCodes?: readonly string[];
}

export class CsrfMetrics {
  private readonly counts = new Map<string, number>();

  record(
    reason:
      | "missing-origin"
      | "origin-mismatch"
      | "missing-confirmation"
      | "missing-token"
      | "invalid-token",
  ) {
    this.counts.set(reason, (this.counts.get(reason) ?? 0) + 1);
  }

  snapshot() {
    return [...this.counts].map(([reason, count]) => ({ reason, count }));
  }
}

export interface ValidatedWebSession {
  readonly sessionId: string;
  readonly type: WebSessionType;
  readonly principal?: AuthenticatedUserPrincipal;
  readonly expiresAt: string;
}

export class SessionRejectedError extends Error {
  constructor(
    readonly reason:
      | "unauthenticated"
      | "idle-expired"
      | "absolute-expired"
      | "revoked"
      | "authorization-changed"
      | "credential-changed"
      | "mfa-required" = "unauthenticated",
  ) {
    super("Authentication failed");
    this.name = "SessionRejectedError";
  }
}

export class SessionMetrics {
  private readonly counts = new Map<string, number>();

  record(
    event:
      | "created"
      | "validated"
      | "rotated"
      | "expired"
      | "revoked"
      | "version-mismatch"
      | "rejected",
    reason:
      | "authenticated"
      | "pre-auth"
      | "idle"
      | "absolute"
      | "authorization"
      | "credential"
      | "explicit"
      | "recovery"
      | "invalid",
    amount = 1,
  ) {
    const key = `${event}:${reason}`;
    this.counts.set(key, (this.counts.get(key) ?? 0) + amount);
  }

  snapshot() {
    return [...this.counts.entries()].map(([key, count]) => {
      const [event, reason] = key.split(":", 2) as [string, string];
      return { event, reason, count } as const;
    });
  }
}
