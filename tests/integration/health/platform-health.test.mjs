import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readDatabaseConfig } from "../../../apps/platform/dist/database/config.js";
import { createDatabasePool } from "../../../apps/platform/dist/database/database.js";
import { DatabaseService } from "../../../apps/platform/dist/database/database.module.js";
import {
  applyMigrations,
  defaultMigrationDirectory,
  getMigrationStatus,
  verifyMigrations,
} from "../../../apps/platform/dist/database/migrations.js";
import { createApiApplication } from "../../../apps/platform/dist/main.js";
import { createWorkerApplication } from "../../../apps/platform/dist/worker.js";
import { PlatformHealthStore } from "../../../apps/platform/dist/modules/platform-health/platform-health.js";
import { ReliableWorkStore } from "../../../apps/platform/dist/modules/reliable-work/public.js";

const { fetch } = globalThis;

test("Worker heartbeat updates one stable instance record and reports staleness", async () => {
  const pool = createDatabasePool(readDatabaseConfig(process.env));
  const store = new PlatformHealthStore(pool);
  const instance = {
    workerType: "platform-worker",
    instanceId: "t007-worker-1",
    startedAt: new Date("2026-07-14T00:00:00.000Z"),
    version: "test",
  };

  try {
    await store.recordHeartbeat(instance);
    const restartedAt = new Date("2026-07-14T01:00:00.000Z");
    await store.recordHeartbeat({ ...instance, startedAt: restartedAt });

    const result = await pool.query(`
      select worker_type, instance_id, started_at, version, status,
             count(*) over ()::integer as row_count
      from platform_worker_heartbeats
    `);
    assert.deepEqual(result.rows, [
      {
        worker_type: "platform-worker",
        instance_id: "t007-worker-1",
        started_at: restartedAt,
        version: "test",
        status: "RUNNING",
        row_count: 1,
      },
    ]);

    const fresh = await store.readWorkerHeartbeat("platform-worker", 60_000);
    assert.equal(fresh.status, "AVAILABLE");
    assert.equal(fresh.instanceId, "t007-worker-1");

    await pool.query(`
      update platform_worker_heartbeats
      set last_heartbeat_at = clock_timestamp() - interval '2 minutes'
    `);
    const stale = await store.readWorkerHeartbeat("platform-worker", 60_000);
    assert.equal(stale.status, "STALE");
  } finally {
    await pool.end();
  }
});

test("Inbox duplicate metric is updated by the real idempotency path", async () => {
  const pool = createDatabasePool(readDatabaseConfig(process.env));
  const reliableWork = new ReliableWorkStore(pool);
  const health = new PlatformHealthStore(pool);
  const input = {
    sourceId: "t007-source",
    idempotencyKey: "t007-duplicate",
    messageKind: "test.health",
    payloadReference: "test:payload",
  };

  try {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => reliableWork.acceptInbox(input)),
    );
    assert.equal(results.filter((result) => result.accepted).length, 1);
    assert.equal(results.filter((result) => !result.accepted).length, 4);

    const metrics = await health.readReliableWorkMetrics();
    assert.equal(metrics.inboxDuplicates, 4);
  } finally {
    await pool.end();
  }
});

async function seedWorkerHeartbeat() {
  const pool = createDatabasePool(readDatabaseConfig(process.env));
  try {
    await new PlatformHealthStore(pool).recordHeartbeat({
      workerType: "platform-worker",
      instanceId: "t007-api-worker",
      startedAt: new Date(),
      version: "test",
    });
  } finally {
    await pool.end();
  }
}

test("API liveness, readiness, and metrics report real dependency state", async () => {
  await seedWorkerHeartbeat();
  const app = await createApiApplication();

  try {
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    const live = await fetch(`${base}/health/live`);
    assert.equal(live.status, 200);
    assert.equal((await live.json()).status, "ALIVE");

    const ready = await fetch(`${base}/health/ready`);
    assert.equal(ready.status, 200);
    const readyBody = await ready.json();
    assert.equal(readyBody.status, "READY");
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(readyBody.dependencies).map(([name, value]) => [
          name,
          value.status,
        ]),
      ),
      {
        postgresql: "AVAILABLE",
        victoriametrics: "AVAILABLE",
        vmalert: "AVAILABLE",
        worker: "AVAILABLE",
      },
    );

    const metrics = await fetch(`${base}/metrics`);
    const metricsBody = await metrics.text();
    assert.equal(metrics.status, 200);
    assert.match(metricsBody, /# HELP nop_api_requests_success_total/);
    assert.match(metricsBody, /nop_reliable_inbox_duplicates_total 4/);
    assert.doesNotMatch(
      metricsBody,
      /t007-api-worker|t007-duplicate|change-me-local-only|DATABASE_PASSWORD/,
    );

    const database = app.get(DatabaseService);
    await database.pool.query(`
      update platform_worker_heartbeats
      set last_heartbeat_at = clock_timestamp() - interval '1 minute'
    `);
    const stale = await fetch(`${base}/health/ready`);
    assert.equal(stale.status, 503);
    assert.equal((await stale.json()).dependencies.worker.status, "STALE");
    const degradedMetrics = await (await fetch(`${base}/metrics`)).text();
    assert.match(degradedMetrics, /nop_api_requests_error_total [1-9][0-9]*/);

    await seedWorkerHeartbeat();
    const recovered = await fetch(`${base}/health/ready`);
    assert.equal(recovered.status, 200);
  } finally {
    await app.close();
  }
});

