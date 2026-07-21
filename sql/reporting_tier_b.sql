-- ═══════════════════════════════════════════════════════════════
-- Reporting Tier-B (July 2026) — commission tracking, listing DOM/
-- price history, contact tracking, lead sources. Additive & nullable.
-- Idempotent. Run in Supabase → SQL Editor.
-- ═══════════════════════════════════════════════════════════════

-- Deals: commission lifecycle + freshness + side
alter table deals add column if not exists expected_gci      numeric;
alter table deals add column if not exists collected_gci     numeric;
alter table deals add column if not exists commission_status text default 'pending';  -- pending | partial | collected
alter table deals add column if not exists collected_date    date;
alter table deals add column if not exists payment_method    text;
alter table deals add column if not exists commission_notes  text;
alter table deals add column if not exists contract_date     date;
alter table deals add column if not exists next_step         text;
alter table deals add column if not exists next_step_due     date;
alter table deals add column if not exists last_activity_at  timestamptz;
-- 'side' may already exist; add if not. buyer | listing | dual
alter table deals add column if not exists side              text;

-- Listings: days-on-market + price history + seller-update freshness
alter table listings add column if not exists listed_date        date;
alter table listings add column if not exists original_price     numeric;
alter table listings add column if not exists price_history      jsonb default '[]'::jsonb;
alter table listings add column if not exists seller_updated_at   timestamptz;
alter table listings add column if not exists marketing_status    text;

-- Contacts: lead contact tracking
alter table contacts add column if not exists first_contact_at timestamptz;
alter table contacts add column if not exists last_contact_at  timestamptz;
alter table contacts add column if not exists contacted        boolean default false;

-- Lead sources (for ROI dashboard)
create table if not exists lead_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  monthly_cost numeric default 0,
  active boolean default true,
  created_at timestamptz default now()
);
alter table lead_sources enable row level security;
drop policy if exists ls_all on lead_sources;
create policy ls_all on lead_sources for all to authenticated using (true) with check (true);

-- One-time backfill: mark existing closed deals' GCI as collected so
-- historical totals aren't all "outstanding". Only touches still-pending rows.
update deals set commission_status = 'collected', collected_gci = gci
  where stage = 'Closed' and (commission_status is null or commission_status = 'pending') and gci is not null;
