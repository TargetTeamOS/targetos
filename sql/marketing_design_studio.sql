-- ═══════════════════════════════════════════════════════════════
-- Marketing Design Studio (July 2026)
-- Run in Supabase SQL editor BEFORE deploying the matching code.
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════

create table if not exists marketing_designs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Untitled design',
  width       integer not null default 1080,
  height      integer not null default 1080,
  background  jsonb,             -- {type:'color'|'gradient'|'image', color, color2, angle, url}
  elements    jsonb,             -- full element array (text/shape/image layers)
  is_template boolean not null default false,  -- shows in Templates for everyone
  created_by  uuid,              -- agent id
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);
create index if not exists idx_marketing_designs_creator  on marketing_designs (created_by);
create index if not exists idx_marketing_designs_template on marketing_designs (is_template);
