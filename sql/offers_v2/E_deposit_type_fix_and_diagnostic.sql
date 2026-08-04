-- ══════════════════════════════════════════════════════════════════
-- OFFERS WORKFLOW V2 · MIGRATION E — deposit_type fix + diagnostic
-- NOT applied/verified on live DB. Idempotent. Additive only.
--
-- SAME MISTAKE AS balance_type (migration already applied): the
-- original pre-project code referenced offers.deposit_type in its
-- save payload, and A_foundation.sql's own header comment claimed
-- "ALREADY EXISTS" -- an unverified inference from seeing it in code,
-- not a live schema check (none was possible from this environment).
-- It was wrong, exactly like balance_type. Confirmed by the same live
-- "Could not find the column" error. Fixing it the same way.
-- ══════════════════════════════════════════════════════════════════

alter table offers add column if not exists deposit_type text
  check (deposit_type in ('dollar','percent')) default 'dollar';

-- ══════════════════════════════════════════════════════════════════
-- DIAGNOSTIC — run this any time to catch a missing column BEFORE an
-- agent hits a "Save failed" error with it. Compares every column the
-- application code actually references against what really exists on
-- the live table. Safe: read-only, changes nothing.
-- ══════════════════════════════════════════════════════════════════
with app_columns(col) as (
  values
    ('additional_terms'),('addr'),('agent_id'),('ao_date'),('balance_at_closing'),
    ('balance_type'),('buyer_address'),('buyer_contact_id'),('buyer_email'),
    ('buyer_name'),('buyer_phone'),('buyers_agent_id'),('client_name'),
    ('closing_days'),('closing_mode'),('closing_target_date'),('closing_custom_text'),
    ('co_buyer_contact_id'),('co_buyer_name'),('co_seller_contact_id'),
    ('co_seller_name'),('commission_pct'),('created_at'),('deposit'),
    ('deposit_type'),('feedback'),('inhouse_listing_id'),('interest_level'),
    ('is_inhouse'),('listing_addr'),('listing_id'),('mls_number'),
    ('mortgage_amount'),('mortgage_pct'),('mortgage_type'),('net_to_seller'),
    ('notes'),('off_market'),('offer_date'),('production'),('purchase_price'),
    ('purchaser_attorney_address'),('purchaser_attorney_contact_id'),
    ('purchaser_attorney_email'),('purchaser_attorney_name'),
    ('purchaser_attorney_tel'),('representing_side'),('seller_attorney_address'),
    ('seller_attorney_contact_id'),('seller_attorney_email'),
    ('seller_attorney_name'),('seller_attorney_tel'),('seller_contact_id'),
    ('seller_name'),('sellers_agent_name'),('sellers_agent_contact_id'),
    ('sellers_agent_email'),('sellers_concession'),('showing_date'),('side'),
    ('stage'),('status'),('subject_attorney'),('subject_cash'),
    ('subject_clear_title'),('subject_mortgage'),('subject_standard_inspection'),
    ('subject_structural'),('submitted_at')
)
select app_columns.col as column_referenced_by_app_code
from app_columns
left join information_schema.columns ic
  on ic.table_name = 'offers' and ic.column_name = app_columns.col
where ic.column_name is null;
-- expect: 0 rows. Any row returned here is a live "Save failed" bug
-- waiting to happen -- same class as balance_type/deposit_type.
