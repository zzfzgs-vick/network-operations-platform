# MVP-S1 capacity acceptance

Status: Decided

## Claim boundary

Passing this specification establishes MVP-S1 only for the documented software versions, workload, reference host, reference browser, collection periods, metric model, retention, and test duration. The 120% run verifies degradation; it does not extend the formal capacity guarantee.

## Reference scale

| Dimension | Target | Stress |
| --- | ---: | ---: |
| Managed Devices | 500 | 600 |
| Managed Interfaces | 30,000 | 36,000 |
| Enabled active probes | 2,000 | 2,400 |
| Formal or candidate topology relations | 5,000 | 6,000 |
| Concurrent authenticated Web Sessions | 50 | 60 |
| Executive Dashboards | 5 | 6 |

The dataset exercises real or simulated collection rather than creating database rows only.

## Environment

The production test host is Ubuntu Server 24.04 LTS with 16 x86-64 vCPU, 64 GB RAM, at least 2 TB usable NVMe SSD data space, at least 1 Gbps management networking, Docker Engine, Compose Plugin, one PostgreSQL instance, and one VictoriaMetrics node.

The browser test uses Windows 11, a modern 8-core processor, 16 GB RAM, supported Chrome or Edge, 1920×1080, and gigabit LAN without a discrete-GPU dependency. Windows development results do not replace this test.

Major containers have reviewed resource limits or equivalent runtime protection, but this specification does not prescribe Compose implementation.

## Collection profile

Tests use and report the actual count for these periods:

- Core TCP/ICMP reachability: 10 seconds
- Core interface state: 15 seconds
- Ordinary interface state: 30 seconds
- Interface traffic, errors, and discards: 30 seconds
- CPU, memory, temperature, and device state: 60 seconds
- Ordinary active probes: configured between 10 and 30 seconds
- LLDP or adjacency discovery: 10 minutes
- Device and interface inventory: 6 hours
- Serial number and static inventory: 24 hours or manual trigger

Pass conditions include randomized scheduling jitter, bounded per-device SNMP concurrency, no cross-device blocking by slow targets, high-priority state work before inventory, observable failure/retry/timeout/backoff, and no sustained request storm against unreachable devices.

## Time-series acceptance

- Active series do not exceed the 500,000 design budget without an approved metric review.
- Sustained writes do not exceed 20,000 samples/s and short peaks do not exceed 30,000 samples/s for the designed workload.
- Raw metrics retain 90 days or the report documents a failed capacity result and a proposed frequency, retention, aggregation, disk, or metric-model change.
- The report contains active series, samples/s, new-series rate, query rate, query latency, disk write, compressed growth, 90-day disk projection, and label-cardinality leaders.
- Prohibited unbounded labels are absent; controlled labels follow `docs/architecture/capacity-performance.md`.
- Historical reduction or deletion never occurs silently.

Alert and audit records retain at least one year, formal asset and topology history remains after archival, and reproducible temporary data follows configured cleanup.

## Active-probe acceptance

The 2,000 target tasks are enabled and continuously scheduled with a representative TCP Connect, ICMP, HTTP/HTTPS, and DNS mix.

The report contains starts/s, success, timeout, scheduling delay, execution time, write delay, queue length, and oldest queued age. At target load there is no starvation or continuously growing queue, and 95% of tasks start within 20% of their configured period unless a documented exception applies.

Slow targets do not exhaust every Worker. After Stress Load, backlog falls materially within 10 minutes and continues toward normal without manual restart.

## SNMP acceptance

The 30,000-interface test collects administrative and operational state, speed, inbound and outbound counters, errors, discards, `ifLastChange`, and identity attributes.

The scenario set includes healthy, slow, timed-out, partially unsupported, abnormal-value, and high-interface-count devices; SNMPv2c and SNMPv3; counter reset; `ifIndex` change; and duplicate or abnormal serial numbers.

At scale, simulated Agents are permitted. A smaller real-vendor suite separately verifies compatibility.

## Web workload acceptance

