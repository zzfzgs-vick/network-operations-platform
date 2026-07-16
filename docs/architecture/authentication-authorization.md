# Authentication and authorization architecture

Status: Local authentication, RBAC, permission-level TOTP, PostgreSQL-backed Web Sessions, and interactive Executive Dashboard access decided.

## Identity boundary

The platform owns an immutable `userId` for every Platform User. Usernames, email addresses, credentials, and future external subject identifiers are authentication attributes or bindings, not business identity.

Business modules consume only a normalized authenticated principal containing `userId`, Session ID, user status, Roles, Permissions, authentication method, and authentication time. They do not consume password hashes, LDAP DNs, raw OIDC token structures, vendor-specific identity fields, or AD organizational-unit structure.

## Authentication provider boundary

The authentication module defines a provider boundary conceptually equivalent to:

```text
AuthenticationProvider
├── LocalAuthenticationProvider   # MVP
└── OidcAuthenticationProvider    # Future
```

Only local authentication is implemented in the MVP. External Identity remains an extension boundary rather than a required database or integration feature. A future OIDC provider must produce the same normalized platform principal and bind its stable external subject to an existing `userId`.

## Local user lifecycle

- Administrators create, enable, disable, and reset local users.
- Initial or reset temporary passwords require change at the next login.
- Disabled users immediately lose access and their Sessions are revoked.
- Password change and reset revoke existing Sessions.
- User lifecycle changes are audited and historical `userId` references remain intact.
- There is no public registration or self-service privilege request.

## Password storage and policy

- Store passwords only with a mature password hash, preferring Argon2id, an independent random salt per password, and configurable, upgradeable parameters.
- Never store plaintext or reversibly encrypted passwords.
- Never return password or hash fields through an API or write them to ordinary logs.
- Require at least 12 characters, accept long passwords without truncation, reject common weak passwords and username reuse, and do not impose mechanical character-class rules.
- Require the current password for an ordinary password change; administrative reset is the exception.
- Do not use fixed periodic expiration without a security reason. Require rotation after confirmed exposure, administrative reset, or a relevant security event.
- Never embed a fixed default password in code or documentation.

Security thresholds and hash parameters are centralized configuration, not scattered constants.

## Login protection

- Apply rate limits to account and source failures, with increasing delay or temporary lockout.
- Never use permanent automatic lockout that can become a denial-of-service mechanism.
- Return a uniform authentication failure that does not reveal whether a user exists.
- Record successful and failed Authentication Events with time, candidate user when safely identifiable, source address, client information, result, and failure category.
- Production login uses HTTPS only and never accepts credentials or Session tokens in URL query parameters.
- Apply the appropriate CSRF, Cookie, and trusted reverse-proxy security policy.

## Web origin boundary

Production uses one HTTPS origin:

```text
https://network-operations.example/
├── /          React frontend
├── /api/      NestJS API
├── /events/   SSE
└── /ws/       WebSocket, only if later required
```

The MVP does not support cross-site frontend/API deployment, third-party embedding of the management console, multi-domain Session Cookies, or Session Tokens in URLs.

## Server-side Session strategy

Interactive Web authentication uses opaque, centrally revocable Sessions stored in PostgreSQL. The browser receives only a random Session Token in a Cookie; PostgreSQL stores only its hash. The Session is the authorization authority for every protected request.

The MVP does not use JWT bearer access tokens for browser login, browser `localStorage`, remember-me Sessions, process-local authorization caches, or Redis for Session storage. Redis or another Session store requires measured evidence that PostgreSQL lookup is a bottleneck and a new ADR.

## Session types and timeouts

### Pre-authentication Session

- Supports TOTP verification, MFA enrollment, Recovery Code verification, and other explicitly allowed authentication flows.
- Has a fixed maximum lifetime of 5 minutes and no activity extension.
- Cannot access inventory, topology, metrics, alerts, user management, or any other business API.
- Is revoked after MFA completion.
- Never becomes an Authenticated Session using the same Token.

### Authenticated Session

- Has a default 30-minute idle timeout.
- Has a default 12-hour absolute lifetime measured from creation.
- Uses the already-decided 10-minute recent-MFA window for sensitive operations.
- Has no remember-me extension.

Timeout parameters are centralized configuration with these production defaults. The server calculates and enforces every timeout; browser timers only provide user warnings.

## Session Token

The raw Session Token uses at least 32 bytes of CSPRNG output encoded with Base64URL or an equivalent Cookie-safe encoding. It contains no `userId`, username, timestamp, Role, Permission, or other business information.

