-- ═══════════════════════════════════════════════════════════════
-- Board Connectivity (July 2026)
-- Run in Supabase SQL editor BEFORE deploying the matching code.
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════

-- Production deals hard-link to their listing (the TC Board already
-- links both via linked_deal_id / linked_listing_id; this closes the
-- triangle so Production ↔ Listings connect without going through TC).
alter table deals add column if not exists listing_id uuid;
create index if not exists idx_deals_listing on deals (listing_id);

-- Gifts tie to the Contacts board
alter table gifts add column if not exists contact_id uuid;
create index if not exists idx_gifts_contact on gifts (contact_id);

-- Offers: persist the seller's contact link (seller search already
-- existed; the stored link did not)
alter table offers add column if not exists seller_contact_id uuid;
create index if not exists idx_offers_seller_contact on offers (seller_contact_id);
