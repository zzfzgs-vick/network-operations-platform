import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const schemaPath = new URL(
  "../../packages/contracts/schemas/platform-contracts.schema.json",
  import.meta.url,
);
const generatedPath = new URL(
  "../../packages/contracts/generated/typescript/index.js",
  import.meta.url,
);
const repositoryRoot = new URL("../../", import.meta.url);

function resolveSchema(schema, definition) {
  if (definition.$ref) {
    const name = definition.$ref.replace("#/$defs/", "");
    return schema.$defs[name];
  }
  return definition;
}

function validates(schema, definition, value) {
  const resolved = resolveSchema(schema, definition);

  if (resolved.oneOf) {
    return resolved.oneOf.some((candidate) =>
      validates(schema, candidate, value),
    );
  }
  if (resolved.const !== undefined) return value === resolved.const;
  if (resolved.enum) return resolved.enum.includes(value);
  if (resolved.type === "boolean") return typeof value === "boolean";
  if (resolved.type === "string") {
    if (typeof value !== "string") return false;
    if (resolved.minLength !== undefined && value.length < resolved.minLength)
      return false;
    if (resolved.maxLength !== undefined && value.length > resolved.maxLength)
      return false;
    if (resolved.pattern && !new RegExp(resolved.pattern).test(value))
      return false;
    if (resolved.format === "date-time" && Number.isNaN(Date.parse(value)))
      return false;
    return true;
  }
  if (resolved.type === "array") {
    return (
      Array.isArray(value) &&
      (resolved.maxItems === undefined || value.length <= resolved.maxItems) &&
      value.every((item) => validates(schema, resolved.items, item))
    );
  }
  if (resolved.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      return false;
    if ((resolved.required ?? []).some((property) => !(property in value)))
      return false;
    return Object.entries(resolved.properties ?? {}).every(
      ([property, propertySchema]) =>
        !(property in value) ||
        validates(schema, propertySchema, value[property]),
    );
  }
  return false;
}

test("the generated contract exposes the version and stable base errors", async () => {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const generated = await import(generatedPath.href);

  assert.equal(schema.$id, "urn:nop:contracts:v1");
  assert.equal(generated.CONTRACT_VERSION, "v1");
  assert.deepEqual(Object.keys(generated.ERROR_DEFINITIONS), [
    "PLATFORM_VALIDATION_FAILED",
    "PLATFORM_UNAUTHENTICATED",
    "PLATFORM_FORBIDDEN",
    "PLATFORM_NOT_FOUND",
    "PLATFORM_CONFLICT",
    "PLATFORM_RATE_LIMITED",
    "PLATFORM_UNAVAILABLE",
    "PLATFORM_INTERNAL_ERROR",
  ]);
});

test("error responses use stable codes and schema-valid safe defaults", async () => {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const generated = await import(generatedPath.href);
  const response = generated.createErrorResponse({
    code: "PLATFORM_VALIDATION_FAILED",
    requestId: "request-123",
    fieldErrors: [{ field: "name", message: "Name is required" }],
  });

  assert.equal(validates(schema, schema.$defs.ErrorResponse, response), true);
  assert.equal(response.error.retryable, false);
  assert.equal(generated.errorCodeForHttpStatus(404), "PLATFORM_NOT_FOUND");
  assert.equal(
    generated.errorCodeForHttpStatus(502),
    "PLATFORM_INTERNAL_ERROR",
  );
  assert.equal(generated.isValidRequestId("safe.request-123"), true);
  assert.equal(generated.isValidRequestId("contains whitespace"), false);
  assert.equal(generated.isValidRequestId("x".repeat(65)), false);
});

test("base error codes have fixed HTTP and retry semantics", async () => {
  const generated = await import(generatedPath.href);

  assert.deepEqual(generated.ERROR_DEFINITIONS, {
    PLATFORM_VALIDATION_FAILED: {
      httpStatus: 400,
      retryable: false,
      defaultMessage: "Request validation failed",
    },
    PLATFORM_UNAUTHENTICATED: {
      httpStatus: 401,
      retryable: false,
      defaultMessage: "Authentication is required",
    },
    PLATFORM_FORBIDDEN: {
      httpStatus: 403,
      retryable: false,
      defaultMessage: "Access is forbidden",
    },
    PLATFORM_NOT_FOUND: {
      httpStatus: 404,
      retryable: false,
      defaultMessage: "The requested resource was not found",
    },
    PLATFORM_CONFLICT: {
      httpStatus: 409,
      retryable: false,
      defaultMessage: "The request conflicts with current state",
    },
    PLATFORM_RATE_LIMITED: {
      httpStatus: 429,
      retryable: true,
      defaultMessage: "Too many requests",
    },
    PLATFORM_UNAVAILABLE: {
      httpStatus: 503,
      retryable: true,
      defaultMessage: "The service is temporarily unavailable",
    },
    PLATFORM_INTERNAL_ERROR: {
      httpStatus: 500,
      retryable: false,
      defaultMessage: "An internal error occurred",
    },
  });
});

