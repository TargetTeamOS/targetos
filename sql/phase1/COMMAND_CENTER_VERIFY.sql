-- ============================================================================
-- COMMAND_CENTER_VERIFY.sql   (READ-ONLY)
-- Paste into the Supabase SQL Editor and Run AFTER COMMAND_CENTER_APPLY_ALL.sql.
-- Creates/updates/deletes NOTHING. Returns one result set of checks, each marked
-- PASS / MISSING / REVIEW REQUIRED, plus baseline CRM record counts.
--
-- If the editor shows only the last statement's result, select this whole query
-- (it is a single statement) and Run — everything is one UNION ALL.
-- ============================================================================

with
expected_fn(section, name) as (values
  ('Foundation','app_current_agent_id'),
  ('Foundation','app_is_admin'),
  ('Foundation','_goal_actual'),
  ('Foundation','app_goals_list'),
  ('Foundation','app_goals_dashboard'),
  ('Foundation','app_goal_upsert'),
  ('Foundation','app_goal_delete'),
  ('Foundation','app_news_sources_list'),
  ('Foundation','app_news_sources_active'),
  ('Foundation','app_news_source_upsert'),
  ('Foundation','app_news_source_delete'),
  ('S1 Widgets','_pw_validate'),
  ('S1 Widgets','_pw_window'),
  ('S1 Widgets','_pw_compute'),
  ('S1 Widgets','app_production_widget_values'),
  ('S1 Widgets','app_get_production_widgets'),
  ('S1 Widgets','app_save_production_widgets'),
  ('S1 Widgets','app_reset_production_widgets'),
  ('S1 Widgets','app_preview_production_widgets'),
  ('S1 Widgets','app_production_widgets_audit'),
  ('S1 Widgets','_pw_audit'),
  ('S2 Goals','app_goal_records'),
  ('S3 My Day','_owns_task'),
  ('S3 My Day','app_my_day'),
  ('S3 My Day','app_task_complete'),
  ('S3 My Day','app_task_reschedule'),
  ('S3 My Day','app_event_reschedule'),
  ('S3 My Day','app_task_add_note'),
  ('S3 My Day','app_create_followup'),
  ('S4 Agents','_perf_allowed'),
  ('S4 Agents','app_agent_performance'),
  ('S4 Agents','app_agent_records'),
  ('S5 Settings','app_dashboard_settings_get'),
  ('S5 Settings','app_dashboard_settings_set')
),
fn as (
  select e.section, e.name, p.oid, p.prosecdef,
    (select string_agg(c, ',') from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%') as sp
  from expected_fn e
  left join pg_proc p on p.proname = e.name and p.pronamespace = 'public'::regnamespace
),
expected_tbl(section, name, kind) as (values
  ('S1 Widgets','production_widgets','table'),
  ('S1 Widgets','production_widgets_audit','table'),
  ('S5 Settings','dashboard_settings','table'),
  ('S5 Settings','dashboard_settings_audit','table'),
  ('Foundation','team_goals','table'),
  ('Foundation','news_sources','table'),
  ('Foundation','_app_migrations','table'),
  ('Foundation','v_deals_canonical','view')
),
expected_rls(name) as (values ('production_widgets'), ('dashboard_settings'), ('news_sources'))
-- 1) FUNCTIONS: existence + SECURITY DEFINER search_path + authenticated EXECUTE
select
  'FUNCTION'::text as check,
  (section || ' · ' || name) as object,
  case
    when oid is null then 'MISSING'
    when prosecdef and sp is null then 'REVIEW REQUIRED — SECURITY DEFINER without explicit search_path'
    when name in ('app_current_agent_id','app_is_admin') then
      case when has_function_privilege('public', oid, 'EXECUTE') or has_function_privilege('anon', oid, 'EXECUTE')
           then 'REVIEW REQUIRED — internal helper exposed to public/anon'
           else 'PASS (internal helper — no authenticated EXECUTE expected)' end
    when name like 'app\_%' and not has_function_privilege('authenticated', oid, 'EXECUTE') then 'REVIEW REQUIRED — authenticated lacks EXECUTE'
    when name like 'app\_%' and (has_function_privilege('public', oid, 'EXECUTE') or has_function_privilege('anon', oid, 'EXECUTE')) then 'REVIEW REQUIRED — executable by public/anon'
    else 'PASS'
  end as status,
  case when oid is null then '' else 'secdef=' || prosecdef::text || coalesce(' ' || sp, ' (no search_path)') end as note
