-- ══════════════════════════════════════════════════════════════════
-- PHASE 1 · MIGRATION A2 — DASHBOARD REPORTING FOUNDATION
-- Independent of A1 (A1 columns + duplicate marks already live — untouched).
-- A2 makes ZERO changes to existing CRM tables. One-time, collision-safe,
-- transactional. NOT applied/verified on live DB. Rollback: A2_rollback.sql.
-- Scope: canonical reporting defs + team goal storage + aggregate-only RPC.
-- Excludes: RLS on existing tables, secretary perms, auth linking, existing
-- policy changes, duplicate cleanup, frontend, user-role write perms.
-- ══════════════════════════════════════════════════════════════════
begin;

-- ── migration record: create, SECURE (RLS + revoke, no policies), verify shape ──
create table if not exists public._app_migrations (
  name text primary key,
  status text not null,
  applied_at timestamptz not null default now(),
  rolled_back_at timestamptz);
alter table public._app_migrations enable row level security;
revoke all on public._app_migrations from public, anon, authenticated;
do $$
begin
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='_app_migrations' and column_name='name' and data_type='text') then
    raise exception '_app_migrations.name missing or not text'; end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='_app_migrations' and column_name='status' and data_type='text') then
    raise exception '_app_migrations.status missing or not text'; end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='_app_migrations' and column_name='applied_at' and data_type='timestamp with time zone') then
    raise exception '_app_migrations.applied_at missing or not timestamptz'; end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='_app_migrations' and column_name='rolled_back_at' and data_type='timestamp with time zone') then
    raise exception '_app_migrations.rolled_back_at missing or not timestamptz'; end if;
  if not exists(select 1 from information_schema.table_constraints tc
      join information_schema.key_column_usage k on tc.constraint_name=k.constraint_name and tc.table_schema=k.table_schema
      where tc.table_schema='public' and tc.table_name='_app_migrations' and tc.constraint_type='PRIMARY KEY' and k.column_name='name') then
    raise exception '_app_migrations primary key not on (name)'; end if;
end $$;

-- ── PREFLIGHT ──
do $$
declare need_col text; tbl text; col text; fn text;
begin
  if current_setting('server_version_num')::int < 150000 then raise exception 'Requires PostgreSQL 15+.'; end if;

  if exists(select 1 from public._app_migrations where name='phase1_A2' and status='complete') then
    raise exception 'phase1_A2 already fully installed. Nothing to do.'; end if;
  if exists(select 1 from public._app_migrations where name='phase1_A2' and status='in_progress') then
    raise exception 'phase1_A2 in a partial/unexpected state. Run A2_rollback.sql, then re-run.'; end if;

  foreach tbl in array array['agents','deals','listings','tasks','calendar_events','contacts','calls','agent_goals'] loop
    if to_regclass('public.'||tbl) is null then raise exception 'Missing table public.%', tbl; end if; end loop;

  -- required columns, incl. A1 exclusion columns AND deals.expected_gci (must already exist; A2 does NOT create it)
  foreach need_col in array array[
    'agents:auth_user_id','agents:role','agents:active',
    'deals:agent_id','deals:stage','deals:deal_status','deals:side','deals:gci','deals:production',
    'deals:ao_date','deals:contract_date','deals:close_date','deals:expected_gci',
    'deals:is_duplicate','deals:is_test','deals:archived_at','deals:deleted_at'] loop
    tbl := split_part(need_col,':',1); col := split_part(need_col,':',2);
    if not exists(select 1 from information_schema.columns
        where table_schema='public' and table_name=tbl and column_name=col) then
      raise exception 'Missing column %.% (A2 requires it to pre-exist)', tbl, col; end if;
  end loop;

  -- collision-safety: A2-owned objects must NOT pre-exist
  foreach fn in array array[
    'public.app_current_agent_id()','public.app_is_admin()',
    'public.app_team_goal(integer)','public.app_dashboard_summary(text,uuid,date,date)'] loop
    if to_regprocedure(fn) is not null then
      raise exception 'Function % already exists — run A2_rollback.sql (or teardown) first.', fn; end if; end loop;
  if to_regclass('public.v_deals_canonical') is not null then raise exception 'view public.v_deals_canonical already exists — rollback first.'; end if;
  if to_regclass('public.team_goals') is not null then raise exception 'table public.team_goals already exists (may hold data) — rollback/teardown first.'; end if;
  if exists(select 1 from pg_constraint where conname='team_goals_uniq') then raise exception 'constraint team_goals_uniq already exists — rollback first.'; end if;
end $$;

insert into public._app_migrations(name,status,applied_at,rolled_back_at)
values ('phase1_A2','in_progress',now(),null)
on conflict (name) do update set status='in_progress', applied_at=now(), rolled_back_at=null;

-- ── (3) team goal storage — LOCKED (RLS on, no policies, privileges revoked) ──
create table public.team_goals (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  goal_type text not null,
  target numeric not null,
  timezone text not null default 'America/New_York',
  updated_at timestamptz not null default now(),
  constraint team_goals_uniq unique nulls not distinct (year, goal_type));
