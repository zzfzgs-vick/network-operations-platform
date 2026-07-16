import assert from "node:assert/strict";
import { copyFile, mkdtemp, readdir, rm } from "node:fs/promises";
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
import { PostgresAuthorizationService } from "../../../apps/platform/dist/modules/identity-access/adapters/postgres/postgres-authorization-service.js";
import { PostgresLocalIdentityService } from "../../../apps/platform/dist/modules/identity-access/adapters/postgres/postgres-local-identity-service.js";
import {
  PERMISSION_CODES,
  SENSITIVE_PERMISSION_CODES,
} from "../../../apps/platform/dist/modules/identity-access/public.js";

const migrationDirectory = fileURLToPath(
  new URL("../../../apps/platform/migrations/", import.meta.url),
);
const password = "t012-test-only-administrator-passphrase";
const userPassword = "t012-test-only-ordinary-user-passphrase";

async function resetDatabase(pool) {
  const result = await pool.query("select current_database() as name");
  if (!/^nop_t012_[a-f0-9]{32}$/u.test(result.rows[0]?.name ?? "")) {
    throw new Error("Refusing to reset a database not created for T012");
  }
  await pool.query("drop schema if exists public cascade");
  await pool.query("create schema public");
}

function principal(state) {
  return {
    kind: "platform-user",
    userId: state.userId,
    authorizationVersion: state.authorizationVersion,
  };
}

