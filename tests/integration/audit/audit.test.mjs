import assert from "node:assert/strict";
import { copyFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";

import { readDatabaseConfig } from "../../../apps/platform/dist/database/config.js";
import {
  createDatabasePool,
  withTransaction,
} from "../../../apps/platform/dist/database/database.js";
import {
  applyMigrations,
  getMigrationStatus,
} from "../../../apps/platform/dist/database/migrations.js";
import { AuditStore } from "../../../apps/platform/dist/modules/audit/public.js";

const migrationDirectory = fileURLToPath(
  new URL("../../../apps/platform/migrations/", import.meta.url),
);
const migrationFilePattern = /^(\d{4})_[a-z0-9_]+\.up\.sql$/u;
const repositoryMigrations = (await readdir(migrationDirectory))
  .map((fileName) => {
    const match = migrationFilePattern.exec(fileName);
    return match ? { fileName, version: Number(match[1]) } : null;
  })
  .filter((migration) => migration !== null)
  .sort((left, right) => left.version - right.version);
const latestMigrationVersion = repositoryMigrations.at(-1)?.version ?? 0;
const upgradeFromV3 = repositoryMigrations.filter(
  (migration) => migration.version > 3,
);

async function resetDatabase(pool) {
  const result = await pool.query("select current_database() as name");
  if (!/^nop_t010_[a-f0-9]{32}$/u.test(result.rows[0]?.name ?? "")) {
    throw new Error("Refusing to reset a database not created for T010");
  }
  await pool.query("drop schema if exists public cascade");
  await pool.query("create schema public");
}

function append(store, pool, input) {
  return withTransaction(pool, (client) => store.append(client, input));
}

test("audit foundation exposes an append-only PostgreSQL store", async () => {
  await assert.doesNotReject(
    import("../../../apps/platform/dist/modules/audit/public.js"),
  );
});

test("an empty or v3 database upgrades once to the current migration", async () => {
  const pool = createDatabasePool(readDatabaseConfig(process.env));
  const previous = await mkdtemp(join(tmpdir(), "nop-audit-v3-"));
  try {
    await resetDatabase(pool);
    const v3Migrations = repositoryMigrations.filter(
      (migration) => migration.version <= 3,
    );
    for (const migration of v3Migrations) {
      await copyFile(
        join(migrationDirectory, migration.fileName),
        join(previous, migration.fileName),
      );
    }

    assert.equal((await applyMigrations(pool, previous)).currentVersion, 3);
    const upgrade = await applyMigrations(pool);
    assert.equal(upgrade.appliedCount, upgradeFromV3.length);
    assert.equal(upgrade.currentVersion, latestMigrationVersion);
    const repeated = await applyMigrations(pool);
    assert.equal(repeated.appliedCount, 0);
    assert.equal(repeated.currentVersion, latestMigrationVersion);
    assert.deepEqual(await getMigrationStatus(pool), {
      currentVersion: latestMigrationVersion,
      latestVersion: latestMigrationVersion,
      pendingVersions: [],
      compatible: true,
    });

    await resetDatabase(pool);
    const emptyUpgrade = await applyMigrations(pool);
    assert.equal(emptyUpgrade.appliedCount, repositoryMigrations.length);
    assert.equal(emptyUpgrade.currentVersion, latestMigrationVersion);
    assert.deepEqual(await getMigrationStatus(pool), {
      currentVersion: latestMigrationVersion,
      latestVersion: latestMigrationVersion,
      pendingVersions: [],
      compatible: true,
    });
  } finally {
    await pool.end();
    await rm(previous, { recursive: true, force: true });
  }
});

test("service and system actors remain distinct from users", async () => {
  const pool = createDatabasePool(readDatabaseConfig(process.env));
  const store = new AuditStore(pool);
  try {
    await append(store, pool, {
      actor: { type: "SERVICE", id: "collector" },
      eventType: "SECURITY.SERVICE_ACCEPTED",
      source: "service-auth",
      outcome: "SUCCESS",
      correlationId: "actor-service",
    });
    await append(store, pool, {
      actor: { type: "SYSTEM", id: "platform-worker" },
      eventType: "SYSTEM.CLEANUP_COMPLETED",
      source: "platform-worker",
      outcome: "SUCCESS",
      correlationId: "actor-system",
    });

    assert.equal(
      (await store.query({ actorType: "SERVICE" })).events[0]?.actorId,
      "collector",
    );
    assert.equal(
      (await store.query({ actorType: "SYSTEM" })).events[0]?.actorId,
      "platform-worker",
    );
  } finally {
    await pool.end();
  }
});

test("business rollback also rolls back its required audit event", async () => {
  const pool = createDatabasePool(readDatabaseConfig(process.env));
  const store = new AuditStore(pool);
  try {
    await pool.query(
      "create table if not exists audit_business_probe (id uuid primary key)",
    );
    const probeId = randomUUID();
    await assert.rejects(
      withTransaction(pool, async (client) => {
        await client.query(
          "insert into audit_business_probe (id) values ($1)",
          [probeId],
        );
        await store.append(client, {
          actor: { type: "SYSTEM" },
          eventType: "SYSTEM.PROBE_CHANGED",
          source: "audit-integration",
          outcome: "SUCCESS",
          correlationId: `rollback-${probeId}`,
        });
        throw new Error("test rollback");
      }),
      /test rollback/u,
    );
    assert.equal(
      (
        await pool.query(
          "select count(*)::integer as count from audit_business_probe where id = $1",
          [probeId],
        )
      ).rows[0].count,
      0,
    );
    assert.equal(
      (await store.query({ correlationId: `rollback-${probeId}` })).events
        .length,
      0,
    );
  } finally {
    await pool.end();
  }
});

test("a required audit failure rolls back the business transaction", async () => {
  const pool = createDatabasePool(readDatabaseConfig(process.env));
  const store = new AuditStore(pool);
  try {
    const probeId = randomUUID();
    await assert.rejects(
      withTransaction(pool, async (client) => {
        await client.query(
          "insert into audit_business_probe (id) values ($1)",
          [probeId],
        );
        await store.append(client, {
          actor: { type: "SYSTEM" },
          eventType: "invalid event type",
          source: "audit-integration",
          outcome: "SUCCESS",
        });
      }),
      /eventType/u,
    );
    assert.equal(
      (
        await pool.query(
          "select count(*)::integer as count from audit_business_probe where id = $1",
          [probeId],
        )
      ).rows[0].count,
      0,
    );
    assert.equal(store.metrics.writesFailed, 1);
  } finally {
    await pool.end();
  }
});

test("ordinary SQL cannot update, delete, or truncate audit history", async () => {
  const pool = createDatabasePool(readDatabaseConfig(process.env));
  const eventId = (
    await pool.query(
      "select event_id from audit_events order by occurred_at limit 1",
    )
  ).rows[0]?.event_id;
  try {
    assert.ok(eventId);
    await assert.rejects(
      pool.query(
        "update audit_events set source = 'changed' where event_id = $1",
        [eventId],
      ),
      /append-only/u,
    );
    await assert.rejects(
      pool.query("delete from audit_events where event_id = $1", [eventId]),
      /append-only/u,
    );
    await assert.rejects(pool.query("truncate audit_events"), /append-only/u);
    assert.equal(
      (
        await pool.query(
          "select count(*)::integer as count from audit_events where event_id = $1",
          [eventId],
        )
      ).rows[0].count,
      1,
    );
  } finally {
    await pool.end();
  }
});

test("invalid actors and outcomes are rejected without persistence", async () => {
  const pool = createDatabasePool(readDatabaseConfig(process.env));
  const store = new AuditStore(pool);
  try {
    await assert.rejects(
      append(store, pool, {
        actor: { type: "ROBOT", id: "robot-1" },
        eventType: "SECURITY.INVALID_ACTOR",
        source: "audit-integration",
        outcome: "FAILED",
        failureCategory: "VALIDATION",
      }),
      /actorType/u,
    );
    await assert.rejects(
      append(store, pool, {
        actor: { type: "SYSTEM" },
        eventType: "SECURITY.INVALID_OUTCOME",
        source: "audit-integration",
        outcome: "MAYBE",
        failureCategory: "VALIDATION",
      }),
      /outcome/u,
    );
    assert.equal(
      (await store.query({ eventType: "SECURITY.INVALID_ACTOR" })).events
        .length,
      0,
    );
  } finally {
    await pool.end();
  }
});

test("redacted fields never enter PostgreSQL and update bounded metrics", async () => {
  const pool = createDatabasePool(readDatabaseConfig(process.env));
  const store = new AuditStore(pool);
  const protectedValue = "t010-database-protected-not-for-output";
  const correlationId = `redaction-${randomUUID()}`;
  try {
    const appended = await append(store, pool, {
      actor: { type: "SERVICE", id: "collector" },
      eventType: "SECURITY.CREDENTIAL_REJECTED",
      source: "service-auth",
      outcome: "DENIED",
      failureCategory: "INVALID_CREDENTIAL",
      correlationId,
      details: {
        reasonCategory: "credential-invalid",
        metadata: { nested: [{ Authorization: protectedValue }] },
      },
    });
    const stored = await pool.query(
      "select details::text as details, event_hash from audit_events where event_id = $1",
      [appended.eventId],
    );
    assert.equal(
      `${stored.rows[0]?.details}${stored.rows[0]?.event_hash}`.includes(
        protectedValue,
      ),
      false,
      "protected material entered the audit table",
    );
    assert.equal(
      (await store.query({ correlationId })).events[0]?.details.reasonCategory,
      "credential-invalid",
    );
    assert.equal(store.metrics.writesSucceeded, 1);
    assert.equal(store.metrics.rejectedFieldCount, 1);
    assert.ok(store.metrics.writeLatencyMsTotal >= 0);
  } finally {
    await pool.end();
  }
});

test("concurrent appends retain every distinct event", async () => {
  const pool = createDatabasePool(
    readDatabaseConfig({ ...process.env, DATABASE_POOL_MAX: "12" }),
  );
  const store = new AuditStore(pool);
  const correlationId = `concurrent-${randomUUID()}`;
  try {
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        append(store, pool, {
          actor: { type: "SYSTEM" },
          eventType: "SYSTEM.CONCURRENT_APPEND",
          source: "audit-integration",
          outcome: "SUCCESS",
          correlationId,
          idempotencyKey: `concurrent-${index}`,
          details: { metadata: { sequence: index } },
        }),
      ),
    );
    assert.equal(
      (await store.query({ correlationId, limit: 20 })).events.length,
      12,
    );
  } finally {
    await pool.end();
  }
});

