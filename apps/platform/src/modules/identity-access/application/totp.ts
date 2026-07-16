import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { Secret, TOTP } from "otpauth";

import type { TotpConfig } from "../../../config/public.js";

export const TOTP_POLICY = Object.freeze({
  algorithm: "SHA1",
  digits: 6,
  period: 30,
  window: 1,
} as const);

export function createTotp(secret: string, timestamp = Date.now()) {
  return TOTP.generate({
    secret: Secret.fromBase32(secret),
    algorithm: TOTP_POLICY.algorithm,
    digits: TOTP_POLICY.digits,
    period: TOTP_POLICY.period,
    timestamp,
  });
}

export function validateTotp(
  secret: string,
  token: string,
  timestamp = Date.now(),
) {
  if (!/^\d{6}$/u.test(token)) return null;
  return TOTP.validate({
    secret: Secret.fromBase32(secret),
    token,
    algorithm: TOTP_POLICY.algorithm,
    digits: TOTP_POLICY.digits,
    period: TOTP_POLICY.period,
    timestamp,
    window: TOTP_POLICY.window,
  });
}

export function totpStep(timestamp = Date.now()) {
  return TOTP.counter({ period: TOTP_POLICY.period, timestamp });
}

export function newTotpSecret() {
  return new Secret({ size: 20 }).base32;
}

export function totpUri(secret: string, account: string) {
  return new TOTP({
    issuer: "Network Operations Platform",
    label: account,
    secret: Secret.fromBase32(secret),
    algorithm: TOTP_POLICY.algorithm,
    digits: TOTP_POLICY.digits,
    period: TOTP_POLICY.period,
  }).toString();
}

export interface EncryptedTotpSecret {
  readonly ciphertext: Buffer;
  readonly nonce: Buffer;
  readonly tag: Buffer;
  readonly keyVersion: string;
}

function encryptionKey(config: TotpConfig) {
  return Buffer.from(config.encryptionKey.reveal(), "base64url");
}

export function encryptTotpSecret(
  secret: string,
  binding: string,
  config: TotpConfig,
): EncryptedTotpSecret {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(config), nonce);
  cipher.setAAD(Buffer.from(binding, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext,
    nonce,
    tag: cipher.getAuthTag(),
    keyVersion: config.keyVersion,
  };
}

export function decryptTotpSecret(
  encrypted: EncryptedTotpSecret,
  binding: string,
  config: TotpConfig,
) {
  if (encrypted.keyVersion !== config.keyVersion) {
    throw new Error("TOTP encryption key version is unavailable");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(config),
    encrypted.nonce,
  );
  decipher.setAAD(Buffer.from(binding, "utf8"));
  decipher.setAuthTag(encrypted.tag);
  return Buffer.concat([
    decipher.update(encrypted.ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

export class TotpRejectedError extends Error {
  constructor(
    readonly reason:
      | "invalid"
      | "replay"
      | "throttled"
      | "enrollment-required"
      | "challenge-expired" = "invalid",
  ) {
    super("Authentication failed");
    this.name = "TotpRejectedError";
  }
}

export class TotpMetrics {
  private readonly counts = new Map<string, number>();

  record(
    event: "enrollment" | "verification",
    outcome:
      | "success"
      | "started"
      | "invalid"
      | "replay"
      | "throttled"
      | "expired"
      | "clock-skew",
  ) {
    const key = `${event}:${outcome}`;
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }

  snapshot() {
    return [...this.counts].map(([key, count]) => {
      const [event, outcome] = key.split(":", 2) as [string, string];
      return { event, outcome, count } as const;
    });
  }
}
