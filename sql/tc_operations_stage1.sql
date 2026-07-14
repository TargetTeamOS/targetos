-- ═══════════════════════════════════════════════════════════════
-- TC Operations — Stage 1 (July 2026)
-- Run in Supabase SQL editor BEFORE deploying the matching code.
-- All statements idempotent (safe to re-run).
-- ═══════════════════════════════════════════════════════════════

-- People on a TC deal, linked to the Contacts board (one contact
-- record, referenced — never duplicated).
create table if not exists tc_participants (
  id          uuid primary key default gen_random_uuid(),
  tc_deal_id  uuid not null,
  contact_id  uuid not null,
  role        text not null,          -- 'Seller', 'Buyer''s Agent', 'Mortgage Broker', 'Attorney (Seller)', etc. — list is admin-editable in TC Settings
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_tc_participants_deal    on tc_participants (tc_deal_id);
create index if not exists idx_tc_participants_contact on tc_participants (contact_id);

-- Documents on a TC deal (KW Command links etc.) with a status
-- whose options are admin-editable in TC Settings.
create table if not exists tc_documents (
  id          uuid primary key default gen_random_uuid(),
  tc_deal_id  uuid not null,
  name        text not null,
  url         text,
  status      text not null default 'Not Sent',
  sent_at     timestamptz,
  signed_at   timestamptz,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);
create index if not exists idx_tc_documents_deal on tc_documents (tc_deal_id);

-- Photography orders (secretary books externally; system tracks).
create table if not exists tc_photography (
  id                       uuid primary key default gen_random_uuid(),
  tc_deal_id               uuid not null,
  photographer_contact_id  uuid,               -- from Contacts board
  services                 jsonb,              -- [{id,label,price}] snapshot at time of order
  total                    numeric,
  scheduled_at             timestamptz,
  status                   text not null default 'Needs Prep',  -- Needs Prep / Ready / Scheduled / Shot / Photos Received
  readiness                jsonb,              -- { "checklist item": true/false }
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz
);
create index if not exists idx_tc_photography_deal      on tc_photography (tc_deal_id);
create index if not exists idx_tc_photography_scheduled on tc_photography (scheduled_at);
