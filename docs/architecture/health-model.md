# Health and aggregation architecture

Status: Decided

## Decision boundary

Health uses three orthogonal dimensions:

- **Health Status** is the authoritative fact used by topology, impact analysis, dashboards, and management reports. Alert Engine remains a sibling Condition consumer and does not derive Alert state from Health Status.
- **Operational Mode** states whether an object is active, under maintenance, disabled, or retired.
- **Data Quality** states whether the evidence is fresh, partial, stale, unavailable, conflicting, or not configured.

Health Score is a nullable, explainable derivative for ranking, trends, and peer comparison. It cannot override Health Status.

## Condition input boundary

Health Engine consumes versioned Condition Evaluations, selected simple Normalized Facts, topology dependencies, Operational Mode, and Health Policy. It does not consume Alert Instance state and does not parse SNMP, Trap, or raw protocol payloads, query metric windows, or reimplement shared thresholds.

```text
Raw Observation
      -> Normalized Fact or Metric
      -> Condition Evaluation
           -> Alert Engine -> Alert Instance
           -> Health Engine -> Current Health
```

Metric Condition Definitions uniquely own MetricsQL, threshold, window, hysteresis, aggregation, baseline, freshness prerequisite, label selection, and result dimensions for time-series predicates. `vmalert` executes them. Direct Fact Condition Definitions consume Normalized Facts such as interface state, Collector availability, and freshness.

Health Policy Condition Binding maps `TRUE`, `FALSE`, or `UNKNOWN` from a specific Condition Version to Health Status impact, score deduction, Health Reason, dependency role, and coverage behavior. Health Policy never uses acknowledgement, notification, suppression, Incident closure, or manually adjusted Alert severity as technical evidence.

This permits a truthful result such as:

```text
healthStatus = CRITICAL
operationalMode = MAINTENANCE
dataQuality = FRESH
notificationStatus = SUPPRESSED
```

Maintenance changes handling and presentation, not the underlying fact.

## Health Status

The only authoritative values are:

- `HEALTHY`: mandatory evidence is valid, policy coverage is sufficient, critical conditions pass, and no degraded or critical condition applies.
- `DEGRADED`: the object remains usable with a confirmed performance, quality, or redundancy impairment.
- `CRITICAL`: a confirmed severe failure, loss of core capability, exhausted redundancy, or major business impact exists.
- `UNKNOWN`: the platform cannot make a reliable conclusion from the available evidence.

Typical unknown causes include stale metrics, Collector or data-source outage, rule-execution failure, prolonged unconfirmed reachability loss, incomplete policy, missing critical input, conflicting evidence, upstream isolation, or an object awaiting first collection.

`UNKNOWN` is not healthy, degraded, critical, recovered, or numeric zero.

## Operational Mode

Operational Mode is independently one of:

- `ACTIVE`: participates in current monitoring and health statistics.
- `MAINTENANCE`: continues collection and health calculation while maintenance policy controls delivery and automatic Incident declaration.
- `DISABLED`: intentionally excluded from active monitoring without being labeled healthy or unknown.
- `RETIRED`: archived and excluded from current topology and health denominators while history remains available.

During maintenance the platform continues collection, evaluation, Health Transitions, Alert Instances, and evidence retention. Maintenance-end processing immediately reevaluates current facts and never assumes recovery.

## Data Quality

Data Quality is independently one of:

- `FRESH`: every mandatory health input is within its validity window.
- `PARTIAL`: a non-critical subset is missing, while policy-defined minimum evidence remains sufficient.
- `STALE`: previously available evidence exceeded its freshness threshold.
- `SOURCE_UNAVAILABLE`: Collector, VictoriaMetrics, rule executor, or required collection work is unavailable.
- `CONFLICTING`: independent sources disagree beyond automatic reconciliation policy.
- `NOT_CONFIGURED`: required monitoring or Health Policy assignment is incomplete.

A critical stale or unavailable input normally yields `UNKNOWN`. A policy may allow `HEALTHY` or `DEGRADED` with `PARTIAL` evidence only when it identifies the missing inputs as non-critical and its minimum evidence is met.

## Health result and reasons

Current Health exposes at least:

- formal object ID and type
- Health Status and nullable Health Score
- Operational Mode and Data Quality
- Coverage Ratio
- primary and secondary Health Reasons
- Health Policy ID and version
- calculation time, input window, and validity end

Each Health Reason contains a stable code, reason severity, source, related metric or evidence, current value, threshold or condition summary, first occurrence, last confirmation, primary marker, and safe user-facing explanation.

Initial reason codes cover `DEVICE_UNREACHABLE`, `INTERFACE_DOWN`, `PROBE_FAILURE`, `HIGH_UTILIZATION`, `HIGH_PACKET_LOSS`, `HIGH_LATENCY`, `ERROR_RATE_HIGH`, `REDUNDANCY_LOST`, `DATA_STALE`, `SOURCE_UNAVAILABLE`, `UPSTREAM_UNREACHABLE`, `INPUT_CONFLICT`, and `MONITORING_NOT_CONFIGURED`. `MAINTENANCE_ACTIVE` is contextual and never replaces the underlying primary health cause.

