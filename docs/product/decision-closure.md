# MVP decision closure

Status: Requirements interview closed

Date: 2026-07-13

## Outcome

The MVP has enough decided product, domain, security, deployment, runtime, data, and acceptance boundaries to proceed to codebase design, formal specification, and Ticket decomposition. No unresolved question blocks project scaffolding.

This closure records decisions; it does not authorize business-code implementation. Concrete implementation work begins only from the next explicitly approved design, specification, or Ticket instruction. The `grill-with-docs` interview ends with this document.

## MVP scope

The MVP provides a single-center network observability and operations platform for up to the conditional MVP-S1 verified workload. Its core scope is:

- an authenticated leadership overview and an operator diagnostic view
- managed regions, sites, equipment rooms, device groups, devices, interfaces, circuits, business paths, and topology
- manual asset management, controlled CSV import, SNMP interface discovery, and LLDP candidate relation review
- SNMPv3 by default with SNMPv2c compatibility, SNMP Trap reception, and TCP Connect, ICMP, HTTP/HTTPS, and DNS active probes
- Desired, Observed, and Effective State with field-level ownership, differences, confirmation, audit, and no silent overwrite or physical deletion
- immutable platform identities for logical devices, hardware instances, interfaces, topology relations, users, Conditions, Alerts, and Incidents
- shared versioned three-valued Condition Evaluation consumed independently by Alert and Health engines
- authoritative discrete Health Status, independent Operational Mode and Data Quality, explainable nullable Health Score, coverage, and policy version
- independent Alert episodes and Incident coordination, append-only transitions and timelines, deterministic correlation, maintenance suppression, and notification delivery records
- local users, default-deny permission-based RBAC, mandatory TOTP for sensitive permissions, controlled recovery, and PostgreSQL-backed revocable opaque Web Sessions
- an interactive read-only Executive Dashboard without kiosk, automatic login, permanent Session, or URL Token
- one Ubuntu Server 24.04 LTS production host using Docker Engine and Docker Compose, one PostgreSQL instance, one VictoriaMetrics node, manual recovery, off-host backup, and an external availability check
- one modular NestJS codebase with independent HTTP API and Platform Worker processes and containers
- Go protocol services for collection and normalization, and `vmalert` for Metric Condition execution
- PostgreSQL Inbox, Transactional Outbox, Background Job Queue, finite Worker Lease, retry, idempotency, and Dead Letter coordination without an MVP message broker

Detailed scope and exclusions remain authoritative in `docs/product/mvp-scope.md`.

## Main user roles

- **System Administrator** manages users, permissions, authentication security, deployment-level and Collector configuration, and full audit access.
- **Network Administrator** manages assets, topology, collection, probes, identity and topology review, network rules, and network metrics within granted permissions.
- **Operator** monitors state, investigates and acknowledges Alerts, manages permitted Incident activity, and runs explicitly authorized reprobes.
- **Auditor** reads audit, configuration-change, identity, topology, authentication, backup, recovery, and Incident-handling evidence.
- **Executive Viewer** reads approved aggregate health, circuit, site, business-impact, major-Incident, SLA, and trend information through dedicated Executive Dashboard APIs.

Role names are default templates. Backend authorization and TOTP requirements use effective Permission sets rather than hard-coded Role-name behavior.

## Core business flows

### Asset and topology control

1. An authorized user creates or imports Desired State.
2. Go services collect protocol observations through `central-default` and preserve Collector identity and observation time.
3. Observation normalization resolves identity evidence and produces Observed State or candidate objects.
4. The platform compares Desired and Observed State and creates auditable differences.
5. An operator accepts, rejects, ignores, merges, locks, replaces, or retires candidates through controlled actions.
6. Confirmed Effective State drives published topology, impact analysis, and approved display data without deleting the historical evidence.

### Observation, Condition, Health, Alert, and Incident

1. Raw Observations become identity-resolved Normalized Facts or Metrics.
2. Direct Fact evaluators or `vmalert` evaluate one authoritative Condition Version as `TRUE`, `FALSE`, or `UNKNOWN`.
3. Alert Engine and Health Engine consume the same Condition Evaluation independently; neither recalculates the other or creates a dependency cycle.
4. Health Engine incrementally publishes Current Health, reasons, data quality, coverage, and explainable score.
5. Alert Engine maintains idempotent Alert Episodes, append-only transitions, acknowledgement, suppression, and notification state.
6. Operators or explainable deterministic policy link relevant Alerts and impact evidence into an Incident with an independent lifecycle and append-only timeline.

### Authenticated user and Session

1. A local Platform User authenticates with a password through a short Pre-authentication Session.
2. Effective Sensitive Permissions require enrolled and verified TOTP before a full Session is issued.
3. PostgreSQL validates the opaque Session Token hash, expiry, revocation state, and Authorization Version on protected requests.
4. Password, MFA, user-status, or authorization changes rotate or revoke Sessions as defined by policy.
5. SSE uses the same Session and RBAC boundary and closes when the Session expires or is revoked.

