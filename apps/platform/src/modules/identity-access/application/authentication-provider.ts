export type PlatformUserStatus = "ENABLED" | "DISABLED";

export interface PlatformUser {
  readonly userId: string;
  readonly username: string;
  readonly status: PlatformUserStatus;
  readonly mustChangePassword: boolean;
  readonly credentialVersion: number;
  readonly authorizationVersion: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type AuthenticationResult = PlatformUser;

export interface AuthenticationProvider {
  authenticate(input: {
    readonly username: string;
    readonly password: string;
    readonly source: string;
    readonly clientSummary?: string;
    readonly requestId?: string;
  }): Promise<AuthenticationResult>;
}

export class BootstrapClosedError extends Error {
  constructor() {
    super("Administrator bootstrap is already complete");
    this.name = "BootstrapClosedError";
  }
}

export class AuthenticationRejectedError extends Error {
  constructor() {
    super("Authentication failed");
    this.name = "AuthenticationRejectedError";
  }
}
