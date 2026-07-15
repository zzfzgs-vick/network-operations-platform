import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { pathToFileURL } from "node:url";

import { ApiAppModule } from "./bootstrap/api-app.module.js";
import {
  readApiListenConfig,
  readRuntimeIdentityConfig,
  readRuntimeShutdownConfig,
} from "./config/public.js";
import {
  RuntimeLifecycle,
  waitForShutdown,
  withinDeadline,
} from "./lifecycle.js";

export async function createApiApplication() {
  return NestFactory.create(ApiAppModule);
}

async function startApi() {
  const listen = readApiListenConfig();
  const runtime = readRuntimeIdentityConfig();
  const shutdown = readRuntimeShutdownConfig();
  const app = await createApiApplication();
  const lifecycle = app.get(RuntimeLifecycle);

  await app.listen(listen.port, listen.host);
  console.info(`platform-api started version=${runtime.version}`);

  const signal = await waitForShutdown();
  lifecycle.beginDrain();
  console.info(`platform-api stopping signal=${signal}`);
  const deadline = Date.now() + shutdown.apiShutdownTimeoutMs;
  const idle = await lifecycle.waitForIdle(
    Math.min(shutdown.apiDrainTimeoutMs, shutdown.apiShutdownTimeoutMs),
  );
  if (!idle) console.warn("platform-api drain timed out");
  await withinDeadline(app.close(), deadline, "platform-api shutdown");
  lifecycle.markStopped();
  console.info("platform-api stopped");
}

const entry = process.argv[1];

if (entry && import.meta.url === pathToFileURL(entry).href) {
  void startApi().catch((error: unknown) => {
    console.error(
      `platform-api failed errorType=${error instanceof Error ? error.name : "Unknown"}`,
    );
    process.exit(1);
  });
}
