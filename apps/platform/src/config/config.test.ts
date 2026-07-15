import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspect } from "node:util";

import { readDatabaseConfig } from "../database/config.js";

import {
  readApiListenConfig,
  readRuntimeHealthConfig,
  readSecret,
  safeConfigurationSummary,
  SecretValue,
} from "./public.js";
import {
  readServiceAuthenticationConfig,
  ServiceAuthenticator,
} from "./service-auth.js";

const collectorToken = "t008-test-only-collector-token-not-production";
const vmAlertToken = "t008-test-only-vmalert-token-not-production";

test("config rejects missing, empty, and conflicting Secret sources", () => {
  assert.throws(() => readSecret({}, "TEST_SECRET"), /TEST_SECRET is required/);
  assert.throws(
    () => readSecret({ TEST_SECRET: "   " }, "TEST_SECRET"),
    /TEST_SECRET must not be empty/,
  );
  assert.throws(
    () =>
      readSecret(
        { TEST_SECRET: "value", TEST_SECRET_FILE: "ignored" },
        "TEST_SECRET",
      ),
    /TEST_SECRET and TEST_SECRET_FILE cannot both be set/,
  );
});

test("config reads one LF or CRLF terminator without trimming Secret content", () => {
  const directory = mkdtempSync(join(tmpdir(), "nop-t008-"));
  try {
    const path = join(directory, "secret");
    writeFileSync(path, "  secret value  \r\n", { mode: 0o600 });
    const secret = readSecret({ TEST_SECRET_FILE: path }, "TEST_SECRET");
    assert.equal(secret.reveal(), "  secret value  ");
    assert.equal(String(secret), "[REDACTED]");
    assert.equal(JSON.stringify({ secret }), '{"secret":"[REDACTED]"}');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("config rejects unreadable and oversized Secret files without exposing paths", () => {
  const missingPath = join(tmpdir(), "nop-t008-does-not-exist", "secret");
  assert.throws(
    () => readSecret({ TEST_SECRET_FILE: missingPath }, "TEST_SECRET"),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "TEST_SECRET_FILE could not be read");
      assert.equal(error.message.includes(missingPath), false);
      return true;
    },
  );

  assert.throws(
    () =>
      readSecret({ TEST_SECRET_FILE: "unused" }, "TEST_SECRET", () =>
        Buffer.alloc(4097, "x"),
      ),
    /TEST_SECRET_FILE exceeds 4096 bytes/,
  );
  assert.throws(
    () =>
      readSecret({ TEST_SECRET_FILE: "unused" }, "TEST_SECRET", () =>
        Buffer.from([0xff]),
      ),
    /TEST_SECRET_FILE must contain UTF-8/,
  );
});

test(
  "config rejects broadly readable Secret files on production platforms",
  {
    skip: process.platform === "win32",
  },
  () => {
    const directory = mkdtempSync(join(tmpdir(), "nop-t008-permissions-"));
    try {
      const path = join(directory, "secret");
      writeFileSync(path, "t008-test-only-protected-secret\n", { mode: 0o600 });
      chmodSync(path, 0o644);
      assert.throws(
        () =>
          readSecret(
            { NODE_ENV: "production", TEST_SECRET_FILE: path },
            "TEST_SECRET",
          ),
        /TEST_SECRET_FILE could not be read/,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test("config permits direct development Secrets but production requires files", () => {
  assert.equal(
    readSecret(
      { NODE_ENV: "test", TEST_SECRET: collectorToken },
      "TEST_SECRET",
    ).reveal(),
    collectorToken,
  );
  assert.throws(
    () =>
      readSecret(
        { NODE_ENV: "production", TEST_SECRET: collectorToken },
        "TEST_SECRET",
      ),
    /TEST_SECRET must use TEST_SECRET_FILE in production/,
  );
});

test("config validates listen, URL, timeout, and heartbeat relationships", () => {
  assert.throws(
    () => readApiListenConfig({ HOST: "127.0.0.1", PORT: "70000" }),
    /PORT must be an integer between 1 and 65535/,
  );
  assert.throws(
    () => readRuntimeHealthConfig({ VICTORIAMETRICS_URL: "ftp://metrics" }),
    /VICTORIAMETRICS_URL must be an HTTP URL without credentials/,
  );
  assert.throws(
    () => readRuntimeHealthConfig({ PLATFORM_HEALTH_TIMEOUT_MS: "0" }),
    /PLATFORM_HEALTH_TIMEOUT_MS must be an integer between 1 and 60000/,
  );
  assert.throws(
    () =>
      readRuntimeHealthConfig({
        WORKER_HEARTBEAT_INTERVAL_MS: "5000",
        WORKER_HEARTBEAT_STALE_AFTER_MS: "5000",
      }),
    /WORKER_HEARTBEAT_STALE_AFTER_MS must exceed WORKER_HEARTBEAT_INTERVAL_MS/,
  );
});

test("config keeps service identities separate and supports bounded rotation", () => {
  assert.throws(
    () => readServiceAuthenticationConfig({ NODE_ENV: "production" }),
    /COLLECTOR_SERVICE_TOKEN is required/,
  );
  const configuration = readServiceAuthenticationConfig({
    NODE_ENV: "test",
    COLLECTOR_SERVICE_TOKEN: collectorToken,
    COLLECTOR_SERVICE_PREVIOUS_TOKEN:
      "t008-test-only-collector-previous-not-production",
    VMALERT_SERVICE_TOKEN: vmAlertToken,
  });
  const authenticator = new ServiceAuthenticator(configuration);

  assert.equal(
    authenticator.authenticate(
      "collector",
      `Bearer ${collectorToken}`,
      "observation.ingest",
    ).service,
    "collector",
  );
  assert.equal(
    authenticator.authenticate(
      "collector",
      "Bearer t008-test-only-collector-previous-not-production",
      "observation.ingest",
    ).service,
    "collector",
  );
  assert.throws(
    () =>
      authenticator.authenticate(
        "collector",
        `Bearer ${vmAlertToken}`,
        "observation.ingest",
      ),
    /Internal service authentication failed/,
  );

  assert.throws(
    () =>
      readServiceAuthenticationConfig({
        NODE_ENV: "test",
        COLLECTOR_SERVICE_TOKEN: "too-short",
        VMALERT_SERVICE_TOKEN: vmAlertToken,
      }),
    /COLLECTOR_SERVICE_TOKEN must be a bounded opaque token/,
  );
  assert.throws(
    () =>
      new ServiceAuthenticator(
        readServiceAuthenticationConfig({
          NODE_ENV: "test",
          COLLECTOR_SERVICE_TOKEN: collectorToken,
          VMALERT_SERVICE_TOKEN: collectorToken,
        }),
      ),
    /Internal service credentials must be distinct/,
  );
  assert.throws(
    () =>
      authenticator.authenticate(
        "collector",
        `Bearer ${collectorToken}`,
        "metric-condition.ingest",
      ),
    /Internal service authentication failed/,
  );

  const afterRevocation = new ServiceAuthenticator(
    readServiceAuthenticationConfig({
      NODE_ENV: "test",
      COLLECTOR_SERVICE_TOKEN: collectorToken,
      VMALERT_SERVICE_TOKEN: vmAlertToken,
    }),
  );
  assert.throws(
    () =>
      afterRevocation.authenticate(
        "collector",
        "Bearer t008-test-only-collector-previous-not-production",
        "observation.ingest",
      ),
    /Internal service authentication failed/,
  );
});

test("Secret values never reveal themselves through standard formatting", () => {
  const canary = "t008-canary-secret-must-not-leak";
  const secret = new SecretValue(canary);
  const rendered = [String(secret), JSON.stringify(secret), `${secret}`].join(
    " ",
  );
  assert.equal(rendered.includes(canary), false);
});

test("config debug summaries omit Secret values and file paths", () => {
  const canary = "t008-summary-canary-secret";
  const summary = safeConfigurationSummary({
    NODE_ENV: "test",
    DATABASE_HOST: "127.0.0.1",
    DATABASE_NAME: "test",
    DATABASE_USER: "test",
    DATABASE_PASSWORD: canary,
  });
  assert.equal(JSON.stringify(summary).includes(canary), false);
  assert.equal("password" in summary.database, false);
});

test("database adapter redacts its required plaintext credential when formatted", () => {
  const canary = "t008-database-canary-secret";
  const config = readDatabaseConfig({
    NODE_ENV: "test",
    DATABASE_HOST: "127.0.0.1",
    DATABASE_NAME: "test",
    DATABASE_USER: "test",
    DATABASE_PASSWORD: canary,
  });
  assert.equal(config.password, canary);
  assert.equal(JSON.stringify(config).includes(canary), false);
  assert.equal(inspect(config).includes(canary), false);
});
