-- ============================================================================
-- A5_goal_records.sql — drill-down records behind a goal's computed "actual"
-- ----------------------------------------------------------------------------
-- app_goals_dashboard() returns each goal's authoritative `actual` (a single
-- number). The Command Center needs to let a user click that number and see the
-- EXACT deal rows that make it up. v_deals_canonical is revoked from
-- authenticated, so this must be a security-definer RPC that (a) re-applies the
-- same inclusion filter as _goal_actual, (b) enforces the same visibility rule
-- as app_goals_dashboard (admins see all; a non-admin sees team goals and only
-- their own individual goals), and (c) never exposes per-deal financials
-- (production / gci) to non-admins.
--
-- Purely additive: one new function, no data touched. Idempotency-guarded.
-- Depends on: A2 (v_deals_canonical, app_is_admin, app_current_agent_id),
-- A3 (team_goals, goal_basis model). Rollback: A5_rollback.sql.
--
-- REVIEW PENDING — do NOT apply until reviewed. The dashboard's goal drill-downs
-- degrade gracefully (a clear "records view not yet available" message) until
-- this is live.
-- ============================================================================
begin;

do $$
begin
  if exists(select 1 from public._app_migrations where name='A5_goal_records' and status='complete') then
    raise exception 'A5_goal_records already applied.'; end if;
end $$;

insert into public._app_migrations(name,status,applied_at,rolled_back_at)
values ('A5_goal_records','in_progress',now(),null)
on conflict (name) do update set status='in_progress', applied_at=now(), rolled_back_at=null;

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

  -- same visibility rule as app_goals_dashboard
  if not (admin or g.scope='team' or (g.scope='individual' and g.agent_id = me)) then
    return jsonb_build_object('error','forbidden');
  end if;

  frm := g.start_date;
  tll := g.end_date + 1;   -- inclusive end, matching _goal_actual's [start, end+1)

  return coalesce((
    select jsonb_agg(r.row order by r.row_date desc nulls last)
    from (
      select
        jsonb_build_object(
          'id',        c.id,
          'type',      'deal',
          'label',     coalesce(nullif(c.addr,''), nullif(c.client_name,''), 'Deal'),
          'secondary', to_char(c.row_date, 'Mon DD, YYYY'),
          'status',    c.stage,
          -- per-deal financials only for admins, and only for $-based goals
          'amount',    case when admin and g.goal_basis in ('production_volume','gci')
                            then case g.goal_basis when 'production_volume' then c.production else c.gci end
                            else null end
        ) as row,
        c.row_date
      from (
        select
          d.*,
          case when g.goal_basis = 'accepted_offers' then d.ao_date else d.close_date end as row_date,
          case when g.goal_basis = 'accepted_offers' then d.is_accepted_offer else d.is_closed_official end as included
        from public.v_deals_canonical d
      ) c
      where c.included
        and c.row_date >= frm and c.row_date < tll
        and (g.scope = 'team' or c.agent_id = g.agent_id)
    ) r
  ), '[]'::jsonb);
end $$;

revoke all on function public.app_goal_records(uuid) from public, anon;
grant execute on function public.app_goal_records(uuid) to authenticated;

update public._app_migrations set status='complete', applied_at=now() where name='A5_goal_records';

commit;

-- Verify (run manually after apply, as an admin and as an agent):
--   select public.app_goal_records('<some-goal-uuid>');
-- Expect: a jsonb array of {id,type,label,secondary,status,amount}; `amount`
-- null for non-admins; forbidden for an agent on someone else's individual goal.
