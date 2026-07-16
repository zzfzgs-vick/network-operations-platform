-- Owns the T011 local Platform User, Local Credential, throttle, and one-time bootstrap foundation.
create table public.platform_users (
  user_id uuid primary key,
  username varchar(64) not null,
  username_normalized varchar(64) not null unique,
  status varchar(16) not null
    check (status in ('ENABLED', 'DISABLED')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (char_length(username) between 3 and 64),
  check (char_length(username_normalized) between 3 and 64)
);

create table public.local_credentials (
  user_id uuid primary key references public.platform_users (user_id) on delete restrict,
  password_hash text not null
    check (password_hash like '$argon2id$%'),
  must_change_password boolean not null default true,
  credential_version integer not null default 1
    check (credential_version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table public.platform_bootstrap_state (
  singleton_id smallint primary key default 1
    check (singleton_id = 1),
  administrator_user_id uuid unique
    references public.platform_users (user_id) on delete restrict,
  initialized_at timestamptz,
  check ((administrator_user_id is null) = (initialized_at is null))
);

insert into public.platform_bootstrap_state (singleton_id) values (1);

create table public.local_auth_throttle (
  bucket_type varchar(16) not null
    check (bucket_type in ('ACCOUNT', 'SOURCE')),
  bucket_key char(64) not null,
  failure_count integer not null default 0
    check (failure_count between 0 and 100),
  locked_until timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (bucket_type, bucket_key),
  check (bucket_key ~ '^[a-f0-9]{64}$')
);

create index local_auth_throttle_expiry_idx
  on public.local_auth_throttle (locked_until)
  where locked_until is not null;

create function public.reject_platform_user_identity_change()
returns trigger
language plpgsql
as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'platform user identity is immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger platform_users_reject_identity_change
before update on public.platform_users
for each row execute function public.reject_platform_user_identity_change();
