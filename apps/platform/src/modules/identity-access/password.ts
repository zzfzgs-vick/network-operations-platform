import { randomBytes } from "node:crypto";

import argon2 from "argon2";

export const PASSWORD_POLICY = Object.freeze({
  minimumCharacters: 12,
  maximumBytes: 1024,
});

export const ARGON2ID_PARAMETERS = Object.freeze({
  type: "argon2id" as const,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
});

const weakPasswords = new Set([
  "111111111111",
  "123456789012",
  "adminadmin123",
  "administrator",
  "changeme1234",
  "letmeinletmein",
  "password1234",
  "qwerty123456",
  "qwertyuiop12",
  "welcome12345",
]);
const argon2idPhcPattern =
  /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/u;

export interface PasswordContext {
  readonly username?: string;
}

export function validatePassword(
  password: string,
  context: PasswordContext = {},
): void {
  if (typeof password !== "string") {
    throw new Error("Password must be text");
  }
  if (Buffer.byteLength(password, "utf8") > PASSWORD_POLICY.maximumBytes) {
    throw new Error("Password exceeds the maximum byte length");
  }
  if (Array.from(password).length < PASSWORD_POLICY.minimumCharacters) {
    throw new Error("Password does not meet the minimum length");
  }
  if (password.trim().length === 0) {
    throw new Error("Password must not be blank");
  }

  const comparable = password.normalize("NFKC").toLocaleLowerCase("en-US");
  if (weakPasswords.has(comparable)) {
    throw new Error("Password is too weak");
  }
  const username = context.username
    ?.trim()
    .normalize("NFKC")
    .toLocaleLowerCase("en-US");
  if (username && username.length >= 3 && comparable.includes(username)) {
    throw new Error("Password must not contain the username");
  }
}

export async function hashPassword(
  password: string,
  context: PasswordContext = {},
): Promise<string> {
  validatePassword(password, context);
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: ARGON2ID_PARAMETERS.memoryCost,
    timeCost: ARGON2ID_PARAMETERS.timeCost,
    parallelism: ARGON2ID_PARAMETERS.parallelism,
    hashLength: ARGON2ID_PARAMETERS.hashLength,
    salt: randomBytes(16),
  });
}

function acceptableStoredHash(passwordHash: string): boolean {
  const match = argon2idPhcPattern.exec(passwordHash);
  if (!match) return false;
  const memoryCost = Number(match[1]);
  const timeCost = Number(match[2]);
  const parallelism = Number(match[3]);
  return (
    memoryCost >= 8192 &&
    memoryCost <= 65_536 &&
    timeCost >= 1 &&
    timeCost <= 5 &&
    parallelism >= 1 &&
    parallelism <= 4
  );
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  if (
    typeof password !== "string" ||
    Buffer.byteLength(password, "utf8") > PASSWORD_POLICY.maximumBytes ||
    !acceptableStoredHash(passwordHash)
  ) {
    return false;
  }
  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
}
