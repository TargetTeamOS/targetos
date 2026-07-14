-- ═══════════════════════════════════════════════════════════════
-- Daily Briefing hardening (July 2026)
-- Run in Supabase SQL editor BEFORE deploying the matching code.
-- ═══════════════════════════════════════════════════════════════

-- Once-per-day send guard: the unique constraint makes duplicate
-- briefings physically impossible (cron double-fire, cron + manual
-- overlap, endpoint retries — all collapse into one send per day).
create table if not exists briefing_sends (
  id         uuid primary key default gen_random_uuid(),
  agent_id   uuid not null,
  sent_date  date not null,
  source     text,             -- 'cron' | 'manual'
  created_at timestamptz not null default now(),
  unique (agent_id, sent_date)
);
create index if not exists idx_briefing_sends_date on briefing_sends (sent_date);
