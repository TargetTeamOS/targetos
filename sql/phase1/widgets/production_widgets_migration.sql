-- ══════════════════════════════════════════════════════════════════
-- PRODUCTION BOARD WIDGETS — MIGRATION
-- Dedicated table public.production_widgets + secure RPCs. One shared
-- team config; admin-only writes via SECURITY DEFINER RPCs (NO direct
-- authenticated INSERT/UPDATE/DELETE). All authenticated users read the
-- SAME team-wide computed values. NOT applied/verified on live DB.
-- Does NOT touch system_settings, deals, RLS on existing tables, A1/A2
-- data, or the duplicate marks. Rollback: production_widgets_rollback.sql
-- Depends on A2: public.app_is_admin(), public.v_deals_canonical,
-- public.team_goals must already exist.
-- ══════════════════════════════════════════════════════════════════
begin;

create table if not exists public._app_migrations (
  name text primary key, status text not null,
  applied_at timestamptz not null default now(), rolled_back_at timestamptz);

-- ── PREFLIGHT ──
do $$
begin
  if current_setting('server_version_num')::int < 150000 then raise exception 'Requires PostgreSQL 15+.'; end if;
  if exists(select 1 from public._app_migrations where name='production_widgets' and status='complete') then
    raise exception 'production_widgets already fully installed.'; end if;
  if exists(select 1 from public._app_migrations where name='production_widgets' and status='in_progress') then
    raise exception 'production_widgets in a partial state. Run rollback, then re-run.'; end if;
  -- A2 dependencies
  if to_regprocedure('public.app_is_admin()') is null then raise exception 'Missing public.app_is_admin() (run A2 first).'; end if;
  if to_regclass('public.v_deals_canonical') is null then raise exception 'Missing public.v_deals_canonical (run A2 first).'; end if;
  if to_regclass('public.team_goals') is null then raise exception 'Missing public.team_goals (run A2 first).'; end if;
  -- collision-safety: this migration's owned objects must NOT pre-exist
  if to_regclass('public.production_widgets') is not null then raise exception 'table public.production_widgets already exists — rollback first.'; end if;
  if exists(select 1 from pg_constraint where conname in ('production_widgets_position_uniq')) then raise exception 'constraint already exists — rollback first.'; end if;
  if to_regprocedure('public.app_production_widget_values(date,date)') is not null then raise exception 'app_production_widget_values already exists — rollback first.'; end if;
  if to_regprocedure('public.app_save_production_widgets(jsonb)') is not null then raise exception 'app_save_production_widgets already exists — rollback first.'; end if;
  if to_regprocedure('public.app_reset_production_widgets()') is not null then raise exception 'app_reset_production_widgets already exists — rollback first.'; end if;
  if to_regprocedure('public.app_get_production_widgets()') is not null then raise exception 'app_get_production_widgets already exists — rollback first.'; end if;
  if to_regprocedure('public.app_preview_production_widgets(jsonb,date,date)') is not null then raise exception 'app_preview_production_widgets already exists — rollback first.'; end if;
end $$;

insert into public._app_migrations(name,status,applied_at,rolled_back_at)
values ('production_widgets','in_progress',now(),null)
on conflict (name) do update set status='in_progress', applied_at=now(), rolled_back_at=null;

-- ── TABLE (one row per widget) ──
create table public.production_widgets (
  id           uuid primary key default gen_random_uuid(),
  position     int  not null,
  title        text not null,
  subtitle     text,
  metric       text not null,                     -- count | sum | avg | progress
  field        text,                              -- null for count; else production|gci|expected_gci|collected_gci|pipeline_gci
  filters      jsonb not null default '{}'::jsonb,
  date_mode    text not null,                     -- board_range|current_year|ytd|current_month|all_time|custom
  date_field   text not null default 'close_date',-- ao_date|contract_date|expected_close_date|close_date
  custom_from  date,
  custom_to    date,
  format       text not null,                     -- whole|currency|percent|compact_currency|full_currency
  color        text not null default '#0073EA',
  goal_type    text,                              -- team_goal | custom  (progress only)
  goal_value   numeric,
  visible      boolean not null default true,
  scope        text not null default 'team',      -- v1: always team
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint production_widgets_position_uniq unique (position)
);

