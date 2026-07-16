import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const composeFile = "deploy/compose/dev.compose.yml";
const database = `nop_t009_${randomUUID().replaceAll("-", "")}`;
const databaseUser = process.env.DATABASE_USER ?? "nop";
const [selection, ...extraSelections] = process.argv.slice(2);

if (selection !== "runtime-shutdown" || extraSelections.length > 0) {
  throw new Error(
    `Unknown recovery test selection: ${process.argv.slice(2).join(" ")}`,
  );
}

const result = spawnSync(
  "docker",
  ["compose", "-f", composeFile, "up", "-d", "--wait", "postgres"],
  { cwd: root, stdio: "inherit", env: process.env },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

function run(command, args, environment = process.env) {
  const child = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: environment,
  });
  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(`${command} exited with status ${child.status}`);
  }
}

run("docker", [
  "compose",
  "-f",
  composeFile,
  "exec",
  "-T",
  "postgres",
  "createdb",
  "-U",
  databaseUser,
  database,
]);

const environment = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_HOST: "127.0.0.1",
  DATABASE_PORT: process.env.DATABASE_PORT ?? "5432",
  DATABASE_NAME: database,
  DATABASE_USER: databaseUser,
  DATABASE_PASSWORD: process.env.DATABASE_PASSWORD ?? "change-me-local-only",
  DATABASE_SSL_MODE: "disable",
  DATABASE_POOL_MAX: "4",
  DATABASE_CONNECT_TIMEOUT_MS: "5000",
  DATABASE_QUERY_TIMEOUT_MS: "10000",
  WORKER_INSTANCE_ID: "platform-worker-t009-recovery",
  WORKER_HEARTBEAT_INTERVAL_MS: "50",
  WORKER_HEARTBEAT_STALE_AFTER_MS: "250",
  TOTP_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  TOTP_ENCRYPTION_KEY_VERSION: "test-v1",
};

try {
  run(process.execPath, ["apps/platform/dist/migrate.js", "up"], environment);
  run(
    process.execPath,
    ["--test", "tests/recovery/runtime/runtime-shutdown.test.mjs"],
    environment,
  );
} finally {
  run("docker", [
    "compose",
    "-f",
    composeFile,
    "exec",
    "-T",
    "postgres",
    "dropdb",
    "--force",
    "-U",
    databaseUser,
    database,
  ]);
}
