import assert from "node:assert/strict";
import test from "node:test";

import {
  RECOVERY_CODE_POLICY,
  hashRecoveryCode,
  newRecoveryCode,
  validRecoveryCode,
  verifyRecoveryCode,
} from "../../../apps/platform/dist/modules/identity-access/public.js";

test("recovery codes are random, bounded, and slow-hashed", async () => {
  const codes = Array.from(
    { length: RECOVERY_CODE_POLICY.count },
    newRecoveryCode,
  );
  assert.equal(new Set(codes).size, RECOVERY_CODE_POLICY.count);
  assert.equal(codes.every(validRecoveryCode), true);
  const firstHash = await hashRecoveryCode(codes[0]);
  const secondHash = await hashRecoveryCode(codes[0]);
  assert.match(firstHash, /^\$argon2id\$/u);
  assert.notEqual(firstHash, secondHash);
  assert.equal(firstHash.includes(codes[0]), false);
  assert.equal(await verifyRecoveryCode(firstHash, codes[0]), true);
  assert.equal(await verifyRecoveryCode(firstHash, newRecoveryCode()), false);
});

test("malformed recovery material fails without echoing it", async () => {
  const malformed = "not-a-recovery-code";
  assert.equal(validRecoveryCode(malformed), false);
  assert.equal(await verifyRecoveryCode("damaged", malformed), false);
  assert.throws(() => hashRecoveryCode(malformed), {
    message: "Recovery failed",
  });
});
