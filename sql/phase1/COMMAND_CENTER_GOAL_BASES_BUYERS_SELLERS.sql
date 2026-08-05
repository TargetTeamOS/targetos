-- ============================================================================
-- COMMAND_CENTER_GOAL_BASES_BUYERS_SELLERS.sql   (additive, rerunnable)
-- Adds two goal metrics — 'buyers' and 'sellers' — alongside the existing
-- accepted_offers / closed_units / production_volume / gci.
--   buyers  = closed units where side = buyer   (from v_deals_canonical.side_norm)
--   sellers = closed units where side = seller
-- Extends the allowlist constraint, the actual-calculation, the upsert validator,
-- and the drill-down so a buyers/sellers goal shows only its side's deals.
-- No data changed. All SECURITY DEFINER functions keep search_path=''.
-- ============================================================================
begin;

-- 1) Allowlist: replace tg_basis_wl with the 6-value version (idempotent).
alter table public.team_goals drop constraint if exists tg_basis_wl;
alter table public.team_goals add constraint tg_basis_wl check (
  goal_basis is null or goal_basis in
    ('accepted_offers','closed_units','production_volume','gci','buyers','sellers'));

-- 2) Actual calculation — add buyers/sellers (closed units by side).
create or replace function public._goal_actual(p_basis text, p_from date, p_to date, p_scope text, p_agent uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(
    case p_basis
      when 'accepted_offers' then (select count(*)::numeric from public.v_deals_canonical c
        where c.is_accepted_offer and c.ao_date >= p_from and c.ao_date < p_to and (p_scope='team' or c.agent_id=p_agent))
      when 'closed_units' then (select count(*)::numeric from public.v_deals_canonical c
        where c.is_closed_official and c.close_date >= p_from and c.close_date < p_to and (p_scope='team' or c.agent_id=p_agent))
      when 'production_volume' then (select sum(c.production)::numeric from public.v_deals_canonical c
        where c.is_closed_official and c.close_date >= p_from and c.close_date < p_to and (p_scope='team' or c.agent_id=p_agent))
      when 'gci' then (select sum(c.gci)::numeric from public.v_deals_canonical c
        where c.is_closed_official and c.close_date >= p_from and c.close_date < p_to and (p_scope='team' or c.agent_id=p_agent))
      when 'buyers' then (select count(*)::numeric from public.v_deals_canonical c
        where c.is_closed_official and c.side_norm='buyer' and c.close_date >= p_from and c.close_date < p_to and (p_scope='team' or c.agent_id=p_agent))
      when 'sellers' then (select count(*)::numeric from public.v_deals_canonical c
        where c.is_closed_official and c.side_norm='seller' and c.close_date >= p_from and c.close_date < p_to and (p_scope='team' or c.agent_id=p_agent))
    end, 0);
$$;

-- 3) Upsert validator — accept buyers/sellers.
create or replace function public.app_goal_upsert(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare gid uuid;
begin
  if not public.app_is_admin() then return jsonb_build_object('error','forbidden'); end if;
  if not ((p->>'goal_basis') in ('accepted_offers','closed_units','production_volume','gci','buyers','sellers'))
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

-- 4) Drill-down — filter to the side for buyers/sellers goals.
create or replace function public.app_goal_records(p_goal_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  g public.team_goals%rowtype;
  me    uuid    := public.app_current_agent_id();
  admin boolean := public.app_is_admin();
  frm date; tll date;
begin
  select * into g from public.team_goals where id = p_goal_id;
  if not found or g.goal_basis is null then return jsonb_build_object('error','not_found'); end if;
  if not (admin or g.scope='team' or (g.scope='individual' and g.agent_id = me)) then
    return jsonb_build_object('error','forbidden');
  end if;
  frm := g.start_date;
  tll := g.end_date + 1;
  return coalesce((
    select jsonb_agg(r.row order by r.row_date desc nulls last)
    from (
      select
        jsonb_build_object(
          'id', c.id, 'type', 'deal',
          'label', coalesce(nullif(c.addr,''), nullif(c.client_name,''), 'Deal'),
          'secondary', to_char(c.row_date, 'Mon DD, YYYY'),
          'status', c.stage,
          'amount', case when admin and g.goal_basis in ('production_volume','gci')
                         then case g.goal_basis when 'production_volume' then c.production else c.gci end
                         else null end
        ) as row,
        c.row_date
      from (
        select d.*,
          case when g.goal_basis = 'accepted_offers' then d.ao_date else d.close_date end as row_date,
          case when g.goal_basis = 'accepted_offers' then d.is_accepted_offer else d.is_closed_official end as included
        from public.v_deals_canonical d
      ) c
      where c.included
        and c.row_date >= frm and c.row_date < tll
        and (g.scope = 'team' or c.agent_id = g.agent_id)
        and (g.goal_basis not in ('buyers','sellers')
             or (g.goal_basis = 'buyers'  and c.side_norm = 'buyer')
             or (g.goal_basis = 'sellers' and c.side_norm = 'seller'))
    ) r
  ), '[]'::jsonb);
end $$;

commit;
