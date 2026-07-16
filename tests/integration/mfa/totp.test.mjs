import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import {
  TOTP_POLICY,
  createTotp,
  decryptTotpSecret,
  encryptTotpSecret,
  newTotpSecret,
  totpUri,
  validateTotp,
} from "../../../apps/platform/dist/modules/identity-access/application/totp.js";
import { readTotpConfig } from "../../../apps/platform/dist/config/public.js";

test("RFC 6238 TOTP policy", () => {
  assert.deepEqual(TOTP_POLICY, {
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    window: 1,
  });
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(createTotp(secret, 59_000), "287082");
  assert.equal(validateTotp(secret, "287082", 59_000), 0);
});

test("TOTP accepts only one adjacent step", () => {
  const secret = newTotpSecret();
  const token = createTotp(secret, 60_000);
  assert.equal(validateTotp(secret, token, 30_000), 1);
  assert.equal(validateTotp(secret, token, 60_000), 0);
  assert.equal(validateTotp(secret, token, 90_000), -1);
  assert.equal(validateTotp(secret, token, 120_000), null);
  assert.equal(validateTotp(secret, "not-a-code", 60_000), null);
});

test("TOTP secrets use authenticated encryption and bounded configuration", () => {
  const config = readTotpConfig({
    NODE_ENV: "test",
    TOTP_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    TOTP_ENCRYPTION_KEY_VERSION: "test-v1",
  });
  assert.equal(config.enrollmentTimeoutMs, 300_000);
  const secret = newTotpSecret();
  const encrypted = encryptTotpSecret(secret, "user:factor", config);
  assert.equal(encrypted.ciphertext.includes(Buffer.from(secret)), false);
  assert.equal(decryptTotpSecret(encrypted, "user:factor", config), secret);
  assert.throws(
    () => decryptTotpSecret(encrypted, "other:factor", config),
    /authenticate data/iu,
  );
  assert.doesNotMatch(totpUri(secret, "bounded-user"), /undefined|null/iu);
  assert.throws(
    () =>
      readTotpConfig({
        NODE_ENV: "test",
        TOTP_ENCRYPTION_KEY: "too-short",
      }),
    /32-byte Base64URL Secret/u,
  );
});
