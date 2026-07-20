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

-- ═══ v7 (7/19 late): hourly scheduling per playlist item ═══
alter table tv_playlist add column if not exists hours int[];
select 'hourly scheduling ready' as status;

-- ═══ v8 (7/19 late): seed the 4 Target Team card frames as ready templates ═══
-- (repair first: live card_templates may predate these columns)
alter table card_templates add column if not exists card_type     text;
alter table card_templates add column if not exists bg_image      text;
alter table card_templates add column if not exists photo_zone    jsonb;
alter table card_templates add column if not exists addr_layer    jsonb;
alter table card_templates add column if not exists price_layer   jsonb;
alter table card_templates add column if not exists details_layer jsonb;
alter table card_templates add column if not exists erase_zones   jsonb;
alter table card_templates add column if not exists thumbnail     text;
alter table listings add column if not exists photo_url text;
insert into card_templates (name, card_type, bg_image, photo_zone, created_at)
select * from (values
  ('Coming Soon (Team frame)',    'for_sale',     '/social-templates/coming-soon.jpg',    '{"x":18,"y":250,"w":1044,"h":640}'::jsonb, now()),
  ('Sold (Team frame)',           'sold_listing', '/social-templates/sold.jpg',           '{"x":18,"y":240,"w":1044,"h":650}'::jsonb, now()),
  ('Under Contract (Team frame)', 'uc_listing',   '/social-templates/under-contract.jpg', '{"x":18,"y":240,"w":1044,"h":650}'::jsonb, now()),
  ('Listing Sold (Team frame)',   'sold_listing', '/social-templates/listing-sold.jpg',   '{"x":18,"y":240,"w":1044,"h":650}'::jsonb, now())
) as v(name, card_type, bg_image, photo_zone, created_at)
where not exists (select 1 from card_templates where card_templates.name = v.name);
select name from card_templates order by created_at desc limit 6;

-- ═══ v9 (7/19 late): For Sale flyer template — 4 photos, price box, spec fields ═══
alter table card_templates add column if not exists layout jsonb;
insert into card_templates (name, card_type, bg_image, photo_zone, layout, created_at)
select 'For Sale Flyer (Team frame)', 'for_sale', '/social-templates/for-sale-flyer.jpg',
  '{"x":16,"y":253,"w":1048,"h":582}'::jsonb,
  '{
    "photo_zones":[{"x":0.5016,"y":0.5131,"w":0.4662,"h":0.1953},{"x":0.0241,"y":0.7084,"w":0.4775,"h":0.1951},{"x":0.5016,"y":0.7084,"w":0.4662,"h":0.1951}],
    "price_box":{"x":0.7721,"y":0.4777,"w":0.1745,"h":0.0332},
    "fields":[{"id":"house_type","x":0.088,"y":0.5367},{"id":"beds","x":0.292,"y":0.5367},{"id":"sqft","x":0.088,"y":0.5744},{"id":"baths","x":0.288,"y":0.5744}],
    "info":{"x":0.030,"y":0.612,"w":0.44,"h":0.088}
  }'::jsonb, now()
where not exists (select 1 from card_templates where name = 'For Sale Flyer (Team frame)');
select name from card_templates where name like '%(Team frame)%';


-- v9.1: correct the flyer zones (measured from artwork) even if the row was already seeded
update card_templates set layout = '{
  "photo_zones":[{"x":0.5016,"y":0.5131,"w":0.4662,"h":0.1953},{"x":0.0241,"y":0.7084,"w":0.4775,"h":0.1951},{"x":0.5016,"y":0.7084,"w":0.4662,"h":0.1951}],
  "price_box":{"x":0.7721,"y":0.4777,"w":0.1745,"h":0.0332},
  "fields":[{"id":"house_type","x":0.088,"y":0.5367},{"id":"beds","x":0.292,"y":0.5367},{"id":"sqft","x":0.088,"y":0.5744},{"id":"baths","x":0.288,"y":0.5744}],
  "info":{"x":0.030,"y":0.612,"w":0.44,"h":0.088}
}'::jsonb where name = 'For Sale Flyer (Team frame)';

