---
status: accepted
date: 2026-07-13
---

# Separate desired, observed, and effective asset and topology state

Asset and topology data uses three layers: Desired State is authoritative human, controlled-import, or approved data; Observed State is source-attributed and time-bounded evidence; Effective State is the governed view published to topology, alerting, and impact analysis. This prevents noisy or ambiguous discovery from silently changing operational truth while still allowing previously unknown observations to be displayed as unconfirmed candidates.

Ownership is field-level. Observations retain their source, collector, time, validity, confidence, and original identity or value; conflicts create auditable differences instead of overwrites. Confirmed or locked Desired State has priority, candidate relations require approval, and disappeared observations progress through stale and missing conditions without automatic physical deletion.

Controlled imports use stable identifiers or explicit matching rules and require validation, preview, difference counts, confirmation, idempotency, batch identity, audit, error reporting, and reversible Desired State changes. Discovery cannot rebuild the formal topology, merge identities unattended, or modify network-device configuration in the MVP.
