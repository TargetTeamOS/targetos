-- ══════════════════════════════════════════════════════════════════
-- PHASE 1 · MIGRATION A2 — DASHBOARD REPORTING FOUNDATION
-- Independent of A1 (columns + duplicate marks already live — untouched).
-- One-time, collision-safe, transactional. NOT applied/verified on live DB.
-- Scope: canonical reporting defs + team goal storage + aggregate-only RPC.
-- EXPLICITLY EXCLUDES: RLS enforcement on existing tables, secretary
-- permissions, auth linking, existing-policy changes, duplicate cleanup,
-- frontend, user-role write perms.
-- Rollback: A2_rollback.sql.
-- ══════════════════════════════════════════════════════════════════
begin;

create table if not exists public._app_migrations (
  name text primary key, status text not null,
  applied_at timestamptz not null default now(), rolled_back_at timestamptz);

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

  -- verify A1 exclusion columns exist (A2 depends on them; A1 must have run)
  foreach need_col in array array[
    'agents:auth_user_id','agents:role','agents:active',
    'deals:agent_id','deals:stage','deals:deal_status','deals:side','deals:gci','deals:production',
    'deals:ao_date','deals:contract_date','deals:close_date',
    'deals:is_duplicate','deals:is_test','deals:archived_at','deals:deleted_at'] loop
    tbl := split_part(need_col,':',1); col := split_part(need_col,':',2);
    if not exists(select 1 from information_schema.columns
        where table_schema='public' and table_name=tbl and column_name=col) then
      raise exception 'Missing column %.% (did A1 run?)', tbl, col; end if;
  end loop;

  -- collision-safety: A2-owned objects must NOT pre-exist
  foreach fn in array array[
    'public.app_current_agent_id()','public.app_is_admin()',
    'public.app_team_goal(int)','public.app_dashboard_summary(text,uuid,date,date)'] loop
    if to_regprocedure(fn) is not null then
      raise exception 'Function % already exists — run A2_rollback.sql (or teardown) first.', fn; end if; end loop;
  if to_regclass('public.v_deals_canonical') is not null then raise exception 'view public.v_deals_canonical already exists — rollback first.'; end if;
  if to_regclass('public.team_goals') is not null then raise exception 'table public.team_goals already exists (may hold data) — export + teardown before reinstalling.'; end if;
  if exists(select 1 from pg_constraint where conname='team_goals_uniq') then raise exception 'constraint team_goals_uniq already exists — rollback first.'; end if;
end $$;

insert into public._app_migrations(name,status) values ('phase1_A2','in_progress');

-- ── (6) ensure expected_gci exists for pipeline GCI (additive, nullable) ──
alter table public.deals add column if not exists expected_gci numeric;

-- ── (3) team goal storage — LOCKED table (RLS on, no policies, privs revoked);
--        readable only via SECURITY DEFINER functions. Admin edit UI deferred. ──
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
insert into public.team_goals (year, goal_type, target) values (2026, 'closed_deals', 300);

-- ── identity helpers (SECURITY DEFINER, search_path='') ──
create function public.app_current_agent_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.agents where auth_user_id = auth.uid() and coalesce(active,true) limit 1; $$;

create function public.app_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.agents where auth_user_id=auth.uid() and role='admin' and coalesce(active,true)); $$;

create function public.app_team_goal(yr int)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('year',year,'goal_type',goal_type,'target',target)
    from public.team_goals where year=yr and goal_type='closed_deals'), jsonb_build_object('missing',true)); $$;

-- ── (1,7) INTERNAL canonical view: exclusions on all statuses, normalized,
--          security_invoker, NO grants to anyone (read only via definer RPC) ──
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
    coalesce(d.expected_gci, d.gci) as pipeline_gci_val   -- (6)
  from public.deals d;
revoke all on public.v_deals_canonical from public, anon, authenticated;

