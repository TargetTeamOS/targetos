-- ══════════════════════════════════════════════════════════════════
-- PRODUCTION BOARD WIDGETS — MIGRATION (final consolidated revision)
-- Dedicated public.production_widgets + secure RPCs. One shared team
-- config; admin-only writes via SECURITY DEFINER RPCs (NO direct
-- authenticated DML). All authenticated users read the SAME team-wide
-- computed scalars. NOT applied/verified on live DB.
-- Untouched: system_settings, deals, RLS on existing tables, A1/A2 data,
-- duplicate marks. Rollback: production_widgets_rollback.sql
-- Depends on A2: public.app_is_admin(), public.v_deals_canonical,
-- public.team_goals.
-- ══════════════════════════════════════════════════════════════════
begin;

create table if not exists public._app_migrations (
  name text primary key, status text not null,
  applied_at timestamptz not null default now(), rolled_back_at timestamptz);

-- ── PREFLIGHT (5): abort if any migration-owned object already exists ──
do $$
declare fn text;
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
  -- migration-owned table + constraint must NOT pre-exist
  if to_regclass('public.production_widgets') is not null then raise exception 'table public.production_widgets already exists — rollback first.'; end if;
  if exists(select 1 from pg_constraint where conname='production_widgets_position_uniq') then raise exception 'constraint production_widgets_position_uniq already exists — rollback first.'; end if;
  -- ALL migration-owned functions (API + internal helpers) must NOT pre-exist (5)
  foreach fn in array array[
    'public.app_production_widget_values(date,date)',
    'public.app_get_production_widgets()',
    'public.app_save_production_widgets(jsonb)',
    'public.app_reset_production_widgets()',
    'public.app_preview_production_widgets(jsonb,date,date)',
    'public._pw_validate(jsonb,boolean)',
    'public._pw_window(text,date,date,date,date)',
    'public._pw_compute(public.production_widgets,date,date)'
  ] loop
    if to_regprocedure(fn) is not null then
      raise exception 'Function % already exists — run rollback (or teardown) first.', fn; end if;
  end loop;
end $$;

insert into public._app_migrations(name,status,applied_at,rolled_back_at)
values ('production_widgets','in_progress',now(),null)
on conflict (name) do update set status='in_progress', applied_at=now(), rolled_back_at=null;

-- ── TABLE with table-level CHECK constraints (4) ──
create table public.production_widgets (
  id           uuid primary key default gen_random_uuid(),
  position     int  not null,
  title        text not null,
  subtitle     text,
  metric       text not null,
  field        text,
  filters      jsonb not null default '{}'::jsonb,
  date_mode    text not null,
  date_field   text not null default 'close_date',
  custom_from  date,
  custom_to    date,
  format       text not null,
  color        text not null default '#0073EA',
  goal_type    text,
  goal_value   numeric,
  goal_year    int,
  visible      boolean not null default true,
  scope        text not null default 'team',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint production_widgets_position_uniq unique (position),
  constraint pw_position_nonneg   check (position >= 0),
  constraint pw_title_len         check (char_length(title) between 1 and 40),
  constraint pw_subtitle_len      check (subtitle is null or char_length(subtitle) <= 60),
  constraint pw_metric_wl         check (metric in ('count','sum','avg','progress')),
  constraint pw_field_wl          check (field is null or field in ('production','gci','expected_gci','collected_gci','pipeline_gci')),
  constraint pw_date_mode_wl      check (date_mode in ('board_range','current_year','ytd','current_month','all_time','custom')),
  constraint pw_date_field_wl     check (date_field in ('ao_date','contract_date','expected_close_date','close_date')),
  constraint pw_format_wl         check (format in ('whole','currency','percent','compact_currency','full_currency')),
  constraint pw_color_fmt         check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint pw_goal_type_wl      check (goal_type is null or goal_type in ('team_goal','custom')),
  constraint pw_scope_team        check (scope = 'team'),
  constraint pw_filters_object    check (jsonb_typeof(filters) = 'object'),
  constraint pw_custom_dates      check (date_mode <> 'custom' or (custom_from is not null and custom_to is not null and custom_from <= custom_to)),
  constraint pw_custom_goal_pos   check (goal_type is distinct from 'custom' or (goal_value is not null and goal_value > 0)),
  -- metric/field coherence: sum/avg need a field; count must not have one
  constraint pw_metric_field_coh  check (
    (metric in ('sum','avg') and field is not null)
    or (metric = 'count' and field is null)
    or (metric = 'progress')),
  -- team_goal must resolve to one clear year → forbid all_time, require a year source (9)
  constraint pw_teamgoal_year     check (goal_type is distinct from 'team_goal' or (date_mode <> 'all_time' or goal_year is not null))
);

