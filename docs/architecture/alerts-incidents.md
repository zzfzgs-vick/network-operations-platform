# Alert and Incident architecture

Status: Decided

## Boundary and authority

Alert and Incident are independent layers:

- Alert records an operationally significant technical condition mapped through a versioned Alert Rule Condition Binding.
- Incident records the coordinated human response to an operational impact.
- PostgreSQL-backed platform state is authoritative for Alert episodes, acknowledgement, transitions, Incident handling, links, timeline, and audit.
- VictoriaMetrics remains the source of metric facts, not the authoritative store for Incident or human handling history.
- Notification components report delivery outcomes and never determine whether an Alert or Incident exists.

One Incident may aggregate one or more Alert Instances. Alert resolution does not close an Incident, and Incident closure, cancellation, or unlinking never changes or removes Alert history.

## Condition evaluation boundary

Shared technical judgment is a distinct layer before Alert and Health:

```text
Raw Observation
      -> Normalized Fact or Metric
      -> Condition Evaluation
           -> Alert Engine -> Alert Instance
           -> Health Engine -> Current Health

Alert Instance + Health Impact + Topology
      -> Incident
```

Alert Engine and Health Engine are sibling consumers. Health does not read Alert Instance state as condition evidence; Alert does not read Health Status to reproduce a condition; Incident state cannot feed back into the originating Condition or Health calculation.

## Responsibilities

**VictoriaMetrics** stores raw and derived time series, serves MetricsQL/PromQL-compatible queries, retains `vmalert` execution state, and supplies reconciliation evidence. It does not own Condition definitions, Alert handling, Health, Incident, or audit history.

**vmalert** executes platform-generated Metric Condition Versions, including MetricsQL, `conditionFor`, `conditionRecoveryFor`, hysteresis, aggregation, and baseline semantics. It pushes Condition Evaluations, restores compatible execution state from VictoriaMetrics, and exposes health. It does not own Alert Rule, Alert Instance, Health Policy, Current Health, Incident, acknowledgement, suppression, or final notification.

**Observation Normalizer** converts identity-resolved Observations and platform source signals into Normalized Facts such as interface state, Collector availability, and data freshness inputs. It does not decide Alert or Health outcomes.

**Direct Fact Condition Evaluator** evaluates Direct Fact and composite Condition Definitions from Normalized Facts or lower-level Condition Evaluations.

**Alert Engine** consumes Condition Evaluations through Alert Rule Condition Bindings and owns Fingerprint, Alert Episode identity, idempotency, lifecycle, acknowledgement, suppression, notification policy, and Alert audit.

**Health Engine** consumes the same Condition Evaluations through Health Policy Condition Bindings and owns Current Health, Health Transitions, score, reasons, coverage, and Health audit without depending on Alert Instance.

## Condition model

PostgreSQL is authoritative for `ConditionDefinition`, immutable `ConditionVersion`, `ConditionAssignment`, `ConditionDependency`, and `ConditionExecutionBinding`. Condition types are Metric Condition and Direct Fact Condition; composite conditions remain versioned definitions with declared dependencies.

Condition State is `TRUE`, `FALSE`, or `UNKNOWN`. `FALSE` requires successful execution and valid evidence proving the predicate does not hold. Missing data, executor or source failure, deployment mismatch, ambiguity, or an unevaluated version is `UNKNOWN`, never false, recovered, healthy, or zero.

Condition Evaluation contains at least:

- `conditionId` and `conditionVersion`
- Condition State and optional previous state
- formal target type and ID plus canonical dimensions
- `firstTrueAt`, `evaluatedAt`, `receivedAt`, and `validUntil`
- source type and instance plus execution status
- current value, threshold and window summaries
- evidence references and configuration hash
- optional transition reason, confidence, Coverage Ratio, baseline reference, execution duration, and source-data time

Evaluation identity is idempotent for Condition Version, target, dimensions, and logical occurrence. Periodic identical evaluation updates current evidence without creating duplicate Condition Transitions or downstream business objects.

## Single ownership of predicate semantics

