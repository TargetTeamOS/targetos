-- ============================================================================
-- 2026-10_missing_columns.sql — add every column the app saves but the
-- database is missing, then tell Supabase's API to pick them up right away.
-- ----------------------------------------------------------------------------
-- WHY: saves were failing with
--   "Could not find the 'custom_data' column of '<table>' in the schema cache"
--   (Tasks, Open House, Gifts, Signs — and TC Deals)
--   "Could not find the 'closing_qualifier' column of 'offers' ..."  (Offers)
-- The app code that writes these columns shipped, but the migrations that
-- create them (sql/offers_v2/J_extend_custom_data_to_all_boards.sql, and
-- the offers_v2 A/D/E/F/G column migrations) were never run on the live DB.
--
-- WHAT IT DOES:
--   1. custom_data jsonb on every board that's missing it (same as J).
--   2. Every column the Offers save sends (OffersV2.jsx saveOffer payload).
--      Columns from the offers_v2 migrations use their exact original
--      definitions; any other missing one gets a safe type.
--   3. Reloads the API schema cache (NOTIFY pgrst) so saves work at once.
--   4. Prints a check: the last result should be EMPTY (nothing missing).
--
-- SAFE: only ever ADDS columns ("add column if not exists"). Never drops,
-- renames, or changes data. A column that already exists is left exactly
-- as it is. Safe to re-run.
--
-- HOW: Supabase → SQL Editor → paste this whole file → Run.
-- ============================================================================

-- ── 1. custom_data on every board (migration J) ─────────────────────────────
alter table public.tc_deals    add column if not exists custom_data jsonb default '{}'::jsonb;
alter table public.tasks       add column if not exists custom_data jsonb default '{}'::jsonb;
alter table public.signs       add column if not exists custom_data jsonb default '{}'::jsonb;
alter table public.offers      add column if not exists custom_data jsonb default '{}'::jsonb;
alter table public.gifts       add column if not exists custom_data jsonb default '{}'::jsonb;
alter table public.open_houses add column if not exists custom_data jsonb default '{}'::jsonb;
-- (contacts, deals, listings already have it; repeated here harmlessly)
alter table public.contacts    add column if not exists custom_data jsonb default '{}'::jsonb;
alter table public.deals       add column if not exists custom_data jsonb default '{}'::jsonb;
alter table public.listings    add column if not exists custom_data jsonb default '{}'::jsonb;

-- ── 2a. Offers columns from the offers_v2 migrations (exact definitions) ────
-- A_foundation
alter table public.offers add column if not exists representing_side text
  check (representing_side in ('Buyer','Seller','Both')) default 'Buyer';
alter table public.offers add column if not exists buyers_agent_contact_id uuid references public.contacts(id);
alter table public.offers add column if not exists sellers_agent_contact_id uuid references public.contacts(id);
alter table public.offers add column if not exists mortgage_type text
  check (mortgage_type in ('dollar','percent')) default 'dollar';
alter table public.offers add column if not exists is_cash_deal boolean not null default false;
alter table public.offers add column if not exists accepted_at timestamptz;
alter table public.offers add column if not exists accepted_by uuid references public.agents(id);
alter table public.offers add column if not exists conversion_idempotency_key text;
-- D_closing_terms
alter table public.offers add column if not exists closing_mode text
  check (closing_mode in ('days','on_or_about','on_or_before','custom')) default 'days';
alter table public.offers add column if not exists closing_target_date date;
alter table public.offers add column if not exists closing_custom_text text;
-- E_deposit_type
alter table public.offers add column if not exists deposit_type text
  check (deposit_type in ('dollar','percent')) default 'dollar';
-- F_closing_qualifier
alter table public.offers add column if not exists closing_qualifier text
  check (closing_qualifier in ('on_or_about','on_or_before')) default 'on_or_about';
-- G_sellers_agent_snapshot
alter table public.offers add column if not exists sellers_agent_email text;
alter table public.offers add column if not exists sellers_agent_phone text;

