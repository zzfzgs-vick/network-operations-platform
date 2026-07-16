import assert from "node:assert/strict";
import { Controller, Get, Module, Req } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import test from "node:test";

import { ApiAppModule } from "../../../apps/platform/dist/bootstrap/api-app.module.js";
import { readDatabaseConfig } from "../../../apps/platform/dist/database/config.js";
import { createDatabasePool } from "../../../apps/platform/dist/database/database.js";
import { AuditStore } from "../../../apps/platform/dist/modules/audit/public.js";
import { PostgresLocalIdentityService } from "../../../apps/platform/dist/modules/identity-access/adapters/postgres/postgres-local-identity-service.js";
import {
  RequirePermission,
  authenticatedUserFrom,
} from "../../../apps/platform/dist/modules/identity-access/public.js";

class SessionProtectedController {
  read(request) {
    return { userId: authenticatedUserFrom(request)?.userId };
  }
}
Controller("session-test")(SessionProtectedController);
Get("protected")(
  SessionProtectedController.prototype,
  "read",
  Object.getOwnPropertyDescriptor(SessionProtectedController.prototype, "read"),
);
Req()(SessionProtectedController.prototype, "read", 0);
RequirePermission("assets.read")(
  SessionProtectedController.prototype,
  "read",
  Object.getOwnPropertyDescriptor(SessionProtectedController.prototype, "read"),
);

class LoginTestModule {}
Module({
  imports: [ApiAppModule],
  controllers: [SessionProtectedController],
})(LoginTestModule);

const adminPassword = "t013-test-only-bootstrap-credential";
const initialPassword = "t013-test-only-first-credential";
const password = "t013-test-only-current-credential";

function issuedCookie(response, name) {
  const header = response.headers
    .getSetCookie()
    .find((item) => item.startsWith(`${name}=`) && !item.includes("Max-Age=0"));
  assert.ok(header, `Expected ${name} response cookie`);
  return header.split(";", 1)[0];
}

