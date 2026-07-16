import assert from "node:assert/strict";
import { NestFactory } from "@nestjs/core";
import test from "node:test";

import { ApiAppModule } from "../../../apps/platform/dist/bootstrap/api-app.module.js";
import { readDatabaseConfig } from "../../../apps/platform/dist/database/config.js";
import { createDatabasePool } from "../../../apps/platform/dist/database/database.js";
import { AuditStore } from "../../../apps/platform/dist/modules/audit/public.js";
import { PostgresLocalIdentityService } from "../../../apps/platform/dist/modules/identity-access/adapters/postgres/postgres-local-identity-service.js";

const allowedOrigin = "https://network-operations.test";
const password = "t014-test-only-login-password";

test("browser state changes use independent CSRF protection", async (t) => {
  const pool = createDatabasePool(readDatabaseConfig(process.env));
  const identity = new PostgresLocalIdentityService(pool, new AuditStore(pool));
  const user = await identity.bootstrapAdministrator({
    username: "csrf-admin",
    password,
  });
  const app = await NestFactory.create(ApiAppModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address();
  const origin = `http://127.0.0.1:${address.port}`;
  const login = (requestOrigin) =>
    globalThis.fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: requestOrigin,
        "x-csrf-confirm": "1",
      },
      body: JSON.stringify({ username: user.username, password }),
    });
  try {
    await t.test(
      "cross-site login is rejected before authentication",
      async () => {
        const response = await login("https://attacker.example");
        assert.equal(response.status, 403);
      },
    );

    await t.test(
      "same-origin Referer is an exact fallback and GET cannot mutate",
      async () => {
        const accepted = await globalThis.fetch(`${origin}/api/auth/login`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            referer: `${allowedOrigin}/login`,
            "x-csrf-confirm": "1",
          },
          body: JSON.stringify({ username: user.username, password }),
        });
        assert.equal(accepted.status, 200);
        const cookie = accepted.headers
          .getSetCookie()
          .find((value) => value.startsWith("__Host-nop_preauth="))
          ?.split(";", 1)[0];
        assert.ok(cookie);
        assert.equal(
          (
            await globalThis.fetch(`${origin}/api/auth/logout`, {
              headers: { cookie },
            })
          ).status,
          404,
        );
        const active = await pool.query(
          "select count(*)::integer as count from public.web_sessions where revoked_at is null",
        );
        assert.equal(active.rows[0].count, 1);
      },
    );

    await t.test("logout requires the session-bound CSRF token", async () => {
      const accepted = await login(allowedOrigin);
      assert.equal(accepted.status, 200);
      assert.equal(accepted.headers.get("cache-control"), "no-store");
      const csrfToken = accepted.headers.get("x-csrf-token");
      assert.match(csrfToken, /^[A-Za-z0-9_-]{43}$/u);
      const cookie = accepted.headers
        .getSetCookie()
        .find(
          (value) =>
            (value.startsWith("__Host-nop_session=") ||
              value.startsWith("__Host-nop_preauth=")) &&
            !value.includes("Max-Age=0"),
        )
        ?.split(";", 1)[0];
      assert.ok(cookie);

      const rejected = await globalThis.fetch(`${origin}/api/auth/logout`, {
        method: "POST",
        headers: {
          cookie,
          origin: allowedOrigin,
          "x-csrf-confirm": "1",
          "x-csrf-token": "A".repeat(43),
        },
      });
      assert.equal(rejected.status, 403);

      const loggedOut = await globalThis.fetch(`${origin}/api/auth/logout`, {
        method: "POST",
        headers: {
          cookie,
          origin: allowedOrigin,
          "x-csrf-confirm": "1",
          "x-csrf-token": csrfToken,
        },
      });
      assert.equal(loggedOut.status, 204);
    });
  } finally {
    await app.close();
    await pool.end();
  }
});