PostgreSQL stores `SHA-256(rawSessionToken)` or a security-reviewed equivalent fixed-length digest and a unique lookup index on the digest. Raw values exist only in the Cookie and current request memory and are prohibited from databases, response bodies, logs, traces, errors, and audit records.

Digest comparison avoids unnecessary timing disclosure. A revoked or expired Token never becomes valid again.

## Cookie baseline

Production uses separate host-only Cookies such as `__Host-nop_session` and `__Host-nop_preauth`. Each has `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`, explicit expiry, and HTTPS-only issuance and transport.

JavaScript cannot read the Session Cookie. The server does not accept Session Tokens through URL parameters, form fields, custom query parameters, or response bodies. Localhost development has separate configuration without weakening production defaults.

`SameSite=Strict` may be evaluated only if external links do not need to enter an authenticated page.

## CSRF protection

Cookie authentication has independent CSRF protection. `SameSite` is defense in depth, not the only control.

- `GET`, `HEAD`, and `OPTIONS` never change business state.
- Every state-changing request uses an unsafe HTTP method and a session-bound CSRF Token or reviewed framework-supported custom-header mechanism.
- The backend validates `Origin` and, where necessary, `Referer` against the configured origin.
- Login, logout, password, TOTP, Role, credential, and system-configuration operations are protected.
- CORS denies every origin not explicitly authorized.
- CSRF values never appear in URLs or logs.

The concrete Synchronizer Token or framework mechanism is selected during technical design; the project does not invent a new protocol.

## Idle and absolute timeout semantics

Idle expiry advances only after explicit User Activity such as navigation, submitted query, alert acknowledgement, configuration change, or deliberate detail request.

SSE heartbeat, WebSocket Ping/Pong, background refresh, topology auto-update, metric polling, a merely open page, and health checks do not advance idle expiry. The frontend warns before idle expiry and requires explicit interaction to continue.

Absolute expiry never advances through activity, Cookie refresh, or child Sessions. At 12 hours the user authenticates again.

## Session rotation

The server creates a new Token and revokes the prior Token after password verification, TOTP completion, password change/reset, TOTP enrollment/reset/unbinding, Sensitive Permission grant, break-glass recovery, or suspected fixation or hijacking.

MFA completion always replaces the Pre-authentication Session rather than upgrading its Token.

## Authorization Version

Each Platform User has a monotonic `authorizationVersion`, and each Authenticated Session records the value at creation. Role assignment/removal, direct Permission change, Role Permission changes, user disablement, and gaining or losing Sensitive Permissions increment the user value.

Every protected request compares Session and user versions. A mismatch rejects the request, revokes the Session, and requires reauthentication; Sensitive Permissions may require MFA enrollment or verification. Frontend refresh never grants a long-running Session new authority.

## Session record

The conceptual PostgreSQL record contains `sessionId`, `tokenHash`, `userId`, `sessionType`, `createdAt`, `lastUserActivityAt`, `idleExpiresAt`, `absoluteExpiresAt`, `revokedAt`, `revocationReason`, `authorizationVersion`, `authenticationStrength`, `passwordVerifiedAt`, `mfaVerifiedAt`, `sourceIp`, `userAgentSummary`, and `requestCorrelationId`.

`sessionId` is internal immutable identity; `tokenHash` is the authentication lookup. IP and User-Agent are audit and risk signals, not strict binding rules, so ordinary proxies, DHCP, network movement, or browser patch changes do not automatically revoke access.

## Revocation

Logout, explicit current-Session termination, and expiry revoke the current Session. User disablement, password reset, confirmed credential exposure, TOTP reset, break-glass recovery, logout-all, and account-security incidents revoke all Sessions for the Platform User.

Users may view their active Sessions and revoke the current, another, or all other Sessions. Administrators with `sessions.manage` may revoke another user's Sessions without access to raw Tokens.

## SSE and WebSocket

SSE verifies Session state when connecting, closes at idle or absolute expiry, closes promptly after revocation, and revalidates on reconnect. Heartbeats do not update User Activity.

If WebSocket enters the MVP, its handshake verifies Session and `Origin`, no Token travels in the query string, revocation and expiry are checked periodically, Authorization Version changes close the connection, and Ping/Pong does not extend idle lifetime.

SSE is preferred when reliable WebSocket revocation would add unnecessary complexity.

## PostgreSQL operation and cleanup

Every protected request checks authoritative server-side Session and Platform User state. PostgreSQL or unified UTC time determines expiry. Required indexes cover Token hash, user, expiry, and revocation state.

