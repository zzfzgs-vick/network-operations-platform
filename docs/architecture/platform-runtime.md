# Platform runtime and reliable work architecture

Status: Decided

## Runtime shape

The MVP is a modular monolith with two independent NestJS runtimes built from the same codebase:

```text
HTTPS reverse proxy
      -> HTTP API container

PostgreSQL Inbox / Outbox / Jobs
      -> Platform Worker container

Go Collector / Probe / Trap Receiver
      -> internal Inbox ingest

vmalert
      -> internal Metric Condition ingest
```

HTTP API and Platform Worker share domain modules, application services, database access, and internal protocols. They run as different operating-system processes and different Docker containers. They may use one application image with different start commands; separate images are not required for the MVP.

The codebase design fixes the entry points at `apps/platform/src/main.ts` for the normal NestJS HTTP Application and `apps/platform/src/worker.ts` for a NestJS Standalone Application Context without an HTTP listener. Both remain in one NestJS package while the runtime boundary stays explicit.

## HTTP API Process

HTTP API Process owns:

- REST endpoints
- private service-authenticated ingest routes whose synchronous work is limited to authentication, validation, and durable Inbox persistence
- local login, Session, TOTP, and RBAC enforcement
- asset, topology, Condition, Alert Rule, Health Policy, and system configuration commands
- query interfaces
- user-command validation and audit context
- SSE connection establishment, authorization, and read-only distribution

It does not run long Condition evaluation, full Health recalculation, periodic reconciliation, bulk Alert state processing, blocking external notification, long topology discovery, or large background loops.

When an accepted user command requires asynchronous work, one PostgreSQL transaction:

1. validates and changes authoritative business state
2. inserts an Outbox Message or Background Job
3. commits both together
4. returns an accepted result without waiting for the background action

The API never updates PostgreSQL and then performs an uncoordinated direct network call whose failure would leave the state committed without durable intent.

## Platform Worker

Platform Worker owns:

- Direct Fact Condition evaluation
- Metric Condition Evaluation consumption
- incremental and consistency Health calculation
- asynchronous Alert Engine processing
- `vmalert` ingest processing and periodic Condition reconciliation
- Outbox dispatch
- Notification Delivery jobs
- freshness and expiry evaluation
- expired Session and temporary-data cleanup
- scheduled and lower-priority work

One MVP worker process may host all of these modules. They use distinct handlers and application-service boundaries rather than one global loop, so a later deployment can run selected modules as separate workers without changing domain interfaces or authoritative data.

Platform Worker uses a NestJS Standalone Application Context and exposes no public user HTTP API. It does not call the platform's public API to execute business logic; API and Worker invoke shared application services or coordinate through durable PostgreSQL records.

## Go data-plane boundary

Go Collector, Probe, and Trap Receiver own protocol activity:

- SNMPv2c and SNMPv3 communication
- TCP, ICMP, HTTP, and DNS probing
- SNMP Trap receipt
- protocol parsing and protocol-level normalization
- Observation or Normalized Fact batches
- retry, source identity, and observation timestamps

Go services may state a protocol fact such as `ifOperStatus = DOWN`. They do not decide final Health Status, Health Score, Alert Instance, Incident, maintenance behavior, topology authority, user authorization, or business thresholds.

Their internal submissions carry stable batch and item identities, source Collector identity, observation times, and safe retry semantics. They do not depend on the frontend.

## vmalert boundary

`vmalert` evaluates Metric Condition Versions and produces Metric Condition Evaluations. It does not call ordinary user endpoints or directly change Alert Instance, Current Health, Incident, acknowledgement, or Maintenance Window.

Its results enter a private service-authenticated route on the HTTP API container, which validates and durably records the batch in Inbox without applying Alert or Health business effects. Platform Worker then applies Condition, Alert, and Health effects idempotently. Push is supplemented by periodic reconciliation as defined in `docs/architecture/alerts-incidents.md`.

## PostgreSQL coordination model

The MVP introduces no Redis queue, BullMQ, NATS, Kafka, RabbitMQ, NestJS microservice transport, Temporal, or another workflow engine. PostgreSQL is already mandatory and provides:

- authoritative business state
- Inbox
- Transactional Outbox
- Background Job queue
- Worker Lease
- state transitions and idempotency
- attempt and failure history
- Dead Letter records

This does not make PostgreSQL a general event-stream platform. Queue operations remain bounded, indexed, observable, and separated from ordinary read paths.

## Inbox

Inbox accepts Go Observation batches, `vmalert` Metric Condition Evaluations, Trap events, and other retriable internal inputs. Every source supplies a stable idempotency key.

Processing one Inbox Message occurs transactionally:

1. lock or verify its idempotency identity
2. reject or classify invalid input without losing valid siblings
3. apply authoritative state changes
4. append any resulting Outbox Messages or Background Jobs
5. mark the Inbox Message complete
6. commit

Duplicate submission cannot duplicate Observation, Condition Transition, Alert Episode, Health Transition, Incident Timeline, or Notification Delivery.

## Transactional Outbox

Outbox prevents database-and-network dual writes. Business state and its asynchronous intent are inserted in one transaction. For example, confirming a topology candidate commits the formal relation and a topology-recalculation Outbox Message together.

Outbox delivery is At-least-once Work. The destination receives a stable idempotency key, and delivery completion is recorded only after the required durable effect. External failures do not roll back already committed business state but remain retryable and visible.

## Background Job model

A Background Job records at least:

- immutable Job ID and Job Type
- Payload Reference
- Priority and Available At
- Attempt Count
- Lease Owner and Lease Expires At
- Started At and Completed At
- Failure Category and safe Last Error Summary

