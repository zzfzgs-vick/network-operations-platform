# MVP acceptance criteria

Status: Requirements interview closed. Availability, recovery, local authentication, RBAC, permission-level TOTP, interactive Web Session, Executive Dashboard, Alert and Incident, shared Condition execution, health model, API/Worker runtime, PostgreSQL reliable work, and MVP-S1 capacity criteria are decided. Remaining detail belongs to formal specifications and Tickets.

## Production deployment

- The platform runs on one clean Ubuntu Server 24.04 LTS host through Docker Engine and Docker Compose.
- PostgreSQL runs as one instance and VictoriaMetrics as one node.
- A host restart brings the configured Compose services back into their intended state without being represented as high availability.
- Administrative deployment status identifies the production shape as single-host and non-HA; it does not label container restart as host failover.
- No Kubernetes, Docker Swarm, automatic database failover, or cross-host application failover is required or deployed.

## API and Platform Worker runtime acceptance

- One NestJS codebase starts an HTTP API process and a Platform Worker process through independent entry points and independent Docker containers.
- The Platform Worker uses a standalone application context and does not start a public HTTP listener.
- The two processes share domain models, application services, database access, and internal protocols without the Worker calling the platform's own public user API.
- The HTTP API owns REST, authentication, Session, TOTP, RBAC, configuration and query endpoints, user commands, SSE connections, input validation, and audit context.
- Private service-ingest routes authenticate and validate Go or `vmalert` batches and persist them to Inbox; they do not synchronously apply Condition, Alert, Health, or Incident effects.
- The HTTP API does not execute long Condition computation, full Health recomputation, periodic reconciliation, bulk Alert processing, blocking notification, long topology discovery, or large background loops.
- When a request starts asynchronous work, business state and the related Outbox Message or Background Job commit in the same PostgreSQL transaction before the API returns acceptance.
- The Platform Worker owns asynchronous Condition, Health, Alert, reconciliation, Outbox, notification, expiry, cleanup, and other background processing through separately bounded modules.
- Go collection services produce protocol observations or normalized facts but do not decide final Health, Health Score, Alert Instance, Incident, formal topology, maintenance, or authorization state.
- `vmalert` produces Metric Condition Evaluations and cannot modify Incident, acknowledgement, maintenance, authorization, or final Alert and Health state.

## PostgreSQL reliable-work acceptance

- PostgreSQL is the authoritative coordination store for Inbox Messages, Transactional Outbox Messages, Background Jobs, Job Attempts, Worker Leases, retries, idempotency, and Dead Letter Records.
- Committed Inbox, Outbox, and Job work survives API or Worker restart and is not acknowledged as successful while PostgreSQL is unavailable.
- Delivery semantics are at least once with idempotent consumers; the platform does not claim exactly-once execution.
- Every retryable internal submission has a stable idempotency key, and database uniqueness is the final defense against duplicate business state.
- Duplicate, retried, concurrent, or out-of-order work does not duplicate Observations, Condition Transitions, Alert Episodes, Health Transitions, Incident Timeline entries, or Notification Deliveries.
- A consumer transaction checks Inbox or idempotency state, applies the business change, writes downstream Outbox work, marks the current work complete, and commits atomically.
- Background Jobs use short row-lock claims and finite leases. Worker termination, host restart, or lost database connectivity leaves work reclaimable after lease expiry rather than permanently `processing`.
- Long Jobs renew finite leases, expose progress, and remain safe to retry. Graceful shutdown stops new claims, gives short work bounded completion time, and leaves unfinished work recoverable.
- Failures are classified, bounded by maximum attempts, and retried only when appropriate with exponential backoff and jitter.
- Exhausted or permanent failures create Dead Letter Records that are visible, auditable, manually retryable, free of plaintext secrets, and able to trigger a Platform Alert.
- Advisory Locks coordinate only low-cardinality singleton work such as full reconciliation, rule publication, or cleanup; ordinary per-object work uses Job row locks, leases, unique constraints, and optimistic versions.
- Queue priority protects authentication/security, core devices, core circuits, Alert, and Health work from low-priority discovery, inventory, reporting, or cleanup while aging or quotas prevent permanent starvation.
- Worker telemetry exposes heartbeat, version, per-type queue depth and oldest age, throughput, success, failure, retries, Dead Letters, execution duration, database state, Condition lag, Health lag, Alert reconciliation lag, Outbox backlog, and duplicate Inbox count.
- Worker failure or continuously increasing backlog produces a Platform Alert through a path that does not depend solely on the failed Worker.
- The Worker persists authoritative state and durable frontend events; the API owns SSE RBAC and connection lifecycle. PostgreSQL `LISTEN/NOTIFY`, if selected later, is only a wake-up hint and cannot replace the persistent Outbox or database cursor.
- The MVP introduces no Redis Queue, BullMQ, NATS, Kafka, RabbitMQ, NestJS Microservices Transport, Temporal, or other message broker or workflow engine.