A background operation removes expired Pre-authentication and Authenticated Sessions after retaining audit-required metadata. Cleanup failure produces an operational alert. PostgreSQL failure denies authentication and authorization rather than falling open.

## Disaster recovery

Restoring PostgreSQL invalidates all restored Pre-authentication and Authenticated Sessions. Historical Cookie values never reactivate; every Platform User and Emergency Administrator authenticates again. Recovery records the bulk invalidation operation.

Session records may remain in backups for audit, but restore procedure forces them revoked.

## Session audit and client behavior

Audit covers creation, MFA transition, rotation, logout, idle and absolute expiry, user or administrator revocation, Authorization Version mismatch, user-disablement revocation, password or MFA change, disaster-recovery invalidation, and suspicious use.

Raw Session Tokens, Cookie headers, CSRF Tokens, TOTP codes, passwords, and Recovery Codes never enter logs, traces, errors, or audit.

The API returns a uniform authentication failure while conveying a safe reason category that lets the first-party frontend distinguish unauthenticated, idle expiry, absolute expiry, administrative revocation, authorization change, and MFA enrollment or reverification. It never exposes Token, database, or sensitive policy details.

After failure, the frontend stops automatic requests, closes long connections, clears non-sensitive client state, navigates to login, and avoids automatic relogin or infinite retries.

## Executive Dashboard Session boundary

The Executive Dashboard is a complete MVP product view, but it is interactive and authenticated rather than unattended. Executive Viewer uses an ordinary Authenticated Session with the 30-minute idle timeout, 12-hour absolute limit, and normal manual reauthentication.

Fullscreen Mode may hide navigation and editing controls, enlarge presentation, enter browser fullscreen, rotate read-only views, refresh metrics, and emphasize major alerts. It never changes RBAC, Session expiry, Cookie policy, or login requirements.

Automatic refresh and SSE heartbeat are not User Activity. On Session expiry, the dashboard stops protected requests, closes long connections, marks retained values stale, shows the last successful update time and a clear reauthentication message, and never presents old state as current or healthy.

Dedicated read-only aggregation APIs under `/api/executive/dashboard/` require `dashboard.executive.read` and return only Executive Display Data. They do not reuse administrator response shapes containing credentials, management configuration, authentication detail, raw audit, or unnecessary low-level device information.

The MVP does not implement kiosk mode, Display Session, permanent or automatic login, fixed display Tokens, URL Tokens, public passwordless display, IP-only bypass, device certificates, terminal binding, browser-restart recovery, cross-day renewal, or background refresh that keeps a Session alive.

A future Unattended Display requires a separate ADR and specification after a physical terminal, 24×7 need, approved display classification, network placement, credential custody, revocation owner, restart behavior, and security approval are confirmed. It cannot weaken the ordinary Web Session ADR or reuse an administrator account.

## Authorization

Authorization is permission-based and default-deny. The backend declares and enforces the required Permission for every protected API; UI hiding is not security enforcement.

Default Role templates are System Administrator, Network Administrator, Operator, Auditor, and Executive Viewer. Their approved boundaries and stable Permission identifiers are defined in `docs/domain/DOMAIN-MODEL.md`. Role names are not spread through business code as authorization conditions.

Permission failure produces a security audit record without secret values. Sensitive APIs must explicitly declare their Permission when added.

## Emergency Administrator

At least one Emergency Administrator is initialized with a strong random password entered interactively or supplied through a temporary protected secret. It is not a default `admin/admin` account and is not used for normal work.

The credential is controlled by the organization and remains independent of future user synchronization. Every login produces a high-priority audit event and records the use reason. Recovery documentation covers access recovery and rotation; the actual password never appears in Git, Dockerfiles, Compose, or ordinary logs.

## First-administrator bootstrap

When no user exists, only a local or otherwise controlled initialization command may create the first System Administrator. It accepts an interactive password or temporary protected secret, does not echo the password, records the initialization event, and disables the bootstrap path after success.

The command name and implementation are intentionally deferred.

## Authentication audit

Audit covers login success/failure, logout, password change/reset, user create/enable/disable/delete, Role assignment/removal, Permission-template changes, Session revocation, Emergency Administrator access, and future External Identity binding changes.

Records contain event ID, subject and actor `userId` values when applicable, event type, time, source address, result, failure category, related object, and request correlation ID. Passwords, hashes, cookies, full tokens, SNMP secrets, database passwords, and private keys are prohibited.

