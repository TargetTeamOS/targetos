-- ══════════════════════════════════════════════════════════════════
-- PHASE 1 · MIGRATION A (v4) — SAFE FOUNDATION
-- One-time, collision-safe, transactional. NOT applied/verified on live DB.
-- Adds NO restrictive RLS on existing data tables → no lockout.
-- Rollback: A_rollback.sql (v4).
--
-- v4 corrections:
-- (1) app_report_scope_ok self-mode no longer auto-authorizes secretaries;
--     self+agent both route through app_can_view_agent (secretary needs a grant).
-- (2) genuinely one-time: preflight ABORTS if any migration-owned function
--     signature, view, table, policy, constraint, or index already exists.
--     Uses CREATE (not CREATE OR REPLACE / IF NOT EXISTS) so nothing is
--     silently overwritten.
-- (3) preflight verifies every column referenced later (incl. contacts.agent_id,
--     calls.agent_id, agent_goals.deals/leads/gci/production).
-- (4) migration record table _app_migrations distinguishes not-installed /
--     fully-installed / partial-or-unexpected.
-- (5) complete file: all END IF / terminators / grants / COMMIT / verification.
-- (6) pipeline GCI source = coalesce(expected_gci, gci) (expected commission on
--     in-progress deals; NOT closed GCI). A ensures expected_gci exists.
-- ══════════════════════════════════════════════════════════════════
begin;

-- ── migration record (shared meta; safe to pre-exist) (4) ──
create table if not exists public._app_migrations (
  name text primary key,
  status text not null,                 -- 'in_progress' | 'complete'
  applied_at timestamptz not null default now(),
  rolled_back_at timestamptz
);

-- ── PREFLIGHT ──
do $$
declare need_col text; tbl text; col text; fn text; pol record;
begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'Requires PostgreSQL 15+.'; end if;

  -- (4) install-state gate
  if exists(select 1 from public._app_migrations where name='phase1_A' and status='complete') then
    raise exception 'phase1_A already fully installed. Nothing to do.'; end if;
  if exists(select 1 from public._app_migrations where name='phase1_A' and status='in_progress') then
    raise exception 'phase1_A is in a partial/unexpected state. Run A_rollback.sql, then re-run.'; end if;

  -- required tables (3)
  foreach tbl in array array['agents','deals','listings','tasks','calendar_events','contacts','calls','agent_goals'] loop
    if to_regclass('public.'||tbl) is null then raise exception 'Missing table public.%', tbl; end if;
  end loop;

  -- required columns, every one referenced later (3)
  foreach need_col in array array[
    'agents:auth_user_id','agents:role','agents:active',
    'deals:agent_id','deals:stage','deals:deal_status','deals:side','deals:gci','deals:production',
    'deals:ao_date','deals:contract_date','deals:close_date',
    'listings:agent_id','listings:status',
    'tasks:agent_id','tasks:status','tasks:due_date',
    'calendar_events:agent_id','calendar_events:start_date',
    'contacts:agent_id','calls:agent_id',
    'agent_goals:agent_id','agent_goals:year','agent_goals:deals','agent_goals:leads','agent_goals:gci','agent_goals:production'] loop
    tbl := split_part(need_col,':',1); col := split_part(need_col,':',2);
    if not exists(select 1 from information_schema.columns
        where table_schema='public' and table_name=tbl and column_name=col) then
      raise exception 'Missing column %.%', tbl, col; end if;
  end loop;

  -- (2) collision-safety: migration-owned FUNCTION signatures must NOT exist
  foreach fn in array array[
    'public.app_current_agent_id()','public.app_is_admin()','public.app_is_secretary()','public.app_is_agent()',
    'public.app_can_view_agent(uuid,text)','public.app_can_create_for(uuid,text)','public.app_can_edit_resource(uuid,text)',
    'public.app_can_assign(uuid,text)','public.app_can_complete(uuid,text)','public.app_can_delete(uuid,text)',
    'public.app_can_access_unassigned(text)','public.app_can_view_financials(uuid,text,text)','public.app_can_view_team(text)',
    'public.app_report_scope_ok(text,uuid,text)','public.app_dashboard_summary(text,uuid,date,date)',
    'public.app_agent_goal(uuid,int)','public.app_team_goal(int)','public.app_data_quality(int)'] loop
    if to_regprocedure(fn) is not null then
      raise exception 'Function % already exists — DB in unexpected state. Run A_rollback.sql (or full teardown) first.', fn; end if;
  end loop;

  -- (2) migration-owned VIEW / TABLES / INDEXES must NOT exist
  if to_regclass('public.v_deals_canonical')     is not null then raise exception 'view public.v_deals_canonical already exists — run rollback/teardown first.'; end if;
  if to_regclass('public.secretary_permissions') is not null then raise exception 'table public.secretary_permissions already exists — run rollback/teardown first.'; end if;
  if to_regclass('public.team_goals')            is not null then raise exception 'table public.team_goals already exists (may hold data) — export + full teardown before reinstalling.'; end if;
  foreach tbl in array array['idx_a1_deals_close_date','idx_a1_deals_report','idx_a1_tasks_overdue','idx_a1_cal_agent_start'] loop
    if to_regclass('public.'||tbl) is not null then raise exception 'index % already exists — rename/drop before running A.', tbl; end if;
  end loop;

  -- (2) migration-owned CONSTRAINT names must NOT exist
  if exists(select 1 from pg_constraint where conname in ('secretary_permissions_uniq','team_goals_uniq')) then
    raise exception 'a migration-owned constraint name already exists — run rollback/teardown first.'; end if;

  -- (2) migration-owned POLICY names must NOT exist
  for pol in select policyname from pg_policies where schemaname='public'
      and policyname in ('secretary_permissions_admin','secretary_permissions_selfread','team_goals_read','team_goals_admin') loop
    raise exception 'policy % already exists — run rollback/teardown first.', pol.policyname; end loop;