The 50-Session workload includes 5 Executive Dashboards with SSE, 15 active operators, 20 ordinary read-only users, and 10 low-activity users. It sustains about 25 requests/s, peaks around 50 requests/s, and maintains 5 dashboard SSE connections while PostgreSQL Session and authorization checks remain enabled.

The Stress Load scales the mix to 60 Sessions and 6 Executive Dashboards.

## API and Platform Worker queue acceptance

The HTTP API and Platform Worker run as independent processes and containers and expose separate resource and event-loop telemetry. The API performance objectives remain in force while the Worker processes the production Condition, Health, Alert, reconciliation, notification, expiry, cleanup, and other background workload.

The measured target and Stress runs use the real PostgreSQL Inbox, Transactional Outbox, Background Job, Job Attempt, Worker Lease, retry, and Dead Letter mechanisms. They do not bypass reliable work by directly inserting final Alert, Health, Incident, or frontend state.

The scenario set demonstrates:

- state-changing API requests commit business state and asynchronous work atomically without synchronously executing long Jobs
- duplicate Inbox messages and repeated Job execution are idempotent and do not duplicate business transitions or external-delivery records
- a Worker terminated after claim but before completion leaves the finite-lease Job reclaimable and safely retryable
- API or Worker restart does not lose committed Inbox, Outbox, or Job work
- transient failures retry with bounded backoff and jitter, while permanent or exhausted failures become visible Dead Letter Records
- security, core-state, Alert, and Health priority work continues during lower-priority inventory and reporting load
- aging or quotas prevent permanent starvation of eligible low-priority work
- queue claims and completion do not create sustained PostgreSQL lock waits, deadlocks, connection-pool exhaustion, or material interference with ordinary business transactions
- graceful Worker shutdown stops new claims and leaves incomplete work recoverable without permanent processing flags
- no broker, process-local mutex, disabled authorization, or skipped Session check is used to obtain the result

The report includes per-type and per-priority ready, leased, retrying, completed, and Dead Letter counts; oldest age; claim and execution latency; throughput; attempts; lease expiry, renewal, and recovery; Inbox duplicate count; Outbox delivery latency; PostgreSQL queue-query latency, lock waits, deadlocks, connections, and queue-table/index growth; plus API and Worker CPU, memory, event-loop delay, heartbeat, and restart recovery time.

## API and error objectives

| Operation | Target p95 |
| --- | ---: |
| Ordinary list and detail | 500 ms |
| Executive summary | 1 second |
| Site aggregate topology | 1 second |
| 500-node topology snapshot | 2 seconds |
| 24-hour device or line trend | 2 seconds |
| 7-day device or line trend | 5 seconds |
| Asset search | 1 second |
| Alert acknowledgement or state change | 1 second excluding external notification |

The report includes p50, p95, p99, and error rate. At target load, unexpected HTTP errors are below 0.1% after excluding deliberately invalid test requests, database connections do not exhaust, request queues do not grow continuously, and authentication or authorization is never bypassed.

## Timeliness objectives

- Trap receipt to visible event: p95 at most 3 seconds
- Active-probe completion to queryable result: p95 at most 2 seconds
- Persisted state change to SSE: p95 at most 2 seconds
- Browser receipt to visible update: at most 1 second

The report separates wait for next collection, protocol execution, state processing, persistence, SSE propagation, and browser rendering. It does not report propagation alone as total fault-detection time.

## Topology acceptance

- Executive global view defaults to at most 100 aggregate nodes and 300 links.
- Site view defaults to at most 300 device or group nodes and 1,000 edges.
- Full device-level test renders at most 500 device nodes and 2,000 visible edges.
- 30,000 interfaces are not drawn as one default topology.
- Executive topology initially renders within 3 seconds.
- The 500-node topology initially renders within 5 seconds.
- Search and focus complete within 1 second.
- Expanding at most 200 new elements completes within 1 second.
- The UI processes 100 node or edge status changes per second for 60 seconds without crash or full relayout.
- Manual topology position remains stable.
- Zoom, pan, and select avoid sustained freezes above 500 ms.

Browser CPU, memory, rendering timing, long tasks, and errors are retained in the evidence.