## Permission-level MFA policy

The backend requires MFA from the user's effective Sensitive Permission set, never from a Role-name check. The initial set is `users.manage`, `roles.manage`, `credentials.manage`, `system.configure`, `authentication.manage`, `sessions.manage`, `backup.manage`, and `restore.execute`.

Permission metadata or an equivalent centralized policy must allow a future capability of the same sensitivity to require MFA without editing Role-specific branches. A custom Role cannot bypass MFA by using a different name.

When a user gains a Sensitive Permission, existing Sessions do not gain it. The user becomes `MFA_ENROLLMENT_REQUIRED`, reauthenticates, completes TOTP enrollment, and receives the capability only in a newly authenticated Session. Removing every Sensitive Permission does not automatically remove an enrolled factor.

## TOTP standard and validation

TOTP conforms to RFC 6238. The MVP uses a 30-second time step, 6-digit code, and one independently generated cryptographically random secret per Platform User.

Validation normally accepts the current step. A configured clock-skew allowance may include at most the immediately preceding and following steps. The verifier records enough replay state to reject a code already accepted for the same user and time step.

TOTP failures have user-and-source throttling independent from password throttling. Password success does not clear TOTP failures; repeated failures add delay and temporary blocking without permanent automatic lockout. A maintained, reviewed library implements TOTP; application code does not implement HMAC or Base32 primitives.

The hash algorithm and library are selected later through dependency and security review.

## Time synchronization

Production Ubuntu enables a reliable NTP-backed time-synchronization service. Operations monitor synchronization state and material clock offset and alert on abnormal time.

Recovery verifies time synchronization before TOTP login tests. The platform does not hide clock failure by expanding the validation window beyond policy.

## TOTP enrollment

Enrollment requires a complete password authentication and recent reauthentication for an already privileged user.

1. Generate a fresh per-user secret.
2. Keep it as a pending TOTP Enrollment.
3. Display the QR payload and manual-entry secret once.
4. Require at least one valid code to prove possession.
5. Activate the TOTP Authenticator only after successful verification.
6. Generate a Recovery Code Set and require confirmation that it was saved.
7. Revoke other privileged Sessions created before enrollment.
8. Audit enrollment without secret material.

An unverified enrollment never becomes an active factor. QR payload and plaintext secret are available only during setup, cannot be queried later through ordinary APIs, and never enter logs, audit details, errors, or telemetry.

## TOTP secret protection

The verifier needs the TOTP secret, so it is encrypted rather than hashed. PostgreSQL stores only application-encrypted ciphertext with a key version; the encryption key is injected through controlled secret configuration, kept outside the database and Git, and accessible only to the authentication module.

Administrators and management APIs cannot read another user's plaintext secret. Error handling, stack traces, logging, and telemetry must redact it.

Encryption-key rotation is documented in `docs/architecture/mvp-deployment.md` and preserves recovery of active authenticators while moving ciphertext to a new key version.

## MFA login

Password success for an MFA-required user creates a short-lived, attempt-limited preauthentication Session. It can only verify or recover MFA or cancel login; it cannot access inventory, topology, observations, alerts, or other business APIs.

TOTP success creates the full Session, rotates Session identity, and records `mfaVerifiedAt` and authentication strength. Password and MFA stages produce separate Authentication Events without responses that reveal whether the user exists, is privileged, has enrolled TOTP, or which factor was correct.

## Recent MFA for sensitive operations

Credential access, System Administrator creation or reset, Permission changes, administrator MFA reset, authentication-policy changes, restore execution, sensitive export, encryption-key rotation, Emergency Administrator changes, and disabling audit or backup require recent MFA or password-plus-TOTP reauthentication.

The recent-MFA window is configurable and defaults to 10 minutes.

## Recovery Codes

Enrollment creates 10 cryptographically random single-use Recovery Codes by default. Plain values appear once and are never emailed in plaintext; PostgreSQL stores only slow hashes.

Each code is consumed atomically and immediately. Users may see only the remaining count. Regeneration invalidates the complete prior set. Recovery-code use is high-priority audited and places the user into required TOTP reenrollment.

## Emergency Administrator recovery

Emergency Administrator requires TOTP. Its seed or recovery material is held offline using organization-approved custody, preferably split responsibility or an existing two-person approval process. Every use alerts and audits at high priority and is followed by password rotation and, when the incident requires, TOTP and Recovery Code rotation.