from fn

union all
-- 2) TABLES / VIEWS: existence
select 'OBJECT', (section || ' · ' || name || ' (' || kind || ')'),
  case when to_regclass('public.' || name) is not null then 'PASS' else 'MISSING' end, ''
from expected_tbl

union all
-- 3) RLS: enabled + at least one policy on the new writable tables
select 'RLS', ('policy on ' || r.name),
  case
    when to_regclass('public.' || r.name) is null then 'MISSING (table absent)'
    when not (select relrowsecurity from pg_class where oid = ('public.' || r.name)::regclass) then 'REVIEW REQUIRED — RLS disabled'
    when not exists (select 1 from pg_policies where schemaname='public' and tablename=r.name) then 'REVIEW REQUIRED — no policy'
    else 'PASS'
  end,
  coalesce((select string_agg(policyname, ', ') from pg_policies where schemaname='public' and tablename=r.name), '')
from expected_rls r

union all
-- 3b) production_widgets_audit: RLS on AND not directly readable by authenticated
select 'RLS', 'production_widgets_audit (admin-reader only)',
  case
    when to_regclass('public.production_widgets_audit') is null then 'MISSING'
    when not (select relrowsecurity from pg_class where oid = 'public.production_widgets_audit'::regclass) then 'REVIEW REQUIRED — RLS disabled'
    when has_table_privilege('authenticated','public.production_widgets_audit','SELECT') then 'REVIEW REQUIRED — authenticated can read audit directly'
    else 'PASS'
  end, 'expect RLS on, no direct authenticated SELECT (read via app_production_widgets_audit)'

union all
-- 3c) production-widget audit trigger present
select 'TRIGGER', 'pw_audit_trg on production_widgets',
  case when exists (select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
                    where c.relname='production_widgets' and t.tgname='pw_audit_trg' and not t.tgisinternal)
       then 'PASS' else 'MISSING — widget changes will not be audited' end, ''

union all
-- 4) Widget config table must NOT be directly writable by authenticated (writes go through RPCs)
select 'GRANT', 'production_widgets direct INSERT/UPDATE/DELETE by authenticated',
  case
    when to_regclass('public.production_widgets') is null then 'MISSING'
    when has_table_privilege('authenticated','public.production_widgets','INSERT')
      or has_table_privilege('authenticated','public.production_widgets','UPDATE')
      or has_table_privilege('authenticated','public.production_widgets','DELETE')
      then 'REVIEW REQUIRED — direct writes granted (should be RPC-only)'
    else 'PASS'
  end, 'expect SELECT-only for authenticated'

union all
-- 5) Migration bookkeeping rows marked complete
select 'MIGRATION', ('_app_migrations · ' || m.name),
  case when exists(select 1 from public._app_migrations x where x.name=m.name and x.status='complete') then 'PASS' else 'MISSING — not recorded complete' end, ''
from (values ('production_widgets'),('A5_goal_records'),('A6_my_day'),('A7_agent_performance'),('A8_dashboard_settings'),('COMMAND_CENTER_REPAIR_FOUNDATION')) m(name)

union all
-- 6) Baseline CRM counts (read-only; capture BEFORE persona testing)
select 'CRM COUNT', 'deals',          (select count(*)::text from public.deals),          'baseline' union all
select 'CRM COUNT', 'contacts',       (select count(*)::text from public.contacts),       'baseline' union all
select 'CRM COUNT', 'tasks',          (select count(*)::text from public.tasks),          'baseline' union all
select 'CRM COUNT', 'calendar_events',(select count(*)::text from public.calendar_events),'baseline' union all
select 'CRM COUNT', 'interactions',   (select count(*)::text from public.interactions),   'baseline' union all
select 'CRM COUNT', 'agents',         (select count(*)::text from public.agents),         'baseline' union all
select 'CRM COUNT', 'team_goals',     (select count(*)::text from public.team_goals),     'baseline'

order by 1, 2;
