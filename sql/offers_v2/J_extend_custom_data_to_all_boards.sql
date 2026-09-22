-- ══════════════════════════════════════════════════════════════════
-- MIGRATION J — extend custom_data (no-code custom fields) to every
-- remaining board: TC Deals, Tasks, Signs, Offers, Gifts, Open Houses
--
-- BUILDS ON:
--   - src/lib/customFields.js / src/pages/CustomFields.jsx (the
--     no-code "Custom Fields" admin system — already live for
--     Contacts, Deals/Production, and Listings)
--   - sql/offers_v2/I_contacts_directory_deals_and_custom_fields.sql
--     (added custom_data to the shared contacts_directory view)
--
-- WHAT THIS ADDS: the same flexible `custom_data jsonb` bucket that
-- already exists on contacts/deals/listings, added to every other
-- record-style board in the CRM, so an admin can add a field to ANY
-- board from the Custom Fields page and have it show up on that
-- board's records immediately — no engineering work, no migration,
-- ever again, for any FIELD. (Adding custom fields to a BOARD that
-- doesn't have one yet still needs this one-time column — that's
-- what this migration does, once, for the 6 boards that were still
-- missing it as of Sept 2026.)
--
-- Idempotent. Safe to re-run. `add column if not exists` is a no-op
-- if a column is already there (e.g. if a later migration already
-- added it independently).
-- ══════════════════════════════════════════════════════════════════

alter table tc_deals    add column if not exists custom_data jsonb default '{}';
alter table tasks       add column if not exists custom_data jsonb default '{}';
alter table signs       add column if not exists custom_data jsonb default '{}';
alter table offers      add column if not exists custom_data jsonb default '{}';
alter table gifts       add column if not exists custom_data jsonb default '{}';
alter table open_houses add column if not exists custom_data jsonb default '{}';

-- ══════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ══════════════════════════════════════════════════════════════════
-- select table_name, column_name, data_type
--   from information_schema.columns
--   where table_schema = 'public' and column_name = 'custom_data'
--   order by table_name;
-- expect 9 rows: contacts, deals, gifts, listings, offers,
--   open_houses, signs, tasks, tc_deals

-- ══════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ══════════════════════════════════════════════════════════════════
-- Only do this if you're certain no custom field has been created for
-- these boards yet — dropping the column deletes any values already
-- saved in it.
-- alter table tc_deals    drop column if exists custom_data;
-- alter table tasks       drop column if exists custom_data;
-- alter table signs       drop column if exists custom_data;
-- alter table offers      drop column if exists custom_data;
-- alter table gifts       drop column if exists custom_data;
-- alter table open_houses drop column if exists custom_data;