alter table public.team_goals enable row level security;
revoke all on public.team_goals from public, anon, authenticated;
insert into public.team_goals (year, goal_type, target, timezone) values (2026, 'closed_deals', 300, 'America/New_York');

-- ── identity helpers (SECURITY DEFINER, search_path='', active IS TRUE) ──
create function public.app_current_agent_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.agents where auth_user_id = auth.uid() and active is true limit 1; $$;

create function public.app_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.agents where auth_user_id = auth.uid() and role='admin' and active is true); $$;

create function public.app_team_goal(yr int)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('year',year,'goal_type',goal_type,'target',target)
    from public.team_goals where year=yr and goal_type='closed_deals'), jsonb_build_object('missing',true)); $$;

-- ── INTERNAL canonical view: exclusions on all statuses, normalized,
--    security_invoker, NO grants (read only via definer RPC) ──
create view public.v_deals_canonical with (security_invoker = true) as
  select d.*,
    (d.is_duplicate=false and d.is_test=false and d.archived_at is null and d.deleted_at is null) as is_countable,
    (lower(trim(d.stage))='closed' and lower(trim(coalesce(d.deal_status,'')))='closed'
      and d.is_duplicate=false and d.is_test=false and d.archived_at is null and d.deleted_at is null) as is_closed_official,
    (lower(trim(d.stage))='offer accepted'
      and d.is_duplicate=false and d.is_test=false and d.archived_at is null and d.deleted_at is null) as is_accepted_offer,
    (lower(trim(d.stage))='under contract'
      and d.is_duplicate=false and d.is_test=false and d.archived_at is null and d.deleted_at is null) as is_under_contract,
    (lower(trim(d.stage)) in ('negotiations','offer accepted','under shtar','under contract')
      and d.is_duplicate=false and d.is_test=false and d.archived_at is null and d.deleted_at is null) as is_active_pipeline,
    lower(trim(coalesce(d.side,''))) as side_norm,
    coalesce(d.expected_gci, d.gci) as pipeline_gci_val
  from public.deals d;
revoke all on public.v_deals_canonical from public, anon, authenticated;

