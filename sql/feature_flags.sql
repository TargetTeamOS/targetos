-- ═══════════════════════════════════════════════════════════════
-- Feature Flags (July 2026)
-- Admin-controlled kill switches + per-agent access for every new
-- feature going forward. Design rule: FAIL OPEN — a feature with no
-- row here behaves exactly as before this system existed, so adding
-- flags can never break the existing CRM.
-- Run in Supabase SQL editor BEFORE deploying the matching code.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════

create table if not exists feature_flags (
  key               text primary key,        -- e.g. 'mls_search'
  label             text not null,           -- shown in Admin UI
  description       text,
  enabled           boolean not null default true,
  -- null = all agents; otherwise only these agent ids (admins always pass)
  allowed_agent_ids uuid[],
  updated_by        uuid,
  updated_at        timestamptz not null default now()
);

alter table feature_flags enable row level security;

-- Everyone logged in can READ flags (the client needs them to render);
-- only admins can change them.
drop policy if exists ff_read  on feature_flags;
create policy ff_read on feature_flags for select to authenticated using (true);

drop policy if exists ff_write on feature_flags;
create policy ff_write on feature_flags for all to authenticated
  using (exists (
    select 1 from agents a
    where a.auth_user_id = auth.uid() and a.role = 'admin' and coalesce(a.active, true)
  ))
  with check (exists (
    select 1 from agents a
    where a.auth_user_id = auth.uid() and a.role = 'admin' and coalesce(a.active, true)
  ));

-- Seed today's features (idempotent; keeps admin edits on conflict)
insert into feature_flags (key, label, description) values
  ('mls_search',      'MLS Search',              'Agent MLS search (MLS Grid). Turning off hides the page and blocks the API for everyone.'),
  ('voice_capture',   'Voice Lead Capture',      'Mic button for voice-to-contact capture (Whisper transcription).'),
  ('contact_3col',    'Contact Page 3-Column Scroll', 'Independent scrolling columns on the contact page (off = classic whole-page scroll).')
on conflict (key) do nothing;

-- Pulse layout (July 2026): who may switch to the Monday-style skin
insert into feature_flags (key, label, description) values
  ('skin_pulse', 'Pulse Layout', 'The friendly Monday-style layout. Users with access can switch between Classic and Pulse in Settings → Appearance.')
on conflict (key) do nothing;

-- Bulk edit (July 2026): admins always have it; add specific agents in
-- Admin → Features to grant others. The dummy UUID keeps the allowlist
-- non-empty so it stays admin-only until you choose people.
insert into feature_flags (key, label, description, allowed_agent_ids) values
  ('bulk_edit', 'Bulk Edit', 'Multi-select records on boards and update a field for all at once. Admins always have it; grant specific agents here.',
   array['00000000-0000-0000-0000-000000000000']::uuid[])
on conflict (key) do nothing;
