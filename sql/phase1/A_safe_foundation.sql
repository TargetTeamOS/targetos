-- ══════════════════════════════════════════════════════════════════
-- PHASE 1 · MIGRATION A (REVISED v2) — SAFE FOUNDATION
-- Revised per security review. NOT yet applied/verified against live DB.
-- Adds NO restrictive RLS on existing data tables → no lockout.
-- Transactional + preflight assertions. Rollback: A_rollback.sql (v2).
-- 18 review items addressed (see inline tags (n)).
-- ══════════════════════════════════════════════════════════════════
begin;

-- ── PREFLIGHT (16) ──
do $$
begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'Requires PostgreSQL 15+ (UNIQUE NULLS NOT DISTINCT, security_invoker).'; end if;
  if to_regclass('public.deals')  is null then raise exception 'public.deals missing';  end if;
  if to_regclass('public.agents') is null then raise exception 'public.agents missing'; end if;
  if to_regclass('public.agent_goals') is null then raise exception 'public.agent_goals missing'; end if;
end $$;

-- ── 1. Exclusion columns (additive) ──
alter table public.deals add column if not exists is_duplicate boolean not null default false;
alter table public.deals add column if not exists is_test      boolean not null default false;
alter table public.deals add column if not exists archived_at  timestamptz;
alter table public.deals add column if not exists deleted_at   timestamptz;
alter table public.deals add column if not exists duplicate_of uuid;

-- ── 2. Secretary permissions (13,14) ──
create table if not exists public.secretary_permissions (
  id uuid primary key default gen_random_uuid(),
  secretary_id uuid not null references public.agents(id) on delete cascade,
  target_agent_id uuid references public.agents(id) on delete cascade,
  resource text not null default '*',
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_assign boolean not null default false,
  can_complete boolean not null default false,
  can_delete boolean not null default false,
  can_view_financials boolean not null default false,
  can_access_unassigned boolean not null default false,
  team_wide boolean not null default false,
  created_at timestamptz not null default now(),
  constraint secretary_permissions_uniq unique nulls not distinct (secretary_id, target_agent_id, resource)
);
alter table public.secretary_permissions enable row level security;

-- ── 3. Secured team_goals (8,14) ──
create table if not exists public.team_goals (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  goal_type text not null,
  target numeric not null,
  timezone text not null default 'America/New_York',
  updated_at timestamptz not null default now(),
  constraint team_goals_uniq unique nulls not distinct (year, goal_type)
);
alter table public.team_goals enable row level security;
insert into public.team_goals (year, goal_type, target)
values (2026, 'closed_deals', 300)
on conflict on constraint team_goals_uniq do nothing;

-- ══ SECURITY DEFINER helpers, fully-qualified, SET search_path = '' (18) ══
create or replace function public.app_current_agent_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.agents where auth_user_id = auth.uid() and coalesce(active,true) limit 1; $$;

create or replace function public.app_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.agents where auth_user_id=auth.uid() and role='admin' and coalesce(active,true)); $$;

create or replace function public.app_is_secretary()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.agents where auth_user_id=auth.uid() and role='secretary' and coalesce(active,true)); $$;

create or replace function public.app_is_agent()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.agents where auth_user_id=auth.uid() and role='agent' and coalesce(active,true)); $$;

