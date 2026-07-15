import assert from "node:assert/strict";
import test from "node:test";

import {
  AUDIT_REDACTED,
  sanitizeAuditDetails,
} from "../../../apps/platform/dist/modules/audit/public.js";

function containsAny(value, protectedValues) {
  const serialized = JSON.stringify(value);
  return protectedValues.some((protectedValue) =>
    serialized.includes(protectedValue),
  );
}

test("nested, mixed-case, and array secrets are deterministically redacted", () => {
  const protectedValues = Array.from(
    { length: 14 },
    (_, index) => `t010-protected-${index}-not-for-output`,
  );
  const input = {
    reasonCategory: "credential-rotation",
    metadata: {
      PASSWORD: protectedValues[0],
      serviceToken: protectedValues[1],
      Authorization: protectedValues[2],
      cookie: protectedValues[3],
      session_token: protectedValues[4],
      secretFileContent: protectedValues[5],
      databasePassword: protectedValues[6],
      totpSecret: protectedValues[7],
      snmpCommunity: protectedValues[8],
      snmpv3AuthSecret: protectedValues[9],
      snmpv3PrivacySecret: protectedValues[10],
      privateKey: protectedValues[11],
      connectionString: protectedValues[12],
      items: [{ ToKeN: protectedValues[13], safeCode: "ROTATED" }],
    },
  };

  const first = sanitizeAuditDetails(input);
  const second = sanitizeAuditDetails(input);
  assert.equal(
    containsAny(first.details, protectedValues),
    false,
    "sanitized details contain protected material",
  );
  assert.deepEqual(first, second);
  assert.equal(first.details.reasonCategory, "credential-rotation");
  assert.equal(first.details.metadata.PASSWORD, AUDIT_REDACTED);
  assert.equal(first.details.metadata.items[0].safeCode, "ROTATED");
  assert.equal(first.redactedFieldCount, 14);
});

test("raw request, environment, headers, and payload containers are rejected as detail", () => {
  const protectedValues = [
    "t010-environment-protected",
    "t010-header-protected",
    "t010-payload-protected",
    "t010-request-protected",
  ];
  const result = sanitizeAuditDetails({
    changedFields: ["displayName"],
    metadata: {
      environment: { DATABASE_PASSWORD: protectedValues[0] },
      headers: { authorization: protectedValues[1] },
      requestPayload: { value: protectedValues[2] },
      rawRequest: { value: protectedValues[3] },
    },
  });
  assert.equal(
    containsAny(result.details, protectedValues),
    false,
    "unsafe request containers entered audit details",
  );
  assert.deepEqual(result.details.changedFields, ["displayName"]);
  assert.equal(result.details.metadata.environment, AUDIT_REDACTED);
  assert.equal(result.details.metadata.headers, AUDIT_REDACTED);
  assert.equal(result.details.metadata.rawRequest, AUDIT_REDACTED);
  assert.equal(result.details.metadata.requestPayload, AUDIT_REDACTED);
});

test("credential-shaped strings are redacted even under a safe field name", () => {
  const protectedValues = [
    "Bearer t010-bearer-protected",
    "postgresql://user:t010-db-protected@db/name",
    "-----BEGIN PRIVATE KEY-----t010-key-protected",
    "token=t010-token-protected",
  ];
  const result = sanitizeAuditDetails({
    reasonCategory: "controlled-safe-summary",
    metadata: { values: protectedValues },
  });
  assert.equal(
    containsAny(result.details, protectedValues),
    false,
    "credential-shaped content entered audit details",
  );
  assert.deepEqual(
    result.details.metadata.values,
    protectedValues.map(() => AUDIT_REDACTED),
  );
  assert.equal(result.details.reasonCategory, "controlled-safe-summary");
});

test("depth, array, field-count, string, and total-size limits fail safely", () => {
  const protectedValue = "t010-limit-protected-not-for-output";
  const cases = [
    { metadata: { a: { b: { c: { d: { e: protectedValue } } } } } },
    { metadata: { items: Array.from({ length: 17 }, () => "safe") } },
    {
      metadata: Object.fromEntries(
        Array.from({ length: 33 }, (_, index) => [`field${index}`, "safe"]),
      ),
    },
    { metadata: { note: protectedValue.repeat(20) } },
    {
      metadata: Object.fromEntries(
        Array.from({ length: 32 }, (_, index) => [
          `field${index}`,
          "x".repeat(256),
        ]),
      ),
    },
  ];

  for (const value of cases) {
    let caught;
    try {
      sanitizeAuditDetails(value);
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof Error, "unsafe audit details were accepted");
    assert.equal(
      caught.message.includes(protectedValue),
      false,
      "validation error exposed protected material",
    );
  }
});

test("unsupported objects and invalid field names fail without serializing input", () => {
  const protectedValue = "t010-object-protected-not-for-output";
  const cases = [
    { unexpected: "safe-but-not-allowlisted" },
    { metadata: { invalid: new Date() } },
    { metadata: { "invalid field": protectedValue } },
    { metadata: { invalid: undefined } },
  ];
  for (const value of cases) {
    assert.throws(
      () => sanitizeAuditDetails(value),
      (error) => {
        assert.equal(error.message.includes(protectedValue), false);
        return true;
      },
    );
  }
});
