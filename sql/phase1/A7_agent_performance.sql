-- ============================================================================
-- A7_agent_performance.sql — team performance metrics + drill records
-- ----------------------------------------------------------------------------
-- app_agent_performance(from,to): one row per active agent with SHARED
-- production metrics (accepted offers, closed units, production volume, buyer /
-- seller sides) computed over v_deals_canonical for the window. GCI is included
-- ONLY for admins; for everyone else the key is null so the UI can't surface it.
-- Access mirrors the team board: admins and agents may view; others (e.g.
-- secretary) get forbidden. Ranking is derived client-side from these numbers.
--
-- app_agent_records(agent, basis, from, to): the exact deals behind one agent's
-- metric, for the drill-down. Same access rule; per-deal financials admin-only.
--
-- Purely additive, idempotency-guarded. Depends on A2 (v_deals_canonical,
-- app_is_admin, app_current_agent_id) and the agents table.
-- Rollback: A7_rollback.sql.
--
-- REVIEW PENDING — do NOT apply until reviewed. Until then the section renders a
-- full "Data source awaiting secure setup" layout with no invented figures.
-- ============================================================================
begin;

do $$
begin
  if exists(select 1 from public._app_migrations where name='A7_agent_performance' and status='complete') then
    raise exception 'A7_agent_performance already applied.'; end if;
end $$;

insert into public._app_migrations(name,status,applied_at,rolled_back_at)
values ('A7_agent_performance','in_progress',now(),null)
on conflict (name) do update set status='in_progress', applied_at=now(), rolled_back_at=null;

create or replace function public._perf_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.app_is_admin()
      or exists(select 1 from public.agents where auth_user_id = auth.uid() and role='agent' and coalesce(active,true));
$$;

create or replace function public.app_agent_performance(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare admin boolean := public.app_is_admin(); tll date := p_to + 1;
begin
  if p_from is null or p_to is null or p_from >= p_to then return jsonb_build_object('error','bad_date_range'); end if;
  if not public._perf_allowed() then return jsonb_build_object('error','forbidden'); end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'agent_id', a.id, 'name', a.name, 'color', a.color,
      'accepted_offers', x.ao, 'closed_units', x.cu, 'production_volume', x.pv,
      'buyers', x.buy, 'listings', x.lst,
      'gci', case when admin then x.gci_sum else null end
    ) order by x.cu desc, x.pv desc)
    from public.agents a
    left join lateral (
      select
        count(*) filter (where d.is_accepted_offer and d.ao_date >= p_from and d.ao_date < tll) as ao,
        count(*) filter (where d.is_closed_official and d.close_date >= p_from and d.close_date < tll) as cu,
        coalesce(sum(d.production) filter (where d.is_closed_official and d.close_date >= p_from and d.close_date < tll),0) as pv,
        coalesce(sum(d.gci) filter (where d.is_closed_official and d.close_date >= p_from and d.close_date < tll),0) as gci_sum,
        count(*) filter (where d.is_closed_official and d.close_date >= p_from and d.close_date < tll and d.side_norm='buyer') as buy,
        count(*) filter (where d.is_closed_official and d.close_date >= p_from and d.close_date < tll and d.side_norm in ('seller','listing','list')) as lst
      from public.v_deals_canonical d where d.agent_id = a.id
    ) x on true
    where coalesce(a.active,true) is true
  ), '[]'::jsonb);
end $$;

create or replace function public.app_agent_records(p_agent_id uuid, p_basis text, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare admin boolean := public.app_is_admin(); tll date := p_to + 1;
begin
  if p_agent_id is null or p_from is null or p_to is null then return jsonb_build_object('error','bad_input'); end if;
  if not public._perf_allowed() then return jsonb_build_object('error','forbidden'); end if;

  return coalesce((
    select jsonb_agg(r.row order by r.row_date desc nulls last)
    from (
      select jsonb_build_object(
        'id', c.id, 'type','deal',
        'label', coalesce(nullif(c.addr,''), nullif(c.client_name,''), 'Deal'),
        'secondary', to_char(c.row_date,'Mon DD, YYYY'),
        'status', c.stage,
        'amount', case when admin and p_basis in ('production_volume','gci')
                       then case p_basis when 'production_volume' then c.production else c.gci end else null end
      ) as row, c.row_date
      from (
        select d.*,
          case when p_basis='accepted_offers' then d.ao_date else d.close_date end as row_date,
          case when p_basis='accepted_offers' then d.is_accepted_offer else d.is_closed_official end as included
        from public.v_deals_canonical d where d.agent_id = p_agent_id
      ) c
      where c.included and c.row_date >= p_from and c.row_date < tll
    ) r
  ), '[]'::jsonb);
end $$;

revoke all on function public._perf_allowed()                                   from public, anon;
revoke all on function public.app_agent_performance(date,date)                  from public, anon;
revoke all on function public.app_agent_records(uuid,text,date,date)            from public, anon;
grant execute on function public.app_agent_performance(date,date)               to authenticated;
grant execute on function public.app_agent_records(uuid,text,date,date)         to authenticated;

update public._app_migrations set status='complete', applied_at=now() where name='A7_agent_performance';

commit;
