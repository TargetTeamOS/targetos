-- ══════════════════════════════════════════════════════════════════
-- PRODUCTION BOARD WIDGETS — ROLLBACK (idempotent)
-- Removes ONLY objects this migration created. Safe to run twice, and
-- safe when public.production_widgets is already absent. Uses guarded
-- dynamic DROP for _pw_compute so it never parses the composite type
-- public.production_widgets when that type no longer exists (6).
-- Untouched: system_settings, deals, team_goals, v_deals_canonical,
-- app_is_admin, A1/A2 data, duplicate marks.
-- ══════════════════════════════════════════════════════════════════
begin;

-- API + simple-signature functions (types always resolvable → static DROP IF EXISTS is safe).
drop function if exists public.app_preview_production_widgets(jsonb,date,date);
drop function if exists public.app_reset_production_widgets();
drop function if exists public.app_save_production_widgets(jsonb);
drop function if exists public.app_get_production_widgets();
drop function if exists public.app_production_widget_values(date,date);
drop function if exists public._pw_window(text,date,date,date,date);
drop function if exists public._pw_validate(jsonb,boolean);

-- _pw_compute takes the composite type public.production_widgets as an argument.
-- Drop ONLY the exact migration-owned signature, matched by its argument type,
-- via catalog lookup — so (a) we never name the composite type in DDL text when
-- it is already gone, and (b) we never touch an unrelated function that merely
-- shares the name _pw_compute. Second run: the lookup returns no row → no-op. (2,6)
do $$
declare pr record;
begin
  for pr in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = '_pw_compute'
      and pg_get_function_identity_arguments(p.oid) = 'w public.production_widgets, board_from date, board_to date'
  loop
    execute 'drop function ' || pr.sig::text;
    raise notice 'Dropped %', pr.sig;
  end loop;
end $$;

-- Drop the table last (its policy drops with it). Guarded → idempotent.
do $$
begin
  if to_regclass('public.production_widgets') is not null then
    drop table public.production_widgets;
    raise notice 'Dropped public.production_widgets (+ its RLS policy).';
  else
    raise notice 'public.production_widgets absent — nothing to drop.';
  end if;
end $$;

-- Mark rolled_back (never delete the record; never touch it if the table is absent).
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