-- ── RLS + policy (admin reads all incl hidden; others visible-only) ──
alter table public.production_widgets enable row level security;
-- (1) SELECT policy is visible-only and does NOT call app_is_admin().
-- Admins retrieve hidden defs via the admin-only app_get_production_widgets() RPC.
create policy production_widgets_read on public.production_widgets
  for select to authenticated
  using (visible = true);

-- ── Privileges: SELECT only for authenticated; NO write grants ──
revoke all on public.production_widgets from public, anon, authenticated;
grant select on public.production_widgets to authenticated;

-- ══ INTERNAL VALIDATION HELPER — whitelist + value-type enforcement (1,7) ══
create function public._pw_validate(defs jsonb, collection_checks boolean default true)
returns void language plpgsql immutable set search_path = '' as $$
declare w jsonb; k text; fk text; n int; positions int[] := '{}'; ids text[] := '{}';
  ok_metric text[] := array['count','sum','avg','progress'];
  ok_field  text[] := array['production','gci','expected_gci','collected_gci','pipeline_gci'];
  ok_dmode  text[] := array['board_range','current_year','ytd','current_month','all_time','custom'];
  ok_dfield text[] := array['ao_date','contract_date','expected_close_date','close_date'];
  ok_format text[] := array['whole','currency','percent','compact_currency','full_currency'];
  ok_bool_f text[] := array['active_pipeline','official_closed'];
  ok_text_f text[] := array['stage','deal_status','side','sale_type','property_type'];
  ok_keys   text[] := array['id','position','title','subtitle','metric','field','filters','date_mode',
                            'date_field','custom_from','custom_to','format','color','goal_type','goal_value',
                            'goal_year','visible','scope','created_at','updated_at'];
