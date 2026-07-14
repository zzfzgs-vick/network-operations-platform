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
    const response = await fetch(await app.getUrl(), {
      headers: { "x-request-id": "runtime-test-1" },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-request-id"), "runtime-test-1");
    assert.deepEqual(await response.json(), {
      contractVersion: "v1",
      service: "platform-api",
      status: "READY",
      version: "dev",
      requestId: "runtime-test-1",
    });
  } finally {
    await app.close();
  }
});

test("API returns a correlated safe contract for unknown routes", async () => {
  const app = await createApiApplication();

  try {
    await app.listen(0, "127.0.0.1");
    const response = await fetch(`${await app.getUrl()}/missing`, {
      headers: { "x-request-id": "missing-route-1" },
    });

    assert.equal(response.status, 404);
    assert.match(
      response.headers.get("content-type") ?? "",
      /application\/json/,
    );
    assert.equal(response.headers.get("x-request-id"), "missing-route-1");
    assert.deepEqual(await response.json(), {
      contractVersion: "v1",
      error: {
        code: "PLATFORM_NOT_FOUND",
        message: "The requested resource was not found",
        requestId: "missing-route-1",
        retryable: false,
      },
    });
  } finally {
    await app.close();
  }
});

test("API replaces an invalid inbound request ID", async () => {
  const app = await createApiApplication();

  try {
    await app.listen(0, "127.0.0.1");
    const response = await fetch(await app.getUrl(), {
      headers: { "x-request-id": "invalid request id" },
    });
    const requestId = response.headers.get("x-request-id");

    assert.ok(requestId);
    assert.notEqual(requestId, "invalid request id");
    assert.match(requestId, /^[0-9a-f-]{36}$/);
  } finally {
    await app.close();
  }
});

test("API correlates errors raised before route middleware", async () => {
  const app = await createApiApplication();

  try {
    await app.listen(0, "127.0.0.1");
    const response = await fetch(await app.getUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "early-parser-error-1",
      },
      body: "{",
    });
    const body = (await response.json()) as {
      error: { requestId?: string };
    };

    assert.equal(response.status, 400);
    assert.equal(response.headers.get("x-request-id"), "early-parser-error-1");
    assert.equal(response.headers.get("x-request-id"), body.error.requestId);
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
