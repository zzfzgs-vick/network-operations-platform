---
status: accepted
date: 2026-07-13
---

# Use a central collection boundary for the MVP

The MVP uses one central deployment because the current assumption is that its management network can directly reach every in-scope device and active-probe target. It defines a logical Collector Node boundary now, while deferring the operational complexity of distributed collection until an unreachable network is confirmed.

The MVP creates the built-in Collector Node `central-default`. SNMP collection tasks, active-probe tasks, and their results carry `collectorId`; managed devices and probe targets may reference a preferred collector and initially use `central-default`. Metrics and alerts retain collection provenance. The control plane communicates with Go collection services through explicit task and result interfaces and does not assume those processes share the Node.js API host; collectors do not depend on the frontend.

Distributed node registration, certificate issuance and mTLS, remote scheduling, offline buffering and replay, automatic upgrades, multi-node high availability, NAT traversal, and autonomous alerting during center disconnection are outside the MVP. If the center cannot reach a required network, a new ADR and specification change must define the distributed mode before implementation.
