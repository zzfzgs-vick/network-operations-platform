import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const composeFile = "deploy/compose/dev.compose.yml";
const databaseUser = process.env.DATABASE_USER ?? "nop";
const [selection = "database", ...extraSelections] = process.argv.slice(2);

if (
  extraSelections.length > 0 ||
  !["audit", "database", "local-auth", "rbac", "reliable-work"].includes(
    selection,
  )
) {
  throw new Error(
    `Unknown database test selection: ${process.argv.slice(2).join(" ")}`,
  );
}

const ticketBySelection = {
  audit: "t010",
  database: "t004",
  "local-auth": "t011",
  rbac: "t012",
};
const testDatabase = `nop_${ticketBySelection[selection] ?? "t004"}_${randomUUID().replaceAll("-", "")}`;

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
    if (options.capture) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
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

if (selection === "reliable-work") {
  run(process.execPath, ["tests/integration/reliable-work/run.mjs"]);
  process.exit(0);
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

  const testFileBySelection = {
    audit: "tests/integration/audit/audit.test.mjs",
    database: "tests/integration/database/database.test.mjs",
    "local-auth": "tests/integration/auth/local-auth.test.mjs",
    rbac: "tests/integration/authz/rbac.test.mjs",
  };
  const testFile = testFileBySelection[selection];
  if (selection !== "database") {
    const output = run(
      process.execPath,
      ["--test-reporter=tap", "--test", testFile],
      { env: environment, capture: true },
    );
    process.stdout.write(`${output}\n`);
    const count = /^# tests (\d+)$/m.exec(output);
    if (!count || Number(count[1]) < 1) {
      throw new Error(
        `Selected ${selection} database suite executed zero tests`,
      );
    }
  } else {
    run(process.execPath, ["--test", testFile], { env: environment });
  }
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
