-- ══════════════════════════════════════════════════════════════════
-- PHASE 1 · SECURITY TEST MATRIX + POST-MIGRATION VERIFICATION
-- Run AFTER Migration C (and only once B confirms all users linked).
-- Run each block while authenticated AS the role being tested (use the
-- Supabase SQL editor's "run as" / a real session token per role).
-- ══════════════════════════════════════════════════════════════════

-- ── VERIFY A applied ──
select proname from pg_proc where proname like 'app\_%' order by proname;   -- expect the helper set
select * from pg_views where viewname = 'v_deals_canonical';                 -- expect 1 row
select value from system_settings where key='team_goal_2026';               -- expect {"closed_deals":300,...}
select count(*) as official_closed_2026 from v_deals_canonical
  where is_closed_official and close_date >= '2026-01-01' and close_date < '2027-01-01';  -- expect ~89 pre-cleanup

-- ── VERIFY C applied (policies are restrictive, not USING(true)) ──
select tablename, policyname, cmd, qual
from pg_policies
where schemaname='public' and tablename in ('deals','contacts','tasks')
order by tablename, cmd;   -- qual should reference app_current_agent_id()/app_is_admin(), NOT 'true'

-- ── AGENT TESTS (run as a linked agent) ──
-- A1 sees own deals only:
select count(*) as my_deals from deals;                      -- should equal only their rows
-- A2 cannot see others (direct query) — this count must NOT include other agents:
select count(*) filter (where agent_id <> app_current_agent_id()) as leaked from deals;  -- expect 0
-- A3 cannot insert under another agent (should ERROR / 0 rows):
-- insert into deals(agent_id, stage) values ('<OTHER_AGENT_UUID>','Closed');  -- expect: violates WITH CHECK
-- A4 cannot reassign ownership (should ERROR):
-- update deals set agent_id='<OTHER_AGENT_UUID>' where agent_id=app_current_agent_id();  -- expect: violates WITH CHECK
-- A5 team aggregate WITHOUT raw rows (allowed):
select app_dashboard_summary('team', null, '2026-01-01','2027-01-01');  -- returns totals, no rows

-- ── ADMIN TESTS (run as admin) ──
select app_is_admin();                                       -- true
select app_dashboard_summary('team', null, '2026-01-01','2027-01-01');   -- company totals
select app_dashboard_summary('agent', '<AGENT_UUID>', '2026-01-01','2027-01-01');  -- that agent's totals

-- ── SECRETARY TESTS (run as secretary, after grants exist) ──
select app_is_secretary();                                   -- true, and app_is_admin() must be false
select app_can_view_agent('<GRANTED_AGENT_UUID>');           -- true
select app_can_view_agent('<UNGRANTED_AGENT_UUID>');         -- false
select app_can_view_financials();                            -- matches their grant

-- ── CALCULATION TESTS ──
-- closed uses close_date not ao_date; dups excluded:
select count(*) from v_deals_canonical where is_closed_official
  and close_date >= '2026-01-01' and close_date < '2027-01-01';  -- 89 pre-cleanup, stays 89 after (dups already excluded)
-- data-quality (admin):
select app_data_quality();   -- closed_missing_close_date, deals_missing_agent, suspected_duplicates, agents_missing_goal
