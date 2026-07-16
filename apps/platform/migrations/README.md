# Platform migrations

Use one global, forward-only migration stream named `NNNN_owner_description.up.sql`, starting at
`0001` without gaps. Applied files are immutable and verified by SHA-256 checksum.

From the repository root:

- `npm run db:status --workspace apps/platform`
- `npm run db:migrate --workspace apps/platform`
- `npm run db:verify --workspace apps/platform`
- `npm run test:db --workspace apps/platform -- database`

Each migration runs in its own PostgreSQL transaction under one advisory lock. A failed migration
is rolled back and remains pending. After release, corrections use a new forward migration; test
databases may be recreated. API and Worker startup only run `db:verify` behavior and never migrate.

`0002_reliable_work_foundation.up.sql` owns the T006 Inbox, Outbox, Job, attempt, finite lease,
and Dead Letter schema. After release it is immutable; corrections use a new forward migration.

`0003_platform_health_foundation.up.sql` owns the bounded Worker heartbeat registry and the
single-row Inbox duplicate counter used by T007 runtime observability. It does not contain business
health data.

`0004_audit_foundation.up.sql` owns the append-only Audit Event store, stable query indexes, and
database triggers that reject ordinary `UPDATE`, `DELETE`, and `TRUNCATE`. Corrections append a new
event; released audit history is never rewritten by application capabilities.

`0005_identity_access_local_users.up.sql` owns immutable Platform User identity, one Local
Credential per user, bounded authentication throttling, and the singleton first-administrator
bootstrap state. Passwords are represented only by Argon2id PHC strings.

`0006_permission_rbac_foundation.up.sql` owns stable Permissions, five default Role templates,
custom Roles, User Role Assignments, and the monotonic per-user authorization version. Role names
are display labels and never authorization conditions.

`0007_postgres_opaque_sessions.up.sql` owns SHA-256-digested opaque web sessions and the
single recovery generation marker. Raw session tokens are never persisted.

`0008_csrf_session_foundation.up.sql` adds a per-session SHA-256-digested CSRF token. Existing
active sessions are revoked during upgrade because they cannot prove possession of the new token.

`0009_totp_enrollment_login.up.sql` owns permission-driven MFA state, encrypted pending TOTP
enrollment, one active TOTP authenticator per user, bounded MFA challenges, replay state, and an
independent user/source throttle. Encryption keys remain outside PostgreSQL and Git.

`0010_mfa_recovery_step_up_break_glass.up.sql` owns slow-hashed one-time Recovery Codes,
action-bound one-use step-up grants, and explicit Emergency Administrator designation.