Job Attempt records each attempt independently. Large payloads, raw secrets, complete error bodies, and mutable business data are not copied into queue rows when a stable reference is sufficient.

Workers claim ready jobs in short transactions using row locks and `SKIP LOCKED` where appropriate. This mechanism is restricted to queue claiming and is not used to weaken ordinary business consistency.

## At-least-once execution and idempotency

The platform promises At-least-once Work, not exactly-once execution. A worker can crash after applying an effect and before acknowledging completion, so every consumer and external side effect is idempotent.

The final defenses are stable idempotency keys, immutable episode and transition identities, database uniqueness, optimistic versioning, and transactional processing. Repetition cannot create duplicate Condition or Alert transitions, Health history, Incident Timeline events, or Notification Deliveries.

## Lease, crash recovery, and shutdown

A Worker Lease has finite expiry. The owning worker renews long-running work and records progress. Crash, forced stop, host restart, or lost database connection eventually makes the job claimable again.

Docker stop or deployment shutdown follows this sequence:

- API stops accepting new requests.
- Worker stops claiming new jobs.
- Current short transactions receive a bounded completion period.
- Incomplete work releases its lease or becomes retryable after expiry.
- Every open database transaction commits or rolls back.
- Restart resumes committed Inbox, Outbox, and Job work automatically.

No permanent `processing=true` state can strand a job indefinitely.

## Priority and starvation

Job priority is:

1. authentication and security
2. core device state
3. core circuit state
4. Alert state
5. Health state
6. ordinary observation processing
7. topology discovery
8. inventory refresh
9. reports and cleanup

Quota or aging permits lower-priority progress without allowing it to block core Alert and Health work.

## Failure classification and Dead Letter

Failure categories include transient database error, temporarily unavailable dependency, timeout, invalid data, unresolved identity, version mismatch, permanent business error, and unknown exception.

Retry policy uses classified retryability, maximum attempts, exponential backoff, and random jitter. Exhausted or non-retryable work creates a Dead Letter Record instead of disappearing.

Dead Letter is queryable, audited, safe to inspect, manually retryable under authorization, and generates a Platform Alert. It contains no plaintext password, Session token, SNMP credential, TOTP secret, private key, or unrestricted payload.

## Advisory lock boundary

PostgreSQL advisory locks are allowed only for low-cardinality singleton coordination such as complete Health consistency verification, full Condition reconciliation, scheduled cleanup, rule configuration publication, or one database maintenance action.

They are not used as long-lived locks for devices, interfaces, metrics, Condition Evaluations, or Sessions. Ordinary concurrency relies on Job row locks, uniqueness, optimistic versions, and Worker Leases.

## SSE distribution

Platform Worker never owns browser connections. It updates authoritative PostgreSQL state and writes a durable Outbox event for an allowed frontend change.

HTTP API reads authorized events, enforces RBAC, manages SSE Sessions, and closes connections after Session revocation or expiry. PostgreSQL `LISTEN/NOTIFY` may later be used only as a low-latency wake-up hint:

- the durable Outbox remains authoritative
- notification loss is recovered by an Outbox cursor
- payloads do not contain complete sensitive business data
- API restart resumes from persistent state

Whether to use `LISTEN/NOTIFY` is an implementation-ticket decision and needs no product ADR.

## Concurrency safety

Concurrency safety uses:

- database uniqueness
- optimistic versions
- row-level locks
- finite Job leases
- Inbox idempotency keys
- Condition Transition and Alert Episode identities
- Authorization Version
- narrowly scoped advisory locks

Process-local mutexes may optimize one runtime but cannot be the sole correctness boundary because API and Worker are independent and future Worker replicas are possible.

## Worker observability

Platform Worker exposes:

- start time, version, and latest heartbeat
- queue length and oldest age per Job Type and priority
- throughput, success, failure, retry, and Dead Letter counts
- Job duration
- PostgreSQL connection state
- Condition consumption delay
- Health recomputation delay
- Alert reconciliation delay
- Outbox backlog
- Inbox duplicate count
- active and expiring Worker Leases

Worker unavailability or sustained backlog creates a Platform Alert. The External Availability Check also observes platform-level health that cannot depend entirely on the failed Worker path.

## Module structure

The modular monolith keeps API controllers free of background loops, Worker handlers dependent on application services rather than public HTTP, domain logic independent of controllers, and database adapters separated from domain rules.

A conceptual structure is:

```text
apps/platform/
  src/main.ts
  src/worker.ts
  src/modules/
    assets/
    topology/
    observations/
    conditions/
    health/
    alerts/
    incidents/
    jobs/
    outbox/
    authentication/
    audit/
```

Codebase design may refine names and folders. It must not create speculative network APIs merely to imitate future microservices.

## Message-system re-evaluation triggers

A new ADR may evaluate NATS or another messaging system only when evidence shows one or more of:

- distributed collection or offline replay
- API and Worker on different hosts
- PostgreSQL Job Queue remains a measured bottleneck after indexing and Worker tuning
- backlog exceeds task periods and cannot recover through bounded Worker scaling
- large event broadcast or several independent long-lived consumers
- cross-site buffering and replay
- single-host capacity no longer suffices
- database queue contention materially harms business transactions

The trigger requires capacity or operational evidence, not speculative future flexibility.

## Non-goals

- Redis or BullMQ queue
- NATS, Kafka, RabbitMQ, or another broker
- NestJS Microservices Transport
- Temporal or another workflow engine
- Exactly-once execution claims
- Public Worker HTTP API
- Worker business calls through the public API
- Long-running background loops inside HTTP requests
- Process-local locks as the correctness boundary
- Premature service-per-module deployment
