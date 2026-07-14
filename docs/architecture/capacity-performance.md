# Capacity and performance architecture

Status: MVP-S1 decided

## Capacity classes

| Dimension | MVP-S1 target | 120% Stress Load |
| --- | ---: | ---: |
| Managed Devices | 500 | 600 |
| Managed Interfaces | 30,000 | 36,000 |
| Enabled active-probe tasks | 2,000 | 2,400 |
| Formal or candidate topology relations | 5,000 | 6,000 |
| Concurrent authenticated Web Sessions | 50 | 60 |
| Concurrent Executive Dashboards | 5 | 6 |

MVP-S1 is the target supported class under the conditions in this document. Stress Load validates degradation and recovery and is not a guaranteed production class.

The product does not reject a 501st device as a licensing rule. Scale beyond Verified Capacity produces a visible Capacity Risk and requires evidence before a higher performance claim.

## Reference environments

### Production host

- Ubuntu Server 24.04 LTS
- 16 x86-64 vCPU
- 64 GB RAM
- At least 2 TB usable NVMe SSD data space
- Optional separation of operating-system and data disks or logical volumes
- At least 1 Gbps management network
- Docker Engine and Compose Plugin
- One PostgreSQL instance
- One VictoriaMetrics node
- No Kubernetes, VictoriaMetrics cluster, or PostgreSQL HA

Windows 11 development results do not establish production capacity. Smaller production hardware does not inherit MVP-S1 without testing.

### Browser terminal

- Windows 11
- Modern 8-core processor
- 16 GB RAM
- A currently supported Chrome or Microsoft Edge release
- 1920×1080 capacity baseline
- Gigabit LAN
- No discrete-GPU requirement

4K adaptation is a UI acceptance item, while performance baselines use 1920×1080.

## Collection workload

| Data type | Reference period |
| --- | ---: |
| Core TCP/ICMP reachability | 10 seconds |
| Core interface operational state | 15 seconds |
| Ordinary interface operational state | 30 seconds |
| Interface traffic, errors, and discards | 30 seconds |
| CPU, memory, temperature, and device state | 60 seconds |
| Ordinary active probes | 10–30 seconds per task |
| LLDP or adjacency discovery | 10 minutes |
| Device and interface inventory | 6 hours |
| Serial number and static inventory | 24 hours or manual trigger |

Scheduling adds jitter so devices do not synchronize on one second. One slow device cannot block others; per-device SNMP concurrency is bounded; high-priority state work precedes inventory discovery; failures, retries, timeouts, queue age, and backoff are observable. Unreachable targets back off rather than creating request storms.

Every Capacity Report records the actual task count and period for each class.

## Time-series budget

- No more than 500,000 active time series as the initial design budget
- No more than 20,000 samples/s sustained writes
- No more than 30,000 samples/s short write peaks
- 90-day raw metric retention by default

The test reports active series, samples/s, new-series rate, query rate and latency, disk writes, compressed growth, projected 90-day storage, and label-cardinality leaders. It does not create meaningless metrics merely to fill the budget.

Exceeding 500,000 active series triggers metric and label review before hardware expansion.

### Label boundary

Controlled labels may include `device_id`, `interface_id`, `collector_id`, `site_id`, `metric_profile`, `probe_type`, finite state, and finite device type.

Request IDs, Trace IDs, alert-instance IDs, full error messages, user text, full URL query strings, Session IDs, login user IDs, per-collection random IDs, event-unique values, raw Trap bodies, and unconstrained vendor descriptions are prohibited as time-series labels. Mutable display names remain in PostgreSQL unless a reviewed metric use requires otherwise.

## Retention

- Raw time-series metrics: 90 days
- Alert events and handling records: at least 1 year
- Audit records: at least 1 year, adjustable to organizational policy
- Formal asset and topology history: retained after archival
- Temporary caches: no long-term guarantee
- Reproducible unconfirmed discovery: configurable cleanup

If 90-day metrics exceed reference disk budget, the Capacity Report evaluates lower non-critical frequency, shorter low-value retention, aggregation, more disk, or metric-model changes. Historical data is never silently deleted.

## Active-probe scheduling

The 2,000-task target means enabled, continuously scheduled tasks, not historical definitions. The load includes TCP Connect, ICMP, HTTP/HTTPS, and DNS.

Observability covers starts/s, success, timeout, scheduling delay, execution time, result-write delay, queue length, and oldest queued task. Normal load has no starvation or continuously growing backlog. At least 95% of tasks start within 20% of their configured period unless an explicit exception is specified. Slow targets cannot consume every Worker, and Stress Load backlog recovers after returning to target load.

## SNMP workload

The 30,000-interface workload covers administrative and operational status, speed, inbound and outbound counters, errors, discards, `ifLastChange`, and identity fields.

