-- ═══════════════════════════════════════════════════════════════
-- Email Blast / Campaigns (July 2026)
-- Run in Supabase SQL editor BEFORE deploying the matching code.
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════

-- One row per blast sent (or drafted).
create table if not exists email_campaigns (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  subject      text not null,
  body_html    text,
  audience     jsonb,              -- {type:'all'|'status'|'tag'|'segment', value:...}
  status       text not null default 'draft',  -- draft | sending | sent | failed
  total        integer default 0,
  sent_count   integer default 0,
  fail_count   integer default 0,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);
create index if not exists idx_email_campaigns_created on email_campaigns (created_at desc);

-- Unsubscribe list — CAN-SPAM compliance. A contact on this list is
-- excluded from ALL future blasts. Keyed by email (not contact_id) so
-- it holds even if the contact record is later deleted/recreated.
create table if not exists email_unsubscribes (
  id          uuid primary key default gen_random_uuid(),
  email       text unique not null,
  reason      text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_email_unsub_email on email_unsubscribes (email);
