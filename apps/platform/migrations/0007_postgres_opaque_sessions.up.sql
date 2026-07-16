create table public.platform_session_generation (
  singleton_id smallint primary key check (singleton_id = 1),
  generation_id uuid not null,
  updated_at timestamptz not null default clock_timestamp()
);

insert into public.platform_session_generation (singleton_id, generation_id)
values (1, '00000000-0000-4000-8000-000000000007');

create table public.web_sessions (
  session_id uuid primary key,
  user_id uuid not null references public.platform_users(user_id),
  session_type varchar(24) not null
    check (session_type in ('PRE_AUTH', 'AUTHENTICATED')),
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  generation_id uuid not null,
  authorization_version bigint not null check (authorization_version >= 1),
  credential_version integer not null check (credential_version >= 1),
  authentication_strength varchar(24) not null
    check (authentication_strength in ('PASSWORD', 'PASSWORD_MFA')),
  password_verified_at timestamptz not null,
  mfa_verified_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  last_activity_at timestamptz,
  idle_expires_at timestamptz,
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz,
  revocation_reason varchar(32),
  request_id varchar(128),
  source_address varchar(128) not null,
  user_agent_summary varchar(256) not null,
  check (absolute_expires_at > created_at),
  check (
    (session_type = 'PRE_AUTH' and last_activity_at is null and idle_expires_at is null)
    or
    (session_type = 'AUTHENTICATED' and last_activity_at is not null
      and idle_expires_at is not null and idle_expires_at <= absolute_expires_at)
  ),
  check (
    (authentication_strength = 'PASSWORD' and mfa_verified_at is null)
    or (authentication_strength = 'PASSWORD_MFA' and mfa_verified_at is not null)
  ),
  check ((revoked_at is null) = (revocation_reason is null)),
  check (revocation_reason is null or revocation_reason in (
    'LOGOUT', 'ROTATED', 'USER_DISABLED', 'PASSWORD_CHANGED',
    'AUTHORIZATION_CHANGED', 'IDLE_EXPIRED', 'ABSOLUTE_EXPIRED',
    'RECOVERY_INVALIDATION', 'GENERATION_MISMATCH'
  ))
);

create index web_sessions_active_user_idx
  on public.web_sessions (user_id, absolute_expires_at)
  where revoked_at is null;

create index web_sessions_expiry_idx
  on public.web_sessions (absolute_expires_at)
  where revoked_at is null;