Metric Condition Definition is the only location for its MetricsQL, threshold, entry and recovery windows, hysteresis, aggregation range, label selection, freshness prerequisite, baseline algorithm, and result dimensions. Alert Rule, Health Policy, API, Go services, dashboard, and reports cannot embed another copy.

Direct Fact Conditions similarly own shared comparisons such as interface down, Collector unavailable, status stale, or probe executor unavailable after Observation normalization. If a direct fact feeds both Alert and Health, both bind to one Condition Evaluation. Only a simple raw attribute used solely for health explanation may bypass a shared condition.

Shared time is named `conditionFor` and `conditionRecoveryFor`. Alert-only escalation after a true condition is `alertPromotionDelay`; delivery delay is `notificationDelay`. Different windows are allowed only when their meanings are explicitly distinct.

## Condition composition and acyclic dependencies

Condition Dependency forms a directed acyclic graph over Normalized Facts, metrics, recording results, and lower-level conditions. Publication rejects cycles.

MVP composition supports `ALL`, `ANY`, `NOT`, `QUORUM`, `SEQUENCE`, and `DEPENDENCY`. For `ALL`, any false input makes false, all true makes true, and otherwise the result is unknown. For `ANY`, any true input makes true, all false makes false, and otherwise the result is unknown. `NOT` preserves unknown. Every composite retains inputs, version, propagation rule, and explanation.

Health -> Alert -> Condition -> Health and Incident -> Health -> Alert -> Incident dependency cycles are prohibited. A later management Alert about an object remaining critical is a separate downstream Platform Event and cannot feed the Health Policy that produced it.

## Condition publication

Shared Condition publication follows this controlled sequence:

1. Create an immutable candidate Condition Version.
2. Validate identity, target dimensions, MetricsQL or direct-fact predicate, bounds, and permissions.
3. Validate the dependency graph and three-valued propagation.
4. Run normal, true, false, unknown, boundary, missing-data, and cardinality tests.
5. Compile Metric Conditions to `vmalert` recording rules, alerting rules, or a controlled combination.
6. Generate an immutable package and configuration hash carrying `condition_id` and `condition_version`.
7. Atomically activate and reload the executor package.
8. Verify loaded version, hash, execution health, and result mapping.
9. Activate every Alert and Health binding on the same Condition Version.
10. On failure, keep both consumers on the previous version and audit the rollback.

The exact recording-versus-alerting-rule compilation is deferred to detailed technical design. MetricsQL still exists only in the authoritative Condition Version. A time-bounded migration mismatch is explicit and audited; silent Alert-v3 versus Health-v2 use is invalid.

Generated files remain read-only to `vmalert`; users cannot upload arbitrary production YAML, paths, scripts, or secret-bearing templates. Expression size, result cardinality, query concurrency, and dependencies are bounded. Credentials remain in controlled Secret files and absent from Git, URLs, conditions, labels, annotations, and logs.

## Real-time push and reconciliation

`vmalert` sends batches to an internal authenticated platform route compatible with its supported push protocol. The route is internal to the Docker network, excluded from the public management entry point, and uses a rotatable service identity.

The receiver validates and durably records accepted Condition Evaluations before success. One invalid entry does not silently discard a mixed batch; batch identity, accepted and rejected counts, and safe reasons are recorded. Slow Notification Delivery is not part of this synchronous path.

Condition Reconciler compares expected and loaded Condition Versions and hashes, `vmalert` execution and state recovery, VictoriaMetrics-backed evaluator state, current Condition Evaluations, bound open Alert Instances, and last successful push and reconciliation times. It runs every 30 to 60 seconds, at platform startup, after Condition publication, and after recovery of an evaluator, source, or ingest path.

Reconciliation recovers missed true, false, or unknown state, observes condition timing, detects version drift, and corrects duplicate or delayed delivery through appended records. It never deletes Condition, Alert, or Health history.

## Alert Rule and Condition Binding

PostgreSQL is authoritative for `AlertRule`, immutable `AlertRuleVersion`, `AlertRuleConditionBinding`, Alert deployment, and Alert audit. Alert Rule owns:

- whether the bound condition creates or maintains an Alert
- Alert Severity, stable labels, and annotations
- alert target scope and episode mapping
- `alertPromotionDelay`
- automatic Incident eligibility
- Notification Policy and notification-specific delay

It does not own the shared expression, threshold, condition window, recovery window, freshness calculation, baseline, or result dimensions.

Every Alert Instance records `conditionId`, `conditionVersion`, `ruleId`, `ruleVersion`, trigger-time severity, and binding parameters. Alert Fingerprint uses Rule, Condition, formal target, and bounded stable dimensions, excluding current value, time, error text, and dynamic description. Alert Episode identity adds the condition's logical start time so a later recurrence creates a new instance.

Condition `TRUE` enters Alert promotion and firing behavior. Condition `FALSE` enters explicit recovery confirmation. Condition `UNKNOWN` records data or execution uncertainty and cannot recover the Alert. An Alert-only Pending or promotion delay is separate from the already evaluated shared condition window.

The architecture maintains independent Alert facets:

- detection: `PENDING`, `FIRING`, `RESOLVED`
- acknowledgement: actor, time, and note
- notification: pending, delivered, failed, rate-limited, or suppressed
- suppression: upstream root cause, Maintenance Window, manual Silence, or none
- data validity: valid, stale, source unavailable, or indeterminate

Acknowledgement and suppression never imply technical recovery.

## Alert idempotency and version changes

Transactional identity prevents repeated Condition `TRUE`, `FALSE`, `UNKNOWN`, batch retry, or concurrent delivery from duplicating Alert Instances or transitions. An old true evaluation cannot reopen a resolved older episode, and ambiguous mapping is retained for reconciliation rather than guessed.

Display-only Alert Rule changes do not close an episode. Severity changes preserve trigger-time severity. Alert binding or promotion changes create a new Alert Rule Version without altering Condition semantics.

Expression, threshold, shared dimensions, and shared time changes create a new Condition Version. Publication identifies affected open Alert Instances, records the switch, reconciles old state, may end old execution semantics with `CONDITION_REPLACED`, and creates a new episode only when the new Condition Evaluation and binding require it. Historical Condition, Alert, and Health versions remain unchanged.

Disabling an Alert Rule stops new Alert promotion but does not disable a shared condition needed by Health or another consumer. Disabling a Condition requires dependency analysis and cannot silently strand an active binding.

## Direct Fact and Trap evidence

Collector or Receiver creates raw Observations. Observation Normalizer resolves identity and creates Normalized Facts. Direct Fact Condition Evaluator then produces shared Condition Evaluations.

A `linkDown` Trap can normalize evidence, make an interface-down condition true or candidate, and trigger confirming SNMP poll according to the Condition Definition. A `linkUp` cannot blindly make every condition false; device, interface, episode, evidence order, and confirmation are checked. Lost Traps do not disable metric monitoring because Trap and polling are complementary inputs.

Freshness and source conditions are shared, including interface-status stale, probe-result stale, Collector heartbeat stale, Collector unavailable, VictoriaMetrics unavailable, `vmalert` evaluation failed, and probe executor unavailable. Source failure makes dependent conditions unknown rather than false and may independently create a Platform Alert.

## Incident lifecycle

An Incident uses an immutable `incidentId` and the states `DECLARED`, `INVESTIGATING`, `MITIGATING`, `MONITORING`, `RESOLVED`, `CLOSED`, and `CANCELED`.

Operational measurement uses distinct `detectedAt`, `declaredAt`, `assignedAt`, `acknowledgedAt`, `mitigationStartedAt`, `impactEndedAt`, `resolvedAt`, and `closedAt` values. A mutable `updatedAt` is not a substitute for detection delay, MTTA, mitigation, recovery, closure, or recurrence analysis.

`RESOLVED` means the technical impact has ended. `CLOSED` additionally requires review of linked Alert state, final impact, response actions, closing summary, actor, and time. High-severity closure also captures root-cause status, follow-up ownership, unresolved risk, and whether a postmortem is required.

