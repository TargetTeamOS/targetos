-- ═══════════════════════════════════════════════════════════════
-- Listing ↔ seller-contact link (July 2026)
-- Join table (mirrors deal_contacts) so a listing can have one or
-- more seller/owner/spouse/attorney contacts. Enables seller update
-- tracking + follow-up accountability tied to the right contact, and
-- makes listing addresses searchable under the contact in Contact
-- Health. Addresses are NOT duplicated into contacts. Idempotent.
-- ═══════════════════════════════════════════════════════════════

create table if not exists listing_contacts (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  role text default 'seller',          -- seller | owner | spouse | attorney | other
  primary_contact boolean default false,
  created_at timestamptz default now(),
  unique (listing_id, contact_id)
);
create index if not exists idx_listing_contacts_listing on listing_contacts (listing_id);
create index if not exists idx_listing_contacts_contact on listing_contacts (contact_id);
alter table listing_contacts enable row level security;
drop policy if exists listing_contacts_all on listing_contacts;
create policy listing_contacts_all on listing_contacts for all to authenticated using (true) with check (true);

-- Convenience single-seller column too (optional, kept in sync by the app
-- when a primary seller is chosen). Lets simple reads avoid a join.
alter table listings add column if not exists seller_contact_id uuid references contacts(id);

-- BACKFILL NOTE (run manually if desired): existing listings have no
-- seller link. There is no reliable existing column to infer it from,
-- so backfill is a manual/assisted step — e.g. match by owner name if
-- you store one, or set them via the listing form going forward.
