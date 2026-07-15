-- Owns the append-only audit foundation for T010.
create table public.audit_events (
  event_id uuid primary key,
  actor_type varchar(16) not null
    check (actor_type in ('USER', 'SERVICE', 'SYSTEM', 'UNKNOWN')),
  actor_id varchar(128),
  event_type varchar(128) not null
    check (event_type ~ '^[A-Z][A-Z0-9_.-]{0,127}$'),
  occurred_at timestamptz not null default clock_timestamp(),
  source varchar(64) not null
    check (source ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,63}$'),
  outcome varchar(16) not null
    check (outcome in ('SUCCESS', 'DENIED', 'FAILED')),
  failure_category varchar(64),
  resource_type varchar(64),
  resource_id varchar(128),
  request_id varchar(64),
  correlation_id varchar(128),
  idempotency_key varchar(128),
  event_hash char(64) not null,
  details jsonb not null default '{}'::jsonb,
  check (
    (actor_type in ('USER', 'SERVICE') and actor_id is not null)
    or actor_type in ('SYSTEM', 'UNKNOWN')
  ),
  check ((resource_type is null) = (resource_id is null)),
  check (
    (outcome = 'SUCCESS' and failure_category is null)
    or (outcome in ('DENIED', 'FAILED') and failure_category is not null)
  ),
  check (jsonb_typeof(details) = 'object'),
  check (octet_length(details::text) <= 8192)
);

create unique index audit_events_idempotency_idx
  on public.audit_events (source, idempotency_key)
  where idempotency_key is not null;

create index audit_events_timeline_idx
  on public.audit_events (occurred_at desc, event_id desc);

create index audit_events_correlation_idx
  on public.audit_events (correlation_id, occurred_at desc, event_id desc)
  where correlation_id is not null;

create index audit_events_actor_idx
  on public.audit_events (actor_type, actor_id, occurred_at desc, event_id desc);

create index audit_events_resource_idx
  on public.audit_events (resource_type, resource_id, occurred_at desc, event_id desc)
  where resource_type is not null;

create function public.reject_audit_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit events are append-only' using errcode = '55000';
end;
$$;

create trigger audit_events_reject_update_delete
before update or delete on public.audit_events
for each row execute function public.reject_audit_event_mutation();

create trigger audit_events_reject_truncate
before truncate on public.audit_events
for each statement execute function public.reject_audit_event_mutation();
