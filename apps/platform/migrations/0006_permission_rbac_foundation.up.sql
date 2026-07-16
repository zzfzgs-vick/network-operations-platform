-- Owns the T012 stable Permission, Role, assignment, and authorization-version foundation.
alter table public.platform_users
  add column authorization_version bigint not null default 1
    check (authorization_version > 0);

create table public.permissions (
  permission_code varchar(64) primary key
    check (permission_code ~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$'),
  sensitive boolean not null,
  created_at timestamptz not null default clock_timestamp()
);

create table public.roles (
  role_id uuid primary key,
  role_key varchar(64) unique
    check (role_key is null or role_key ~ '^[a-z][a-z0-9-]*$'),
  name varchar(64) not null,
  name_normalized varchar(64) not null unique,
  system_template boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (char_length(name) between 3 and 64),
  check (char_length(name_normalized) between 3 and 64),
  check ((role_key is not null) = system_template)
);

create table public.role_permissions (
  role_id uuid not null references public.roles (role_id) on delete cascade,
  permission_code varchar(64) not null
    references public.permissions (permission_code) on delete restrict,
  granted_at timestamptz not null default clock_timestamp(),
  primary key (role_id, permission_code)
);

create table public.user_role_assignments (
  user_id uuid not null
    references public.platform_users (user_id) on delete restrict,
  role_id uuid not null references public.roles (role_id) on delete restrict,
  assigned_at timestamptz not null default clock_timestamp(),
  assigned_by_user_id uuid
    references public.platform_users (user_id) on delete restrict,
  primary key (user_id, role_id)
);

create index user_role_assignments_role_idx
  on public.user_role_assignments (role_id, user_id);

insert into public.permissions (permission_code, sensitive) values
  ('users.read', false),
  ('users.manage', true),
  ('roles.manage', true),
  ('sessions.revoke', false),
  ('assets.read', false),
  ('assets.manage', false),
  ('credentials.manage', true),
  ('topology.read', false),
  ('topology.manage', false),
  ('topology.confirm', false),
  ('observations.read', false),
  ('observations.reprobe', false),
  ('alerts.read', false),
  ('alerts.acknowledge', false),
  ('alerts.configure', false),
  ('incidents.manage', false),
  ('audit.read', false),
  ('dashboard.executive.read', false),
  ('system.configure', true),
  ('authentication.manage', true),
  ('sessions.manage', true),
  ('backup.manage', true),
  ('restore.execute', true);

insert into public.roles (
  role_id, role_key, name, name_normalized, system_template
) values
  ('00000000-0000-4000-8000-000000000001', 'system-administrator', 'System Administrator', 'system administrator', true),
  ('00000000-0000-4000-8000-000000000002', 'network-administrator', 'Network Administrator', 'network administrator', true),
  ('00000000-0000-4000-8000-000000000003', 'operator', 'Operator', 'operator', true),
  ('00000000-0000-4000-8000-000000000004', 'auditor', 'Auditor', 'auditor', true),
  ('00000000-0000-4000-8000-000000000005', 'executive-viewer', 'Executive Viewer', 'executive viewer', true);

insert into public.role_permissions (role_id, permission_code)
select '00000000-0000-4000-8000-000000000001', permission_code
from public.permissions;

insert into public.role_permissions (role_id, permission_code) values
  ('00000000-0000-4000-8000-000000000002', 'assets.read'),
  ('00000000-0000-4000-8000-000000000002', 'assets.manage'),
  ('00000000-0000-4000-8000-000000000002', 'credentials.manage'),
  ('00000000-0000-4000-8000-000000000002', 'topology.read'),
  ('00000000-0000-4000-8000-000000000002', 'topology.manage'),
  ('00000000-0000-4000-8000-000000000002', 'topology.confirm'),
  ('00000000-0000-4000-8000-000000000002', 'observations.read'),
  ('00000000-0000-4000-8000-000000000002', 'observations.reprobe'),
  ('00000000-0000-4000-8000-000000000002', 'alerts.read'),
  ('00000000-0000-4000-8000-000000000002', 'alerts.acknowledge'),
  ('00000000-0000-4000-8000-000000000002', 'alerts.configure'),
  ('00000000-0000-4000-8000-000000000002', 'incidents.manage'),
  ('00000000-0000-4000-8000-000000000003', 'assets.read'),
  ('00000000-0000-4000-8000-000000000003', 'topology.read'),
  ('00000000-0000-4000-8000-000000000003', 'observations.read'),
  ('00000000-0000-4000-8000-000000000003', 'observations.reprobe'),
  ('00000000-0000-4000-8000-000000000003', 'alerts.read'),
  ('00000000-0000-4000-8000-000000000003', 'alerts.acknowledge'),
  ('00000000-0000-4000-8000-000000000003', 'incidents.manage'),
  ('00000000-0000-4000-8000-000000000004', 'assets.read'),
  ('00000000-0000-4000-8000-000000000004', 'topology.read'),
  ('00000000-0000-4000-8000-000000000004', 'observations.read'),
  ('00000000-0000-4000-8000-000000000004', 'alerts.read'),
  ('00000000-0000-4000-8000-000000000004', 'audit.read'),
  ('00000000-0000-4000-8000-000000000005', 'dashboard.executive.read');

insert into public.user_role_assignments (user_id, role_id)
select administrator_user_id, '00000000-0000-4000-8000-000000000001'
from public.platform_bootstrap_state
where administrator_user_id is not null;