begin
  if jsonb_typeof(defs) <> 'array' then raise exception 'config must be a JSON array'; end if;
  n := jsonb_array_length(defs);
  if n > 12 then raise exception 'too many widgets (max 12)'; end if;
  for w in select * from jsonb_array_elements(defs) loop
    -- keys: reject unknown; created_at/updated_at tolerated but ignored (3)
    for k in select jsonb_object_keys(w) loop
      if not (k = any(ok_keys)) then raise exception 'unknown key: %', k; end if;
    end loop;
    if not ((w->>'metric') = any(ok_metric)) then raise exception 'bad metric: %', w->>'metric'; end if;
    if jsonb_typeof(w->'title') is distinct from 'string' or coalesce(w->>'title','')='' or char_length(w->>'title')>40 then
      raise exception 'title: required string <=40 chars'; end if;
    if (w ? 'subtitle') and jsonb_typeof(w->'subtitle') not in ('string','null') then raise exception 'subtitle must be string/null'; end if;
    if char_length(coalesce(w->>'subtitle','')) > 60 then raise exception 'subtitle <=60 chars'; end if;
    if not ((w->>'date_mode') = any(ok_dmode)) then raise exception 'bad date_mode: %', w->>'date_mode'; end if;
    if not ((w->>'date_field') = any(ok_dfield)) then raise exception 'bad date_field: %', w->>'date_field'; end if;
    if not ((w->>'format') = any(ok_format)) then raise exception 'bad format: %', w->>'format'; end if;
    if (w->>'color') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'bad color: %', w->>'color'; end if;
    if jsonb_typeof(w->'position') is distinct from 'number' or (w->>'position')::int < 0 then raise exception 'bad position'; end if;
    positions := positions || (w->>'position')::int;
    if coalesce(w->>'scope','team') <> 'team' then raise exception 'v1 supports scope=team only'; end if;
    if (w ? 'visible') and jsonb_typeof(w->'visible') not in ('boolean','null') then raise exception 'visible must be boolean'; end if;
    -- (3) id: if supplied and non-null, must be a valid UUID; collect for dupe check
    if (w ? 'id') and jsonb_typeof(w->'id') = 'string' and coalesce(w->>'id','') <> '' then
      if (w->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'malformed widget id: %', w->>'id'; end if;
      ids := ids || (w->>'id');
    end if;
    -- metric/field coherence
    if (w->>'metric') in ('sum','avg') then
      if not ((w->>'field') = any(ok_field)) then raise exception 'sum/avg require an approved field'; end if;
    end if;
    if (w->>'metric') = 'count' and coalesce(w->>'field','') <> '' then raise exception 'count must not set a field'; end if;
    -- pipeline_gci only with active pipeline filtering
    if (w->>'field') = 'pipeline_gci' and coalesce((w->'filters'->>'active_pipeline'),'') <> 'true' then
      raise exception 'pipeline_gci may be used only with active_pipeline=true'; end if;
    -- filters: object; validate KEYS and VALUE TYPES (7)
    if (w ? 'filters') then
      if jsonb_typeof(w->'filters') <> 'object' then raise exception 'filters must be an object'; end if;
      for fk in select jsonb_object_keys(w->'filters') loop
        if fk = any(ok_bool_f) then
          if jsonb_typeof(w->'filters'->fk) <> 'boolean' then raise exception 'filter % must be a JSON boolean', fk; end if;
          if (w->'filters'->>fk) <> 'true' then raise exception 'filter % accepts only true; omit the key when unused', fk; end if;
        elsif fk = any(ok_text_f) then
          if jsonb_typeof(w->'filters'->fk) <> 'string' then raise exception 'filter % must be a string', fk; end if;
          if coalesce(w->'filters'->>fk,'') = '' or char_length(w->'filters'->>fk) > 60 then raise exception 'filter % must be a non-empty string <=60 chars', fk; end if;
        else
          raise exception 'unknown filter: %', fk;
        end if;
      end loop;
    end if;
    -- goal rules (8,9)
    if (w->>'metric') = 'progress' then
      if coalesce(w->>'field','') <> '' then raise exception 'progress is deal-count based in v1; field must be null (no production/GCI/expected/collected/pipeline)'; end if;
      if coalesce(w->>'goal_type','') not in ('team_goal','custom') then raise exception 'progress requires goal_type team_goal|custom'; end if;
      if (w->>'goal_type') = 'custom' then
        if jsonb_typeof(w->'goal_value') is distinct from 'number' or (w->>'goal_value')::numeric <= 0 then
          raise exception 'custom goal_value must be a positive number'; end if;
      end if;
      if (w->>'goal_type') = 'team_goal' then
        if (w->>'date_mode') in ('all_time','board_range','custom') and (w->>'goal_year') is null then
          raise exception 'team_goal with date_mode % requires an explicit goal_year', w->>'date_mode'; end if;
        if (w ? 'goal_year') and jsonb_typeof(w->'goal_year') not in ('number','null') then raise exception 'goal_year must be a number'; end if;
        if (w->>'goal_year') is not null then
          if (w->>'goal_year')::numeric <> trunc((w->>'goal_year')::numeric) then raise exception 'goal_year must be a whole integer'; end if;
          if (w->>'goal_year')::int < 2000 or (w->>'goal_year')::int > 2100 then raise exception 'goal_year must be within 2000-2100'; end if;
        end if;
      end if;
    end if;
    -- custom date coherence
    if (w->>'date_mode') = 'custom' then
      if (w->>'custom_from') is null or (w->>'custom_to') is null then raise exception 'custom date_mode requires custom_from/custom_to'; end if;
      if (w->>'custom_from')::date > (w->>'custom_to')::date then raise exception 'custom_from must be <= custom_to'; end if;
    end if;
  end loop;
  if collection_checks then
    if (select count(*) from unnest(positions)) <> (select count(distinct u) from unnest(positions) u) then
      raise exception 'positions must be unique'; end if;
    -- positions must be contiguous 0..n-1
    if n > 0 then
      if (select min(u) from unnest(positions) u) <> 0
         or (select max(u) from unnest(positions) u) <> n - 1 then
        raise exception 'positions must be contiguous from 0 to widget_count-1'; end if;
    end if;
    -- (3) reject duplicate supplied ids within the config
    if (select count(*) from unnest(ids)) <> (select count(distinct u) from unnest(ids) u) then
      raise exception 'duplicate widget ids in configuration'; end if;
  end if;
end $$;

-- ══ INTERNAL: resolve window. Returns NULL for all_time (means "no date bound") (2) ══
create function public._pw_window(date_mode text, custom_from date, custom_to date, board_from date, board_to date)
returns daterange language plpgsql stable set search_path = '' as $$
declare nowd date := (now() at time zone 'America/New_York')::date;
begin
  if date_mode = 'all_time' then
    return null;                          -- caller treats NULL as unbounded (includes null date fields)
  elsif date_mode = 'board_range' then
    if board_from is null or board_to is null or board_from >= board_to then
      raise exception 'board_range requires board_from < board_to'; end if;   -- (8)
    return daterange(board_from, board_to, '[)');
  elsif date_mode = 'current_year' then
    return daterange(date_trunc('year', nowd)::date, (date_trunc('year', nowd) + interval '1 year')::date, '[)');
  elsif date_mode = 'ytd' then
    return daterange(date_trunc('year', nowd)::date, (nowd + 1), '[)');
  elsif date_mode = 'current_month' then
    return daterange(date_trunc('month', nowd)::date, (date_trunc('month', nowd) + interval '1 month')::date, '[)');
  elsif date_mode = 'custom' then
    return daterange(custom_from, (custom_to + 1), '[)');   -- inclusive end → exclusive next day (6)
  else
    raise exception 'bad date_mode %', date_mode;
  end if;
end $$;

-- ══ INTERNAL CORE: compute one widget's scalar (team-wide). Returns scalar, never rows. ══
create function public._pw_compute(w public.production_widgets, board_from date, board_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  win daterange := public._pw_window(w.date_mode, w.custom_from, w.custom_to, board_from, board_to);
  df text := w.date_field; all_time boolean := (w.date_mode = 'all_time');
  cnt bigint; val numeric; avgv numeric;
  yr int; goal numeric; progressed numeric;
  filt jsonb := coalesce(w.filters, '{}'::jsonb);
begin
  with base as (
    select c.*,
      case df when 'ao_date' then c.ao_date when 'contract_date' then c.contract_date
              when 'expected_close_date' then c.expected_close_date else c.close_date end as dt
    from public.v_deals_canonical c
    where
      (not (filt ? 'active_pipeline') or (filt->>'active_pipeline')::boolean is not true or c.is_active_pipeline)
      and (not (filt ? 'official_closed') or (filt->>'official_closed')::boolean is not true or c.is_closed_official)
      and (not (filt ? 'stage')         or lower(trim(c.stage))                    = lower(trim(filt->>'stage')))
      and (not (filt ? 'deal_status')   or lower(trim(coalesce(c.deal_status,'')))  = lower(trim(filt->>'deal_status')))
      and (not (filt ? 'side')          or c.side_norm                             = lower(trim(filt->>'side')))
      and (not (filt ? 'sale_type')     or lower(trim(coalesce(c.sale_type,'')))     = lower(trim(filt->>'sale_type')))
      and (not (filt ? 'property_type') or lower(trim(coalesce(c.property_type,''))) = lower(trim(filt->>'property_type')))
  ), scoped as (
    select * from base
    where all_time                                   -- all_time: NO date bound at all (incl. null dt) (2)
       or (dt is not null and win @> dt)              -- half-open [from,to) containment
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
    if w.goal_type = 'custom' then
      goal := w.goal_value;
    else
      -- team_goal: explicit goal_year wins; else derive from resolved window lower bound.
      -- Validation guarantees goal_year is present for all_time/board_range/custom.
      yr := w.goal_year;
      if yr is null then
        if win is null then return jsonb_build_object('error', true); end if;  -- all_time w/o year (shouldn't happen post-validation)
        yr := extract(year from lower(win))::int;
      end if;
      if yr is null then return jsonb_build_object('error', true); end if;
      select target into goal from public.team_goals where year = yr and goal_type = 'closed_deals';
    end if;
    progressed := cnt;
    return jsonb_build_object(
      'value', progressed,
      'goal', goal,
      'remaining', case when goal is not null then greatest(goal - progressed, 0) else null end,
      'progress_pct', case when coalesce(goal,0) > 0 then round(progressed::numeric/goal*100,1) else null end);
  end if;
  return jsonb_build_object('error', true);
end $$;

-- ══ READ PATH (all authenticated): loads visible defs, returns render-ready payload (3) ══
create function public.app_production_widget_values(board_from date, board_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare w public.production_widgets; out jsonb := '[]'::jsonb; item jsonb; calc jsonb;
begin
  for w in select * from public.production_widgets where visible = true order by position loop
    begin
      -- (6) reconstruct the accepted editable definition for THIS row and revalidate it
      perform public._pw_validate(jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'id', w.id, 'position', w.position, 'title', w.title, 'subtitle', w.subtitle,
        'metric', w.metric, 'field', w.field, 'filters', w.filters, 'date_mode', w.date_mode,
        'date_field', w.date_field, 'custom_from', w.custom_from, 'custom_to', w.custom_to,
        'format', w.format, 'color', w.color, 'goal_type', w.goal_type, 'goal_value', w.goal_value,
        'goal_year', w.goal_year, 'visible', w.visible, 'scope', w.scope)), false));
      calc := public._pw_compute(w, board_from, board_to);
      item := jsonb_build_object(
        'id', w.id, 'title', w.title, 'subtitle', w.subtitle, 'color', w.color,
        'display_format', w.format, 'position', w.position, 'metric', w.metric) || calc;
    exception when others then
      item := jsonb_build_object('id', w.id, 'title', w.title, 'subtitle', w.subtitle,
        'color', w.color, 'display_format', w.format, 'position', w.position, 'error', true);
    end;
    out := out || jsonb_build_array(item);
  end loop;
  return out;
end $$;

-- ══ ADMIN: get ALL defs (incl hidden) — EDITABLE keys only (3) ══
create function public.app_get_production_widgets()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.app_is_admin() then return jsonb_build_object('error','forbidden'); end if;
  return coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', w.id, 'position', w.position, 'title', w.title, 'subtitle', w.subtitle,
      'metric', w.metric, 'field', w.field, 'filters', w.filters, 'date_mode', w.date_mode,
      'date_field', w.date_field, 'custom_from', w.custom_from, 'custom_to', w.custom_to,
      'format', w.format, 'color', w.color, 'goal_type', w.goal_type, 'goal_value', w.goal_value,
      'goal_year', w.goal_year, 'visible', w.visible, 'scope', w.scope)) order by w.position)
    from public.production_widgets w), '[]'::jsonb);
