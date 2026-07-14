import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { pathToFileURL } from "node:url";

import { ApiAppModule } from "./bootstrap/api-app.module.js";
import { waitForShutdown } from "./lifecycle.js";

export async function createApiApplication() {
  return NestFactory.create(ApiAppModule);
}

function configuredPort() {
  const value = Number(process.env.PORT ?? "3000");

  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return value;
}

async function startApi() {
  const app = await createApiApplication();
  const version = process.env.APP_VERSION ?? "dev";

  await app.listen(configuredPort(), process.env.HOST ?? "127.0.0.1");
  console.info(`platform-api started version=${version}`);

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
