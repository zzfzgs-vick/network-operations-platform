import type { IssuedWebSession } from "../../application/session.js";

export const AUTHENTICATED_SESSION_COOKIE = "__Host-nop_session";
export const PRE_AUTHENTICATION_COOKIE = "__Host-nop_preauth";

const cookieName = (type: IssuedWebSession["type"]) =>
  type === "AUTHENTICATED"
    ? AUTHENTICATED_SESSION_COOKIE
    : PRE_AUTHENTICATION_COOKIE;

export function sessionCookie(session: IssuedWebSession) {
  const maxAge = Math.max(
    0,
    Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1000),
  );
  return `${cookieName(session.type)}=${session.token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearedSessionCookies() {
  const attributes = "Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
  return [
    `${AUTHENTICATED_SESSION_COOKIE}=; ${attributes}`,
    `${PRE_AUTHENTICATION_COOKIE}=; ${attributes}`,
  ];
}

export function cookieValue(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header || header.length > 4096) return undefined;
  for (const item of header.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 1) continue;
    if (item.slice(0, separator).trim() !== name) continue;
    const value = item.slice(separator + 1).trim();
    return /^[A-Za-z0-9_-]{43}$/u.test(value) ? value : undefined;
  }
  return undefined;
}
