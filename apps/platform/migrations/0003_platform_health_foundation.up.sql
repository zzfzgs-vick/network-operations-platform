-- Owns the platform runtime-health persistence for T007.
create table public.platform_worker_heartbeats (
  worker_type varchar(32) not null,
  instance_id varchar(128) not null,
  started_at timestamptz not null,
  last_heartbeat_at timestamptz not null default clock_timestamp(),
  version varchar(64) not null,
  status varchar(16) not null default 'RUNNING'
    check (status in ('RUNNING', 'STOPPED')),
  primary key (worker_type, instance_id)
);

create index platform_worker_heartbeats_freshness_idx
  on public.platform_worker_heartbeats (worker_type, last_heartbeat_at desc);

create table public.reliable_inbox_observability (
  singleton boolean primary key default true check (singleton),
  duplicate_count bigint not null default 0 check (duplicate_count >= 0),
  updated_at timestamptz not null default clock_timestamp()
);

insert into public.reliable_inbox_observability (singleton) values (true);
