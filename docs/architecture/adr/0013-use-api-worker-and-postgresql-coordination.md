---
status: accepted
date: 2026-07-13
---

# Use separate API and Worker processes with PostgreSQL coordination

The MVP builds one modular NestJS codebase but runs an HTTP API Process and a non-HTTP Platform Worker as independent Docker containers. API owns authenticated commands, queries, and SSE; Worker owns durable Condition, Health, Alert, reconciliation, delivery, expiry, and cleanup work. Go services remain protocol collectors and `vmalert` remains the Metric Condition executor, so neither owns final business state.

PostgreSQL coordinates Inbox, Transactional Outbox, Background Jobs, finite Worker Leases, attempts, idempotency, retries, and Dead Letters using At-least-once Work and idempotent consumers. This avoids unsafe database-and-network dual writes and permits crash recovery without claiming exactly-once execution. Advisory locks remain limited to a few singleton tasks, while normal work uses row locks, uniqueness, and leases.

Redis queues, BullMQ, NATS, Kafka, RabbitMQ, NestJS microservice transports, and workflow engines are deliberately excluded from the single-host MVP. A broker requires a later ADR backed by distributed deployment, independent consumer, backlog, or PostgreSQL contention evidence rather than anticipated future complexity.