end $$;

-- mark in_progress (rolled back automatically if any later statement fails)
insert into public._app_migrations(name,status) values ('phase1_A','in_progress');

-- ── 1. Exclusion columns + ensure expected_gci for pipeline GCI (6) ──
alter table public.deals add column if not exists is_duplicate boolean not null default false;
alter table public.deals add column if not exists is_test      boolean not null default false;
alter table public.deals add column if not exists archived_at  timestamptz;
alter table public.deals add column if not exists deleted_at   timestamptz;
alter table public.deals add column if not exists duplicate_of uuid;
alter table public.deals add column if not exists expected_gci numeric;   -- (6) pipeline source

-- ── 2. New tables (explicit privileges) ──
create table public.secretary_permissions (
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
revoke all on public.secretary_permissions from public, anon, authenticated;
grant select, insert, update, delete on public.secretary_permissions to authenticated;

create table public.team_goals (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  goal_type text not null,
  target numeric not null,
  timezone text not null default 'America/New_York',
  updated_at timestamptz not null default now(),
  constraint team_goals_uniq unique nulls not distinct (year, goal_type)
);
alter table public.team_goals enable row level security;
revoke all on public.team_goals from public, anon, authenticated;
grant select, insert, update, delete on public.team_goals to authenticated;
insert into public.team_goals (year, goal_type, target) values (2026, 'closed_deals', 300);

-- ══ SECURITY DEFINER helpers (CREATE, not replace) — fully qualified, search_path='' ══
create function public.app_current_agent_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.agents where auth_user_id = auth.uid() and coalesce(active,true) limit 1; $$;

create function public.app_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.agents where auth_user_id=auth.uid() and role='admin' and coalesce(active,true)); $$;

create function public.app_is_secretary()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.agents where auth_user_id=auth.uid() and role='secretary' and coalesce(active,true)); $$;

create function public.app_is_agent()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.agents where auth_user_id=auth.uid() and role='agent' and coalesce(active,true)); $$;

