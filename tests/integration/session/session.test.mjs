import assert from "node:assert/strict";
import { copyFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";

import { readWebSessionConfig } from "../../../apps/platform/dist/config/public.js";
import { readDatabaseConfig } from "../../../apps/platform/dist/database/config.js";
import { createDatabasePool } from "../../../apps/platform/dist/database/database.js";
import {
  applyMigrations,
  getMigrationStatus,
} from "../../../apps/platform/dist/database/migrations.js";
import { AuditStore } from "../../../apps/platform/dist/modules/audit/public.js";
import { PostgresLocalIdentityService } from "../../../apps/platform/dist/modules/identity-access/adapters/postgres/postgres-local-identity-service.js";
import { PostgresAuthorizationService } from "../../../apps/platform/dist/modules/identity-access/adapters/postgres/postgres-authorization-service.js";
import { PostgresSessionService } from "../../../apps/platform/dist/modules/identity-access/adapters/postgres/postgres-session-service.js";
import { SessionRejectedError } from "../../../apps/platform/dist/modules/identity-access/public.js";

const migrationDirectory = fileURLToPath(
  new URL("../../../apps/platform/migrations/", import.meta.url),
);
const administratorPassword = "t013-test-only-administrator-password";
const userInitialPassword = "t013-test-only-initial-user-password";
const userPassword = "t013-test-only-current-user-password";
const nextPassword = "t013-test-only-next-user-password";
const auditContext = {
  actor: { type: "SYSTEM", id: "session-test" },
  requestId: "t013-session-test",
};

async function resetDatabase(pool) {
  const result = await pool.query("select current_database() as name");
  if (!/^nop_t013_[a-f0-9]{32}$/u.test(result.rows[0]?.name ?? "")) {
    throw new Error("Refusing to reset a database not created for T013");
  }
  await pool.query("drop schema if exists public cascade");
  await pool.query("create schema public");
}

test("PostgreSQL opaque web sessions", async (t) => {
  let pool = createDatabasePool(readDatabaseConfig(process.env));
  const previous = await mkdtemp(join(tmpdir(), "nop-session-v6-"));
  const config = readWebSessionConfig(process.env);
  let audit;
  let identity;
  let sessions;
  let administrator;
  let user;

  const resetServices = () => {
    audit = new AuditStore(pool);
    identity = new PostgresLocalIdentityService(pool, audit);
    sessions = new PostgresSessionService(pool, audit, config);
  };

  try {
    await t.test(
      "v6 and empty databases migrate once to the latest version",
      async () => {
        const migrations = (await readdir(migrationDirectory))
          .filter((file) => /^\d{4}_[a-z0-9_]+\.up\.sql$/u.test(file))
          .sort();
        const latestVersion = Number(migrations.at(-1)?.slice(0, 4));
        const fromV6 = migrations.filter(
          (file) => Number(file.slice(0, 4)) > 6,
        );
        for (const file of migrations.filter(
          (item) => Number(item.slice(0, 4)) <= 6,
        )) {
          await copyFile(join(migrationDirectory, file), join(previous, file));
        }
        await resetDatabase(pool);
        assert.equal((await applyMigrations(pool, previous)).currentVersion, 6);
        assert.deepEqual(await applyMigrations(pool), {
          appliedCount: fromV6.length,
          currentVersion: latestVersion,
        });
        assert.deepEqual(await applyMigrations(pool), {
          appliedCount: 0,
          currentVersion: latestVersion,
        });
        assert.deepEqual(await getMigrationStatus(pool), {
          currentVersion: latestVersion,
          latestVersion,
          pendingVersions: [],
          compatible: true,
        });
        await resetDatabase(pool);
        assert.equal(
          (await applyMigrations(pool)).appliedCount,
          migrations.length,
        );
        resetServices();
      },
    );

    await t.test(
      "password login issues pre-auth or authenticated sessions",
      async () => {
        administrator = await identity.bootstrapAdministrator({
          username: "session-admin",
          password: administratorPassword,
        });
        const preAuthentication = await sessions.login({
          username: administrator.username,
          password: administratorPassword,
          source: "127.0.0.1",
        });
        assert.equal(preAuthentication.type, "PRE_AUTH");
        assert.ok(
          Date.parse(preAuthentication.expiresAt) - Date.now() <=
            config.preAuthenticationTimeoutMs,
        );

        user = await identity.createUser({
          username: "session-user",
          password: userInitialPassword,
          audit: auditContext,
        });
        user = await identity.changeInitialPassword({
          userId: user.userId,
          currentPassword: userInitialPassword,
          newPassword: userPassword,
          audit: auditContext,
        });
        const authenticated = await sessions.login({
          username: user.username,
          password: userPassword,
          source: "127.0.0.1",
          requestId: "t013-login",
        });
        assert.equal(authenticated.type, "AUTHENTICATED");
        assert.equal(
          (await sessions.validateAuthenticated(authenticated.token)).principal
            ?.userId,
          user.userId,
        );
      },
    );

    await t.test(
      "role permission changes revoke sessions with transactional audit",
      async () => {
        const authorization = new PostgresAuthorizationService(pool, audit);
        const actor = {
          kind: "platform-user",
          userId: administrator.userId,
          authorizationVersion: administrator.authorizationVersion,
        };
        const role = await authorization.createRole({
          actor,
          name: "Session Test Role",
          permissions: ["assets.read"],
        });
        await authorization.assignRole({
          actor,
          userId: user.userId,
          roleId: role.roleId,
        });
        const issued = await sessions.login({
          username: user.username,
          password: userPassword,
          source: "127.0.0.1",
        });
        await authorization.setRolePermissions({
          actor,
          roleId: role.roleId,
          permissions: ["assets.read", "topology.read"],
          context: { requestId: "t013-role-change" },
        });
        await assert.rejects(
          sessions.validateAuthenticated(issued.token),
          SessionRejectedError,
        );
        const event = await pool.query(
          `select count(*)::integer as count from public.audit_events
            where event_type = 'SESSION.ROLE_PERMISSION_CHANGE_REVOKED'
              and request_id = 't013-role-change'`,
        );
        assert.equal(event.rows[0].count, 1);
      },
    );

    await t.test("database stores only a SHA-256 digest", async () => {
      const issued = await sessions.login({
        username: user.username,
        password: userPassword,
        source: "127.0.0.1",
      });
      const row = await pool.query(
        "select token_hash, octet_length(token_hash) as bytes, to_jsonb(s) as record from public.web_sessions s where session_id = $1",
        [issued.sessionId],
      );
      assert.equal(row.rows[0].bytes, 32);
      assert.equal(
        JSON.stringify(row.rows[0].record).includes(issued.token),
        false,
      );
    });

    await t.test("login rotates an existing session token", async () => {
      const first = await sessions.login({
        username: user.username,
        password: userPassword,
        source: "127.0.0.1",
      });
      const second = await sessions.login({
        username: user.username,
        password: userPassword,
        source: "127.0.0.1",
        currentTokens: [first.token],
      });
      assert.notEqual(first.sessionId, second.sessionId);
      assert.notEqual(first.token, second.token);
      await assert.rejects(
        sessions.validateAuthenticated(first.token),
        SessionRejectedError,
      );
      assert.ok(await sessions.validateAuthenticated(second.token));
    });

    await t.test(
      "idle and absolute expiry fail closed without background extension",
      async () => {
        const idle = await sessions.login({
          username: user.username,
          password: userPassword,
          source: "127.0.0.1",
        });
        await pool.query(
          "update public.web_sessions set idle_expires_at = clock_timestamp() - interval '1 second' where session_id = $1",
          [idle.sessionId],
        );
        await assert.rejects(
          sessions.validateAuthenticated(idle.token),
          (error) =>
            error instanceof SessionRejectedError &&
            error.reason === "idle-expired",
        );
        assert.equal(
          (
            await pool.query(
              "select revocation_reason from public.web_sessions where session_id = $1",
              [idle.sessionId],
            )
          ).rows[0].revocation_reason,
          "IDLE_EXPIRED",
        );

        const absolute = await sessions.login({
          username: user.username,
          password: userPassword,
          source: "127.0.0.1",
        });
        await pool.query(
          `update public.web_sessions
            set created_at = clock_timestamp() - interval '2 seconds',
                absolute_expires_at = clock_timestamp() - interval '1 second',
                idle_expires_at = clock_timestamp() - interval '1 second'
          where session_id = $1`,
          [absolute.sessionId],
        );
        await assert.rejects(
          sessions.validateAuthenticated(absolute.token),
          (error) =>
            error instanceof SessionRejectedError &&
            error.reason === "absolute-expired",
        );
        assert.equal(
          (
            await pool.query(
              "select revocation_reason from public.web_sessions where session_id = $1",
              [absolute.sessionId],
            )
          ).rows[0].revocation_reason,
          "ABSOLUTE_EXPIRED",
        );
      },
    );

    await t.test(
      "logout and concurrent logout immediately revoke one session",
      async () => {
        const issued = await sessions.login({
          username: user.username,
          password: userPassword,
          source: "127.0.0.1",
        });
        assert.deepEqual(
          await Promise.all([
            sessions.logout(issued.token),
            sessions.logout(issued.token),
          ]).then((values) => values.sort()),
          [false, true],
        );
        await assert.rejects(
          sessions.validateAuthenticated(issued.token),
          SessionRejectedError,
        );
      },
    );

    await t.test(
      "authorization and credential versions invalidate old sessions",
      async () => {
        const authorization = await sessions.login({
          username: user.username,
          password: userPassword,
          source: "127.0.0.1",
        });
        await pool.query(
          "update public.platform_users set authorization_version = authorization_version + 1 where user_id = $1",
          [user.userId],
        );
        await assert.rejects(
          sessions.validateAuthenticated(authorization.token),
          (error) =>
            error instanceof SessionRejectedError &&
            error.reason === "authorization-changed",
        );
        assert.equal(
          (
            await pool.query(
              "select revocation_reason from public.web_sessions where session_id = $1",
              [authorization.sessionId],
            )
          ).rows[0].revocation_reason,
          "AUTHORIZATION_CHANGED",
        );

        user = await identity.resetPassword({
          userId: user.userId,
          newPassword: nextPassword,
          audit: auditContext,
        });
        const preAuthentication = await sessions.login({
          username: user.username,
          password: nextPassword,
          source: "127.0.0.1",
        });
        assert.equal(preAuthentication.type, "PRE_AUTH");
        await identity.changeInitialPassword({
          userId: user.userId,
          currentPassword: nextPassword,
          newPassword: userPassword,
          audit: auditContext,
        });
        await assert.rejects(
          sessions.validatePreAuthentication(preAuthentication.token),
          SessionRejectedError,
        );
        user = await identity.authenticate({
          username: user.username,
          password: userPassword,
          source: "127.0.0.1",
        });
      },
    );

    await t.test(
      "lifecycle metrics retain only bounded event categories",
      () => {
        const events = new Set(
          sessions.metrics.snapshot().map((item) => item.event),
        );
        assert.deepEqual(
          [...events].sort(),
          [
          "created",
          "expired",
          "rejected",
          "revoked",
            "rotated",
            "validated",
            "version-mismatch",
          ].sort(),
        );
        assert.equal(
          sessions.metrics
            .snapshot()
            .some(
              (item) =>
                "sessionId" in item || "userId" in item || "token" in item,
            ),
          false,
        );
      },
    );

    await t.test(
      "disabled users and disaster recovery invalidate sessions",
      async () => {
        const disabled = await sessions.login({
          username: user.username,
          password: userPassword,
          source: "127.0.0.1",
        });
        await identity.disableUser({
          userId: user.userId,
          audit: auditContext,
        });
        await assert.rejects(
          sessions.validateAuthenticated(disabled.token),
          SessionRejectedError,
        );
        user = await identity.enableUser({
          userId: user.userId,
          audit: auditContext,
        });
        const restored = await sessions.login({
          username: user.username,
          password: userPassword,
          source: "127.0.0.1",
        });
        assert.ok((await sessions.invalidateAllAfterRecovery()) >= 1);
        await assert.rejects(
          sessions.validateAuthenticated(restored.token),
          SessionRejectedError,
        );
      },
    );

    await t.test(
      "process restart retains sessions and database failure fails closed",
      async () => {
        const issued = await sessions.login({
          username: user.username,
          password: userPassword,
          source: "127.0.0.1",
        });
        await pool.end();
        pool = createDatabasePool(readDatabaseConfig(process.env));
        resetServices();
        assert.ok(await sessions.validateAuthenticated(issued.token));
        await pool.end();
        await assert.rejects(sessions.validateAuthenticated(issued.token));
        pool = createDatabasePool(readDatabaseConfig(process.env));
        resetServices();
      },
    );

    await t.test(
      "session lifecycle events are append-only and token-free",
      async () => {
        const rows = await pool.query(
          `select event_type, details::text
           from public.audit_events
          where event_type like 'SESSION.%'`,
        );
        assert.ok(rows.rowCount >= 8);
        assert.equal(
          rows.rows.some((row) => row.details.includes("test-only")),
          false,
        );
        await assert.rejects(
          pool.query("update public.audit_events set details = '{}'::jsonb"),
        );
      },
    );
  } finally {
    await pool.end().catch(() => undefined);
    await rm(previous, { recursive: true, force: true });
  }
});
