import { appendFileSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { readTotpConfig, readWebSessionConfig } from "../config/public.js";
import { readDatabaseConfig } from "../database/config.js";
import { createDatabasePool } from "../database/database.js";
import { verifyMigrations } from "../database/migrations.js";
import { AuditStore } from "../modules/audit/public.js";
import { PostgresAuthorizationService } from "../modules/identity-access/adapters/postgres/postgres-authorization-service.js";
import { PostgresMfaRecoveryService } from "../modules/identity-access/adapters/postgres/postgres-mfa-recovery-service.js";
import { PostgresSessionService } from "../modules/identity-access/adapters/postgres/postgres-session-service.js";

function required(name: string) {
  const value = process.env[name];
  if (!value?.trim()) throw new Error("Break-glass configuration is invalid");
  return value.trim();
}

function hostAuthorized() {
  if (process.env.BREAK_GLASS_ENABLED !== "true") return false;
  if (process.platform !== "win32") {
    return typeof process.getuid === "function" && process.getuid() === 0;
  }
  const check = spawnSync(
    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$p=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()); if($p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){exit 0}else{exit 1}",
    ],
    { stdio: "ignore", windowsHide: true },
  );
  return check.status === 0;
}

function hostLog(
  path: string,
  state: "attempted" | "completed" | "failed",
  userId: string,
) {
  appendFileSync(
    path,
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      event: "mfa-host-break-glass",
      state,
      userId,
    })}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  if (process.platform !== "win32") chmodSync(path, 0o600);
}

async function main() {
  if (!hostAuthorized()) throw new Error("unauthorized");
  const userId = required("BREAK_GLASS_USER_ID");
  const reason = required("BREAK_GLASS_REASON");
  const logPath = required("BREAK_GLASS_SECURITY_LOG");
  const pool = createDatabasePool(readDatabaseConfig(process.env));
  try {
    hostLog(logPath, "attempted", userId);
    await verifyMigrations(pool);
    const audit = new AuditStore(pool);
    const authorization = new PostgresAuthorizationService(pool, audit);
    const sessions = new PostgresSessionService(
      pool,
      audit,
      readWebSessionConfig(),
      undefined,
      readTotpConfig(),
    );
    const recovery = new PostgresMfaRecoveryService(
      pool,
      audit,
      sessions,
      authorization,
      readTotpConfig(),
    );
    await recovery.breakGlass({ userId, reason });
    hostLog(logPath, "completed", userId);
    process.stdout.write(
      `${JSON.stringify({ status: "recovery-required", userId })}\n`,
    );
  } catch (error) {
    try {
      hostLog(logPath, "failed", userId);
    } catch {
      // The caller still receives a failure if the independent log is unavailable.
    }
    throw error;
  } finally {
    await pool.end();
  }
}

try {
  await main();
} catch {
  process.stderr.write("Break-glass recovery failed\n");
  process.exitCode = 1;
}
