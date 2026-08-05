-- ══════════════════════════════════════════════════════════════════
-- OFFERS WORKFLOW V2 · MIGRATION A — VERIFICATION (read-only)
-- Run after A_foundation.sql. Every block below states its expected
-- result; do not proceed to Commit 2's application code against a
-- live database until every line matches.
-- ══════════════════════════════════════════════════════════════════

-- ── New columns exist on offers ──
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'offers'
  and column_name in (
    'representing_side','buyers_agent_contact_id','sellers_agent_contact_id',
    'mortgage_type','is_cash_deal','accepted_at','accepted_by',
    'conversion_idempotency_key','current_revision_id'
  )
order by column_name;
-- expect: 9 rows, one per column above

-- ── New tables exist ──
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in ('offer_revisions','offer_sends');
-- expect: 2 rows, rowsecurity = true for both

-- ── Policies exist ──
select tablename, policyname, cmd from pg_policies
where tablename in ('offers','offer_revisions','offer_sends')
order by tablename, policyname;
-- expect: offers_select, offers_write, offer_revisions_select,
--         offer_revisions_write, offer_sends_select, offer_sends_write

-- ── offers RLS is actually enabled (not just policies defined) ──
select tablename, rowsecurity from pg_tables where tablename = 'offers';
-- expect: rowsecurity = true

-- ── No existing offers rows were touched ──
select count(*) as total_offers from offers;
-- expect: same count as before this migration ran (compare manually —
-- this migration performs zero UPDATE/DELETE on the offers table)

select count(*) as offers_missing_representing_side
from offers where representing_side is null;
-- expect: 0 — the column has a default, so every existing row should
-- backfill to 'Buyer' automatically on column add; a non-zero count
-- here means the default did not apply and needs investigation before
-- Commit 2 relies on this column being non-null

-- ══════════════════════════════════════════════════════════════════
-- RUNTIME PERSONA TESTS — must be run authenticated as each role via
-- the Supabase SQL editor's "run as" or a real per-role session token.
-- Not a static check; requires live Auth users linked to agents.
-- ══════════════════════════════════════════════════════════════════

-- As Agent A: expect only offers where agent_id/buyers_agent_id = Agent A
-- select * from offers;

-- As Agent A: attempt to select an offer owned by Agent B by known ID
-- expect: 0 rows (RLS silently filters, does not error)
-- select * from offers where id = '<agent_b_offer_id>';

-- As Agent A: attempt to insert a revision row for Agent B's offer
-- expect: insert rejected by offer_revisions_write policy
-- insert into offer_revisions (offer_id, revision_number, field_snapshot)
--   values ('<agent_b_offer_id>', 999, '{}'::jsonb);

-- As Admin: expect full offers list, unrestricted
-- select count(*) from offers;

-- As unauthenticated (anon key, no session): expect 0 rows everywhere
-- select * from offers;

-- ══════════════════════════════════════════════════════════════════
-- SHARED OUTSIDE-CONTACT ISOLATION (owner feedback section 7)
-- "Agent A sends three offers to Outside Agent Contact X. Agent A
-- sees those three offers under Contact X. Agent B does not
-- automatically see Agent A's offers to Contact X." This is enforced
-- entirely by the offers_select RLS policy (A_foundation.sql /
-- C_secretary_access.sql) — src/pages/ContactDetail.jsx's Related
-- Offers query has NO client-side agent filter of its own; it queries
-- offers by contact-role columns only and relies on RLS to do the
-- real filtering. That is intentional (frontend filtering alone is
-- not authorization), but it means this scenario is genuinely only
-- as safe as RLS actually being applied on the live database — verify
-- it directly:

-- Setup (once, using synthetic data): both Agent A and Agent B create
-- an offer that names the SAME outside seller's agent Contact X as
-- sellers_agent_contact_id.

-- As Agent A: expect to see ONLY Agent A's offer(s) referencing Contact X
-- select id, agent_id, buyers_agent_id from offers where sellers_agent_contact_id = '<contact_x_id>';

-- As Agent B: expect to see ONLY Agent B's offer(s) referencing Contact X,
-- NOT Agent A's, even though both point at the same Contact
-- select id, agent_id, buyers_agent_id from offers where sellers_agent_contact_id = '<contact_x_id>';

-- As Admin or Secretary: expect to see BOTH offers referencing Contact X
-- select id, agent_id, buyers_agent_id from offers where sellers_agent_contact_id = '<contact_x_id>';