## Backup acceptance

- PostgreSQL custom-format logical backups run at least every 4 hours and include required roles, permissions, and global objects.
- VictoriaMetrics creates one supported snapshot and off-host backup per day.
- Every backup records timing, size, result, and validation metadata; PostgreSQL backups include a checksum.
- Required backups are present on a controlled target outside the production host, physical disks, and Docker volumes.
- PostgreSQL retention provides 48 hours of 4-hour backups, 14 daily backups, and 8 weekly backups.
- VictoriaMetrics retention provides 7 daily backups and 4 weekly backups.
- Backup or backup-target failure produces a high-priority operational alert.
- A live PostgreSQL volume copy or live VictoriaMetrics data-directory copy is not accepted as the only backup.
- Real credentials and private keys are absent from Git and are recoverable from a separately protected source.

## Blank-host recovery drill

Before production acceptance, operators perform at least one recovery on a clean Ubuntu Server 24.04 LTS host using the documented sequence in `docs/architecture/mvp-deployment.md`.

The drill must demonstrate:

- PostgreSQL restores successfully, including required global objects.
- Users can log in with their original platform identities and permissions.
- Host time synchronization is healthy before TOTP validation.
- TOTP-protected users and the Emergency Administrator can complete the approved authentication or recovery flow without changing `userId`.
- Every Pre-authentication and Authenticated Session restored from backup is invalidated before access opens, and a pre-recovery Cookie cannot authenticate.
- inventory, Managed Device and Managed Interface identities, lines, formal topology, Desired State, manual layout, alert rules, notification policy, maintenance windows, identity decisions, topology decisions, incidents, and audit history are intact.
- Immutable platform IDs do not change through backup and restore.
- The HTTP API process, Platform Worker process, and Go services start against the restored state.
- Stale Worker Leases are expired or reclaimed, committed Inbox/Outbox/Job work resumes idempotently, and Dead Letter state remains visible.
- Collection tasks resume and new observations are written.
- Alert creation, acknowledgement, and recovery work after restoration.
- VictoriaMetrics history is queryable after its restore.
- The measured Class A data-loss window and core restoration time are each no more than 4 hours.
- The measured Class B data-loss window is no more than 24 hours and its restoration time is no more than 8 hours.
- Actual recovery time, data-loss windows, failures, and corrective actions are recorded.

A successful script exit, existing file, checksum, archive listing, or decompression alone does not satisfy the recovery drill.

## Failure and degradation acceptance

- Operational status distinguishes application-container, PostgreSQL, VictoriaMetrics, collection-service, host, and backup-target failures.
- VictoriaMetrics failure leaves inventory and configuration available while marking historical metrics unavailable.
- PostgreSQL failure prevents state-changing operations and does not accept inconsistent writes.
- Collection-service failure preserves history and marks affected observations stale rather than healthy.
- After an observation gap, stale data is not displayed as current or normal.
- Backup-target failure is visible and alerting is exercised.

## External availability acceptance

An independently running check verifies host reachability, the platform HTTPS health endpoint, last successful backup time, and last collection time. Evidence shows that it can alert while the platform host is unavailable.

## Rehearsal cadence

After launch, recovery is rehearsed at least quarterly and after a material change to database structure, backup method, persistent storage, or deployment architecture.

## Authentication acceptance

- Only a controlled local initialization command can create the first System Administrator; public Web registration cannot do so.
- Initialization accepts an interactive password or protected temporary secret, does not echo it, records the event, and cannot be repeated after success.
- Administrators can create, enable, disable, and reset Platform Users.
- Temporary passwords require change on first login.
- Disabled users immediately lose access; disablement, password reset/change, and permission reduction revoke active Sessions.
- Logout invalidates the current Session immediately.
- Every business, alert, and audit attribution uses immutable `userId`, not username or email address.
- No AD, LDAP, OIDC, SAML, Keycloak, SCIM, social-login, or directory-synchronization dependency is deployed.

## Password acceptance

- Passwords use Argon2id or an explicitly approved equivalent with independent random salts and configurable upgradeable parameters.
- No plaintext, reversibly encrypted password, fixed default password, or fast general-purpose password hash is stored.
- Password and password-hash fields never appear in API responses or ordinary logs.
- Password policy requires at least 12 characters, accepts long passwords without truncation, rejects common weak values and username reuse, and does not require mechanical character-class composition.
- Ordinary password change verifies the current password; administrative reset requires first-login change.
- There is no automatic fixed-period password expiration.

