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

-- ═══════════════════════════════════════════════════════════════
-- v2 (7/19 late): PER-AGENT email accounts. Each agent connects
-- their own Outlook/Gmail; sends go out from THEIR mailbox. The
-- org-level integrations row remains the office fallback.
-- ═══════════════════════════════════════════════════════════════
create table if not exists integration_accounts (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null,
  provider      text not null check (provider in ('outlook','google')),
  account_email text,
  status        text not null default 'pending',   -- pending → connected | error
  secrets       jsonb not null default '{}'::jsonb, -- tokens; server-only
  last_error    text,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (agent_id, provider)
);
alter table integration_accounts enable row level security;
-- NO policies on purpose: browser can never read tokens; all access
-- goes through /api routes with the service key.

-- VERIFY
select 'integration_accounts ready' as status;

-- ═══ v3 (7/19 late): Team Chat + Mailchimp connectors ═══
insert into integrations (id, name) values
  ('teamchat', 'Slack / Teams Notifications'),
  ('mailchimp','Mailchimp')
on conflict (id) do nothing;
select id, name, status from integrations order by id;

-- ═══ v4 (7/19 late): Office TV display board ═══
insert into integrations (id, name) values ('display', 'Office TV Board')
on conflict (id) do nothing;
update integrations
set secrets = jsonb_build_object('webhook_secret', encode(gen_random_bytes(18), 'hex')),
    status = 'connected'
where id = 'display' and (secrets->>'webhook_secret') is null;
select id, name, status from integrations order by id;

-- ═══ v5 (7/19 late): TV announcements + display settings ═══
alter table announcements add column if not exists show_on_tv boolean default false;
alter table announcements add column if not exists celebrate  boolean default false;
-- default display settings (only fills blanks)
update integrations
set config = config || jsonb_build_object(
  'mode', coalesce(config->>'mode', 'dashboard'),
  'rotate_seconds', coalesce((config->>'rotate_seconds')::int, 45),
  'popup_seconds',  coalesce((config->>'popup_seconds')::int, 15),
  'announce_days',  coalesce((config->>'announce_days')::int, 3)
)
where id = 'display';
select 'tv announcements ready' as status;

-- ═══ v6 (7/19 late): TV Playlist + scheduling + media uploads ═══
create table if not exists tv_playlist (
  id         uuid primary key default gen_random_uuid(),
  position   int not null default 0,
  type       text not null check (type in ('dashboard','slides','image')),
  title      text,
  src        text,                        -- slides URL or image URL/storage path
  duration_seconds int not null default 30,
  enabled    boolean not null default true,
  days       text[],                      -- null = every day; else ['mon','tue',...]
  start_time time,                        -- null = all day
  end_time   time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table tv_playlist enable row level security;
drop policy if exists tv_playlist_all on tv_playlist;
create policy tv_playlist_all on tv_playlist
for all to authenticated using (true) with check (true);

-- per-announcement TV control
alter table announcements add column if not exists tv_until timestamptz;
alter table announcements add column if not exists tv_popup_seconds int;

-- storage bucket for uploaded TV media (public read so the TV can show it)
insert into storage.buckets (id, name, public) values ('tv-media','tv-media', true)
on conflict (id) do nothing;
drop policy if exists tv_media_upload on storage.objects;
create policy tv_media_upload on storage.objects
for insert to authenticated with check (bucket_id = 'tv-media');
drop policy if exists tv_media_delete on storage.objects;
create policy tv_media_delete on storage.objects
for delete to authenticated using (bucket_id = 'tv-media');
drop policy if exists tv_media_read on storage.objects;
create policy tv_media_read on storage.objects
for select using (bucket_id = 'tv-media');

select 'tv playlist ready' as status;
