import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { pathToFileURL } from "node:url";

import { ApiAppModule } from "./bootstrap/api-app.module.js";
import {
  readApiListenConfig,
  readRuntimeIdentityConfig,
} from "./config/public.js";
import { waitForShutdown } from "./lifecycle.js";

export async function createApiApplication() {
  return NestFactory.create(ApiAppModule);
}

async function startApi() {
  const listen = readApiListenConfig();
  const runtime = readRuntimeIdentityConfig();
  const app = await createApiApplication();

  await app.listen(listen.port, listen.host);
  console.info(`platform-api started version=${runtime.version}`);

  const signal = await waitForShutdown();
  console.info(`platform-api stopping signal=${signal}`);
  await app.close();
  console.info("platform-api stopped");
}

const entry = process.argv[1];

if (entry && import.meta.url === pathToFileURL(entry).href) {
  void startApi().catch((error: unknown) => {
    console.error("platform-api failed to start", error);
    process.exitCode = 1;
  });
}