test("cursor pagination is stable and bounded", async () => {
  const pool = createDatabasePool(readDatabaseConfig(process.env));
  const store = new AuditStore(pool);
  const correlationId = `page-${randomUUID()}`;
  try {
    for (let index = 0; index < 5; index += 1) {
      await append(store, pool, {
        actor: { type: "SYSTEM" },
        eventType: "SYSTEM.PAGE_TEST",
        source: "audit-integration",
        outcome: "SUCCESS",
        correlationId,
        details: { metadata: { sequence: index } },
      });
    }
    const first = await store.query({ correlationId, limit: 2 });
    const second = await store.query({
      correlationId,
      limit: 2,
      cursor: first.nextCursor,
    });
    const third = await store.query({
      correlationId,
      limit: 2,
      cursor: second.nextCursor,
    });
    const ids = [...first.events, ...second.events, ...third.events].map(
      (event) => event.eventId,
    );
    assert.equal(ids.length, 5);
    assert.equal(new Set(ids).size, 5);
    assert.equal(third.nextCursor, null);
    await assert.rejects(store.query({ limit: 101 }), /between 1 and 100/u);
  } finally {
    await pool.end();
  }
});

test("an idempotent retry reuses one event and conflicting reuse fails", async () => {
  const pool = createDatabasePool(readDatabaseConfig(process.env));
  const store = new AuditStore(pool);
  const idempotencyKey = `retry-${randomUUID()}`;
  const input = {
    actor: { type: "SERVICE", id: "platform-worker" },
    eventType: "SYSTEM.RETRY_TEST",
    source: "platform-worker",
    outcome: "SUCCESS",
    idempotencyKey,
    correlationId: idempotencyKey,
  };
  try {
    const first = await append(store, pool, input);
    const retry = await append(store, pool, input);
    assert.equal(first.created, true);
    assert.equal(retry.created, false);
    assert.equal(retry.eventId, first.eventId);
    assert.equal(
      (await store.query({ correlationId: idempotencyKey })).events.length,
      1,
    );
    await assert.rejects(
      append(store, pool, { ...input, eventType: "SYSTEM.DIFFERENT_EVENT" }),
      /idempotency key conflicts/u,
    );
  } finally {
    await pool.end();
  }
});

