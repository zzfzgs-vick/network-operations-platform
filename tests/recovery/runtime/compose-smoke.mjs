import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const root = resolve(import.meta.dirname, "../../..");
const composeFile = "deploy/compose/dev.compose.yml";
const project = `nop-t009-${process.pid}-${randomUUID().slice(0, 8)}`;
const collectorToken = `t009-test-only-collector-${randomBytes(24).toString("hex")}`;
const vmAlertToken = `t009-test-only-vmalert-${randomBytes(24).toString("hex")}`;

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return String(address.port);
}

const environment = {
  ...process.env,
  COMPOSE_PROJECT_NAME: project,
  DATABASE_PORT: await freePort(),
  VICTORIAMETRICS_PORT: await freePort(),
  VMALERT_PORT: await freePort(),
  WEB_PORT: await freePort(),
  API_PORT: await freePort(),
  COLLECTOR_SERVICE_TOKEN: collectorToken,
  VMALERT_SERVICE_TOKEN: vmAlertToken,
  WORKER_INSTANCE_ID: "platform-worker-t009-compose",
  PLATFORM_HEALTH_TIMEOUT_MS: "500",
  API_DRAIN_TIMEOUT_MS: "1000",
  API_SHUTDOWN_TIMEOUT_MS: "5000",
  WORKER_SHUTDOWN_TIMEOUT_MS: "5000",
  COLLECTOR_HEALTH_SHUTDOWN_TIMEOUT_MS: "2000",
};

function redact(value) {
  return value
    .replaceAll(collectorToken, "[REDACTED]")
    .replaceAll(vmAlertToken, "[REDACTED]");
}

function run(command, args, { allowFailure = false, timeout = 600_000 } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: environment,
    encoding: "utf8",
    stdio: "pipe",
    timeout,
  });
  if (result.error && !allowFailure) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    const output = redact(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
    throw new Error(
      `${command} exited with status ${result.status}: ${output.slice(-4000)}`,
    );
  }
  return {
    status: result.status,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
  };
}

function compose(args, options) {
  return run(
    "docker",
    [
      "compose",
      "-p",
      project,
      "-f",
      composeFile,
      "--profile",
      "application",
      ...args,
    ],
    options,
  );
}

function serviceId(service, includeStopped = false) {
  return compose(["ps", ...(includeStopped ? ["-a"] : []), "-q", service])
    .stdout;
}

function inspectService(service, includeStopped = false) {
  const id = serviceId(service, includeStopped);
  assert.ok(id, `${service} container is missing`);
  return JSON.parse(run("docker", ["inspect", id]).stdout)[0];
}

