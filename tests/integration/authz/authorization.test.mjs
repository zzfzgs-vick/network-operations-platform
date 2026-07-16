import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import { Controller, Get, Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";

import {
  AuthorizationDeniedError,
  PublicEndpoint,
  RequirePermission,
  USER_AUTHORIZER,
  attachAuthenticatedUser,
} from "../../../apps/platform/dist/modules/identity-access/public.js";
import { PermissionGuard } from "../../../apps/platform/dist/modules/identity-access/adapters/http/permission.guard.js";
import { mapHttpError } from "../../../apps/platform/dist/http/contract-exception.filter.js";

const { fetch } = globalThis;
const calls = [];
const authorization = {
  async authorize(principal, permission) {
    calls.push({ principal, permission });
    return principal?.userId === "allowed-user" && permission === "assets.read";
  },
};

class AuthorizationTestController {
  allowed() {
    return { status: "allowed" };
  }

  denied() {
    return { status: "should-not-run" };
  }

  undeclared() {
    return { status: "should-not-run" };
  }

  publicEndpoint() {
    return { status: "public" };
  }
}

Controller("authz")(AuthorizationTestController);
for (const method of ["allowed", "denied", "undeclared", "publicEndpoint"]) {
  Get(method)(
    AuthorizationTestController.prototype,
    method,
    Object.getOwnPropertyDescriptor(
      AuthorizationTestController.prototype,
      method,
    ),
  );
}
for (const method of ["allowed", "denied"]) {
  RequirePermission("assets.read")(
    AuthorizationTestController.prototype,
    method,
    Object.getOwnPropertyDescriptor(
      AuthorizationTestController.prototype,
      method,
    ),
  );
}
PublicEndpoint()(
  AuthorizationTestController.prototype,
  "publicEndpoint",
  Object.getOwnPropertyDescriptor(
    AuthorizationTestController.prototype,
    "publicEndpoint",
  ),
);

class AuthorizationTestModule {}
Module({
  controllers: [AuthorizationTestController],
  providers: [
    { provide: USER_AUTHORIZER, useValue: authorization },
    PermissionGuard,
    { provide: APP_GUARD, useExisting: PermissionGuard },
  ],
})(AuthorizationTestModule);

let app;
let baseUrl;

before(async () => {
  app = await NestFactory.create(AuthorizationTestModule, {
    abortOnError: false,
    logger: false,
  });
  app.use((request, _response, next) => {
    if (request.url?.startsWith("/authz/allowed")) {
      attachAuthenticatedUser(request, {
        kind: "platform-user",
        userId: "allowed-user",
        authorizationVersion: 1,
      });
    }
    next();
  });
  await app.listen(0, "127.0.0.1");
  baseUrl = await app.getUrl();
});

after(async () => app?.close());

test("declared Permission allows an attached platform user", async () => {
  const response = await fetch(`${baseUrl}/authz/allowed`);
  assert.equal(response.status, 200);
  assert.equal(calls.at(-1)?.permission, "assets.read");
  assert.equal(calls.at(-1)?.principal?.userId, "allowed-user");
});

test("a direct API request without authority is denied", async () => {
  const response = await fetch(`${baseUrl}/authz/denied`);
  assert.equal(response.status, 403);
});

test("an undeclared route is denied by default", async () => {
  const response = await fetch(`${baseUrl}/authz/undeclared`);
  assert.equal(response.status, 403);
  assert.equal(calls.at(-1)?.permission, undefined);
});

test("a service identity header cannot enter user RBAC", async () => {
  const response = await fetch(`${baseUrl}/authz/denied`, {
    headers: {
      authorization: "Bearer test-only-service-token-not-a-user-session",
      "x-nop-service": "collector",
    },
  });
  assert.equal(response.status, 403);
  assert.equal(calls.at(-1)?.principal, undefined);
});

test("explicit public endpoints bypass only user authorization", async () => {
  const before = calls.length;
  const response = await fetch(`${baseUrl}/authz/publicEndpoint`);
  assert.equal(response.status, 200);
  assert.equal(calls.length, before);
});

test("transactional authorization denials retain the 403 error contract", () => {
  const mapped = mapHttpError(
    new AuthorizationDeniedError(),
    "00000000-0000-4000-8000-000000000012",
  );
  assert.equal(mapped.status, 403);
  assert.equal(mapped.body.error.code, "PLATFORM_FORBIDDEN");
});
