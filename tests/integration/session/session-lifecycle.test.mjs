import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import test from "node:test";

import { ApiAppModule } from "../../../apps/platform/dist/bootstrap/api-app.module.js";
import { readDatabaseConfig } from "../../../apps/platform/dist/database/config.js";
import { createDatabasePool } from "../../../apps/platform/dist/database/database.js";
import { AuditStore } from "../../../apps/platform/dist/modules/audit/public.js";
import { PostgresLocalIdentityService } from "../../../apps/platform/dist/modules/identity-access/adapters/postgres/postgres-local-identity-service.js";
import { PostgresSessionService } from "../../../apps/platform/dist/modules/identity-access/adapters/postgres/postgres-session-service.js";

const allowedOrigin = "https://network-operations.test";
const initialPassword = "t014-test-only-initial-password";
const password = "t014-test-only-current-password";

function issued(response) {
  const cookie = response.headers
    .getSetCookie()
    .find(
      (value) =>
        value.startsWith("__Host-nop_session=") && !value.includes("Max-Age=0"),
    )
    ?.split(";", 1)[0];
  assert.ok(cookie);
  return {
    cookie,
    token: cookie.slice(cookie.indexOf("=") + 1),
    csrfToken: response.headers.get("x-csrf-token"),
  };
}

function lifecycleEvents(response) {
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  const decoder = new globalThis.TextDecoder();
  let buffer = "";
  return async (expected, timeoutMs = 3_000) => {
    for (;;) {
      let timer;
      const { done, value } = await Promise.race([
        reader.read(),
        new Promise((_, reject) => {
          timer = globalThis.setTimeout(
            () => reject(new Error(`Timed out waiting for ${expected}`)),
            timeoutMs,
          );
          timer.unref();
        }),
      ]).finally(() => globalThis.clearTimeout(timer));
      if (done) throw new Error(`SSE ended before ${expected}`);
      buffer += decoder.decode(value, { stream: true });
      for (const block of buffer.split("\n\n")) {
        const data = block
          .split("\n")
          .find((line) => line.startsWith("data: "))
          ?.slice(6);
        if (!data) continue;
        const parsed = JSON.parse(data);
        if (parsed.event === expected) return parsed;
      }
      buffer = buffer.slice(buffer.lastIndexOf("\n\n") + 2);
    }
  };
}

const digest = (value) => createHash("sha256").update(value).digest();

test("SSE follows authoritative PostgreSQL session lifecycle", async (t) => {
  const pool = createDatabasePool(readDatabaseConfig(process.env));
  const audit = new AuditStore(pool);
  const identity = new PostgresLocalIdentityService(pool, audit);
  await identity.bootstrapAdministrator({
    username: "sse-bootstrap-admin",
    password: "t014-test-only-bootstrap-password",
  });
  let user = await identity.createUser({
    username: "sse-user",
    password: initialPassword,
    audit: { actor: { type: "SYSTEM", id: "session-lifecycle-test" } },
  });
  user = await identity.changeInitialPassword({
    userId: user.userId,
    currentPassword: initialPassword,
    newPassword: password,
    audit: { actor: { type: "SYSTEM", id: "session-lifecycle-test" } },
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

  const app = await NestFactory.create(ApiAppModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  const port = app.getHttpServer().address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const sessions = app.get(PostgresSessionService);
  const login = async () => {
    const response = await globalThis.fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: allowedOrigin,
        "x-csrf-confirm": "1",
      },
      body: JSON.stringify({ username: user.username, password }),
    });
    assert.equal(response.status, 200);
    return issued(response);
  };
  const connect = (cookie) =>
    globalThis.fetch(`${baseUrl}/events/session`, { headers: { cookie } });

  try {
    await t.test(
      "heartbeat does not extend idle expiry and revocation closes the stream",
      async () => {
        const session = await login();
        const before = await pool.query(
          "select idle_expires_at from public.web_sessions where token_hash = $1",
          [digest(session.token)],
        );
        const response = await connect(session.cookie);
        const nextEvent = lifecycleEvents(response);
        const connected = await nextEvent("CONNECTED");
        assert.equal(connected.stale, false);
        await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
        const after = await pool.query(
          "select idle_expires_at from public.web_sessions where token_hash = $1",
          [digest(session.token)],
        );
        assert.equal(
          after.rows[0].idle_expires_at.toISOString(),
          before.rows[0].idle_expires_at.toISOString(),
        );
        await sessions.logout(session.token, "t014-revoke");
        const closed = await nextEvent("CLOSED");
        assert.equal(closed.reason, "REVOKED");
        assert.equal(closed.stale, true);
        assert.equal(closed.reauthenticationRequired, true);
        assert.equal((await connect(session.cookie)).status, 401);
      },
    );

    await t.test(
      "authorization changes close an established stream",
      async () => {
        const session = await login();
        const response = await connect(session.cookie);
        const nextEvent = lifecycleEvents(response);
        await nextEvent("CONNECTED");
        await pool.query(
          "update public.platform_users set authorization_version = authorization_version + 1 where user_id = $1",
          [user.userId],
        );
        const closed = await nextEvent("CLOSED");
        assert.equal(closed.reason, "AUTHORIZATION_CHANGED");
      },
    );

    await t.test("absolute expiry closes an established stream", async () => {
      const session = await login();
      const response = await connect(session.cookie);
      const nextEvent = lifecycleEvents(response);
      await nextEvent("CONNECTED");
      await pool.query(
        `update public.web_sessions
            set absolute_expires_at = clock_timestamp() + interval '150 milliseconds',
                idle_expires_at = clock_timestamp() + interval '150 milliseconds'
          where token_hash = $1`,
        [digest(session.token)],
      );
      const closed = await nextEvent("CLOSED");
      assert.equal(closed.reason, "ABSOLUTE_EXPIRED");
    });

    await t.test("idle expiry closes an established stream", async () => {
      const session = await login();
      const response = await connect(session.cookie);
      const nextEvent = lifecycleEvents(response);
      await nextEvent("CONNECTED");
      await pool.query(
        `update public.web_sessions
            set idle_expires_at = clock_timestamp() + interval '150 milliseconds'
          where token_hash = $1`,
        [digest(session.token)],
      );
      const closed = await nextEvent("CLOSED");
      assert.equal(closed.reason, "IDLE_EXPIRED");
    });
  } finally {
    await app.close();
    await pool.end();
  }
});
