alter table public.platform_users
  add column mfa_state varchar(32) not null default 'NOT_REQUIRED'
    check (mfa_state in ('NOT_REQUIRED', 'MFA_ENROLLMENT_REQUIRED', 'ENROLLED'));

update public.platform_users u
   set mfa_state = 'MFA_ENROLLMENT_REQUIRED',
       authorization_version = authorization_version + 1,
       updated_at = clock_timestamp()
 where exists (
   select 1
     from public.user_role_assignments ura
     join public.role_permissions rp on rp.role_id = ura.role_id
     join public.permissions p on p.permission_code = rp.permission_code
    where ura.user_id = u.user_id and p.sensitive
 );

update public.web_sessions s
   set revoked_at = clock_timestamp(),
       revocation_reason = 'AUTHORIZATION_CHANGED'
 where s.revoked_at is null
   and exists (
     select 1 from public.platform_users u
      where u.user_id = s.user_id
        and u.mfa_state = 'MFA_ENROLLMENT_REQUIRED'
   );

create table public.totp_enrollments (
  enrollment_id uuid primary key,
  user_id uuid not null unique
    references public.platform_users (user_id) on delete restrict,
  secret_ciphertext bytea not null,
  secret_nonce bytea not null check (octet_length(secret_nonce) = 12),
  secret_tag bytea not null check (octet_length(secret_tag) = 16),
  key_version varchar(64) not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  check (expires_at > created_at)
);

create table public.totp_authenticators (
  authenticator_id uuid primary key,
  user_id uuid not null
    references public.platform_users (user_id) on delete restrict,
  secret_ciphertext bytea not null,
  secret_nonce bytea not null check (octet_length(secret_nonce) = 12),
  secret_tag bytea not null check (octet_length(secret_tag) = 16),
  key_version varchar(64) not null,
  status varchar(16) not null check (status in ('ACTIVE', 'REVOKED')),
  last_accepted_step bigint,
  created_at timestamptz not null default clock_timestamp(),
  verified_at timestamptz not null,
  revoked_at timestamptz,
  check ((status = 'ACTIVE') = (revoked_at is null))
);

create unique index totp_authenticators_one_active_user_idx
  on public.totp_authenticators (user_id)
  where status = 'ACTIVE';

create table public.mfa_challenges (
  challenge_id uuid primary key,
  session_id uuid not null unique
    references public.web_sessions (session_id) on delete restrict,
  user_id uuid not null
    references public.platform_users (user_id) on delete restrict,
  purpose varchar(24) not null
    check (purpose in ('MFA_ENROLLMENT', 'MFA_VERIFY')),
  source_hash char(64) not null check (source_hash ~ '^[a-f0-9]{64}$'),
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  max_attempts integer not null check (max_attempts between 1 and 10),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  check (expires_at > created_at)
);

create index mfa_challenges_active_user_idx
  on public.mfa_challenges (user_id, expires_at)
  where completed_at is null;

create table public.totp_source_auth_throttle (
  source_hash char(64) not null check (source_hash ~ '^[a-f0-9]{64}$'),
  failure_count integer not null default 0 check (failure_count between 0 and 100),
  locked_until timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (source_hash)
);

create table public.totp_user_auth_throttle (
  user_id uuid primary key
    references public.platform_users (user_id) on delete restrict,
  failure_count integer not null default 0 check (failure_count between 0 and 100),
  locked_until timestamptz,
  updated_at timestamptz not null default clock_timestamp()
);

create index totp_source_auth_throttle_expiry_idx
  on public.totp_source_auth_throttle (locked_until)
  where locked_until is not null;

create index totp_user_auth_throttle_expiry_idx
  on public.totp_user_auth_throttle (locked_until)
  where locked_until is not null;
