---
status: accepted
date: 2026-07-13
---

# Use a single production host with manual recovery for the MVP

The MVP formally deploys on one Ubuntu Server 24.04 LTS host with Docker Engine, Docker Compose, one PostgreSQL instance, and one VictoriaMetrics node. This accepts host-level downtime and manual recovery in exchange for avoiding unneeded orchestration, replication, and failover complexity; container restart is explicitly not treated as host-level high availability.

Class A State has RPO and RTO targets of 4 hours, while Class B Metrics has an RPO of 24 hours and an RTO of 8 hours. PostgreSQL uses four-hourly custom-format logical backups, VictoriaMetrics uses daily supported snapshots with `vmbackup`, and all required backups are validated and copied outside the production host and disks; regenerable Class C data is rebuilt rather than backed up.

Production acceptance requires a measured recovery from a blank host, protected secret recovery, an external availability check, and failure alerts for backups and backup targets. Automatic database failover, clustering, orchestration, cross-site recovery, multi-replica services, and zero-downtime upgrades remain outside the MVP until stricter availability, capacity, safety, or compliance requirements trigger a new ADR.

See `docs/architecture/mvp-deployment.md` and `docs/specs/mvp-acceptance.md` for the operational details and acceptance checks.
