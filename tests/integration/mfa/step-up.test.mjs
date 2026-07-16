import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { NestFactory } from "@nestjs/core";

import { ApiAppModule } from "../../../apps/platform/dist/bootstrap/api-app.module.js";
import {
  readTotpConfig,
  readWebSessionConfig,
} from "../../../apps/platform/dist/config/public.js";
import { readDatabaseConfig } from "../../../apps/platform/dist/database/config.js";
import { createDatabasePool } from "../../../apps/platform/dist/database/database.js";
import { AuditStore } from "../../../apps/platform/dist/modules/audit/public.js";
import { PostgresAuthorizationService } from "../../../apps/platform/dist/modules/identity-access/adapters/postgres/postgres-authorization-service.js";
import { PostgresLocalIdentityService } from "../../../apps/platform/dist/modules/identity-access/adapters/postgres/postgres-local-identity-service.js";
import {
  MfaRecoveryRejectedError,
  PostgresMfaRecoveryService,
  PostgresSessionService,
  createTotp,
} from "../../../apps/platform/dist/modules/identity-access/public.js";

const initialPassword = "t016-test-only-initial-password";
const currentPassword = "t016-test-only-current-password";

async function databaseCode(pool, secret, offset = 0) {
  const clock = await pool.query(
    "select floor(extract(epoch from clock_timestamp()) / 30)::bigint as step",
  );
  return createTotp(secret, (Number(clock.rows[0].step) + offset) * 30_000);
}

async function enroll(pool, identity, sessions, username) {
  let user = await identity.bootstrapAdministrator({
    username,
    password: initialPassword,
  });
  user = await identity.changeInitialPassword({
    userId: user.userId,
    currentPassword: initialPassword,
    newPassword: currentPassword,
    audit: { actor: { type: "SYSTEM", id: "t016-test" } },
  });
  const login = await sessions.login({
    username,
    password: currentPassword,
    source: "127.0.0.1",
  });
  assert.equal(login.nextStep, "MFA_ENROLLMENT");
  const enrollment = await sessions.beginTotpEnrollment({
    preAuthenticationToken: login.token,
  });
  const authenticated = await sessions.completeTotp({
    preAuthenticationToken: login.token,
    code: await databaseCode(pool, enrollment.secret, -1),
    source: "127.0.0.1",
  });
  assert.equal(authenticated.recoveryCodes?.length, 10);
  return { user, secret: enrollment.secret, session: authenticated };
}

