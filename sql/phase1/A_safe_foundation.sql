-- ══════════════════════════════════════════════════════════════════
-- PHASE 1 · MIGRATION A — SAFE FOUNDATION   (safe to run now)
-- Adds secure helpers, canonical definitions, exclusion columns,
-- team-goal storage, goal-reading + secure aggregate RPC, indexes.
-- Does NOT change/remove any existing permissive policy → no lockout.
-- Idempotent. Rollback in A_rollback.sql.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Exclusion columns (Part 7) — additive, non-destructive ──
alter table deals add column if not exists is_duplicate boolean not null default false;
alter table deals add column if not exists is_test      boolean not null default false;
alter table deals add column if not exists archived_at   timestamptz;
alter table deals add column if not exists deleted_at    timestamptz;
alter table deals add column if not exists duplicate_of  uuid;

-- ── 2. Secure role/identity helpers (Part 2) ──
-- SECURITY DEFINER + locked search_path; use auth.uid() internally,
-- never a client-supplied id. active-status enforced.

create or replace function app_current_agent()
returns agents language sql stable security definer set search_path = public as $$
  select * from agents where auth_user_id = auth.uid() and coalesce(active,true) limit 1;
$$;

create or replace function app_current_agent_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from agents where auth_user_id = auth.uid() and coalesce(active,true) limit 1;
$$;

create or replace function app_current_role()
returns text language sql stable security definer set search_path = public as $$
  select role from agents where auth_user_id = auth.uid() and coalesce(active,true) limit 1;
$$;

create or replace function app_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from agents where auth_user_id = auth.uid() and role='admin' and coalesce(active,true));
$$;

create or replace function app_is_secretary()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from agents where auth_user_id = auth.uid() and role='secretary' and coalesce(active,true));
$$;

create or replace function app_is_agent()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from agents where auth_user_id = auth.uid() and role='agent' and coalesce(active,true));
$$;

-- ── 3. Secretary permission model (Part 3) — normalized, DB-enforced ──
create table if not exists secretary_permissions (
  id uuid primary key default gen_random_uuid(),
  secretary_id uuid not null references agents(id) on delete cascade,
  target_agent_id uuid references agents(id) on delete cascade,  -- null = all agents
  resource text not null,                    -- 'deals','contacts',... or '*'
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
  unique (secretary_id, target_agent_id, resource)
);
alter table secretary_permissions enable row level security;
drop policy if exists secretary_permissions_admin on secretary_permissions;
create policy secretary_permissions_admin on secretary_permissions
  for all to authenticated using (app_is_admin()) with check (app_is_admin());
drop policy if exists secretary_permissions_selfread on secretary_permissions;
create policy secretary_permissions_selfread on secretary_permissions
  for select to authenticated using (secretary_id = app_current_agent_id());

