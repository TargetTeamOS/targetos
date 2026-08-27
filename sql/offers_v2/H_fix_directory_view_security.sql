-- ══════════════════════════════════════════════════════════════════
-- OFFERS WORKFLOW V2 · MIGRATION H-FIX — correct contacts_directory's
-- security_invoker bug
--
-- RUN THIS if you already applied H_shared_contact_directory.sql and
-- are seeing "other agents' contacts still don't show up" after
-- turning on the new toggle. This is a genuine bug in that file, not
-- a testing or setup issue — confirmed live: the view was created
-- with `security_invoker = true`, which makes it inherit the QUERYING
-- agent's own row-level permissions on the base `contacts` table.
-- Since that same migration tightens contacts_select to owner/admin/
-- secretary-only, a regular agent querying "the shared directory"
-- through that view saw only their OWN contacts — identical to
-- querying the base table directly. The entire point of the view was
-- to bypass that row restriction while keeping a narrow column list
-- as the actual safety boundary; security_invoker=true defeated that.
--
-- This statement simply re-creates the exact same view without that
-- setting (Postgres's long-standing default view behavior — the view
-- runs with its OWNER's privileges, not the caller's). Idempotent,
-- safe to run multiple times, changes no data, no other policy.
-- ══════════════════════════════════════════════════════════════════

create or replace view public.contacts_directory as
select
  id,
  first_name,
  last_name,
  phone,
  email,
  type
from public.contacts;

grant select on public.contacts_directory to authenticated;

-- ══════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ══════════════════════════════════════════════════════════════════
-- Confirm the view no longer carries security_invoker:
-- select relname, reloptions from pg_class where relname = 'contacts_directory';
-- expect: reloptions is NULL or does not contain "security_invoker=true"
--
-- Runtime persona check (requires two real Auth-linked agents):
-- As Agent B (not the owner of a given contact created by Agent A):
--   select * from contacts_directory where id = '<agent_a_contact_id>';
--   -- expect: 1 row now (previously returned 0 rows due to the bug)