test("recovery and step-up controls are one-use and database authoritative", async (t) => {
  const pool = createDatabasePool(readDatabaseConfig(process.env));
  const audit = new AuditStore(pool);
  const identity = new PostgresLocalIdentityService(pool, audit);
  const authorization = new PostgresAuthorizationService(pool, audit);
  const sessions = new PostgresSessionService(
    pool,
    audit,
    readWebSessionConfig(process.env),
    undefined,
    readTotpConfig(process.env),
  );
  const recovery = new PostgresMfaRecoveryService(
    pool,
    audit,
    sessions,
    authorization,
    readTotpConfig(process.env),
  );
  try {
    const enrolled = await enroll(pool, identity, sessions, "t016-admin");
    const originalCodes = [...enrolled.session.recoveryCodes];
    const allPlaintextCodes = [...originalCodes];
    let activeCodes = originalCodes;
    await assert.rejects(
      recovery.issueStepUp({
        sessionToken: enrolled.session.token,
        operation: `mfa.reset:${enrolled.user.userId}`,
        source: "127.0.0.1",
      }),
      MfaRecoveryRejectedError,
    );
    await recovery.confirmRecoveryCodes({
      sessionToken: enrolled.session.token,
    });

    await t.test(
      "HTTP adapters expose bounded recovery and step-up flows",
      async () => {
        const app = await NestFactory.create(ApiAppModule, { logger: false });
        await app.listen(0, "127.0.0.1");
        try {
          const address = app.getHttpServer().address();
          assert.equal(typeof address, "object");
          const response = await globalThis.fetch(
            `http://127.0.0.1:${address.port}/api/auth/mfa/step-up`,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                cookie: `__Host-nop_session=${enrolled.session.token}`,
                origin: process.env.WEB_ORIGIN,
                "x-csrf-confirm": "1",
                "x-csrf-token": enrolled.session.csrfToken,
              },
              body: JSON.stringify({
                operation: "mfa.recovery-codes.regenerate",
              }),
            },
          );
          assert.equal(response.status, 200);
          assert.equal(response.headers.get("cache-control"), "no-store");
          const body = await response.json();
          assert.match(body.token, /^[A-Za-z0-9_-]{43}$/u);
        } finally {
          await app.close();
        }
      },
    );

    await t.test(
      "plaintext codes are returned once and never stored",
      async () => {
        const stored = await pool.query(
          `select c.code_hash from public.mfa_recovery_codes c
         join public.mfa_recovery_code_sets s on s.set_id = c.set_id
         where s.user_id = $1`,
          [enrolled.user.userId],
        );
        assert.equal(stored.rows.length, 10);
        const rendered = JSON.stringify(stored.rows);
        for (const code of originalCodes)
          assert.equal(rendered.includes(code), false);
        assert.equal(
          stored.rows.every((row) => row.code_hash.startsWith("$argon2id$")),
          true,
        );
      },
    );

    await t.test(
      "step-up is action-bound, expiring, and single-use",
      async () => {
        const grant = await recovery.issueStepUp({
          sessionToken: enrolled.session.token,
          operation: "mfa.recovery-codes.regenerate",
        });
        await assert.rejects(
          recovery.consumeStepUp({
            sessionToken: enrolled.session.token,
            stepUpToken: grant.token,
            operation: "mfa.reset:00000000-0000-4000-8000-000000000000",
          }),
          MfaRecoveryRejectedError,
        );
        const regenerated = await recovery.regenerateRecoveryCodes({
          sessionToken: enrolled.session.token,
          stepUpToken: grant.token,
        });
        assert.equal(regenerated.codes.length, 10);
        await recovery.confirmRecoveryCodes({
          sessionToken: enrolled.session.token,
        });
        await assert.rejects(
          recovery.regenerateRecoveryCodes({
            sessionToken: enrolled.session.token,
            stepUpToken: grant.token,
          }),
          MfaRecoveryRejectedError,
        );
        const unbindGrant = await recovery.issueStepUp({
          sessionToken: enrolled.session.token,
          operation: "mfa.unbind",
        });
        await assert.rejects(
          recovery.unbindMfa({
            sessionToken: enrolled.session.token,
            stepUpToken: unbindGrant.token,
            reason: "factor-replacement",
          }),
          MfaRecoveryRejectedError,
        );
        const expired = await recovery.issueStepUp({
          sessionToken: enrolled.session.token,
          operation: "mfa.recovery-codes.regenerate",
        });
        await pool.query(
          `update public.mfa_step_up_grants
            set issued_at = clock_timestamp() - interval '2 seconds',
                expires_at = clock_timestamp() - interval '1 second'
          where token_hash = $1`,
          [createHash("sha256").update(expired.token).digest()],
        );
        await assert.rejects(
          recovery.consumeStepUp({
            sessionToken: enrolled.session.token,
            stepUpToken: expired.token,
            operation: expired.operation,
          }),
          MfaRecoveryRejectedError,
        );
        allPlaintextCodes.push(...regenerated.codes);
        activeCodes = [...regenerated.codes];
      },
    );

    await t.test(
      "a stale MFA session requires a fresh TOTP proof",
      async () => {
        await pool.query(
          "update public.web_sessions set mfa_verified_at = clock_timestamp() - interval '9 minutes' where session_id = $1",
          [enrolled.session.sessionId],
        );
        const boundedGrant = await recovery.issueStepUp({
          sessionToken: enrolled.session.token,
          operation: "mfa.recovery-codes.regenerate",
        });
        const boundedExpiry = await pool.query(
          `select expires_at <= mfa_verified_at + interval '10 minutes' as bounded
             from public.mfa_step_up_grants g
             join public.web_sessions s on s.session_id = g.session_id
            where g.token_hash = $1`,
          [createHash("sha256").update(boundedGrant.token).digest()],
        );
        assert.equal(boundedExpiry.rows[0].bounded, true);
        await pool.query(
          "update public.web_sessions set mfa_verified_at = clock_timestamp() - interval '11 minutes' where session_id = $1",
          [enrolled.session.sessionId],
        );
        await assert.rejects(
          recovery.issueStepUp({
            sessionToken: enrolled.session.token,
            operation: "mfa.recovery-codes.regenerate",
          }),
          MfaRecoveryRejectedError,
        );
        const grant = await recovery.issueStepUp({
          sessionToken: enrolled.session.token,
          operation: "mfa.recovery-codes.regenerate",
          password: currentPassword,
          totpCode: await databaseCode(pool, enrolled.secret),
        });
        assert.match(grant.token, /^[A-Za-z0-9_-]{43}$/u);
      },
    );

    await t.test(
      "concurrent recovery consumes one code once and revokes sessions",
      async () => {
        const preAuth = await sessions.login({
          username: enrolled.user.username,
          password: currentPassword,
          source: "127.0.0.2",
        });
        assert.equal(preAuth.nextStep, "MFA_VERIFY");
        const outcomes = await Promise.allSettled([
          recovery.recoverWithCode({
            preAuthenticationToken: preAuth.token,
            recoveryCode: activeCodes[0],
          }),
          recovery.recoverWithCode({
            preAuthenticationToken: preAuth.token,
            recoveryCode: activeCodes[0],
          }),
        ]);
        assert.equal(
          outcomes.filter((item) => item.status === "fulfilled").length,
          1,
        );
        assert.equal(
          outcomes.filter((item) => item.status === "rejected").length,
          1,
        );
        await assert.rejects(
          sessions.validateAuthenticated(enrolled.session.token),
          { name: "SessionRejectedError" },
        );
        const state = await pool.query(
          `select u.mfa_state,
                count(a.*) filter (where a.status = 'ACTIVE')::integer as active
         from public.platform_users u
         left join public.totp_authenticators a on a.user_id = u.user_id
         where u.user_id = $1 group by u.user_id`,
          [enrolled.user.userId],
        );
        assert.equal(state.rows[0].mfa_state, "MFA_ENROLLMENT_REQUIRED");
        assert.equal(state.rows[0].active, 0);
      },
    );

    let reenrolledSession;
    await t.test("expired recovery material is rejected", async () => {
      const nextLogin = await sessions.login({
        username: enrolled.user.username,
        password: currentPassword,
        source: "127.0.0.3",
      });
      const nextEnrollment = await sessions.beginTotpEnrollment({
        preAuthenticationToken: nextLogin.token,
      });
      const nextSession = await sessions.completeTotp({
        preAuthenticationToken: nextLogin.token,
        code: await databaseCode(pool, nextEnrollment.secret, 1),
        source: "127.0.0.3",
      });
      reenrolledSession = nextSession;
      await recovery.confirmRecoveryCodes({
        sessionToken: nextSession.token,
      });
      allPlaintextCodes.push(...nextSession.recoveryCodes);
      const recoveryLogin = await sessions.login({
        username: enrolled.user.username,
        password: currentPassword,
        source: "127.0.0.4",
      });
      await pool.query(
        `update public.mfa_recovery_code_sets
            set confirmed_at = null,
                created_at = clock_timestamp() - interval '2 seconds',
                expires_at = clock_timestamp() - interval '1 second'
          where user_id = $1 and invalidated_at is null`,
        [enrolled.user.userId],
      );
      await assert.rejects(
        recovery.recoverWithCode({
          preAuthenticationToken: recoveryLogin.token,
          recoveryCode: nextSession.recoveryCodes[0],
        }),
        MfaRecoveryRejectedError,
      );
    });

    await t.test(
      "an authorized administrator reset is step-up bound and transactional",
      async () => {
        const recoveryGrant = await recovery.issueStepUp({
          sessionToken: reenrolledSession.token,
          operation: "mfa.recovery-codes.regenerate",
        });
        const replacement = await recovery.regenerateRecoveryCodes({
          sessionToken: reenrolledSession.token,
          stepUpToken: recoveryGrant.token,
        });
        allPlaintextCodes.push(...replacement.codes);
        await recovery.confirmRecoveryCodes({
          sessionToken: reenrolledSession.token,
        });
        const operation = `mfa.reset:${enrolled.user.userId}`;
        const grant = await recovery.issueStepUp({
          sessionToken: reenrolledSession.token,
          operation,
        });
        await recovery.resetMfa({
          actorSessionToken: reenrolledSession.token,
          stepUpToken: grant.token,
          userId: enrolled.user.userId,
          reason: "lost-authenticator",
        });
        await assert.rejects(
          sessions.validateAuthenticated(reenrolledSession.token),
          { name: "SessionRejectedError" },
        );
        const reset = await pool.query(
          "select mfa_state from public.platform_users where user_id = $1",
          [enrolled.user.userId],
        );
        assert.equal(reset.rows[0].mfa_state, "MFA_ENROLLMENT_REQUIRED");
        const resetAudit = await pool.query(
          "select count(*)::integer as count from public.audit_events where event_type = 'MFA.ADMIN_RESET' and resource_id = $1",
          [enrolled.user.userId],
        );
        assert.equal(resetAudit.rows[0].count, 1);
      },
    );

    const events = await pool.query(
      "select event_type, details from public.audit_events where event_type like 'MFA.%'",
    );
    const auditText = JSON.stringify(events.rows);
    for (const code of allPlaintextCodes)
      assert.equal(auditText.includes(code), false);
    assert.ok(
      events.rows.some((row) => row.event_type === "MFA.RECOVERY_CODE_USED"),
    );
    assert.ok(
      events.rows.some((row) => row.event_type === "MFA.STEP_UP_DENIED"),
    );
  } finally {
    await pool.end();
  }
});