-- ── 2b. Any other column the Offers save sends (no-op if it exists) ─────────
-- Money/percent/day fields use text when missing: the form can send values
-- like "10" or "10%", and text never rejects a save. Existing columns keep
-- whatever type they already have.
alter table public.offers add column if not exists listing_addr text;
alter table public.offers add column if not exists mls_number text;
alter table public.offers add column if not exists off_market boolean default false;
alter table public.offers add column if not exists buyer_name text;
alter table public.offers add column if not exists co_buyer_name text;
alter table public.offers add column if not exists buyer_contact_id uuid;
alter table public.offers add column if not exists buyer_phone text;
alter table public.offers add column if not exists buyer_email text;
alter table public.offers add column if not exists buyer_address text;
alter table public.offers add column if not exists seller_name text;
alter table public.offers add column if not exists seller_contact_id uuid;
alter table public.offers add column if not exists co_buyer_contact_id uuid;
alter table public.offers add column if not exists co_seller_contact_id uuid;
alter table public.offers add column if not exists co_seller_name text;
alter table public.offers add column if not exists sellers_agent_name text;
alter table public.offers add column if not exists seller_agent_company text;
alter table public.offers add column if not exists purchase_price numeric;
alter table public.offers add column if not exists deposit text;
alter table public.offers add column if not exists sellers_concession text;
alter table public.offers add column if not exists net_to_seller text;
alter table public.offers add column if not exists mortgage_amount text;
alter table public.offers add column if not exists mortgage_pct text;
alter table public.offers add column if not exists balance_at_closing text;
alter table public.offers add column if not exists balance_type text default 'dollar';
alter table public.offers add column if not exists closing_days text;
alter table public.offers add column if not exists subject_attorney boolean default false;
alter table public.offers add column if not exists subject_clear_title boolean default false;
alter table public.offers add column if not exists subject_mortgage boolean default false;
alter table public.offers add column if not exists subject_cash boolean default false;
alter table public.offers add column if not exists subject_standard_inspection boolean default false;
alter table public.offers add column if not exists subject_structural boolean default false;
alter table public.offers add column if not exists buyers_agent_id uuid;
alter table public.offers add column if not exists commission_pct text;
alter table public.offers add column if not exists additional_terms text;
alter table public.offers add column if not exists offer_date date;
alter table public.offers add column if not exists purchaser_attorney_name text;
alter table public.offers add column if not exists purchaser_attorney_address text;
alter table public.offers add column if not exists purchaser_attorney_tel text;
alter table public.offers add column if not exists purchaser_attorney_email text;
alter table public.offers add column if not exists purchaser_attorney_contact_id uuid;
alter table public.offers add column if not exists seller_attorney_name text;
alter table public.offers add column if not exists seller_attorney_address text;
alter table public.offers add column if not exists seller_attorney_tel text;
alter table public.offers add column if not exists seller_attorney_email text;
alter table public.offers add column if not exists seller_attorney_contact_id uuid;
alter table public.offers add column if not exists is_inhouse boolean default false;
alter table public.offers add column if not exists inhouse_listing_id text;
alter table public.offers add column if not exists notes text;
alter table public.offers add column if not exists status text default 'Draft';
alter table public.offers add column if not exists agent_id uuid;
alter table public.offers add column if not exists production text;
alter table public.offers add column if not exists side text;
alter table public.offers add column if not exists submitted_at timestamptz;
alter table public.offers add column if not exists deal_id uuid;
alter table public.offers add column if not exists updated_at timestamptz default now();

-- ── 3. Make the API see the new columns immediately ─────────────────────────
notify pgrst, 'reload schema';

-- ── 4. Check — this result should be EMPTY ──────────────────────────────────
-- Lists any column the app saves that still doesn't exist.
with expected(tbl, col) as (
  values
    ('tc_deals','custom_data'),('tasks','custom_data'),('signs','custom_data'),
    ('offers','custom_data'),('gifts','custom_data'),('open_houses','custom_data'),
    ('contacts','custom_data'),('deals','custom_data'),('listings','custom_data'),
    ('offers','listing_addr'),('offers','mls_number'),('offers','off_market'),
    ('offers','buyer_name'),('offers','co_buyer_name'),('offers','buyer_contact_id'),
    ('offers','buyer_phone'),('offers','buyer_email'),('offers','buyer_address'),
    ('offers','seller_name'),('offers','seller_contact_id'),('offers','co_buyer_contact_id'),
    ('offers','co_seller_contact_id'),('offers','co_seller_name'),('offers','sellers_agent_name'),
    ('offers','seller_agent_company'),('offers','purchase_price'),('offers','deposit'),
    ('offers','deposit_type'),('offers','sellers_concession'),('offers','net_to_seller'),
    ('offers','mortgage_amount'),('offers','mortgage_pct'),('offers','balance_at_closing'),
    ('offers','balance_type'),('offers','closing_days'),('offers','closing_mode'),
    ('offers','closing_target_date'),('offers','closing_custom_text'),('offers','closing_qualifier'),
    ('offers','subject_attorney'),('offers','subject_clear_title'),('offers','subject_mortgage'),
    ('offers','subject_cash'),('offers','subject_standard_inspection'),('offers','subject_structural'),
    ('offers','buyers_agent_id'),('offers','commission_pct'),('offers','additional_terms'),
    ('offers','offer_date'),('offers','purchaser_attorney_name'),('offers','purchaser_attorney_address'),
    ('offers','purchaser_attorney_tel'),('offers','purchaser_attorney_email'),
    ('offers','purchaser_attorney_contact_id'),('offers','seller_attorney_name'),
    ('offers','seller_attorney_address'),('offers','seller_attorney_tel'),
    ('offers','seller_attorney_email'),('offers','seller_attorney_contact_id'),
    ('offers','is_inhouse'),('offers','inhouse_listing_id'),('offers','notes'),('offers','status'),
    ('offers','agent_id'),('offers','production'),('offers','side'),('offers','representing_side'),
    ('offers','sellers_agent_contact_id'),('offers','sellers_agent_email'),
    ('offers','sellers_agent_phone'),('offers','buyers_agent_contact_id'),
    ('offers','mortgage_type'),('offers','is_cash_deal'),('offers','submitted_at'),
    ('offers','deal_id'),('offers','accepted_at'),('offers','accepted_by'),
    ('offers','conversion_idempotency_key')
)
select e.tbl as table_name, e.col as still_missing
from expected e
left join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = e.tbl and c.column_name = e.col
where c.column_name is null
order by 1, 2;