async function waitForResponse(url, expectedStatus, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus;
  while (Date.now() < deadline) {
    try {
      const response = await globalThis.fetch(url, {
        headers: { connection: "close" },
        signal: globalThis.AbortSignal.timeout(2000),
      });
      lastStatus = response.status;
      await response.body?.cancel();
      if (response.status === expectedStatus) return;
    } catch {
      lastStatus = "unreachable";
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
  }
  throw new Error(
    `${url} did not reach HTTP ${expectedStatus}; last=${lastStatus}`,
  );
}

async function expectUnreachable(url) {
  try {
    await globalThis.fetch(url, {
      signal: globalThis.AbortSignal.timeout(1000),
    });
    throw new Error(`${url} remains reachable after container stop`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("remains reachable")) {
      throw error;
    }
  }
}

function postgresScalar(sql) {
  return compose([
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    environment.DATABASE_USER ?? "nop",
    "-d",
    environment.DATABASE_NAME ?? "network_operations",
    "-Atc",
    sql,
  ]).stdout;
}

function assertNoProjectResources() {
  const label = `label=com.docker.compose.project=${project}`;
  assert.equal(run("docker", ["ps", "-aq", "--filter", label]).stdout, "");
  assert.equal(
    run("docker", ["volume", "ls", "-q", "--filter", label]).stdout,
    "",
  );
  assert.equal(
    run("docker", ["network", "ls", "-q", "--filter", label]).stdout,
    "",
  );
}

const apiUrl = `http://127.0.0.1:${environment.API_PORT}`;
const webUrl = `http://127.0.0.1:${environment.WEB_PORT}`;
let failure;

try {
  compose(["down", "--volumes", "--remove-orphans"], { allowFailure: true });
  compose(["up", "--build", "-d", "--wait"]);

  for (const service of [
    "postgres",
    "victoriametrics",
    "vmalert",
    "web",
    "api",
    "worker",
    "collector",
  ]) {
    assert.equal(
      inspectService(service).State.Running,
      true,
      `${service} is not running`,
    );
  }
  const migration = inspectService("migrate", true);
  assert.equal(migration.State.Status, "exited");
  assert.equal(migration.State.ExitCode, 0);

  const api = inspectService("api");
  const worker = inspectService("worker");
  assert.equal(api.Image, worker.Image, "API and Worker must reuse one image");
  const pidOne = (service) =>
    compose([
      "exec",
      "-T",
      service,
      "sh",
      "-c",
      "tr '\\000' ' ' < /proc/1/cmdline",
    ]).stdout;
  assert.match(pidOne("api"), /node .*apps\/platform\/dist\/main\.js/);
  assert.match(pidOne("worker"), /node .*apps\/platform\/dist\/worker\.js/);
  assert.match(pidOne("collector"), /collector/);
  assert.match(pidOne("web"), /npm.*start/);
  assert.deepEqual(worker.NetworkSettings.Ports, {});

  await waitForResponse(`${apiUrl}/health/live`, 200);
  await waitForResponse(`${apiUrl}/health/ready`, 200);
  await waitForResponse(webUrl, 200);
  assert.match(
    compose([
      "exec",
      "-T",
      "collector",
      "wget",
      "-q",
      "-O",
      "-",
      "http://127.0.0.1:9090/health/ready",
    ]).stdout,
    /"status":"READY"/,
  );
  assert.equal(
    postgresScalar(
      "select count(*) from platform_worker_heartbeats where status = 'RUNNING'",
    ),
    "1",
  );

  const stopStarted = Date.now();
  compose(["stop", "api", "worker", "collector", "web"], { timeout: 45_000 });
  assert.ok(
    Date.now() - stopStarted < 40_000,
    "container stop exceeded grace periods",
  );
  for (const service of ["api", "worker", "collector", "web"]) {
    const state = inspectService(service, true).State;
    assert.equal(state.Running, false);
    assert.notEqual(state.ExitCode, 137, `${service} required SIGKILL`);
    assert.equal(state.OOMKilled, false);
  }
  assert.equal(
    postgresScalar(
      "select status from platform_worker_heartbeats where instance_id = 'platform-worker-t009-compose'",
    ),
    "STOPPED",
  );
  await expectUnreachable(`${apiUrl}/health/live`);
  await expectUnreachable(webUrl);

  compose(["up", "-d", "--wait", "web", "api", "worker", "collector"]);
  await waitForResponse(`${apiUrl}/health/ready`, 200);
  await waitForResponse(webUrl, 200);

  compose(["stop", "postgres"]);
  await waitForResponse(`${apiUrl}/health/ready`, 503);
  compose(["up", "-d", "--wait", "postgres"]);
  await waitForResponse(`${apiUrl}/health/ready`, 200);

  const logs = compose(["logs", "--no-color"]).stdout;
  assert.equal(
    logs.includes(collectorToken),
    false,
    "Collector Token leaked into logs",
  );
  assert.equal(
    logs.includes(vmAlertToken),
    false,
    "vmalert Token leaked into logs",
  );
  assert.equal(
    postgresScalar(
      "select count(*) from reliable_worker_leases where lease_expires_at = 'infinity'",
    ),
    "0",
  );
} catch (error) {
  for (const service of ["api", "worker", "postgres"]) {
    try {
      const state = inspectService(service, true).State;
      console.error(
        `${service} state=${state.Status} running=${state.Running} exitCode=${state.ExitCode} oomKilled=${state.OOMKilled}`,
      );
    } catch {
      console.error(`${service} state unavailable`);
    }
  }
  failure = error;
} finally {
  compose(["down", "--volumes", "--remove-orphans"], { allowFailure: true });
  try {
    assertNoProjectResources();
  } catch (cleanupError) {
    failure ??= cleanupError;
  }
}

if (failure) throw failure;
console.info("T009 Compose lifecycle smoke passed");
