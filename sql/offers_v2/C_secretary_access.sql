-- ══════════════════════════════════════════════════════════════════
-- OFFERS WORKFLOW V2 · MIGRATION C — SECRETARY PARITY WITH EXISTING UI
-- NOT applied/verified on live DB. Requires A_foundation.sql already
-- applied. Idempotent (policies are dropped/recreated, not altered in
-- place). Additive/corrective only — no data changes.
--
-- WHY THIS EXISTS: A_foundation.sql's RLS policies only exempted
-- admins from the ownership check. That was an oversight, found while
-- reviewing secretary/custom-permission behavior for the live-beta
-- release: the CLIENT UI (src/pages/OffersV2.jsx, and the pre-existing
-- OffersLegacy.jsx before this project ever touched anything) has
-- always given secretaries board-wide visibility via
-- `canManage = isAdmin || isSecretary` (src/context/AuthContext.jsx).
-- Server-side RLS that didn't match would have silently blocked a
-- secretary from doing something the UI implies they can do (view/
-- generate/send for an offer they don't personally own) — exactly the
-- kind of RLS-vs-UI mismatch the handoff warns about. This migration
-- makes the two consistent. It does NOT give secretaries unrestricted
-- admin access generally — only this one already-established pattern
-- on this one board.
-- ══════════════════════════════════════════════════════════════════

drop policy if exists offers_select on offers;
create policy offers_select on offers for select to authenticated using (
  exists (select 1 from agents a where a.auth_user_id = auth.uid() and a.role in ('admin','secretary') and coalesce(a.active, true))
  or exists (
    select 1 from agents a
    where a.auth_user_id = auth.uid() and coalesce(a.active, true)
      and a.id in (offers.agent_id, offers.buyers_agent_id)
  )
);

drop policy if exists offers_write on offers;
create policy offers_write on offers for all to authenticated using (
  exists (select 1 from agents a where a.auth_user_id = auth.uid() and a.role in ('admin','secretary') and coalesce(a.active, true))
  or exists (
    select 1 from agents a
    where a.auth_user_id = auth.uid() and coalesce(a.active, true)
      and a.id in (offers.agent_id, offers.buyers_agent_id)
  )
) with check (
  exists (select 1 from agents a where a.auth_user_id = auth.uid() and a.role in ('admin','secretary') and coalesce(a.active, true))
  or exists (
    select 1 from agents a
    where a.auth_user_id = auth.uid() and coalesce(a.active, true)
      and a.id in (offers.agent_id, offers.buyers_agent_id)
  )
);

drop policy if exists offer_revisions_select on offer_revisions;
create policy offer_revisions_select on offer_revisions for select to authenticated using (
  exists (
    select 1 from agents a where a.auth_user_id = auth.uid() and coalesce(a.active, true)
      and (a.role in ('admin','secretary') or a.id in (
        select unnest(array[o.agent_id, o.buyers_agent_id]) from offers o where o.id = offer_revisions.offer_id
      ))
  )
);

drop policy if exists offer_revisions_write on offer_revisions;
create policy offer_revisions_write on offer_revisions for all to authenticated using (
  exists (
    select 1 from agents a where a.auth_user_id = auth.uid() and coalesce(a.active, true)
      and (a.role in ('admin','secretary') or a.id in (
        select unnest(array[o.agent_id, o.buyers_agent_id]) from offers o where o.id = offer_revisions.offer_id
      ))
  )
);

drop policy if exists offer_sends_select on offer_sends;
create policy offer_sends_select on offer_sends for select to authenticated using (
  exists (
    select 1 from agents a where a.auth_user_id = auth.uid() and coalesce(a.active, true)
      and (a.role in ('admin','secretary') or a.id in (
        select unnest(array[o.agent_id, o.buyers_agent_id]) from offers o where o.id = offer_sends.offer_id
      ))
  )
);

-- offer_sends_write is deliberately UNCHANGED: secretaries may VIEW
-- send history board-wide (above), but actually sending an email
-- still requires sent_by to match the authenticated agent themselves
-- (see A_foundation.sql's with-check) — a secretary cannot send an
-- offer email "as" another agent's connected mailbox. That distinction
-- is intentional, not an oversight, so it is left alone here.

-- ══════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ══════════════════════════════════════════════════════════════════
-- select tablename, policyname, cmd from pg_policies
--   where tablename in ('offers','offer_revisions','offer_sends')
--   order by tablename, policyname;
-- expect: same 6 policy names as A_verify.sql, unchanged count —
-- this migration replaces policy DEFINITIONS, not the set of policies.
--
-- Runtime persona test (requires a live secretary-role Auth user):
-- as Secretary: select * from offers;  -- expect ALL offers, not just
--   ones where agent_id/buyers_agent_id matches the secretary's own id
-- as Secretary: insert into offer_sends (...) values (... sent_by: <admin's id> ...);
--   -- expect REJECTED (with-check still requires sent_by = self)
