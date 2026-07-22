-- ══════════════════════════════════════════════════════════════════
-- PRODUCTION BOARD WIDGETS — VERIFICATION (read-only checks)
-- Run as postgres/service in the SQL editor after the migration.
-- Sections that require a real JWT (non-admin DML, admin RPC calls,
-- admin/agent parity) are provided as explicit, ready-to-run snippets
-- with the expected outcome noted; run them under the relevant role.
-- ══════════════════════════════════════════════════════════════════

-- 1. install state
select 'install state (expect complete)' as check, status from public._app_migrations where name='production_widgets';

-- 2. table + constraints + seed
select 'table exists (expect t)' as check, to_regclass('public.production_widgets') is not null as present;
select 'CHECK/unique constraints (expect >= 15)' as check, count(*) as n
  from pg_constraint where conrelid='public.production_widgets'::regclass and contype in ('c','u');
select 'seeded rows (expect 4)' as check, count(*) as n from public.production_widgets;
select 'default titles' as check, string_agg(title,', ' order by position) as titles from public.production_widgets;
select 'no team GCI seeded (expect 0)' as check, count(*) as n
  from public.production_widgets where field in ('gci','expected_gci','collected_gci','pipeline_gci');

-- 3. RLS + policy
select 'RLS enabled (expect t)' as check, relrowsecurity from pg_class where oid='public.production_widgets'::regclass;
select 'read policy present (expect 1)' as check, count(*) as n
  from pg_policies where schemaname='public' and tablename='production_widgets';

-- 4. TABLE privileges: authenticated SELECT only (expect t,f,f,f); PUBLIC/anon none
select 'authenticated table privs (expect t,f,f,f)' as check,
  has_table_privilege('authenticated','public.production_widgets','SELECT') as sel,
  has_table_privilege('authenticated','public.production_widgets','INSERT') as ins,
  has_table_privilege('authenticated','public.production_widgets','UPDATE') as upd,
  has_table_privilege('authenticated','public.production_widgets','DELETE') as del;
select 'anon table privs (expect f,f,f,f)' as check,
  has_table_privilege('anon','public.production_widgets','SELECT') as sel,
  has_table_privilege('anon','public.production_widgets','INSERT') as ins,
  has_table_privilege('anon','public.production_widgets','UPDATE') as upd,
  has_table_privilege('anon','public.production_widgets','DELETE') as del;

-- 5. EXECUTE privileges — the crux (1).
--    authenticated: only the 5 API functions (expect t,t,t,t,t); internal helpers (expect f,f,f)
select 'authenticated API execute (expect t,t,t,t,t)' as check,
  has_function_privilege('authenticated','public.app_production_widget_values(date,date)','EXECUTE') as v,
  has_function_privilege('authenticated','public.app_get_production_widgets()','EXECUTE') as g,
  has_function_privilege('authenticated','public.app_save_production_widgets(jsonb)','EXECUTE') as s,
  has_function_privilege('authenticated','public.app_reset_production_widgets()','EXECUTE') as r,
  has_function_privilege('authenticated','public.app_preview_production_widgets(jsonb,date,date)','EXECUTE') as p;
select 'authenticated internal execute (expect f,f,f)' as check,
  has_function_privilege('authenticated','public._pw_validate(jsonb,boolean)','EXECUTE') as val,
  has_function_privilege('authenticated','public._pw_window(text,date,date,date,date)','EXECUTE') as win,
  has_function_privilege('authenticated','public._pw_compute(public.production_widgets,date,date)','EXECUTE') as comp;
-- anon: nothing executable (expect all f)
select 'anon execute all (expect f x8)' as check,
  has_function_privilege('anon','public.app_production_widget_values(date,date)','EXECUTE') as v,
  has_function_privilege('anon','public.app_get_production_widgets()','EXECUTE') as g,
  has_function_privilege('anon','public.app_save_production_widgets(jsonb)','EXECUTE') as s,
  has_function_privilege('anon','public.app_reset_production_widgets()','EXECUTE') as r,
  has_function_privilege('anon','public.app_preview_production_widgets(jsonb,date,date)','EXECUTE') as p,
  has_function_privilege('anon','public._pw_validate(jsonb,boolean)','EXECUTE') as val,
  has_function_privilege('anon','public._pw_window(text,date,date,date,date)','EXECUTE') as win,
  has_function_privilege('anon','public._pw_compute(public.production_widgets,date,date)','EXECUTE') as comp;
-- PUBLIC: pseudo-role — check via the function ACL, not has_function_privilege.
with expected(signature) as (
  values
    ('public.app_production_widget_values(date,date)'),
    ('public.app_get_production_widgets()'),
    ('public.app_save_production_widgets(jsonb)'),
    ('public.app_reset_production_widgets()'),
    ('public.app_preview_production_widgets(jsonb,date,date)'),
    ('public._pw_validate(jsonb,boolean)'),
    ('public._pw_window(text,date,date,date,date)'),
    ('public._pw_compute(public.production_widgets,date,date)')
),
resolved as (
  select signature, to_regprocedure(signature) as fn
  from expected
),
public_exec as (
  select r.signature
  from resolved r
  join pg_proc p on p.oid = r.fn
  cross join lateral aclexplode(
    coalesce(p.proacl, acldefault('f', p.proowner))
  ) a
  where a.grantee = 0
    and a.privilege_type = 'EXECUTE'
)
select
  'PUBLIC execute grants (expect 0)' as check,
  count(*) as public_execute_grants