Scenarios include healthy, slow, timed-out, partially unsupported, and abnormal-value devices; high-interface-count devices; SNMPv2c and SNMPv3; counter reset after restart; `ifIndex` change; and duplicate or abnormal serial numbers. Simulators may provide scale, while a small real-vendor set separately validates protocol compatibility.

## Web workload

The 50-Session mix is:

- 5 Executive Dashboards with SSE and aggregate refresh
- 15 active operators searching, drilling into topology, reviewing alerts, and querying trends
- 20 ordinary read-only users viewing device and line state
- 10 authenticated low-activity Sessions

The reference load sustains about 25 requests/s, peaks around 50 requests/s, and holds 5 Executive Dashboard SSE connections. Session checks continue through PostgreSQL and authorization remains enabled.

## API and Platform Worker workload

The HTTP API and Platform Worker are measured as separate processes and containers. The API commits business state and the related Outbox Message or Background Job in one short transaction and does not perform long-running Condition, Health, Alert, reconciliation, discovery, notification, or cleanup work in the request path.

Target and Stress Load exercise the PostgreSQL Inbox, Transactional Outbox, Background Job Queue, Job Attempts, finite Worker Leases, retries, and Dead Letter flow under at-least-once delivery. Scenarios include duplicate Inbox submission, concurrent consumers, Worker termination during a lease, transient and permanent failures, mixed priorities, lease renewal, and graceful shutdown.

Evidence is reported per Job type and priority and includes:

- ready, leased, retrying, completed, and Dead Letter counts
- oldest ready age, claim latency, execution duration, and throughput
- attempt and retry distribution, lease expiry, renewal, and recovery
- Inbox duplicate and idempotency-rejection counts
- Outbox backlog and delivery latency
- PostgreSQL queue-query latency, lock waits, deadlocks, connection use, and queue-table/index growth

Priority and aging prevent security, core-state, Alert, and Health work from being blocked by inventory or reporting while also preventing permanent low-priority starvation. Queue claims use short row-lock transactions; Advisory Locks remain limited to low-cardinality singleton coordination.

After API or Worker restart, committed work remains recoverable. Lease recovery and repeated delivery do not duplicate Condition Transitions, Alert Episodes, Health Transitions, Incident Timeline entries, or Notification Deliveries.

## API objectives

| Operation | p95 objective |
| --- | ---: |
| Ordinary list and detail API | 500 ms |
| Executive summary API | 1 second |
| Site aggregate topology API | 1 second |
| 500-node device topology snapshot API | 2 seconds |
| 24-hour device or line trend | 2 seconds |
| 7-day device or line trend | 5 seconds |
| Device, interface, or line search | 1 second |
| Alert acknowledgement or state change | 1 second, excluding external notification |

Reports include p50, p95, p99, and error rate. Under target load, unexpected HTTP errors stay below 0.1% after excluding deliberately invalid test requests, database pools do not exhaust, queues do not grow continuously, and identity or authorization checks are never bypassed.

## State timeliness

- Trap receipt to visible platform event: p95 no more than 3 seconds
- Active-probe completion to queryable result: p95 no more than 2 seconds
- Persisted state change to SSE delivery: p95 no more than 2 seconds
- Browser receipt to visible update: no more than 1 second

Collection waiting, protocol execution, state processing, and propagation are reported separately. Propagation latency is not mislabeled as total fault-detection time.

## Topology rendering budget

- Executive global view: at most 100 aggregate nodes and 300 aggregate links by default
- Site view: at most 300 device or group nodes and 1,000 edges by default
- Full device-level test: at most 500 device nodes and 2,000 visible edges
- Interfaces appear on demand rather than as a 30,000-node default graph

On the reference browser, Executive topology initially renders within 3 seconds, a 500-node topology within 5 seconds, node search and focus within 1 second, and expansion of at most 200 new elements within 1 second. The page processes 100 node or edge state changes per second for 60 seconds without crashing, full relayout, lost manual position, or sustained UI freezes above 500 ms.

## Alert workload

- 200 logical Alert Rule definitions
- 5,000 simultaneously non-normal Alert Instances
- 10,000 Alert state transitions within 10 minutes

The report states unique Condition Definition and Version counts, Condition Assignments, Alert Rule Condition Bindings, and Health Policy Condition Bindings. One shared Condition is not duplicated per consumer or interface when a scoped assignment suffices.

Metric Conditions execute in `vmalert` against the normal VictoriaMetrics workload and enter the platform through authenticated batch push while Condition Reconciler runs on its normal 30-to-60-second schedule. Direct Fact Conditions execute from Normalized Facts through the same current Condition Evaluation boundary.

Deduplication, deterministic correlation, suppression, maintenance, and root-cause processing remain active; dashboards stay accessible; notification failure does not block Alert persistence; and suppressed, deduplicated, rejected, reconciled, and rate-limited counts remain visible.