create function public.app_can_view_agent(target uuid, res text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when public.app_is_admin() then true
    when public.app_is_agent() and target is not null and target = public.app_current_agent_id() then true
    when public.app_is_secretary() then exists(select 1 from public.secretary_permissions p
      where p.secretary_id = public.app_current_agent_id()
        and (p.target_agent_id is not distinct from target or p.target_agent_id is null)
        and (p.resource = res or p.resource = '*') and p.can_view)
    else false end; $$;

create function public.app_can_create_for(target uuid, res text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when public.app_is_admin() then true
    when public.app_is_agent() and target is not null and target = public.app_current_agent_id() then true
    when public.app_is_secretary() then exists(select 1 from public.secretary_permissions p
      where p.secretary_id = public.app_current_agent_id()
        and (p.target_agent_id is not distinct from target or p.target_agent_id is null)
        and (p.resource = res or p.resource = '*') and p.can_create)
    else false end; $$;

create function public.app_can_edit_resource(target uuid, res text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when public.app_is_admin() then true
    when public.app_is_agent() and target is not null and target = public.app_current_agent_id() then true
    when public.app_is_secretary() then exists(select 1 from public.secretary_permissions p
      where p.secretary_id = public.app_current_agent_id()
        and (p.target_agent_id is not distinct from target or p.target_agent_id is null)
        and (p.resource = res or p.resource = '*') and p.can_edit)
    else false end; $$;

create function public.app_can_assign(target uuid, res text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when public.app_is_admin() then true
    when public.app_is_secretary() then exists(select 1 from public.secretary_permissions p
      where p.secretary_id = public.app_current_agent_id()
        and (p.target_agent_id is not distinct from target or p.target_agent_id is null)
        and (p.resource = res or p.resource = '*') and p.can_assign)
    else false end; $$;

create function public.app_can_complete(target uuid, res text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when public.app_is_admin() then true
    when public.app_is_agent() and target is not null and target = public.app_current_agent_id() then true
    when public.app_is_secretary() then exists(select 1 from public.secretary_permissions p
      where p.secretary_id = public.app_current_agent_id()
        and (p.target_agent_id is not distinct from target or p.target_agent_id is null)
        and (p.resource = res or p.resource = '*') and p.can_complete)
    else false end; $$;

create function public.app_can_delete(target uuid, res text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when public.app_is_admin() then true
    when public.app_is_secretary() then exists(select 1 from public.secretary_permissions p
      where p.secretary_id = public.app_current_agent_id()
        and (p.target_agent_id is not distinct from target or p.target_agent_id is null)
        and (p.resource = res or p.resource = '*') and p.can_delete)
    else false end; $$;

create function public.app_can_access_unassigned(res text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when public.app_is_admin() then true
    when public.app_is_secretary() then exists(select 1 from public.secretary_permissions p
      where p.secretary_id = public.app_current_agent_id()
        and (p.resource = res or p.resource = '*') and p.can_access_unassigned)
    else false end; $$;

create function public.app_can_view_financials(target uuid, res text, mode text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when public.app_is_admin() then true
    when public.app_is_agent() then (mode = 'self')
    when public.app_is_secretary() then exists(select 1 from public.secretary_permissions p
      where p.secretary_id = public.app_current_agent_id()
        and p.can_view and p.can_view_financials
        and (mode <> 'team' or p.team_wide)
        and (p.resource = res or p.resource = '*')
        and (p.target_agent_id is not distinct from target or p.target_agent_id is null))
    else false end; $$;

create function public.app_can_view_team(res text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when public.app_is_admin() then true
    when public.app_is_secretary() then exists(select 1 from public.secretary_permissions p
      where p.secretary_id = public.app_current_agent_id()
        and p.team_wide and p.can_view and (p.resource = res or p.resource = '*'))
    else false end; $$;

-- (1) self+agent both require app_can_view_agent (secretary needs a grant in self mode too)
create function public.app_report_scope_ok(mode text, target uuid, res text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when mode in ('self','agent') then public.app_can_view_agent(target, res)
    when mode = 'team' then (public.app_is_admin() or (public.app_is_secretary() and public.app_can_view_team(res)))
    else false end; $$;

-- ── policies for new tables ──
create policy secretary_permissions_admin on public.secretary_permissions
  for all to authenticated using (public.app_is_admin()) with check (public.app_is_admin());
create policy secretary_permissions_selfread on public.secretary_permissions
  for select to authenticated using (secretary_id = public.app_current_agent_id());
create policy team_goals_read on public.team_goals for select to authenticated using (true);
create policy team_goals_admin on public.team_goals for all to authenticated
  using (public.app_is_admin()) with check (public.app_is_admin());

-- ── 5. Canonical view INTERNAL (security_invoker + no grants) ──
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
    coalesce(d.expected_gci, d.gci) as pipeline_gci_val    -- (6)
  from public.deals d;
revoke all on public.v_deals_canonical from public, anon, authenticated;

-- ── Secure aggregate RPC ──
create function public.app_dashboard_summary(mode text, target uuid, from_date date, to_date date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_agent uuid := public.app_current_agent_id();
  eff uuid; team boolean := false; agent_restricted boolean := false;
  can_deals boolean; can_listings boolean; can_tasks boolean; can_appts boolean; can_goals boolean; fin boolean;
  today date := (now() at time zone 'America/New_York')::date;
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
  elsif mode='agent' then
    if target is null then return jsonb_build_object('error','target_required'); end if;
    eff := target;
  else
    if public.app_is_admin() then team := true;
    elsif public.app_is_secretary() then team := true;
    elsif public.app_is_agent() then team := true; agent_restricted := true;
    else return jsonb_build_object('error','forbidden'); end if;
  end if;

  can_deals    := (not agent_restricted) and public.app_report_scope_ok(mode, eff, 'deals');
  can_listings := (not agent_restricted) and public.app_report_scope_ok(mode, eff, 'listings');
  can_tasks    := (not agent_restricted) and public.app_report_scope_ok(mode, eff, 'tasks');
  can_appts    := (not agent_restricted) and public.app_report_scope_ok(mode, eff, 'calendar_events');
  can_goals    := (not agent_restricted) and public.app_report_scope_ok(mode, eff, 'goals');
  fin          := (not agent_restricted) and public.app_can_view_financials(eff, 'deals', mode);

  if mode='agent' and not (can_deals or can_listings or can_tasks or can_appts or can_goals) then
    return jsonb_build_object('error','forbidden'); end if;
  if mode='team' and public.app_is_secretary() and not agent_restricted
     and not (can_deals or can_listings or can_tasks or can_appts or can_goals) then
    return jsonb_build_object('error','forbidden'); end if;

  select target into team_target from public.team_goals where year=yr and goal_type='closed_deals';
  select count(*) into team_annual_closed from public.v_deals_canonical
    where is_closed_official and close_date >= annual_from and close_date < annual_to;
  select count(*) into filtered_closed from public.v_deals_canonical
    where is_closed_official and close_date >= from_date and close_date < to_date;

  out := out || jsonb_build_object(
    'filtered_closed_deals', filtered_closed,
    'team_goal_closed_deals', team_annual_closed,
    'team_goal_target', team_target,
    'team_goal_remaining', case when team_target is not null then greatest(team_target - team_annual_closed,0) else null end,
    'team_goal_progress_pct', case when coalesce(team_target,0)>0 then round(team_annual_closed::numeric/team_target*100,1) else null end);

  if agent_restricted then
    return out || jsonb_build_object('scope','team','restricted',true,'from',from_date,'to',to_date);
  end if;

  if can_deals then
    out := out || (select jsonb_build_object(
      'closed_deals', count(*) filter (where c.is_closed_official and c.close_date>=from_date and c.close_date<to_date),
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
    if fin then
      out := out || (select jsonb_build_object(
          'closed_gci', coalesce(sum(gci) filter (where is_closed_official and close_date>=from_date and close_date<to_date),0),
          'closed_production', coalesce(sum(production) filter (where is_closed_official and close_date>=from_date and close_date<to_date),0),
          'pipeline_gci', coalesce(sum(pipeline_gci_val) filter (where is_active_pipeline),0))
        from public.v_deals_canonical where (team or agent_id = eff));
    end if;
  end if;

  if can_listings then
    out := out || jsonb_build_object('active_listings', (select count(*) from public.listings l
      where (team or l.agent_id = eff) and lower(trim(coalesce(l.status,'')))='active'));
  end if;

  if can_tasks then
    out := out || (select jsonb_build_object(
        'open_tasks', count(*) filter (where lower(trim(coalesce(status,''))) not in ('done','completed','cancelled','canceled')),
        'overdue_tasks', count(*) filter (where lower(trim(coalesce(status,''))) not in ('done','completed','cancelled','canceled')
            and due_date is not null and due_date < today))
      from public.tasks where (team or agent_id = eff));
  end if;

  if can_appts then
    out := out || jsonb_build_object('upcoming_appointments', (select count(*) from public.calendar_events e
      where (team or e.agent_id = eff) and e.start_date >= greatest(today, from_date) and e.start_date < to_date));
  end if;

  if can_goals and mode in ('self','agent') then
    out := out || public.app_agent_goal(eff, yr);
  end if;

  return out || jsonb_build_object('scope',mode,'from',from_date,'to',to_date,'restricted',false);
end; $$;

-- ── Agent goal reader: deals-goal, leads-goal, financials each separately gated ──
create function public.app_agent_goal(target uuid, yr int)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare g record; out jsonb := '{}'::jsonb; m text;
begin
  m := case when public.app_is_agent() and target = public.app_current_agent_id() then 'self' else 'agent' end;
  if not (public.app_can_view_agent(target,'goals') or public.app_can_view_agent(target,'deals')
          or public.app_can_view_agent(target,'leads')) then
    return jsonb_build_object('error','forbidden'); end if;
  select * into g from public.agent_goals where agent_id=target and year=yr;
  if not found then return jsonb_build_object('agent_goal_missing', true); end if;
  if public.app_can_view_agent(target,'deals') or public.app_can_view_agent(target,'goals') then
    out := out || jsonb_build_object('agent_goal_deals', g.deals); end if;
  if public.app_can_view_agent(target,'leads') or public.app_can_view_agent(target,'goals') then
    out := out || jsonb_build_object('agent_goal_leads', g.leads); end if;
  if public.app_can_view_financials(target,'deals',m) then
    out := out || jsonb_build_object('agent_goal_gci', g.gci, 'agent_goal_production', g.production); end if;
  return out;
end; $$;

create function public.app_team_goal(yr int)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('year',year,'goal_type',goal_type,'target',target)
    from public.team_goals where year=yr and goal_type='closed_deals'), jsonb_build_object('missing',true)); $$;

create function public.app_data_quality(yr int default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not public.app_is_admin() then jsonb_build_object('error','forbidden') else
    jsonb_build_object(
      'year', coalesce(yr, extract(year from (now() at time zone 'America/New_York'))::int),
      'closed_missing_close_date', (select count(*) from public.deals
        where lower(trim(stage))='closed' and lower(trim(coalesce(deal_status,'')))='closed'
          and close_date is null and is_duplicate=false and is_test=false and archived_at is null and deleted_at is null),
      'suspected_duplicates', (select count(*) from public.deals
        where lower(trim(stage))='closed' and lower(trim(coalesce(deal_status,'')))=''
          and is_duplicate=false and is_test=false and archived_at is null and deleted_at is null),
      'deals_missing_agent', (select count(*) from public.deals where agent_id is null and is_duplicate=false and deleted_at is null),
      'listings_missing_agent', (select count(*) from public.listings where agent_id is null),
      'contacts_missing_agent', (select count(*) from public.contacts where agent_id is null),
      'calls_missing_agent', (select count(*) from public.calls where agent_id is null),
      'active_agents_missing_goal', (select count(*) from public.agents a where coalesce(a.active,true) and a.role='agent'
        and not exists(select 1 from public.agent_goals g where g.agent_id=a.id
          and g.year = coalesce(yr, extract(year from (now() at time zone 'America/New_York'))::int))))
    end; $$;

-- ── Indexes (migration-owned names) ──
create index idx_a1_deals_close_date on public.deals(close_date) where close_date is not null;
create index idx_a1_deals_report on public.deals(agent_id, stage, deal_status, close_date);
create index idx_a1_tasks_overdue on public.tasks(agent_id, status, due_date);
create index idx_a1_cal_agent_start on public.calendar_events(agent_id, start_date);

-- ── Execution privileges: REVOKE FROM PUBLIC+anon, GRANT authenticated only ──
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.app_current_agent_id()','public.app_is_admin()','public.app_is_secretary()','public.app_is_agent()',
    'public.app_can_view_agent(uuid,text)','public.app_can_create_for(uuid,text)','public.app_can_edit_resource(uuid,text)',
    'public.app_can_assign(uuid,text)','public.app_can_complete(uuid,text)','public.app_can_delete(uuid,text)',
    'public.app_can_access_unassigned(text)','public.app_can_view_financials(uuid,text,text)','public.app_can_view_team(text)',
    'public.app_report_scope_ok(text,uuid,text)','public.app_dashboard_summary(text,uuid,date,date)',
    'public.app_agent_goal(uuid,int)','public.app_team_goal(int)','public.app_data_quality(int)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

-- mark complete (still inside the transaction)
update public._app_migrations set status='complete', applied_at=now() where name='phase1_A';

commit;

-- ── VERIFICATION (read-only; runs after commit) ──
select 'phase1_A install state' as check, status from public._app_migrations where name='phase1_A';
select 'functions created (expect 18)' as check, count(*) as n from pg_proc where proname like 'app\_%';
select 'canonical view present' as check, count(*) as n from pg_views where viewname='v_deals_canonical';
select 'team_goals rows' as check, count(*) as n from public.team_goals;
select 'idx_a1_ indexes (expect 4)' as check, count(*) as n from pg_indexes where schemaname='public' and indexname like 'idx\_a1\_%';
