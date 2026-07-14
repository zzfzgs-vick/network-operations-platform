import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

import { readDatabaseConfig } from "../../../apps/platform/dist/database/config.js";
import { createDatabasePool } from "../../../apps/platform/dist/database/database.js";
import { ReliableWorkStore } from "../../../apps/platform/dist/modules/reliable-work/public.js";
import { ReliableWorkRunner } from "../../../apps/platform/dist/modules/reliable-work/runner.js";

test("duplicate Inbox delivery produces one transactional Outbox intent", async () => {
  const pool = createDatabasePool(readDatabaseConfig(process.env));
  const store = new ReliableWorkStore(pool);

  try {
    const message = {
      sourceId: "t006-source",
      idempotencyKey: "inbox-duplicate-1",
      messageKind: "reliable-work.probe",
      payloadReference: "test://inbox/duplicate-1",
    };
    const [first, duplicate] = await Promise.all([
      store.acceptInbox(message),
      store.acceptInbox(message),
    ]);

    assert.equal(
      [first.accepted, duplicate.accepted].filter(Boolean).length,
      1,
    );
    assert.equal(
      await store.processNextInbox("reliable-work.probe", (client, inbox) =>
        store.appendOutbox(client, {
          destination: "reliable-work.probe",
          idempotencyKey: `inbox:${inbox.idempotencyKey}`,
          payloadReference: inbox.payloadReference,
        }),
      ),
      true,
    );
    assert.equal(
      await store.processNextInbox("reliable-work.probe", () =>
        Promise.reject(new Error("duplicate must not run")),
      ),
      false,
    );

    const result = await pool.query(`
      select
        (select count(*)::integer from reliable_inbox_messages) as inbox_count,
        (select count(*)::integer from reliable_outbox_messages) as outbox_count
    `);
    assert.deepEqual(result.rows[0], { inbox_count: 1, outbox_count: 1 });
  } finally {
    await pool.end();
  }
});

test("concurrent workers claim once and an expired finite lease is reclaimable", async () => {
  const firstPool = createDatabasePool(readDatabaseConfig(process.env));
  const secondPool = createDatabasePool(readDatabaseConfig(process.env));
  const first = new ReliableWorkStore(firstPool);
  const second = new ReliableWorkStore(secondPool);

  try {
    const job = await first.enqueueJob({
      jobType: "reliable-work.probe",
      idempotencyKey: "lease-reclaim-1",
      payloadReference: "test://job/lease-reclaim-1",
      priority: 50,
      maxAttempts: 3,
    });
    const claims = await Promise.all([
      first.claimReadyJobs("worker-a", 1, 100),
      second.claimReadyJobs("worker-b", 1, 100),
    ]);
    assert.equal(claims.flat().length, 1);
    assert.equal(claims.flat()[0].jobId, job.jobId);

    await delay(150);
    const reclaimed = await second.claimReadyJobs("worker-b", 1, 1000);
    assert.equal(reclaimed.length, 1);
    assert.equal(reclaimed[0].jobId, job.jobId);
    assert.equal(reclaimed[0].attemptCount, 2);
    const attempts = await secondPool.query(
      `
        select attempt_number, outcome
        from reliable_job_attempts
        where job_id = $1
        order by attempt_number
      `,
      [job.jobId],
    );
    assert.deepEqual(attempts.rows, [
      { attempt_number: 1, outcome: "LEASE_EXPIRED" },
      { attempt_number: 2, outcome: "RUNNING" },
    ]);
    await second.completeJobWithOutbox(job.jobId, "worker-b", {
      destination: "reliable-work.probe",
      idempotencyKey: `job:${job.jobId}`,
      payloadReference: "test://outbox/lease-reclaim-1",
    });
  } finally {
    await firstPool.end();
    await secondPool.end();
  }
});