test("opaque session HTTP login boundary", async (t) => {
  const pool = createDatabasePool(readDatabaseConfig(process.env));
  const audit = new AuditStore(pool);
  const identity = new PostgresLocalIdentityService(pool, audit);
  const administrator = await identity.bootstrapAdministrator({
    username: "login-admin",
    password: adminPassword,
  });
  let user = await identity.createUser({
    username: "login-user",
    password: initialPassword,
    audit: { actor: { type: "SYSTEM", id: "login-test" } },
  });
  user = await identity.changeInitialPassword({
    userId: user.userId,
    currentPassword: initialPassword,
    newPassword: password,
    audit: { actor: { type: "SYSTEM", id: "login-test" } },
  });
  await pool.query(
    `insert into public.user_role_assignments (user_id, role_id)
     values ($1, '00000000-0000-4000-8000-000000000003')`,
    [user.userId],
  );
  await pool.query(
    "update public.platform_users set authorization_version = authorization_version + 1 where user_id = $1",
    [user.userId],
  );

  const app = await NestFactory.create(LoginTestModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address();
  const origin = `http://127.0.0.1:${address.port}`;

  const login = (username, suppliedPassword, cookie) =>
    globalThis.fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify({ username, password: suppliedPassword }),
    });

  try {
    await t.test(
      "invalid credentials return a uniform token-free error",
      async () => {
        const response = await login("missing-user", "wrong-password");
        const body = await response.text();
        assert.equal(response.status, 401);
        assert.equal(response.headers.get("set-cookie"), null);
        assert.doesNotMatch(body, /wrong-password|argon2|postgres/iu);
      },
    );

    let cookie;
    await t.test(
      "successful login creates a hardened cookie and protected principal",
      async () => {
        const response = await login(user.username, password);
        const body = await response.json();
        const setCookie = response.headers.get("set-cookie");
        cookie = issuedCookie(response, "__Host-nop_session");
        assert.equal(response.status, 200);
        assert.equal(body.status, "AUTHENTICATED");
        assert.equal(JSON.stringify(body).includes("token"), false);
        assert.match(setCookie, /__Host-nop_session=/u);
        assert.match(setCookie, /HttpOnly; Secure; SameSite=Lax/u);
        assert.doesNotMatch(setCookie, /Domain=/iu);
        const protectedResponse = await globalThis.fetch(
          `${origin}/session-test/protected`,
          {
            headers: { cookie },
          },
        );
        assert.equal(protectedResponse.status, 200);
        assert.deepEqual(await protectedResponse.json(), {
          userId: user.userId,
        });
      },
    );

    await t.test(
      "pre-authentication cookie cannot enter protected APIs",
      async () => {
        const response = await login(administrator.username, adminPassword);
        const preAuthCookie = issuedCookie(response, "__Host-nop_preauth");
        assert.equal(
          (await response.json()).status,
          "PRE_AUTHENTICATION_REQUIRED",
        );
        assert.match(preAuthCookie, /^__Host-nop_preauth=/u);
        assert.equal(
          (
            await globalThis.fetch(`${origin}/session-test/protected`, {
              headers: { cookie: preAuthCookie },
            })
          ).status,
          403,
        );
      },
    );

    await t.test(
      "logout clears the cookie and immediately rejects the old token",
      async () => {
        const response = await globalThis.fetch(`${origin}/api/auth/logout`, {
          method: "POST",
          headers: { cookie },
        });
        assert.equal(response.status, 204);
        assert.ok(
          response.headers
            .getSetCookie()
            .every((item) => item.includes("Max-Age=0")),
        );
        const rejected = await globalThis.fetch(
          `${origin}/session-test/protected`,
          { headers: { cookie } },
        );
        assert.equal(rejected.status, 401);
        assert.equal(rejected.headers.get("x-session-status"), "revoked");
      },
    );

    await t.test(
      "only an explicit user-activity marker extends idle expiry",
      async () => {
        const response = await login(user.username, password);
        const activeCookie = issuedCookie(response, "__Host-nop_session");
        const current = await pool.query(
          `select session_id from public.web_sessions
            where user_id = $1 and revoked_at is null
            order by created_at desc limit 1`,
          [user.userId],
        );
        await pool.query(
          `update public.web_sessions
              set idle_expires_at = clock_timestamp() + interval '2 seconds'
            where session_id = $1`,
          [current.rows[0].session_id],
        );
        const activity = await globalThis.fetch(
          `${origin}/session-test/protected`,
          { headers: { cookie: activeCookie, "x-user-activity": "1" } },
        );
        assert.equal(activity.status, 200);
        const extended = await pool.query(
          `select idle_expires_at > clock_timestamp() + interval '20 minutes' as extended
             from public.web_sessions where session_id = $1`,
          [current.rows[0].session_id],
        );
        assert.equal(extended.rows[0].extended, true);
      },
    );

    await t.test("logout revokes both presented session classes", async () => {
      const authenticated = await login(user.username, password);
      const authenticatedCookie = issuedCookie(
        authenticated,
        "__Host-nop_session",
      );
      const authenticatedSession = await pool.query(
        `select session_id from public.web_sessions
          where user_id = $1 order by created_at desc, session_id desc limit 1`,
        [user.userId],
      );
      const preAuthenticated = await login(
        administrator.username,
        adminPassword,
      );
      const preAuthenticatedCookie = issuedCookie(
        preAuthenticated,
        "__Host-nop_preauth",
      );
      const preAuthenticatedSession = await pool.query(
        `select session_id from public.web_sessions
          where user_id = $1 order by created_at desc, session_id desc limit 1`,
        [administrator.userId],
      );
      const response = await globalThis.fetch(`${origin}/api/auth/logout`, {
        method: "POST",
        headers: {
          cookie: `${authenticatedCookie}; ${preAuthenticatedCookie}`,
        },
      });
      assert.equal(response.status, 204);
      const active = await pool.query(
        `select count(*)::integer as count from public.web_sessions
          where session_id in ($1, $2) and revoked_at is null`,
        [
          authenticatedSession.rows[0].session_id,
          preAuthenticatedSession.rows[0].session_id,
        ],
      );
      assert.equal(active.rows[0].count, 0);
    });

    await t.test(
      "authorization version changes invalidate a live cookie",
      async () => {
        const response = await login(user.username, password);
        const currentCookie = issuedCookie(response, "__Host-nop_session");
        await pool.query(
          "update public.platform_users set authorization_version = authorization_version + 1 where user_id = $1",
          [user.userId],
        );
        const rejected = await globalThis.fetch(
          `${origin}/session-test/protected`,
          { headers: { cookie: currentCookie } },
        );
        assert.equal(rejected.status, 401);
        assert.equal(
          rejected.headers.get("x-session-status"),
          "authorization-changed",
        );
      },
    );
  } finally {
    await app.close();
    await pool.end();
  }
});
