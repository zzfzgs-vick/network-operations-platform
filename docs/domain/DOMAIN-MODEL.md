# Platform domain model

Status: Decided

## State layers

Every governed asset field and topology relation is interpreted through three distinct layers:

- **Desired State** is authoritative input from manual configuration, controlled import, or explicit approval.
- **Observed State** is immutable, time-bounded evidence from collection or active probing.
- **Effective State** is the published view used by topology, alerting, and impact analysis.

Effective State follows these rules:

1. Confirmed or locked Desired State wins when it exists.
2. Without Desired State, an eligible observation may be published only with an unconfirmed marker.
3. A conflict creates a Topology Difference and does not mutate Desired State or silently replace Effective State.
4. A candidate topology relation becomes authoritative only after explicit approval.

## Core concepts

### Managed Asset

A Managed Asset has an immutable Platform Identity and field-level provenance. Regions, sites, equipment rooms, device groups, devices, interfaces, and lines participate in the governed topology; important business paths reference the devices and lines on which they depend.

## Identity model

Identity has four layers: Platform Identity, hardware instance, Matching Evidence, and replacement lifecycle.

### Platform identities

| Concept | Formal identity | Meaning |
| --- | --- | --- |
| Managed Device | `managedDeviceId` | Logical managed position or responsibility |
| Device Instance | `deviceInstanceId` | One physical or virtual hardware instance |
| Managed Interface | `interfaceId` | Formal interface identity in the platform |
| Topology Relation | `topologyRelationId` | Formal identity of a governed topology relation |

Every formal identity is platform-generated, immutable after creation, independent of names and observed attributes, and not used as the primary user-facing name. Historical observations, metrics, alerts, and audit records reference these identities rather than recalculated natural keys.

### Managed Device and Device Instance

A Managed Device owns the business-facing name, asset number, management address, site, role, topology position, importance, and responsible parties. It provides continuity for topology and business relationships.

A Device Instance records one physical or virtual instance, including vendor, model, serial number, SNMP Engine ID, base MAC, software version, first and last observation times, and activation and retirement times. A Managed Device may have successive Device Instances and may have several concurrent instances for a stack or virtual chassis.

Hardware replacement follows this lifecycle:

1. New hardware evidence creates an identity conflict or replacement candidate; it never silently rewrites the current instance.
2. An operator confirms the replacement.
3. The `managedDeviceId` remains unchanged.
4. The old `deviceInstanceId` is retired and a new `deviceInstanceId` is created.
5. The replacement record and operator action are audited.
6. Instance-specific observations such as serial number and uptime remain separated across the old and new instances.

### Matching Evidence

Evidence is assessed in three levels.

**Strong evidence**:

- A unique asset number from a controlled import
- A confirmed Device Instance identifier
- A reliable vendor, serial-number, and device-type combination
- A confirmed SNMPv3 Engine ID
- A manually assigned external-system unique ID

**Medium evidence**:

- Chassis base MAC
- Vendor model combined with management IP
- Name, site, model, and interface-profile combination
- Historical LLDP adjacency
- Interface-set characteristics

**Weak evidence**:

- Management IP, DNS name, `sysName`, or display name
- One interface MAC
- `sysDescr`
- Topology position

Management IP, names, and `sysName` may change or repeat. A serial number may be absent, defaulted, duplicated, or malformed. No single management IP, name, serial number, MAC, or `ifIndex` is a formal identity.

### Matching outcomes and rules

Matching produces one of `MATCHED`, `CANDIDATE`, `AMBIGUOUS`, `CONFLICT`, `NEW_IDENTITY`, or `REJECTED`.

- Only unique, conflict-free strong evidence may associate automatically.
- Multiple medium signals may create a high-confidence candidate but require confirmation by default.
- Weak evidence alone creates only a candidate.
- Multiple possible targets produce `AMBIGUOUS`; the platform does not choose one automatically.
- Conflicting strong evidence produces `CONFLICT`.
- Equal management IPs or names never cause an automatic merge.
- Empty, default, or abnormal serial numbers never cause an automatic match.
- Every automatic decision records its evidence, confidence, and matching-rule version.

### Managed Interface identity

`interfaceId` is immutable Platform Identity. `ifIndex` belongs to an SNMP observation context and is only a mutable observed attribute.

Interface matching is scoped to its `managedDeviceId` or known `deviceInstanceId` and may consider normalized `ifName`, `ifAlias`, interface type, chassis and stack member, slot, subslot, port, ENTITY-MIB relation, LLDP Local Port ID, physical MAC, aggregation membership, VLAN or subinterface parameters, and historical characteristics. Insufficient or conflicting evidence creates a candidate or conflict rather than an automatic merge.

Managed Interfaces are classified at least as physical, link aggregation, VLAN/SVI, Loopback, subinterface, Tunnel, virtual management, or other logical interfaces. Matching rules vary by class: physical interfaces prefer chassis and port position; aggregations prefer normalized name and member set; SVIs prefer VLAN identity; subinterfaces use parent interface and encapsulation; Loopbacks use normalized name or logical number.

### Stacks and virtual chassis

The model does not assume that one management IP represents one physical device. One Managed Device may represent a stack, IRF, CSS, VSF, or another virtual chassis with multiple Device Instances and member roles.

Member replacement, member-number changes, control-plane switchover, and membership changes produce differences or instance lifecycle records. The MVP need not recognize every vendor technology automatically and must not silently rewrite historical identity.

### Merge, split, and rebind

Operators may confirm or reject matches, merge duplicate candidates, undo an incorrect merge, confirm hardware replacement, rebind a Managed Interface, split an incorrect association, and inspect history before and after the operation.

A merge never physically deletes the source history. It records the source identity, target identity, operator, time, reason, Matching Evidence, and an auditable Identity Redirect. Undo is a compensating operation that preserves the original merge history.

### Topology Relation

A Topology Relation connects topology objects, such as a line joining two interfaces or a business path depending on a device. A relation may have Desired State, one or more observations, an Effective State, disposition history, and a lock or retirement state.

### Observation

Each observation retains at least:

- `sourceType`
- `collectorId`
- `observedAt`
- `expiresAt` or an equivalent validity period
- `confidence`
- the original source identifier or value

Observations from SNMP, LLDP, CDP, interface tables, ARP, MAC address tables, and active probes are evidence, not authority.

### Topology Difference

A Topology Difference records a candidate or discrepancy between Desired State and Observed State. Examples include a new device, interface, or neighbor; a missing expected link; a changed peer; an apparent site move; changed model, serial number, or interface name; and competing identities for one device.

