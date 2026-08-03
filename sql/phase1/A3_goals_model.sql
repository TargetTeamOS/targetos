-- ============================================================================
-- A3_goals_model.sql  —  Flexible goal model (Decision 2)
-- ----------------------------------------------------------------------------
-- Extends public.team_goals to support monthly / yearly / custom-range goals
-- across bases: accepted_offers, closed_units, production_volume, gci; and
-- team OR individual (agent) scope, with title/message/image/visibility/active.
--
-- BACKWARD COMPATIBLE — proven safe for existing behavior:
--   * The legacy row (year=2026, goal_type='closed_deals', target=300) is NOT
--     touched. All new columns are added nullable / with defaults.
--   * Legacy readers app_team_goal(int) and app_dashboard_summary(...) filter on
--     goal_type='closed_deals'. New rows leave goal_type NULL and use goal_basis,
--     so those readers can never pick up a new row.
--   * The old UNIQUE(year, goal_type) is replaced with a PARTIAL unique index
--     that still guarantees one legacy row per (year, goal_type), preserving the
--     scalar-subquery reader in app_team_goal(). New rows are exempt.
--
-- ACTUALS ARE NEVER STORED. Goal rows hold only the target + metadata. The
-- actual is always computed live from public.v_deals_canonical (authoritative),
-- so it cannot be manually edited.
--
-- Depends on: A2_reporting_foundation (team_goals, v_deals_canonical,
--             app_is_admin, app_current_agent_id).  Idempotency-guarded.
-- Rollback:   A3_rollback.sql   Verify: bottom of this file (SELECTs).
-- ============================================================================
begin;

do $$
begin
  if to_regclass('public.team_goals') is null then
    raise exception 'A2 not applied: public.team_goals missing — apply A2 first.';
  end if;
  if exists(select 1 from public._app_migrations where name='A3_goals_model' and status='complete') then
    raise exception 'A3_goals_model already applied.';
  end if;
end $$;

insert into public._app_migrations(name,status,applied_at,rolled_back_at)
values ('A3_goals_model','in_progress',now(),null)
on conflict (name) do update set status='in_progress', applied_at=now(), rolled_back_at=null;

-- ── 1. Relax legacy NOT NULLs so new rows can use the flexible fields ────────
--    (existing rows already have values; this only permits NULL going forward)
alter table public.team_goals alter column year      drop not null;
alter table public.team_goals alter column goal_type drop not null;

-- ── 2. New columns (all nullable or defaulted → no rewrite of existing rows) ─
alter table public.team_goals
  add column if not exists title       text,
  add column if not exists goal_basis  text,
  add column if not exists period      text,
  add column if not exists start_date  date,
  add column if not exists end_date    date,
  add column if not exists scope       text        not null default 'team',
  add column if not exists agent_id    uuid        references public.agents(id) on delete cascade,
  add column if not exists message     text,
  add column if not exists image_url   text,
  add column if not exists visible     boolean     not null default true,
  add column if not exists active      boolean     not null default true,
  add column if not exists created_at  timestamptz not null default now();

-- ── 3. Allowlist / coherence checks (only bind NEW flexible rows) ────────────
--    Legacy rows have goal_basis IS NULL → excluded from every check below.
alter table public.team_goals
  add constraint tg_basis_wl check (
    goal_basis is null
    or goal_basis in ('accepted_offers','closed_units','production_volume','gci')),
  add constraint tg_period_wl check (
    period is null or period in ('monthly','yearly','custom')),
  add constraint tg_scope_wl check (scope in ('team','individual')),
  add constraint tg_individual_agent check (
    scope <> 'individual' or agent_id is not null),
  add constraint tg_flex_dates check (
    goal_basis is null
    or (start_date is not null and end_date is not null and start_date <= end_date)),
  add constraint tg_flex_target check (goal_basis is null or target > 0);

-- ── 4. Replace the blanket unique with a legacy-only partial unique ──────────
--    Legacy rows are identified by goal_basis IS NULL (the flexible model always
--    sets goal_basis). This preserves "one closed_deals row per year".
alter table public.team_goals drop constraint if exists team_goals_uniq;
create unique index if not exists team_goals_legacy_uniq
  on public.team_goals (year, goal_type)
  where goal_basis is null;

-- helpful index for dashboard reads of active flexible goals
create index if not exists team_goals_flex_idx
  on public.team_goals (active, visible, scope, end_date)
  where goal_basis is not null;

-- RLS stays enabled; no direct table grants (reads/writes go through definer RPCs)
-- (team_goals already had: revoke all from public, anon, authenticated)

