---
status: accepted
date: 2026-07-13
---

# Use vmalert with real-time push and periodic reconciliation

Platform Alert Rules in PostgreSQL are authoritative, while `vmalert` evaluates only `METRIC` rules against VictoriaMetrics. The platform compiles versioned rule artifacts, receives low-latency active and recovery evaluations through a private authenticated batch endpoint, and periodically reconciles loaded rules, evaluator state, and open Alert Instances so a missed or duplicated push cannot determine final state.

The platform remains authoritative for Alert Fingerprints, Alert Episode identity, Alert Instances and transitions, acknowledgement, maintenance, suppression, notification policy, Incident, correlation, and audit. `TRAP_EVENT` and `PLATFORM_EVENT` rules execute directly in the platform. Evaluator outage, stale data, ingest failure, or absent push produces unknown or unavailable state rather than false recovery; only verified evaluation, healthy reconciliation, or an audited repair can resolve a metric Alert.

This avoids building a second MetricsQL engine in the platform and avoids the fragility of notification-only state transfer. `vmalert` state in VictoriaMetrics supports executor continuity and reconciliation but is not permanent Alert history, and Alertmanager is not part of the MVP authority or Silence chain.
