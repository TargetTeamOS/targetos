-- ══════════════════════════════════════════════════════════════════
-- PHASE 1 · MIGRATION A (v4) — PARTIAL FOUNDATION ROLLBACK
-- ⚠ PARTIAL by design. Removes the reporting layer + non-identity helpers
-- while PRESERVING stateful data and the identity helpers its policies need.
--   KEPT: team_goals (+policies) — your 300 goal & edits; never auto-dropped.
--   KEPT: secretary_permissions (+policies) if it has grant rows (dropped if empty).
--   KEPT: app_is_admin() & app_current_agent_id() — preserved policies depend on them.
--   KEPT: deals columns is_duplicate/is_test/archived_at/deleted_at/duplicate_of/expected_gci.
-- Idempotent: safe if A only partially applied or objects are absent.
-- Clears the phase1_A migration record so state is consistent afterward.
-- NOTE: because team_goals is preserved, a clean REINSTALL of A requires the
-- COMPLETE TEARDOWN appendix at the bottom (export + drop). A will otherwise
-- abort on the team_goals collision check — by design.
-- ══════════════════════════════════════════════════════════════════
begin;

-- 1. reporting RPC + readers + data-quality
drop function if exists public.app_dashboard_summary(text,uuid,date,date);
drop function if exists public.app_agent_goal(uuid,int);
drop function if exists public.app_team_goal(int);
drop function if exists public.app_data_quality(int);

-- 2. scope/permission helpers NOT required by preserved policies
drop function if exists public.app_report_scope_ok(text,uuid,text);
drop function if exists public.app_can_view_team(text);
drop function if exists public.app_can_view_financials(uuid,text,text);
drop function if exists public.app_can_access_unassigned(text);
drop function if exists public.app_can_delete(uuid,text);
drop function if exists public.app_can_complete(uuid,text);
drop function if exists public.app_can_assign(uuid,text);
drop function if exists public.app_can_edit_resource(uuid,text);
drop function if exists public.app_can_create_for(uuid,text);
drop function if exists public.app_can_view_agent(uuid,text);
drop function if exists public.app_is_secretary();
drop function if exists public.app_is_agent();
-- KEPT intentionally: public.app_is_admin(), public.app_current_agent_id()

-- 3. internal canonical view
drop view if exists public.v_deals_canonical;

-- 4. migration-owned indexes only
drop index if exists public.idx_a1_deals_close_date;
drop index if exists public.idx_a1_deals_report;
drop index if exists public.idx_a1_tasks_overdue;
drop index if exists public.idx_a1_cal_agent_start;

-- 5. preserve/dispose stateful tables; idempotent; disclose
do $$
declare sp_rows int;
begin
  if to_regclass('public.secretary_permissions') is null then
    raise notice 'secretary_permissions absent — nothing to preserve.';
  else
    select count(*) into sp_rows from public.secretary_permissions;
    if sp_rows = 0 then
      drop policy if exists secretary_permissions_admin on public.secretary_permissions;
      drop policy if exists secretary_permissions_selfread on public.secretary_permissions;
      drop table public.secretary_permissions;
      raise notice 'secretary_permissions was empty → dropped (policies removed).';
    else
      raise notice 'PRESERVED secretary_permissions (% grant row[s]) + policies. Manual: DROP TABLE public.secretary_permissions CASCADE;', sp_rows;
    end if;
  end if;

  if to_regclass('public.team_goals') is null then
    raise notice 'team_goals absent — nothing to preserve.';
  else
    raise notice 'PRESERVED team_goals (% row[s], incl. 2026=300 + edits) + policies. Never auto-dropped. Manual: DROP TABLE public.team_goals CASCADE;',
      (select count(*) from public.team_goals);
  end if;

  raise notice 'PRESERVED app_is_admin() and app_current_agent_id() — required by preserved policies.';
  raise notice 'PRESERVED deals columns is_duplicate/is_test/archived_at/deleted_at/duplicate_of/expected_gci (may hold marks/values).';
end $$;

-- 6. clear the migration record (idempotent)
do $$
begin
  if to_regclass('public._app_migrations') is not null then
    delete from public._app_migrations where name='phase1_A';
    raise notice 'Cleared phase1_A migration record.';
  end if;
end $$;

commit;
select 'MIGRATION A (v4) PARTIAL rollback complete — see NOTICEs' as status;

-- ══════════════════════════════════════════════════════════════════
-- OPTIONAL — COMPLETE TEARDOWN (manual). Removes EVERYTHING A created,
-- INCLUDING your team goal + grants. Export first. Uncomment to use.
--
-- create table public._export_team_goals as select * from public.team_goals;
-- create table public._export_secretary_permissions as select * from public.secretary_permissions;
-- drop policy if exists team_goals_read on public.team_goals;
-- drop policy if exists team_goals_admin on public.team_goals;
-- drop table if exists public.team_goals;
-- drop policy if exists secretary_permissions_admin on public.secretary_permissions;
-- drop policy if exists secretary_permissions_selfread on public.secretary_permissions;
-- drop table if exists public.secretary_permissions;
-- drop function if exists public.app_is_admin();
-- drop function if exists public.app_current_agent_id();
-- delete from public._app_migrations where name='phase1_A';
-- -- exclusion/expected columns (optional; loses DUP marks + expected_gci values):
-- -- alter table public.deals drop column if exists is_duplicate, drop column if exists is_test,
-- --   drop column if exists archived_at, drop column if exists deleted_at, drop column if exists duplicate_of;
-- --   (leave expected_gci — it may be owned by reporting_tier_b.sql)
-- ══════════════════════════════════════════════════════════════════
