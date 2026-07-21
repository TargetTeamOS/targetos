-- ══════════════════════════════════════════════════════════════════
-- PHASE 1 · MIGRATION A2 — ROLLBACK
-- Reverses ONLY A2. Does NOT touch A1 (columns/duplicate marks) or the
-- backup table public.deals_duplicate_mark_backup_20260721.
-- team_goals is exported then dropped so A2 can be cleanly reinstalled;
-- deals.expected_gci is PRESERVED (may be shared with reporting_tier_b.sql).
-- Idempotent: safe if A2 only partially applied or objects are absent.
-- ══════════════════════════════════════════════════════════════════
begin;

-- 1. RPC + readers + helpers (nothing depends on them in A2)
drop function if exists public.app_dashboard_summary(text,uuid,date,date);
drop function if exists public.app_team_goal(int);
drop function if exists public.app_is_admin();
drop function if exists public.app_current_agent_id();

-- 2. internal canonical view
drop view if exists public.v_deals_canonical;

-- 3. team_goals: export-then-drop (data-preserving, enables clean reinstall)
do $$
begin
  if to_regclass('public.team_goals') is not null then
    execute 'create table if not exists public.team_goals_backup_20260721 as table public.team_goals';
    drop table public.team_goals;
    raise notice 'team_goals exported to public.team_goals_backup_20260721, then dropped.';
  else
    raise notice 'team_goals absent — nothing to drop.';
  end if;
end $$;

-- 4. clear migration record
do $$
begin
  if to_regclass('public._app_migrations') is not null then
    delete from public._app_migrations where name='phase1_A2';
    raise notice 'Cleared phase1_A2 migration record.';
  end if;
end $$;

-- 5. disclosures — what A2 rollback deliberately does NOT remove
do $$
begin
  raise notice 'PRESERVED deals.expected_gci (may be shared with reporting_tier_b.sql).';
  raise notice 'UNTOUCHED A1: is_duplicate/is_test/archived_at/deleted_at/duplicate_of + duplicate marks.';
  raise notice 'UNTOUCHED backup table public.deals_duplicate_mark_backup_20260721.';
end $$;

commit;
select 'MIGRATION A2 rollback complete — A1 + duplicate marks untouched' as status;