The MVP supports manual declaration from selected Alerts, an asset, line, abnormal topology path, or an operator observation without an Alert. It may also use a small set of configured deterministic rules for sustained core-device failure, confirmed core-link outage, multi-site impact, an explainable upstream fan-out, or critical business-probe failure. Ordinary firing Alerts do not automatically become Incidents.

Reopening is explicit and appends actor, time, previous state, reason, new links, and reopen count. A distant recurrence normally creates a new Incident related to the earlier one.

## Alert-to-Incident association

`IncidentAlertLink` is a first-class association with role, time, source, actor, validity, and audited removal. Roles are:

- `ROOT_CAUSE_CANDIDATE`
- `CONFIRMED_ROOT_CAUSE`
- `SYMPTOM`
- `IMPACT`
- `RELATED`

An Incident may have many links. An Alert Instance may have historical links to several Incidents, but the MVP allows at most one primary open Incident at a time. A concurrent secondary association requires an explicit role and reason. Ending a link preserves its history.

These invariants apply:

- Alert `RESOLVED` does not close or resolve an Incident.
- Incident `CLOSED` or `CANCELED` does not alter Alert detection.
- Removing a link does not remove either object.
- Incident Severity changes do not change Alert Severity.
- Archiving an Alert Rule or asset does not remove historical Alert or Incident access.

## Timeline, cause, impact, and ownership

Incident Timeline appends creation, state, severity, priority, owner, Alert links, cause, impact, notes, mitigation, recovery, closure, reopening, notification, and external-reference events. Corrections append compensating records; ordinary editing never erases the original entry.

Cause is tracked as unknown, suspected, confirmed, or excluded and may refer to a device, interface, line, Collector Node, platform component, configuration change, Alert Instance, carrier, or other external dependency.

Impact includes affected sites, devices, lines, businesses, times, level, and summary. It is stored as an incident-time snapshot or version reference so later topology changes cannot rewrite historical impact.

The MVP supports one current primary owner, creator and last updater, handling notes, permission-controlled state transitions, and owner-change history. It does not attempt to provide full on-call scheduling, Incident Commander organization, chat, meetings, or external work-order synchronization.

## Severity and priority

