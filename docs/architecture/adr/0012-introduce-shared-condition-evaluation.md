---
status: accepted
date: 2026-07-13
---

# Introduce a shared versioned Condition Evaluation layer

Normalized Facts and Metrics feed reusable, immutable Condition Definitions whose Evaluations are `TRUE`, `FALSE`, or `UNKNOWN`. Alert Engine and Health Engine consume the same versioned Condition Evaluation through separate bindings, so MetricsQL, thresholds, freshness, hysteresis, baseline, dimensions, and shared time windows have one owner rather than being copied into Alert Rule and Health Policy.

Metric Conditions execute in `vmalert`; Direct Fact Conditions execute from Normalized Facts; composite conditions form an explainable acyclic three-valued dependency graph. Alert owns episode promotion and notification behavior, Health owns state and score impact, and Incident follows Alert, Health Impact, and topology. Neither Alert nor Health reads the other's final state to reconstruct a condition, preventing Health-to-Alert-to-Health cycles.

This refines ADR-0010: real-time push and periodic reconciliation remain, but the pushed and reconciled authority is Condition Evaluation rather than an Alert-specific metric result. Condition publication activates one verified version for every binding or keeps all consumers on the last good version; historical Alert and Health records retain the Condition Version they used.