test("permission RBAC foundation", async (t) => {
  const pool = createDatabasePool(readDatabaseConfig(process.env));
  const previous = await mkdtemp(join(tmpdir(), "nop-rbac-v5-"));
  const audit = new AuditStore(pool);
  const authorization = new PostgresAuthorizationService(pool, audit);
  const identity = new PostgresLocalIdentityService(pool, audit);
  let admin;
  let ordinary;
  let customRole;

  try {
    await t.test(
      "v5 and empty databases migrate once to the latest version",
      async () => {
        const migrations = (await readdir(migrationDirectory))
          .filter((file) => /^\d{4}_[a-z0-9_]+\.up\.sql$/u.test(file))
          .sort();
        const latestVersion = Number(migrations.at(-1)?.slice(0, 4));
        const fromV5 = migrations.filter(
          (file) => Number(file.slice(0, 4)) > 5,
        );
        for (const file of migrations.filter(
          (item) => Number(item.slice(0, 4)) <= 5,
        )) {
          await copyFile(join(migrationDirectory, file), join(previous, file));
        }
        await resetDatabase(pool);
        assert.equal((await applyMigrations(pool, previous)).currentVersion, 5);
        assert.deepEqual(await applyMigrations(pool), {
          appliedCount: fromV5.length,
          currentVersion: latestVersion,
        });
        assert.equal((await applyMigrations(pool)).appliedCount, 0);
        assert.deepEqual(await getMigrationStatus(pool), {
          currentVersion: latestVersion,
          latestVersion,
          pendingVersions: [],
          compatible: true,
        });
        await resetDatabase(pool);
        assert.deepEqual(await applyMigrations(pool), {
          appliedCount: migrations.length,
          currentVersion: latestVersion,
        });
      },
    );

    await t.test(
      "five default templates use stable Permission codes",
      async () => {
        const permissions = await pool.query(
          "select permission_code, sensitive from public.permissions order by permission_code",
        );
        assert.deepEqual(
          permissions.rows.map((row) => row.permission_code),
          [...PERMISSION_CODES].sort(),
        );
        assert.deepEqual(
          permissions.rows
            .filter((row) => row.sensitive)
            .map((row) => row.permission_code),
          [...SENSITIVE_PERMISSION_CODES].sort(),
        );
        const roles = await authorization.listDefaultRoles();
        assert.deepEqual(
          roles.map((role) => role.roleKey),
          [
            "auditor",
            "executive-viewer",
            "network-administrator",
            "operator",
            "system-administrator",
          ],
        );
        const system = roles.find(
          (role) => role.roleKey === "system-administrator",
        );
        assert.equal(system.permissions.includes("roles.manage"), true);
        assert.deepEqual(
          roles.find((role) => role.roleKey === "executive-viewer")
            ?.permissions,
          ["dashboard.executive.read"],
        );
      },
    );

    await t.test(
      "bootstrap administrator receives the System Administrator template",
      async () => {
        admin = await identity.bootstrapAdministrator({
          username: "First.Admin",
          password,
          requestId: "t012-bootstrap",
        });
        const state = await authorization.getAuthorizationState(admin.userId);
        assert.equal(state.permissions.includes("roles.manage"), true);
        assert.equal(state.permissions.includes("restore.execute"), true);
      },
    );

    await t.test(
      "default deny prevents a user without roles from changing RBAC",
      async () => {
        ordinary = await identity.createUser({
          username: "Ordinary.User",
          password: userPassword,
          audit: { actor: { type: "USER", id: admin.userId } },
        });
        const ordinaryState = await authorization.getAuthorizationState(
          ordinary.userId,
        );
        assert.equal(
          await authorization.authorize(
            principal(ordinaryState),
            "assets.read",
            { requestId: "t012-default-deny" },
          ),
          false,
        );
        const countBefore = (
          await pool.query(
            "select count(*)::integer as count from public.roles",
          )
        ).rows[0].count;
        await assert.rejects(
          authorization.createRole({
            actor: principal(ordinaryState),
            name: "Unauthorized Role",
            permissions: ["assets.read"],
          }),
          /forbidden/u,
        );
        assert.equal(
          (
            await pool.query(
              "select count(*)::integer as count from public.roles",
            )
          ).rows[0].count,
          countBefore,
        );
      },
    );

    await t.test(
      "custom Role authorization survives rename and ignores Role names",
      async () => {
        let adminState = await authorization.getAuthorizationState(
          admin.userId,
        );
        customRole = await authorization.createRole({
          actor: principal(adminState),
          name: "Read Only Custom",
          permissions: ["assets.read"],
          context: { requestId: "t012-create-role" },
        });
        await authorization.assignRole({
          actor: principal(adminState),
          userId: ordinary.userId,
          roleId: customRole.roleId,
        });
        const assigned = await authorization.getAuthorizationState(
          ordinary.userId,
        );
        assert.equal(assigned.authorizationVersion, 2);
        assert.equal(
          await authorization.authorize(principal(assigned), "assets.read"),
          true,
        );
        assert.equal(
          await authorization.authorize(principal(assigned), "roles.manage"),
          false,
        );
        await authorization.renameRole({
          actor: principal(adminState),
          roleId: customRole.roleId,
          name: "Renamed Without Semantics",
        });
        const afterRename = await authorization.getAuthorizationState(
          ordinary.userId,
        );
        assert.equal(
          afterRename.authorizationVersion,
          assigned.authorizationVersion,
        );
        assert.equal(
          await authorization.authorize(principal(afterRename), "assets.read"),
          true,
        );
      },
    );

    await t.test(
      "disabled users and stale authorization versions are denied",
      async () => {
        const current = await authorization.getAuthorizationState(
          ordinary.userId,
        );
        await identity.disableUser({
          userId: ordinary.userId,
          audit: { actor: { type: "USER", id: admin.userId } },
        });
        const disabled = await authorization.getAuthorizationState(
          ordinary.userId,
        );
        assert.equal(
          disabled.authorizationVersion,
          current.authorizationVersion + 1,
        );
        assert.equal(
          await authorization.authorize(principal(current), "assets.read"),
          false,
        );
        assert.equal(
          await authorization.authorize(principal(disabled), "assets.read"),
          false,
        );
        await identity.enableUser({
          userId: ordinary.userId,
          audit: { actor: { type: "USER", id: admin.userId } },
        });
      },
    );

    await t.test(
      "concurrent Role assignments increment authorizationVersion safely",
      async () => {
        const adminState = await authorization.getAuthorizationState(
          admin.userId,
        );
        const first = await authorization.createRole({
          actor: principal(adminState),
          name: "Concurrent First",
          permissions: ["alerts.read"],
        });
        const second = await authorization.createRole({
          actor: principal(adminState),
          name: "Concurrent Second",
          permissions: ["topology.read"],
        });
        const before = await authorization.getAuthorizationState(
          ordinary.userId,
        );
        await Promise.all([
          authorization.assignRole({
            actor: principal(adminState),
            userId: ordinary.userId,
            roleId: first.roleId,
          }),
          authorization.assignRole({
            actor: principal(adminState),
            userId: ordinary.userId,
            roleId: second.roleId,
          }),
        ]);
        const after = await authorization.getAuthorizationState(
          ordinary.userId,
        );
        assert.equal(
          after.authorizationVersion,
          before.authorizationVersion + 2,
        );
      },
    );

    await t.test(
      "Permission changes invalidate assigned authorization contexts",
      async () => {
        const adminState = await authorization.getAuthorizationState(
          admin.userId,
        );
        const before = await authorization.getAuthorizationState(
          ordinary.userId,
        );
        await authorization.setRolePermissions({
          actor: principal(adminState),
          roleId: customRole.roleId,
          permissions: ["assets.read", "alerts.read"],
        });
        const after = await authorization.getAuthorizationState(
          ordinary.userId,
        );
        assert.equal(
          after.authorizationVersion,
          before.authorizationVersion + 1,
        );
        assert.equal(
          await authorization.authorize(principal(before), "assets.read"),
          false,
        );
        assert.equal(
          await authorization.authorize(principal(after), "alerts.read"),
          true,
        );
      },
    );

    await t.test("service identities cannot enter user RBAC", async () => {
      assert.equal(
        await authorization.authorize(
          { kind: "internal-service", service: "collector" },
          "assets.read",
        ),
        false,
      );
    });

    await t.test(
      "Role changes and denials are append-only audited",
      async () => {
        const events = await audit.query({
          eventType: "AUTHORIZATION.ROLE_CREATED",
          limit: 20,
        });
        assert.ok(events.events.length >= 3);
        assert.equal(
          events.events.every((event) => event.actorType === "USER"),
          true,
        );
        const denied = await audit.query({
          eventType: "AUTHORIZATION.PERMISSION_DENIED",
          limit: 20,
        });
        assert.ok(denied.events.length >= 1);
        assert.equal(
          JSON.stringify(denied.events).includes(userPassword),
          false,
        );
      },
    );

    await t.test(
      "required audit failure rolls back a Role mutation",
      async () => {
        const failing = new PostgresAuthorizationService(pool, {
          async append() {
            throw new Error("audit unavailable");
          },
        });
        const adminState = await authorization.getAuthorizationState(
          admin.userId,
        );
        await assert.rejects(
          failing.createRole({
            actor: principal(adminState),
            name: "Must Roll Back",
            permissions: ["assets.read"],
          }),
          /audit unavailable/u,
        );
        assert.equal(
          (
            await pool.query(
              "select count(*)::integer as count from public.roles where name_normalized = 'must roll back'",
            )
          ).rows[0].count,
          0,
        );
      },
    );
  } finally {
    await pool.end();
    await rm(previous, { recursive: true, force: true });
  }
});