## Login and Session acceptance

- Repeated failures for an account and source trigger configured rate limits and increasing delay or temporary lockout without permanent automatic lockout.
- Failure responses do not reveal whether the submitted user exists.
- Production login is HTTPS-only and does not accept credentials or Session tokens through URL query parameters.
- Web Sessions use `HttpOnly` Cookies, `Secure` in production, an appropriate `SameSite` policy, and CSRF protection.
- Session identity changes after login and Sessions have configurable idle and absolute limits.
- Long-lived authentication tokens are absent from browser `localStorage`.
- A privileged action can require recent reauthentication.

## Same-origin and Cookie acceptance

- Production serves `/`, `/api/`, `/events/`, and any future `/ws/` route through one HTTPS origin.
- The authenticated Cookie uses `__Host-nop_session` or an equivalent host-only name; preauthentication uses a separate Cookie.
- Production Cookies have `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`, explicit expiry, and HTTPS-only transport.
- URL parameters, form fields, response bodies, and JavaScript cannot supply or read a Session Token.
- Frontend/API cross-site deployment, third-party management-console embedding, and multi-domain Session Cookies are absent.

## Server-side Session acceptance

- A Session Token contains at least 32 bytes of CSPRNG output and no user, time, Role, Permission, or business data.
- PostgreSQL contains only `SHA-256(rawSessionToken)` or an approved equivalent digest, never the raw Token.
- `sessionId` and `tokenHash` are distinct fields and the Token hash has unique lookup semantics.
- Raw Tokens are absent from databases, logs, traces, errors, audit, and response bodies.
- A revoked or expired Token never becomes valid again.
- No browser access JWT, `localStorage` authentication token, remember-me Session, Redis Session store, or process-local cache bypass is present.
- PostgreSQL failure denies authentication and authorization rather than falling open.

## Session type and timeout acceptance

- Pre-authentication Sessions have a fixed maximum lifetime of 5 minutes, do not extend on activity, and can call only explicit MFA verification, enrollment, recovery, or cancellation APIs.
- Pre-authentication Sessions cannot access assets, topology, metrics, alerts, user management, or another business API.
- MFA completion revokes the Pre-authentication Session and creates a distinct Authenticated Session Token.
- Authenticated Sessions expire after 30 minutes without explicit User Activity and after 12 hours absolutely.
- All security timeouts are server-enforced and centrally configured with the decided production defaults.
- SSE heartbeat, WebSocket Ping/Pong, automatic refresh, topology updates, metric polling, passive open pages, and health checks do not extend idle lifetime.
- The frontend warns before idle expiry and requires explicit interaction to continue.

## Session rotation and authorization acceptance

- Password verification, MFA completion, password change/reset, TOTP enrollment/reset/unbinding, Sensitive Permission grant, break-glass recovery, and suspected fixation or hijacking create a new Token and revoke the old one.
- Every protected request verifies `session.authorizationVersion == user.authorizationVersion`.
- Role assignment/removal, direct Permission change, Role Permission change, user disablement, and gaining or losing Sensitive Permissions increment Authorization Version.
- Version mismatch denies the request, revokes the Session, and requires reauthentication; frontend refresh cannot grant the Session new authority.
- IP and User-Agent changes are risk signals but ordinary network or browser-version changes do not automatically revoke the Session.

## Session revocation acceptance

- Logout and explicit termination immediately revoke the current Session.
- User disablement, password reset or confirmed exposure, TOTP reset, break-glass recovery, logout-all, and account-security events revoke all Sessions for the Platform User.
- Users can inspect active Sessions and revoke the current, another, or all other Sessions.
- A holder of `sessions.manage` can revoke another user's Sessions without seeing raw Tokens.
- Session creation, rotation, expiry, revocation, Authorization Version mismatch, disaster-recovery invalidation, and suspicious use are audited without Token or Cookie values.

## CSRF acceptance

- `GET`, `HEAD`, and `OPTIONS` do not modify business state.
- Every state-changing API requires a session-bound CSRF Token or reviewed framework custom-header control.
- The backend validates `Origin` and, where needed, `Referer` against the production origin.
- Login, logout, password, TOTP, Role, credential, and system-configuration operations receive CSRF protection.
- `SameSite` is not the only CSRF control, CORS denies unapproved origins, and CSRF values never appear in URLs or logs.

## Long-connection acceptance