A valid response is explainable, for example:

```text
status: DEGRADED
score: 62
primary reason: 2.4% packet loss over the last 5 minutes
secondary reason: latency is 85% above the 7-day baseline
data quality: FRESH
coverage: 100%
policy: circuit-standard v3
```

For insufficient evidence, the response uses `UNKNOWN`, `healthScore = null`, an appropriate Data Quality, and a reason such as `DATA_STALE`.

## Health Score

Health Score ranges from 0 through 100 or is `null`:

| Score | Display meaning |
| ---: | --- |
| 90–100 | Good metric performance |
| 75–89 | Minor quality degradation |
| 50–74 | Material performance degradation |
| 1–49 | Severe abnormality |
| 0 | Confirmed complete unavailability |
| `null` | Cannot be calculated reliably |

These bands are descriptive, not state thresholds. A confirmed critical circuit outage remains `CRITICAL` even when other weighted components produce score 70.

Health Score Breakdown contains total, component scores, weights, deductions, Coverage Ratio, policy version, and calculation time. The UI can open this explanation from every displayed score.

## Object-specific Health Policies

The architecture defines versioned Device, Interface, Circuit, Site, Business Service, and Collector policy concepts. The MVP implements at least device, interface, circuit, and site policies and the business aggregation required by the Executive Dashboard.

Device policy may use reachability, SNMP freshness, CPU, memory, temperature, power, fans, core interfaces, restart, and severe Alerts. Interface policy may use administrative and operational state, utilization, errors, discards, flap rate, optical data, peer state, and freshness. Circuit policy may use both endpoint states, probes, latency, loss, jitter, utilization, errors, redundancy, and carrier maintenance. Site policy may use critical devices, core circuits, business probes, online proportions, open Incidents, and data coverage.

`HealthPolicy`, immutable `HealthPolicyVersion`, and `HealthPolicyAssignment` carry:

- eligible object type and assignment scope
- mandatory and optional Condition Bindings
- coverage minimum
- mappings from Condition State to critical, degraded, healthy, or unknown outcomes
- scoring components and weights
- aggregation semantics
- health-specific transition behavior that does not duplicate shared condition timing

Policy publication is audited. New versions affect new calculations only; historical results retain their original policy identity and input window.

Condition thresholds, shared time windows, Freshness Policies, and three-valued composition remain in immutable Condition Versions. One Condition Version can feed Alert, Health, deterministic Incident declaration, dashboard, SLA, and reporting bindings without those consumers repeating its calculation.

The MVP does not execute arbitrary user scripts as health formulas.

## Evaluation order

Current Health is selected in this order:

1. Apply `DISABLED` or `RETIRED` participation behavior.
2. Evaluate expected inputs and Coverage Ratio.
3. Detect critical staleness, source unavailability, or unresolved conflict.
4. Apply explicit `CRITICAL` conditions.
5. Apply explicit `DEGRADED` conditions.
6. Confirm explicit `HEALTHY` conditions.
7. Otherwise return `UNKNOWN`.

`MAINTENANCE` is evaluated as a separate operational overlay. Confirmed `CRITICAL` takes precedence over degraded or healthy outcomes, but absent critical evidence produces `UNKNOWN` rather than an invented failure or health result.

## Aggregation semantics

Aggregate health uses policy-selected semantics rather than a universal average:

- `CRITICAL_DEPENDENCY`: one critical dependency makes the parent at least critical.
- `WEIGHTED_COMPONENT`: contributes to score or performance state but cannot override a hard critical condition.
- `QUORUM`: requires a configured number of independent observations.
- `REDUNDANCY_GROUP`: losing one member may degrade; losing all may be critical.
- `PERCENTAGE_THRESHOLD`: evaluates bounded populations such as ordinary access devices.

A site with one critical core switch and 99 healthy access devices cannot be reported as 99% healthy through arithmetic averaging. Policies consider importance, dependency, single points of failure, redundancy, business impact, current Incidents, object type, and coverage.

Every aggregate provides Coverage Ratio plus evaluated, unknown, stale, source-unavailable, and total counts. Coverage below the policy minimum forces `UNKNOWN` and `healthScore = null`.

## Dashboard ratios

The Executive Dashboard reports separately:

- Confirmed Healthy Ratio
- `DEGRADED` count
- `CRITICAL` count
- `UNKNOWN` count
- Health Data Coverage
- maintenance count

Confirmed Healthy Ratio is healthy participating weight divided by all `ACTIVE` participating weight. Unknown objects remain in the denominator so missing monitoring cannot inflate health. Health Data Coverage is reliable-state weight divided by the same population.

Maintenance objects are shown separately and do not enter the ordinary active healthy count. The same population, weight, and maintenance rules apply in API responses, dashboard cards, trends, and reports.

## Freshness and recovery

