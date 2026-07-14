# Network Observability and Operations

This context describes the language used to observe managed infrastructure and operate on the resulting health information.

## Language

**Managed Asset**:
An infrastructure item intentionally brought under platform governance, with an identity and authoritative business attributes.
_Avoid_: Discovered Object

**Platform Identity**:
An immutable, platform-assigned identity that remains independent of names, addresses, hardware identifiers, and observations.
_Avoid_: Natural Key, Discovery Key

**Managed Device**:
The logical network position or operational responsibility that remains stable across hardware replacement.
_Avoid_: Hardware Unit, Device Instance

**Device Instance**:
A particular physical or virtual device that occupies a Managed Device role for a known period. Several Device Instances may participate concurrently when a logical device is a stack or virtual chassis.
_Avoid_: Managed Device

**Managed Interface**:
A platform-identified interface whose identity is independent of any single observed `ifIndex`, name, address, or hardware value.
_Avoid_: SNMP Interface Row

**Matching Evidence**:
One or more imported, observed, or confirmed attributes used to assess whether an unknown object corresponds to an existing platform identity. Evidence is not itself formal identity.
_Avoid_: Identity Key

**Hardware Replacement**:
An audited transition that retires an old Device Instance and associates a new Device Instance with the same Managed Device.
_Avoid_: Device Update, Identity Reuse

**Identity Redirect**:
An auditable and reversible record that preserves the source identity when duplicate candidates are merged into a target identity.
_Avoid_: Hard Delete, ID Rewrite

**Class A State**:
Authoritative platform configuration and operational business state required to restore core management, topology, alerting, and audit capabilities.
_Avoid_: Cache, Metrics History

**Class B Metrics**:
Historical time-series observations whose temporary loss does not prevent restoration of core configuration and current collection.
_Avoid_: Business State

**Class C Regenerable Data**:
Build artifacts, caches, and unconfirmed temporary discoveries that can be reproduced without restoring authoritative history.
_Avoid_: Backup-Critical Data

**External Availability Check**:
A platform-independent check that can detect host, service, backup, or collection failure even when this platform cannot report its own outage.
_Avoid_: Self-monitoring

**Platform User**:
A person represented by an immutable platform identity independently of username, email address, or authentication method.
_Avoid_: Login Account, Credential

**Local Credential**:
The password-based authentication material bound to a Platform User for local login. It is not the user's formal identity.
_Avoid_: User Identity

**External Identity**:
A future binding between a Platform User and a stable subject from an external identity provider.
_Avoid_: External Username, Email Identity

**Role**:
A named default permission template assigned to Platform Users. Authorization decisions use its Permission set rather than role-name checks.
_Avoid_: Hard-coded User Type

**Permission**:
A stable action identifier that grants one narrowly defined platform capability.
_Avoid_: UI Visibility Flag

**User Role Assignment**:
An auditable association that grants a Role to a Platform User.

**Session**:
A revocable authenticated interaction associated with a Platform User, authentication method, and authorization state.
_Avoid_: User Identity

**Pre-authentication Session**:
A short-lived Session limited to completing MFA enrollment, verification, recovery, or login cancellation after password verification.
_Avoid_: Authenticated Session

**Authenticated Session**:
A fully authenticated Session permitted to access business capabilities according to its current authorization state.
_Avoid_: Pre-authentication Session

**Session Token**:
A high-entropy, opaque bearer value that locates server-side Session state without carrying user or authorization data.
_Avoid_: Access JWT, User Token

**Authorization Version**:
A monotonic Platform User value that invalidates Sessions created under an older Role or Permission state.
_Avoid_: Cached Role

**User Activity**:
An explicit user action that may extend idle Session lifetime, excluding background refresh, long-connection heartbeat, and passive display.
_Avoid_: Any Request

**Executive Dashboard**:
The authenticated, read-only leadership view of aggregate network health, availability, major incidents, and approved business impact.
_Avoid_: Kiosk, Operations Console

**Fullscreen Mode**:
A presentation layout for the Executive Dashboard that changes visual chrome and scale without changing identity, Permission, or Session policy.
_Avoid_: Kiosk Mode

**Executive Display Data**:
The approved aggregate information exposed by dedicated leadership APIs, excluding credentials, raw security configuration, and unnecessary device-level detail.
_Avoid_: Administrator API Response