- SSE authenticates on connection, closes on idle or absolute expiry and revocation, and reauthenticates on reconnect.
- SSE heartbeat does not update User Activity.
- If WebSocket is included, its handshake validates Session and `Origin`, it receives no URL Token, periodically detects revocation and expiry, closes on Authorization Version mismatch, and does not treat Ping/Pong as User Activity.
- If reliable WebSocket revocation is not available, the MVP uses SSE rather than weakening Session controls.

## Session operations and client acceptance

- Required PostgreSQL indexes support Token hash, user, expiry, and revocation lookups.
- Expired-Session cleanup runs periodically and raises an operational alert on failure.
- Safe API reason categories let the first-party frontend distinguish unauthenticated, idle expiry, absolute expiry, administrative revocation, authorization change, and MFA requirements without exposing internal security details.
- After Session invalidation, the frontend stops automatic requests, closes long connections, clears non-sensitive state, returns to login, and does not retry indefinitely.

## Executive Dashboard acceptance

- The Executive Dashboard is present as an MVP product view.
- An authenticated Executive Viewer with `dashboard.executive.read` can access it.
- Executive Viewer cannot access credential, configuration, user, Role, topology-editing, alert-rule, raw-audit, backup, restore, system-configuration, or device-command APIs.
- The dashboard shows overall health, core-device online rate, core-link availability, major alerts, affected sites and businesses, aggregate topology, 24-hour trends, utilization and instability rankings, and current incident status using the approved definitions.
- Dedicated read-only aggregation APIs provide only allowlisted Executive Display Data and do not reuse sensitive administrator response shapes.
- Real-time status refresh works and SSE heartbeat or automatic refresh does not extend idle Session lifetime.
- Fullscreen Mode supports 1920×1080 and basic 4K presentation without changing RBAC or Session policy.
- After Session expiry, protected refresh stops, long connections close, retained data is marked stale, and the page shows the last successful update time and a reauthentication instruction.
- The dashboard never continues to label stale retained state as live or healthy.
- No URL Token, remember-me control, permanent Session, automatic login, kiosk mode, Display Session, public passwordless view, or IP-only bypass exists.
- Browser restart requires manual authentication unless the ordinary Session Cookie is still valid under the normal baseline.
- Dashboard behavior does not relax the 30-minute idle or 12-hour absolute limits for any Platform User.

## MVP-S1 capacity acceptance

Capacity acceptance follows `docs/specs/mvp-s1-capacity-acceptance.md` and is executed on the defined Ubuntu reference host and Windows reference browser.

- Target scale is 500 devices, 30,000 interfaces, 2,000 enabled active probes, 5,000 topology relations, 50 authenticated Sessions, and 5 Executive Dashboards.
- A 120% load runs for 30 minutes to validate safe degradation without expanding the formal guarantee.
- Target collection periods, 500,000 active-series budget, 20,000 sustained and 30,000 peak samples/s budgets, and 90-day metric retention are active during the test.
- The run includes 2 hours warm-up, 8 hours target load, 30 minutes Stress Load, and 1 hour recovery observation.
- APIs, state propagation, topology rendering, Alert storm, resource headroom, queue recovery, and error objectives meet the detailed specification.
- No performance result bypasses authentication, PostgreSQL Session checks, authorization, deduplication, suppression, or root-cause processing.
- The report binds its claim to the actual software, hardware, dataset, workload, periods, retention, percentiles, errors, resources, and queues.
- MVP-S1 remains a Verified Capacity class rather than a code, licensing, or unconditional maximum.

## Alert and Incident acceptance

