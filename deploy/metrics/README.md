# Runtime metric baseline

T007 exposes Prometheus text-format endpoints without deploying a Prometheus server or Grafana.

Platform API `/metrics` includes:

- `nop_api_requests_success_total` and `nop_api_requests_error_total`
- `nop_runtime_dependency_available{dependency}` where `dependency` is limited to PostgreSQL,
  VictoriaMetrics, vmalert, and Platform Worker
- `nop_reliable_inbox_duplicates_total`, pending Inbox/Outbox gauges, bounded Job status gauges,
  active lease count, and oldest ready Job age

Collector `/metrics` includes `nop_collector_up` and one controlled build-version information label.
Metrics never label request, user, Inbox, Job, device, idempotency, or payload identifiers. Runtime
health is operational state and is not the business-object Health Status defined by ADR-0011.
