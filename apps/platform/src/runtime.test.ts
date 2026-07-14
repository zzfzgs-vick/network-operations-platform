import assert from "node:assert/strict";
import { createConnection, createServer } from "node:net";
import test from "node:test";

import { createApiApplication } from "./main.js";
import { createWorkerApplication } from "./worker.js";

async function unusedPort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Unable to allocate a test port");
  }

  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );

  return address.port;
}

async function canConnect(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });

    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

test("API listens and reports its runtime identity", async () => {
  const app = await createApiApplication();

  try {
    await app.listen(0, "127.0.0.1");
    const response = await fetch(await app.getUrl());

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      service: "platform-api",
      version: "dev",
    });
  } finally {
    await app.close();
  }
});

test("Worker starts without opening an HTTP listener", async () => {
  const port = await unusedPort();
  process.env.PORT = String(port);
  const app = await createWorkerApplication();

  try {
    assert.equal(await canConnect(port), false);
  } finally {
    await app.close();
    delete process.env.PORT;
  }
});