- Alert Rule, Alert Fingerprint, Alert Instance, Alert State Transition, Incident, Incident Alert Link, and Incident Timeline use independent identities and persistence records.
- A resolved Alert Fingerprint that fires again creates a new Alert Instance; the prior episode and its times remain unchanged.
- Alert acknowledgement changes acknowledgement state without changing `FIRING`, and suppression changes delivery behavior without implying `RESOLVED`.
- Detection, acknowledgement, notification, suppression, and data-validity facets can coexist without being collapsed into one enum.
- Alert State Transitions and Incident Timeline events append complete history; a correction does not overwrite its predecessor.
- Incident `CLOSED` or `CANCELED` does not modify, delete, or fabricate underlying Alert history.
- Alert `RESOLVED` does not automatically set Incident `RESOLVED` or `CLOSED`.
- One Incident can link multiple Alert Instances, and link roles distinguish root-cause candidate, confirmed root cause, symptom, impact, and related evidence.
- One Alert Instance has at most one primary open Incident at a time; an additional active secondary association requires a role, reason, and audit.
- Automatic declaration and association use versioned deterministic rules with recorded evidence and confirmation state.
- Upstream-root-cause handling preserves every downstream Alert Instance while allowing duplicate notification suppression.
- Maintenance Window evaluation preserves Alert facts, records the window and suppression reason, and does not mark an unresolved condition normal when maintenance ends.
- Incident impact uses an event-time snapshot or version reference and remains historically correct after topology changes.
- State, owner, Alert association, severity, priority, impact, cause, response, closure, and reopening changes enter Incident Timeline.
- Incident Severity or Priority adjustment records reason, old and new values, actor, and time without changing Alert Severity.
- A `CANCELED` Incident and an ended incorrect link retain their history and audit.
- Archived Alert Rules and assets do not break historical Alert Instance or Incident queries.
- Notification Delivery failure does not block Alert transition or Incident persistence.
- Close validates impact, linked Alerts, summary, response actions, actor, and time; reopen records its reason, actor, time, prior state, links, and count.
- Alert Instances, transitions, Incidents, links, and timelines retain at least one year and are not ordinarily physically deleted.
- The Alert view and Incident view expose their distinct lifecycles; the Executive Dashboard shows major Incidents and aggregate Alert counts rather than every Alert Instance.
- The 10,000-transition capacity run preserves Alert episode identity, Incident links, timeline integrity, and audit history.

## Shared Condition and execution acceptance

- Raw Observations become identity-resolved Normalized Facts or Metrics before technical conditions are evaluated.
- Condition Definition has immutable `conditionId`; every semantic change creates an immutable Condition Version.
- Metric Condition Definition and Direct Fact Condition Definition are distinct execution types with explicit Condition Execution Binding.
- Metric Conditions execute in `vmalert`; Direct Fact Conditions execute from Normalized Facts without Alert Engine or Health Engine parsing raw protocols.
- MetricsQL, threshold, `conditionFor`, `conditionRecoveryFor`, hysteresis, aggregation, label selection, freshness prerequisite, baseline, and result dimensions exist once in the authoritative Condition Version.
- Alert Rule, Health Policy, API, Go services, dashboard, and report do not embed another copy of a shared predicate.
- Alert Rule Condition Binding and Health Policy Condition Binding reference the same active Condition Version.
- Health Engine does not depend on Alert Instance, acknowledgement, notification, suppression, Incident association, or Alert Severity to calculate shared technical state.
- Alert Engine does not depend on final Health Status or Health Score to reproduce a shared condition.
- Incident consumes Alert, Health Impact, and topology after those results and cannot feed back into the originating Condition or Health dependency graph.
- Condition State is `TRUE`, `FALSE`, or `UNKNOWN`; `UNKNOWN` is never treated as false, recovered, healthy, or score zero.
- Condition Evaluation contains Condition identity and version, state, target, stable dimensions, first-true, evaluation, receipt and validity times, source and execution status, value, threshold and window summaries, evidence references, and configuration hash.
- Current Condition Evaluation has stable idempotent identity; periodic identical results, batch retry, and concurrent delivery do not create duplicate Condition or business transitions.
- Shared `conditionFor` and `conditionRecoveryFor` are distinct from Alert-only `alertPromotionDelay` and Notification Policy `notificationDelay`.
- Observation Normalizer produces shared facts for interface state, Collector availability, source availability, and freshness inputs.
- Shared freshness and source Conditions prevent Alert Rule and Health Policy from separately calculating observation age or executor availability.
- A source failure makes dependent Condition State unknown rather than false, cannot recover an Alert, and may make Health Status unknown when the input is mandatory.
- Condition Dependency forms an acyclic graph and publication rejects direct or indirect cycles.
- `ALL`, `ANY`, and `NOT` follow documented three-valued truth tables; `QUORUM`, `SEQUENCE`, and `DEPENDENCY` define explicit unknown propagation and explanations.
- Arbitrary user scripts are not accepted as Condition Definitions.
- Shared Condition publication validates identity, MetricsQL or fact predicate, target dimensions, dependency graph, three-valued logic, limits, and unit cases before activation.
- Metric Condition compilation may use recording rules, alerting rules, or a controlled combination, while MetricsQL remains authoritative only in Condition Version.
- Generated executor artifacts carry `conditionId`, `conditionVersion`, and configuration hash and are read-only to `vmalert`.
- Users cannot upload or hand-edit arbitrary production `vmalert` YAML, paths, scripts, or secret-bearing templates.
- Condition publication activates one verified version for Alert and Health bindings or leaves both on the last good version after failure.
- Any time-bounded Alert-versus-Health Condition Version mismatch is explicit, visible, and audited.
- `vmalert` pushes authenticated internal Condition Evaluation batches; accepted facts persist before success, mixed batches report accepted and rejected entries, and no slow external delivery blocks the request.
- Condition Reconciler runs every 30 to 60 seconds, at startup, after Condition publication, and after recovery of evaluator, source, or ingest path.
- Reconciliation compares expected and loaded Condition Versions and hashes, execution health, VictoriaMetrics evaluator state, Current Condition Evaluations, bound Alerts, and last successful push and reconciliation.
- Missed pushes and platform downtime are repaired through appended Condition, Alert, and Health corrections without deleting history.
- `vmalert` outage, VictoriaMetrics error, stale data, configuration mismatch, target ambiguity, result overflow, or undeployed version produces `UNKNOWN`, not `FALSE`.
- Condition `TRUE` independently drives Alert lifecycle mapping and Health recomputation; `FALSE` enters Alert recovery confirmation and health recomputation; `UNKNOWN` does neither as a false result.
- Alert Instance retains `conditionId`, `conditionVersion`, `ruleId`, `ruleVersion`, trigger-time Alert Severity, and binding parameters.
- Current Health retains Health Policy Version and the Condition Versions used in its calculation.
- Condition Version changes do not rewrite historical Alert Episodes, Health Transitions, Snapshots, or Score Breakdowns.
- Disabling an Alert Rule does not disable a shared Condition still used by Health, and disabling a Condition requires dependency analysis.
- Trap facts and confirming polls feed shared Direct Fact Conditions; `linkUp` does not blindly make every associated condition false.
- Active-probe results use Metric Conditions, while scheduler and executor failures use shared source-availability Conditions and independent Platform Alerts.
- Maintenance does not stop Condition Evaluation and does not rewrite condition expressions to hide targets.
- Alertmanager is absent from the MVP Alert Instance and Silence authority chain.
- Condition publication, rollback, reconciliation repair, ambiguous mapping, version migration, and authorized state correction are audited.

