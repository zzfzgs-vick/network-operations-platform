import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

import { readDatabaseConfig } from "../../../apps/platform/dist/database/config.js";
import { createDatabasePool } from "../../../apps/platform/dist/database/database.js";
import { RuntimeLifecycle } from "../../../apps/platform/dist/lifecycle.js";
import { ReliableWorkStore } from "../../../apps/platform/dist/modules/reliable-work/public.js";
import { createWorkerApplication } from "../../../apps/platform/dist/worker.js";

test("drain rejects new work and waits for accepted work", async () => {
  const lifecycle = new RuntimeLifecycle();
  const release = lifecycle.acceptWork();

  assert.equal(lifecycle.beginDrain(), true);
  assert.equal(lifecycle.beginDrain(), false);
  assert.equal(lifecycle.acceptWork(), undefined);

  const drained = lifecycle.waitForIdle(100);
  release?.();
  assert.equal(await drained, true);
});

test("API drain rejects new requests while liveness remains process-only", async () => {
  const original = { ...process.env };
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_STARTUP_CHECK: "disabled",
    COLLECTOR_SERVICE_TOKEN: "t009-test-only-collector-token-not-production",
    VMALERT_SERVICE_TOKEN: "t009-test-only-vmalert-token-not-production",
  });
  const { createApiApplication } =
    await import("../../../apps/platform/dist/main.js");
  const app = await createApiApplication();

  try {
    await app.listen(0, "127.0.0.1");
    assert.equal((await globalThis.fetch(await app.getUrl())).status, 200);

    app.get(RuntimeLifecycle).beginDrain();

    assert.equal(
      (await globalThis.fetch(`${await app.getUrl()}/health/ready`)).status,
      503,
    );
    assert.equal(
      (await globalThis.fetch(`${await app.getUrl()}/health/live`)).status,
      200,
    );
    assert.equal((await globalThis.fetch(await app.getUrl())).status, 503);
  } finally {
    await app.close();
    for (const key of Object.keys(process.env)) {
      if (!(key in original)) delete process.env[key];
    }
    Object.assign(process.env, original);
  }
});

test("Worker shutdown persists a stopped heartbeat and closes its pool", async () => {
  const app = await createWorkerApplication();
  await app.close();

  const pool = createDatabasePool(readDatabaseConfig(process.env));
  try {
    const result = await pool.query(
      `select status from platform_worker_heartbeats
       where worker_type = 'platform-worker' and instance_id = $1`,
      [process.env.WORKER_INSTANCE_ID],
    );
    assert.equal(result.rows[0]?.status, "STOPPED");
  } finally {
    await pool.end();
  }
});

test("an unfinished finite Worker lease is reclaimed after process loss", async () => {
  const firstPool = createDatabasePool(readDatabaseConfig(process.env));
  const first = new ReliableWorkStore(firstPool);
  const job = await first.enqueueJob({
    jobType: "runtime-shutdown.probe",
    idempotencyKey: "t009-lease-recovery",
    payloadReference: "test://runtime-shutdown/lease",
    priority: 100,
    maxAttempts: 3,
  });
  const [claimed] = await first.claimReadyJobs("worker-before-stop", 1, 100);
  assert.equal(claimed.jobId, job.jobId);
  await firstPool.end();

  await delay(150);
  const replacementPool = createDatabasePool(readDatabaseConfig(process.env));
  const replacement = new ReliableWorkStore(replacementPool);
  try {
    const [reclaimed] = await replacement.claimReadyJobs(
      "worker-after-restart",
      1,
      1000,
    );
    assert.equal(reclaimed.jobId, job.jobId);
    assert.equal(reclaimed.attemptCount, 2);
    await replacement.completeJobWithOutbox(job.jobId, "worker-after-restart", {
      destination: "runtime-shutdown.probe",
      idempotencyKey: `job:${job.jobId}`,
      payloadReference: "test://runtime-shutdown/recovered",
    });
  } finally {
    await replacementPool.end();
  }
});