-- can the current user act on target agent's records for a resource/action?
create or replace function app_can_view_agent(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when app_is_admin() then true
    when target = app_current_agent_id() then true
    when app_is_secretary() then exists(
      select 1 from secretary_permissions p
      where p.secretary_id = app_current_agent_id()
        and (p.target_agent_id = target or p.target_agent_id is null)
        and (p.resource = '*' or p.resource is not null)
        and p.can_view)
    else false end;
$$;

create or replace function app_can_edit_resource(target uuid, res text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when app_is_admin() then true
    when target = app_current_agent_id() then true
    when app_is_secretary() then exists(
      select 1 from secretary_permissions p
      where p.secretary_id = app_current_agent_id()
        and (p.target_agent_id = target or p.target_agent_id is null)
        and (p.resource = res or p.resource = '*')
        and p.can_edit)
    else false end;
$$;

create or replace function app_can_view_financials()
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when app_is_admin() then true
    when app_is_agent() then true
    when app_is_secretary() then exists(
      select 1 from secretary_permissions p
      where p.secretary_id = app_current_agent_id() and p.can_view_financials)
    else false end;
$$;

-- ── 4. Team goal storage (Part 8) — do NOT overwrite if present ──
insert into system_settings (key, value)
values ('team_goal_2026', '{"year":2026,"closed_deals":300,"timezone":"America/New_York"}'::jsonb)
on conflict (key) do nothing;

-- ── 5. Canonical closed-deal view (Part 6/7) — one source of truth ──
-- Closed = stage 'Closed' AND deal_status 'Closed', not excluded.
-- Uses close_date (NEVER ao_date). Exposes side + gci + production.
create or replace view v_deals_canonical as
  select d.*,
    (d.stage = 'Closed' and coalesce(d.deal_status,'') = 'Closed'
      and d.is_duplicate = false and d.is_test = false
      and d.archived_at is null and d.deleted_at is null) as is_closed_official,
    (d.stage in ('Under Contract') ) as is_under_contract,
    (d.stage = 'Offer Accepted') as is_accepted_offer,
    (d.stage in ('Negotiations','Offer Accepted','Under Shtar','Under Contract')) as is_active_pipeline
  from deals d;

-- ── 6. Secure aggregate RPC (Part 9) — validates scope, no raw rows ──
-- mode: 'self' | 'team' | 'agent'; target used only for 'agent'.
create or replace function app_dashboard_summary(
  mode text, target uuid, from_date date, to_date date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  eff_agent uuid;
  is_team boolean := false;
  result jsonb;
begin
  -- scope validation — the client cannot escalate here
  if mode = 'team' then
    if not app_is_admin() and not (app_is_secretary() and exists(
        select 1 from secretary_permissions where secretary_id = app_current_agent_id() and team_wide)) then
      -- agents may get team AGGREGATE only (no raw rows leave this function)
      if not app_is_agent() then return jsonb_build_object('error','forbidden'); end if;
    end if;
    is_team := true;
  elsif mode = 'agent' then
    if not app_can_view_agent(target) then return jsonb_build_object('error','forbidden'); end if;
    eff_agent := target;
  else  -- self
    eff_agent := app_current_agent_id();
    if eff_agent is null then return jsonb_build_object('error','no_agent_link'); end if;
  end if;

  select jsonb_build_object(
    'closed_deals', count(*) filter (where is_closed_official
        and close_date >= from_date and close_date < to_date),
    'closed_production', coalesce(sum(production) filter (where is_closed_official
        and close_date >= from_date and close_date < to_date),0),
    'closed_gci', coalesce(sum(gci) filter (where is_closed_official
        and close_date >= from_date and close_date < to_date),0),
    'accepted_offers', count(*) filter (where is_accepted_offer),
    'under_contract', count(*) filter (where is_under_contract),
    'active_deals', count(*) filter (where is_active_pipeline),
    'pipeline_gci', coalesce(sum(gci) filter (where is_active_pipeline),0),
    'buyer_side_closed', count(*) filter (where is_closed_official and side='buyer'
        and close_date >= from_date and close_date < to_date),
    'seller_side_closed', count(*) filter (where is_closed_official and side='seller'
        and close_date >= from_date and close_date < to_date),
    'closed_missing_close_date', count(*) filter (where stage='Closed'
        and coalesce(deal_status,'')='Closed' and close_date is null
        and is_duplicate=false and is_test=false)
  ) into result
  from v_deals_canonical
  where (is_team or agent_id = eff_agent);

  return result || jsonb_build_object('scope', mode, 'from', from_date, 'to', to_date);
end;
$$;

-- ── 7. Goal reading (Part 8) — agent_goals as source of truth ──
create or replace function app_agent_goal(target uuid, yr int)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not app_can_view_agent(target) then jsonb_build_object('error','forbidden')
    else coalesce((select jsonb_build_object('deals',deals,'gci',gci,'production',production,'leads',leads)
      from agent_goals where agent_id=target and year=yr), jsonb_build_object('missing',true)) end;
$$;

create or replace function app_team_goal(yr int)
returns jsonb language sql stable security definer set search_path = public as $$
  select value from system_settings where key = 'team_goal_' || yr::text;
$$;

-- ── 8. Data-quality function (Part 13) — admin-visible ──
create or replace function app_data_quality()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not app_is_admin() then jsonb_build_object('error','forbidden') else
    jsonb_build_object(
      'closed_missing_close_date', (select count(*) from deals where stage='Closed' and coalesce(deal_status,'')='Closed' and close_date is null and is_duplicate=false),
      'deals_missing_agent', (select count(*) from deals where agent_id is null),
      'suspected_duplicates', (select count(*) from deals where stage='Closed' and coalesce(deal_status,'')=''),
      'active_agents_missing_goal', (select count(*) from agents a where coalesce(a.active,true) and a.role='agent'
         and not exists(select 1 from agent_goals g where g.agent_id=a.id and g.year=2026))
    ) end;
$$;

-- ── 9. Indexes (Part 14) — only non-duplicate, justified ──
create index if not exists idx_deals_close_date on deals(close_date) where close_date is not null;
create index if not exists idx_deals_report on deals(agent_id, stage, deal_status, close_date);
create index if not exists idx_tasks_overdue on tasks(agent_id, status, due_date);
create index if not exists idx_cal_agent_start on calendar_events(agent_id, start_date);

-- ── 10. Lock down function execution (Part 2) — no anon escalation ──
revoke execute on function app_dashboard_summary(text,uuid,date,date) from anon;
revoke execute on function app_data_quality() from anon;
revoke execute on function app_current_role() from anon;

select 'MIGRATION A applied' as status;