## Alert-load acceptance

The load contains 200 logical Alert Rule definitions, their shared Condition Definitions and bindings, 5,000 simultaneously non-normal Alert Instances, and 10,000 Alert state transitions in 10 minutes. The report states unique Condition Definitions and Versions, assignments, dependency edges, Alert bindings, and Health bindings.

Conditions and rules use scoped assignments rather than identical per-interface or per-consumer copies. Deduplication, three-valued Condition propagation, deterministic correlation, suppression, maintenance handling, and root-cause processing remain enabled; Executive and operator views remain available; notification failure does not block state persistence; and counts of unknown, rejected, suppressed, deduplicated, reconciled, or rate-limited work are visible.

Metric Conditions execute in `vmalert` against the normal VictoriaMetrics data volume, while Direct Fact Conditions consume Normalized Facts. The test keeps the private authenticated Condition Evaluation ingest path and Condition Reconciler enabled at its 30-to-60-second interval; it does not inject Alert Instances or Current Health directly into PostgreSQL.

The run also demonstrates:

- A resolved Fingerprint that recurs creates a new Alert Instance rather than rewriting the old episode.
- Every detection change appends an Alert State Transition with Condition and Alert Rule versions and source.
- The 10,000 transitions do not lose, duplicate, or incorrectly reassign Incident Alert Links.
- Alert resolution does not automatically close an Incident, and Incident closure does not change Alert detection.
- Upstream suppression retains downstream Alert Instances and their actual data state.
- Maintenance suppression retains the Maintenance Window ID and does not present unresolved state as healthy.
- Incident Timeline and impact history remain append-only and queryable throughout the storm.
- Notification failure and rate limiting do not block Alert or Incident persistence.
- Batch delivery records accepted and rejected entries without silently discarding a complete mixed-validity batch.
- Duplicate, retried, concurrent, and out-of-order evaluations remain idempotent and do not reopen resolved older episodes.
- Push handling persists quickly and is not blocked by external Notification Delivery.
- Expected Condition Version and configuration hash match loaded `vmalert` state before the measured target run, and Alert and Health bindings use that same version.
- A planned temporary ingest or platform outage does not make a Condition false, resolve active Alerts, or mark Health healthy; startup or recovery reconciliation restores missed current state.
- Reconciliation under the storm does not add duplicate Condition or Alert transitions or damage Incident Alert Links.
- Condition timing, Alert promotion, `vmalert` restart state recovery, reload failure, and atomic last-good-version rollback are exercised.
- Condition `TRUE` drives both consumers, `FALSE` drives Alert recovery handling and Health recomputation, and `UNKNOWN` neither recovers the Alert nor becomes healthy.
- Direct Fact Condition updates are shared by Alert and Health without duplicate comparison, and Health Engine performs no MetricsQL query.
- A cyclic Condition publication is rejected without disrupting the active version.
- The report includes Condition evaluations and transitions per second, current Condition cardinality, dependency fan-out, Alert/Health consumer lag, version mismatches, batch rate and size, ingest latency, rejection reasons, duplicate count, reconciliation duration and correction count, last successful push and reconciliation, evaluator latency and failures, state-recovery result, and configuration drift.

## Health-computation acceptance

The target run calculates Current Health for 500 devices, 30,000 interfaces, 2,000 active probes, 5,000 topology relations, and required circuit, site, business, and Collector aggregates using the production Health Policies.

