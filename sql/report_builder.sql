-- ═══════════════════════════════════════════════════════════════
-- Report Builder (July 2026)
-- Custom scheduled report emails: admin-defined metrics, filters,
-- schedule (daily or weekly on a chosen weekday/time), recipients.
-- Run in Supabase SQL editor BEFORE deploying the matching code.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════

create table if not exists report_definitions (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  -- which metric blocks to include, in order:
  -- ['calls','deals','tasks','contacts','listings','offers','per_agent']
  blocks       jsonb not null default '[]'::jsonb,
  -- date window: 'week_to_date' | 'today' | 'last_7_days' | 'this_week' | 'this_month'
  range        text not null default 'week_to_date',
  -- filters: { agent_ids?: [], statuses?: [] }
  filters      jsonb default '{}'::jsonb,
  -- schedule: { type:'weekly'|'daily', weekday:5 (0=Sun), hour:17 } ET
  schedule     jsonb not null default '{"type":"weekly","weekday":5,"hour":17}'::jsonb,
  recipients   jsonb not null default '[]'::jsonb,   -- array of emails
  enabled      boolean not null default true,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  last_sent_at timestamptz
);
create index if not exists idx_report_defs_enabled on report_definitions (enabled);

-- Dedupe guard so a report can't send twice in the same slot.
create table if not exists report_sends (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null,
  sent_date  date not null,
  slot       text not null,          -- e.g. '17' (hour) so daily+weekly share cleanly
  created_at timestamptz not null default now(),
  unique (report_id, sent_date, slot)
);
