import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";

import { readDatabaseConfig } from "../../../apps/platform/dist/database/config.js";
import { createDatabasePool } from "../../../apps/platform/dist/database/database.js";
import {
  applyMigrations,
  getMigrationStatus,
} from "../../../apps/platform/dist/database/migrations.js";
import { AuditStore } from "../../../apps/platform/dist/modules/audit/public.js";
import { PostgresLocalIdentityService } from "../../../apps/platform/dist/modules/identity-access/adapters/postgres/postgres-local-identity-service.js";
import {
  AuthenticationRejectedError,
  BootstrapClosedError,
  verifyPassword,
} from "../../../apps/platform/dist/modules/identity-access/public.js";

const migrationDirectory = fileURLToPath(
  new URL("../../../apps/platform/migrations/", import.meta.url),
);
const administratorPassword = "first-admin-test-only-passphrase";
const replacementPassword = "replacement-test-only-passphrase";
const auditContext = {
  actor: { type: "SYSTEM", id: "local-auth-test" },
  requestId: "t011-local-auth",
};

async function resetDatabase(pool) {
  const result = await pool.query("select current_database() as name");
  if (!/^nop_t011_[a-f0-9]{32}$/u.test(result.rows[0]?.name ?? "")) {
    throw new Error("Refusing to reset a database not created for T011");
  }
  await pool.query("drop schema if exists public cascade");
  await pool.query("create schema public");
}

function service(pool, audit = new AuditStore(pool)) {
  return new PostgresLocalIdentityService(pool, audit);
}

