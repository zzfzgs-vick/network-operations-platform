# MVP production deployment

Status: Decided

## Production shape

The MVP runs on one Ubuntu Server 24.04 LTS host using Docker Engine and Docker Compose. This is the formal production deployment shape, not a high-availability topology.

The host runs the reverse proxy, frontend, two independent NestJS runtime containers from one modular codebase, Go collection services, `vmalert`, one PostgreSQL instance, and one single-node VictoriaMetrics instance. Redis is deployed only when a confirmed non-queue caching requirement exists. The MVP does not deploy a message broker.

The reverse proxy exposes one production HTTPS origin: `/` for the React frontend, `/api/` for the NestJS API, `/events/` for SSE, and `/ws/` only if WebSocket is later required. Interactive authentication does not support cross-site frontend/API deployment or multi-domain Session Cookies.

## Application runtime containers

HTTP API and Platform Worker are different processes and Docker containers even when they use the same image:

```text
HTTP API container      -> node dist/main.js
Platform Worker         -> node dist/worker.js
```

The exact build paths may change during codebase design. The HTTP entry starts a NestJS HTTP Application; the Worker entry starts a NestJS Standalone Application Context with no public listener.

HTTP API owns REST, authentication, authorized commands and queries, and SSE connections. Platform Worker owns durable Condition, Health, Alert, reconciliation, Outbox, notification, expiry, and cleanup work. They share modules and PostgreSQL but never call the public API to reuse business logic.

Go Collector, Probe, and Trap Receiver own protocol communication and Observation or Normalized Fact production. `vmalert` owns Metric Condition execution. Neither directly changes final Health, Alert, Incident, maintenance, or authorization state.

PostgreSQL supplies durable Inbox, Transactional Outbox, Background Jobs, Worker Leases, attempts, retries, idempotency, and Dead Letters. No Redis queue, BullMQ, NATS, Kafka, RabbitMQ, NestJS Microservices Transport, Temporal, or another workflow engine is deployed.

## MVP-S1 reference host

Capacity acceptance runs on Ubuntu Server 24.04 LTS, not the Windows 11 development environment. The reference host has 16 x86-64 vCPU, 64 GB RAM, at least 2 TB usable NVMe SSD data space, and at least a 1 Gbps management network.

Operating-system and data directories may use separate disks or logical volumes. The deployment remains one Docker Engine and Compose host with one PostgreSQL instance and one VictoriaMetrics node; it does not use Kubernetes, VictoriaMetrics clustering, or PostgreSQL HA.

This reference configuration supports only the workload demonstrated by the MVP-S1 report. Smaller hardware does not inherit the claim without testing.

Major containers require resource limits or equivalent runtime protection so one abnormal service cannot exhaust the host. Target-load observation aims for average host CPU below 70%, at least 20% free memory, and at least 25% projected disk headroom across the 90-day metric-retention window; short peaks are recorded rather than silently ignored.

Application and collection services do not fail over across hosts. A host, disk, Docker Engine, PostgreSQL, or VictoriaMetrics failure requires an operator to restore service on the original or a replacement host.

## Availability boundary

The MVP accepts platform unavailability during host restart, Docker Engine failure, host or data-disk failure, and manual restoration. PostgreSQL and VictoriaMetrics do not fail over automatically, zero data loss is not guaranteed, and the platform cannot guarantee alerts while its own host is unavailable.

Container restart policies may recover individual process failures but are not host-level high availability and must not be presented as such.

## Recovery classes and objectives

| Class | Contents | RPO | RTO |
| --- | --- | --- | --- |
| Class A State | Users, permissions, inventory, identities, Desired State, formal topology, credential ciphertext or key references, alerting policy, maintenance windows, identity and topology decisions, audit, incidents, and manual layout | 4 hours | 4 hours |
| Class B Metrics | SNMP metrics, traffic, resource and environmental metrics, active-probe results, latency, loss, health history, and VictoriaMetrics history | 24 hours | 8 hours |
| Class C Regenerable Data | Build artifacts, service images, temporary caches, recomputable aggregates, non-persistent Redis data, and reproducible unconfirmed discovery | No recovery objective | Rebuild as needed |

Class A State is restored before Class B Metrics. Current collection and alerting may resume while historical metric queries remain unavailable.

## Off-host backup boundary

No required backup may exist only on the production host, its physical disks, or its Docker volumes. At least one controlled off-host target is required, such as a NAS, backup server, S3-compatible object store, or remote file server.

An unavailable off-host target makes the backup job fail. The failure is recorded and produces a high-priority operational alert.

## PostgreSQL backup

- Run a native logical backup every 4 hours in custom archive format suitable for `pg_restore`.
- Back up the roles, permissions, and global objects required for recovery.
- Calculate a checksum after completion and copy or upload the archive to the off-host target.
- Verify that the archive is readable.
- Record start time, end time, size, checksum, and result.
- Alert on failure.
- Do not use a live Docker-volume copy as the only database backup.
- Do not store unprotected key material beside database backups.

Retention keeps every 4-hour backup for the latest 48 hours, a daily backup for 14 days, and a weekly backup for 8 weeks. Expired backups are removed by policy.

Continuous WAL archiving and point-in-time recovery are deferred. They require a new decision if the Class A RPO is reduced below 4 hours.

## VictoriaMetrics backup

