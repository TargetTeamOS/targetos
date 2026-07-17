-- ═══════════════════════════════════════════════════════════════
-- Listing Lifecycle Links (July 2026)
-- One listing, one source of truth across boards:
--   Prep (signed) → Listings (live, everyone) → Offer accepted →
--   Production deal → TC — with updates reflecting everywhere.
-- Run in Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════
alter table listing_prep add column if not exists listing_id uuid references listings(id);
alter table offers       add column if not exists deal_id    uuid references deals(id);
alter table tc_tasks     add column if not exists agent_visible boolean not null default false;
