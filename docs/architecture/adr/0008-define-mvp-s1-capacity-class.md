---
status: accepted
date: 2026-07-13
---

# Define MVP-S1 as a conditional capacity class

MVP-S1 targets 500 devices, 30,000 interfaces, 2,000 enabled active probes, 5,000 topology relations, 50 concurrent authenticated Web Sessions, and 5 concurrent Executive Dashboards. The claim is valid only with the decided collection periods, time-series budget and retention, reference Ubuntu host, browser terminal, workload mix, test duration, and performance objectives; it is not a license limit or an unconditional maximum.

Acceptance also applies a 120% Stress Load for 30 minutes to verify graceful degradation, backlog recovery, identity and configuration safety, and absence of crashes, OOM, corruption, or silent loss. Passing Stress Load does not extend the supported class, while exceeding MVP-S1 in production creates a visible Capacity Risk rather than rejection of the next device or a hidden performance promise.

Capacity evidence is reproducible and reports software versions, environment, scale, workload, active time series, sample rates, percentiles, errors, resources, queues, and recovery. Claims above Verified Capacity require a new test and may require larger hardware, split collectors, storage changes, or a higher S2/S3 class rather than hard-coded limits or unreviewed high-cardinality metrics.