A host-console break-glass command exists only for loss of all normal Web factors. It requires root or explicit operating-system authorization, is unavailable through public HTTP, never reveals the old secret, revokes the authenticator and all Sessions, requires password change and TOTP reenrollment, and writes both database audit and an independent host security log.

This command is recovery, not a standing login bypass.

## Reset and unbinding

Users first recover with an unused Recovery Code. Without one, an administrator holding the dedicated authority may reset TOTP after recording a reason; resetting another administrator requires the actor's recent MFA.

Reset revokes the old authenticator and all Sessions, changes the user to `MFA_ENROLLMENT_REQUIRED`, and generates a security notification or high-priority audit event. Password reset never disables or bypasses TOTP.

A user with Sensitive Permissions may unbind TOTP only after those Permissions are removed, while atomically replacing it with another strong authenticator, or through break-glass transition into mandatory reenrollment. Unbinding requires recent password and MFA verification, an explicit reason, Session revocation, and security audit.

Security questions, ordinary email of a secret, SMS recovery, verbal approval, username or management-IP proof, universal bypass codes, direct database-field deletion, administrator viewing of secrets, and second-factor exemption for Emergency Administrator are prohibited.

## MFA audit

Audit covers enrollment start/success/failure, verification success/failure, secret regeneration, Recovery Code generation/use/regeneration, reset, unbinding, administrator reset, host-console recovery, Sensitive Permission enforcement, denial caused by missing MFA, and time-synchronization failure.

Audit never contains the TOTP secret, QR payload, current code, plaintext Recovery Code, encryption key, or complete Session token.

## MFA scope boundary

The MVP implements TOTP, permission-level enforcement, Recovery Codes, controlled administrator reset, Emergency Administrator recovery, MFA audit, independent rate limiting, and recent-MFA enforcement.

It excludes SMS and email codes, Push MFA, WebAuthn/FIDO2, hardware security keys, biometrics, multiple simultaneous TOTP authenticators, external-provider MFA, and risk-adaptive authentication. Future OIDC integration should prefer provider-managed MFA and evaluate phishing-resistant WebAuthn/FIDO2; TOTP may remain for compatibility or recovery.

### T016 implementation note

The MVP stores ten Recovery Codes as independently salted Argon2id hashes and returns plaintext only with the enrollment or explicit regeneration result. The user confirms offline custody before using the set for sensitive step-up operations. Recovery invalidates the complete code set, active authenticator, and every Web Session before requiring enrollment again. Sensitive-operation grants are SHA-256-digested, single-use, bound to one user, Web Session, and operation, and expire no later than ten minutes after the database-recorded MFA proof. Grant consumption revalidates the live Session, user, authorization version, credential version, and required Permission in the same transaction as the sensitive change. The host-only break-glass command requires root on Unix or an administrator access token on Windows, disables its own Emergency Administrator designation after one use, forces password change and TOTP reenrollment, and writes both append-only PostgreSQL audit and a separate host security log.

## References

- RFC 6238: `https://www.rfc-editor.org/rfc/rfc6238.html`
- OWASP Multifactor Authentication Cheat Sheet: `https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html`
- OWASP Session Management Cheat Sheet: `https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html`
- OWASP Cross-Site Request Forgery Prevention Cheat Sheet: `https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html`

## Future OIDC

OIDC is reconsidered when an organizational provider exists, policy requires unified identity or MFA, local daily accounts are prohibited, centralized offboarding is required, user scale grows, SSO is needed, or audit must use organizational identity.

Integration binds a stable external subject to `userId`, maps external groups or Roles explicitly to platform Permissions, grants no high privilege automatically, preserves historical attribution during provider outage, and keeps the Emergency Administrator independent. Auto-provisioning, offboarding synchronization, and organization synchronization require a separate ADR.

If only AD or LDAP exists, assess an existing IAM or identity proxy that exposes OIDC before adding direct LDAP dependencies to business modules.

## Explicit non-goals

- AD or LDAP login
- OIDC or SAML SSO in the MVP
- Keycloak deployment
- Directory or organization synchronization
- SCIM or social login
- Multiple identity-provider priority
- Automatic external-user creation
- Self-registration or user-requested elevation
- A custom identity-provider platform
- Attribute-based or per-device authorization
- SMS or email second factors
- Push MFA, WebAuthn/FIDO2, hardware security keys, biometrics, multiple simultaneous TOTP authenticators, external-provider MFA, or risk-adaptive authentication
- Browser access JWTs, Redis-backed Sessions, remember-me Sessions, cross-site management-console deployment, multi-domain Session Cookies, and prebuilt unattended kiosk access