A difference supports the applicable dispositions: accept, reject, temporarily ignore, merge, lock, or mark as a false positive. Every disposition is audited.

## Field ownership

Ownership is assigned per field, not per device object.

### Authoritative fields

- Device name and management IP
- Region, site, equipment room, and device-group membership
- Importance, owner, department, business purpose, and asset number
- Managed or retired status for devices and lines
- Core-line endpoints, contract bandwidth, and carrier information
- Business-path associations
- Manual topology coordinates
- Confirmed or locked topology relations

### Observed fields

- `sysName`, `sysDescr`, and `sysObjectID`
- Device uptime, current model, serial number, and software version
- Interface inventory and operational state
- LLDP and CDP neighbors
- CPU, memory, and temperature
- Traffic, errors, and discards
- Active-probe results

An operator may promote an observed value into an authoritative field. Promotion creates an audited Desired State change and cannot overwrite a locked value without an explicit unlock or approved replacement.

## Discovery and reconciliation states

The domain supports the following state vocabulary:

- `CANDIDATE`: newly discovered and awaiting review
- `CONFIRMED`: explicitly approved as authoritative
- `REJECTED`: reviewed and rejected as an invalid relation or match
- `CONFLICT`: inconsistent with Desired State
- `STALE`: not observed again within its normal validity window
- `MISSING`: expected by Desired State but absent beyond the configured loss period
- `LOCKED`: protected from automatic discovery changes
- `RETIRED`: manually deactivated or archived

These states are not assumed to be one mutually exclusive enum. Review, reconciliation, and governance conditions may coexist; for example, a confirmed and locked relation may also be missing from current observations.

## Absence and identity invariants

- A missing observation never causes immediate deletion.
- The platform retains the last observation time and first marks expired evidence as `STALE`.
- After the configured loss period, an expected object or relation becomes `MISSING`.
- Archival or physical deletion requires an explicit operator action and retains history and audit evidence.
- `ifIndex`, interface name, device name, management IP, serial number, or MAC is not sufficient by itself as formal identity.
- Device reboot, module replacement, or `ifIndex` change must produce identity matching and a reviewable difference when the match is uncertain, not duplicate storms or silent replacement.

## Controlled import

CSV import is part of the MVP and must provide validation, preview, counts for additions, changes, conflicts, and ignored rows, difference comparison, explicit confirmation, idempotency keys, an import batch identifier, audit history, and an error-row report.

Import matching proceeds in this order:

1. Platform Identity previously exported by the platform
2. Confirmed and unique external-system ID
3. Confirmed and unique asset number
4. Explicitly configured composite matching rule
5. Candidate requiring confirmation
6. New identity

Device name, management IP, `sysName`, serial number alone, or MAC alone cannot overwrite an existing Managed Device. Undo restores the prior Desired State through an audited compensating action rather than deleting import history.

## Observation identity

Every device or interface observation retains:

- `managedDeviceId`, when confirmed
- `deviceInstanceId`, when determined
- `interfaceId`, when determined
- original `ifIndex`, when applicable
- `collectorId`
- `observedAt`
- matching-rule version
- matching confidence

Unconfirmed evidence may attach to a candidate observation object. It cannot be written into the metric or history stream of a formal device or interface until the association is confirmed or permitted by the unique-strong-evidence rule.

## Condition model

Condition is the shared technical-decision layer between normalized evidence and downstream operational models:

```text
Raw Observation
      -> Normalized Fact or Metric
      -> Condition Evaluation
           -> Alert Engine -> Alert Instance
           -> Health Engine -> Current Health

Alert Instance + Health Impact + Topology
      -> Incident
```

Alert and Health consume the same Condition Evaluation in parallel. Health never derives a shared condition from Alert Instance state, and Alert never derives the same condition from final Health Status. Incident state is downstream and cannot feed back into the Condition or Health calculation that created its evidence.

### Definitions, assignments, and bindings

Condition Definition has immutable `conditionId` and describes one reusable technical predicate. Each edit creates an immutable Condition Version. Condition Assignment applies an eligible Condition Definition to a formal target or controlled target-selection scope. Condition Execution Binding assigns a Condition Version to its evaluator.

Metric Condition Definition is the single owner of its MetricsQL expression, threshold, `conditionFor`, `conditionRecoveryFor`, hysteresis, aggregation, label selection, freshness prerequisite, baseline algorithm, and result dimensions. It is evaluated by `vmalert` against VictoriaMetrics.

Direct Fact Condition Definition evaluates Normalized Facts such as interface operational state, Collector availability, or data freshness. Collector and Receiver produce Observations; Observation Normalizer resolves identity and produces source-neutral Normalized Facts; Direct Fact Condition Evaluator produces Condition Evaluations. Health Engine does not parse SNMP, Trap, or raw protocol payloads.

Alert Rule Condition Binding maps a Condition Evaluation to Alert episode behavior, Alert Severity, labels, annotations, target scope, `alertPromotionDelay`, automatic Incident eligibility, and notification policy. Health Policy Condition Binding maps the same evaluation to Health Status impact, hard critical behavior, score deduction, weight, dependency role, coverage requirement, and Health Reason.

An Alert Rule or Health Policy references Condition Versions through bindings and never stores another copy of a shared expression, threshold, or time window. A condition may also support deterministic Incident declaration, dashboard aggregation, SLA, or reporting policies without those consumers re-evaluating it.

### Condition State and Evaluation

Condition State is `TRUE`, `FALSE`, or `UNKNOWN`:

- `TRUE` means valid evidence clearly satisfies the predicate.
- `FALSE` means the executor is healthy, required data is valid, and the predicate clearly does not hold.
- `UNKNOWN` means the predicate cannot be evaluated reliably because data, source, execution, deployment, identity, dimensions, or dependency is unavailable or ambiguous.

`UNKNOWN` is not `FALSE`, Alert recovery, health, or numeric zero.

Condition Evaluation retains `conditionId`, `conditionVersion`, Condition State, target type and ID, canonical dimensions, `firstTrueAt`, evaluation and receipt times, validity end, source type and instance, execution status, current value, threshold and window summaries, evidence references, and configuration hash. It may also retain previous state, transition reason, confidence, Coverage Ratio, baseline reference, execution duration, and source-data time.

Evaluation identity is stable and idempotent for a condition version, target, dimensions, and logical evaluation occurrence. Periodic repetition of the same result updates the current projection and evidence time without creating duplicate business transitions.

### Time semantics

Shared temporal semantics are named `conditionFor` and `conditionRecoveryFor` and belong to Condition Definition. Alert-only delay after a true condition is `alertPromotionDelay`; delivery-only delay is `notificationDelay`. These values may differ only when their business meanings are distinct and documented.

