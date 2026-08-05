-- ============================================================================
-- notes_ensure.sql   (additive, rerunnable)
-- Guarantees the `notes` table and the columns the voice recorder / Notepad
-- write to actually exist, so saved recordings persist. Safe to run whether or
-- not sql/notes.sql was applied before. No data changed; no RLS toggled.
-- ============================================================================
begin;

create table if not exists public.notes (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid,
  title        text,
  body         text,
  transcript   text,
  audio_url    text,
  audio_path   text,
  linked_type  text,
  linked_id    uuid,
  pinned       boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- If an older `notes` table already exists, make sure the recorder's columns are present.
alter table public.notes
  add column if not exists transcript  text,
  add column if not exists audio_url   text,
  add column if not exists audio_path  text,
  add column if not exists linked_type text,
  add column if not exists linked_id   uuid,
  add column if not exists pinned      boolean not null default false,
  add column if not exists updated_at  timestamptz not null default now();

create index if not exists idx_notes_agent  on public.notes (agent_id, created_at desc);
create index if not exists idx_notes_linked on public.notes (linked_type, linked_id);

-- Ensure the app role can read/write notes (harmless if already granted).
grant select, insert, update, delete on public.notes to authenticated;

commit;
