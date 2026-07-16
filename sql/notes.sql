-- ═══════════════════════════════════════════════════════════════
-- Notepad (July 2026)
-- Agent notes with optional voice recording + transcript. The audio
-- file is stored in the 'targetos-files' bucket; audio_url points to
-- it so agents can listen back if the transcript was inaccurate.
-- Run in Supabase SQL editor BEFORE deploying. Idempotent.
-- ═══════════════════════════════════════════════════════════════

create table if not exists notes (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid,
  title        text,
  body         text,               -- typed note or transcript
  transcript   text,               -- original speech transcript (if voice)
  audio_url    text,               -- playback URL of the saved recording
  audio_path   text,               -- storage path (for cleanup)
  -- optional link back to whatever the note relates to
  linked_type  text,               -- 'contact' | 'deal' | 'listing' | null
  linked_id    uuid,
  pinned       boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_notes_agent on notes (agent_id, created_at desc);
create index if not exists idx_notes_linked on notes (linked_type, linked_id);