Alert and Health do not each add an unnamed copy of the condition window. For example, a five-minute utilization predicate is evaluated once as a Condition; an optional two-minute Alert promotion delay does not cause Health to recalculate the five-minute metric window.

### Dependencies and three-valued composition

Condition Dependency forms a directed acyclic graph over metrics, recording results, Normalized Facts, and lower-level conditions. Publication rejects cycles before activation.

MVP composition supports `ALL`, `ANY`, `NOT`, `QUORUM`, `SEQUENCE`, and `DEPENDENCY` with explicit explanations and `UNKNOWN` propagation. `ALL` is false if any input is definitely false, true only when all are true, and otherwise unknown. `ANY` is true if any input is true, false only when all are false, and otherwise unknown. `NOT` preserves unknown.

Every composite condition has immutable identity and version, declared inputs, three-valued truth rules, cycle validation, and an explanation output. Arbitrary user scripts are not conditions in the MVP.

### Freshness and source availability

Freshness and source availability have shared Direct Fact Condition Definitions such as interface-status stale, probe-result stale, Collector heartbeat stale, Collector unavailable, VictoriaMetrics unavailable, `vmalert` evaluation failed, and probe executor unavailable.

Freshness conditions reference the collection policy, expected cadence, grace, stale and unavailable thresholds, Collector state, and last successful observation. Health Policy and Alert Rule consume these results and do not each compute `now - lastObservedAt`.

Source failure makes dependent conditions `UNKNOWN`, never `FALSE`. It cannot automatically resolve an Alert, while Health Policy may map an unknown mandatory condition to `UNKNOWN`. Independent `PLATFORM_EVENT` Alert Rules may alert on the source failure itself.

### Versioning, publication, and state propagation

Each Condition Evaluation retains Condition Version, executor type, configuration hash, input references, evaluation time, validity, and source health. Alert Instance retains the triggering condition and Alert Rule versions. Current Health retains Health Policy Version and the Condition Versions used in its calculation.

A shared Condition Version is validated, cycle-checked, unit-tested, published to its executor, verified as loaded, and activated for all bindings as one controlled change. Failure leaves all consumers on the last good version. A time-bounded migration mismatch is explicit and audited; silent Alert-versus-Health version drift is invalid.

When Condition State changes, Alert Engine maps it through Alert Rule Condition Binding and Health Engine incrementally recalculates affected objects through Health Policy Condition Binding. `FALSE` enters the Alert recovery path and health recomputation; `UNKNOWN` does not recover an Alert and may make Health Status unknown. Neither consumer re-runs the shared MetricsQL expression.

Current Condition Evaluations and Current Health are precomputed. PostgreSQL retains business-authoritative current results and history required for audit, while VictoriaMetrics retains raw and suitable derived time series. Redis is not a third authoritative condition store.

## Health model

Health is expressed through three independent dimensions:

| Dimension | Values | Meaning |
| --- | --- | --- |
| Health Status | `HEALTHY`, `DEGRADED`, `CRITICAL`, `UNKNOWN` | Authoritative health fact |
| Operational Mode | `ACTIVE`, `MAINTENANCE`, `DISABLED`, `RETIRED` | Whether and how the object participates in current operations and monitoring |
| Data Quality | `FRESH`, `PARTIAL`, `STALE`, `SOURCE_UNAVAILABLE`, `CONFLICTING`, `NOT_CONFIGURED` | Reliability and completeness of the evidence |

`MAINTENANCE` is not a Health Status. An object may simultaneously be `CRITICAL`, `MAINTENANCE`, and `FRESH`; maintenance policy may suppress notification or automatic Incident declaration but preserves collection, health calculation, Alerts, and the underlying failure fact.

`DISABLED` means monitoring is intentionally stopped and is not disguised as `HEALTHY` or `UNKNOWN`. `RETIRED` removes the object from current health denominators and topology while retaining its history.

### Health Status and Data Quality

`HEALTHY` requires fresh enough mandatory inputs, satisfied critical conditions, no degraded or critical rule, and policy-required coverage. `DEGRADED` means the object remains usable with a confirmed performance, redundancy, or quality reduction. `CRITICAL` means a confirmed major failure, loss of core capability, exhaustion of redundancy, or major business impact.

`UNKNOWN` means the platform cannot make a reliable conclusion because evidence is stale, unavailable, missing, conflicting, not configured, newly uncollected, or hidden behind an upstream failure. `UNKNOWN` is neither healthy nor failed, never means Alert recovery, and is not represented by score 0.

Critical stale or unavailable input forces Health Status to `UNKNOWN` with the corresponding Data Quality. A policy may still conclude `HEALTHY` or `DEGRADED` with `PARTIAL` non-critical evidence only when it explicitly defines a sufficient minimum input set.

### Current Health and reasons

Current Health includes object identity and type, Health Status, nullable Health Score, Operational Mode, Data Quality, Coverage Ratio, primary and secondary Health Reasons, Health Policy and version, calculation time, input window, and validity end.

A Health Reason contains code, reason severity, source, related metric or evidence, current value, threshold or condition, first occurrence, latest confirmation, primary marker, and user-readable explanation. Initial reason vocabulary includes device unreachable, interface down, probe failure, high utilization, packet loss, latency, error rate, redundancy loss, stale data, source unavailable, upstream unreachable, input conflict, and monitoring not configured. `MAINTENANCE_ACTIVE` may be an auxiliary context reason but does not determine the underlying Health Status.

### Health Score

Health Score is nullable and ranges from 0 to 100. Score 0 means confirmed complete unavailability; `null` means reliable scoring is impossible. An `UNKNOWN` result caused by insufficient evidence has `healthScore = null` and is excluded from numeric ranking unless a view explicitly groups unknown objects separately.

The display interpretation is 90–100 good, 75–89 minor degradation, 50–74 material degradation, 1–49 severe abnormality, 0 confirmed complete unavailability, and `null` unknown. These bands support explanation and comparison only. Health Status is produced by explicit policy rules, not by mapping score bands back into state.

Health Score Breakdown records total score, component scores, weights, deductions, Coverage Ratio, policy version, and calculation time. A score without its breakdown is not a valid MVP health result.

### Health policies

Health Policy is specialized by object type. MVP policies include Device, Interface, Circuit, Site, Business Service, and Collector concepts, while implementation scope initially requires device, interface, circuit, and site policies plus the inputs needed by dashboard business aggregation.