test("committed audit history survives pool restart", async () => {
  let pool = createDatabasePool(readDatabaseConfig(process.env));
  const correlationId = `restart-${randomUUID()}`;
  await append(new AuditStore(pool), pool, {
    actor: { type: "UNKNOWN" },
    eventType: "SECURITY.UNKNOWN_ACTOR_RECORDED",
    source: "public-boundary",
    outcome: "DENIED",
    failureCategory: "UNAUTHENTICATED",
    correlationId,
  });
  await pool.end();
  pool = createDatabasePool(readDatabaseConfig(process.env));
  try {
    const events = (await new AuditStore(pool).query({ correlationId })).events;
    assert.equal(events.length, 1);
    assert.equal(events[0]?.actorType, "UNKNOWN");
  } finally {
    await pool.end();
  }
});

test("a user audit event is appended and found by correlation", async () => {
  const pool = createDatabasePool(readDatabaseConfig(process.env));
  const store = new AuditStore(pool);
  try {
    const client = await pool.connect();
    let appended;
    try {
      await client.query("begin");
      appended = await store.append(client, {
        actor: { type: "USER", id: "user-001" },
        eventType: "SECURITY.TEST_SUCCEEDED",
        source: "integration-test",
        outcome: "SUCCESS",
        resource: { type: "test-resource", id: "resource-001" },
        requestId: "request-001",
        correlationId: "correlation-001",
        details: { changedFields: ["displayName"] },
      });
      await client.query("commit");
    } finally {
      client.release();
    }

    const page = await store.query({ correlationId: "correlation-001" });
    assert.equal(appended.created, true);
    assert.equal(page.events.length, 1);
    assert.equal(page.events[0]?.actorType, "USER");
    assert.equal(page.events[0]?.requestId, "request-001");
  } finally {
    await pool.end();
  }
});
