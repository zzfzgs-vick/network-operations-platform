import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { URL } from "node:url";

import { readDatabaseConfig } from "../../../apps/platform/dist/database/config.js";
import {
  createDatabasePool,
  withTransaction,
} from "../../../apps/platform/dist/database/database.js";
import {
  applyMigrations,
  getMigrationStatus,
  verifyMigrations,
} from "../../../apps/platform/dist/database/migrations.js";
import { DatabaseService } from "../../../apps/platform/dist/database/database.module.js";
import { createApiApplication } from "../../../apps/platform/dist/main.js";
import { createWorkerApplication } from "../../../apps/platform/dist/worker.js";

const databaseEnvironment = process.env;

test("complete database environment produces one validated configuration", () => {
  const config = readDatabaseConfig({
    DATABASE_HOST: "127.0.0.1",
    DATABASE_PORT: "5432",
    DATABASE_NAME: "network_operations_test",
    DATABASE_USER: "nop",
    DATABASE_PASSWORD: "test-only",
    DATABASE_SSL_MODE: "disable",
    DATABASE_POOL_MAX: "4",
    DATABASE_CONNECT_TIMEOUT_MS: "5000",
    DATABASE_QUERY_TIMEOUT_MS: "10000",
    NODE_ENV: "test",
  });

  assert.deepEqual(config, {
    host: "127.0.0.1",
    port: 5432,
    database: "network_operations_test",
    user: "nop",
    password: "test-only",
    sslMode: "disable",
    poolMax: 4,
    connectTimeoutMs: 5000,
    queryTimeoutMs: 10000,
  });
});

test("invalid database configuration fails without exposing the password", () => {
  assert.throws(
    () =>
      readDatabaseConfig({
        DATABASE_HOST: "127.0.0.1",
        DATABASE_PORT: "not-a-port",
        DATABASE_NAME: "network_operations_test",
        DATABASE_USER: "nop",
        DATABASE_PASSWORD: "do-not-log-this",
      }),
    (error) => {
      assert.match(error.message, /DATABASE_PORT/);
      assert.doesNotMatch(error.message, /do-not-log-this/);
      return true;
    },
  );
});

test("transactions commit, roll back, and release the pool", async () => {
  const pool = createDatabasePool(readDatabaseConfig(databaseEnvironment));

  try {
    await pool.query("drop table if exists transaction_probe");
    await pool.query("create table transaction_probe (value integer not null)");

    await withTransaction(pool, (client) =>
      client.query("insert into transaction_probe (value) values ($1)", [1]),
    );

    await assert.rejects(
      withTransaction(pool, async (client) => {
        await client.query(
          "insert into transaction_probe (value) values ($1)",
          [2],
        );
        throw new Error("rollback requested");
      }),
      /rollback requested/,
    );

    const result = await pool.query(
      "select value from transaction_probe order by value",
    );
    assert.deepEqual(result.rows, [{ value: 1 }]);
  } finally {
    await pool.end();
  }

  assert.equal(pool.ended, true);
});