- Device policy may use Condition Evaluations for reachability, SNMP freshness, CPU, memory, temperature, power, fans, core interfaces, and restart.
- Interface policy may use administrative and operational state, utilization, errors, discards, flap count, optical power, peer state, and freshness.
- Circuit policy may use both endpoint states, probes, delay, loss, jitter, utilization, errors, redundancy, and carrier maintenance.
- Site policy may use Current Health of approved dependencies, business-probe Condition Evaluations, online proportion, topology importance, and Coverage Ratio.
- Business Service policy follows approved dependencies and impact evidence.
- Collector policy uses heartbeat, task execution, backlog, write success, and source freshness.

Health Policy and immutable Health Policy Version define required Condition Bindings, evidence sufficiency, mappings from Condition State to `CRITICAL`, `DEGRADED`, `HEALTHY`, or `UNKNOWN`, scoring effects, aggregation rules, coverage, and health-specific transition behavior. Shared predicates, thresholds, freshness, and time windows remain owned by Condition Versions. Health Policy Assignment binds a versioned policy to eligible objects. Policy changes are audited and affect only new calculations; historical results retain their original version.

### State selection and aggregation

For an active object, evaluation proceeds in this order:

1. Determine whether Operational Mode is `DISABLED` or `RETIRED` and apply participation rules.
2. Verify minimum coverage and mandatory evidence.
3. Detect source unavailability, critical staleness, or unresolved conflict.
4. Apply explicit `CRITICAL` conditions.
5. Apply explicit `DEGRADED` conditions.
6. Confirm explicit `HEALTHY` conditions.
7. Otherwise return `UNKNOWN`.

`MAINTENANCE` remains an overlay outside this sequence. Confirmed critical rules take precedence over degraded and healthy rules, but insufficient critical evidence can make the result `UNKNOWN` rather than falsely healthy or critical.

Aggregate health never uses an unqualified arithmetic mean. Policies can combine `CRITICAL_DEPENDENCY`, `WEIGHTED_COMPONENT`, `QUORUM`, `REDUNDANCY_GROUP`, and `PERCENTAGE_THRESHOLD` semantics. Weighted components may influence score but cannot override a hard critical dependency. For example, loss of one redundant member may degrade while loss of all members is critical; one critical core device cannot be averaged away by many healthy access devices.

Every aggregate calculates Coverage Ratio as reliable child weight divided by expected participating child weight and retains evaluated, unknown, stale, unavailable, and total counts. Below the policy minimum, Health Status is `UNKNOWN` and Health Score is `null`.

Confirmed Healthy Ratio uses healthy weight divided by all `ACTIVE` participating weight, including unknown objects in the denominator. Health Data Coverage uses reliable-state weight over the same population. Maintenance objects are reported separately and never mixed into `HEALTHY`; the exact inclusion rule is consistent across API, dashboard, and reports.

### Freshness, recovery, and hysteresis

Freshness Policy provides expected interval, grace period, stale threshold, and unavailable threshold to shared freshness Condition Definitions. Health Policy binds their Condition Evaluations as mandatory or optional inputs rather than recalculating source age. Interface state, performance counters, inventory, LLDP, probes, Traps, and Collector heartbeat can therefore retain distinct validity semantics without duplication.

Recovery from `UNKNOWN` requires restored source health, enough fresh evidence, any configured confirmation window, and a new policy calculation. The result may be `HEALTHY`, `DEGRADED`, or `CRITICAL`; one normal sample never forces `UNKNOWN` directly to `HEALTHY`.

Shared condition hysteresis and time windows live in Condition Definition. A Health Policy may define a separate health-transition confirmation only when it has a distinct, named business meaning and does not re-execute the condition. Alert promotion and notification delays are likewise separate from shared condition time.

### Propagation, history, and correction

When an upstream failure prevents observation of downstream objects, the upstream can be `CRITICAL` while affected downstream objects are `UNKNOWN` with reason `UPSTREAM_UNREACHABLE`. Impact analysis may show them as affected without claiming independent downstream failures.

Health Transition appends previous and next state, reason, time, policy version, Data Quality, Coverage Ratio, and primary evidence. Health Snapshot stores state-change and scheduled aggregate history for reporting and Incident impact; raw metric history remains in VictoriaMetrics.

An authorized correction is explicit, time-bounded, and audited with old state, corrected state, reason, actor, validity, and related Incident. It does not silently rewrite prior Health Transitions.

Health Status and Alert Instance are sibling outcomes of Condition Evaluation. Health Engine does not read Alert Instance acknowledgement, delivery, suppression, Incident association, or severity as technical evidence; Alert Engine does not read Health Status to reproduce a condition. A Condition change independently drives both consumers, and no unaudited manual action may force an object to `HEALTHY`.

## Alert and Incident model

Alert and Incident are separate domain layers. An Alert records a technical condition detected by monitoring; an Incident records the human coordination and operational handling of an impact. Neither lifecycle owns or rewrites the other.

### Alert Rule and Fingerprint

An Alert Rule has immutable `ruleId` and one or more Alert Rule Condition Bindings. It does not own a duplicate metric expression, shared threshold, condition window, freshness predicate, or direct-fact comparison.

The current Alert Rule definition contains name, bound Condition Definitions and target scope, Alert Severity, `alertPromotionDelay`, stable labels, display annotations, automatic Incident eligibility, Notification Policy, episode mapping, enabled state, current version, creator, modifier, publication time, and deployment state. PostgreSQL is its authoritative source.

Each change creates an immutable Alert Rule Version. Alert Rule Deployment records validation, activation, result, and rollback of the Alert behavior and its Condition Bindings. Metric Condition deployment is recorded separately against Condition Version and Condition Execution Binding.

Every Alert Instance preserves `conditionId`, `conditionVersion`, `ruleId`, `ruleVersion`, trigger-time Alert Severity, and relevant binding parameters. Later Condition or Alert Rule Versions never rewrite historical Alert semantics.

An Alert Fingerprint identifies one logical alert condition. It is derived from `ruleId`, bound `conditionId`, formal target type and ID, and a finite stable dimension set such as `interfaceId`, line identity, or probe-task identity. Current values, timestamps, request IDs, complete error text, random event IDs, and dynamic descriptions never participate in the Fingerprint.

The same Fingerprint can have many Alert Instances over time.

### Rule execution boundary

Metric Condition Definitions are evaluated by `vmalert` against VictoriaMetrics. The platform receives real-time Condition Evaluations and reconciles executor state for completeness. `vmalert` owns the metric predicate's `conditionFor`, `conditionRecoveryFor`, and time-series calculation exactly as compiled from the authoritative Condition Version; it does not own Alert Rule behavior or Alert Instance lifecycle.

