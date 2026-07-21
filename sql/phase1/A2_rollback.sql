-- ══════════════════════════════════════════════════════════════════
-- PHASE 1 · MIGRATION A2 — ROLLBACK
-- Reverses ONLY A2-created objects. Creates NO backup table.
-- team_goals is dropped ONLY if it holds exactly the single default row
-- (2026 / closed_deals / 300 / America/New_York); otherwise the whole
-- rollback aborts and removes nothing.
-- Does NOT touch: A1 columns, duplicate markers,
-- public.deals_duplicate_mark_backup_20260721, existing CRM tables,
-- existing RLS policies, existing indexes, or deals.expected_gci
-- (A2 did not create or modify expected_gci or any existing table).
-- Idempotent. Updates the migration record to 'rolled_back' (never deletes).
-- ══════════════════════════════════════════════════════════════════
begin;

-- 1. Guard team_goals content BEFORE removing anything.
do $$
declare n int;
begin
  if to_regclass('public.team_goals') is not null then
    select count(*) into n from public.team_goals;
    if n <> 1 or not exists(select 1 from public.team_goals
        where year=2026 and goal_type='closed_deals' and target=300 and timezone='America/New_York') then
      raise exception 'team_goals contains additional/changed data (% row[s]) — aborting rollback; nothing removed.', n;
    end if;
  end if;
end $$;

-- 2. Drop A2 functions (nothing depends on them within A2).
drop function if exists public.app_dashboard_summary(text,uuid,date,date);
drop function if exists public.app_team_goal(int);
drop function if exists public.app_is_admin();
drop function if exists public.app_current_agent_id();

-- 3. Drop the internal canonical view.
drop view if exists public.v_deals_canonical;

-- 4. Drop team_goals (verified above to hold only the single default row).
drop table if exists public.team_goals;

-- 5. Update the migration record to 'rolled_back' (do NOT delete while honoring
--    "record persists"; A2-created objects have now been removed).
do $$
begin
  if to_regclass('public._app_migrations') is not null then
    update public._app_migrations set status='rolled_back', rolled_back_at=now() where name='phase1_A2';
  end if;
end $$;

-- 6. Disclosures — what this rollback deliberately does NOT touch.
do $$
begin
  raise notice 'A2 made NO changes to existing CRM tables; deals.expected_gci and all existing columns are untouched.';
  raise notice 'UNTOUCHED A1: is_duplicate/is_test/archived_at/deleted_at/duplicate_of + the duplicate marks.';
  raise notice 'UNTOUCHED backup table public.deals_duplicate_mark_backup_20260721.';
  raise notice 'UNTOUCHED existing RLS policies and existing indexes.';
end $$;

commit;
select 'MIGRATION A2 rollback complete — A1, duplicates, and existing tables untouched' as status;
