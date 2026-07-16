import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const selections = process.argv.slice(2);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (options.capture) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    throw new Error(`${command} exited with status ${result.status}`);
  }
  return result.stdout?.trim() ?? "";
}

function runTests(file, environment) {
  const output = run(
    process.execPath,
    ["--test-reporter=tap", "--test", file],
    { env: environment, capture: true },
  );
  process.stdout.write(`${output}\n`);
  const count = /^# tests (\d+)$/m.exec(output);
  if (!count || Number(count[1]) < 1) {
    throw new Error("Selected integration test suite executed zero tests");
  }
}

function docker(args) {
  const direct = spawnSync("docker", ["version"], { stdio: "ignore" });
  if (!direct.error && direct.status === 0) return run("docker", args);
  if (process.platform !== "win32") {
    throw direct.error ?? new Error("Docker is unavailable");
  }
  const match = /^([A-Za-z]):\\(.*)$/.exec(root);
  if (!match) throw new Error("The repository path cannot be mapped into WSL");
  const wslRoot = `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll("\\", "/")}`;
  return run("wsl.exe", ["--cd", wslRoot, "--", "docker", ...args]);
}

if (selections.length !== 1) {
  throw new Error(
    `Unknown integration test selection: ${selections.join(" ")}`,
  );
}

if (selections[0] === "platform-health") {
  try {
    run(process.execPath, [
      "tests/integration/health/run.mjs",
      "platform-health",
    ]);
  } finally {
    rmSync(resolve(root, "apps/platform/dist"), {
      recursive: true,
      force: true,
    });
  }
} else if (
  selections[0] === "service-auth" ||
  selections[0] === "login" ||
  selections[0] === "csrf" ||
  selections[0] === "session-lifecycle"
) {
  const ticket =
    selections[0] === "login"
      ? "t013"
      : selections[0] === "csrf" || selections[0] === "session-lifecycle"
        ? "t014"
        : "t008";
  const database = `nop_${ticket}_${randomUUID().replaceAll("-", "")}`;
  const databaseUser = process.env.DATABASE_USER ?? "nop";
  const compose = (args) =>
    docker(["compose", "-f", "deploy/compose/dev.compose.yml", ...args]);
  compose(["up", "-d", "--wait", "postgres"]);
  compose(["exec", "-T", "postgres", "createdb", "-U", databaseUser, database]);
  try {
    const environment = {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_HOST: "127.0.0.1",
      DATABASE_PORT: process.env.DATABASE_PORT ?? "5432",
      DATABASE_NAME: database,
      DATABASE_USER: databaseUser,
      DATABASE_PASSWORD:
        process.env.DATABASE_PASSWORD ?? "change-me-local-only",
      DATABASE_SSL_MODE: "disable",
      DATABASE_POOL_MAX: "8",
      DATABASE_CONNECT_TIMEOUT_MS: "5000",
      DATABASE_QUERY_TIMEOUT_MS: "10000",
      COLLECTOR_SERVICE_TOKEN: "t008-test-only-collector-token-not-production",
      VMALERT_SERVICE_TOKEN: "t008-test-only-vmalert-token-not-production",
      WEB_ORIGIN: "https://network-operations.test",
      SESSION_REVALIDATION_INTERVAL_MS: "100",
    };
    run(process.execPath, ["apps/platform/dist/migrate.js", "up"], {
      env: environment,
    });
    runTests(
      selections[0] === "login"
        ? "tests/integration/session/login.test.mjs"
        : selections[0] === "csrf"
          ? "tests/integration/session/csrf.test.mjs"
          : selections[0] === "session-lifecycle"
            ? "tests/integration/session/session-lifecycle.test.mjs"
            : "tests/integration/config/service-auth.test.mjs",
      environment,
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
      database,
    ]);
    rmSync(resolve(root, "apps/platform/dist"), {
      recursive: true,
      force: true,
    });
  }
} else {
  throw new Error(`Unknown integration test selection: ${selections[0]}`);
}