- Current-health API requests read precomputed Condition Evaluations and Current Health and do not synchronously scan raw metrics or execute predicates.
- Condition changes incrementally recalculate the affected object and required ancestors rather than the entire global model.
- A periodic full consistency verification detects and repairs projection drift without rewriting Health Transition history.
- Health Status, Operational Mode, Data Quality, nullable Health Score, Coverage Ratio, Health Reasons, and Health Policy Version remain available under load.
- Shared three-valued, quorum, dependency, freshness, and hysteresis Condition semantics plus Health critical-dependency, redundancy-group, percentage, and coverage mappings remain enabled during the test.
- One critical core dependency is not averaged into a healthy site by ordinary healthy devices.
- Unknown active objects remain in the Confirmed Healthy Ratio denominator, while Health Data Coverage remains a separate metric.
- Stale, unavailable, and upstream-hidden evidence does not become healthy or score 0 under load.
- Maintenance preserves underlying Health Status and does not enter the active healthy count.
- The calculation queue does not grow continuously at target load or lose Health Transitions.
- Under Stress Load, lower-priority aggregate refresh may delay but critical object and core-path health retains the degradation priority defined by the architecture.
- After Stress Load, health backlog falls materially within 10 minutes, current results converge through consistency verification, and no manual restart is required.
- The report contains queue length and oldest age, calculations per second, duration and failures, Condition-to-Health lag, parent-propagation delay, unknown/stale/unavailable counts, Coverage Ratio distribution, consistency repairs, Condition Version distribution, and Health Policy Version distribution.
- Sustained status updates do not trigger full topology relayout, and the existing 100-updates-per-second browser scenario retains mode and data-quality indicators.

## Resource acceptance

After warm-up at target load:

- No host or container OOM
- No requirement for sustained Swap use
- No unexplained unbounded CPU, memory, Goroutine, event-listener, database-connection, file-descriptor, or queue growth
- Average host CPU below 70% as an observation target
- At least 20% memory headroom
- At least 25% projected data-disk headroom after 90-day retention
- Headroom in database connections and file descriptors
- CPU, memory, file-descriptor, queue, and error metrics for each major container

Short excursions are allowed only when the report identifies cause and recovery.

## Degradation and Stress Load acceptance

At 120% for 30 minutes, API latency may rise and low-priority work may delay, but the system does not crash, OOM, corrupt PostgreSQL, silently lose configuration, duplicate or wrongly merge identities, present stale state as healthy, or create unrecoverable task backlog.

Degradation is visible and preserves this priority: authentication/authorization, PostgreSQL consistency, core state collection, shared Condition Evaluation and source quality, Alert and critical Current Health processing, current writes, read queries, ordinary collection, topology discovery, inventory, then historical reports.

After target load resumes, queues fall materially within 10 minutes, continue toward normal, require no restart, and API/frontend performance recovers during the one-hour observation.

## Duration

1. Warm-up: 2 hours
2. MVP-S1 target: 8 hours
3. Stress Load: 30 minutes
4. Recovery observation: 1 hour
5. Recommended separate pre-launch stability test: 24 hours

## Required telemetry

The run records CPU, memory, disk space, disk latency and throughput, network, active series, sample writes, query latency, API latency, PostgreSQL connections and lock waits, Go Goroutines, separate API and Worker Node.js event-loop delay, Inbox and Outbox backlog, Background Job counts and oldest age, lease recovery, retries, Dead Letters, collection success, Condition/Health/Alert delay, SSE connections, browser memory, and error logs.

## Reproducibility and report

Implementation later provides deterministic data for 500 devices and 30,000 interfaces, an SNMP simulator or test Agent, probe targets, topology generation, Alert storm generation, Web/SSE load, time-series tests, fixed configuration, and automated report generation. No tool is selected by this specification.

The Capacity Report includes Git commit, software/image versions, Ubuntu/Docker/kernel, hardware, dataset, periods, active series, sample rate, user mix, duration, p50/p95/p99, errors, separate API and Worker resources, Inbox/Outbox/Job/lease/retry/Dead Letter evidence, PostgreSQL lock evidence, resource and queue peaks, findings, MVP-S1 result, Verified Capacity, and unverified range.

## Claim rules

- The code does not hard-limit the product to 500 devices or reject device 501 solely because of MVP-S1.
- Operation above Verified Capacity shows Capacity Risk.
- Documentation makes no performance promise above the passed report.
- S2/S3 require new evidence and may require more hardware, split collectors, or clustered storage.
- The MVP does not claim one thousand concurrent users, millions of active series, multi-host scaling, clustered VictoriaMetrics, PostgreSQL HA, multi-center collection, cross-region recovery, unlimited retention, arbitrary high-cardinality labels, or untested hardware.
