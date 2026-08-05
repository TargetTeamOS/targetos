-- ============================================================================
-- COMMAND_CENTER_FIX_GOAL_SLOTS.sql   (additive, rerunnable)
-- Makes "Monthly team goal" / "Yearly team goal" behave as a single slot:
--   * When a NEW team goal is saved (no id), any existing ACTIVE team goal of the
--     same period is retired (active=false) so the newest metric/target shows.
--   * One-time cleanup: for each period, keep only the newest active team goal.
-- Non-destructive (active=false; rows are kept). Includes the buyers/sellers
-- allowlist so this is the definitive app_goal_upsert. search_path='' preserved.
-- Apply AFTER COMMAND_CENTER_REPAIR_FOUNDATION and the buyers/sellers migration.
-- ============================================================================
begin;

create or replace function public.app_goal_upsert(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  gid uuid;
  is_new boolean := (nullif(p->>'id','') is null);
  p_scope text := coalesce(nullif(p->>'scope',''),'team');
begin
  if not public.app_is_admin() then return jsonb_build_object('error','forbidden'); end if;
  if not ((p->>'goal_basis') in ('accepted_offers','closed_units','production_volume','gci','buyers','sellers'))
    then raise exception 'bad goal_basis'; end if;
  if not ((p->>'period') in ('monthly','yearly','custom')) then raise exception 'bad period'; end if;
  if p_scope not in ('team','individual') then raise exception 'bad scope'; end if;

  -- A new TEAM goal replaces the existing active team goal for that period (single slot).
  if is_new and p_scope = 'team' then
    update public.team_goals set active = false, updated_at = now()
    where scope = 'team' and goal_basis is not null and active
      and period = (p->>'period');
  end if;

  insert into public.team_goals
    (id,title,goal_basis,period,target,start_date,end_date,scope,agent_id,message,image_url,visible,active,updated_at)
  values (
    coalesce(nullif(p->>'id','')::uuid, gen_random_uuid()),
    nullif(p->>'title',''), p->>'goal_basis', p->>'period', (p->>'target')::numeric,
    (p->>'start_date')::date, (p->>'end_date')::date, p_scope,
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

-- One-time cleanup: retire older duplicate active team goals, keeping the newest per period.
update public.team_goals t set active = false, updated_at = now()
where t.scope = 'team' and t.goal_basis is not null and t.active
  and exists (
    select 1 from public.team_goals n
    where n.scope = 'team' and n.goal_basis is not null and n.active
      and n.period = t.period and n.created_at > t.created_at
  );

commit;