test("migrations apply once and failed migrations remain retryable", async () => {
  const pool = createDatabasePool(readDatabaseConfig(databaseEnvironment));
  const fixture = await mkdtemp(join(tmpdir(), "nop-migrations-"));
  const baseline = await readFile(
    new URL(
      "../../../apps/platform/migrations/0001_platform_baseline.up.sql",
      import.meta.url,
    ),
    "utf8",
  );

  try {
    await pool.query("drop table if exists platform_schema_migrations");
    await pool.query("drop table if exists failed_migration_probe");
    await writeFile(join(fixture, "0001_platform_baseline.up.sql"), baseline);

    assert.equal((await applyMigrations(pool, fixture)).appliedCount, 1);
    assert.equal((await applyMigrations(pool, fixture)).appliedCount, 0);
    assert.deepEqual(await getMigrationStatus(pool, fixture), {
      currentVersion: 1,
      latestVersion: 1,
      pendingVersions: [],
      compatible: true,
    });

    const failingPath = join(fixture, "0002_test_failure.up.sql");
    await writeFile(
      failingPath,
      "create table failed_migration_probe (value integer); select missing_function();",
    );
    await assert.rejects(applyMigrations(pool, fixture), /missing_function/);

    const afterFailure = await getMigrationStatus(pool, fixture);
    assert.equal(afterFailure.currentVersion, 1);
    assert.deepEqual(afterFailure.pendingVersions, [2]);
    const rolledBack = await pool.query(
      "select to_regclass('public.failed_migration_probe') as relation",
    );
    assert.equal(rolledBack.rows[0].relation, null);

    await writeFile(failingPath, "select 1;");
    assert.equal((await applyMigrations(pool, fixture)).appliedCount, 1);
    assert.equal((await getMigrationStatus(pool, fixture)).currentVersion, 2);
  } finally {
    await pool.end();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("concurrent migration runners serialize one global history", async () => {
  const firstPool = createDatabasePool(readDatabaseConfig(databaseEnvironment));
  const secondPool = createDatabasePool(
    readDatabaseConfig(databaseEnvironment),
  );

  try {
    await firstPool.query("drop table if exists platform_schema_migrations");
    const results = await Promise.all([
      applyMigrations(firstPool),
      applyMigrations(secondPool),
    ]);
    assert.deepEqual(
      results.map((result) => result.appliedCount).sort(),
      [0, 1],
    );
    const count = await firstPool.query(
      "select count(*)::integer as count from platform_schema_migrations",
    );
    assert.equal(count.rows[0].count, 1);
  } finally {
    await firstPool.end();
    await secondPool.end();
  }
});

test("changed applied migrations are reported as incompatible", async () => {
  const pool = createDatabasePool(readDatabaseConfig(databaseEnvironment));

  try {
    await pool.query("drop table if exists platform_schema_migrations");
    await applyMigrations(pool);
    await pool.query(
      "update platform_schema_migrations set checksum = 'changed'",
    );
    assert.equal((await getMigrationStatus(pool)).compatible, false);
    await assert.rejects(
      verifyMigrations(pool),
      /Database schema is incompatible/,
    );
  } finally {
    await pool.end();
  }
});

test("API and Worker verify one schema contract with independent closeable pools", async () => {
  const controlPool = createDatabasePool(
    readDatabaseConfig(databaseEnvironment),
  );
  await controlPool.query("drop table if exists platform_schema_migrations");
  await applyMigrations(controlPool);

  const api = await createApiApplication();
  await api.init();
  const worker = await createWorkerApplication();
  const apiDatabase = api.get(DatabaseService);
  const workerDatabase = worker.get(DatabaseService);

  try {
    assert.notEqual(apiDatabase.pool, workerDatabase.pool);
    assert.deepEqual(apiDatabase.status, {
      connected: true,
      compatible: true,
      currentVersion: 1,
      latestVersion: 1,
    });
    assert.deepEqual(workerDatabase.status, apiDatabase.status);
  } finally {
    await api.close();
    await worker.close();
    await controlPool.end();
  }

  assert.equal(apiDatabase.pool.ended, true);
  assert.equal(workerDatabase.pool.ended, true);
});

test("application startup rejects an empty schema without auto-migrating it", async () => {
  const controlPool = createDatabasePool(
    readDatabaseConfig(databaseEnvironment),
  );
  await controlPool.query("drop table if exists platform_schema_migrations");
  const api = await createApiApplication();

  try {
    await assert.rejects(api.init(), /Database schema is incompatible/);
    const result = await controlPool.query(
      "select to_regclass('public.platform_schema_migrations') as relation",
    );
    assert.equal(result.rows[0].relation, null);
  } finally {
    await api.close();
    await controlPool.end();
  }
});

test("application startup fails fast when database configuration is missing", async () => {
  const databaseKeys = Object.keys(process.env).filter((key) =>
    key.startsWith("DATABASE_"),
  );
  const originalValues = new Map(
    databaseKeys.map((key) => [key, process.env[key]]),
  );
  databaseKeys.forEach((key) => delete process.env[key]);
  const api = await createApiApplication();

  try {
    await assert.rejects(api.init(), /DATABASE_HOST/);
  } finally {
    await api.close();
    for (const [key, value] of originalValues) {
      process.env[key] = value;
    }
  }
});

test("migration history remains in public when search_path changes", async () => {
  const pool = createDatabasePool(
    readDatabaseConfig({
      ...databaseEnvironment,
      DATABASE_POOL_MAX: "1",
    }),
  );

  try {
    await pool.query("drop table if exists public.platform_schema_migrations");
    await pool.query("drop schema if exists migration_shadow cascade");
    await pool.query("create schema migration_shadow");
    await pool.query(`
      create table migration_shadow.platform_schema_migrations (
        version integer primary key,
        name text not null,
        checksum text not null,
        applied_at timestamptz not null default clock_timestamp()
      )
    `);
    await pool.query("set search_path to migration_shadow, public");

    assert.equal((await applyMigrations(pool)).appliedCount, 1);
    const publicCount = await pool.query(
      "select count(*)::integer as count from public.platform_schema_migrations",
    );
    const shadowCount = await pool.query(
      "select count(*)::integer as count from migration_shadow.platform_schema_migrations",
    );
    assert.equal(publicCount.rows[0].count, 1);
    assert.equal(shadowCount.rows[0].count, 0);
  } finally {
    await pool.query("reset search_path").catch(() => undefined);
    await pool.query("drop schema if exists migration_shadow cascade");
    await pool.end();
  }
});

test("application startup fails closed when PostgreSQL is unavailable", async () => {
  const originalPort = process.env.DATABASE_PORT;
  const originalTimeout = process.env.DATABASE_CONNECT_TIMEOUT_MS;
  const originalPassword = process.env.DATABASE_PASSWORD;
  process.env.DATABASE_PORT = "1";
  process.env.DATABASE_CONNECT_TIMEOUT_MS = "100";
  process.env.DATABASE_PASSWORD = "unavailable-test-secret";
  const api = await createApiApplication();

  try {
    await assert.rejects(api.init(), (error) => {
      assert.doesNotMatch(error.message, /unavailable-test-secret/);
      return true;
    });
  } finally {
    await api.close();
    process.env.DATABASE_PORT = originalPort;
    process.env.DATABASE_CONNECT_TIMEOUT_MS = originalTimeout;
    process.env.DATABASE_PASSWORD = originalPassword;
  }
});
