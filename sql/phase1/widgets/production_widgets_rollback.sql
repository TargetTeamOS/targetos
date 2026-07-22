-- ══════════════════════════════════════════════════════════════════
-- PRODUCTION BOARD WIDGETS — ROLLBACK (idempotent)
-- Removes ONLY objects the migration created. Safe to run twice, and
-- safe when public.production_widgets is already absent. _pw_compute is
-- dropped by resolving its EXACT signature via to_regprocedure only while
-- the composite type still exists — never a same-named unrelated function.
-- Untouched: A1/A2 objects, deals, team_goals, system_settings, duplicate
-- data, and existing RLS policies.
-- ══════════════════════════════════════════════════════════════════
begin;

-- 2. Drop the five API RPCs.
drop function if exists public.app_preview_production_widgets(jsonb,date,date);
drop function if exists public.app_reset_production_widgets();
drop function if exists public.app_save_production_widgets(jsonb);
drop function if exists public.app_get_production_widgets();
drop function if exists public.app_production_widget_values(date,date);

-- 3. Drop the EXACT _pw_compute function (guarded; never names the composite
--    type in DDL text when it is already gone; never drops an unrelated fn).
do $$
declare
  fn regprocedure;
begin
  if to_regclass('public.production_widgets') is not null then
    fn := to_regprocedure(
      'public._pw_compute(public.production_widgets,date,date)'
    );

    if fn is not null then
      execute format('drop function %s', fn);
      raise notice 'Dropped %', fn;
    else
      raise notice 'Exact _pw_compute signature absent — nothing to drop.';
    end if;
  else
    raise notice 'production_widgets type absent — _pw_compute already absent.';
  end if;
end $$;

-- 4. Drop _pw_window.
drop function if exists public._pw_window(text,date,date,date,date);

-- 5. Drop _pw_validate(jsonb,boolean).
drop function if exists public._pw_validate(jsonb,boolean);

-- 6. Drop the table if present (its RLS policy drops with it). Guarded → idempotent.
do $$
begin
  if to_regclass('public.production_widgets') is not null then
    drop table public.production_widgets;
    raise notice 'Dropped public.production_widgets (+ its RLS policy).';
  else
    raise notice 'public.production_widgets absent — nothing to drop.';
  end if;
end $$;

-- 7. Mark rolled_back (never delete the record; skip if the table is absent).
do $$
begin
  if to_regclass('public._app_migrations') is not null then
    update public._app_migrations set status='rolled_back', rolled_back_at=now() where name='production_widgets';
    raise notice 'Marked production_widgets rolled_back.';
  end if;
end $$;

do $$
begin
  raise notice 'UNTOUCHED: A1/A2 objects, deals, team_goals, system_settings, duplicate data, existing RLS policies.';
end $$;

-- 8. Commit.
commit;

-- 9. Done.
select 'PRODUCTION WIDGETS rollback complete' as status;