- Create one supported VictoriaMetrics snapshot each day.
- Use `vmbackup` to copy the snapshot to the off-host target and `vmrestore` to recover it.
- Record backup name, snapshot time, covered data range, size, validation result, and job result.
- Alert on failure.
- Retain the latest 7 daily backups and 4 weekly backups.
- Restore a single-node backup into a single-node VictoriaMetrics deployment.

Directly copying the live data directory is not an accepted backup method.

## Deployment configuration and secrets

The Git repository or another controlled configuration store contains Compose files, reverse-proxy configuration, database initialization and migrations, VictoriaMetrics configuration, alert rules, Grafana provisioning when used, build files, deployment scripts, backup and restore scripts, example environment files, and operations documentation.

Real passwords, SNMP communities, SNMPv3 secrets, database passwords, and private keys are never committed to Git. Recovery material uses an encrypted secret file, the organization's existing credential-management system, or access-controlled offline storage. Secret material and database backups are not left together without independent protection.

### TOTP encryption-key rotation

TOTP secrets are application-encrypted with a versioned key supplied through controlled secret configuration. The key is outside PostgreSQL, Git, images, Compose files, and ordinary logs, and is included in separately protected recovery material.

Rotation introduces a new key version, uses it for new encryption, re-encrypts active authenticator ciphertext through the authentication boundary, verifies the migrated records, and retains the old key only until rollback and restore validation complete. Removing the old key is an explicit, audited operation. A rotation rehearsal verifies that active users and Emergency Administrator recovery remain usable without exposing plaintext seeds.

### Session operations

PostgreSQL is the sole authoritative store for interactive Web Sessions. Session lookup, revocation, Authorization Version checks, expiry, and cleanup do not rely on Redis or a process-local cache.

Operations monitor expired-Session cleanup and alert on failure. PostgreSQL unavailability fails authentication closed. Backup may retain Session records for audit, but disaster recovery marks every restored Pre-authentication and Authenticated Session revoked before opening access.

## Recovery order

1. Prepare a clean Ubuntu Server 24.04 LTS host.
2. Install supported Docker Engine and Compose Plugin versions.
3. Obtain the required deployment-repository version.
4. Restore environment configuration, encryption keys, Emergency Administrator material, and other secrets.
5. Verify host time synchronization and acceptable clock offset.
6. Create Docker networks and persistent directories.
7. Start PostgreSQL.
8. Restore PostgreSQL global objects and the application database.
9. Verify database version and migration state.
10. Start the HTTP API, Platform Worker, Go services, and `vmalert` with their intended independent entry points.
11. Revoke every Session restored from backup and verify that historical Cookies cannot authenticate.
12. Expire stale Worker Leases, verify Inbox, Outbox, Job, attempt, and Dead Letter state, and resume only committed work through idempotent handlers.
13. Verify password and TOTP login, Emergency Administrator recovery, inventory, topology, Conditions, Health Policies, tasks, and Alert Rules.
14. Restore VictoriaMetrics.
15. Restore auxiliary services such as Grafana when deployed.
16. Verify that collection and Background Jobs resume without duplicate transitions or deliveries.
17. Verify Condition reconciliation, Health calculation, Alert creation, acknowledgement, and recovery.
18. Record actual recovery time, measured data-loss window, recovered backlog, retries, and Dead Letters.

## External availability check

Production requires a check that runs outside this platform, such as an existing monitoring system or a scheduled probe on another server, NAS, or operations host. It monitors at least host reachability, the HTTPS health endpoint, last successful backup time, last collection time, latest Platform Worker heartbeat, and sustained critical queue backlog.

This is an operating prerequisite, not a second monitoring platform implemented inside the MVP.

## Failure and degradation behavior

- Application container unavailable: expose the affected service as unhealthy; automatic container restart may be attempted but is not reported as host failover.
- HTTP API unavailable: reject new user access while committed Worker tasks remain durable.
- Platform Worker unavailable: retain Inbox, Outbox, and Jobs; expose stale heartbeat and growing backlog; resume after restart or lease expiry without treating delayed work as success.
- VictoriaMetrics unavailable: inventory and configuration remain accessible; historical metrics are explicitly unavailable.
- PostgreSQL unavailable: API and Worker fail closed, reject or stop state-changing work, and never report a Job or Outbox action as successful.
- One collection service unavailable: historical state is retained and affected observations become stale rather than healthy or deleted.
- Backup target unavailable or backup failed: produce a high-priority operational alert.
- Host unavailable: rely on the External Availability Check because the platform cannot reliably report its own outage.
- Service restored after an observation gap: never display long-unupdated observations as normal.

Operational status distinguishes application-container, PostgreSQL, VictoriaMetrics, collection-service, host, and backup-target failures rather than collapsing them into one generic platform state.

## Explicit non-goals

- PostgreSQL automatic primary/standby failover
- VictoriaMetrics cluster mode
- Docker Swarm or Kubernetes
- Hot standby or cross-site disaster recovery
- Floating virtual IP or automatic standby restoration
- Multi-replica collectors or control plane
- Zero-downtime upgrades
- Redis or broker-backed Job Queue
- Exactly-once background execution claims
- Public Platform Worker HTTP API

## Re-evaluation triggers

A new ADR must reassess high availability when the platform becomes a 24×7 critical production system, RTO or RPO must be below 1 hour, monitoring loss affects safety or compliance, one host cannot handle capacity, cross-site recovery is required, redundant servers and storage become available, or zero-downtime upgrades are required.

That review may consider PostgreSQL replication and failover, VictoriaMetrics clustering, redundant collectors, load balancing, orchestration, and off-site disaster recovery. None is implied by this document.
