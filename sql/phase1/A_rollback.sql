-- ══════════════════════════════════════════════════════════════════
-- PHASE 1 · MIGRATION A (v3) — PARTIAL FOUNDATION ROLLBACK
-- ⚠ This is a PARTIAL rollback by design, not a complete teardown.
-- It removes the reporting layer (RPC, goal readers, data-quality,
-- canonical view, reporting indexes, and the non-identity permission
-- helpers) while PRESERVING stateful data and the minimum helpers its
-- policies require:
--   • KEPT: public.team_goals + its policies + privileges (your 300 goal
--           and any admin edits — never auto-dropped).
--   • KEPT: public.secretary_permissions if it holds any grant rows
--           (dropped only when empty).
--   • KEPT: app_is_admin() and app_current_agent_id() — the preserved
--           policies depend on them; dropping would fail or need CASCADE.
--   • KEPT: deals exclusion columns (may hold DUP-cleanup marks).
-- Idempotent: safe if A only partially applied or tables are absent.
-- For a COMPLETE teardown (export + drop everything), see the commented
-- appendix at the bottom.
-- ══════════════════════════════════════════════════════════════════
begin;

-- 1. Drop the reporting RPC + readers + data-quality (nothing depends on them)
drop function if exists public.app_dashboard_summary(text,uuid,date,date);
drop function if exists public.app_agent_goal(uuid,int);
drop function if exists public.app_team_goal(int);
drop function if exists public.app_data_quality(int);

-- 2. Drop the scope/permission helpers NOT required by preserved policies
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
-- NOTE: app_is_admin() and app_current_agent_id() are intentionally KEPT
-- (secretary_permissions_* and team_goals_admin policies depend on them).

-- 3. Drop the internal canonical view
drop view if exists public.v_deals_canonical;

-- 4. Drop ONLY migration-owned indexes (idx_a1_*) — never pre-existing ones
drop index if exists public.idx_a1_deals_close_date;
drop index if exists public.idx_a1_deals_report;
drop index if exists public.idx_a1_tasks_overdue;
drop index if exists public.idx_a1_cal_agent_start;

-- 5. Preserve stateful tables; disclose; idempotent if missing
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
      raise notice 'PRESERVED secretary_permissions (% grant row[s]) + its policies. Manual removal: DROP TABLE public.secretary_permissions CASCADE;', sp_rows;
    end if;
  end if;

  if to_regclass('public.team_goals') is null then
    raise notice 'team_goals absent — nothing to preserve.';
  else
    raise notice 'PRESERVED team_goals (% row[s], incl. 2026=300 + edits) + its policies. Never auto-dropped. Manual removal: DROP TABLE public.team_goals CASCADE;',
      (select count(*) from public.team_goals);
  end if;

  raise notice 'PRESERVED app_is_admin() and app_current_agent_id() — required by the preserved policies.';
  raise notice 'PRESERVED deals columns is_duplicate/is_test/archived_at/deleted_at/duplicate_of (may hold DUP marks).';
end $$;

commit;
select 'MIGRATION A (v3) PARTIAL rollback complete — see NOTICEs for preserved objects' as status;

-- ══════════════════════════════════════════════════════════════════
-- OPTIONAL — COMPLETE TEARDOWN (run manually, only if you truly want to
-- remove EVERYTHING A created, INCLUDING your team goal + grants).
-- Export first, then drop. Uncomment to use.
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
-- -- exclusion columns (only if you want them gone; loses DUP marks):
-- -- alter table public.deals drop column if exists is_duplicate, drop column if exists is_test,
-- --   drop column if exists archived_at, drop column if exists deleted_at, drop column if exists duplicate_of;
-- ══════════════════════════════════════════════════════════════════
