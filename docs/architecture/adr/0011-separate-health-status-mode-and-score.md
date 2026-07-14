---
status: accepted
date: 2026-07-13
---

# Separate authoritative health, operational mode, data quality, and score

The platform represents authoritative Health Status as `HEALTHY`, `DEGRADED`, `CRITICAL`, or `UNKNOWN`, while Operational Mode and Data Quality remain independent dimensions. `MAINTENANCE` therefore controls handling without hiding the real health fact, and stale, unavailable, conflicting, or insufficient evidence produces `UNKNOWN` rather than false health or recovery.

Health Score is a nullable, explainable 0-to-100 derivative for ranking, trends, and peer comparison; it cannot determine or override Health Status, and insufficient unknown evidence has score `null` rather than 0. Object-specific versioned policies use explicit critical dependencies, redundancy, quorum, bounded percentage, coverage, freshness, and hysteresis rules instead of one arithmetic average.

Every aggregate exposes coverage and unknown populations, historical results retain their Health Policy Version, and corrections append audit rather than rewriting history. This prevents data loss, maintenance, ordinary healthy assets, or later policy edits from making a critical dependency appear healthy.
