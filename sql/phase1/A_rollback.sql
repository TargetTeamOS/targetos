-- ══════════════════════════════════════════════════════════════════
-- PHASE 1 · MIGRATION A (REVISED v2) — ROLLBACK
-- Dependency-safe order. Transactional. DATA-PRESERVING:
--   • team_goals is NEVER auto-dropped (holds your editable 300 goal +
--     any admin edits). Preserved with a NOTICE.
--   • secretary_permissions: preserved if it holds any grants (NOTICE);
--     dropped only if empty.
--   • deals exclusion columns are NOT dropped (may hold duplicate marks
--     from the DUP cleanup). Preserved with a NOTICE; manual drop shown.
-- DISCLOSURE: dropping this migration removes the helper functions, the
-- canonical view, the aggregate RPC, and the reporting indexes. It does
-- NOT remove any business/config data. Read the NOTICEs it raises.
-- ══════════════════════════════════════════════════════════════════
begin;

-- 1. Drop functions first (nothing depends ON them). Full signatures.
drop function if exists public.app_dashboard_summary(text,uuid,date,date);
drop function if exists public.app_agent_goal(uuid,int);
drop function if exists public.app_team_goal(int);
drop function if exists public.app_data_quality();
drop function if exists public.app_can_view_team(text);
drop function if exists public.app_can_view_financials(uuid,text);
drop function if exists public.app_can_access_unassigned(text);
drop function if exists public.app_can_delete(uuid,text);
drop function if exists public.app_can_complete(uuid,text);
drop function if exists public.app_can_assign(uuid,text);
drop function if exists public.app_can_edit_resource(uuid,text);
drop function if exists public.app_can_create_for(uuid,text);
drop function if exists public.app_can_view_agent(uuid,text);
-- role helpers last (other functions referenced them)
drop function if exists public.app_is_agent();
drop function if exists public.app_is_secretary();
drop function if exists public.app_is_admin();
drop function if exists public.app_current_agent_id();

-- 2. Drop the canonical view (depends on deals columns; safe now).
drop view if exists public.v_deals_canonical;

-- 3. Drop reporting indexes.
drop index if exists public.idx_deals_close_date;
drop index if exists public.idx_deals_report;
drop index if exists public.idx_tasks_overdue;
drop index if exists public.idx_cal_agent_start;

-- 4. PRESERVE stateful new tables; disclose.
do $$
declare sp_rows int; tg_rows int;
begin
  select count(*) into sp_rows from public.secretary_permissions;
  if sp_rows = 0 then
    drop table public.secretary_permissions;
    raise notice 'secretary_permissions was empty → dropped.';
  else
    raise notice 'PRESERVED secretary_permissions (% grant row(s)). To remove: DROP TABLE public.secretary_permissions;', sp_rows;
  end if;

  select count(*) into tg_rows from public.team_goals;
  raise notice 'PRESERVED team_goals (% row(s), includes your 2026=300 goal + any edits). NEVER auto-dropped. To remove: DROP TABLE public.team_goals;', tg_rows;
end $$;

-- 5. deals exclusion columns preserved (may hold duplicate marks).
do $$ begin
  raise notice 'PRESERVED deals columns is_duplicate/is_test/archived_at/deleted_at/duplicate_of (may hold DUP-cleanup marks). To reverse manually: ALTER TABLE public.deals DROP COLUMN is_duplicate, DROP COLUMN is_test, DROP COLUMN archived_at, DROP COLUMN deleted_at, DROP COLUMN duplicate_of;';
end $$;

commit;
select 'MIGRATION A (revised v2) rolled back — stateful data preserved (see NOTICEs)' as status;