## Health model acceptance

- Health Status and Health Score are independent fields; score cannot override or determine authoritative status.
- Health Status contains only `HEALTHY`, `DEGRADED`, `CRITICAL`, and `UNKNOWN`.
- Operational Mode independently contains `ACTIVE`, `MAINTENANCE`, `DISABLED`, and `RETIRED`; `MAINTENANCE` is not a Health Status.
- Data Quality independently contains `FRESH`, `PARTIAL`, `STALE`, `SOURCE_UNAVAILABLE`, `CONFLICTING`, and `NOT_CONFIGURED`.
- An object in maintenance continues collection and health calculation and can remain visibly `CRITICAL`; maintenance may suppress delivery or automatic Incident creation without hiding Alert facts.
- `DISABLED` is not displayed as healthy or unknown, and `RETIRED` is excluded from current statistics while history remains queryable.
- `UNKNOWN` objects are not counted as healthy, do not imply Alert recovery, and use `healthScore = null` when reliable scoring is impossible.
- Score 0 means confirmed complete unavailability and is distinguishable from `null` in storage, API, UI, ranking, and reports.
- Stale critical input, Collector or executor outage, source unavailability, insufficient mandatory evidence, unresolved conflict, incomplete monitoring, and initial no-data state produce `UNKNOWN` as required by policy.
- A policy may conclude health with `PARTIAL` evidence only when its missing inputs are explicitly non-critical and minimum evidence is met.
- Current Health exposes status, nullable score, Operational Mode, Data Quality, Coverage Ratio, reasons, policy ID and version, calculation time, input window, and validity.
- Every result has one primary Health Reason and optional secondary reasons with source, evidence, value, threshold or condition, timing, and readable explanation.
- Health Score Breakdown explains every component, weight, deduction, Coverage Ratio, policy version, and calculation time.
- Device, Interface, Circuit, and Site use distinct Health Policies; one universal formula is not used for all objects.
- A critical dependency cannot be averaged into healthy state by many ordinary healthy children, and Site health is not a simple arithmetic mean.
- Policy-selected quorum, redundancy, weighted-component, and percentage-threshold behavior is testable; loss of one redundant member can degrade while loss of all members is critical.
- Every aggregate reports Coverage Ratio plus evaluated, unknown, stale, unavailable, and total populations.
- Coverage below the policy minimum yields `UNKNOWN` and `healthScore = null` rather than a score from the available minority.
- Confirmed Healthy Ratio keeps unknown active objects in its denominator and Health Data Coverage is displayed separately.
- Maintenance objects are separately counted and never mixed into confirmed healthy count; API, dashboard, and reports use the same population and weights.
- Freshness Policy is specific to input cadence and feeds shared freshness Condition Definitions; Health Policy consumes their evaluations rather than recalculating age.
- Recovery from `UNKNOWN` requires restored source health, enough fresh evidence, and the configured confirmation window; the result may be healthy, degraded, or critical.
- Shared entry, exit, and recovery thresholds belong to Condition Definition and prevent flapping once for both Alert and Health consumers.
- An upstream critical failure produces downstream `UNKNOWN` with `UPSTREAM_UNREACHABLE` when downstream state cannot be observed, not fabricated independent critical failures.
- Current Health is precomputed; Health Transitions append old and new state, reason, evidence quality, coverage, and Health Policy Version.
- Health Snapshots support trends, reports, and Incident impact without requiring a full per-second copy of raw metrics.
- Health Policy changes create a new immutable version and do not rewrite previous Health Transitions, Snapshots, or Score Breakdowns.
- Alert acknowledgement, notification suppression, and Incident closure do not change Health Status; Alert and Health react independently to the same Condition Evaluation.
- Health Engine does not use Alert Instance state, and Alert Engine does not use final Health Status, to reproduce a shared condition.
- An authorized health correction is time-bounded and audits previous and corrected state, reason, actor, validity, and related Incident without deleting history.
- Topology uses Health Status as the primary state, Operational Mode and Data Quality as additional non-color-only indicators, and displays unknown score as an em dash.
- A topology health update does not require a full layout pass.

