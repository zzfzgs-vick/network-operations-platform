import assert from "node:assert/strict";
import test from "node:test";
import { URL } from "node:url";

import {
  AUTHENTICATED_SESSION_COOKIE,
  PRE_AUTHENTICATION_COOKIE,
  clearedSessionCookies,
  cookieValue,
  sessionCookie,
} from "../../../apps/platform/dist/modules/identity-access/adapters/http/session-cookie.js";

const token = "A".repeat(43);

test("authenticated cookie uses the Host prefix and hardened attributes", () => {
  const value = sessionCookie({
    sessionId: "00000000-0000-4000-8000-000000000013",
    type: "AUTHENTICATED",
    token,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  assert.match(value, /^__Host-nop_session=/u);
  assert.match(value, /; Path=\//u);
  assert.match(value, /; HttpOnly/u);
  assert.match(value, /; Secure/u);
  assert.match(value, /; SameSite=Lax/u);
  assert.doesNotMatch(value, /Domain=/iu);
});

test("pre-authentication uses a distinct hardened cookie", () => {
  const value = sessionCookie({
    sessionId: "00000000-0000-4000-8000-000000000014",
    type: "PRE_AUTH",
    token,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  assert.match(value, /^__Host-nop_preauth=/u);
  assert.doesNotMatch(value, /__Host-nop_session=/u);
});

test("cookie parser accepts only the exact bounded opaque token", () => {
  assert.equal(
    cookieValue(
      `other=x; ${AUTHENTICATED_SESSION_COOKIE}=${token}`,
      AUTHENTICATED_SESSION_COOKIE,
    ),
    token,
  );
  assert.equal(
    cookieValue(
      `${AUTHENTICATED_SESSION_COOKIE}=short`,
      AUTHENTICATED_SESSION_COOKIE,
    ),
    undefined,
  );
  assert.equal(
    cookieValue(
      `${AUTHENTICATED_SESSION_COOKIE}=${"A".repeat(44)}`,
      AUTHENTICATED_SESSION_COOKIE,
    ),
    undefined,
  );
});

test("oversized and control-character cookies fail closed", () => {
  assert.equal(
    cookieValue("x".repeat(4097), AUTHENTICATED_SESSION_COOKIE),
    undefined,
  );
  assert.equal(
    cookieValue(
      `${AUTHENTICATED_SESSION_COOKIE}=${"A".repeat(42)}\n`,
      AUTHENTICATED_SESSION_COOKIE,
    ),
    undefined,
  );
});

test("logout clears both cookie classes without Domain", () => {
  const cleared = clearedSessionCookies();
  assert.equal(cleared.length, 2);
  assert.ok(
    cleared.some((item) => item.startsWith(`${AUTHENTICATED_SESSION_COOKIE}=`)),
  );
  assert.ok(
    cleared.some((item) => item.startsWith(`${PRE_AUTHENTICATION_COOKIE}=`)),
  );
  for (const item of cleared) {
    assert.match(item, /Max-Age=0/u);
    assert.match(item, /HttpOnly; Secure; SameSite=Lax/u);
    assert.doesNotMatch(item, /Domain=/iu);
  }
});

test("cookie names and token are never URL material", () => {
  const url = new URL("https://platform.test/api/auth/login");
  assert.equal(url.search, "");
  assert.equal(url.href.includes(token), false);
  assert.ok(AUTHENTICATED_SESSION_COOKIE.startsWith("__Host-"));
  assert.ok(PRE_AUTHENTICATION_COOKIE.startsWith("__Host-"));
});
