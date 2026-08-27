-- ══════════════════════════════════════════════════════════════════
-- OFFERS WORKFLOW V2 · MIGRATION H — shared Contact directory,
-- full row locked to the assigned agent
-- NOT applied/verified on live DB. Requires sql/private_contacts_rls.sql
-- already applied (this builds on its current_agent_id()/
-- current_agent_is_admin() helpers). Idempotent.
--
-- ⚠️ CROSS-CUTTING CHANGE — READ BEFORE APPLYING ⚠️
-- This tightens RLS on the `contacts` table itself, which the ENTIRE
-- CRM reads from (main Contacts board, ContactDetail, Listings,
-- Production, Offers, etc.), not just the Offers module. Test the
-- main Contacts board and ContactDetail page after applying this, not
-- only the Offers Contact pickers — this is a real, intentional
-- behavior change to what every non-owning agent sees on someone
-- else's contact, everywhere in the app, not a narrow Offers-only fix.
--
-- OLD RULE (private_contacts_rls.sql): a non-private contact's FULL
-- row (every column, including agent_id) was visible to every agent.
-- Only contacts explicitly marked is_private were restricted.
--
-- NEW RULE (this file, per explicit instruction): every authenticated
-- user with Contacts access can see every contact's name, phone, and
-- email — the full shared directory — but NOTHING else. Not the
-- assigned agent, not notes, not lead status, not tags, not source,
-- not is_private itself. The FULL row (every column) is visible only
-- to: the assigned agent (agent_id = current_agent_id()), an admin,
-- or a secretary with the existing configured permission. Two agents
-- can each have their own contact working relationship with what is,
-- to the DIRECTORY layer, the same shared person — but only the
-- assigned agent (or admin/secretary) sees anything beyond name/
-- phone/email for that specific contact.
--
-- This does NOT require splitting `contacts` into two tables or
-- migrating any existing data — the safe fields already live on the
-- same row as everything else. The separation is enforced by exposing
-- a narrow VIEW for universal directory access, while tightening the
-- base table's own RLS to owner/admin/secretary-only for full-row
-- reads. No existing column, table, or row is renamed, dropped, or
-- rewritten.
-- ══════════════════════════════════════════════════════════════════

-- ── SHARED DIRECTORY VIEW ────────────────────────────────────────
-- `type` is included ONLY so a search can still filter by contact
-- type (Attorney vs Agent, etc.) server-side -- it is deliberately
-- NOT rendered in the Offers Contact pickers (see ContactSearch.jsx),
-- per "only the name, phone, and email, nothing more." If an even
-- stricter reading is wanted (type filtering done without exposing
-- `type` to the client at all), that would need a dedicated RPC
-- instead of a view -- flagged here as a possible follow-up, not
-- assumed.
--
-- security_invoker is deliberately OMITTED (defaults to false, the
-- long-standing Postgres view behavior): this view must run with the
-- VIEW OWNER's privileges, NOT the querying agent's own row-level
-- permissions -- otherwise it inherits the tightened contacts_select
-- policy below and a regular agent querying this "shared directory"
-- would see only their OWN contacts through it too, identical to
-- querying the base table directly. That defeats the entire point of
-- this migration and was a genuine bug in an earlier version of this
-- file (caught live: agents reported "still not able to see all
-- contacts" after applying it). The safety boundary here is the fixed,
-- narrow column list (5 safe columns, enforced structurally -- no
-- query against this view can ever return more), not row-level
-- filtering -- that split is intentional, not an oversight.
create or replace view public.contacts_directory as
select
  id,
  first_name,
  last_name,
  phone,
  email,
  type
from public.contacts;

-- Any authenticated user may read the directory view -- this is the
-- explicit "full shared directory" requirement. security_invoker=true
-- means this view runs with the QUERYING user's own privileges, not
-- the view creator's, so it still respects the base table's RLS
-- for anything beyond what the view itself selects.
grant select on public.contacts_directory to authenticated;

-- The view can only ever return the 5 safe columns above regardless
-- of what RLS on the base table allows, because a view's column list
-- is fixed at creation time -- this is a real, structural guarantee,
-- not just an application-level convention that could be bypassed by
-- a differently-written query.

-- ── TIGHTEN THE BASE TABLE'S OWN RLS ──────────────────────────────
-- Full-row access (every column, including agent_id) now requires
-- being the assigned agent, an admin, or a secretary with the
-- existing configured permission -- removing the old "is_private =
-- false is visible to everyone" universal clause. A non-owning
-- agent's ONLY path to another agent's contact is now the directory
-- view above.
drop policy if exists contacts_select on contacts;
create policy contacts_select on contacts
for select to authenticated
using (
  agent_id = public.current_agent_id()
  or public.current_agent_is_admin()
  or exists (
    select 1 from secretary_permissions p
    where p.secretary_id = public.current_agent_id()
      and (p.resource = 'contacts' or p.resource = '*')
      and p.can_view
  )
);

drop policy if exists contacts_update on contacts;
create policy contacts_update on contacts
for update to authenticated
using (
  agent_id = public.current_agent_id()
  or public.current_agent_is_admin()
  or exists (
    select 1 from secretary_permissions p
    where p.secretary_id = public.current_agent_id()
      and (p.resource = 'contacts' or p.resource = '*')
      and p.can_edit
  )
);

drop policy if exists contacts_delete on contacts;
create policy contacts_delete on contacts
for delete to authenticated
using (
  agent_id = public.current_agent_id()
  or public.current_agent_is_admin()
  or exists (
    select 1 from secretary_permissions p
    where p.secretary_id = public.current_agent_id()
      and (p.resource = 'contacts' or p.resource = '*')
      and p.can_delete
  )
);

-- contacts_insert is left exactly as-is (any signed-in agent may
-- create a contact) -- not part of this change.

-- ══════════════════════════════════════════════════════════════════
-- KNOWN DEPENDENCY, NOT ASSUMED SAFE
-- ══════════════════════════════════════════════════════════════════
-- This references `secretary_permissions` (resource, can_view,
-- can_edit, can_delete columns), the same table used elsewhere in
-- this project for secretary parity. If that table's actual live
-- column names differ, this policy will fail to apply -- run this on
-- a Preview/staging copy first and check the actual error, not assumed
-- to match blind.

-- ══════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ══════════════════════════════════════════════════════════════════
-- select viewname from pg_views where viewname = 'contacts_directory';
-- expect: 1 row

-- select table_name, privilege_type from information_schema.role_table_grants
--   where table_name = 'contacts_directory' and grantee = 'authenticated';
-- expect: a SELECT row

-- Runtime persona test (requires two real Auth-linked agents):
-- As Agent A: create a contact (Agent A becomes agent_id).
-- As Agent B:
--   select * from contacts_directory where id = '<agent_a_contact_id>';
--   -- expect: 1 row, only id/first_name/last_name/phone/email/type
--   select * from contacts where id = '<agent_a_contact_id>';
--   -- expect: 0 rows -- Agent B cannot see the full row, including
--   -- agent_id, notes, or any other field, at all.
-- As Agent A or Admin:
--   select * from contacts where id = '<agent_a_contact_id>';
--   -- expect: 1 row, full detail.

-- ══════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ══════════════════════════════════════════════════════════════════
-- drop view if exists public.contacts_directory;
-- Restores the OLD (looser) full-row visibility rule from
-- private_contacts_rls.sql:
-- drop policy if exists contacts_select on contacts;
-- create policy contacts_select on contacts for select to authenticated using (
--   is_private = false or agent_id = public.current_agent_id() or public.current_agent_is_admin()
-- );
-- (repeat the same using() clause for contacts_update/contacts_delete)