-- ═══ v10 (7/19 late): contact-scoped automations ═══
create table if not exists contact_automations (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid not null,
  automation_id uuid not null,
  status        text not null default 'active',   -- active | stopped
  applied_by    uuid,
  applied_at    timestamptz not null default now(),
  unique (contact_id, automation_id)
);
alter table contact_automations enable row level security;
drop policy if exists contact_automations_all on contact_automations;
create policy contact_automations_all on contact_automations
for all to authenticated using (true) with check (true);
select 'contact_automations ready' as status;

-- ═══ v11 (7/19 late): buyer showings (was a leaked in-UI SQL note) ═══
create table if not exists contact_showings (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id),
  agent_id uuid references agents(id),
  address text not null, price numeric, mls_number text,
  showing_date date, showing_time text,
  interest_level int default 3, feedback text, notes text,
  created_at timestamptz default now()
);
alter table contact_showings enable row level security;
drop policy if exists contact_showings_all on contact_showings;
create policy contact_showings_all on contact_showings for all to authenticated using (true) with check (true);
select 'contact_showings ready' as status;

-- ═══ v12 (7/19 late): create all tables that pages exposed as in-UI SQL notes ═══
create table if not exists website_content (id uuid default gen_random_uuid() primary key, section text unique not null, content jsonb, updated_at timestamptz default now());
alter table website_content enable row level security;
drop policy if exists website_content_all on website_content;
create policy website_content_all on website_content for all to authenticated using (true) with check (true);

create table if not exists agent_goals (id uuid default gen_random_uuid() primary key, agent_id uuid references agents(id) on delete cascade, year int not null, deals int default 0, gci numeric default 0, production numeric default 0, leads int default 0, updated_at timestamptz default now(), unique(agent_id, year));
alter table agent_goals enable row level security;
drop policy if exists agent_goals_all on agent_goals;
create policy agent_goals_all on agent_goals for all to authenticated using (true) with check (true);

create table if not exists system_settings (id uuid primary key default gen_random_uuid(), key text unique not null, value jsonb, updated_at timestamptz default now());
alter table system_settings enable row level security;
drop policy if exists system_settings_all on system_settings;
create policy system_settings_all on system_settings for all to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public) values ('website-assets','website-assets', true) on conflict (id) do nothing;
drop policy if exists website_assets_all on storage.objects;
create policy website_assets_all on storage.objects for all to authenticated using (bucket_id='website-assets') with check (bucket_id='website-assets');

select 'page setup tables ready' as status;

-- ═══ v13: listing_showings (MyListings in-UI SQL note) ═══
create table if not exists listing_showings (id uuid primary key default gen_random_uuid(), listing_id uuid references listings(id), listing_addr text, agent_id uuid references agents(id), buyer_name text, agent_name text, showing_date date, showing_time text, interest_level int default 3, feedback text, notes text, created_at timestamptz default now());
alter table listing_showings enable row level security;
drop policy if exists listing_showings_all on listing_showings;
create policy listing_showings_all on listing_showings for all to authenticated using (true) with check (true);
select 'listing_showings ready' as status;

-- ═══ v14: daily briefing tables (were in a separate un-run migration) ═══
create table if not exists briefing_sends (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null, sent_date date not null, source text,
  created_at timestamptz not null default now(), unique (agent_id, sent_date)
);
create index if not exists idx_briefing_sends_date on briefing_sends (sent_date);
create table if not exists briefing_prefs (
  agent_id uuid primary key, enabled boolean default false, send_time text default '07:00',
  sections jsonb, email_style jsonb, custom_message text, updated_at timestamptz default now()
);
alter table briefing_prefs enable row level security;
drop policy if exists briefing_prefs_all on briefing_prefs;
create policy briefing_prefs_all on briefing_prefs for all to authenticated using (true) with check (true);
alter table briefing_sends enable row level security;
drop policy if exists briefing_sends_all on briefing_sends;
create policy briefing_sends_all on briefing_sends for all to authenticated using (true) with check (true);
select 'briefing tables ready' as status;

-- ═══ v15: dashboard settings (admin-set MLS watch areas, etc.) ═══
insert into system_settings (key, value) values
  ('dashboard_mls_areas', '{"cities":[],"maxprice":null,"minbeds":null}'::jsonb)
on conflict (key) do nothing;
select 'dashboard settings ready' as status;