test("API reports each unavailable external dependency without failing liveness", async () => {
  await seedWorkerHeartbeat();
  const originalVictoriaMetrics = process.env.VICTORIAMETRICS_URL;
  const originalVmAlert = process.env.VMALERT_URL;

  try {
    for (const variable of ["VICTORIAMETRICS_URL", "VMALERT_URL"]) {
      process.env.VICTORIAMETRICS_URL = originalVictoriaMetrics;
      process.env.VMALERT_URL = originalVmAlert;
      process.env[variable] = "http://127.0.0.1:1";
      const app = await createApiApplication();
      try {
        await app.listen(0, "127.0.0.1");
        const base = await app.getUrl();
        assert.equal((await fetch(`${base}/health/live`)).status, 200);
        const ready = await fetch(`${base}/health/ready`);
        assert.equal(ready.status, 503);
        const body = await ready.json();
        const dependency =
          variable === "VICTORIAMETRICS_URL" ? "victoriametrics" : "vmalert";
        assert.equal(body.dependencies[dependency].status, "UNAVAILABLE");
        assert.doesNotMatch(
          JSON.stringify(body),
          /127\.0\.0\.1:1|password|stack/i,
        );
      } finally {
        await app.close();
      }
    }
  } finally {
    process.env.VICTORIAMETRICS_URL = originalVictoriaMetrics;
    process.env.VMALERT_URL = originalVmAlert;
  }
});

test("PostgreSQL loss makes readiness fail while liveness remains available", async () => {
  await seedWorkerHeartbeat();
  const app = await createApiApplication();
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();

  try {
    const database = app.get(DatabaseService);
    await database.pool.end();
    assert.equal((await fetch(`${base}/health/live`)).status, 200);
    const ready = await fetch(`${base}/health/ready`);
    assert.equal(ready.status, 503);
    assert.equal(
      (await ready.json()).dependencies.postgresql.status,
      "UNAVAILABLE",
    );
  } finally {
    await app.close();
  }
});

test("Worker entry module writes and stops its persistent heartbeat", async () => {
  const app = await createWorkerApplication();
  const database = app.get(DatabaseService);

  const running = await database.pool.query(`
    select status, version
    from platform_worker_heartbeats
    where worker_type = 'platform-worker' and instance_id = 't007-worker'
  `);
  assert.deepEqual(running.rows, [{ status: "RUNNING", version: "dev" }]);

  await app.close();

  const verificationPool = createDatabasePool(readDatabaseConfig(process.env));
  try {
    const stopped = await verificationPool.query(`
      select status
      from platform_worker_heartbeats
      where worker_type = 'platform-worker' and instance_id = 't007-worker'
    `);
    assert.deepEqual(stopped.rows, [{ status: "STOPPED" }]);
  } finally {
    await verificationPool.end();
  }
});

test("Migration chain upgrades v2 to the latest version and remains idempotent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nop-t007-v2-"));
  const databaseName = process.env.T007_V2_DATABASE_NAME;
  assert.ok(databaseName);
  const pool = createDatabasePool(
    readDatabaseConfig({ ...process.env, DATABASE_NAME: databaseName }),
  );

  try {
    for (const file of [
      "0001_platform_baseline.up.sql",
      "0002_reliable_work_foundation.up.sql",
    ]) {
      await copyFile(
        join(defaultMigrationDirectory, file),
        join(directory, file),
      );
    }
    const initial = await applyMigrations(pool, directory);
    assert.deepEqual(initial, { appliedCount: 2, currentVersion: 2 });

    const beforeUpgrade = await getMigrationStatus(pool);
    const latestVersion = beforeUpgrade.latestVersion;
    const expectedAppliedCount = beforeUpgrade.pendingVersions.filter(
      (version) => version > 2,
    ).length;

    const upgrade = await applyMigrations(pool);
    assert.deepEqual(upgrade, {
      appliedCount: expectedAppliedCount,
      currentVersion: latestVersion,
    });
    const repeat = await applyMigrations(pool);
    assert.deepEqual(repeat, {
      appliedCount: 0,
      currentVersion: latestVersion,
    });
    assert.deepEqual(await getMigrationStatus(pool), {
      currentVersion: latestVersion,
      latestVersion,
      pendingVersions: [],
      compatible: true,
    });
    await verifyMigrations(pool);
  } finally {
    await pool.end();
    await rm(directory, { recursive: true, force: true });
  }
});
