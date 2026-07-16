-- Owns T016 one-time recovery codes, action-bound step-up grants, and Emergency Administrator designation.
create table public.mfa_recovery_code_sets (
  set_id uuid primary key,
  user_id uuid not null references public.platform_users (user_id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  confirmed_at timestamptz,
  expires_at timestamptz not null,
  invalidated_at timestamptz,
  check (expires_at > created_at),
  check (confirmed_at is null or confirmed_at between created_at and expires_at)
);

create unique index mfa_recovery_code_sets_one_active_user_idx
  on public.mfa_recovery_code_sets (user_id)
  where invalidated_at is null;

create table public.mfa_recovery_codes (
  code_id uuid primary key,
  set_id uuid not null references public.mfa_recovery_code_sets (set_id) on delete restrict,
  code_hash text not null check (code_hash like '$argon2id$%'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  check (expires_at > created_at)
);

create index mfa_recovery_codes_available_idx
  on public.mfa_recovery_codes (set_id, expires_at)
  where consumed_at is null;

create table public.mfa_step_up_grants (
  grant_id uuid primary key,
  user_id uuid not null references public.platform_users (user_id) on delete restrict,
  session_id uuid not null references public.web_sessions (session_id) on delete restrict,
  operation varchar(128) not null
    check (operation ~ '^[a-z][a-z0-9._:-]{2,127}$'),
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  issued_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  check (expires_at > issued_at)
);

create index mfa_step_up_grants_active_session_idx
  on public.mfa_step_up_grants (session_id, operation, expires_at)
  where consumed_at is null;

create table public.emergency_administrators (
  user_id uuid primary key references public.platform_users (user_id) on delete restrict,
  enabled boolean not null default true,
  updated_at timestamptz not null default clock_timestamp()
);