-- ── (2,4,5) aggregate-only dashboard RPC ──
-- Scope model (A2, no secretary system yet):
--   self  → own aggregates incl. financials.
--   agent → admin any target (financials); non-admin only self (else forbidden).
--   team  → admin: full incl. financials; ANY non-admin: RESTRICTED — closed
--           count + team goal + remaining + progress only. No GCI/production/
--           pipeline, no raw rows. (5)
-- Closed = stage 'Closed' AND deal_status 'Closed' by close_date (never ao_date) (2).
-- Pipeline GCI = coalesce(expected_gci,gci) via pipeline_gci_val, only if fin (6).
create function public.app_dashboard_summary(mode text, target uuid, from_date date, to_date date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_agent uuid := public.app_current_agent_id();
  is_adm boolean := public.app_is_admin();
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
    eff := v_agent;
    if eff is null then return jsonb_build_object('error','no_agent_link'); end if;
    fin := true;                                   -- own data
  elsif mode='agent' then
    if target is null then return jsonb_build_object('error','target_required'); end if;
    if is_adm then eff := target; fin := true;
    elsif target = v_agent then eff := v_agent; fin := true;   -- self via agent mode
    else return jsonb_build_object('error','forbidden'); end if;
  else  -- team
    team := true;
    if is_adm then fin := true; else agent_restricted := true; fin := false; end if;  -- (5)
  end if;

  select target into team_target from public.team_goals where year=yr and goal_type='closed_deals';
  select count(*) into team_annual_closed from public.v_deals_canonical
    where is_closed_official and close_date >= annual_from and close_date < annual_to;
  select count(*) into filtered_closed from public.v_deals_canonical
    where is_closed_official and close_date >= from_date and close_date < to_date;

  -- team goal block (non-financial; safe for restricted agents too)
  out := out || jsonb_build_object(
    'team_goal_closed_deals', team_annual_closed,
    'team_goal_target', team_target,
    'team_goal_remaining', case when team_target is not null then greatest(team_target - team_annual_closed,0) else null end,
    'team_goal_progress_pct', case when coalesce(team_target,0)>0 then round(team_annual_closed::numeric/team_target*100,1) else null end);

  if agent_restricted then   -- (5) agents in team mode: goal-only, nothing else
    return out || jsonb_build_object('scope','team','restricted',true,'from',from_date,'to',to_date);
  end if;

  -- counts (self / agent-self / admin-any / admin-team)
  out := out || (select jsonb_build_object(
      'filtered_closed_deals', count(*) filter (where c.is_closed_official and c.close_date>=from_date and c.close_date<to_date),
      'buyer_side_closed', count(*) filter (where c.is_closed_official and c.side_norm='buyer' and c.close_date>=from_date and c.close_date<to_date),
      'seller_side_closed', count(*) filter (where c.is_closed_official and c.side_norm='seller' and c.close_date>=from_date and c.close_date<to_date),
      'accepted_offers', count(*) filter (where c.is_accepted_offer and c.ao_date>=from_date and c.ao_date<to_date),
      'under_contract_period', count(*) filter (where c.is_under_contract and c.contract_date>=from_date and c.contract_date<to_date),
      'active_deals', count(*) filter (where c.is_active_pipeline),
      'under_contract_now', count(*) filter (where c.is_under_contract),
      'closed_missing_close_date', count(*) filter (where lower(trim(c.stage))='closed'
          and lower(trim(coalesce(c.deal_status,'')))='closed' and c.close_date is null
          and c.is_duplicate=false and c.is_test=false))
    from public.v_deals_canonical c where (team or c.agent_id = eff));

  if fin then   -- (6) financials only when authorized
    out := out || (select jsonb_build_object(
        'closed_gci', coalesce(sum(gci) filter (where is_closed_official and close_date>=from_date and close_date<to_date),0),
        'closed_production', coalesce(sum(production) filter (where is_closed_official and close_date>=from_date and close_date<to_date),0),
        'pipeline_gci', coalesce(sum(pipeline_gci_val) filter (where is_active_pipeline),0))
      from public.v_deals_canonical where (team or agent_id = eff));
  end if;

  return out || jsonb_build_object('scope',mode,'from',from_date,'to',to_date,'restricted',false);
end; $$;

-- ── execution privileges: revoke from public+anon, grant authenticated ──
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.app_current_agent_id()','public.app_is_admin()',
    'public.app_team_goal(int)','public.app_dashboard_summary(text,uuid,date,date)'] loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

update public._app_migrations set status='complete', applied_at=now() where name='phase1_A2';
commit;

-- ── VERIFICATION (read-only, post-commit) ──
select 'phase1_A2 install state' as check, status from public._app_migrations where name='phase1_A2';
select 'A2 functions (expect 4)' as check, count(*) as n from pg_proc
  where proname in ('app_current_agent_id','app_is_admin','app_team_goal','app_dashboard_summary');
select 'canonical view present' as check, count(*) as n from pg_views where viewname='v_deals_canonical';
select 'team_goals 2026 target' as check, target from public.team_goals where year=2026 and goal_type='closed_deals';
select 'official closed 2026 (expect 89)' as check, count(*) as n from public.v_deals_canonical
  where is_closed_official and close_date >= '2026-01-01' and close_date < '2027-01-01';
