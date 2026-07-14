import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { CONTRACT_VERSION } from "@nop/contracts";
import { pathToFileURL } from "node:url";

import { WorkerAppModule } from "./bootstrap/worker-app.module.js";
import { DatabaseService } from "./database/database.module.js";
import { waitForShutdown } from "./lifecycle.js";
import { ReliableWorkStore } from "./modules/reliable-work/public.js";
import { ReliableWorkRunner } from "./modules/reliable-work/runner.js";

export async function createWorkerApplication() {
  return NestFactory.createApplicationContext(WorkerAppModule);
}

async function startWorker() {
  const app = await createWorkerApplication();
  const database = app.get(DatabaseService);
  const runner = database.status.connected
    ? new ReliableWorkRunner(new ReliableWorkStore(database.pool))
    : undefined;
  const version = process.env.APP_VERSION ?? "dev";
  console.info(
    `platform-worker started version=${version} contractVersion=${CONTRACT_VERSION}`,
  );

  const running = runner?.run();

  try {
    const signal = running
      ? await Promise.race([
          waitForShutdown(),
          running.then(() => {
            throw new Error("Reliable work runner stopped unexpectedly");
          }),
        ])
      : await waitForShutdown();
    console.info(`platform-worker stopping signal=${signal}`);
  } finally {
    runner?.stop();
    await running?.catch(() => undefined);
    await app.close();
    console.info("platform-worker stopped");
  }
}

const entry = process.argv[1];

if (entry && import.meta.url === pathToFileURL(entry).href) {
  void startWorker().catch((error: unknown) => {
    console.error("platform-worker failed to start", error);
    process.exitCode = 1;
  });
}
