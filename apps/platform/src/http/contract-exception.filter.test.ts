import assert from "node:assert/strict";
import test from "node:test";

import {
  ContractValidationException,
  mapHttpError,
} from "./contract-exception.filter.js";

test("validation errors expose only controlled field details", () => {
  const mapped = mapHttpError(
    new ContractValidationException([
      { field: "name", message: "Name is required" },
    ]),
    "request-1",
  );

  assert.equal(mapped.status, 400);
  assert.deepEqual(mapped.body, {
    contractVersion: "v1",
    error: {
      code: "PLATFORM_VALIDATION_FAILED",
      message: "Request validation failed",
      requestId: "request-1",
      retryable: false,
      fieldErrors: [{ field: "name", message: "Invalid value" }],
    },
  });
});

test("validation errors are bounded and do not expose supplied values", () => {
  const mapped = mapHttpError(
    new ContractValidationException(
      Array.from({ length: 40 }, (_, index) => ({
        field: index === 0 ? "x".repeat(200) : `items[${index}].value`,
        message: `password=secret-${index}`,
      })),
    ),
    "request-3",
  );
  const fieldErrors = mapped.body.error.fieldErrors ?? [];

  assert.equal(fieldErrors.length, 32);
  assert.deepEqual(fieldErrors[0], {
    field: "request",
    message: "Invalid value",
  });
  assert.doesNotMatch(JSON.stringify(mapped.body), /password|secret/);
});

test("unhandled errors never expose internal messages", () => {
  const mapped = mapHttpError(
    new Error("password=secret; SELECT * FROM users"),
    "request-2",
  );
  const serialized = JSON.stringify(mapped.body);

  assert.equal(mapped.status, 500);
  assert.equal(mapped.body.error.code, "PLATFORM_INTERNAL_ERROR");
  assert.equal(mapped.body.error.message, "An internal error occurred");
  assert.doesNotMatch(serialized, /secret|SELECT|users/);
});
