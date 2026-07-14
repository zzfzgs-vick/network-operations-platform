import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { pathToFileURL } from "node:url";

import { WorkerAppModule } from "./bootstrap/worker-app.module.js";
import { waitForShutdown } from "./lifecycle.js";

export async function createWorkerApplication() {
  return NestFactory.createApplicationContext(WorkerAppModule);
}

async function startWorker() {
  const app = await createWorkerApplication();
  const version = process.env.APP_VERSION ?? "dev";
  console.info(`platform-worker started version=${version}`);

  const signal = await waitForShutdown();
  console.info(`platform-worker stopping signal=${signal}`);
  await app.close();
  console.info("platform-worker stopped");
}

const entry = process.argv[1];

if (entry && import.meta.url === pathToFileURL(entry).href) {
  void startWorker().catch((error: unknown) => {
    console.error("platform-worker failed to start", error);
    process.exitCode = 1;
  });
}
