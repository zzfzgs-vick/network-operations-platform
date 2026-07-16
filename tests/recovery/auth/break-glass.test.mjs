import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

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
  PostgresMfaRecoveryService,
  PostgresSessionService,
  createTotp,
} from "../../../apps/platform/dist/modules/identity-access/public.js";

const initialPassword = "t016-break-glass-initial-password";
const currentPassword = "t016-break-glass-current-password";

test("host-only break-glass is one-shot, audited, and forces full recovery", async () => {
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
  const directory = mkdtempSync(join(tmpdir(), "nop-t016-"));
  const securityLog = join(directory, "security.log");
  try {
    let user = await identity.bootstrapAdministrator({
      username: "t016-emergency",
      password: initialPassword,
    });
    user = await identity.changeInitialPassword({
      userId: user.userId,
      currentPassword: initialPassword,
      newPassword: currentPassword,
      audit: { actor: { type: "SYSTEM", id: "t016-test" } },
    });
    const preAuth = await sessions.login({
      username: user.username,
      password: currentPassword,
      source: "127.0.0.1",
    });
    const enrollment = await sessions.beginTotpEnrollment({
      preAuthenticationToken: preAuth.token,
    });
    const clock = await pool.query(
      "select floor(extract(epoch from clock_timestamp()) / 30)::bigint as step",
    );
    const authenticated = await sessions.completeTotp({
      preAuthenticationToken: preAuth.token,
      code: createTotp(
        enrollment.secret,
        (Number(clock.rows[0].step) - 1) * 30_000,
      ),
      source: "127.0.0.1",
    });
    await recovery.confirmRecoveryCodes({
      sessionToken: authenticated.token,
    });
    const designation = await recovery.issueStepUp({
      sessionToken: authenticated.token,
      operation: `emergency-administrator:${user.userId}`,
    });
    await recovery.setEmergencyAdministrator({
      actorSessionToken: authenticated.token,
      stepUpToken: designation.token,
      userId: user.userId,
      enabled: true,
    });
    await assert.rejects(
      sessions.login({
        username: user.username,
        password: currentPassword,
        source: "127.0.0.2",
      }),
      { name: "SessionRejectedError" },
    );
    await sessions.login({
      username: user.username,
      password: currentPassword,
      source: "127.0.0.2",
      emergencyReason: "recovery-drill",
    });

    const disabled = spawnSync(
      process.execPath,
      ["apps/platform/dist/cli/break-glass.js"],
      {
        cwd: process.cwd(),
        env: { ...process.env, BREAK_GLASS_ENABLED: "false" },
        encoding: "utf8",
      },
    );
    assert.notEqual(disabled.status, 0);

    const command = spawnSync(
      process.execPath,
      ["apps/platform/dist/cli/break-glass.js"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          BREAK_GLASS_ENABLED: "true",
          BREAK_GLASS_USER_ID: user.userId,
          BREAK_GLASS_REASON: "lost-all-factors",
          BREAK_GLASS_SECURITY_LOG: securityLog,
        },
        encoding: "utf8",
      },
    );
    assert.equal(command.status, 0, command.stderr);
    assert.doesNotMatch(
      command.stdout + command.stderr,
      /password|token|secret/iu,
    );
    const log = readFileSync(securityLog, "utf8");
    assert.match(log, /"state":"attempted"/u);
    assert.match(log, /"state":"completed"/u);

    const state = await pool.query(
      `select u.mfa_state, c.must_change_password, e.enabled,
              count(s.*) filter (where s.revoked_at is null)::integer as sessions,
              count(a.*) filter (where a.status = 'ACTIVE')::integer as authenticators
         from public.platform_users u
         join public.local_credentials c on c.user_id = u.user_id
         join public.emergency_administrators e on e.user_id = u.user_id
         left join public.web_sessions s on s.user_id = u.user_id
         left join public.totp_authenticators a on a.user_id = u.user_id
        where u.user_id = $1 group by u.user_id, c.must_change_password, e.enabled`,
      [user.userId],
    );
    assert.equal(state.rows[0].mfa_state, "MFA_ENROLLMENT_REQUIRED");
    assert.equal(state.rows[0].must_change_password, true);
    assert.equal(state.rows[0].enabled, false);
    assert.equal(state.rows[0].sessions, 0);
    assert.equal(state.rows[0].authenticators, 0);
    const events = await pool.query(
      "select actor_type, actor_id, details from public.audit_events where event_type = 'MFA.HOST_BREAK_GLASS_USED'",
    );
    assert.equal(events.rows.length, 1);
    assert.equal(events.rows[0].actor_type, "SYSTEM");
    assert.equal(events.rows[0].actor_id, "host-break-glass");
    assert.equal(events.rows[0].details.metadata.highPriority, true);
    const emergencyLogin = await pool.query(
      "select count(*)::integer as count from public.audit_events where event_type = 'AUTHENTICATION.EMERGENCY_ADMIN_USED'",
    );
    assert.equal(emergencyLogin.rows[0].count, 1);

    const replay = spawnSync(
      process.execPath,
      ["apps/platform/dist/cli/break-glass.js"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          BREAK_GLASS_ENABLED: "true",
          BREAK_GLASS_USER_ID: user.userId,
          BREAK_GLASS_REASON: "lost-all-factors",
          BREAK_GLASS_SECURITY_LOG: securityLog,
        },
        encoding: "utf8",
      },
    );
    assert.notEqual(replay.status, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    await pool.end();
  }
});
