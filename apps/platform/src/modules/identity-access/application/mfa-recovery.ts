import { randomBytes, randomUUID } from "node:crypto";

import argon2 from "argon2";
import type { PoolClient } from "pg";

import { ARGON2ID_PARAMETERS } from "../password.js";

export const RECOVERY_CODE_POLICY = Object.freeze({
  count: 10,
  lifetimeDays: 365,
  randomBytes: 15,
});

const recoveryCodePattern = /^[A-F0-9]{5}(?:-[A-F0-9]{5}){5}$/u;

export function newRecoveryCode() {
  return randomBytes(RECOVERY_CODE_POLICY.randomBytes)
    .toString("hex")
    .toUpperCase()
    .match(/.{5}/gu)!
    .join("-");
}

export function validRecoveryCode(value: string) {
  return recoveryCodePattern.test(value);
}

export function hashRecoveryCode(value: string) {
  if (!validRecoveryCode(value)) throw new Error("Recovery failed");
  return argon2.hash(value, {
    type: argon2.argon2id,
    memoryCost: ARGON2ID_PARAMETERS.memoryCost,
    timeCost: ARGON2ID_PARAMETERS.timeCost,
    parallelism: ARGON2ID_PARAMETERS.parallelism,
    hashLength: ARGON2ID_PARAMETERS.hashLength,
    salt: randomBytes(16),
  });
}

export async function verifyRecoveryCode(hash: string, value: string) {
  if (!validRecoveryCode(value) || !hash.startsWith("$argon2id$")) return false;
  try {
    return await argon2.verify(hash, value);
  } catch {
    return false;
  }
}

export async function replaceRecoveryCodeSet(
  client: PoolClient,
  userId: string,
) {
  const codes: string[] = [];
  const hashes: string[] = [];
  for (let index = 0; index < RECOVERY_CODE_POLICY.count; index += 1) {
    const code = newRecoveryCode();
    codes.push(code);
    hashes.push(await hashRecoveryCode(code));
  }
  const setId = randomUUID();
  await client.query(
    `update public.mfa_recovery_code_sets
        set invalidated_at = clock_timestamp()
      where user_id = $1 and invalidated_at is null`,
    [userId],
  );
  const inserted = await client.query<{ expires_at: Date }>(
    `insert into public.mfa_recovery_code_sets (set_id, user_id, expires_at)
     values ($1, $2, clock_timestamp() + ($3::integer * interval '1 day'))
     returning expires_at`,
    [setId, userId, RECOVERY_CODE_POLICY.lifetimeDays],
  );
  for (const hash of hashes) {
    await client.query(
      `insert into public.mfa_recovery_codes
         (code_id, set_id, code_hash, expires_at)
       values ($1, $2, $3, $4)`,
      [randomUUID(), setId, hash, inserted.rows[0]!.expires_at],
    );
  }
  return { codes, expiresAt: inserted.rows[0]!.expires_at.toISOString() };
}