## Authorization acceptance

- The backend denies access by default and enforces a declared Permission for every protected API.
- Hiding a frontend control does not permit the same operation through direct API access.
- System Administrator, Network Administrator, Operator, Auditor, and Executive Viewer templates match the boundaries in `docs/domain/DOMAIN-MODEL.md`.
- Role names are templates; authorization tests exercise Permission identifiers rather than role-name branches.
- Attribute-based and per-device authorization are absent from the MVP.
- Permission denial creates a security audit record without secrets.

## Emergency access acceptance

- At least one Emergency Administrator exists without a known default password and is not removed by ordinary user lifecycle or future synchronization.
- Its strong credential is recoverable through an organization-controlled process and absent from Git, images, Compose, and ordinary logs.
- Every Emergency Administrator login creates a high-priority Authentication Event and records a reason.
- Recovery documentation includes Emergency Administrator recovery and rotation.

## Authentication audit acceptance

- Audit captures login success/failure, logout, password change/reset, user create/enable/disable/delete, Role assignment/removal, Permission-template changes, Session revocation, Emergency Administrator use, and the future bind/unbind event shape.
- Records contain event ID, subject and actor `userId` when applicable, event type, time, source address, result, failure category, related object, and request correlation ID.
- Audit records contain no plaintext password, password hash, Session Cookie, full access token, SNMP secret, database password, or private key.

## Permission-level MFA acceptance

- A user with any effective Sensitive Permission cannot use that capability before completing TOTP enrollment.
- The initial Sensitive Permission set includes `users.manage`, `roles.manage`, `credentials.manage`, `system.configure`, `authentication.manage`, `sessions.manage`, `backup.manage`, and `restore.execute`.
- A newly classified Permission of equivalent sensitivity activates the same policy without Role-name code changes.
- A user without Sensitive Permissions is not forced to enroll but may do so voluntarily.
- A custom Role with a Sensitive Permission triggers MFA exactly like a default Role.
- Granting a Sensitive Permission does not upgrade an existing Session; the user enters `MFA_ENROLLMENT_REQUIRED`, reauthenticates, enrolls, and receives the Permission only in a new Session.
- Removing all Sensitive Permissions does not delete an existing TOTP Authenticator.
- Direct API calls and frontend bypass cannot bypass backend MFA enforcement.

## TOTP protocol acceptance

- TOTP behavior conforms to RFC 6238 with a 30-second step and 6-digit codes.
- Each Platform User receives an independently generated cryptographically random secret.
- Validation normally uses the current step and accepts no more than one adjacent step in either direction when skew tolerance is enabled.
- A code already accepted for the same user and time step is rejected on reuse.
- TOTP attempts are limited independently by user and source; repeated failures add delay and temporary blocking without permanent lockout.
- Password success does not clear accumulated TOTP failure state.
- TOTP uses a maintained reviewed library; application code does not implement HMAC, Base32, or TOTP primitives.

## Time synchronization acceptance

- The production Ubuntu host has reliable NTP-backed synchronization enabled.
- Operations can observe synchronization state and material clock offset.
- A material time anomaly produces an operational alert and Authentication Event.
- The recovery drill verifies time before TOTP login.
- Time failure does not silently expand the accepted TOTP window.

## TOTP enrollment acceptance

