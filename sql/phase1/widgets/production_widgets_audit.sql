-- ============================================================================
-- production_widgets_audit.sql — Decision 1 "audit history" (companion migration)
-- ----------------------------------------------------------------------------
-- Adds an append-only audit log and re-defines the two mutating widget RPCs
-- (app_save_production_widgets, app_reset_production_widgets) to record a
-- snapshot of the widget set after each change, with actor (auth.uid) + time.
-- The reviewed base file production_widgets_migration.sql is NOT edited.
--
-- DATA SAFETY: creates one new table; CREATE OR REPLACE only re-defines two
-- functions with identical logic plus an audit insert. No business data, no
-- schema change to production_widgets itself.
--
-- Depends on: production_widgets base migration (must be 'complete').
-- Rollback:   production_widgets_audit_rollback.sql
-- ============================================================================
begin;

do $$
begin
  if not exists(select 1 from public._app_migrations where name='production_widgets' and status='complete') then
    raise exception 'apply production_widgets base migration first.'; end if;
  if exists(select 1 from public._app_migrations where name='production_widgets_audit' and status='complete') then
    raise exception 'production_widgets_audit already applied.'; end if;
end $$;

insert into public._app_migrations(name,status,applied_at,rolled_back_at)
values ('production_widgets_audit','in_progress',now(),null)
on conflict (name) do update set status='in_progress', applied_at=now(), rolled_back_at=null;

create table if not exists public.production_widgets_audit (
  id     uuid primary key default gen_random_uuid(),
  at     timestamptz not null default now(),
  actor  uuid,                       -- auth.uid() of the admin who made the change
  action text not null check (action in ('save','reset')),
  config jsonb                       -- snapshot of the widget set after the change
);
alter table public.production_widgets_audit enable row level security;
revoke all on public.production_widgets_audit from public, anon, authenticated;
-- no SELECT policy: history is readable only via the admin definer RPC below

-- ── re-define SAVE with audit logging (body identical to base + audit insert) ─
create or replace function public.app_save_production_widgets(config jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare w jsonb;
begin
  if not public.app_is_admin() then return jsonb_build_object('error','forbidden'); end if;
  perform public._pw_validate(config);
  delete from public.production_widgets;
  for w in select * from jsonb_array_elements(config) loop
    insert into public.production_widgets
      (id,position,title,subtitle,metric,field,filters,date_mode,date_field,custom_from,custom_to,
       format,color,goal_type,goal_value,goal_year,visible,scope,updated_at)
    values (
      coalesce(nullif(w->>'id','')::uuid, gen_random_uuid()),
      (w->>'position')::int, w->>'title', nullif(w->>'subtitle',''), w->>'metric',
      nullif(w->>'field',''), coalesce(w->'filters','{}'::jsonb), w->>'date_mode',
      coalesce(nullif(w->>'date_field',''),'close_date'),
      nullif(w->>'custom_from','')::date, nullif(w->>'custom_to','')::date,
      w->>'format', w->>'color', nullif(w->>'goal_type',''), nullif(w->>'goal_value','')::numeric,
      nullif(w->>'goal_year','')::int, coalesce((w->>'visible')::boolean, true), 'team', now());
  end loop;
  insert into public.production_widgets_audit(actor,action,config)
    values (auth.uid(),'save',config);
  return jsonb_build_object('ok', true, 'count', jsonb_array_length(config));
end $$;

-- ── re-define RESET with audit logging ──────────────────────────────────────
create or replace function public.app_reset_production_widgets()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_is_admin() then return jsonb_build_object('error','forbidden'); end if;
  delete from public.production_widgets;
  insert into public.production_widgets (position,title,metric,field,filters,date_mode,date_field,format,color,visible,scope) values
    (0,'Closed Deals',       'count', null,        '{"official_closed":true}'::jsonb, 'current_year','close_date','whole',        '#0073EA', true,'team'),
    (1,'Active Pipeline',    'count', null,        '{"active_pipeline":true}'::jsonb, 'all_time',    'close_date','whole',        '#00C875', true,'team'),
    (2,'Closed Production',  'sum',   'production', '{"official_closed":true}'::jsonb, 'current_year','close_date','full_currency','#037f4c', true,'team'),
    (3,'Pipeline Production','sum',   'production', '{"active_pipeline":true}'::jsonb, 'all_time',    'close_date','full_currency','#FDAB3D', true,'team');
  insert into public.production_widgets_audit(actor,action,config)
    values (auth.uid(),'reset',null);
  return jsonb_build_object('ok', true);
end $$;

-- ── admin read of audit history ─────────────────────────────────────────────
create or replace function public.app_production_widgets_audit(p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.app_is_admin() then return jsonb_build_object('error','forbidden'); end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'at',at,'actor',actor,'action',action,'config',config) order by at desc)
    from (select * from public.production_widgets_audit
          order by at desc limit least(greatest(p_limit,1),500)) t), '[]'::jsonb);
end $$;

do $$
begin
  execute 'revoke all on function public.app_production_widgets_audit(int) from public';
  execute 'revoke all on function public.app_production_widgets_audit(int) from anon';
  execute 'revoke all on function public.app_production_widgets_audit(int) from authenticated';
  execute 'grant execute on function public.app_production_widgets_audit(int) to authenticated';
end $$;

update public._app_migrations set status='complete', applied_at=now(), rolled_back_at=null
  where name='production_widgets_audit';
commit;
select 'production_widgets_audit applied' as status;
