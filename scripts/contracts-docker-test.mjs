import { mkdir, rm, rmdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sentinelPaths = [
  "node_modules/docker-context-sentinel.txt",
  "dist/docker-context-sentinel.txt",
  ".cache/docker-context-sentinel.txt",
  ".env.docker-context-sentinel",
  "docker-context-sentinel.pem",
];

function dockerInvocation() {
  const direct = spawnSync("docker", ["version"], { stdio: "ignore" });
  if (!direct.error && direct.status === 0) {
    return { command: "docker", prefix: [] };
  }
  if (process.platform === "win32") {
    return {
      command: "wsl.exe",
      prefix: ["--cd", repositoryRoot, "--", "docker"],
    };
  }
  throw direct.error ?? new Error("Docker is unavailable");
}

const docker = dockerInvocation();
const createdFiles = [];
const createdDirectories = [];

const contractCheck = spawnSync(
  process.execPath,
  ["scripts/contracts-check.mjs"],
  {
    cwd: repositoryRoot,
    stdio: "inherit",
  },
);
if (contractCheck.error) throw contractCheck.error;
if (contractCheck.status !== 0) {
  throw new Error("Contract drift check failed before Docker build");
}

function runDocker(args) {
  const result = spawnSync(docker.command, [...docker.prefix, ...args], {
    cwd: repositoryRoot,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Docker command failed with exit code ${result.status}`);
  }
}

function inspectDocker(args) {
  return spawnSync(docker.command, [...docker.prefix, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

const platformSmoke = `
set -eu
test -f packages/contracts/generated/typescript/index.js
test ! -e packages/contracts/schemas
test ! -e packages/contracts/generated/typescript/index.d.ts
test ! -e apps/platform/src
test ! -e apps/platform/dist/runtime.test.js
test ! -e node_modules/typescript
test ! -e node_modules/eslint
test ! -e node_modules/prettier
node --input-type=module -e '
  await import("./apps/platform/dist/main.js");
  await import("./apps/platform/dist/worker.js");
  await import("@nop/contracts");
  console.log("platform-api-worker-contract=ok");
'
`;

const webSmoke = `
set -eu
test -f apps/web/dist/index.html
test ! -e apps/web/src
test ! -e apps/web/dist/test
test ! -e packages/contracts
test ! -e node_modules/typescript
test ! -e node_modules/eslint
test ! -e node_modules/prettier
test ! -e node_modules/@vitejs/plugin-react
echo web-image-content=ok
`;

try {
  for (const relativePath of sentinelPaths) {
    const path = resolve(repositoryRoot, relativePath);
    const createdDirectory = await mkdir(dirname(path), { recursive: true });
    if (createdDirectory) createdDirectories.push(createdDirectory);
    await writeFile(path, "must-not-be-copied\n", { flag: "wx" });
    createdFiles.push(path);
  }

  runDocker([
    "build",
    "--no-cache",
    "-t",
    "nop-docker-context:t005",
    "-f",
    "tests/contract/docker-context.Dockerfile",
    ".",
  ]);
  runDocker([
    "build",
    "-t",
    "nop-platform:t005",
    "-f",
    "deploy/docker/platform.Dockerfile",
    ".",
  ]);
  runDocker([
    "build",
    "-t",
    "nop-web:t005",
    "-f",
    "deploy/docker/web.Dockerfile",
    ".",
  ]);
  runDocker([
    "run",
    "--rm",
    "--entrypoint",
    "sh",
    "nop-platform:t005",
    "-c",
    platformSmoke,
  ]);
  runDocker([
    "run",
    "--rm",
    "--entrypoint",
    "sh",
    "nop-web:t005",
    "-c",
    webSmoke,
  ]);

  const webContainer = `nop-web-t005-smoke-${process.pid}`;
  try {
    runDocker(["run", "-d", "--rm", "--name", webContainer, "nop-web:t005"]);
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = inspectDocker([
        "exec",
        webContainer,
        "wget",
        "-qO-",
        "http://127.0.0.1:4173",
      ]);
      if (
        response.status === 0 &&
        response.stdout.includes('<div id="root"></div>')
      ) {
        ready = true;
        break;
      }
      await delay(500);
    }
    if (!ready) throw new Error("Web runtime did not become ready");
    console.info("web-runtime=ok");
  } finally {
    inspectDocker(["stop", webContainer]);
  }
} finally {
  for (const path of createdFiles) {
    await rm(path, { force: true });
  }
  for (const path of createdDirectories.reverse()) {
    await rmdir(path).catch((error) => {
      if (error.code !== "ENOTEMPTY") throw error;
    });
  }
}