from public_exec;

-- 6. exact function signatures present
select 'API + helper signatures (expect t x8)' as check,
  to_regprocedure('public.app_production_widget_values(date,date)') is not null as v,
  to_regprocedure('public.app_get_production_widgets()') is not null as g,
  to_regprocedure('public.app_save_production_widgets(jsonb)') is not null as s,
  to_regprocedure('public.app_reset_production_widgets()') is not null as r,
  to_regprocedure('public.app_preview_production_widgets(jsonb,date,date)') is not null as p,
  to_regprocedure('public._pw_validate(jsonb,boolean)') is not null as val,
  to_regprocedure('public._pw_window(text,date,date,date,date)') is not null as win,
  to_regprocedure('public._pw_compute(public.production_widgets,date,date)') is not null as comp;

-- 7. read RPC works (service role) + payload shape (render-ready, no raw rows)
select 'read RPC payload (service)' as check,
  public.app_production_widget_values(date_trunc('year',now())::date, (date_trunc('year',now())+interval '1 year')::date) as payload;

-- 8. Active Pipeline INCLUDES deals with NULL close_date (2).
--    Active Pipeline widget = all_time + active_pipeline; it must equal the raw
--    canonical active count, including those without a close_date.
select 'active pipeline widget value' as check,
  (select (elem->>'value')::int
     from jsonb_array_elements(
       public.app_production_widget_values(date_trunc('year',now())::date,(date_trunc('year',now())+interval '1 year')::date)) elem
     where elem->>'title'='Active Pipeline') as widget_value;
select 'canonical active count incl null close_date' as check,
  count(*) as canonical_active,
  count(*) filter (where close_date is null) as of_which_null_close
  from public.v_deals_canonical where is_active_pipeline;
-- PASS when widget_value = canonical_active AND of_which_null_close > 0 (proves nulls included).

-- 9. Closed Deals matches canonical 2026 count (expect 89 while data is unchanged).
select 'Closed Deals widget (expect 89)' as check,
  (select (elem->>'value')::int
     from jsonb_array_elements(
       public.app_production_widget_values('2026-01-01','2027-01-01')) elem
     where elem->>'title'='Closed Deals') as widget_value;
select 'canonical official closed 2026 (expect 89)' as check, count(*) as n
  from public.v_deals_canonical where is_closed_official and close_date >= '2026-01-01' and close_date < '2027-01-01';

-- 10. admin get/save round-trip compatibility (3): get output must save unchanged.
--     Run as an ADMIN JWT:
--       select public.app_save_production_widgets(public.app_get_production_widgets());
--     EXPECT: {"ok":true,"count":4} — no unknown-key error.

-- ── ROLE-DEPENDENT SNIPPETS (run under the noted JWT; outcomes noted) ──
-- (a) NON-ADMIN direct DML must fail (RLS/privilege):
--       insert into public.production_widgets(position,title,metric,date_mode,date_field,format,color)
--         values (99,'x','count','all_time','close_date','whole','#000000');   -- EXPECT: permission denied
--       update public.production_widgets set title='x';                        -- EXPECT: 0 rows / denied
--       delete from public.production_widgets;                                  -- EXPECT: 0 rows / denied
-- (b) NON-ADMIN RPCs return forbidden:
--       select public.app_save_production_widgets('[]'::jsonb);                 -- EXPECT: {"error":"forbidden"}
--       select public.app_reset_production_widgets();                          -- EXPECT: {"error":"forbidden"}
--       select public.app_preview_production_widgets('[]'::jsonb, current_date, current_date+1); -- EXPECT: forbidden
--       select public.app_get_production_widgets();                            -- EXPECT: {"error":"forbidden"}
-- (c) LINKED ADMIN can get/save/reset/preview:
--       select public.app_get_production_widgets();                            -- EXPECT: array of 4 editable defs
--       select public.app_reset_production_widgets();                          -- EXPECT: {"ok":true}
--       select public.app_preview_production_widgets(public.app_get_production_widgets(), '2026-01-01','2027-01-01'); -- EXPECT: array w/ values
-- (d) ADMIN vs AGENT PARITY — same payload values for the same range:
--       (run as admin, then as agent)
--       select public.app_production_widget_values('2026-01-01','2027-01-01');  -- EXPECT: identical values both roles
-- (e) READ RPC works for a plain AUTHENTICATED agent (no admin):
--       select public.app_production_widget_values('2026-01-01','2027-01-01');  -- EXPECT: 4 visible widgets

-- 11. Rollback can run twice without error:
--       \i production_widgets_rollback.sql   (first run: drops everything, marks rolled_back)
--       \i production_widgets_rollback.sql   (second run: all guarded → 'absent' notices, no error)
