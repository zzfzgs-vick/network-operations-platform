---
status: accepted
date: 2026-07-13
---

# Separate technical Alerts from operational Incidents

An Alert represents one technical abnormal episode detected by a versioned rule; an Incident represents the human coordination, impact analysis, mitigation, monitoring, and closure of an operational event. They use independent immutable identities and lifecycles, so acknowledgement or suppression does not resolve an Alert, Alert recovery does not close an Incident, and Incident closure or cancellation never rewrites technical evidence.

Each resolved recurrence creates a new Alert Instance under the same stable Alert Fingerprint, and every detection transition is append-only. Incidents link to one or more Alert Instances through audited role-bearing associations and retain an append-only timeline plus historical cause and impact snapshots. Explainable deterministic correlation may group or suppress downstream notification, but it preserves every downstream Alert and records the rule, version, and evidence.

PostgreSQL-backed platform state is authoritative for Alert episodes, acknowledgement, Incident handling, links, timeline, and audit; VictoriaMetrics remains authoritative for metric facts. Notification delivery and any future `vmalert` or Alertmanager participation are subordinate integrations rather than the sole operational record. The precise owner of metric-rule evaluation remains a separate pending design choice.