Direct Fact Condition Definitions are evaluated from Normalized Facts by the platform condition boundary. Trap and platform facts can therefore drive shared conditions that both Alert and Health consume without either consumer parsing the source independently.

Active-probe results are metric facts and normally feed Metric Condition Definitions. Probe scheduler or executor failures become Normalized Facts for Direct Fact Conditions and may drive independent platform Alerts.

Alert Engine consumes Condition Evaluations and maps `TRUE`, `FALSE`, and `UNKNOWN` through Alert Rule Condition Binding. It does not query MetricsQL, recalculate shared windows, parse raw observations, or infer the condition from Health Status.

### Fingerprint, episode identity, and delivery order

Alert Fingerprint excludes the Alert Rule Version and `startsAt` by default so a compatible rule edit does not automatically redefine the logical condition. Its exact stable dimensions are canonicalized and versioned.

Alert Episode Identity distinguishes one continuous occurrence using source type, `ruleId`, canonical stable dimensions, and `startsAt`. Repeated delivery for that identity is idempotent; it cannot create duplicate Alert Instances or transitions. A later `startsAt` under the same Fingerprint creates a new Alert Instance.

Evaluation arrival order is not truth order. An older Firing evaluation cannot reopen a resolved episode, duplicate Firing or Resolved evaluations do not append duplicate transitions, and an unmatched Resolved evaluation is retained for reconciliation rather than discarded. Ambiguous episode association is marked `AMBIGUOUS` until resolved with audited evidence.

### Condition reconciliation

Condition Reconciler compares loaded Condition Versions and health, VictoriaMetrics-backed evaluator state, current Condition Evaluations, bound open metric Alert Instances, last successful push, and last successful reconciliation. It runs periodically, at platform startup, after Condition publication, and immediately after recovery of the evaluator or ingest path.

Reconciliation can recover missed Condition State, observe condition timing, identify disappeared executor state, and repair duplicate-delivery drift. It only appends reasoned evaluation or correction records; it never deletes or rewrites Condition, Alert, or Health history.

For Metric Conditions, `vmalert` owns shared `conditionFor` and `conditionRecoveryFor` semantics. Alert Pending or promotion is a separate mapping after Condition State becomes `TRUE`. A condition that never becomes true may remain a current or lightweight evaluation record and need not create an Alert Instance.

Silence from `vmalert` is not `FALSE` evidence. Evaluation error, stale metrics, source unavailability, ingest failure, or reconciliation failure produces Condition State `UNKNOWN` with execution and source context. Alert recovery requires a verifiable `FALSE` evaluation, healthy reconciliation proving false, or an authorized audited repair.

### Alert Instance and transitions

An Alert Instance is one continuous abnormal episode. It records at least `conditionFirstObservedAt`, `pendingAt`, `firedAt`, `acknowledgedAt`, `resolvedAt`, and `lastEvaluatedAt` when applicable. After an instance reaches `RESOLVED`, a later occurrence under the same Fingerprint creates a new Alert Instance rather than reopening or overwriting the resolved episode.

Alert State Transition is append-only and retains `alertInstanceId`, previous and next detection state, occurrence time, reason, Condition and Alert Rule versions, observed value, threshold summary, data source, Collector Node, automatic or human actor, and request or event correlation. A current-state projection may be maintained for efficient reading, but it never replaces transition history.

Alert state is represented through independent facets rather than one overloaded enum:

- Detection lifecycle: `PENDING`, `FIRING`, or `RESOLVED`
- Acknowledgement: unacknowledged or acknowledged, with actor, time, and note
- Notification: pending, delivered, failed, rate-limited, or suppressed
- Suppression: none, upstream root cause, Maintenance Window, or manual Silence
- Data state: valid, stale, Collector unavailable, or indeterminate

Acknowledgement and suppression do not resolve an Alert Instance. A maintenance or upstream condition may suppress notification while the detection and evidence continue to be recorded.

### Incident

An Incident has immutable `incidentId` and contains title, summary, state, Incident Severity, Incident Priority, current owner, impact, suspected and confirmed cause, mitigation, creation source and actor, last updater, and audit metadata. Its operational clocks retain `detectedAt`, `declaredAt`, `assignedAt`, `acknowledgedAt`, `mitigationStartedAt`, `impactEndedAt`, `resolvedAt`, and `closedAt` when applicable; they are not inferred from one repeatedly overwritten `updatedAt`.

Its lifecycle is `DECLARED`, `INVESTIGATING`, `MITIGATING`, `MONITORING`, `RESOLVED`, `CLOSED`, or `CANCELED`. `RESOLVED` means technical impact has ended; `CLOSED` means the operational record, ownership, impact, response summary, and required follow-up are complete. Resolving every linked Alert Instance does not automatically close the Incident.

An Incident may be declared manually from one or more Alert Instances, Health Impact, an asset, line, path, topology evidence, or an operator observation without an Alert. Limited deterministic rules may consume Alert, Health Impact, Condition, and topology results to declare configured critical events, but ordinary firing alerts do not each create an Incident and Incident state never feeds back into the originating Condition or Health calculation.

### Incident Alert Link

Incident Alert Link is an independent, historical association containing `incidentId`, `alertInstanceId`, role, association time and source, actor, current-validity flag, removal time, and reason. Roles include `ROOT_CAUSE_CANDIDATE`, `CONFIRMED_ROOT_CAUSE`, `SYMPTOM`, `IMPACT`, and `RELATED`.

One Incident may link many Alert Instances. The model permits historical links from one Alert Instance to multiple Incidents, while the MVP permits at most one primary open Incident at a time; a simultaneous secondary link requires an explicit role and audited reason. Removing a link preserves its history and never deletes the Alert Instance.

### Incident history, cause, and impact

Incident Timeline is append-only and records creation, state, severity, priority, owner, Alert association, cause, impact, response notes, mitigation, recovery, closure, reopening, notification, and external-reference changes. Corrections append a new record and preserve the superseded entry.

Root cause is recorded separately as unknown, suspected, confirmed, or excluded and may reference a device, interface, line, Collector Node, platform component, configuration change, Alert Instance, carrier, or other external cause. Impact records affected sites, devices, lines, businesses, times, level, and human-readable summary as a historical snapshot or version reference rather than recalculating only from current topology.

Closing requires confirmed current impact state, review of linked alerts, closing summary, final impact, primary response actions, closing actor, and closing time. High-severity Incidents additionally retain root-cause status, follow-up actions, unresolved risk, owner, and `postmortemRequired`, `postmortemStatus`, and `postmortemReference` where applicable.