-- ── RLS + policies (1,2,7) ──
alter table public.production_widgets enable row level security;
-- Admin (active linked; app_is_admin enforces active) reads ALL rows incl hidden.
-- Everyone else reads ONLY visible rows.
drop policy if exists production_widgets_read on public.production_widgets;
create policy production_widgets_read on public.production_widgets
  for select to authenticated
  using (public.app_is_admin() or visible = true);

-- ── Privileges (1): SELECT only for authenticated; NO write grants.
--    All writes flow through SECURITY DEFINER admin RPCs (definer owner
--    performs the write; authenticated has no direct DML privilege). ──
revoke all on public.production_widgets from public, anon, authenticated;
grant select on public.production_widgets to authenticated;

-- ══ VALIDATION HELPER (internal) — whitelist enforcement (shared by save/preview) ══
create or replace function public._pw_validate(defs jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare w jsonb; k text; n int; positions int[] := '{}';
  ok_metric text[]  := array['count','sum','avg','progress'];
  ok_field  text[]  := array['production','gci','expected_gci','collected_gci','pipeline_gci'];
  ok_dmode  text[]  := array['board_range','current_year','ytd','current_month','all_time','custom'];
  ok_dfield text[]  := array['ao_date','contract_date','expected_close_date','close_date'];
  ok_format text[]  := array['whole','currency','percent','compact_currency','full_currency'];
  ok_filter text[]  := array['stage','deal_status','side','sale_type','property_type','active_pipeline','official_closed'];
  ok_keys   text[]  := array['id','position','title','subtitle','metric','field','filters','date_mode',
                             'date_field','custom_from','custom_to','format','color','goal_type','goal_value','visible','scope'];
  fk text;
begin
  if jsonb_typeof(defs) <> 'array' then raise exception 'config must be a JSON array'; end if;
  n := jsonb_array_length(defs);
  if n > 12 then raise exception 'too many widgets (max 12)'; end if;
  for w in select * from jsonb_array_elements(defs) loop
    -- reject unknown keys
    for k in select jsonb_object_keys(w) loop
      if not (k = any(ok_keys)) then raise exception 'unknown key: %', k; end if;
    end loop;
    if not ((w->>'metric') = any(ok_metric)) then raise exception 'bad metric: %', w->>'metric'; end if;
    if coalesce(w->>'title','') = '' or length(w->>'title') > 40 then raise exception 'title required, <=40 chars'; end if;
    if length(coalesce(w->>'subtitle','')) > 60 then raise exception 'subtitle <=60 chars'; end if;
    if not ((w->>'date_mode') = any(ok_dmode)) then raise exception 'bad date_mode: %', w->>'date_mode'; end if;
    if not ((w->>'date_field') = any(ok_dfield)) then raise exception 'bad date_field: %', w->>'date_field'; end if;
    if not ((w->>'format') = any(ok_format)) then raise exception 'bad format: %', w->>'format'; end if;
    if (w->>'color') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'bad color: %', w->>'color'; end if;
    if (w->>'position') is null or (w->>'position')::int < 0 then raise exception 'bad position'; end if;
    positions := positions || (w->>'position')::int;
    -- metric/field coherence
    if (w->>'metric') in ('sum','avg') then
      if not ((w->>'field') = any(ok_field)) then raise exception 'sum/avg require an approved field'; end if;
    end if;
    if (w->>'metric') = 'count' and (w->>'field') is not null and (w->>'field') <> '' then
      raise exception 'count must not set a field'; end if;
    -- pipeline_gci only with active pipeline filtering (4)
    if (w->>'field') = 'pipeline_gci' and coalesce((w->'filters'->>'active_pipeline')::boolean,false) <> true then
      raise exception 'pipeline_gci may be used only with active_pipeline=true'; end if;
    -- filters keys whitelist
    if (w ? 'filters') and jsonb_typeof(w->'filters') <> 'object' then raise exception 'filters must be object'; end if;
    if (w ? 'filters') then
      for fk in select jsonb_object_keys(w->'filters') loop
        if not (fk = any(ok_filter)) then raise exception 'unknown filter: %', fk; end if;
      end loop;
    end if;
    -- goal rules (8)
    if (w->>'metric') = 'progress' then
      if coalesce(w->>'goal_type','') not in ('team_goal','custom') then raise exception 'progress requires goal_type team_goal|custom'; end if;
      if (w->>'goal_type') = 'custom' and coalesce((w->>'goal_value')::numeric,0) <= 0 then
        raise exception 'custom goal_value must be positive'; end if;
    end if;
    -- custom date range
    if (w->>'date_mode') = 'custom' then
      if (w->>'custom_from') is null or (w->>'custom_to') is null then raise exception 'custom date_mode requires custom_from/custom_to'; end if;
      if (w->>'custom_from')::date > (w->>'custom_to')::date then raise exception 'custom_from must be <= custom_to'; end if;
    end if;
    if coalesce(w->>'scope','team') <> 'team' then raise exception 'v1 supports scope=team only'; end if;
  end loop;
  -- unique positions
  if (select count(*) from unnest(positions)) <> (select count(distinct u) from unnest(positions) u) then
    raise exception 'positions must be unique'; end if;
end $$;

-- ══ INTERNAL: resolve a widget's [from,to) half-open window (6) ══
create or replace function public._pw_window(date_mode text, custom_from date, custom_to date, board_from date, board_to date)
returns daterange language sql stable set search_path = '' as $$
  select case date_mode
    when 'board_range'   then daterange(board_from, board_to, '[)')
    when 'current_year'  then daterange(date_trunc('year', (now() at time zone 'America/New_York'))::date,
                                        (date_trunc('year', (now() at time zone 'America/New_York')) + interval '1 year')::date, '[)')
    when 'ytd'           then daterange(date_trunc('year', (now() at time zone 'America/New_York'))::date,
                                        ((now() at time zone 'America/New_York')::date + 1), '[)')
    when 'current_month' then daterange(date_trunc('month', (now() at time zone 'America/New_York'))::date,
                                        (date_trunc('month', (now() at time zone 'America/New_York')) + interval '1 month')::date, '[)')
    when 'all_time'      then daterange('-infinity', 'infinity', '()')
    when 'custom'        then daterange(custom_from, (custom_to + 1), '[)')  -- inclusive end → exclusive next day
    else daterange(board_from, board_to, '[)') end; $$;

-- ══ CORE: compute one widget's scalar (team-wide) off v_deals_canonical ══
-- SECURITY DEFINER owner reads the internal canonical view; returns a scalar,
-- never raw rows. Financial fields (gci/expected/collected/pipeline_gci) and
-- production are all AGGREGATES; no per-agent breakdown is produced.
create or replace function public._pw_compute(w public.production_widgets, board_from date, board_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  win daterange := public._pw_window(w.date_mode, w.custom_from, w.custom_to, board_from, board_to);
  df text := w.date_field;
  val numeric; cnt bigint; avgv numeric;
  yr int; goal numeric; progressed numeric;
  filt jsonb := coalesce(w.filters, '{}'::jsonb);
begin
  -- Build the filtered set expression via a single query against the canonical view.
  -- (All predicates applied inline; canonical view already excludes dup/test/archived/deleted.)
  with base as (
    select c.*,
      case df when 'ao_date' then c.ao_date when 'contract_date' then c.contract_date
              when 'expected_close_date' then c.expected_close_date else c.close_date end as dt
    from public.v_deals_canonical c
    where
      (not (filt ? 'active_pipeline') or (filt->>'active_pipeline')::boolean is not true or c.is_active_pipeline)
      and (not (filt ? 'official_closed') or (filt->>'official_closed')::boolean is not true or c.is_closed_official)
      and (not (filt ? 'stage')        or lower(trim(c.stage))        = lower(trim(filt->>'stage')))
      and (not (filt ? 'deal_status')  or lower(trim(coalesce(c.deal_status,''))) = lower(trim(filt->>'deal_status')))
      and (not (filt ? 'side')         or c.side_norm                = lower(trim(filt->>'side')))
      and (not (filt ? 'sale_type')    or lower(trim(coalesce(c.sale_type,'')))    = lower(trim(filt->>'sale_type')))
      and (not (filt ? 'property_type')or lower(trim(coalesce(c.property_type,'')))= lower(trim(filt->>'property_type')))
  ), scoped as (
    select * from base
    where (lower_inf(win) and upper_inf(win))         -- all_time: no date bound at all
       or (dt is not null and dt <@ win)              -- half-open [from,to) via daterange containment
  )
  select
    count(*),
    sum(case w.field
          when 'production'    then production
          when 'gci'           then gci
          when 'expected_gci'  then expected_gci
          when 'collected_gci' then collected_gci
          when 'pipeline_gci'  then coalesce(expected_gci, gci)
          else 0 end),
    avg(case w.field
          when 'production'    then production
          when 'gci'           then gci
          when 'expected_gci'  then expected_gci
          when 'collected_gci' then collected_gci
          when 'pipeline_gci'  then coalesce(expected_gci, gci)
          else null end)
  into cnt, val, avgv from scoped;

  if w.metric = 'count' then
    return jsonb_build_object('value', cnt);
  elsif w.metric = 'sum' then
    return jsonb_build_object('value', coalesce(val,0));
  elsif w.metric = 'avg' then
    return jsonb_build_object('value', coalesce(avgv,0));
  elsif w.metric = 'progress' then
    if w.goal_type = 'custom' then goal := w.goal_value;
    else
      -- team goal: relevant year from the resolved window (8; no hardcoded 300)
      yr := extract(year from coalesce(lower(win), (now() at time zone 'America/New_York')::date))::int;
      select target into goal from public.team_goals where year = yr and goal_type = 'closed_deals';
    end if;
    -- progressed value = count for a count-based goal (deals toward goal)
    progressed := cnt;
    return jsonb_build_object(
      'value', progressed,
      'goal', goal,
      'remaining', case when goal is not null then greatest(goal - progressed, 0) else null end,
      'progress_pct', case when coalesce(goal,0) > 0 then round(progressed::numeric/goal*100,1) else null end);
  end if;
  return jsonb_build_object('error', true);
end $$;

-- ══ READ PATH (all authenticated): loads VISIBLE defs itself, returns render-ready payload (3) ══
create or replace function public.app_production_widget_values(board_from date, board_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare w public.production_widgets; out jsonb := '[]'::jsonb; item jsonb; calc jsonb;
begin
  for w in select * from public.production_widgets where visible = true order by position loop
    begin
      -- re-validate the stored row defensively; on failure emit error status
      perform public._pw_validate(jsonb_build_array(to_jsonb(w) - 'created_at' - 'updated_at' - 'id'));
      calc := public._pw_compute(w, board_from, board_to);
      item := jsonb_build_object(
        'id', w.id, 'title', w.title, 'subtitle', w.subtitle, 'color', w.color,
        'display_format', w.format, 'position', w.position, 'metric', w.metric)
        || calc;
    exception when others then
      item := jsonb_build_object('id', w.id, 'title', w.title, 'subtitle', w.subtitle,
        'color', w.color, 'display_format', w.format, 'position', w.position, 'error', true);
    end;
    out := out || jsonb_build_array(item);
  end loop;
  return out;
end $$;

-- ══ ADMIN: get ALL defs (incl hidden) for the editor (7) ══
create or replace function public.app_get_production_widgets()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.app_is_admin() then return jsonb_build_object('error','forbidden'); end if;
  return coalesce((select jsonb_agg(to_jsonb(w) order by w.position) from public.production_widgets w), '[]'::jsonb);
end $$;

-- ══ ADMIN: full-replace save (validated) ══
create or replace function public.app_save_production_widgets(config jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare w jsonb;
begin
  if not public.app_is_admin() then return jsonb_build_object('error','forbidden'); end if;
  perform public._pw_validate(config);
  delete from public.production_widgets;
  for w in select * from jsonb_array_elements(config) loop
    insert into public.production_widgets
      (position,title,subtitle,metric,field,filters,date_mode,date_field,custom_from,custom_to,format,color,goal_type,goal_value,visible,scope,updated_at)
    values (
      (w->>'position')::int, w->>'title', nullif(w->>'subtitle',''), w->>'metric',
      nullif(w->>'field',''), coalesce(w->'filters','{}'::jsonb), w->>'date_mode',
      coalesce(nullif(w->>'date_field',''),'close_date'),
      nullif(w->>'custom_from','')::date, nullif(w->>'custom_to','')::date,
      w->>'format', w->>'color', nullif(w->>'goal_type',''), nullif(w->>'goal_value','')::numeric,
      coalesce((w->>'visible')::boolean, true), 'team', now());
  end loop;
  return jsonb_build_object('ok', true, 'count', jsonb_array_length(config));
end $$;

-- ══ ADMIN: reset to the four defaults ══
create or replace function public.app_reset_production_widgets()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_is_admin() then return jsonb_build_object('error','forbidden'); end if;
  delete from public.production_widgets;
  insert into public.production_widgets (position,title,metric,field,filters,date_mode,date_field,format,color,visible,scope) values
    (0,'Closed Deals',      'count', null,        '{"official_closed":true}'::jsonb, 'current_year','close_date','whole',        '#0073EA', true,'team'),
    (1,'Active Pipeline',   'count', null,        '{"active_pipeline":true}'::jsonb, 'all_time',    'close_date','whole',        '#00C875', true,'team'),
    (2,'Closed Production', 'sum',   'production', '{"official_closed":true}'::jsonb, 'current_year','close_date','full_currency','#037f4c', true,'team'),
    (3,'Pipeline Production','sum',  'production', '{"active_pipeline":true}'::jsonb, 'all_time',    'close_date','full_currency','#FDAB3D', true,'team');
  return jsonb_build_object('ok', true);
end $$;

-- ══ ADMIN: preview unsaved drafts (validated) ══
create or replace function public.app_preview_production_widgets(config jsonb, board_from date, board_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare w jsonb; row public.production_widgets; out jsonb := '[]'::jsonb; item jsonb; calc jsonb;
begin
  if not public.app_is_admin() then return jsonb_build_object('error','forbidden'); end if;
  perform public._pw_validate(config);
  for w in select * from jsonb_array_elements(config) loop
    row := null;
    row.id := gen_random_uuid();
    row.position := (w->>'position')::int; row.title := w->>'title'; row.subtitle := nullif(w->>'subtitle','');
    row.metric := w->>'metric'; row.field := nullif(w->>'field','');
    row.filters := coalesce(w->'filters','{}'::jsonb); row.date_mode := w->>'date_mode';
    row.date_field := coalesce(nullif(w->>'date_field',''),'close_date');
    row.custom_from := nullif(w->>'custom_from','')::date; row.custom_to := nullif(w->>'custom_to','')::date;
    row.format := w->>'format'; row.color := w->>'color';
    row.goal_type := nullif(w->>'goal_type',''); row.goal_value := nullif(w->>'goal_value','')::numeric;
    calc := public._pw_compute(row, board_from, board_to);
    item := jsonb_build_object('position', row.position, 'title', row.title, 'subtitle', row.subtitle,
      'color', row.color, 'display_format', row.format, 'metric', row.metric) || calc;
    out := out || jsonb_build_array(item);
  end loop;
  return out;
end $$;

-- ── Execution privileges ──
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.app_production_widget_values(date,date)',
    'public.app_get_production_widgets()',
    'public.app_save_production_widgets(jsonb)',
    'public.app_reset_production_widgets()',
    'public.app_preview_production_widgets(jsonb,date,date)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  -- internal helpers: no client execute
  foreach fn in array array[
    'public._pw_validate(jsonb)','public._pw_window(text,date,date,date,date)',
    'public._pw_compute(public.production_widgets,date,date)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('revoke all on function %s from authenticated', fn);
  end loop;
end $$;

-- ── Seed the four defaults (direct insert; no admin session during migration) ──
insert into public.production_widgets (position,title,metric,field,filters,date_mode,date_field,format,color,visible,scope) values
  (0,'Closed Deals',       'count', null,        '{"official_closed":true}'::jsonb, 'current_year','close_date','whole',        '#0073EA', true,'team'),
  (1,'Active Pipeline',    'count', null,        '{"active_pipeline":true}'::jsonb, 'all_time',    'close_date','whole',        '#00C875', true,'team'),
  (2,'Closed Production',  'sum',   'production', '{"official_closed":true}'::jsonb, 'current_year','close_date','full_currency','#037f4c', true,'team'),
  (3,'Pipeline Production','sum',   'production', '{"active_pipeline":true}'::jsonb, 'all_time',    'close_date','full_currency','#FDAB3D', true,'team');

update public._app_migrations set status='complete', applied_at=now(), rolled_back_at=null where name='production_widgets';
commit;
select 'PRODUCTION WIDGETS migration applied' as status;