end $$;

-- ══ ADMIN: full-replace save (validated) ══
create function public.app_save_production_widgets(config jsonb)
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
      -- (3) preserve a supplied valid UUID; generate only when none provided
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

-- ══ ADMIN: reset to the four defaults ══
create function public.app_reset_production_widgets()
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

-- ══ ADMIN: preview unsaved drafts (validated) ══
create function public.app_preview_production_widgets(config jsonb, board_from date, board_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare w jsonb; row public.production_widgets; out jsonb := '[]'::jsonb; item jsonb; calc jsonb;
begin
  if not public.app_is_admin() then return jsonb_build_object('error','forbidden'); end if;
  perform public._pw_validate(config);
  for w in select * from jsonb_array_elements(config) loop
    row := null;
    row.id := gen_random_uuid();
    row.position := (w->>'position')::int;
    row.title := w->>'title';
    row.subtitle := nullif(w->>'subtitle','');
    row.metric := w->>'metric';
    row.field := nullif(w->>'field','');
    row.filters := coalesce(w->'filters','{}'::jsonb);
    row.date_mode := w->>'date_mode';
    row.date_field := coalesce(nullif(w->>'date_field',''),'close_date');
    row.custom_from := nullif(w->>'custom_from','')::date;
    row.custom_to := nullif(w->>'custom_to','')::date;
    row.format := w->>'format';
    row.color := w->>'color';
    row.goal_type := nullif(w->>'goal_type','');
    row.goal_value := nullif(w->>'goal_value','')::numeric;
    row.goal_year := nullif(w->>'goal_year','')::int;
    row.scope := 'team';
    calc := public._pw_compute(row, board_from, board_to);
    item := jsonb_build_object('position', row.position, 'title', row.title, 'subtitle', row.subtitle,
      'color', row.color, 'display_format', row.format, 'metric', row.metric) || calc;
    out := out || jsonb_build_array(item);
  end loop;
  return out;
end $$;

-- ══ EXECUTE PRIVILEGES (1): revoke from PUBLIC/anon/authenticated on ALL, grant 5 API to authenticated ══
do $$
declare fn text;
begin
  -- revoke from everyone on every created function (API + internal)
  foreach fn in array array[
    'public.app_production_widget_values(date,date)',
    'public.app_get_production_widgets()',
    'public.app_save_production_widgets(jsonb)',
    'public.app_reset_production_widgets()',
    'public.app_preview_production_widgets(jsonb,date,date)',
    'public._pw_validate(jsonb,boolean)',
    'public._pw_window(text,date,date,date,date)',
    'public._pw_compute(public.production_widgets,date,date)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('revoke all on function %s from authenticated', fn);
  end loop;
  -- grant EXECUTE to authenticated on the five API functions only
  foreach fn in array array[
    'public.app_production_widget_values(date,date)',
    'public.app_get_production_widgets()',
    'public.app_save_production_widgets(jsonb)',
    'public.app_reset_production_widgets()',
    'public.app_preview_production_widgets(jsonb,date,date)'
  ] loop
    execute format('grant execute on function %s to authenticated', fn);
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