Alert Severity and Incident Severity use `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, and `INFORMATIONAL`. Incident Priority uses `P1` through `P4` and is not a fixed mapping from Severity.

Alert Instances, Health Impact, and topology may produce an initial Incident recommendation. Authorized adjustment records the reason, old and new value, actor, and time without modifying Condition, Alert Rule, Alert Instance, or Current Health history.

## Correlation, suppression, and maintenance

Automatic association uses only explainable deterministic conditions such as the same formal device, line, site, business, topology upstream relation, bounded time window, finite labels, or an explicit correlation rule. Each association records rule ID and version, evidence, time, confidence type, and human-confirmation state.

An upstream failure may suppress repeated delivery for downstream symptoms and aggregate them into one Incident. All downstream Alert Instances remain present and keep their actual detection or data state, including `UNREACHABLE`, `UNKNOWN`, or `STALE`.

Maintenance Windows do not stop fact collection by default. Rules continue evaluating, Alert Instances continue transitioning, notification may be suppressed with the window ID and reason, and policy decides whether an Incident is automatically declared. An abnormal condition still present when maintenance ends is not silently normal. High-risk work may have a manually declared planned Incident or maintenance record without expanding the MVP into full change management.

For Metric Conditions, maintenance is applied after Condition Evaluation. The platform does not primarily implement maintenance by rewriting condition expressions to exclude targets, because that would obscure facts and destabilize Condition Version history.

## Health relationship

Health Status and Alert Instance are parallel products of Condition Evaluation; Incident follows Alert, Health Impact, and topology.

- Condition `TRUE` or `FALSE` independently enters Alert mapping and Health recomputation.
- Condition `UNKNOWN` never recovers an Alert and can make Health Status unknown when the input is mandatory.
- Health Engine does not read acknowledgement, delivery, suppression, Incident association, or Alert Severity as technical evidence.
- Alert Engine does not read Health Status or Health Score to reconstruct a shared condition.
- Incident closure does not change Condition State, Alert detection, or Health Status.
- `MAINTENANCE` suppresses delivery or automatic Incident creation according to policy but leaves Condition, Health, and Alert facts visible.
- Downstream objects hidden by an upstream failure become `UNKNOWN` with `UPSTREAM_UNREACHABLE`; they are not all assigned independent critical failures.

An authorized health correction is separate from Alert acknowledgement and requires explicit reason, actor, validity, related Incident when applicable, and audit.

## Notification Delivery

Notification Delivery records the related Alert or Incident, target, channel, attempt time, success or failure, retry count, response summary, and rate-limit or suppression reason. Delivery failure cannot block Alert transition persistence, Incident declaration, or Incident handling.

The MVP architecture does not assume a particular email, SMS, enterprise-messaging, or notification product in this decision.

## Retention and correction

Alert Rules may be disabled or archived. Alert Instances, transitions, Incidents, links, and timeline entries are not ordinarily physically deleted. An incorrect Incident becomes `CANCELED`; an incorrect link is ended; an administrative correction is appended and audited.

Alert and Incident history is retained for at least one year, with longer retention for high-severity Incidents when required by organizational policy. Archived related assets remain resolvable in historical views.

## Product boundary

The Alert view covers pending, firing, and resolved episodes; acknowledgement; suppression and maintenance context; linked Incidents; transition history; bulk acknowledgement; and filters by site, device, interface, line, and severity.

The Incident view covers state, owner, severity, priority, impact snapshot, linked Alerts and roles, cause candidates, timeline, mitigation, recovery, closure, reopening, and related historical Incidents.

The Executive Dashboard receives only major open Incidents, impact, response state, duration, and aggregate Alert counts. It does not stream every underlying Alert Instance.

## Alertmanager boundary

Alertmanager is not part of the MVP Alert Instance authority chain. The default path is VictoriaMetrics to `vmalert`, Condition Evaluation ingest and reconciliation, parallel Alert and Health consumers, then platform Incident and Notification Delivery handling.

The MVP does not keep authoritative Silence state in both the platform and Alertmanager. If later notification breadth justifies Alertmanager, it may be evaluated as an outbound delivery adapter; it still cannot own Alert, acknowledgement, Incident, timeline, or audit history.

## Verification boundary

Every built-in Metric Condition has cases for true, false, unknown, no data, delayed data, threshold boundary, counter reset, missing labels, multiple targets, dependency uncertainty, and result-cardinality limit. Composite conditions test three-valued `ALL`, `ANY`, `NOT`, quorum, sequence, dependency, explanation, and cycle rejection.

Integration verification covers Condition true, false, and unknown push; duplicate and out-of-order delivery; temporary ingest and VictoriaMetrics failure; `vmalert` and platform restart; startup reconciliation; condition reload failure and atomic rollback; shared Alert and Health version use; Alert promotion; condition disablement with active bindings; maintenance; and Trap-to-metric evidence association.

MVP-S1 verification also proves Condition and Alert batch idempotency, no duplicate Condition or Alert transitions under the storm, incremental Health recomputation for 30,000 interfaces, stable Incident links, repair after temporary platform outage, and bounded push handling that does not stall `vmalert` for slow downstream notification.

## Non-goals

- Complete ITSM or change management
- Bidirectional external work-order synchronization
- Full on-call scheduling or collaboration suite
- Machine-learning or opaque probabilistic root-cause inference
- Natural-language Incident classification or postmortem generation
- Unreviewed complex automatic Incident merging
- Automatic network-device configuration
- Automatic closure of every Incident
- Deleting Alert history to control list size
- A platform-built MetricsQL execution engine or Node.js time-series scanner
- Two parallel authorities for Metric Condition execution
- Direct production rule-file editing or arbitrary executable alert conditions
- Authoritative Silence state split between the platform and Alertmanager
- Multiple highly available or cross-host `vmalert` executors
- MetricsQL, thresholds, freshness, or shared windows duplicated in Alert Rule or Health Policy
- Health-to-Alert-to-Health or Incident-to-Health dependency cycles
- Treating Condition `UNKNOWN` as `FALSE`
- Redis as authoritative Condition state
