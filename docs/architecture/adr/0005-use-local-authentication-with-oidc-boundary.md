---
status: accepted
date: 2026-07-13
---

# Use local authentication behind a future OIDC provider boundary

No required organizational identity provider is currently confirmed, so the MVP uses local Platform Users, secure local password credentials, permission-based RBAC, centrally revocable Sessions, and a controlled Emergency Administrator. It does not deploy or integrate AD, LDAP, OIDC, SAML, Keycloak, SCIM, or another external identity platform.

The immutable platform `userId` is separate from authentication method. Business and audit history reference `userId`; local credentials and future External Identity bindings are replaceable authentication mechanisms, and business modules receive only a normalized principal rather than password or identity-provider structures.

An Authentication Provider boundary isolates the MVP Local Authentication Provider and permits a future OIDC provider without changing business identity. External subjects must bind through a stable provider subject and explicit permission mapping; external names or email addresses never become formal identity, no external user receives high privilege automatically, and Emergency Administrator access remains independent.

Backend authorization is default-deny and Permission-based rather than Role-name or frontend-visibility based. TOTP inclusion and the concrete centrally revocable Session mechanism remain separate pending decisions.