**Unattended Display**:
A future continuously operating screen without routine human login interaction. It is outside the MVP even though the Executive Dashboard itself is in scope.
_Avoid_: Fullscreen Mode

**MVP-S1 Capacity Class**:
The production target scale verified only against the defined workload, retention, hardware, software, and performance conditions. It is not a license limit or unconditional maximum.
_Avoid_: 500-device Limit, Maximum Capacity

**Stress Load**:
A temporary 120% MVP-S1 workload used to verify safe degradation and recovery without extending the guaranteed capacity class.
_Avoid_: Supported Capacity

**Verified Capacity**:
The workload and environment actually demonstrated by a reproducible acceptance report.
_Avoid_: Designed Capacity, Theoretical Capacity

**Capacity Risk**:
A visible operating condition indicating that observed scale or resource use exceeds the latest Verified Capacity without imposing a hard product limit.
_Avoid_: License Violation

**Capacity Report**:
The reproducible evidence that binds a software version, environment, workload, duration, latency, error rate, resource use, and pass/fail result to a capacity claim.
_Avoid_: Benchmark Screenshot

**Emergency Administrator**:
A separately controlled Platform User reserved for recovery or identity-system emergencies rather than daily administration.
_Avoid_: Default Admin

**Authentication Event**:
An auditable record of a login, logout, authentication failure, credential change, or session-security action.
_Avoid_: Application Log

**Sensitive Permission**:
A Permission whose effective use requires verified MFA because it can change identity, credentials, system configuration, backup, or recovery state.
_Avoid_: Administrator Role

**TOTP Authenticator**:
A user's active time-based one-time-password factor, represented independently of Roles and Local Credential.
_Avoid_: MFA Role, OTP Password

**TOTP Enrollment**:
A pending, untrusted setup process that becomes a TOTP Authenticator only after successful verification.
_Avoid_: Active Authenticator

**Recovery Code Set**:
A replaceable collection of single-use recovery factors whose original values are shown once and never retained in recoverable form.
_Avoid_: Backup Password

**MFA Challenge**:
A short-lived, attempt-limited authentication step that cannot authorize ordinary business access before completion.
_Avoid_: Login Session

**MFA Recovery Event**:
An audited high-risk action that resets, replaces, or recovers an unavailable MFA factor.
_Avoid_: Password Reset

**Desired State**:
The authoritative state approved through manual configuration, controlled import, or explicit confirmation. It expresses what the organization intends to manage and publish.
_Avoid_: Manual Data, Static Data

**Observed State**:
A time-bounded fact reported by a Collector Node, retaining its source, observation time, validity, confidence, and original identity or value.
_Avoid_: Discovered Truth, Current Truth

**Effective State**:
The state currently published for topology, alerting, and impact analysis after reconciling Desired State with Observed State. Unconfirmed observations remain visibly unconfirmed.
_Avoid_: Merged State, Final State

**Topology Relation**:
A governed connection or dependency between topology objects. A discovered relation is not authoritative until it is confirmed.
_Avoid_: Edge

**Topology Difference**:
An auditable discrepancy or candidate change between Desired State and Observed State that requires an explicit disposition.
_Avoid_: Auto-fix, Drift Event

**Collector Node**:
A logical execution source that runs collection or active-probe work and reports observations. A Collector Node is identified independently of the control plane process or host.
_Avoid_: ProbeNode, Agent, Worker

**Central Collector**:
The built-in Collector Node used by the single-center MVP, with the stable identity `central-default`.
_Avoid_: Local Collector, Default Agent

**Preferred Collector**:
The Collector Node selected by default for a Managed Device or Probe Target. In the MVP, every preference resolves to the Central Collector.

**Collection Task**:
A request for a specific Collector Node to perform SNMP collection or an active probe.
_Avoid_: Job, Command

**Observation**:
A collected measurement or state result that retains its source Collector Node and validity metadata.
_Avoid_: Raw Data, Payload

**Normalized Fact**:
A source-neutral, identity-resolved technical fact derived from an Observation or platform source and suitable for condition evaluation.
_Avoid_: Raw Observation, Alert

**Distributed Collection**:
A future operating mode in which Collector Nodes outside the center execute work for networks or targets the center cannot directly reach. It is not part of the MVP.
_Avoid_: Multi-center Deployment

