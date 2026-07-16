import assert from "node:assert/strict";
import { Controller, Get, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import test from "node:test";

import { ApiAppModule } from "../../../apps/platform/dist/bootstrap/api-app.module.js";
import { readDatabaseConfig } from "../../../apps/platform/dist/database/config.js";
import { createDatabasePool } from "../../../apps/platform/dist/database/database.js";
import { AuditStore } from "../../../apps/platform/dist/modules/audit/public.js";
import { PostgresLocalIdentityService } from "../../../apps/platform/dist/modules/identity-access/adapters/postgres/postgres-local-identity-service.js";
import { PostgresAuthorizationService } from "../../../apps/platform/dist/modules/identity-access/adapters/postgres/postgres-authorization-service.js";
import {
  PostgresSessionService,
  RequirePermission,
  createTotp,
} from "../../../apps/platform/dist/modules/identity-access/public.js";

class SensitiveController {
  readOrdinary() {
    return { allowed: true };
  }

  read() {
    return { allowed: true };
  }
}
Controller("mfa-test")(SensitiveController);
Get("ordinary")(
  SensitiveController.prototype,
  "readOrdinary",
  Object.getOwnPropertyDescriptor(
    SensitiveController.prototype,
    "readOrdinary",
  ),
);
RequirePermission("assets.read")(
  SensitiveController.prototype,
  "readOrdinary",
  Object.getOwnPropertyDescriptor(
    SensitiveController.prototype,
    "readOrdinary",
  ),
);
Get("sensitive")(
  SensitiveController.prototype,
  "read",
  Object.getOwnPropertyDescriptor(SensitiveController.prototype, "read"),
);
RequirePermission("users.manage")(
  SensitiveController.prototype,
  "read",
  Object.getOwnPropertyDescriptor(SensitiveController.prototype, "read"),
);

class MfaTestModule {}
Module({ imports: [ApiAppModule], controllers: [SensitiveController] })(
  MfaTestModule,
);

const originHeader = "https://network-operations.test";
const adminPassword = "t015-test-only-bootstrap-password";
const initialPassword = "t015-test-only-initial-password";
const userPassword = "t015-test-only-current-password";

function issuedCookie(response, name) {
  const value = response.headers
    .getSetCookie()
    .find((item) => item.startsWith(`${name}=`) && !item.includes("Max-Age=0"));
  assert.ok(value, `Expected ${name}`);
  return value.split(";", 1)[0];
}

function cookieToken(cookie) {
  return cookie.slice(cookie.indexOf("=") + 1);
}

function browserHeaders(cookie, csrfToken) {
  return {
    origin: originHeader,
    "x-csrf-confirm": "1",
    ...(cookie ? { cookie } : {}),
    ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
  };
}

test("permission-driven TOTP enrollment and two-stage login", async (t) => {
  const pool = createDatabasePool(readDatabaseConfig(process.env));
  const audit = new AuditStore(pool);
  const identity = new PostgresLocalIdentityService(pool, audit);
  const admin = await identity.bootstrapAdministrator({
    username: "mfa-admin",
    password: adminPassword,
  });
  let normal = await identity.createUser({
    username: "mfa-normal",
    password: initialPassword,
    audit: { actor: { type: "SYSTEM", id: "t015-test" } },
  });
  normal = await identity.changeInitialPassword({
    userId: normal.userId,
    currentPassword: initialPassword,
    newPassword: userPassword,
    audit: { actor: { type: "SYSTEM", id: "t015-test" } },
  });
  const authorization = new PostgresAuthorizationService(pool, audit);
  const adminState = await authorization.getAuthorizationState(admin.userId);
  const adminActor = {
    kind: "platform-user",
    userId: admin.userId,
    authorizationVersion: adminState.authorizationVersion,
  };
  const role = await authorization.createRole({
    actor: adminActor,
    name: "Ordinary Asset Reader",
    permissions: ["assets.read"],
    context: { requestId: "t015-role-create" },
  });
  await authorization.assignRole({
    actor: adminActor,
    userId: normal.userId,
    roleId: role.roleId,
    context: { requestId: "t015-role-assign" },
  });

  const app = await NestFactory.create(MfaTestModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const login = (username, password) =>
    globalThis.fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { ...browserHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
  const enroll = (cookie, csrfToken) =>
    globalThis.fetch(`${baseUrl}/api/auth/mfa/enrollment`, {
      method: "POST",
      headers: browserHeaders(cookie, csrfToken),
    });
  const verify = (cookie, csrfToken, code) =>
    globalThis.fetch(`${baseUrl}/api/auth/mfa/verify`, {
      method: "POST",
      headers: {
        ...browserHeaders(cookie, csrfToken),
        "content-type": "application/json",
      },
      body: JSON.stringify({ code }),
    });

  try {
    let ordinaryCookie;
    let ordinaryAuthorizationState;
    await t.test("ordinary permissions do not force MFA", async () => {
      ordinaryAuthorizationState = await authorization.getAuthorizationState(
        normal.userId,
      );
      const response = await login(normal.username, userPassword);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).status, "AUTHENTICATED");
      ordinaryCookie = issuedCookie(response, "__Host-nop_session");
      assert.equal(
        (
          await globalThis.fetch(`${baseUrl}/mfa-test/ordinary`, {
            headers: { cookie: ordinaryCookie },
          })
        ).status,
        200,
      );
    });

    let preAuthCookie;
    let preAuthCsrf;
    let secret;
    const issuedSensitiveValues = new Set();
    await t.test(
      "the authorization service promotes a Role into MFA enforcement",
      async () => {
        await authorization.renameRole({
          actor: adminActor,
          roleId: role.roleId,
          name: "Harmless Looking Role",
          context: { requestId: "t015-role-rename" },
        });
        await authorization.setRolePermissions({
          actor: adminActor,
          roleId: role.roleId,
          permissions: ["assets.read", "users.manage"],
          context: { requestId: "t015-sensitive-promotion" },
        });
        const promoted = await authorization.getAuthorizationState(
          normal.userId,
        );
        assert.equal(
          promoted.authorizationVersion,
          ordinaryAuthorizationState.authorizationVersion + 1,
        );
        assert.equal(promoted.permissions.includes("users.manage"), true);
        const userState = await pool.query(
          "select mfa_state from public.platform_users where user_id = $1",
          [normal.userId],
        );
        assert.equal(userState.rows[0].mfa_state, "MFA_ENROLLMENT_REQUIRED");
        for (const endpoint of ["ordinary", "sensitive"]) {
          assert.equal(
            (
              await globalThis.fetch(`${baseUrl}/mfa-test/${endpoint}`, {
                headers: { cookie: ordinaryCookie },
              })
            ).status,
            401,
          );
        }

        const response = await login(normal.username, userPassword);
        const body = await response.json();
        preAuthCookie = issuedCookie(response, "__Host-nop_preauth");
        preAuthCsrf = response.headers.get("x-csrf-token");
        assert.equal(body.status, "PRE_AUTHENTICATION_REQUIRED");
        assert.equal(body.nextStep, "MFA_ENROLLMENT");
        assert.equal(
          (
            await globalThis.fetch(`${baseUrl}/mfa-test/sensitive`, {
              headers: { cookie: preAuthCookie },
            })
          ).status,
          403,
        );

        const enrollmentResponse = await enroll(preAuthCookie, preAuthCsrf);
        const enrollment = await enrollmentResponse.json();
        assert.equal(enrollmentResponse.status, 200);
        assert.equal(
          enrollmentResponse.headers.get("cache-control"),
          "no-store",
        );
        secret = enrollment.secret;
        issuedSensitiveValues.add(secret);
        assert.match(secret, /^[A-Z2-7]{32}$/u);
        assert.match(enrollment.uri, /^otpauth:\/\/totp\//u);
        const expiry = await pool.query(
          `select e.created_at, e.expires_at,
                  c.expires_at as challenge_expires_at
             from public.totp_enrollments e
             join public.mfa_challenges c on c.user_id = e.user_id
            where e.user_id = $1 and c.purpose = 'MFA_ENROLLMENT'
            order by c.created_at desc limit 1`,
          [normal.userId],
        );
        assert.equal(
          enrollment.expiresAt,
          expiry.rows[0].expires_at.toISOString(),
        );
        assert.equal(
          expiry.rows[0].expires_at.getTime() -
            expiry.rows[0].created_at.getTime(),
          60_000,
        );
        assert.ok(
          expiry.rows[0].expires_at < expiry.rows[0].challenge_expires_at,
        );
        await pool.query(
          `update public.totp_enrollments
              set created_at = clock_timestamp() - interval '2 minutes',
                  expires_at = clock_timestamp() - interval '1 minute'
            where user_id = $1`,
          [normal.userId],
        );
        const databaseClock = await pool.query(
          "select clock_timestamp() as now",
        );
        const expiredCode = createTotp(
          secret,
          databaseClock.rows[0].now.getTime(),
        );
        issuedSensitiveValues.add(expiredCode);
        assert.equal(
          (await verify(preAuthCookie, preAuthCsrf, expiredCode)).status,
          401,
        );

        const replacementResponse = await enroll(preAuthCookie, preAuthCsrf);
        const replacement = await replacementResponse.json();
        assert.equal(replacementResponse.status, 200);
        secret = replacement.secret;
        issuedSensitiveValues.add(secret);
        const active = await pool.query(
          "select count(*)::integer as count from public.totp_authenticators where user_id = $1 and status = 'ACTIVE'",
          [normal.userId],
        );
        assert.equal(active.rows[0].count, 0);

        const auditEvents = await pool.query(
          `select event_type from public.audit_events
            where event_type in (
              'AUTHORIZATION.ROLE_RENAMED',
              'AUTHORIZATION.ROLE_PERMISSIONS_CHANGED',
              'SESSION.ROLE_PERMISSION_CHANGE_REVOKED'
            )`,
        );
        assert.deepEqual(
          new Set(auditEvents.rows.map((event) => event.event_type)),
          new Set([
            "AUTHORIZATION.ROLE_RENAMED",
            "AUTHORIZATION.ROLE_PERMISSIONS_CHANGED",
            "SESSION.ROLE_PERMISSION_CHANGE_REVOKED",
          ]),
        );
      },
    );

    let authenticatedCookie;
    let replayPreAuthSessionId;
    let sourceThrottleCountBefore;
    await t.test(
      "confirming enrollment rotates pre-auth into an MFA Session",
      async () => {
        const clock = await pool.query(
          "select floor(extract(epoch from clock_timestamp()) / 30)::bigint as step",
        );
        const code = createTotp(secret, Number(clock.rows[0].step) * 30_000);
        issuedSensitiveValues.add(code);
        const response = await verify(preAuthCookie, preAuthCsrf, code);
        assert.equal(response.status, 200);
        assert.equal((await response.json()).status, "AUTHENTICATED");
        authenticatedCookie = issuedCookie(response, "__Host-nop_session");
        assert.equal(
          (
            await globalThis.fetch(`${baseUrl}/mfa-test/sensitive`, {
              headers: { cookie: authenticatedCookie },
            })
          ).status,
          200,
        );
        const stored = await pool.query(
          `select u.mfa_state, a.status, a.last_accepted_step,
                  a.secret_ciphertext, s.authentication_strength,
                  s.mfa_verified_at is not null as verified
             from public.platform_users u
             join public.totp_authenticators a on a.user_id = u.user_id
             join public.web_sessions s on s.user_id = u.user_id
            where u.user_id = $1 and a.status = 'ACTIVE'
              and s.revoked_at is null`,
          [normal.userId],
        );
        assert.equal(stored.rows[0].mfa_state, "ENROLLED");
        assert.equal(stored.rows[0].authentication_strength, "PASSWORD_MFA");
        assert.equal(stored.rows[0].verified, true);
        assert.equal(
          stored.rows[0].secret_ciphertext.toString("utf8").includes(secret),
          false,
        );
      },
    );

    await t.test("the same accepted time step cannot be replayed", async () => {
      const loginResponse = await login(normal.username, userPassword);
      const cookie = issuedCookie(loginResponse, "__Host-nop_preauth");
      const csrf = loginResponse.headers.get("x-csrf-token");
      assert.equal((await loginResponse.json()).nextStep, "MFA_VERIFY");
      const replaySession = await pool.query(
        `select session_id from public.web_sessions
          where user_id = $1 and session_type = 'PRE_AUTH' and revoked_at is null
          order by created_at desc, session_id desc limit 1`,
        [normal.userId],
      );
      replayPreAuthSessionId = replaySession.rows[0].session_id;
      const accepted = await pool.query(
        "select last_accepted_step from public.totp_authenticators where user_id = $1 and status = 'ACTIVE'",
        [normal.userId],
      );
      const replayCode = createTotp(
        secret,
        Number(accepted.rows[0].last_accepted_step) * 30_000,
      );
      issuedSensitiveValues.add(replayCode);
      const response = await verify(cookie, csrf, replayCode);
      assert.equal(response.status, 401);
      assert.doesNotMatch(await response.text(), new RegExp(replayCode, "u"));
      assert.ok(
        app
          .get(PostgresSessionService)
          .totpMetrics.snapshot()
          .some((item) => item.outcome === "replay" && item.count === 1),
      );
    });

    await t.test(
      "one adjacent step is accepted after replay rejection",
      async () => {
        const loginResponse = await login(normal.username, userPassword);
        const cookie = issuedCookie(loginResponse, "__Host-nop_preauth");
        const csrf = loginResponse.headers.get("x-csrf-token");
        const clock = await pool.query(
          "select floor(extract(epoch from clock_timestamp()) / 30)::bigint as step",
        );
        const nextCode = createTotp(
          secret,
          (Number(clock.rows[0].step) + 1) * 30_000,
        );
        issuedSensitiveValues.add(nextCode);
        const response = await verify(cookie, csrf, nextCode);
        assert.equal(response.status, 200);
        issuedCookie(response, "__Host-nop_session");
        const concurrentSession = await pool.query(
          "select revoked_at from public.web_sessions where session_id = $1",
          [replayPreAuthSessionId],
        );
        assert.equal(concurrentSession.rows[0].revoked_at, null);
        const retainedSourceThrottle = await pool.query(
          "select count(*)::integer as count from public.totp_source_auth_throttle",
        );
        sourceThrottleCountBefore = retainedSourceThrottle.rows[0].count;
        assert.ok(sourceThrottleCountBefore > 0);
      },
    );

    await t.test(
      "TOTP failures use an independent bounded throttle",
      async () => {
        const loginResponse = await login(normal.username, userPassword);
        const throttlePreAuth = {
          cookie: issuedCookie(loginResponse, "__Host-nop_preauth"),
          csrf: loginResponse.headers.get("x-csrf-token"),
        };
        assert.equal((await loginResponse.json()).nextStep, "MFA_VERIFY");
        const clock = await pool.query(
          "select floor(extract(epoch from clock_timestamp()) / 30)::bigint as step",
        );
        const validCode = createTotp(
          secret,
          Number(clock.rows[0].step) * 30_000,
        );
        const invalidCode = String(
          (Number(validCode) + 1) % 1_000_000,
        ).padStart(6, "0");
        issuedSensitiveValues.add(validCode);
        issuedSensitiveValues.add(invalidCode);
        const sessionService = app.get(PostgresSessionService);
        for (let attempt = 0; attempt < 5; attempt += 1) {
          await assert.rejects(
            sessionService.completeTotp({
              preAuthenticationToken: cookieToken(throttlePreAuth.cookie),
              code: invalidCode,
              source: `198.51.100.${attempt + 1}`,
              requestId: `t015-throttle-${attempt + 1}`,
            }),
            { name: "TotpRejectedError" },
          );
        }
        assert.equal(
          (
            await verify(
              throttlePreAuth.cookie,
              throttlePreAuth.csrf,
              validCode,
            )
          ).status,
          401,
        );
        const throttle = await pool.query(
          `select count(*)::integer as source_count,
                  max(failure_count)::integer as max_failure_count,
                  coalesce(bool_or(locked_until > clock_timestamp()), false) as locked
             from public.totp_source_auth_throttle`,
        );
        assert.equal(
          throttle.rows[0].source_count,
          sourceThrottleCountBefore + 5,
        );
        assert.equal(throttle.rows[0].max_failure_count, 1);
        assert.equal(throttle.rows[0].locked, false);
        const userThrottle = await pool.query(
          `select failure_count, locked_until > clock_timestamp() as locked
             from public.totp_user_auth_throttle where user_id = $1`,
          [normal.userId],
        );
        assert.equal(userThrottle.rows[0].failure_count, 5);
        assert.equal(userThrottle.rows[0].locked, true);
      },
    );

    await t.test("audit never stores TOTP secret, URI, or code", async () => {
      const events = await pool.query(
        "select details from public.audit_events where event_type like 'MFA.%'",
      );
      const rendered = JSON.stringify(events.rows);
      for (const sensitiveValue of issuedSensitiveValues) {
        assert.equal(rendered.includes(sensitiveValue), false);
      }
      assert.doesNotMatch(rendered, /otpauth|"code"/iu);
    });
  } finally {
    await app.close();
    await pool.end();
  }
});
