-- TargetOS Phase 2: minimal, idempotent connector schema.
-- Apply after access_and_contact_directory.sql. This replaces the need to run
-- the historical catch-all sql/connectors.sql file for email/OAuth setup.
-- It preserves every existing connector, credential, token and event row.

begin;

create table if not exists public.integrations (
  id text primary key,
  name text not null,
  status text not null default 'not_configured',
  config jsonb not null default '{}'::jsonb,
  secrets jsonb not null default '{}'::jsonb,
  last_error text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.integration_accounts (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  provider text not null check (provider in ('outlook', 'google')),
  account_email text,
  status text not null default 'pending',
  secrets jsonb not null default '{}'::jsonb,
  last_error text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (agent_id, provider)
);

create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  integration_id text,
  direction text,
  event text,
  detail jsonb,
  ok boolean default true,
  created_at timestamptz not null default now()
);

insert into public.integrations (id, name) values
  ('outlook', 'Microsoft Outlook'),
  ('google', 'Google (Gmail + Calendar)')
on conflict (id) do nothing;

create index if not exists integration_accounts_agent_provider_idx
  on public.integration_accounts(agent_id, provider);
create index if not exists integration_events_created_at_idx
  on public.integration_events(created_at desc);

alter table public.integrations enable row level security;
alter table public.integration_accounts enable row level security;
alter table public.integration_events enable row level security;

-- No browser policy is created for credential/token tables. All access is
-- through authenticated API routes using the server-only service role.
revoke all on public.integrations from public, anon, authenticated;
revoke all on public.integration_accounts from public, anon, authenticated;

drop policy if exists integration_events_read on public.integration_events;
drop policy if exists integration_events_office_read on public.integration_events;
create policy integration_events_office_read on public.integration_events
  for select to authenticated
  using (public.app_current_agent_role() in ('admin', 'secretary'));

commit;