Reopening appends the time, actor, previous state, reason, newly linked alerts, and reopen count. A distant recurrence normally creates a new Incident with a recurrence or `relatedIncidentId` relation instead of reopening one record indefinitely.

### Severity, priority, correlation, and suppression

Alert Severity, Incident Severity, and Incident Priority are independent. Alert and Incident severities use `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, and `INFORMATIONAL`; Incident Priority uses `P1`, `P2`, `P3`, and `P4`. An Incident may receive an initial severity suggestion from its alerts and impact, but an authorized change records reason, old and new values, actor, and time without modifying Alert Severity.

Automatic correlation is limited to explainable deterministic rules based on formal asset or line identity, site, business, topology direction, bounded time window, labels, or configured correlation conditions. Every automatic link records rule ID and version, matched evidence, time, confidence type, and confirmation state.

An upstream root alert can classify downstream alerts as symptoms or impacts, suppress repeated delivery, and group them into one Incident. It never deletes or resolves downstream Alert Instances. Downstream detection instead reflects actual evidence, including `UNREACHABLE`, `UNKNOWN`, or `STALE` when appropriate.

A Maintenance Window may suppress delivery while Conditions continue evaluating and Alert Instances continue forming or changing. Its policy decides automatic Incident declaration, and every suppression records the window and reason. An abnormal condition still present after maintenance remains abnormal. An operator may declare a planned Incident or maintenance record for high-risk work, but the MVP does not require a complete change-management module.

### Notification and authority

Notification Delivery is separate from Alert and Incident. It records the related object, target, channel, attempt time, outcome, retries, response summary, and rate-limit or suppression reason. Failure never blocks Alert persistence, Incident declaration, or lifecycle changes.

PostgreSQL-backed platform state is authoritative for Condition Definitions and required current evaluations, Alert Instances, Alert State Transitions, acknowledgement, Incidents, Incident Alert Links, Incident Timeline, ownership, response, and audit. VictoriaMetrics is authoritative for metric facts, not human operational history. `vmalert` or a notification component may evaluate, group, route, or deliver within its boundary but cannot be the only store for these records.

Alert Rules may be disabled or archived. Alert Instances, transitions, Incidents, links, and timeline entries are not ordinarily physically deleted; incorrect Incidents become `CANCELED`, incorrect links are ended with history, and corrections are audited. Alert and Incident operational history is retained for at least one year and remains queryable after related assets or rules are archived.

Display-only Alert Rule changes do not close an active episode. A severity or Alert binding change creates a new Alert Rule Version and preserves trigger-time behavior. Expression, threshold, shared target dimensions, or shared time changes create a Condition Version: deployment records the version switch, reconciliation assesses old state, old execution may end with `CONDITION_REPLACED`, and a newly true Condition creates an episode only through the active Alert binding. Disabling an Alert Rule stops new Alert promotion without disabling a Condition still used by Health; all active and historical episodes remain classified and queryable.

## Reliable work and runtime model

The NestJS application has two runtime roles built from one modular codebase: HTTP API Process and Platform Worker. They share domain and application services, database access, and internal protocols but run as independent processes and containers.

HTTP API Process authenticates and authorizes commands, validates input, establishes audit context, writes authoritative business state, serves queries, and manages allowed SSE connections. It never performs long Condition evaluation, full Health recalculation, periodic reconciliation, bulk Alert handling, blocking notification delivery, long topology discovery, or another persistent background loop within a user request.

Platform Worker runs Direct Fact Condition evaluation, Metric Condition consumption, Health and asynchronous Alert processing, Condition reconciliation, consistency verification, Outbox delivery, Notification Delivery work, expiry, cleanup, and other scheduled work. One MVP worker process may host these modules, but their handlers and application boundaries remain independently composable.

### Inbox and Outbox

Inbox Message receives retriable internal inputs such as Go Observation batches, Metric Condition Evaluations, Trap events, and future internal messages. It has a stable source and idempotency key. Applying one message and marking it complete occur in the same transaction.

Duplicate Inbox delivery cannot duplicate Observation, Condition Transition, Alert Episode, Health Transition, Incident Timeline, or Notification Delivery. Idempotency keys, immutable business identities, and database uniqueness are the final concurrency boundary rather than process memory.

Outbox Message records an asynchronous intent in the same PostgreSQL transaction as the authoritative business change that requires it. A command either commits both state and Outbox intent or neither. Worker delivery may repeat, so every downstream handler and external side effect uses a stable idempotency key.

### Background Job, attempt, and lease

Background Job has immutable job identity, type, payload reference, priority, availability time, attempt count, lease owner and expiry, start and completion times, failure category, and safe last-error summary. Payload references avoid copying secrets or unbounded data into queue rows.

Job Attempt appends each execution start, completion, outcome, duration, and classified failure. Worker Lease is finite and renewable. A crash, forced stop, host restart, or lost database connection eventually expires the claim so the same or another worker can retry; a permanent `processing` flag is not valid state.

Workers claim ready jobs in short transactions using row locking and, when appropriate, `SKIP LOCKED`. These queue locks are not ordinary business-read locks. Long jobs renew their lease, record progress, support safe retry, and stop accepting new work during graceful shutdown.

### Delivery and failure semantics

Background work uses At-least-once Work with idempotent consumers and does not claim exactly-once execution. Repeated work cannot append duplicate state transitions or Notification Deliveries, and database uniqueness protects logical identities under concurrent execution.

Failures are classified as transient database, temporarily unavailable dependency, timeout, invalid data, unresolved identity, version mismatch, permanent business error, or unknown failure. Retry policy defines maximum attempts, exponential backoff, random jitter, and retryable categories.

Work that exhausts or cannot use retry creates a Dead Letter Record. It is queryable, audited, manually retryable under authorization, explains the safe failure reason, excludes plaintext secrets, and produces a Platform Alert.

### Transaction and coordination invariants

An API command that requires background work writes business state and its Outbox Message in one transaction before returning acceptance. A consumer transaction checks Inbox or idempotency identity, applies state changes, writes any follow-on Outbox Messages, marks the input complete, and commits atomically.

Advisory locks are limited to a small set of singleton coordination activities such as full Health consistency verification, complete Condition reconciliation, cleanup, rule publication, or one database-maintenance action. Per-device, per-interface, per-metric, per-evaluation, and per-Session advisory locks are prohibited.

Job priority protects authentication and security, core device and line state, Alert, Health, ordinary observations, discovery, inventory, reports, and cleanup in that order while quota or aging prevents permanent starvation.

Concurrency uses database uniqueness, optimistic versions, row locks, finite leases, Inbox idempotency, Alert Episode and Condition Transition identities, Authorization Version, and narrowly scoped advisory locks. Process-local mutexes cannot be the sole guarantee across API and Worker processes.

## Access-control model

### Platform User and credentials

Each Platform User has an immutable `userId`. Business records, alert acknowledgements, audit records, and operational actions reference `userId`, never username, email address, LDAP DN, or an external display name.

A Platform User may have one Local Credential in the MVP. Local Credential lifecycle, password state, and authentication failures remain separate from the Platform User's business identity. Disabling a user immediately prevents access and revokes active Sessions; password reset or password change also revokes existing Sessions.

External Identity is a defined extension concept but does not require a complete MVP implementation. A future external subject binds to the existing `userId`, so external username changes or identity-provider outages do not create a new business identity or break historical attribution.

Historical references to a Platform User are retained after disablement or administrative deletion. User lifecycle actions never erase the actor identity from business or audit history.

### Roles and permissions

Authorization is default-deny and permission-based. Role names are default templates, not business-code conditions.

The MVP defines these templates:

- **System Administrator**: system settings, user and role administration, credential policy, Collector and deployment settings, Session revocation, and full audit access.
- **Network Administrator**: inventory, interfaces, lines, SNMP and active-probe settings, credentials, topology confirmation, device-identity conflicts, network alert rules, and network observations; it cannot manage System Administrators, export plaintext secrets, or change authentication-security policy by default.
- **Operator**: read inventory, topology, and observations; view and acknowledge alerts; maintain incident response notes; and run an explicitly permitted reprobe; it cannot manage users, credentials, formal topology, or asset deletion.
- **Auditor**: read audit, configuration-change, identity-confirmation, alert-handling, login, backup, and recovery records without state-changing permissions.
- **Executive Viewer**: read executive dashboards, aggregate health, link availability, major incidents, SLA, and trends without credentials, raw security configuration, user administration, topology editing, or low-level sensitive device detail.

Stable MVP Permission identifiers include:

- `users.read`, `users.manage`, `roles.manage`, `sessions.revoke`
- `assets.read`, `assets.manage`, `credentials.manage`
- `topology.read`, `topology.manage`, `topology.confirm`
- `observations.read`, `observations.reprobe`
- `alerts.read`, `alerts.acknowledge`, `alerts.configure`
- `incidents.manage`, `audit.read`, `dashboard.executive.read`, `system.configure`
- `authentication.manage`, `sessions.manage`, `backup.manage`, `restore.execute`

Every protected backend operation declares a Permission explicitly. Frontend visibility may improve usability but is never authorization. Permission denial is security-audited without recording secrets.

The MVP excludes attribute-based access control and per-device authorization.

### Session

A Session is an immutable server-side security record in PostgreSQL. Its conceptual fields are:

- `sessionId`: internal immutable identity
- `tokenHash`: lookup hash of the opaque Session Token
- `userId`
- `sessionType`: preauthentication or authenticated
- `createdAt`, `lastUserActivityAt`, `idleExpiresAt`, `absoluteExpiresAt`
- `revokedAt` and `revocationReason`
- `authorizationVersion`
- `authenticationStrength`, `passwordVerifiedAt`, and `mfaVerifiedAt`
- `sourceIp`, `userAgentSummary`, and `requestCorrelationId`

`sessionId` and `tokenHash` are distinct. The raw Session Token is never persisted or audited. Source IP and User-Agent are audit and risk signals, not strict identity bindings.

A Pre-authentication Session lasts at most 5 minutes without activity extension and can access only explicitly allowed MFA verification, enrollment, recovery, and cancellation capabilities. Successful MFA revokes it and creates an Authenticated Session with a new Session Token.

An Authenticated Session has a 30-minute idle timeout and 12-hour absolute lifetime. Server-side time controls both limits. Only explicit User Activity may advance idle expiry; SSE heartbeats, WebSocket Ping/Pong, automatic refresh, topology updates, metric polling, passive open pages, and health checks do not.

### Session Token and Cookie

The Session Token contains at least 256 bits of CSPRNG output and no `userId`, username, timestamp, Role, Permission, or other business data. PostgreSQL stores only `SHA-256(rawSessionToken)` or a security-reviewed equivalent fixed-length digest.

Interactive Web Sessions use host-only, HTTPS-only, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` Cookies with explicit expiry. Preauthentication and authenticated Sessions use separate Cookie names. The MVP has no remember-me Session, browser access JWT, `localStorage` authentication token, multi-domain Cookie, or cross-site management-console mode.

