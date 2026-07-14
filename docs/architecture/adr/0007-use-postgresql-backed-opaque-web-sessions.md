---
status: accepted
date: 2026-07-13
---

# Use PostgreSQL-backed opaque Sessions for the Web console

The same-origin MVP Web console uses opaque, centrally revocable server-side Sessions stored in PostgreSQL. Cookies carry only at least 256 bits of random Token material, PostgreSQL stores only a fixed-length Token hash, and browser access JWTs, `localStorage`, remember-me behavior, Redis, cross-site console deployment, URL Tokens, and multi-domain Cookies are excluded.

Pre-authentication Sessions expire after 5 minutes and cannot access business APIs; MFA creates a new Authenticated Session rather than upgrading the old Token. Authenticated Sessions use server-enforced 30-minute idle and 12-hour absolute limits, explicit User Activity semantics, Token rotation at authentication and privilege boundaries, and `authorizationVersion` checks so existing Sessions cannot silently gain or retain changed authority.

Host-only secure Cookies are combined with independent CSRF protection. Logout, user disablement, credential or MFA reset, security incidents, and authorization changes revoke affected Sessions; SSE and any future WebSocket cannot outlive revocation or expiry. PostgreSQL failure fails closed, and disaster recovery invalidates every restored Session so historical Cookies never reactivate.

Unattended leadership displays are not granted longer Sessions by this decision. Any Display Session or kiosk access requires a separate decision after its physical and information-exposure boundary is confirmed.
