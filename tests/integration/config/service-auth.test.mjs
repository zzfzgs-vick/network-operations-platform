import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { Body, Controller, Module, Post, Req } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { readDatabaseConfig } from "../../../apps/platform/dist/database/config.js";
import { createDatabasePool } from "../../../apps/platform/dist/database/database.js";
import {
  InternalServiceAuthModule,
  RequireServiceCapability,
  servicePrincipalFrom,
  ServiceAuthenticationMetrics,
} from "../../../apps/platform/dist/config/service-auth.js";
import { ReliableWorkStore } from "../../../apps/platform/dist/modules/reliable-work/public.js";

const { fetch } = globalThis;
const collectorToken = process.env.COLLECTOR_SERVICE_TOKEN;
const vmAlertToken = process.env.VMALERT_SERVICE_TOKEN;
if (!collectorToken || !vmAlertToken)
  throw new Error("Test credentials are required");

const pool = createDatabasePool(readDatabaseConfig(process.env));
const store = new ReliableWorkStore(pool);
let app;
let baseUrl;

class InternalTestController {
  async collector(request, body) {
    const principal = servicePrincipalFrom(request);
    return store.acceptInbox({
      sourceId: principal.service,
      idempotencyKey: body.idempotencyKey,
      messageKind: "test-observation",
      payloadReference: "test://t008/observation",
    });
  }

  vmAlert(request) {
    return { service: servicePrincipalFrom(request).service };
  }
}

Controller("internal/test")(InternalTestController);
Post("collector")(
  InternalTestController.prototype,
  "collector",
  Object.getOwnPropertyDescriptor(
    InternalTestController.prototype,
    "collector",
  ),
);
RequireServiceCapability("observation.ingest")(
  InternalTestController.prototype,
  "collector",
  Object.getOwnPropertyDescriptor(
    InternalTestController.prototype,
    "collector",
  ),
);
Req()(InternalTestController.prototype, "collector", 0);
Body()(InternalTestController.prototype, "collector", 1);
Post("vmalert")(
  InternalTestController.prototype,
  "vmAlert",
  Object.getOwnPropertyDescriptor(InternalTestController.prototype, "vmAlert"),
);
RequireServiceCapability("metric-condition.ingest")(
  InternalTestController.prototype,
  "vmAlert",
  Object.getOwnPropertyDescriptor(InternalTestController.prototype, "vmAlert"),
);
Req()(InternalTestController.prototype, "vmAlert", 0);

class TestModule {}
Module({
  imports: [InternalServiceAuthModule],
  controllers: [InternalTestController],
})(TestModule);

before(async () => {
  app = await NestFactory.create(TestModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  baseUrl = await app.getUrl();
});

after(async () => {
  await app?.close();
  await pool.end();
});

async function submit(path, service, token, idempotencyKey = "t008-message-1") {
  return fetch(`${baseUrl}/internal/test/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(service ? { "x-nop-service": service } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ idempotencyKey }),
  });
}

test("missing and invalid credentials are denied before reliable work", async () => {
  const counts = () =>
    pool.query(`
      select
        (select count(*)::int from public.reliable_inbox_messages) as inbox,
        (select count(*)::int from public.reliable_outbox_messages) as outbox,
        (select count(*)::int from public.reliable_background_jobs) as jobs,
        (select duplicate_count::int from public.reliable_inbox_observability where singleton) as duplicates,
        (select count(*)::int from public.platform_worker_heartbeats) as heartbeats
    `);
  const beforeCount = await counts();
  const missing = await submit("collector");
  const differentlyCased = await fetch(`${baseUrl}/INTERNAL/test/collector`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idempotencyKey: "t008-case-bypass" }),
  });
  const invalid = await submit("collector", "collector", "t008-invalid-token");
  const afterCount = await counts();

  assert.equal(missing.status, 401);
  assert.equal(differentlyCased.status, 401);
  assert.equal(invalid.status, 401);
  assert.deepEqual(afterCount.rows[0], beforeCount.rows[0]);
  assert.equal((await missing.text()).includes(collectorToken), false);
  assert.equal((await invalid.text()).includes("t008-invalid-token"), false);
});

test("Collector authentication preserves reliable-work idempotency", async () => {
  const first = await submit("collector", "collector", collectorToken);
  const repeated = await submit("collector", "collector", collectorToken);
  assert.equal(first.status, 201);
  assert.equal(repeated.status, 201);
  assert.equal((await first.json()).accepted, true);
  assert.equal((await repeated.json()).accepted, false);
});

test("service capability and identity mismatches are denied", async () => {
  const wrongCapability = await submit("vmalert", "collector", collectorToken);
  const identityMismatch = await submit(
    "collector",
    "collector",
    vmAlertToken,
    "t008-message-2",
  );
  assert.equal(wrongCapability.status, 401);
  assert.equal(identityMismatch.status, 401);
});

test("vmalert authenticates only for its metric-condition capability", async () => {
  const response = await submit("vmalert", "vmalert", vmAlertToken);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { service: "vmalert" });
});

test("authentication failure metrics come from the real rejection path", () => {
  const metrics = app.get(ServiceAuthenticationMetrics).snapshot();
  assert.ok(
    metrics.some((entry) => entry.reason === "missing" && entry.count >= 1),
  );
  assert.ok(
    metrics.some((entry) => entry.reason === "invalid" && entry.count >= 1),
  );
  assert.equal(JSON.stringify(metrics).includes(collectorToken), false);
  assert.equal(JSON.stringify(metrics).includes(vmAlertToken), false);
});
