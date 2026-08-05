-- ============================================================================
-- COMMAND_CENTER_FIX_GOALS_UNIQUE.sql   (additive, safe, rerunnable)
-- Fixes: "duplicate key value violates unique constraint team_goals_uniq" when
-- saving a second flexible (Command Center) goal.
--
-- Cause: the legacy blanket constraint team_goals_uniq is
--   UNIQUE NULLS NOT DISTINCT (year, goal_type)
-- Flexible goals store year/goal_type as NULL, and "nulls not distinct" treats
-- those NULLs as equal — so two flexible goals collide.
--
-- Fix: retire that blanket constraint. Legacy uniqueness ("one legacy row per
-- year+goal_type") is preserved by the partial unique index team_goals_legacy_uniq
-- (created below if missing), which only applies to legacy rows (goal_basis IS NULL).
--
-- No data is changed or removed; only the over-broad constraint is dropped.
-- ============================================================================
begin;

-- Ensure the legacy-only partial unique exists (idempotent) BEFORE dropping the blanket one.
create unique index if not exists team_goals_legacy_uniq
  on public.team_goals (year, goal_type)
  where goal_basis is null;

-- Retire the blanket unique that blocks multiple flexible goals.
alter table public.team_goals drop constraint if exists team_goals_uniq;

commit;
