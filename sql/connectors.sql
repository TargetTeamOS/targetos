-- ═══════════════════════════════════════════════════════════════
-- Connectors / Integrations (July 19, 2026)
-- One row per connector (outlook, google, zapier, apination).
--   config  = non-secret settings (client_id, from address, etc.)
--   secrets = client_secret, OAuth tokens, webhook secrets.
-- RLS is enabled with NO policies → the browser client can never
-- read this table at all. Every read/write goes through
-- /api/connectors.js (service key), which strips secrets.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════

create table if not exists integrations (
  id         text primary key,          -- 'outlook' | 'google' | 'zapier' | 'apination'
  name       text not null,
  status     text not null default 'not_configured',
  -- not_configured → needs_connect → connected | error
  config     jsonb not null default '{}'::jsonb,
  secrets    jsonb not null default '{}'::jsonb,
  last_error text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table integrations enable row level security;
-- intentionally NO policies: anon/authenticated get nothing;
-- service key (API routes) bypasses RLS.

create table if not exists integration_events (
  id         uuid primary key default gen_random_uuid(),
  integration_id text,
  direction  text,           -- 'in' | 'out'
  event      text,           -- 'contact.create', 'email.send', ...
  detail     jsonb,
  ok         boolean default true,
  created_at timestamptz not null default now()
);
alter table integration_events enable row level security;
drop policy if exists integration_events_read on integration_events;
create policy integration_events_read on integration_events
for select to authenticated using (true);   -- log is visible in-app

insert into integrations (id, name) values
  ('outlook',  'Microsoft Outlook'),
  ('google',   'Google (Gmail + Sheets)'),
  ('zapier',   'Zapier'),
  ('apination','API Nation / Brivity')
on conflict (id) do nothing;

-- Give the webhook connectors a random inbound secret on first run
update integrations
set secrets = jsonb_build_object('webhook_secret', encode(gen_random_bytes(18), 'hex')),
    status = 'needs_connect'
where id in ('zapier','apination')
  and (secrets->>'webhook_secret') is null;

-- VERIFY: should list 4 rows, statuses set, and running as service
-- role you'll see secrets — the app never will.
select id, name, status from integrations order by id;