-- ── 5. Internal: compute the live actual for one goal from the canonical view ─
create or replace function public._goal_actual(
    p_basis text, p_from date, p_to date, p_scope text, p_agent uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(
    case p_basis
      when 'accepted_offers' then (
        select count(*)::numeric from public.v_deals_canonical c
        where c.is_accepted_offer and c.ao_date >= p_from and c.ao_date < p_to
          and (p_scope = 'team' or c.agent_id = p_agent))
      when 'closed_units' then (
        select count(*)::numeric from public.v_deals_canonical c
        where c.is_closed_official and c.close_date >= p_from and c.close_date < p_to
          and (p_scope = 'team' or c.agent_id = p_agent))
      when 'production_volume' then (
        select sum(c.production)::numeric from public.v_deals_canonical c
        where c.is_closed_official and c.close_date >= p_from and c.close_date < p_to
          and (p_scope = 'team' or c.agent_id = p_agent))
      when 'gci' then (
        select sum(c.gci)::numeric from public.v_deals_canonical c
        where c.is_closed_official and c.close_date >= p_from and c.close_date < p_to
          and (p_scope = 'team' or c.agent_id = p_agent))
    end, 0);
$$;

-- ── 6. Admin: list ALL flexible goals (for the builder) ─────────────────────
create or replace function public.app_goals_list()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.app_is_admin() then return jsonb_build_object('error','forbidden'); end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',id,'title',title,'goal_basis',goal_basis,'period',period,'target',target,
      'start_date',start_date,'end_date',end_date,'scope',scope,'agent_id',agent_id,
      'message',message,'image_url',image_url,'visible',visible,'active',active)
      order by end_date desc nulls last, created_at desc)
    from public.team_goals where goal_basis is not null), '[]'::jsonb);
end $$;

-- ── 7. Dashboard read: active+visible goals WITH live-computed progress ──────
--     Non-admins get team goals + their own individual goals only.
create or replace function public.app_goals_dashboard()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.app_current_agent_id(); admin boolean := public.app_is_admin();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',g.id,'title',g.title,'goal_basis',g.goal_basis,'period',g.period,
      'target',g.target,'start_date',g.start_date,'end_date',g.end_date,
      'scope',g.scope,'agent_id',g.agent_id,'message',g.message,'image_url',g.image_url,
      'actual', public._goal_actual(g.goal_basis, g.start_date, (g.end_date + 1), g.scope, g.agent_id))
      order by g.end_date asc)
    from public.team_goals g
    where g.goal_basis is not null and g.active and g.visible
      and (admin or g.scope='team' or (g.scope='individual' and g.agent_id = me))
  ), '[]'::jsonb);
end $$;

-- ── 8. Admin: create/update one goal (validated, no arbitrary fields) ────────
create or replace function public.app_goal_upsert(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare gid uuid;
begin
  if not public.app_is_admin() then return jsonb_build_object('error','forbidden'); end if;
  if not ((p->>'goal_basis') in ('accepted_offers','closed_units','production_volume','gci'))
    then raise exception 'bad goal_basis'; end if;
  if not ((p->>'period') in ('monthly','yearly','custom')) then raise exception 'bad period'; end if;
  if coalesce(p->>'scope','team') not in ('team','individual') then raise exception 'bad scope'; end if;

  insert into public.team_goals
    (id,title,goal_basis,period,target,start_date,end_date,scope,agent_id,message,image_url,visible,active,updated_at)
  values (
    coalesce(nullif(p->>'id','')::uuid, gen_random_uuid()),
    nullif(p->>'title',''), p->>'goal_basis', p->>'period', (p->>'target')::numeric,
    (p->>'start_date')::date, (p->>'end_date')::date, coalesce(nullif(p->>'scope',''),'team'),
    nullif(p->>'agent_id','')::uuid, nullif(p->>'message',''), nullif(p->>'image_url',''),
    coalesce((p->>'visible')::boolean,true), coalesce((p->>'active')::boolean,true), now())
  on conflict (id) do update set
    title=excluded.title, goal_basis=excluded.goal_basis, period=excluded.period,
    target=excluded.target, start_date=excluded.start_date, end_date=excluded.end_date,
    scope=excluded.scope, agent_id=excluded.agent_id, message=excluded.message,
    image_url=excluded.image_url, visible=excluded.visible, active=excluded.active, updated_at=now()
  returning id into gid;
  return jsonb_build_object('ok',true,'id',gid);
end $$;

-- ── 9. Admin: delete one flexible goal (never a legacy row) ──────────────────
create or replace function public.app_goal_delete(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_is_admin() then return jsonb_build_object('error','forbidden'); end if;
  delete from public.team_goals where id = p_id and goal_basis is not null;
  return jsonb_build_object('ok', found);
end $$;

-- ── 10. Least privilege: revoke all, grant EXECUTE on the 4 API fns only ─────
do $$
declare fn text;
begin
  foreach fn in array array[
    'public._goal_actual(text,date,date,text,uuid)',
    'public.app_goals_list()','public.app_goals_dashboard()',
    'public.app_goal_upsert(jsonb)','public.app_goal_delete(uuid)'] loop
    execute format('revoke all on function %s from public',  fn);
    execute format('revoke all on function %s from anon',    fn);
    execute format('revoke all on function %s from authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.app_goals_list()','public.app_goals_dashboard()',
    'public.app_goal_upsert(jsonb)','public.app_goal_delete(uuid)'] loop
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

update public._app_migrations set status='complete', applied_at=now(), rolled_back_at=null
  where name='A3_goals_model';
commit;

-- ── Verification (run after apply; all expect the described result) ──────────
select 'legacy row intact (expect closed_deals/300)' as check, goal_type, target
  from public.team_goals where year=2026 and goal_type='closed_deals';
select 'legacy reader still works' as check, public.app_team_goal(2026) as result;
select 'new columns present' as check,
  count(*) filter (where column_name in
    ('title','goal_basis','period','start_date','end_date','scope','agent_id','message','image_url','visible','active')) as added
  from information_schema.columns where table_schema='public' and table_name='team_goals';