test("required fields fail while unknown optional fields remain compatible", async () => {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const valid = {
    contractVersion: "v1",
    error: {
      code: "PLATFORM_INTERNAL_ERROR",
      message: "An internal error occurred",
      retryable: false,
      futureOptionalField: "ignored",
    },
    futureEnvelopeField: true,
  };

  assert.equal(validates(schema, schema.$defs.ErrorResponse, valid), true);
  assert.equal(
    validates(schema, schema.$defs.ErrorResponse, {
      contractVersion: "v1",
      error: { message: "missing code", retryable: false },
    }),
    false,
  );
});

test("internal envelopes require versioned UTC identities and safe failures", async () => {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const envelope = {
    protocolVersion: "v1",
    sourceId: "central-default",
    batchId: "batch-1",
    submittedAt: "2026-07-14T00:00:00Z",
    items: [
      {
        itemId: "item-1",
        correlationId: "correlation-1",
        observedAt: "2026-07-14T00:00:00Z",
        failure: {
          classification: "TRANSIENT",
          code: "SOURCE_TIMEOUT",
          message: "Source timed out",
          retryable: true,
        },
      },
    ],
  };

  assert.equal(
    validates(schema, schema.$defs.InternalBatchEnvelope, envelope),
    true,
  );
  assert.equal(
    validates(schema, schema.$defs.InternalBatchEnvelope, {
      ...envelope,
      submittedAt: "2026-07-14T08:00:00+08:00",
    }),
    false,
  );
});

test("the base contract contains no secret-bearing fields", async () => {
  const schemaText = await readFile(schemaPath, "utf8");

  assert.doesNotMatch(
    schemaText,
    /password|sessionToken|totpSecret|snmpCommunity|privateKey|trapBody/i,
  );
});

test("the existing CI gate checks generated contract drift", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("package.json", repositoryRoot), "utf8"),
  );
  const workflow = await readFile(
    new URL(".github/workflows/ci.yml", repositoryRoot),
    "utf8",
  );

  assert.match(packageJson.scripts.verify, /npm run contracts:check/);
  assert.equal(
    packageJson.scripts["test:contract:docker"],
    "node scripts/contracts-docker-test.mjs",
  );
  assert.match(workflow, /scripts\/verify\.(ps1|sh)/);
});

test("Docker builds copy the contracts workspace before install and only generated runtime code", async () => {
  const [platform, web] = await Promise.all([
    readFile(
      new URL("deploy/docker/platform.Dockerfile", repositoryRoot),
      "utf8",
    ),
    readFile(new URL("deploy/docker/web.Dockerfile", repositoryRoot), "utf8"),
  ]);

  for (const dockerfile of [platform, web]) {
    const manifest = dockerfile.indexOf(
      "COPY packages/contracts/package.json packages/contracts/package.json",
    );
    const install = dockerfile.indexOf("RUN npm ci --ignore-scripts");
    const generated = dockerfile.indexOf(
      "COPY packages/contracts/generated/typescript packages/contracts/generated/typescript",
    );

    assert.ok(manifest >= 0 && manifest < install);
    assert.ok(install < generated);
    assert.doesNotMatch(dockerfile, /^COPY \. /m);
    assert.doesNotMatch(dockerfile, /contracts-generate|contracts-check/);
  }

  const platformRuntime = platform.slice(
    platform.indexOf("FROM node:24.14.0-alpine AS runtime\n"),
  );
  const webRuntime = web.slice(
    web.indexOf("FROM node:24.14.0-alpine AS runtime\n"),
  );

  assert.match(
    platformRuntime,
    /packages\/contracts\/generated\/typescript\/index\.js/,
  );
  assert.doesNotMatch(
    platformRuntime,
    /schemas|index\.d\.ts|scripts\/contracts/,
  );
  assert.doesNotMatch(webRuntime, /packages\/contracts/);
  assert.doesNotMatch(webRuntime, /\/workspace\/apps\/web apps\/web/);
  assert.match(webRuntime, /\/workspace\/apps\/web\/dist apps\/web\/dist/);
});

test("Docker context excludes local state without hiding required contracts", async () => {
  const dockerignore = await readFile(
    new URL(".dockerignore", repositoryRoot),
    "utf8",
  );

  for (const requiredRule of [
    ".git",
    ".env.*",
    "!.env.example",
    "**/node_modules",
    "**/dist",
    "**/*.tsbuildinfo",
    "**/.vite",
    "**/.cache",
    "*.key",
    "*.pem",
    "*.pfx",
    "*.p12",
    "*.crt",
    "*.cer",
    "secrets/**",
  ]) {
    assert.match(
      dockerignore,
      new RegExp(`^${requiredRule.replaceAll("*", "\\*")}$`, "m"),
    );
  }

  assert.doesNotMatch(dockerignore, /^(apps|packages|\*\.json)$/m);
});
