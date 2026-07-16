import assert from "node:assert/strict";
import test from "node:test";

import {
  ARGON2ID_PARAMETERS,
  PASSWORD_POLICY,
  hashPassword,
  validatePassword,
  verifyPassword,
} from "../../../apps/platform/dist/modules/identity-access/public.js";

const acceptedPassword = "correct horse battery staple";

test("new hashes use the fixed Argon2id security baseline and independent salts", async () => {
  const first = await hashPassword(acceptedPassword);
  const second = await hashPassword(acceptedPassword);

  assert.match(
    first,
    /^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/u,
  );
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(first, acceptedPassword), true);
  assert.equal(await verifyPassword(first, "incorrect password value"), false);
  assert.equal(first.includes(acceptedPassword), false);
  assert.deepEqual(ARGON2ID_PARAMETERS, {
    type: "argon2id",
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
    hashLength: 32,
  });
});

test("password policy rejects weak, empty, whitespace, username-derived and short values", () => {
  const rejected = [
    "",
    "              ",
    "short-value",
    "password1234",
    "administrator",
    "123456789012",
    "qwertyuiop12",
    "Alice-secure-looking-password",
  ];

  for (const password of rejected) {
    assert.throws(
      () => validatePassword(password, { username: "Alice" }),
      (error) => {
        if (password.length > 0) {
          assert.equal(error.message.includes(password), false);
        }
        return true;
      },
    );
  }

  assert.throws(
    () =>
      validatePassword("xxＦirst.Adminxx", {
        username: "first.admin",
      }),
    /username/u,
  );
});

test("password policy accepts Unicode without normalizing or truncating it", async () => {
  const composed = "Caf\u00e9-very-long-passphrase";
  const decomposed = "Cafe\u0301-very-long-passphrase";

  assert.doesNotThrow(() => validatePassword(composed));
  assert.doesNotThrow(() => validatePassword(decomposed));
  const hash = await hashPassword(composed);
  assert.equal(await verifyPassword(hash, composed), true);
  assert.equal(await verifyPassword(hash, decomposed), false);
});

test("oversized input is rejected by the cheap policy boundary", async () => {
  const oversized = "x".repeat(PASSWORD_POLICY.maximumBytes + 1);
  assert.throws(() => validatePassword(oversized), /maximum byte length/u);
  await assert.rejects(hashPassword(oversized), /maximum byte length/u);
});

test("damaged or non-Argon2id PHC strings fail closed", async () => {
  const hash = await hashPassword(acceptedPassword);
  const nonArgon2id = hash.replace("$argon2id$", "$argon2i$");

  assert.equal(
    await verifyPassword("not-a-phc-string", acceptedPassword),
    false,
  );
  assert.equal(await verifyPassword(nonArgon2id, acceptedPassword), false);
  assert.equal(await verifyPassword(`${hash}damaged`, acceptedPassword), false);
});

test("password APIs return only PHC or boolean values and errors stay generic", async () => {
  const protectedValue = "t011-protected-password-not-for-output";
  let caught;
  try {
    await hashPassword(protectedValue, { username: protectedValue });
  } catch (error) {
    caught = error;
  }

  assert.ok(caught instanceof Error);
  assert.equal(caught.message.includes(protectedValue), false);
  assert.deepEqual(Object.keys(PASSWORD_POLICY).sort(), [
    "maximumBytes",
    "minimumCharacters",
  ]);
});