- Enrollment requires completed password authentication and recent reauthentication for an already privileged user.
- A new secret remains pending until at least one valid code proves possession.
- QR payload and manual secret are shown once during enrollment and cannot be queried later through ordinary APIs.
- An unverified secret never becomes an active TOTP Authenticator.
- Successful enrollment creates Recovery Codes, requires save confirmation, revokes earlier privileged Sessions, and records audit without secret material.
- TOTP secret, QR payload, current code, Recovery Code plaintext, and encryption key are absent from APIs, logs, errors, telemetry, and audit details.

## TOTP secret-storage acceptance

- PostgreSQL contains application-encrypted TOTP ciphertext rather than plaintext or an irreversible hash.
- The encryption key is outside PostgreSQL, Git, images, and Compose and enters through controlled secret configuration.
- Only the authentication boundary can decrypt a TOTP secret; administrators and management APIs cannot read it.
- Ciphertext records identify the key version needed for controlled rotation.
- Key rotation can re-encrypt and validate active authenticators, preserve Emergency Administrator recovery, and retire the old key only after restore validation.
- A database-only disclosure does not directly reveal plaintext TOTP secrets.

## MFA login and recent-authentication acceptance

- Password success for an MFA-required user creates only a short-lived, attempt-limited preauthentication Session.
- The preauthentication Session can verify or recover MFA or cancel login but cannot access inventory, topology, observations, alerts, or other business APIs.
- TOTP success rotates Session identity and records `mfaVerifiedAt` and authentication strength on the full Session.
- Responses do not reveal whether a user exists, has Sensitive Permissions, has enrolled TOTP, or which factor was correct.
- Credential access, administrator creation or reset, Permission changes, MFA reset, authentication-policy changes, restore, sensitive export, key rotation, Emergency Administrator changes, and disabling audit or backup require recent MFA.
- The recent-MFA window is configurable and defaults to 10 minutes.

## Recovery Code acceptance

- Enrollment generates 10 sufficiently random single-use Recovery Codes by default and displays them once.
- PostgreSQL stores only slow hashes of Recovery Codes.
- A Recovery Code can be used once; consumption invalidates it immediately.
- Remaining count is visible without revealing original values.
- Regeneration invalidates all prior Recovery Codes.
- Recovery Code use creates a high-priority event and requires TOTP reenrollment.
- Recovery Codes are never sent by plaintext email.

## MFA reset and unbinding acceptance

- Password reset alone does not bypass or remove TOTP.
- Without a Recovery Code, only an authorized administrator can initiate reset with an explicit reason.
- Resetting another administrator requires the actor's recent MFA.
- Reset revokes the old authenticator and all Sessions and sets `MFA_ENROLLMENT_REQUIRED`.
- A user with Sensitive Permissions cannot unbind TOTP unless the Permissions are removed, another strong factor replaces it in the same controlled action, or break-glass recovery forces reenrollment.
- Unbinding requires recent password and MFA verification, a reason, Session revocation, and security audit.
- Security questions, SMS recovery, ordinary email of secrets, verbal approval, username or management-IP proof, universal bypass codes, administrator secret viewing, and direct database deletion are rejected recovery paths.

## Emergency Administrator MFA acceptance

- Emergency Administrator is subject to the same TOTP requirement as other Sensitive Permission holders.
- Offline seed or recovery material is controlled by the organization, preferably through split responsibility or two-person approval.
- Every use creates a high-priority alert and audit record and triggers password rotation plus incident-appropriate TOTP and Recovery Code rotation.
- Recovery rehearsal proves Emergency Administrator access remains possible after ordinary factors are lost.
- A host-console break-glass command requires local or controlled operating-system authorization and is unavailable over public HTTP.
- The command cannot reveal the old TOTP secret; it revokes the authenticator and all Sessions, requires password change and TOTP reenrollment, and writes database audit plus an independent host security log.

## MFA audit acceptance

- Audit covers enrollment start/success/failure, verification success/failure, secret regeneration, Recovery Code generation/use/regeneration, reset, unbinding, administrator reset, host-console recovery, Sensitive Permission enrollment requirement, sensitive-access denial, and time-synchronization anomaly.
- No MFA audit record contains a TOTP secret, QR payload, current code, Recovery Code plaintext, encryption key, or complete Session token.

## Ticket-level acceptance details

- Concrete Condition Definitions and per-object Health Policy mappings, weights, coverage minima, freshness intervals, and Alert promotion thresholds require formal specifications and Tickets but do not block project scaffolding.
- Migration inventory, field mapping, validation, and acceptance for the retired platform require a dedicated specification and Tickets but do not block project scaffolding.