test("retryable failures back off, then enter a visible and retryable Dead Letter", async () => {
  const pool = createDatabasePool(readDatabaseConfig(process.env));
  const store = new ReliableWorkStore(pool);

  try {
    const job = await store.enqueueJob({
      jobType: "reliable-work.probe",
      idempotencyKey: "dead-letter-1",
      payloadReference: "test://job/dead-letter-1",
      priority: 100,
      maxAttempts: 2,
    });

    const [first] = await store.claimReadyJobs("worker-retry", 1, 5000);
    assert.equal(first.jobId, job.jobId);
    assert.equal(
      await store.failJob(job.jobId, "worker-retry", {
        category: "TIMEOUT",
        code: "TEST_TIMEOUT",
        retryable: true,
        baseDelayMs: 1,
      }),
      "RETRY_SCHEDULED",
    );

    await delay(20);
    const [second] = await store.claimReadyJobs("worker-retry", 1, 5000);
    assert.equal(second.jobId, job.jobId);
    assert.equal(second.attemptCount, 2);
    assert.equal(
      await store.failJob(job.jobId, "worker-retry", {
        category: "TIMEOUT",
        code: "TEST_TIMEOUT",
        retryable: true,
        baseDelayMs: 1,
      }),
      "DEAD_LETTER",
    );

    const [deadLetter] = await store.listActiveDeadLetters();
    assert.equal(deadLetter.jobId, job.jobId);
    assert.equal(deadLetter.failureCategory, "TIMEOUT");
    assert.equal(deadLetter.failureCode, "TEST_TIMEOUT");

    await store.retryDeadLetter(deadLetter.deadLetterId, "operator-1");
    assert.deepEqual(await store.listActiveDeadLetters(), []);
    const [retried] = await store.claimReadyJobs("worker-retry", 1, 5000);
    assert.equal(retried.jobId, job.jobId);
    assert.equal(retried.attemptCount, 3);
    assert.equal(retried.maxAttempts, 2);
    await store.completeJobWithOutbox(job.jobId, "worker-retry", {
      destination: "reliable-work.probe",
      idempotencyKey: `job:${job.jobId}`,
      payloadReference: "test://outbox/dead-letter-1",
    });
  } finally {
    await pool.end();
  }
});

test("job completion and its Outbox intent commit in one transaction", async () => {
  const pool = createDatabasePool(readDatabaseConfig(process.env));
  const store = new ReliableWorkStore(pool);

  try {
    const job = await store.enqueueJob({
      jobType: "reliable-work.probe",
      idempotencyKey: "complete-with-outbox-1",
      payloadReference: "test://job/complete-with-outbox-1",
      priority: 50,
      maxAttempts: 3,
    });
    const [claim] = await store.claimReadyJobs("worker-complete", 1, 5000);
    assert.equal(claim.jobId, job.jobId);

    await store.completeJobWithOutbox(job.jobId, "worker-complete", {
      destination: "reliable-work.probe",
      idempotencyKey: `job:${job.jobId}`,
      payloadReference: "test://outbox/complete-with-outbox-1",
    });

    const result = await pool.query(
      `
        select
          j.status,
          a.outcome,
          (select count(*)::integer from reliable_worker_leases where job_id = j.job_id) as lease_count,
          (select count(*)::integer from reliable_outbox_messages where idempotency_key = $2) as outbox_count
        from reliable_background_jobs j
        join reliable_job_attempts a on a.job_id = j.job_id and a.attempt_number = 1
        where j.job_id = $1
      `,
      [job.jobId, `job:${job.jobId}`],
    );
    assert.deepEqual(result.rows[0], {
      status: "COMPLETED",
      outcome: "SUCCEEDED",
      lease_count: 0,
      outbox_count: 1,
    });
  } finally {
    await pool.end();
  }
});

test("a crash rolls back Inbox completion and its Outbox intent", async () => {
  const pool = createDatabasePool(readDatabaseConfig(process.env));
  const store = new ReliableWorkStore(pool);
  const message = {
    sourceId: "t006-source",
    idempotencyKey: "rollback-1",
    messageKind: "reliable-work.rollback",
    payloadReference: "test://inbox/rollback-1",
  };

  try {
    await store.acceptInbox(message);
    await assert.rejects(
      store.processNextInbox(message.messageKind, async (client, inbox) => {
        await store.appendOutbox(client, {
          destination: message.messageKind,
          idempotencyKey: `inbox:${inbox.inboxMessageId}`,
          payloadReference: inbox.payloadReference,
        });
        throw new Error("simulated worker crash");
      }),
      /simulated worker crash/,
    );
    const rolledBack = await pool.query(
      `
        select
          (select status from reliable_inbox_messages where source_id = $1 and idempotency_key = $2) as inbox_status,
          (select count(*)::integer from reliable_outbox_messages where destination = $3) as outbox_count
      `,
      [message.sourceId, message.idempotencyKey, message.messageKind],
    );
    assert.deepEqual(rolledBack.rows[0], {
      inbox_status: "PENDING",
      outbox_count: 0,
    });

    assert.equal(
      await store.processNextInbox(message.messageKind, (client, inbox) =>
        store.appendOutbox(client, {
          destination: message.messageKind,
          idempotencyKey: `inbox:${inbox.inboxMessageId}`,
          payloadReference: inbox.payloadReference,
        }),
      ),
      true,
    );
  } finally {
    await pool.end();
  }
});

