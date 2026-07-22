-- ══════════════════════════════════════════════════════════════════
-- PRODUCTION BOARD WIDGETS — VERIFICATION (read-only)
-- Run as postgres/service in the SQL editor after the migration.
-- ══════════════════════════════════════════════════════════════════

-- 1. install state = complete
select 'install state (expect complete)' as check, status from public._app_migrations where name='production_widgets';

-- 2. table exists with the unique-position constraint
select 'table exists (expect t)' as check, to_regclass('public.production_widgets') is not null as present;
select 'position unique constraint (expect t)' as check,
  exists(select 1 from pg_constraint where conname='production_widgets_position_uniq') as present;

-- 3. exactly the 4 seeded defaults, all visible, unique positions 0..3
select 'seeded rows (expect 4)' as check, count(*) as n from public.production_widgets;
select 'default titles' as check, string_agg(title, ', ' order by position) as titles from public.production_widgets;
select 'no team GCI seeded (expect 0)' as check,
  count(*) as n from public.production_widgets where field in ('gci','expected_gci','collected_gci','pipeline_gci');

-- 4. RLS enabled + exactly one read policy
select 'RLS enabled (expect t)' as check, relrowsecurity from pg_class where oid='public.production_widgets'::regclass;
select 'policies' as check, policyname, cmd from pg_policies where schemaname='public' and tablename='production_widgets';

-- 5. privileges: authenticated SELECT only; NO write grants
select 'authenticated privileges (expect only SELECT)' as check,
  has_table_privilege('authenticated','public.production_widgets','SELECT') as can_select,
  has_table_privilege('authenticated','public.production_widgets','INSERT') as can_insert,
  has_table_privilege('authenticated','public.production_widgets','UPDATE') as can_update,
  has_table_privilege('authenticated','public.production_widgets','DELETE') as can_delete;

-- 6. exact function signatures present
select 'read RPC (expect t)' as check, to_regprocedure('public.app_production_widget_values(date,date)') is not null as present;
select 'admin get RPC (expect t)' as check, to_regprocedure('public.app_get_production_widgets()') is not null as present;
select 'admin save RPC (expect t)' as check, to_regprocedure('public.app_save_production_widgets(jsonb)') is not null as present;
select 'admin reset RPC (expect t)' as check, to_regprocedure('public.app_reset_production_widgets()') is not null as present;
select 'admin preview RPC (expect t)' as check, to_regprocedure('public.app_preview_production_widgets(jsonb,date,date)') is not null as present;

-- 7. only the 5 API functions executable by authenticated; internal helpers NOT
select 'API execute grants (expect t,t,t,t,t)' as check,
  has_function_privilege('authenticated','public.app_production_widget_values(date,date)','EXECUTE') as v,
  has_function_privilege('authenticated','public.app_get_production_widgets()','EXECUTE') as g,
  has_function_privilege('authenticated','public.app_save_production_widgets(jsonb)','EXECUTE') as s,
  has_function_privilege('authenticated','public.app_reset_production_widgets()','EXECUTE') as r,
  has_function_privilege('authenticated','public.app_preview_production_widgets(jsonb,date,date)','EXECUTE') as p;
select 'internal helpers NOT executable by authenticated (expect f,f,f)' as check,
  has_function_privilege('authenticated','public._pw_validate(jsonb)','EXECUTE') as val,
  has_function_privilege('authenticated','public._pw_window(text,date,date,date,date)','EXECUTE') as win,
  has_function_privilege('authenticated','public._pw_compute(public.production_widgets,date,date)','EXECUTE') as comp;

-- 8. read RPC returns render-ready payload for the 4 visible widgets
--    (values reflect current data; Closed Deals should track official 2026 closed = 89)
select 'read RPC payload' as check, public.app_production_widget_values(date_trunc('year',now())::date, (date_trunc('year',now())+interval '1 year')::date) as payload;
