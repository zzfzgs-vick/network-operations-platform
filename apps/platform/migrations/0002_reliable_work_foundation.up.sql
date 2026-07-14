-- Owns the PostgreSQL reliable-work foundation for ADR-0013.
create table public.reliable_inbox_messages (
  inbox_message_id uuid primary key,
  source_id varchar(128) not null,
  idempotency_key varchar(128) not null,
  message_kind varchar(64) not null,
  payload_reference varchar(256) not null,
  status varchar(16) not null default 'PENDING'
    check (status in ('PENDING', 'COMPLETED')),
  received_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  unique (source_id, idempotency_key)
);

create index reliable_inbox_pending_idx
  on public.reliable_inbox_messages (received_at, inbox_message_id)
  where status = 'PENDING';

create table public.reliable_outbox_messages (
  outbox_message_id uuid primary key,
  destination varchar(64) not null,
  idempotency_key varchar(128) not null,
  payload_reference varchar(256) not null,
  available_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  delivered_at timestamptz,
  unique (destination, idempotency_key)
);

create index reliable_outbox_pending_idx
  on public.reliable_outbox_messages (available_at, created_at)
  where delivered_at is null;

create table public.reliable_background_jobs (
  job_id uuid primary key,
  job_type varchar(64) not null,
  idempotency_key varchar(128) not null,
  payload_reference varchar(256) not null,
  priority smallint not null default 0 check (priority between 0 and 100),
  status varchar(16) not null default 'READY'
    check (status in ('READY', 'COMPLETED', 'DEAD_LETTER')),
  available_at timestamptz not null default clock_timestamp(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  cycle_attempt_count integer not null default 0 check (cycle_attempt_count >= 0),
  max_attempts integer not null check (max_attempts between 1 and 100),
  started_at timestamptz,
  completed_at timestamptz,
  failure_category varchar(32),
  last_error_summary varchar(64),
  created_at timestamptz not null default clock_timestamp(),
  unique (job_type, idempotency_key)
);

create index reliable_jobs_ready_idx
  on public.reliable_background_jobs (priority desc, available_at, created_at)
  where status = 'READY';

create table public.reliable_worker_leases (
  job_id uuid primary key references public.reliable_background_jobs (job_id) on delete cascade,
  lease_owner varchar(128) not null,
  lease_expires_at timestamptz not null,
  renewed_at timestamptz not null default clock_timestamp()
);

create index reliable_worker_leases_expiry_idx
  on public.reliable_worker_leases (lease_expires_at);

create table public.reliable_job_attempts (
  attempt_id uuid primary key,
  job_id uuid not null references public.reliable_background_jobs (job_id) on delete cascade,
  attempt_number integer not null check (attempt_number >= 1),
  lease_owner varchar(128) not null,
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  outcome varchar(24) not null default 'RUNNING'
    check (outcome in ('RUNNING', 'SUCCEEDED', 'RETRY_SCHEDULED', 'DEAD_LETTERED', 'LEASE_EXPIRED')),
  failure_category varchar(32),
  failure_code varchar(64),
  unique (job_id, attempt_number)
);

create table public.reliable_dead_letters (
  dead_letter_id uuid primary key,
  job_id uuid not null references public.reliable_background_jobs (job_id) on delete cascade,
  attempt_number integer not null,
  failure_category varchar(32) not null,
  failure_code varchar(64) not null,
  created_at timestamptz not null default clock_timestamp(),
  retried_at timestamptz,
  retry_actor varchar(128)
);

create index reliable_dead_letters_active_idx
  on public.reliable_dead_letters (created_at, dead_letter_id)
  where retried_at is null;
