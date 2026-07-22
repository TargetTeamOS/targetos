-- ══════════════════════════════════════════════════════════════════
-- PRODUCTION BOARD WIDGETS — ROLLBACK
-- Removes ONLY the objects this migration created. Self-contained:
-- nothing else references public.production_widgets or these functions.
-- Does NOT touch system_settings, deals, A1/A2 objects, team_goals,
-- v_deals_canonical, app_is_admin, RLS on any existing table, or the
-- duplicate data. Idempotent. Updates the migration record to rolled_back.
-- ══════════════════════════════════════════════════════════════════
begin;

drop function if exists public.app_preview_production_widgets(jsonb,date,date);
drop function if exists public.app_reset_production_widgets();
drop function if exists public.app_save_production_widgets(jsonb);
drop function if exists public.app_get_production_widgets();
drop function if exists public.app_production_widget_values(date,date);
drop function if exists public._pw_compute(public.production_widgets,date,date);
drop function if exists public._pw_window(text,date,date,date,date);
drop function if exists public._pw_validate(jsonb);

-- Drop the table last (functions above may reference its rowtype).
do $$
begin
  if to_regclass('public.production_widgets') is not null then
    -- policy dropped implicitly with the table
    drop table public.production_widgets;
    raise notice 'Dropped public.production_widgets (+ its RLS policy).';
  else
    raise notice 'public.production_widgets absent — nothing to drop.';
  end if;
end $$;

do $$
begin
  if to_regclass('public._app_migrations') is not null then
    update public._app_migrations set status='rolled_back', rolled_back_at=now() where name='production_widgets';
    raise notice 'Marked production_widgets rolled_back.';
  end if;
end $$;

do $$
begin
  raise notice 'UNTOUCHED: system_settings, deals, team_goals, v_deals_canonical, app_is_admin, A1/A2 data, duplicate marks.';
end $$;

commit;
select 'PRODUCTION WIDGETS rollback complete' as status;
