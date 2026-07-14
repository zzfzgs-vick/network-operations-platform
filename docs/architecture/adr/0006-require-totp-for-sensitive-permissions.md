---
status: accepted
date: 2026-07-13
---

# Require TOTP for sensitive permissions

The MVP requires RFC 6238 TOTP whenever a Platform User's effective Permission set contains a sensitive capability, rather than checking Role names. The initial policy covers user, role, credential, authentication, Session, system, backup, and restore management, and centrally classifies future Permissions of equivalent risk so custom Roles cannot bypass MFA.

Granting a Sensitive Permission does not upgrade an existing Session: the user enters mandatory enrollment, reauthenticates, verifies a new factor, and receives the capability only in a new Session. TOTP uses per-user encrypted secrets, 30-second 6-digit codes, a tightly bounded clock-skew window, replay rejection, independent throttling, monitored time synchronization, and a maintained implementation library rather than custom cryptography.

Recovery uses one-time hashed Recovery Codes, controlled administrator reset, and an MFA-protected Emergency Administrator with offline recovery material. Factor reset, replacement, and host-console break-glass recovery are explicit, Session-revoking, auditable, and reversible through reenrollment; password reset, security questions, universal bypass codes, secret disclosure, or direct database edits never bypass MFA.

TOTP is an MVP compatibility factor, not the long-term strongest factor. Future OIDC should prefer provider-managed MFA and evaluate phishing-resistant WebAuthn/FIDO2 through a new decision.
