-- ══════════════════════════════════════════════════════════════════
-- OFFERS WORKFLOW V2 · MIGRATION I — extend the shared contacts
-- directory with custom fields and a safe past-deals summary
--
-- BUILDS ON sql/offers_v2/H_shared_contact_directory.sql (and its
-- follow-up fix, H_fix_directory_view_security.sql), which already
-- created public.contacts_directory as a narrow, universally-readable
-- view (id/first_name/last_name/phone/email/type) while the base
-- `contacts` table itself stays locked to the assigned agent, admins,
-- and permitted secretaries. This migration does NOT touch that base
-- table lock at all — confirmed still correctly in place on this
-- database (owner OR admin OR secretary, no other loophole) — it only
-- widens the DIRECTORY VIEW's column list.
--
-- WHAT THIS ADDS, per explicit instruction: every authenticated agent
-- browsing the shared directory (someone else's contact) should also
-- see that contact's custom fields (whatever they are — this is
-- schema-free by design so new custom fields added later need no
-- further migration) and a SAFE summary of past deals: property
-- address and deal stage only. Deliberately NOT included: sale price
-- or GCI/commission on either `deals` or `tc_deals` — those stay
-- private to the owning agent (and admins), matching how commission
-- figures are normally kept confidential between agents even at the
-- same brokerage. If that changes later, add sale_price/gci to the
-- jsonb_build_object calls below — nothing else needs to change.
--
-- Idempotent. Safe to re-run. Changes no data — this only redefines a
-- VIEW (a saved query, computed fresh every time it's read), so there
-- is nothing to roll back at the data level; see ROLLBACK at the
-- bottom to simply drop back to the narrower column list.
--
-- ⚠️ CREATE OR REPLACE VIEW requires the existing columns to stay in
-- the same names/order — new columns must be appended at the end.
-- That's exactly what this does (custom_data, deals appended after
-- the 6 existing columns), so this is safe to run even if the
-- original narrower view is already live and already in use by the
-- app.
-- ═══════════════════════════════════════════════════════════════

create or replace view public.contacts_directory as
select
  c.id,
  c.first_name,
  c.last_name,
  c.phone,
  c.email,
  c.type,
  c.custom_data,
  -- Past deals, address + stage only, from both this team's own
  -- production deals and any Transaction Coordinator deal this
  -- contact participates in. No financial figures included.
  --
  -- CORRECTED: `deals` has no `contact_id` column at all (confirmed
  -- live -- the first version of this migration assumed one and
  -- failed with 42703 the moment it was run). A production deal is
  -- linked to a contact through the `deal_contacts` join table
  -- (deal_id, contact_id, role) instead -- see its usage throughout
  -- src/pages/Production.jsx. ContactDetail.jsx's own "past deals"
  -- query (loadRelated(), line ~1374) has this exact same bug --
  -- `.eq('contact_id', id)` against `deals` -- but silently returns
  -- an empty list instead of erroring, because it reads only
  -- `r.data || []` from the response without ever checking
  -- `r.error`. That's a separate, pre-existing bug in the app (not
  -- introduced here, and not fixed by this migration) worth a
  -- follow-up: production deals have likely never actually shown up
  -- in any contact's "Past Deals" section.
  coalesce(
    (
      select jsonb_agg(jsonb_build_object('id', d.id, 'addr', d.addr, 'stage', d.stage) order by d.id)
      from public.deal_contacts dc
      join public.deals d on d.id = dc.deal_id
      where dc.contact_id = c.id
    ),
    '[]'::jsonb
  )
  ||
  coalesce(
    (
      select jsonb_agg(jsonb_build_object('id', td.id, 'addr', td.addr, 'stage', td.tc_phase) order by td.id)
      from public.tc_participants tp
      join public.tc_deals td on td.id = tp.tc_deal_id
      where tp.contact_id = c.id
    ),
    '[]'::jsonb
  ) as deals
from public.contacts c;

-- security_invoker is deliberately OMITTED here too (see
-- H_fix_directory_view_security.sql for the full explanation of why):
-- this view must keep running with the VIEW OWNER's privileges, not
-- the querying agent's own row-level permissions, or a regular agent
-- would only ever see their own contacts (and own deals) through it —
-- identical to querying the base tables directly, defeating the whole
-- point of a shared directory.

grant select on public.contacts_directory to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════
-- Confirm the view now exposes the new columns:
-- select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'contacts_directory'
--   order by ordinal_position;
-- expect: id, first_name, last_name, phone, email, type, custom_data, deals

-- Runtime persona check (requires two real Auth-linked agents; run
-- from the app, not the SQL editor, which uses the service role and
-- bypasses RLS entirely):
-- As Agent B (not the owner of a contact created by Agent A that has
-- at least one deal and one custom field):
--   select * from contacts_directory where id = '<agent_a_contact_id>';
--   -- expect: 1 row, with custom_data populated and deals showing
--   -- addr/stage but no gci or sale_price anywhere in the JSON.

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- Restores the narrower column list from H_shared_contact_directory.sql:
-- create or replace view public.contacts_directory as
-- select id, first_name, last_name, phone, email, type
-- from public.contacts;
-- grant select on public.contacts_directory to authenticated;