### Authorization Version

Each Platform User has an `authorizationVersion`; an Authenticated Session captures the current value when created. Role assignment or removal, direct Permission change, Role Permission change, user disablement, or gaining or losing a Sensitive Permission increments the user's value.

Every protected request compares Session and Platform User Authorization Versions. A mismatch denies the request, revokes the Session, and requires reauthentication; a new Sensitive Permission may additionally require MFA enrollment or verification. Existing Sessions never acquire new authority through frontend refresh.

### Session rotation and revocation

A new Session Token replaces the old one after password verification, MFA completion, password change/reset, TOTP enrollment/reset/unbinding, Sensitive Permission grant, break-glass recovery, or suspected fixation or hijacking.

Logout, expiry, or explicit termination revokes the current Session. User disablement, password reset, confirmed password exposure, TOTP reset, break-glass recovery, administrator logout-all, or another account-security event revokes all Sessions for that Platform User. Permission changes invalidate every mismatched Authorization Version.

Platform Users may inspect their active Sessions and revoke the current, another, or every other Session. A holder of `sessions.manage` may revoke another user's Sessions but cannot see raw Session Tokens.

### Long connections and disaster recovery

SSE and any future WebSocket connection revalidate Session state at establishment and cannot outlive revocation, idle expiry, absolute expiry, or Authorization Version changes. Heartbeats do not count as User Activity. SSE is preferred in the MVP when reliable WebSocket revalidation would add unnecessary complexity.

Restored historical Sessions never become valid again. Disaster recovery invalidates all Pre-authentication and Authenticated Sessions and requires every user, including Emergency Administrator, to authenticate again.

### Session audit

Audit covers creation, MFA transition, rotation, logout, idle and absolute expiry, user or administrator revocation, Authorization Version mismatch, user-disablement revocation, password or MFA revocation, disaster-recovery invalidation, and suspicious use.

Raw Session Tokens, Cookie request headers, CSRF tokens, TOTP codes, passwords, and Recovery Codes are prohibited from audit and logs.

### Emergency Administrator

At least one Emergency Administrator remains independent of ordinary user synchronization and future external identity availability. Its credential is strongly initialized, separately controlled, rotated, and never stored in Git, images, Compose files, or ordinary logs.