-- ── (4) aggregate-only dashboard RPC ──
create function public.app_dashboard_summary(mode text, target uuid, from_date date, to_date date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_agent uuid := public.app_current_agent_id();
  is_adm boolean := public.app_is_admin();
  is_agt boolean := exists(select 1 from public.agents where auth_user_id = auth.uid() and role='agent' and active is true);
  eff uuid; team boolean := false; agent_restricted boolean := false; fin boolean := false;
  yr int := extract(year from from_date)::int;
  annual_from date; annual_to date;
  out jsonb := '{}'::jsonb;
  team_target numeric; team_annual_closed int; filtered_closed int;
begin
  if mode is null or mode not in ('self','agent','team') then return jsonb_build_object('error','bad_mode'); end if;
  if from_date is null or to_date is null or from_date >= to_date then return jsonb_build_object('error','bad_date_range'); end if;
  annual_from := make_date(yr,1,1); annual_to := make_date(yr+1,1,1);

  if mode='self' then
    -- resolve via auth.uid() only; ignore target
    if v_agent is null then return jsonb_build_object('error','no_agent_link'); end if;
    if not (is_adm or is_agt) then return jsonb_build_object('error','forbidden'); end if;   -- secretary/other forbidden
    eff := v_agent; fin := true;
  elsif mode='agent' then
    if target is null then return jsonb_build_object('error','target_required'); end if;
    if is_adm then
      if not exists(select 1 from public.agents where id = target and active is true) then
        return jsonb_build_object('error','forbidden'); end if;   -- target must exist & be active
      eff := target; fin := true;
    elsif is_agt and target = v_agent then
      eff := v_agent; fin := true;                                -- agent may request only own id
    else
      return jsonb_build_object('error','forbidden');
    end if;
  else  -- team
    if v_agent is null then return jsonb_build_object('error','forbidden'); end if;   -- unlinked
    team := true;
    if is_adm then fin := true;
    elsif is_agt then agent_restricted := true; fin := false;     -- (5) restricted goal-only
    else return jsonb_build_object('error','forbidden'); end if;  -- secretary/other
  end if;

  select target into team_target from public.team_goals where year=yr and goal_type='closed_deals';
  select count(*) into team_annual_closed from public.v_deals_canonical
    where is_closed_official and close_date >= annual_from and close_date < annual_to;
  select count(*) into filtered_closed from public.v_deals_canonical
    where is_closed_official and close_date >= from_date and close_date < to_date;

  -- agent team mode: ONLY closed counts + goal fields (no financials/raw/individual)
  if agent_restricted then
    return jsonb_build_object(
      'scope','team','restricted',true,'from',from_date,'to',to_date,
      'filtered_closed_deals', filtered_closed,
      'team_goal_closed_deals', team_annual_closed,
      'team_goal_target', team_target,
      'team_goal_remaining', case when team_target is not null then greatest(team_target - team_annual_closed,0) else null end,
      'team_goal_progress_pct', case when coalesce(team_target,0)>0 then round(team_annual_closed::numeric/team_target*100,1) else null end);
  end if;

  out := out || jsonb_build_object(
    'filtered_closed_deals', filtered_closed,
    'team_goal_closed_deals', team_annual_closed,
    'team_goal_target', team_target,
    'team_goal_remaining', case when team_target is not null then greatest(team_target - team_annual_closed,0) else null end,
    'team_goal_progress_pct', case when coalesce(team_target,0)>0 then round(team_annual_closed::numeric/team_target*100,1) else null end);

  out := out || (select jsonb_build_object(
      'buyer_side_closed', count(*) filter (where c.is_closed_official and c.side_norm='buyer' and c.close_date>=from_date and c.close_date<to_date),
      'seller_side_closed', count(*) filter (where c.is_closed_official and c.side_norm='seller' and c.close_date>=from_date and c.close_date<to_date),
      'accepted_offers', count(*) filter (where c.is_accepted_offer and c.ao_date>=from_date and c.ao_date<to_date),
      'under_contract_period', count(*) filter (where c.is_under_contract and c.contract_date>=from_date and c.contract_date<to_date),
      'active_deals', count(*) filter (where c.is_active_pipeline),
      'under_contract_now', count(*) filter (where c.is_under_contract),
      'closed_missing_close_date', count(*) filter (where lower(trim(c.stage))='closed'
          and lower(trim(coalesce(c.deal_status,'')))='closed' and c.close_date is null
          and c.is_duplicate=false and c.is_test=false and c.archived_at is null and c.deleted_at is null))
    from public.v_deals_canonical c where (team or c.agent_id = eff));

  if fin then
    out := out || (select jsonb_build_object(
        'closed_gci', coalesce(sum(gci) filter (where is_closed_official and close_date>=from_date and close_date<to_date),0),
        'closed_production', coalesce(sum(production) filter (where is_closed_official and close_date>=from_date and close_date<to_date),0),
        'pipeline_gci', coalesce(sum(pipeline_gci_val) filter (where is_active_pipeline),0))
      from public.v_deals_canonical where (team or agent_id = eff));
  end if;

  return out || jsonb_build_object('scope',mode,'from',from_date,'to',to_date,'restricted',false);
end; $$;

-- ── (5) execution privileges: internal helpers callable by NO client role;
--        only the two API functions granted to authenticated ──
revoke all on function public.app_current_agent_id() from public, anon, authenticated;
revoke all on function public.app_is_admin() from public, anon, authenticated;
revoke all on function public.app_team_goal(int) from public, anon, authenticated;
revoke all on function public.app_dashboard_summary(text,uuid,date,date) from public, anon, authenticated;
grant execute on function public.app_team_goal(int) to authenticated;
grant execute on function public.app_dashboard_summary(text,uuid,date,date) to authenticated;

update public._app_migrations set status='complete', applied_at=now(), rolled_back_at=null where name='phase1_A2';
commit;

-- ══ VERIFICATION (read-only; run as postgres/service in SQL editor) ══
select 'phase1_A2 status (expect complete)' as check, status from public._app_migrations where name='phase1_A2';
select 'exact function signatures present (expect all t)' as check,
  to_regprocedure('public.app_current_agent_id()') is not null as f_agent_id,
  to_regprocedure('public.app_is_admin()') is not null as f_is_admin,
  to_regprocedure('public.app_team_goal(integer)') is not null as f_team_goal,
  to_regprocedure('public.app_dashboard_summary(text,uuid,date,date)') is not null as f_summary;
select 'canonical view exists (expect t)' as check, to_regclass('public.v_deals_canonical') is not null as present;
select 'canonical view direct access revoked (expect f,f)' as check,
  has_table_privilege('authenticated','public.v_deals_canonical','SELECT') as authenticated_select,
  has_table_privilege('anon','public.v_deals_canonical','SELECT') as anon_select;
select '_app_migrations inaccessible to clients (expect f,f)' as check,
  has_table_privilege('authenticated','public._app_migrations','SELECT') as authenticated_select,
  has_table_privilege('anon','public._app_migrations','SELECT') as anon_select;
select 'team_goals inaccessible to clients (expect f,f)' as check,
  has_table_privilege('authenticated','public.team_goals','SELECT') as authenticated_select,
  has_table_privilege('anon','public.team_goals','SELECT') as anon_select;
select 'only API functions executable by authenticated (expect f,f,t,t)' as check,
  has_function_privilege('authenticated','public.app_current_agent_id()','EXECUTE') as ex_agent_id,
  has_function_privilege('authenticated','public.app_is_admin()','EXECUTE') as ex_is_admin,
  has_function_privilege('authenticated','public.app_team_goal(integer)','EXECUTE') as ex_team_goal,
  has_function_privilege('authenticated','public.app_dashboard_summary(text,uuid,date,date)','EXECUTE') as ex_summary;
select 'team goal (expect 300)' as check, target from public.team_goals where year=2026 and goal_type='closed_deals';
select 'official closed 2026 (expect 89)' as check, count(*) as n from public.v_deals_canonical
  where is_closed_official and close_date >= '2026-01-01' and close_date < '2027-01-01';