### Reliable asynchronous work

1. The API validates a command and establishes actor and audit context.
2. Business state and the related Outbox Message or Background Job commit in one PostgreSQL transaction.
3. The Platform Worker claims eligible work using short row locks and a finite lease.
4. The idempotent handler applies changes, records downstream Outbox work, and completes the Inbox or Job transactionally.
5. Transient failures retry with bounded backoff and jitter; permanent or exhausted work becomes an auditable, retryable Dead Letter Record.
6. Worker or host failure leaves committed work recoverable after lease expiry without an exactly-once claim.

### Backup and recovery

1. PostgreSQL and VictoriaMetrics create their decided backups on schedule and copy them to a controlled off-host target.
2. Backup failure or target unavailability creates visible operational state and Alerting.
3. A blank Ubuntu host restores configuration and secrets, PostgreSQL authority, API/Worker/Go services, current collection, then VictoriaMetrics history and auxiliary services.
4. Historical Sessions are invalidated, stale Worker Leases are recovered, and committed work resumes idempotently.
5. The drill proves identity continuity, functional recovery, and the decided RPO/RTO rather than only proving that files exist.

## Decided matters

The following architectural decisions are accepted:

1. Single-center collection with built-in `central-default`, while preserving a future distributed Collector boundary — `docs/architecture/adr/0001-centralized-mvp-collection-boundary.md`.
2. Desired, Observed, and Effective State with field-level ownership and controlled topology promotion — `docs/architecture/adr/0002-separate-desired-observed-and-effective-state.md`.
3. Immutable platform identity, logical Managed Device versus Device Instance, evidence-based matching, and auditable replacement/merge — `docs/architecture/adr/0003-use-immutable-platform-identities.md`.
4. Single-host, non-HA production with manual recovery, off-host backup, and explicit RPO/RTO — `docs/architecture/adr/0004-use-single-host-manual-recovery.md`.
5. Local authentication and permission-based RBAC with a future OIDC boundary — `docs/architecture/adr/0005-use-local-authentication-with-oidc-boundary.md`.
6. RFC 6238 TOTP for effective sensitive permissions, Recovery Codes, and controlled break-glass recovery — `docs/architecture/adr/0006-require-totp-for-sensitive-permissions.md`.
7. PostgreSQL-backed revocable opaque Web Sessions, server-side timeout and revocation, CSRF protection, and no browser JWT — `docs/architecture/adr/0007-use-postgresql-backed-opaque-web-sessions.md`.
8. Conditional MVP-S1 capacity and 120% Stress Load tied to fixed workload, retention, hardware, browser, and performance evidence — `docs/architecture/adr/0008-define-mvp-s1-capacity-class.md`.
9. Independent Alert and Incident identities, lifecycles, history, correlation, and authority — `docs/architecture/adr/0009-separate-alerts-from-incidents.md`.
10. `vmalert` for metric execution with real-time push plus periodic reconciliation while PostgreSQL remains Alert authority — `docs/architecture/adr/0010-use-vmalert-with-push-and-reconciliation.md`.
11. Separate Health Status, Operational Mode, Data Quality, and explainable nullable Health Score — `docs/architecture/adr/0011-separate-health-status-mode-and-score.md`.
12. One versioned Condition Definition and Evaluation layer shared by parallel Alert and Health consumers without duplicated MetricsQL, thresholds, windows, or circular dependencies — `docs/architecture/adr/0012-introduce-shared-condition-evaluation.md`.
13. Independent HTTP API and Platform Worker processes with PostgreSQL reliable coordination, at-least-once delivery, idempotent consumers, leases, and Dead Letters — `docs/architecture/adr/0013-use-api-worker-and-postgresql-coordination.md`.

The authenticated Executive Dashboard is an MVP feature; kiosk and unattended display authentication are not. This decision is recorded in the product, authentication, and acceptance documents rather than a separate ADR.

## True blockers to coding

There are no unresolved blockers to project scaffolding or codebase design.

Production secrets, real network-device access, final notification destinations, vendor compatibility samples, off-host backup credentials, and capacity-test hardware will be required before their respective integration or production-acceptance Tickets can pass. They do not prevent establishing the modular project structure, contracts, migrations, test seams, and initial vertical slices.

## Decisions that belong in concrete Tickets

These items need explicit Ticket acceptance criteria or focused technical ADRs when their implementation begins, but must not reopen the product interview:

- ORM or database toolkit, migration tool, query style, and transaction helper
- exact package versions, maintained TOTP/password/SNMP libraries, and dependency-review results
- final directory names, function names, class names, module assembly, and build commands
- exact HTTP resource shapes, pagination, error envelopes, and internal batch limits within the agreed boundaries
- whether PostgreSQL `LISTEN/NOTIFY` supplements durable Outbox polling
- Job batch size, lease duration, renewal cadence, retry limits, backoff parameters, aging, quotas, and cleanup intervals
- whether a Metric Condition compiles to recording rules, alerting rules, or a controlled combination
- concrete Condition Definitions, thresholds, hysteresis, freshness, baseline algorithms, target assignments, and rule unit cases
- concrete Health Policy mappings, weights, critical dependencies, coverage minima, aggregation rules, and display explanations
- migration inventory, stable matching keys, field mapping, data quality, dry-run, rollback, and acceptance evidence for the retired platform
- notification channels, adapters, recipient ownership, delivery retry policy, and secret provisioning
- supported vendor MIBs, stack-identification coverage, simulator design, and the real-device compatibility matrix
- frontend component structure, AntV G6 evaluation, ECharts configuration, accessibility details, and responsive layout implementation
- capacity-test tools, dataset generators, simulator implementation, and report automation

If one of these choices changes a decided system boundary, security property, authority, deployment shape, or acceptance promise, it requires a new ADR or specification change. Otherwise it stays within the Ticket.

## MVP non-goals

- remote or distributed Collector operation, node registration, mTLS, offline replay, autonomous remote alerting, NAT traversal, or multi-node Collector HA
- Kubernetes, Docker Swarm, multi-host application failover, PostgreSQL HA/PITR, VictoriaMetrics cluster, cross-site disaster recovery, or zero-downtime upgrade
- Redis Queue, BullMQ, NATS, Kafka, RabbitMQ, NestJS Microservices Transport, Temporal, exactly-once execution, or another speculative broker/workflow layer
- AD, LDAP, OIDC, SAML, Keycloak, SCIM, external-directory synchronization, ABAC, or per-device authorization in MVP
- kiosk, Display Session, automatic login, permanent Session, remember-me, public dashboard URL, URL Token, or IP-only authentication bypass
- SMS/email second factor, Push MFA, WebAuthn/FIDO2, hardware key, biometrics, multiple TOTP devices, or adaptive authentication
- Syslog, NetFlow, broad security operations, automatic network-device configuration, or advanced business-dependency modeling beyond the approved paths
- automatic topology reconstruction, unattended identity merge, complex multi-CMDB synchronization, machine-learning identity/topology/health/root-cause inference, or arbitrary scripts
- complete ITSM, external work-order synchronization, advanced on-call scheduling, collaboration suite, full change management, or automatic Incident closure/postmortem
- capacity or performance promises beyond the verified MVP-S1 report, unrestricted retention, or arbitrary high-cardinality time-series labels

## Risks

- The single host, PostgreSQL instance, VictoriaMetrics node, API process, and Worker process are failure domains that require manual recovery and cannot reliably alert on total host loss without the external check.
- PostgreSQL serves business transactions, Sessions, and reliable work; poor queue indexing, oversized transactions, or excessive contention could affect the control plane.
- Central reachability is an assumption. Isolated networks would require a new distributed-collection decision.
- Vendor SNMP behavior, incomplete MIB support, stack identity, `ifIndex` churn, and weak identity evidence may create candidates and manual workload.
- Incorrect or duplicated metric labels could exceed the active-series and storage budget.
- Condition, freshness, hysteresis, and Health Policy mistakes could create false Health, Alert, or Incident outcomes even when the runtime is reliable.
- Alert storms and unavailable downstream notification services could create backlog; priority, limits, reconciliation, idempotency, and Stress Load evidence must prove recovery.
- Local authentication and encrypted TOTP secrets concentrate security responsibilities in the platform until an approved OIDC provider exists.
- TOTP depends on reliable host time and controlled encryption-key and Recovery Code custody.
- Backup objectives depend on a functioning off-host target and practiced restoration, not only scheduled jobs.
- The capacity promise depends on the reference host, workload, collection periods, retention, label model, browser, and measured software versions.

## Current assumptions

- The center management network can directly reach every MVP device and active-probe target.
- One built-in Collector/Probe Node named `central-default` is sufficient for MVP operations.
- Production uses one Ubuntu Server 24.04 LTS host with the MVP-S1 reference baseline of 16 x86-64 vCPU, 64 GB RAM, at least 2 TB usable NVMe SSD data space, and at least 1 Gbps management networking.
- A controlled off-host backup target and an availability checker independent of this platform are available before production acceptance.
- The organization can provision and protect real Secrets, the TOTP encryption key, Emergency Administrator recovery material, and TLS material outside Git and PostgreSQL.
- Reliable NTP synchronization is available on the production host.
- No mandatory external identity provider or unattended 7×24 Executive Dashboard terminal is currently confirmed.
- Fifty authenticated Web Sessions, five interactive Executive Dashboards, and the documented collection and metric workload represent the MVP-S1 target model.
- PostgreSQL reliable work is expected to meet MVP-S1 on the single host; a broker or distributed Worker topology requires measured trigger evidence and a new ADR.

## Closure

The requirements interview is complete. Future work should proceed through codebase design, formal specifications, and executable Tickets, using this closure and the accepted ADRs as constraints rather than continuing open-ended product or architecture interviewing.
