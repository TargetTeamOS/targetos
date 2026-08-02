-- ============================================================================
-- production_widgets_audit_rollback.sql — reverses production_widgets_audit.sql
-- Restores the base (non-audited) save/reset RPCs and drops the audit objects.
-- DATA SAFETY: only the audit log (config metadata) is dropped; production_widgets
-- rows and all business data are untouched.
-- ============================================================================
begin;

drop function if exists public.app_production_widgets_audit(int);

-- restore base SAVE (no audit insert) — identical to production_widgets_migration.sql
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
  return jsonb_build_object('ok', true, 'count', jsonb_array_length(config));
end $$;

-- restore base RESET (no audit insert)
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
  return jsonb_build_object('ok', true);
end $$;

drop table if exists public.production_widgets_audit;

update public._app_migrations set status='rolled_back', rolled_back_at=now()
  where name='production_widgets_audit';
commit;
select 'production_widgets_audit rolled back' as status;
