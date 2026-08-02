-- ============================================================================
-- A3_rollback.sql — reverses A3_goals_model.sql, restoring exact pre-A3 state.
-- DATA SAFETY: deletes ONLY flexible goal rows (goal_basis IS NOT NULL) that A3
-- made possible. The legacy row(s) (goal_basis IS NULL, e.g. 2026/closed_deals)
-- and all business data are untouched. Removing flexible rows first is required
-- so the NOT NULL constraints on year/goal_type can be safely restored.
-- ============================================================================
begin;

drop function if exists public.app_goal_delete(uuid);
drop function if exists public.app_goal_upsert(jsonb);
drop function if exists public.app_goals_dashboard();
drop function if exists public.app_goals_list();
drop function if exists public._goal_actual(text,date,date,text,uuid);

-- remove flexible config rows (never legacy, never business data)
delete from public.team_goals where goal_basis is not null;

drop index  if exists public.team_goals_flex_idx;
drop index  if exists public.team_goals_legacy_uniq;

alter table public.team_goals
  drop constraint if exists tg_basis_wl,
  drop constraint if exists tg_period_wl,
  drop constraint if exists tg_scope_wl,
  drop constraint if exists tg_individual_agent,
  drop constraint if exists tg_flex_dates,
  drop constraint if exists tg_flex_target;

alter table public.team_goals
  drop column if exists title,
  drop column if exists goal_basis,
  drop column if exists period,
  drop column if exists start_date,
  drop column if exists end_date,
  drop column if exists scope,
  drop column if exists agent_id,
  drop column if exists message,
  drop column if exists image_url,
  drop column if exists visible,
  drop column if exists active,
  drop column if exists created_at;

-- restore original constraints (legacy rows still satisfy NOT NULL + unique)
alter table public.team_goals alter column year      set not null;
alter table public.team_goals alter column goal_type set not null;
alter table public.team_goals
  add constraint team_goals_uniq unique nulls not distinct (year, goal_type);

update public._app_migrations set status='rolled_back', rolled_back_at=now()
  where name='A3_goals_model';
commit;
select 'A3 rolled back; legacy goal intact' as status, public.app_team_goal(2026) as legacy;
