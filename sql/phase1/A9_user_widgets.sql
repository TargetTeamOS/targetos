-- ============================================================================
-- A9_user_widgets.sql — per-agent PERSONAL widgets (owner-applied).
-- ----------------------------------------------------------------------------
-- Lets every authenticated agent add their OWN dashboard widgets, scoped strictly
-- to their OWN deals / performance. Security model (the whole point of this file):
--   • No RPC accepts an agent id. Identity is always public.app_current_agent_id()
--     (derived from auth.uid()); a caller cannot compute over anyone else's data.
--   • Every metric query is hard-filtered to agent_id = the caller's own agent id.
--   • Writes force owner_auth_uid = auth.uid(); a payload owner is ignored.
--   • RLS on user_widgets is owner-scoped; the table has no direct grants — all
--     access is through the SECURITY DEFINER RPCs below.
--   • Metrics, display types and ranges are allowlisted (no arbitrary SQL/fields).
--   • The only financial value exposed is the caller's OWN gci.
-- Additive / forward-only. No DROP TABLE / TRUNCATE / unbounded DML. All definer
-- functions set search_path=''. Safe to run once on a clean install.
-- ============================================================================
begin;

do $$
begin
  if exists (select 1 from public._app_migrations where name='A9_user_widgets' and status='complete') then
    raise exception 'A9_user_widgets already applied.'; end if;
end $$;

insert into public._app_migrations (name, status, applied_at, rolled_back_at)
values ('A9_user_widgets','in_progress', now(), null)
on conflict (name) do update set status='in_progress', applied_at=now();

-- ── Table ────────────────────────────────────────────────────────────────────
create table if not exists public.user_widgets (
  id             uuid primary key default gen_random_uuid(),
  owner_auth_uid uuid not null,                         -- = auth.uid() of the owner
  title          text not null check (char_length(title) between 1 and 60),
  metric         text not null,                         -- allowlisted self-metric (see _uw_metric_ok)
  display_type   text not null default 'kpi'  check (display_type in ('kpi','progress','list')),
  date_range     text not null default 'ytd'  check (date_range  in ('mtd','qtd','ytd')),
  position       int  not null default 0 check (position >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists user_widgets_owner_idx on public.user_widgets (owner_auth_uid, position);

alter table public.user_widgets enable row level security;
revoke all on public.user_widgets from public, anon, authenticated;   -- access via RPC only
-- Owner-scoped policy (defense in depth if a direct grant is ever added):
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_widgets' and policyname='user_widgets_owner') then
    create policy user_widgets_owner on public.user_widgets
      for all to authenticated using (owner_auth_uid = auth.uid()) with check (owner_auth_uid = auth.uid());
  end if;
end $$;

-- ── Allowlists ───────────────────────────────────────────────────────────────
create or replace function public._uw_metric_ok(m text)
returns boolean language sql immutable set search_path = '' as $$
  select m in ('my_accepted_offers','my_closed_units','my_production_volume','my_gci','my_open_tasks');
$$;

-- Range → [from, to) date bounds (server-side; caller only picks the preset name)
create or replace function public._uw_range(p_range text)
returns table(d_from date, d_to date) language sql immutable set search_path = '' as $$
  select case p_range
           when 'mtd' then date_trunc('month', now())::date
           when 'qtd' then date_trunc('quarter', now())::date
           else date_trunc('year', now())::date
         end,
         (now()::date + 1);
$$;

-- ── Compute ONE metric for the CALLER ONLY (never accepts an agent id) ────────
create or replace function public._uw_value(p_metric text, p_range text)
returns numeric language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.app_current_agent_id(); f date; t date; v numeric;
begin
  if me is null or not public._uw_metric_ok(p_metric) then return 0; end if;
  select d_from, d_to into f, t from public._uw_range(p_range);
  v := case p_metric
    when 'my_accepted_offers' then (select count(*)::numeric from public.v_deals_canonical c
       where c.is_accepted_offer and c.ao_date >= f and c.ao_date < t and c.agent_id = me)
    when 'my_closed_units' then (select count(*)::numeric from public.v_deals_canonical c
       where c.is_closed_official and c.close_date >= f and c.close_date < t and c.agent_id = me)
    when 'my_production_volume' then (select coalesce(sum(c.production),0)::numeric from public.v_deals_canonical c
       where c.is_closed_official and c.close_date >= f and c.close_date < t and c.agent_id = me)
    when 'my_gci' then (select coalesce(sum(c.gci),0)::numeric from public.v_deals_canonical c
       where c.is_closed_official and c.close_date >= f and c.close_date < t and c.agent_id = me)
    when 'my_open_tasks' then (select count(*)::numeric from public.tasks tk
       where tk.agent_id = me and coalesce(tk.status,'') <> 'done')
    else 0 end;
  return coalesce(v, 0);
end $$;

-- ── Read the caller's own widgets, each with its computed value ───────────────
create or replace function public.app_user_widgets_get()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return jsonb_build_object('error','unauthenticated'); end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', w.id, 'title', w.title, 'metric', w.metric, 'display_type', w.display_type,
      'date_range', w.date_range, 'position', w.position,
      'value', public._uw_value(w.metric, w.date_range))
      order by w.position, w.created_at)
    from public.user_widgets w where w.owner_auth_uid = uid), '[]'::jsonb);