The workload measures Condition evaluations and transitions per second, current Condition cardinality, dependency fan-out, push batch rate and size, accept/reject latency, duplicate and out-of-order evaluations, last successful push and reconciliation, reconciliation duration and corrections, `vmalert` evaluation latency and failures, loaded-versus-expected Condition Version and configuration hash, evaluator-state recovery, and Alert/Health consumer lag.

The storm includes `TRUE`, `FALSE`, and `UNKNOWN` Condition changes. It does not create duplicate Condition transitions, Alert Episode identities, correction history, or inconsistent Incident Alert Links. A planned temporary platform-ingest outage is followed by reconciliation that restores Condition, Alert, and Health state without interpreting the outage as false, recovered, or healthy and without requiring manual restart.

## Health computation

MVP-S1 health calculation covers 500 devices, 30,000 interfaces, 2,000 active probes, 5,000 topology relations, and the required circuit, site, business, and Collector aggregates.

Current-health reads use precomputed Current Condition Evaluations and Current Health rather than synchronously scanning raw VictoriaMetrics data on each API request. Health Engine does not execute MetricsQL or read Alert Instance state. Condition changes incrementally update affected health objects and parents, while periodic full consistency verification detects projection drift.

One child change does not trigger an unbounded global recomputation. Critical dependency, quorum, redundancy, percentage, coverage, freshness, hysteresis, and policy-version semantics remain enabled under target and Stress Load; the test does not replace them with a simplified score-only calculation.

Health telemetry includes:

- calculation queue length and oldest waiting age
- calculations per second, duration, and failure count
- `UNKNOWN`, `STALE`, and source-unavailable counts
- Coverage Ratio distribution and below-minimum counts
- current Health Policy Version distribution
- incremental versus consistency-recalculation counts
- parent-propagation delay
- Condition-to-Health consumer lag and version mismatch count

At target load, the queue does not grow continuously, critical dependency changes propagate without being averaged away, maintenance preserves underlying status, and current-health API objectives remain satisfied. After Stress Load, the queue falls materially within the existing 10-minute recovery window and requires no manual restart.

## Resource and degradation policy

After warm-up at target load:

- No OOM or dependence on sustained Swap
- No unbounded CPU, memory, Goroutine, listener, connection, or queue growth
- Average host CPU below 70% as an observation target
- At least 20% memory headroom
- At least 25% projected data-disk headroom after 90-day retention
- Headroom in database pool and file descriptors
- CPU, memory, file-descriptor, queue, and error metrics from each major container

Short peaks may exceed observation targets but are explained in the report.

When resources are constrained, priority is:

1. Authentication and authorization
2. PostgreSQL configuration consistency
3. Core device and core link state
4. Shared Condition Evaluation and source-quality state
5. Alert state and critical Current Health processing
6. Current metric writes
7. Executive and operator read queries
8. Ordinary device collection
9. Topology discovery
10. Inventory refresh
11. Low-priority historical reports

Degradation is visible. Low-priority inventory work never blocks core-link collection.

## Stress and recovery behavior

Stress Load runs for 30 minutes. APIs may slow and low-priority tasks may delay, but processes do not crash, OOM, corrupt configuration, silently lose configuration, duplicate or wrongly merge identity, label stale data healthy, or create unrecoverable collection backlog.

After return to MVP-S1, backlog decreases materially within 10 minutes, does not keep accumulating, requires no manual restart, and API/frontend performance returns toward target. Recovery time is recorded.

## Test duration and evidence

- Warm-up: 2 hours
- MVP-S1 sustained test: 8 hours
- 120% Stress Load: 30 minutes
- Recovery observation: 1 hour
- Recommended pre-launch stability run: 24 hours

Evidence covers host CPU, memory, disk capacity and latency, disk throughput, network, active series, sample rate, query and API latency, PostgreSQL connections and lock waits, Go Goroutines, separate API and Worker Node.js event-loop delay, Inbox and Outbox backlog, Background Jobs, leases, retries, Dead Letters, collection success, Condition/Health/Alert processing delay, SSE connections, browser memory, and errors.

Implementation later provides reproducible inventory/topology data, SNMP and probe targets, Alert storms, Web and SSE load, time-series tests, fixed configuration, and generated reports. Tool choice such as k6 remains an implementation decision.

## Capacity reporting and evolution

Every formal Capacity Report includes Git commit, application and image versions, Ubuntu/Docker/kernel versions, hardware, dataset, collection periods, active series, sample rate, user mix, duration, percentiles, errors, resources, queue peaks, issues, MVP-S1 result, Verified Capacity, and unverified range.

Documentation never claims support above the demonstrated result. Higher S2/S3 classes require new evidence and may use larger hardware, split collectors, or clustered storage. MVP-S1 does not promise one thousand concurrent users, millions of active series, multi-host scaling, clustered VictoriaMetrics, PostgreSQL HA, multi-center collection, cross-region recovery, unlimited retention, arbitrary high-cardinality labels, or untested hardware.