test("graceful stop finishes current work without claiming the next message", async () => {
  const pool = createDatabasePool(readDatabaseConfig(process.env));
  const store = new ReliableWorkStore(pool);
  let releaseCurrent;
  let markStarted;
  const currentReleased = new Promise((resolve) => {
    releaseCurrent = resolve;
  });
  const currentStarted = new Promise((resolve) => {
    markStarted = resolve;
  });
  const runner = new ReliableWorkRunner(
    store,
    async (client, inbox) => {
      markStarted();
      await currentReleased;
      await store.appendOutbox(client, {
        destination: inbox.messageKind,
        idempotencyKey: `inbox:${inbox.inboxMessageId}`,
        payloadReference: inbox.payloadReference,
      });
    },
    5,
    "reliable-work.graceful",
  );

  try {
    for (const key of ["graceful-1", "graceful-2"]) {
      await store.acceptInbox({
        sourceId: "t006-source",
        idempotencyKey: key,
        messageKind: "reliable-work.graceful",
        payloadReference: `test://inbox/${key}`,
      });
    }

    const running = runner.run();
    await currentStarted;
    runner.stop();
    releaseCurrent();
    await running;

    const statuses = await pool.query(
      `
        select status, count(*)::integer as count
        from reliable_inbox_messages
        where message_kind = 'reliable-work.graceful'
        group by status
        order by status
      `,
    );
    assert.deepEqual(statuses.rows, [
      { status: "COMPLETED", count: 1 },
      { status: "PENDING", count: 1 },
    ]);
  } finally {
    runner.stop();
    await pool.end();
  }
});

test("a long-running job lease can be renewed and later reclaimed", async () => {
  const firstPool = createDatabasePool(readDatabaseConfig(process.env));
  const secondPool = createDatabasePool(readDatabaseConfig(process.env));
  const first = new ReliableWorkStore(firstPool);
  const second = new ReliableWorkStore(secondPool);

  try {
    const job = await first.enqueueJob({
      jobType: "reliable-work.probe",
      idempotencyKey: "lease-renew-1",
      payloadReference: "test://job/lease-renew-1",
      priority: 100,
      maxAttempts: 3,
    });
    const [claimed] = await first.claimReadyJobs("worker-renew", 1, 100);
    assert.equal(claimed.jobId, job.jobId);
    await delay(50);
    assert.equal(await first.renewLease(job.jobId, "worker-renew", 250), true);

    await delay(100);
    assert.deepEqual(await second.claimReadyJobs("worker-other", 1, 100), []);
    await delay(180);
    const [reclaimed] = await second.claimReadyJobs("worker-other", 1, 1000);
    assert.equal(reclaimed.jobId, job.jobId);
    assert.equal(reclaimed.attemptCount, 2);
    await second.completeJobWithOutbox(job.jobId, "worker-other", {
      destination: "reliable-work.probe",
      idempotencyKey: `job:${job.jobId}`,
      payloadReference: "test://outbox/lease-renew-1",
    });
  } finally {
    await firstPool.end();
    await secondPool.end();
  }
});

test("persisted Inbox work survives a submitting process restart", async () => {
  const submittingPool = createDatabasePool(readDatabaseConfig(process.env));
  const message = {
    sourceId: "t006-restart-source",
    idempotencyKey: "restart-1",
    messageKind: "reliable-work.probe",
    payloadReference: "test://inbox/restart-1",
  };
  await new ReliableWorkStore(submittingPool).acceptInbox(message);
  await submittingPool.end();

  const workerPool = createDatabasePool(readDatabaseConfig(process.env));
  try {
    const runner = new ReliableWorkRunner(new ReliableWorkStore(workerPool));
    assert.equal(await runner.runOnce(), true);
    const result = await workerPool.query(
      `
        select
          (select status from reliable_inbox_messages where source_id = $1 and idempotency_key = $2) as inbox_status,
          (select count(*)::integer from reliable_outbox_messages where payload_reference = $3) as outbox_count
      `,
      [message.sourceId, message.idempotencyKey, message.payloadReference],
    );
    assert.deepEqual(result.rows[0], {
      inbox_status: "COMPLETED",
      outbox_count: 1,
    });
  } finally {
    await workerPool.end();
  }
});