test("local authentication foundation", async (t) => {
  let pool = createDatabasePool(readDatabaseConfig(process.env));
  const previous = await mkdtemp(join(tmpdir(), "nop-local-auth-v4-"));

  try {
    await t.test(
      "empty and v4 databases upgrade once to the latest version",
      async () => {
        await resetDatabase(pool);
        const files = (await readdir(migrationDirectory))
          .filter((file) => /^000[1-4]_.*\.up\.sql$/u.test(file))
          .sort();
        for (const file of files) {
          await copyFile(join(migrationDirectory, file), join(previous, file));
        }

        assert.equal((await applyMigrations(pool, previous)).currentVersion, 4);
        assert.deepEqual(await applyMigrations(pool), {
          appliedCount: 1,
          currentVersion: 5,
        });
        assert.equal((await applyMigrations(pool)).appliedCount, 0);
        assert.deepEqual(await getMigrationStatus(pool), {
          currentVersion: 5,
          latestVersion: 5,
          pendingVersions: [],
          compatible: true,
        });

        await resetDatabase(pool);
        assert.deepEqual(await applyMigrations(pool), {
          appliedCount: 5,
          currentVersion: 5,
        });
      },
    );

    await t.test(
      "controlled bootstrap command accepts a protected file and returns a safe summary",
      async () => {
        const passwordFile = join(previous, "administrator-password");
        await writeFile(passwordFile, `${administratorPassword}\r\n`, "utf8");
        await chmod(passwordFile, 0o600);
        const environment = {
          ...process.env,
          ADMIN_USERNAME: "Command.Admin",
          ADMIN_PASSWORD_FILE: passwordFile,
        };
        delete environment.ADMIN_PASSWORD;
        const command = spawnSync(
          process.execPath,
          ["apps/platform/dist/modules/identity-access/bootstrap-admin.js"],
          { encoding: "utf8", env: environment },
        );
        assert.equal(command.status, 0, command.stderr);
        const summary = JSON.parse(command.stdout);
        assert.equal(summary.status, "initialized");
        assert.equal(summary.username, "Command.Admin");
        assert.equal(command.stdout.includes(administratorPassword), false);

        const repeated = spawnSync(
          process.execPath,
          ["apps/platform/dist/modules/identity-access/bootstrap-admin.js"],
          { encoding: "utf8", env: environment },
        );
        assert.equal(repeated.status, 1);
        assert.match(repeated.stderr, /already complete/u);
        assert.equal(repeated.stderr.includes(administratorPassword), false);

        await resetDatabase(pool);
        await applyMigrations(pool);
      },
    );

    await t.test(
      "bootstrap creates one safe user and one append-only audit event",
      async () => {
        const identity = service(pool);
        const user = await identity.bootstrapAdministrator({
          username: "First.Admin",
          password: administratorPassword,
          requestId: "bootstrap-first",
        });

        assert.match(user.userId, /^[a-f0-9-]{36}$/u);
        assert.equal(user.username, "First.Admin");
        assert.equal(user.status, "ENABLED");
        assert.equal("passwordHash" in user, false);
        assert.equal(
          JSON.stringify(user).includes(administratorPassword),
          false,
        );

        const stored = await pool.query(
          `select u.user_id, u.username, u.username_normalized, c.password_hash,
                c.must_change_password, b.administrator_user_id
         from platform_users u
         join local_credentials c using (user_id)
         join platform_bootstrap_state b on b.administrator_user_id = u.user_id`,
        );
        assert.equal(stored.rows.length, 1);
        assert.equal(stored.rows[0].username_normalized, "first.admin");
        assert.match(stored.rows[0].password_hash, /^\$argon2id\$/u);
        assert.equal(
          stored.rows[0].password_hash.includes(administratorPassword),
          false,
        );
        assert.equal(stored.rows[0].must_change_password, true);

        const audit = await pool.query(
          `select actor_type, actor_id, event_type, outcome, resource_id, details::text
         from audit_events where event_type = 'IDENTITY.ADMIN_BOOTSTRAPPED'`,
        );
        assert.equal(audit.rows.length, 1);
        assert.deepEqual(
          {
            actor_type: audit.rows[0].actor_type,
            actor_id: audit.rows[0].actor_id,
            event_type: audit.rows[0].event_type,
            outcome: audit.rows[0].outcome,
            resource_id: audit.rows[0].resource_id,
          },
          {
            actor_type: "SYSTEM",
            actor_id: "local-bootstrap",
            event_type: "IDENTITY.ADMIN_BOOTSTRAPPED",
            outcome: "SUCCESS",
            resource_id: user.userId,
          },
        );
        assert.equal(
          audit.rows[0].details.includes(administratorPassword),
          false,
        );

        await assert.rejects(
          identity.bootstrapAdministrator({
            username: "Second.Admin",
            password: replacementPassword,
          }),
          BootstrapClosedError,
        );
      },
    );

    await t.test(
      "concurrent bootstrap permits exactly one committed administrator",
      async () => {
        await resetDatabase(pool);
        await applyMigrations(pool);
        const identity = service(pool);
        const results = await Promise.allSettled([
          identity.bootstrapAdministrator({
            username: "Concurrent.One",
            password: administratorPassword,
          }),
          identity.bootstrapAdministrator({
            username: "Concurrent.Two",
            password: replacementPassword,
          }),
        ]);

        assert.equal(
          results.filter((result) => result.status === "fulfilled").length,
          1,
        );
        assert.equal(
          results.filter((result) => result.status === "rejected").length,
          1,
        );
        assert.equal(
          (
            await pool.query(
              "select count(*)::integer as count from platform_users",
            )
          ).rows[0].count,
          1,
        );
        assert.equal(
          (
            await pool.query(
              "select count(*)::integer as count from audit_events where event_type = 'IDENTITY.ADMIN_BOOTSTRAPPED'",
            )
          ).rows[0].count,
          1,
        );
      },
    );

    await t.test(
      "audit failure rolls back bootstrap without closing it",
      async () => {
        await resetDatabase(pool);
        await applyMigrations(pool);
        await assert.rejects(
          service(pool).createUser({
            username: "Premature.User",
            password: administratorPassword,
            audit: auditContext,
          }),
          /Administrator bootstrap is required/u,
        );
        const failingAudit = {
          append: async () => {
            throw new Error("controlled audit failure");
          },
        };
        await assert.rejects(
          service(pool, failingAudit).bootstrapAdministrator({
            username: "Rollback.Admin",
            password: administratorPassword,
          }),
          /controlled audit failure/u,
        );
        assert.equal(
          (
            await pool.query(
              "select count(*)::integer as count from platform_users",
            )
          ).rows[0].count,
          0,
        );
        const user = await service(pool).bootstrapAdministrator({
          username: "Recovered.Admin",
          password: administratorPassword,
        });
        assert.equal(user.username, "Recovered.Admin");
      },
    );

    await t.test(
      "authentication is uniform, bounded and rejects disabled users",
      async () => {
        const identity = service(pool);
        const success = await identity.authenticate({
          username: "recovered.admin",
          password: administratorPassword,
          source: "integration-test",
        });
        assert.equal(success.username, "Recovered.Admin");
        assert.equal(success.mustChangePassword, true);

        for (const username of ["recovered.admin", "not-a-user"]) {
          await assert.rejects(
            identity.authenticate({
              username,
              password: "incorrect-test-only-passphrase",
              source: "integration-test",
              ...(username === "not-a-user"
                ? {
                    clientSummary: "integration-client",
                    requestId: "t011-authentication-failure",
                  }
                : {}),
            }),
            (error) => {
              assert.ok(error instanceof AuthenticationRejectedError);
              assert.equal(error.message, "Authentication failed");
              return true;
            },
          );
        }
        assert.equal(
          (
            await pool.query(
              "select count(*)::integer as count from audit_events where event_type = 'IDENTITY.AUTHENTICATION_FAILED'",
            )
          ).rows[0].count,
          2,
        );
        assert.equal(
          (
            await pool.query(
              `select count(*)::integer as count from audit_events
               where event_type = 'IDENTITY.AUTHENTICATION_FAILED'
                 and resource_type = 'platform-user' and resource_id = $1`,
              [success.userId],
            )
          ).rows[0].count,
          1,
        );
        assert.equal(
          (
            await pool.query(
              "select count(*)::integer as count from local_auth_throttle",
            )
          ).rows[0].count,
          3,
        );
        const correlatedFailure = await pool.query(
          `select request_id, details from audit_events
           where event_type = 'IDENTITY.AUTHENTICATION_FAILED'
             and request_id = 't011-authentication-failure'`,
        );
        assert.equal(correlatedFailure.rowCount, 1);
        assert.deepEqual(correlatedFailure.rows[0].details.metadata, {
          candidateUser: "not-a-user",
          clientSummary: "integration-client",
          sourceAddress: "integration-test",
          temporarilyLocked: false,
        });

        await identity.disableUser({
          userId: success.userId,
          audit: auditContext,
        });
        await assert.rejects(
          identity.authenticate({
            username: "recovered.admin",
            password: administratorPassword,
            source: "disabled-test",
          }),
          AuthenticationRejectedError,
        );
        await identity.enableUser({
          userId: success.userId,
          audit: auditContext,
        });
      },
    );

    await t.test(
      "rename keeps userId stable and normalized usernames unique",
      async () => {
        const identity = service(pool);
        const current = await identity.authenticate({
          username: "recovered.admin",
          password: administratorPassword,
          source: "rename-test",
        });
        const renamed = await identity.renameUser({
          userId: current.userId,
          username: "Renamed.Admin",
          audit: auditContext,
        });
        assert.equal(renamed.userId, current.userId);
        assert.equal(renamed.username, "Renamed.Admin");
        await assert.rejects(
          identity.createUser({
            username: "renamed.admin",
            password: replacementPassword,
            audit: auditContext,
          }),
          /Username is unavailable/u,
        );
      },
    );

    await t.test(
      "first password change and administrator reset preserve safe DTOs",
      async () => {
        const identity = service(pool);
        const current = await identity.authenticate({
          username: "renamed.admin",
          password: administratorPassword,
          source: "password-change-test",
        });
        const changed = await identity.changeInitialPassword({
          userId: current.userId,
          currentPassword: administratorPassword,
          newPassword: replacementPassword,
          audit: { actor: { type: "USER", id: current.userId } },
        });
        assert.equal(changed.mustChangePassword, false);
        assert.equal("passwordHash" in changed, false);
        assert.equal(
          (
            await identity.authenticate({
              username: "renamed.admin",
              password: replacementPassword,
              source: "password-change-test",
            })
          ).mustChangePassword,
          false,
        );

        const reset = await identity.resetPassword({
          userId: current.userId,
          newPassword: administratorPassword,
          audit: auditContext,
        });
        assert.equal(reset.mustChangePassword, true);
        const credential = await pool.query(
          "select password_hash from local_credentials where user_id = $1",
          [current.userId],
        );
        assert.equal(
          await verifyPassword(
            credential.rows[0].password_hash,
            administratorPassword,
          ),
          true,
        );
      },
    );

    await t.test(
      "repeated failures create a bounded persistent lock",
      async () => {
        const identity = service(pool);
        for (let attempt = 0; attempt < 5; attempt += 1) {
          await assert.rejects(
            identity.authenticate({
              username: "renamed.admin",
              password: "incorrect-test-only-passphrase",
              source: `lock-test-${attempt}`,
            }),
            AuthenticationRejectedError,
          );
        }
        const accountLock = await pool.query(
          `select max(failure_count)::integer as failure_count,
                bool_or(locked_until > clock_timestamp()) as locked,
                max(locked_until)::text as locked_until
         from local_auth_throttle where bucket_type = 'ACCOUNT'`,
        );
        assert.equal(accountLock.rows[0].failure_count >= 5, true);
        assert.equal(accountLock.rows[0].locked, true);
        assert.equal(identity.metrics.lockoutApplied >= 1, true);
        await assert.rejects(
          identity.authenticate({
            username: "renamed.admin",
            password: administratorPassword,
            source: "locked-correct-password",
          }),
          AuthenticationRejectedError,
        );
        const unchangedLock = await pool.query(
          `select max(locked_until)::text as locked_until
           from local_auth_throttle where bucket_type = 'ACCOUNT'`,
        );
        assert.equal(
          unchangedLock.rows[0].locked_until,
          accountLock.rows[0].locked_until,
        );
      },
    );

    await t.test(
      "restart cannot reopen bootstrap and counters use bounded dimensions",
      async () => {
        await pool.end();
        pool = createDatabasePool(readDatabaseConfig(process.env));
        const identity = service(pool);
        await assert.rejects(
          identity.bootstrapAdministrator({
            username: "Restart.Admin",
            password: administratorPassword,
          }),
          BootstrapClosedError,
        );
        assert.deepEqual(Object.keys(identity.metrics).sort(), [
          "authenticationFailed",
          "authenticationSucceeded",
          "bootstrapFailed",
          "bootstrapSucceeded",
          "lockoutApplied",
          "lockoutDurationSeconds",
        ]);
      },
    );
  } finally {
    if (!pool.ended) await pool.end();
    await rm(previous, { recursive: true, force: true });
  }
});