end $$;

-- ── Create / update one of the CALLER'S OWN widgets (owner forced to auth.uid) ─
create or replace function public.app_user_widget_save(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); wid uuid;
begin
  if uid is null then return jsonb_build_object('error','unauthenticated'); end if;
  if not public._uw_metric_ok(p->>'metric') then return jsonb_build_object('error','bad_metric'); end if;
  if coalesce(p->>'display_type','kpi') not in ('kpi','progress','list') then return jsonb_build_object('error','bad_display'); end if;
  if coalesce(p->>'date_range','ytd') not in ('mtd','qtd','ytd') then return jsonb_build_object('error','bad_range'); end if;

  insert into public.user_widgets (id, owner_auth_uid, title, metric, display_type, date_range, position, updated_at)
  values (
    coalesce(nullif(p->>'id','')::uuid, gen_random_uuid()),
    uid,                                             -- owner ALWAYS the caller
    coalesce(nullif(p->>'title',''), 'My widget'),
    p->>'metric', coalesce(nullif(p->>'display_type',''),'kpi'),
    coalesce(nullif(p->>'date_range',''),'ytd'), coalesce((p->>'position')::int, 0), now())
  on conflict (id) do update set
    title=excluded.title, metric=excluded.metric, display_type=excluded.display_type,
    date_range=excluded.date_range, position=excluded.position, updated_at=now()
    where public.user_widgets.owner_auth_uid = uid    -- can only edit own rows
  returning id into wid;
  if wid is null then return jsonb_build_object('error','forbidden'); end if;
  return jsonb_build_object('ok', true, 'id', wid);
end $$;

create or replace function public.app_user_widget_delete(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return jsonb_build_object('error','unauthenticated'); end if;
  delete from public.user_widgets where id = p_id and owner_auth_uid = uid;
  return jsonb_build_object('ok', found);
end $$;

-- ── Drill-down: the caller's OWN supporting records for a metric ──────────────
create or replace function public.app_user_widget_records(p_metric text, p_range text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.app_current_agent_id(); f date; t date;
begin
  if me is null or not public._uw_metric_ok(p_metric) then return '[]'::jsonb; end if;
  select d_from, d_to into f, t from public._uw_range(p_range);
  if p_metric = 'my_open_tasks' then
    return coalesce((select jsonb_agg(jsonb_build_object('id', tk.id, 'type','task',
        'label', coalesce(tk.title,'Task'), 'date', tk.due_date) order by tk.due_date nulls last)
      from public.tasks tk where tk.agent_id = me and coalesce(tk.status,'') <> 'done'), '[]'::jsonb);
  end if;
  -- deal-based metrics
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'type','deal',
      'label', coalesce(c.addr, c.client_name, 'Deal'),
      'date', case when p_metric='my_accepted_offers' then c.ao_date else c.close_date end,
      'amount', case when p_metric in ('my_production_volume') then c.production
                     when p_metric in ('my_gci') then c.gci else null end)
      order by case when p_metric='my_accepted_offers' then c.ao_date else c.close_date end desc)
    from public.v_deals_canonical c
    where c.agent_id = me
      and case p_metric
            when 'my_accepted_offers' then c.is_accepted_offer and c.ao_date >= f and c.ao_date < t
            else c.is_closed_official and c.close_date >= f and c.close_date < t end), '[]'::jsonb);
end $$;

-- ── Grants: agent-callable RPCs to authenticated; helpers stay internal ───────
do $$
declare fn text;
begin
  foreach fn in array array[
    'public._uw_metric_ok(text)','public._uw_range(text)','public._uw_value(text,text)',
    'public.app_user_widgets_get()','public.app_user_widget_save(jsonb)',
    'public.app_user_widget_delete(uuid)','public.app_user_widget_records(text,text)'] loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('revoke all on function %s from authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.app_user_widgets_get()','public.app_user_widget_save(jsonb)',
    'public.app_user_widget_delete(uuid)','public.app_user_widget_records(text,text)'] loop
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  -- _uw_metric_ok/_uw_range/_uw_value remain internal (called only by the RPCs above)
end $$;

update public._app_migrations set status='complete', applied_at=now(), rolled_back_at=null
  where name='A9_user_widgets';
commit;