create or replace function public.app_can_view_agent(target uuid, res text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when public.app_is_admin() then true
    when target is not null and target = public.app_current_agent_id() then true
    when public.app_is_secretary() then exists(select 1 from public.secretary_permissions p
      where p.secretary_id = public.app_current_agent_id()
        and (p.target_agent_id is not distinct from target or p.target_agent_id is null)
        and (p.resource = res or p.resource = '*') and p.can_view)
    else false end; $$;

create or replace function public.app_can_create_for(target uuid, res text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when public.app_is_admin() then true
    when target is not null and target = public.app_current_agent_id() then true
    when public.app_is_secretary() then exists(select 1 from public.secretary_permissions p
      where p.secretary_id = public.app_current_agent_id()
        and (p.target_agent_id is not distinct from target or p.target_agent_id is null)
        and (p.resource = res or p.resource = '*') and p.can_create)
    else false end; $$;

create or replace function public.app_can_edit_resource(target uuid, res text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when public.app_is_admin() then true
    when target is not null and target = public.app_current_agent_id() then true
    when public.app_is_secretary() then exists(select 1 from public.secretary_permissions p
      where p.secretary_id = public.app_current_agent_id()
        and (p.target_agent_id is not distinct from target or p.target_agent_id is null)
        and (p.resource = res or p.resource = '*') and p.can_edit)
    else false end; $$;

create or replace function public.app_can_assign(target uuid, res text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when public.app_is_admin() then true
    when public.app_is_secretary() then exists(select 1 from public.secretary_permissions p
      where p.secretary_id = public.app_current_agent_id()
        and (p.target_agent_id is not distinct from target or p.target_agent_id is null)
        and (p.resource = res or p.resource = '*') and p.can_assign)
    else false end; $$;

create or replace function public.app_can_complete(target uuid, res text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when public.app_is_admin() then true
    when target is not null and target = public.app_current_agent_id() then true
    when public.app_is_secretary() then exists(select 1 from public.secretary_permissions p
      where p.secretary_id = public.app_current_agent_id()
        and (p.target_agent_id is not distinct from target or p.target_agent_id is null)
        and (p.resource = res or p.resource = '*') and p.can_complete)
    else false end; $$;

create or replace function public.app_can_delete(target uuid, res text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when public.app_is_admin() then true
    when public.app_is_secretary() then exists(select 1 from public.secretary_permissions p
      where p.secretary_id = public.app_current_agent_id()
        and (p.target_agent_id is not distinct from target or p.target_agent_id is null)
        and (p.resource = res or p.resource = '*') and p.can_delete)
    else false end; $$;

create or replace function public.app_can_access_unassigned(res text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when public.app_is_admin() then true
    when public.app_is_secretary() then exists(select 1 from public.secretary_permissions p
      where p.secretary_id = public.app_current_agent_id()
        and (p.resource = res or p.resource = '*') and p.can_access_unassigned)
    else false end; $$;

create or replace function public.app_can_view_financials(target uuid, mode text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when public.app_is_admin() then true
    when public.app_is_agent() then (mode = 'self')
    when public.app_is_secretary() then exists(select 1 from public.secretary_permissions p
      where p.secretary_id = public.app_current_agent_id() and p.can_view_financials
        and (mode <> 'team' or p.team_wide)
        and (p.target_agent_id is not distinct from target or p.target_agent_id is null))
    else false end; $$;

create or replace function public.app_can_view_team(res text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when public.app_is_admin() then true
    when public.app_is_secretary() then exists(select 1 from public.secretary_permissions p
      where p.secretary_id = public.app_current_agent_id()
        and p.team_wide and p.can_view and (p.resource = res or p.resource = '*'))
    else false end; $$;

-- RLS for the two new tables (after helpers exist)
drop policy if exists secretary_permissions_admin on public.secretary_permissions;
create policy secretary_permissions_admin on public.secretary_permissions
  for all to authenticated using (public.app_is_admin()) with check (public.app_is_admin());
drop policy if exists secretary_permissions_selfread on public.secretary_permissions;
create policy secretary_permissions_selfread on public.secretary_permissions
  for select to authenticated using (secretary_id = public.app_current_agent_id());

drop policy if exists team_goals_read on public.team_goals;
create policy team_goals_read on public.team_goals for select to authenticated using (true);
drop policy if exists team_goals_admin on public.team_goals;
create policy team_goals_admin on public.team_goals for all to authenticated
  using (public.app_is_admin()) with check (public.app_is_admin());

-- ── 5. Canonical view: security_invoker, exclusions on ALL statuses, normalized (1,9,10) ──
create or replace view public.v_deals_canonical with (security_invoker = true) as
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
    lower(trim(coalesce(d.side,''))) as side_norm
  from public.deals d;
revoke all on public.v_deals_canonical from public;
grant select on public.v_deals_canonical to authenticated;

-- ── 6/9/11/12. Secure aggregate RPC ──
create or replace function public.app_dashboard_summary(mode text, target uuid, from_date date, to_date date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_agent uuid := public.app_current_agent_id();
  eff uuid; team boolean := false; agent_restricted boolean := false; fin boolean := false;
  today date := (now() at time zone 'America/New_York')::date;
  yr int := extract(year from from_date)::int;
  out jsonb; team_target numeric; team_closed int;
begin
  if mode is null or mode not in ('self','agent','team') then return jsonb_build_object('error','bad_mode'); end if;
  if from_date is null or to_date is null or from_date >= to_date then return jsonb_build_object('error','bad_date_range'); end if;

  if mode='self' then
    eff := v_agent;
    if eff is null then return jsonb_build_object('error','no_agent_link'); end if;
    fin := public.app_can_view_financials(eff,'self');
  elsif mode='agent' then
    if target is null then return jsonb_build_object('error','target_required'); end if;
    if not public.app_can_view_agent(target,'deals') then return jsonb_build_object('error','forbidden'); end if;
    eff := target; fin := public.app_can_view_financials(target,'agent');
  else
    if public.app_is_admin() then team := true; fin := true;
    elsif public.app_is_secretary() and public.app_can_view_team('deals') then
      team := true; fin := public.app_can_view_financials(null,'team');
    elsif public.app_is_agent() then team := true; agent_restricted := true; fin := false;
    else return jsonb_build_object('error','forbidden'); end if;
  end if;

  select target into team_target from public.team_goals where year=yr and goal_type='closed_deals';
  select count(*) into team_closed from public.v_deals_canonical
    where is_closed_official and close_date >= from_date and close_date < to_date;

  if agent_restricted then
    return jsonb_build_object('scope','team','restricted',true,'from',from_date,'to',to_date,
      'closed_deals',team_closed,'team_goal_target',team_target,
      'team_goal_progress_pct', case when coalesce(team_target,0)>0 then round(team_closed::numeric/team_target*100,1) else null end);
  end if;

  select jsonb_build_object(
    'closed_deals', count(*) filter (where c.is_closed_official and c.close_date>=from_date and c.close_date<to_date),
    'buyer_side_closed', count(*) filter (where c.is_closed_official and c.side_norm='buyer' and c.close_date>=from_date and c.close_date<to_date),
    'seller_side_closed', count(*) filter (where c.is_closed_official and c.side_norm='seller' and c.close_date>=from_date and c.close_date<to_date),
    'accepted_offers', count(*) filter (where c.is_accepted_offer and c.ao_date>=from_date and c.ao_date<to_date),
    'under_contract_period', count(*) filter (where c.is_under_contract and c.contract_date>=from_date and c.contract_date<to_date),
    'active_deals', count(*) filter (where c.is_active_pipeline),
    'under_contract_now', count(*) filter (where c.is_under_contract),
    'closed_missing_close_date', count(*) filter (where lower(trim(c.stage))='closed'
        and lower(trim(coalesce(c.deal_status,'')))='closed' and c.close_date is null
        and c.is_duplicate=false and c.is_test=false)
  ) into out
  from public.v_deals_canonical c where (team or c.agent_id = eff);

  if fin then
    out := out || (select jsonb_build_object(
        'closed_gci', coalesce(sum(gci) filter (where is_closed_official and close_date>=from_date and close_date<to_date),0),
        'closed_production', coalesce(sum(production) filter (where is_closed_official and close_date>=from_date and close_date<to_date),0),
        'pipeline_gci', coalesce(sum(gci) filter (where is_active_pipeline),0))
      from public.v_deals_canonical where (team or agent_id = eff));
  end if;

  out := out || jsonb_build_object('active_listings', (select count(*) from public.listings l
    where (team or l.agent_id = eff) and lower(trim(coalesce(l.status,'')))='active'));

  out := out || (select jsonb_build_object(
      'open_tasks', count(*) filter (where lower(trim(coalesce(status,''))) not in ('done','completed','cancelled','canceled')),
      'overdue_tasks', count(*) filter (where lower(trim(coalesce(status,''))) not in ('done','completed','cancelled','canceled')
          and due_date is not null and due_date < today))
    from public.tasks where (team or agent_id = eff));

  out := out || jsonb_build_object('upcoming_appointments', (select count(*) from public.calendar_events e
    where (team or e.agent_id = eff) and e.start_date >= greatest(today, from_date) and e.start_date < to_date));

  out := out || jsonb_build_object('team_goal_target', team_target,
    'team_goal_progress_pct', case when coalesce(team_target,0)>0 then round(team_closed::numeric/team_target*100,1) else null end);

  if mode in ('self','agent') then out := out || public.app_agent_goal(eff, yr); end if;

  return out || jsonb_build_object('scope',mode,'from',from_date,'to',to_date,'restricted',false);
end; $$;

-- ── 7. Agent goal reader — financial gated ──
create or replace function public.app_agent_goal(target uuid, yr int)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare g record; fin boolean; out jsonb;
begin
  if not public.app_can_view_agent(target,'deals') then return jsonb_build_object('error','forbidden'); end if;
  fin := public.app_can_view_financials(target, case when target = public.app_current_agent_id() then 'self' else 'agent' end);
  select * into g from public.agent_goals where agent_id=target and year=yr;
  if not found then return jsonb_build_object('agent_goal_missing', true); end if;
  out := jsonb_build_object('agent_goal_deals', g.deals, 'agent_goal_leads', g.leads);
  if fin then out := out || jsonb_build_object('agent_goal_gci', g.gci, 'agent_goal_production', g.production); end if;
  return out;
end; $$;

create or replace function public.app_team_goal(yr int)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('year',year,'goal_type',goal_type,'target',target)
    from public.team_goals where year=yr and goal_type='closed_deals'), jsonb_build_object('missing',true)); $$;

create or replace function public.app_data_quality()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not public.app_is_admin() then jsonb_build_object('error','forbidden') else
    jsonb_build_object(
      'closed_missing_close_date',(select count(*) from public.deals where lower(trim(stage))='closed'
        and lower(trim(coalesce(deal_status,'')))='closed' and close_date is null and is_duplicate=false and is_test=false),
      'deals_missing_agent',(select count(*) from public.deals where agent_id is null),
      'suspected_duplicates',(select count(*) from public.deals where lower(trim(stage))='closed' and lower(trim(coalesce(deal_status,'')))=''),
      'active_agents_missing_goal',(select count(*) from public.agents a where coalesce(a.active,true) and a.role='agent'
        and not exists(select 1 from public.agent_goals g where g.agent_id=a.id and g.year=2026))) end; $$;

-- ── 9. Indexes ──
create index if not exists idx_deals_close_date on public.deals(close_date) where close_date is not null;
create index if not exists idx_deals_report on public.deals(agent_id, stage, deal_status, close_date);
create index if not exists idx_tasks_overdue on public.tasks(agent_id, status, due_date);
create index if not exists idx_cal_agent_start on public.calendar_events(agent_id, start_date);

-- ── 2/18. REVOKE FROM PUBLIC + anon, GRANT execute to authenticated only ──
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.app_current_agent_id()','public.app_is_admin()','public.app_is_secretary()','public.app_is_agent()',
    'public.app_can_view_agent(uuid,text)','public.app_can_create_for(uuid,text)','public.app_can_edit_resource(uuid,text)',
    'public.app_can_assign(uuid,text)','public.app_can_complete(uuid,text)','public.app_can_delete(uuid,text)',
    'public.app_can_access_unassigned(text)','public.app_can_view_financials(uuid,text)','public.app_can_view_team(text)',
    'public.app_dashboard_summary(text,uuid,date,date)','public.app_agent_goal(uuid,int)',
    'public.app_team_goal(int)','public.app_data_quality()'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

commit;
select 'MIGRATION A (revised v2) applied' as status;