**Alert Rule**:
A versioned mapping from Condition Evaluations to Alert episode, severity, promotion, annotation, Incident-eligibility, and notification behavior.
_Avoid_: Incident Policy, Notification Rule

**Alert Rule Version**:
An immutable historical form of an Alert Rule that preserves the exact Condition Binding and Alert behavior used by an Alert Instance.
_Avoid_: Edited Rule

**Alert Rule Deployment**:
An audited attempt to activate one Alert Rule Version and its Condition Bindings in Alert Engine while preserving the last good mapping on failure.
_Avoid_: YAML File, Rule Edit

**Condition Definition**:
A reusable, versioned, explainable technical predicate referenced by Alert, Health, Incident-declaration, dashboard, and reporting policies.
_Avoid_: Alert Rule, Health Rule

**Metric Condition Definition**:
A Condition Definition whose time-series expression, threshold, window, hysteresis, aggregation, freshness prerequisite, and result dimensions are evaluated from metrics.
_Avoid_: Metric Alert Rule

**Direct Fact Condition Definition**:
A Condition Definition evaluated from Normalized Facts or lower-level Condition Evaluations without re-parsing protocols or querying metric windows.
_Avoid_: Health Check, Event Alert

**Condition State**:
The three-valued result `TRUE`, `FALSE`, or `UNKNOWN`, where `UNKNOWN` means the condition cannot currently be evaluated reliably.
_Avoid_: Boolean Result

**Condition Evaluation**:
The idempotent, time-bounded result of one Condition Version for a formal target and stable dimensions, with execution and evidence context.
_Avoid_: Alert Instance, Health Status

**Condition Assignment**:
The governed association that applies a Condition Definition to an eligible target or target-selection scope.
_Avoid_: Alert Scope

**Condition Dependency**:
A directed input relationship between versioned conditions in an acyclic, explainable evaluation graph.
_Avoid_: Runtime Call Chain

**Condition Version**:
An immutable historical form of a Condition Definition that preserves its exact predicate, inputs, time semantics, and result dimensions.
_Avoid_: Edited Condition

**Condition Execution Binding**:
The assignment of a Condition Version to the executor responsible for producing its Condition Evaluations.
_Avoid_: Alert Execution Binding, Rule Location

**Alert Rule Condition Binding**:
The versioned association that maps a Condition Evaluation into Alert episode, severity, promotion, and notification behavior.
_Avoid_: Duplicate Condition

**Health Policy Condition Binding**:
The versioned association that maps a Condition Evaluation into Health Status, score, reason, dependency, and coverage behavior.
_Avoid_: Duplicate Condition

**Condition Reconciler**:
The platform responsibility that compares executor state with authoritative current Condition Evaluations and appends audited corrections after missed, repeated, delayed, or inconsistent results.
_Avoid_: Metric Alert Reconciler, History Rewrite

**Alert Fingerprint**:
The stable deduplication identity of one logical abnormal condition, derived from an Alert Rule, formal target identity, and bounded dimensions rather than changing values or event text.
_Avoid_: Alert Instance ID, Event ID

**Alert Instance**:
One continuous episode of an Alert Fingerprint from first observation through resolution. A later recurrence creates a new Alert Instance.
_Avoid_: Incident, Mutable Alert Row

**Alert Episode Identity**:
The identity of one continuous occurrence under an Alert Fingerprint, distinguished by its source and start time. It is not the identity of the logical condition across recurrences.
_Avoid_: Alert Fingerprint

**Alert State Transition**:
An append-only record of a detection-state change for an Alert Instance, including its evidence, rule version, source, time, and actor.
_Avoid_: Updated Status Field

**Incident**:
An operational event declared for human coordination, impact analysis, mitigation, monitoring, and closure. Its lifecycle is independent of every linked Alert Instance.
_Avoid_: Alert, Notification, Work Order

**Incident Alert Link**:
An auditable association between an Incident and an Alert Instance that identifies the alert's role as a root-cause candidate, confirmed root cause, symptom, impact, or related evidence.
_Avoid_: Alert Ownership

**Incident Timeline**:
The append-only operational history of an Incident, including state, ownership, severity, impact, cause, response, closure, and correction events.
_Avoid_: Editable Notes Field

**Alert Severity**:
The technical seriousness assigned by an Alert Rule to a detected condition.
_Avoid_: Incident Severity, Incident Priority