Emergency access is not a daily account. Every use produces a high-priority Authentication Event and requires an audited reason. Recovery procedures preserve and rotate this access path.

### Authentication Event

Audited events include successful and failed login, logout, password change and reset, user create/enable/disable/delete, Role assignment and removal, Permission-template change, Session revocation, Emergency Administrator use, and future External Identity bind or unbind.

Each event retains an event ID, subject `userId` when known, actor `userId` when applicable, event type, time, source address, result, failure category, related object, and request correlation ID. It never retains plaintext passwords, password hashes, Session cookies, complete access tokens, SNMP secrets, database passwords, or private keys.

### Permission-level MFA policy

MFA is required by the user's effective Sensitive Permissions, not by Role name. The initial Sensitive Permission set is:

- `users.manage`
- `roles.manage`
- `credentials.manage`
- `system.configure`
- `authentication.manage`
- `sessions.manage`
- `backup.manage`
- `restore.execute`

The policy can classify future Permissions as sensitive without changing Role logic. System Administrators, Network Administrators with credential access, custom Roles with sensitive capabilities, and Emergency Administrators require TOTP because of their Permission sets. Other users may enroll voluntarily.

Granting a Sensitive Permission does not make it available to existing Sessions. The Platform User enters `MFA_ENROLLMENT_REQUIRED`, reauthenticates, enrolls and verifies TOTP, and only then receives the sensitive capability in a new Session. Grant and enrollment are separately audited.

Removing all Sensitive Permissions does not delete an existing TOTP Authenticator. Unbinding requires a controlled recovery or replacement flow.

### MFA concepts

- **TOTP Authenticator** retains encrypted secret material, lifecycle state, creation and verification times, key version, and replay-protection state.
- **TOTP Enrollment** holds a not-yet-active secret until the Platform User proves possession with a valid code.
- **Recovery Code Set** contains only slow hashes, consumption state, generation time, and remaining count; regenerating it invalidates the prior set.
- **MFA Challenge** is a short-lived, low-privilege preauthentication state that can perform only MFA verification, recovery, or login cancellation.
- **MFA Recovery Event** records administrator reset, recovery-code use, authenticator replacement, unbinding, or host-console break-glass recovery.

TOTP follows RFC 6238 with a 30-second step and 6-digit code. Each Platform User has an independently generated secret. Validation normally uses the current step and may allow no more than one adjacent step in either direction; a successfully consumed code for a user and step cannot be accepted again.

### MFA login and step-up

Password success for an MFA-required user creates only an MFA Challenge. It has a short lifetime, strict attempt limit, and no access to inventory, topology, alerts, or other business APIs.

Successful TOTP verification creates a full Session with `mfaVerifiedAt` and authentication strength after rotating Session identity. Password-stage and MFA-stage outcomes are audited without revealing which factor or account property was valid.

Sensitive actions require recent MFA verification or password-plus-TOTP reauthentication. The default recent-authentication window is 10 minutes and remains configurable.

### Recovery and unbinding

TOTP enrollment creates 10 single-use Recovery Codes by default. Plain values appear once; only slow hashes persist. Use consumes a code immediately, creates a high-priority Authentication Event, and requires TOTP reenrollment. Regeneration invalidates every prior code.

Administrator reset requires a distinct Permission, recent MFA by the operator when resetting another administrator, an explicit reason, authenticator revocation, revocation of all target Sessions, and transition to `MFA_ENROLLMENT_REQUIRED`. Password reset never bypasses MFA.

A Platform User with Sensitive Permissions cannot simply disable TOTP. The operation must first remove all Sensitive Permissions, replace the authenticator in the same controlled action, or move the user into mandatory reenrollment through break-glass recovery.

Emergency Administrator also requires TOTP. Its offline recovery material is separately controlled, every use is high-priority audited, and use requires subsequent password and, when appropriate, authenticator and Recovery Code rotation.

An extreme host-console recovery action may revoke an authenticator and place the user in mandatory reenrollment. It never reveals the old secret, revokes all Sessions, requires operating-system authorization, and records both database audit and an independent host security event.

### MFA audit and rate limiting

Audit covers enrollment start/success/failure, verification success/failure, secret regeneration, Recovery Code generation/use/regeneration, reset, unbinding, administrator reset, host-console recovery, Sensitive Permission enrollment requirement, refusal of sensitive access, and time-synchronization failure.

TOTP validation has user-and-source rate limits independent of password throttling. Password success does not clear TOTP failures; repeated failures add delay and temporary blocking without permanent lockout. Successful verification clears failure state according to policy.

No event contains a TOTP secret, QR payload, current code, plaintext Recovery Code, encryption key, or complete Session token.

## MVP boundary

The MVP includes immutable device, interface, user, Condition, Alert, and Incident identities; Normalized Facts; versioned three-valued shared Condition Evaluation; parallel Alert and Health consumers; versioned object Health Policies; controlled asset-number matching; SNMP interface candidates; identity conflicts; candidate review; manual hardware replacement; separate Alert episodes and Incident handling; deterministic correlation; append-only operational history; local Platform Users; permission-based RBAC; PostgreSQL-backed opaque Sessions; permission-level TOTP; Recovery Codes; controlled MFA reset; an MFA-protected Emergency Administrator; independent HTTP API and Platform Worker processes from one modular codebase; PostgreSQL Inbox, Transactional Outbox, Background Jobs, Job Attempts, finite Worker Leases, and Dead Letter Records; at-least-once delivery with idempotent consumers; and audited identity and work operations. Its model supports stacks, future External Identity binding, additional Worker processes, and future distributed messaging without requiring those future integrations.

The MVP excludes duplicate MetricsQL or thresholds in Alert and Health, cyclic Condition dependencies, arbitrary Condition scripts, Redis as authoritative Condition state, public HTTP control of the Platform Worker, exactly-once execution claims, Redis Queue, BullMQ, NATS, Kafka, RabbitMQ, NestJS Microservices Transport, Temporal or another workflow engine, machine-learning identity or root-cause inference, unexplained automated Incident merging, unattended complex asset merging, automated identity coordination across multiple CMDBs, automatic correction of asset data, complete vendor-specific stack discovery, a complete ITSM or on-call collaboration suite, bidirectional work-order synchronization, external identity providers, directory synchronization, attribute-based access control, per-device authorization, SMS or email second factors, Push MFA, WebAuthn/FIDO2, hardware keys, biometric authentication, multiple simultaneous TOTP authenticators, risk-adaptive authentication, browser access JWTs, Redis-backed Sessions, remember-me Sessions, and cross-domain management-console Sessions.