Each input type has a Freshness Policy with expected interval, grace period, stale threshold, and unavailable threshold. The Fact and Condition layer turns this into shared freshness Condition Evaluations. Health Policy binds those results as mandatory or optional evidence rather than calculating `now - lastObservedAt` itself. An LLDP observation, 30-second counter, 10-second probe, inventory refresh, Trap stream, and Collector heartbeat can therefore have different validity without duplicated policy code.

Recovery from `UNKNOWN` requires the source to recover, enough new valid evidence, configured confirmation duration, clearance of source failure, and a new policy calculation. The new state may be healthy, degraded, or critical. One normal sample cannot force an immediate healthy result.

## Hysteresis and state transitions

Shared entry duration, recovery duration, and asymmetric thresholds live in Condition Definition and prevent flapping once for every consumer. A separate Health transition confirmation is allowed only when it has a distinct named business meaning and does not rerun the metric or fact predicate.

For example, utilization can become true after `conditionFor` above 80% and false after `conditionRecoveryFor` below 70%. Alert Rule may then apply a distinct `alertPromotionDelay`, while Health Policy consumes the same Condition State immediately or under a separately named health-transition rule.

## Maintenance presentation

Operator views present underlying health and maintenance together. The topology uses Health Status as its primary color and may add a blue maintenance border or tool icon, maintenance owner, window, and end time. A maintenance overlay cannot hide the red critical icon beneath it.

The Executive Dashboard may separate maintenance objects from active production failures, while the operator view retains the actual health fact and Alert evidence.

## Upstream propagation

If a critical upstream device prevents downstream observation, the upstream object can be `CRITICAL` with `DEVICE_UNREACHABLE`, while downstream objects become `UNKNOWN` with `UPSTREAM_UNREACHABLE`. Impact analysis can mark downstream services affected without claiming an independent failure on every device.

## History and correction

`CurrentHealth` is the current projection. `HealthTransition` appends discrete-state changes with old and new states, reason, time, Health Policy Version, Data Quality, Coverage Ratio, and primary evidence. `HealthSnapshot` retains state-change and scheduled aggregate results for trends, reports, and Incident impact. Detailed performance remains in VictoriaMetrics.

An authorized state correction records previous and corrected state, reason, actor, validity, related Incident, and audit event. It is time-bounded and additive; it never erases the original transition.

## Relationship to Alert and Incident

Health Status and Alert Instance are parallel outputs of Condition Evaluation, while Incident is downstream of Alert, Health Impact, and topology:

- Condition State drives Alert lifecycle mapping and Health recomputation independently.
- Health Engine never reads Alert acknowledgement, delivery, suppression, Incident association, or Alert Severity as condition evidence.
- Alert Engine never reads final Health Status or Health Score to reproduce a shared predicate.
- Condition `UNKNOWN` cannot recover an Alert and can make Health Status `UNKNOWN` when the binding is mandatory.
- Incident closure cannot set an object healthy or feed the originating Condition graph.
- A critical Health Status normally has a Condition-backed Health Reason and may coexist with a related Alert, but neither outcome owns the other.
- No user can set healthy state without an authorized, audited, time-bounded correction.

## Computation and consistency

MVP-S1 current-health queries use precomputed Current Condition Evaluations and Current Health rather than scanning raw metrics or re-evaluating predicates per page request. Metric Condition Definitions may compile to `vmalert` recording rules, alerting rules, or a controlled combination, but this decision does not generate those artifacts.

Health computation is event-driven where possible, updates affected parents incrementally, and performs periodic full consistency verification. One child transition does not recompute every object globally. Historical views query Health Snapshots or VictoriaMetrics as appropriate.

Operational telemetry includes health-work queue length and oldest age, calculations per second, calculation duration and failures, unknown and stale counts, Coverage Ratio distribution, and active Health Policy Version distribution.

## User-interface semantics

Primary topology presentation uses green for healthy, yellow or orange for degraded, red for critical, and gray for unknown. Maintenance, disabled, retired, stale, unavailable, partial, and conflicting states use additional icons, borders, labels, or patterns. Color is never the only differentiator.

Health Score is secondary in details, rankings, and trends. Unknown score displays as an em dash rather than zero, and the score explanation is available from the result.

## Open configuration boundary

Concrete Condition predicates, thresholds, component weights, coverage minima, freshness durations, quorum sizes, and Health Policy mappings remain to be defined per object and workload. Each shared threshold and time window belongs to one Condition Version rather than being copied into Health Policy or Alert Rule.

## Non-goals

- Machine-learning or black-box health scoring
- Arbitrary user scripts as formulas
- Automatic tuning of every weight
- One formula for every object type
- A marketplace of cross-organization health models
- Replacing Alert or Incident with one score
- Sorting unknown as confirmed zero-health failure
- Treating maintenance as healthy
- Rewriting prior health history after a policy edit
- Reading Alert Instance or Incident state as shared technical evidence
- Embedded MetricsQL or duplicated shared thresholds in Health Policy
- A Condition dependency cycle or unchecked `UNKNOWN`-as-`FALSE` propagation