**Incident Severity**:
The assessed seriousness of actual network or business impact for an Incident.
_Avoid_: Alert Severity, Incident Priority

**Incident Priority**:
The operational order in which an Incident should be handled, independent of its Incident Severity.
_Avoid_: Severity

**Notification Delivery**:
One attempted delivery of Alert or Incident information to a destination through a channel. Delivery outcome does not determine Alert or Incident truth.
_Avoid_: Alert, Incident

**Health Status**:
The authoritative discrete conclusion about an object's current health: `HEALTHY`, `DEGRADED`, `CRITICAL`, or `UNKNOWN`.
_Avoid_: Health Score, Maintenance State

**Operational Mode**:
The governed participation state of an object: `ACTIVE`, `MAINTENANCE`, `DISABLED`, or `RETIRED`. It coexists with Health Status rather than replacing it.
_Avoid_: Health Status

**Data Quality**:
The trust condition of evidence used for health calculation: `FRESH`, `PARTIAL`, `STALE`, `SOURCE_UNAVAILABLE`, `CONFLICTING`, or `NOT_CONFIGURED`.
_Avoid_: Health Status

**Health Reason**:
A structured, source-attributed explanation for a Health Status, with one primary reason and optional secondary reasons.
_Avoid_: Alert Message, Score Label

**Health Score**:
An explainable, nullable value from 0 to 100 derived for ranking, trend, and peer comparison. It never overrides Health Status, and `null` means the evidence is insufficient.
_Avoid_: Health Status, Unknown-as-Zero

**Health Policy**:
The governed rules for deriving Health Status, Health Score, evidence sufficiency, aggregation, and transition behavior for one object type.
_Avoid_: Universal Health Formula

**Health Policy Version**:
An immutable historical form of a Health Policy that explains a calculated result without rewriting earlier health history.
_Avoid_: Current Thresholds

**Freshness Policy**:
The expected timing and expiry rules for one health input, relative to that input's collection or evaluation cadence.
_Avoid_: Global Stale Timeout

**Coverage Ratio**:
The weighted share of expected health inputs or child objects that currently have reliable conclusions.
_Avoid_: Healthy Ratio

**Current Health**:
The latest authoritative Health Status and its operational, data-quality, reason, score, coverage, policy, and validity context for one object.
_Avoid_: Latest Metric

**Health Transition**:
An append-only record that explains a change in authoritative Health Status using a policy version and evidence state.
_Avoid_: Updated Health Row

**Health Snapshot**:
A historical point-in-time health result retained for trends, reports, or Incident impact evidence without copying every raw metric.
_Avoid_: Raw Metric Archive

**Health Score Breakdown**:
The component scores, weights, deductions, coverage, policy version, and time that explain one Health Score.
_Avoid_: Opaque Score

**HTTP API Process**:
The public NestJS runtime that authenticates users, accepts commands, serves queries, and owns authorized Web and SSE connections without executing long-running background work.
_Avoid_: Platform Worker, Control Plane

**Platform Worker**:
The non-HTTP NestJS runtime that executes durable Condition, Health, Alert, reconciliation, delivery, expiry, and maintenance work from PostgreSQL-coordinated records.
_Avoid_: HTTP API Process, Collector

**Inbox Message**:
An idempotently identified, durably received internal input whose business effects are applied transactionally before it is marked complete.
_Avoid_: HTTP Request, Raw Payload

**Outbox Message**:
A durable intent for asynchronous work written in the same transaction as the business state that requires it.
_Avoid_: Best-effort Event, Direct Service Call

**Background Job**:
A durable, prioritized unit of retryable work claimed by a Platform Worker under a finite lease.
_Avoid_: In-process Task, Thread

**Job Attempt**:
One auditable execution attempt for a Background Job, with timing, outcome, and classified failure.
_Avoid_: Job

**Worker Lease**:
A time-bounded claim that permits one Platform Worker to process a Background Job and allows recovery after the worker stops renewing it.
_Avoid_: Permanent Processing Flag, Device Lock

**Dead Letter Record**:
A visible and auditable record of work that exhausted or cannot use automatic retry and requires review, correction, or controlled replay.
_Avoid_: Dropped Message, Error Log

**At-least-once Work**:
The execution contract under which committed work may run more than once and every consumer must make repeated delivery safe.
_Avoid_: Exactly-once Execution
