import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const composeFile = "deploy/compose/dev.compose.yml";
const testDatabase = `nop_t004_${randomUUID().replaceAll("-", "")}`;
const databaseUser = process.env.DATABASE_USER ?? "nop";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    env: options.env ?? process.env,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }

  return result.stdout?.trim() ?? "";
}

function docker(args) {
  const direct = spawnSync("docker", ["version"], { stdio: "ignore" });
  if (!direct.error && direct.status === 0) {
    run("docker", args);
    return;
  }

  if (process.platform !== "win32") {
    throw direct.error ?? new Error("Docker is unavailable");
  }

  const match = /^([A-Za-z]):\\(.*)$/.exec(root);
  if (!match) {
    throw new Error("The repository path cannot be mapped into WSL");
  }
  const wslRoot = `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll("\\", "/")}`;
  run("wsl.exe", ["--cd", wslRoot, "--", "docker", ...args]);
}

function compose(args) {
  docker(["compose", "-f", composeFile, ...args]);
}

compose(["up", "-d", "--wait", "postgres"]);
compose([
  "exec",
  "-T",
  "postgres",
  "createdb",
  "-U",
  databaseUser,
  testDatabase,
]);

try {
  const environment = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_HOST: "127.0.0.1",
    DATABASE_PORT: process.env.DATABASE_PORT ?? "5432",
    DATABASE_NAME: testDatabase,
    DATABASE_USER: databaseUser,
    DATABASE_PASSWORD: process.env.DATABASE_PASSWORD ?? "change-me-local-only",
    DATABASE_SSL_MODE: "disable",
    DATABASE_POOL_MAX: "4",
    DATABASE_CONNECT_TIMEOUT_MS: "5000",
    DATABASE_QUERY_TIMEOUT_MS: "10000",
  };

  run(
    process.execPath,
    ["--test", "tests/integration/database/database.test.mjs"],
    {
      env: environment,
    },
  );
} finally {
  compose([
    "exec",
    "-T",
    "postgres",
    "dropdb",
    "--force",
    "-U",
    databaseUser,
    testDatabase,
  ]);
}
