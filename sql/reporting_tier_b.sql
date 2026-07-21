-- ═══════════════════════════════════════════════════════════════
-- Reporting Tier-B (July 2026) — fields that unlock commission
-- tracking, listing days-on-market/price history, and richer alerts.
-- All additive & nullable — nothing breaks existing data. Idempotent.
-- Run in Supabase → SQL Editor.
-- ═══════════════════════════════════════════════════════════════

-- Deals: commission lifecycle + freshness
alter table deals add column if not exists expected_gci      numeric;
alter table deals add column if not exists collected_gci     numeric;
alter table deals add column if not exists commission_status text default 'pending';  -- pending | billed | collected
alter table deals add column if not exists contract_date     date;   -- distinct from ao_date (accepted) & close_date
alter table deals add column if not exists next_step         text;
alter table deals add column if not exists next_step_due     date;
alter table deals add column if not exists last_activity_at  timestamptz;

-- Listings: days-on-market + price history + seller-update freshness
alter table listings add column if not exists listed_date       date;
alter table listings add column if not exists price_history     jsonb default '[]'::jsonb;
alter table listings add column if not exists seller_updated_at  timestamptz;

-- Contacts: lead contact tracking (for "uncontacted lead" alerts)
alter table contacts add column if not exists first_contact_at timestamptz;
alter table contacts add column if not exists last_contact_at  timestamptz;
alter table contacts add column if not exists contacted        boolean default false;

-- Backfill: treat existing closed deals' gci as collected so historical
-- numbers aren't all "outstanding". Safe to run once; re-running is a no-op
-- because it only touches rows still at the default 'pending'.
update deals set commission_status = 'collected', collected_gci = gci
  where stage = 'Closed' and commission_status = 'pending' and gci is not null;
