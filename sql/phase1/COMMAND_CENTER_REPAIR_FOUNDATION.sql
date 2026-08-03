-- ============================================================================
-- COMMAND_CENTER_REPAIR_FOUNDATION.sql   (ADDITIVE REPAIR — paste into SQL Editor)
-- ----------------------------------------------------------------------------
-- Adds ONLY the objects the live verifier reported missing/incomplete. It does
-- NOT rerun or replace A5/A6/A7/A8, does NOT drop tables/functions/policies, and
-- does NOT alter existing CRM records. Safe to run more than once (IF NOT EXISTS,
-- CREATE OR REPLACE, guarded constraints/policies/seed). Inspects real objects
-- rather than trusting the _app_migrations marker.
--
-- Missing objects repaired:
--   A) Goals (A3):  team_goals flexible columns, _goal_actual, app_goals_list,
--                   app_goals_dashboard, app_goal_upsert, app_goal_delete
--   B) News  (A4):  news_sources table + RLS, app_news_sources_list/active/
--                   upsert/delete  (+ default SOURCE configuration if empty)
--   C) Widget audit: production_widgets_audit table + RLS, an AFTER trigger that
--                   logs every insert/update/delete on production_widgets (covers
--                   create/edit/duplicate/hide/delete/reorder/reset), and the
--                   admin reader app_production_widgets_audit(int)
--
-- EXECUTE decision for app_current_agent_id / app_is_admin: they are called ONLY
-- inside other SECURITY DEFINER functions (privilege checks use the function
-- owner there), and NO application/RPC path calls them directly via supabase.rpc.
-- They therefore stay INTERNAL — we do NOT grant authenticated EXECUTE, which is
-- the safer choice. The updated verifier treats "authenticated lacks EXECUTE" on
-- these two as PASS (expected), and only flags them if public/anon can execute.
--
-- Safety: no DROP TABLE / TRUNCATE / unbounded migration-time DELETE/UPDATE. All
-- SECURITY DEFINER functions set search_path=''. Identity from auth.uid(); no
-- browser-supplied agent id trusted. GCI stays admin-only (unchanged A7). No
-- direct INSERT/UPDATE/DELETE granted to authenticated. Existing data preserved.
-- ============================================================================
begin;

-- ####################################################################
-- SECTION A — Goals model (was A3; functions missing in production)
-- ####################################################################

-- year / goal_type must be nullable so flexible goals (which don't set them) insert
alter table public.team_goals alter column year      drop not null;
alter table public.team_goals alter column goal_type drop not null;

-- flexible columns — all nullable/defaulted, so no rewrite of existing rows
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
  add column if not exists created_at  timestamptz not null default now(),
  add column if not exists updated_at  timestamptz not null default now();

-- allowlist / coherence checks — added only if absent (legacy rows have goal_basis NULL → exempt)
do $$
begin
  if not exists (select 1 from pg_constraint where conname='tg_basis_wl' and conrelid='public.team_goals'::regclass) then
    alter table public.team_goals add constraint tg_basis_wl check (
      goal_basis is null or goal_basis in ('accepted_offers','closed_units','production_volume','gci')); end if;
  if not exists (select 1 from pg_constraint where conname='tg_period_wl' and conrelid='public.team_goals'::regclass) then
    alter table public.team_goals add constraint tg_period_wl check (
      period is null or period in ('monthly','yearly','custom')); end if;
  if not exists (select 1 from pg_constraint where conname='tg_scope_wl' and conrelid='public.team_goals'::regclass) then
    alter table public.team_goals add constraint tg_scope_wl check (scope in ('team','individual')); end if;
  if not exists (select 1 from pg_constraint where conname='tg_individual_agent' and conrelid='public.team_goals'::regclass) then
    alter table public.team_goals add constraint tg_individual_agent check (scope <> 'individual' or agent_id is not null); end if;
  if not exists (select 1 from pg_constraint where conname='tg_flex_dates' and conrelid='public.team_goals'::regclass) then
    alter table public.team_goals add constraint tg_flex_dates check (
      goal_basis is null or (start_date is not null and end_date is not null and start_date <= end_date)); end if;
  if not exists (select 1 from pg_constraint where conname='tg_flex_target' and conrelid='public.team_goals'::regclass) then
    alter table public.team_goals add constraint tg_flex_target check (goal_basis is null or target > 0); end if;
end $$;

create unique index if not exists team_goals_legacy_uniq on public.team_goals (year, goal_type) where goal_basis is null;
create index if not exists team_goals_flex_idx on public.team_goals (active, visible, scope, end_date) where goal_basis is not null;

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
    end, 0);
$$;

create or replace function public.app_goals_list()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.app_is_admin() then return jsonb_build_object('error','forbidden'); end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'title',title,'goal_basis',goal_basis,'period',period,'target',target,
      'start_date',start_date,'end_date',end_date,'scope',scope,'agent_id',agent_id,
      'message',message,'image_url',image_url,'visible',visible,'active',active)
      order by end_date desc nulls last, created_at desc)
    from public.team_goals where goal_basis is not null), '[]'::jsonb);
end $$;

create or replace function public.app_goals_dashboard()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.app_current_agent_id(); admin boolean := public.app_is_admin();
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
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

create or replace function public.app_goal_upsert(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare gid uuid;
begin
  if not public.app_is_admin() then return jsonb_build_object('error','forbidden'); end if;
  if not ((p->>'goal_basis') in ('accepted_offers','closed_units','production_volume','gci')) then raise exception 'bad goal_basis'; end if;
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

create or replace function public.app_goal_delete(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_is_admin() then return jsonb_build_object('error','forbidden'); end if;
  delete from public.team_goals where id = p_id and goal_basis is not null;
  return jsonb_build_object('ok', found);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['public._goal_actual(text,date,date,text,uuid)','public.app_goals_list()',
    'public.app_goals_dashboard()','public.app_goal_upsert(jsonb)','public.app_goal_delete(uuid)'] loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('revoke all on function %s from authenticated', fn);
  end loop;
  foreach fn in array array['public.app_goals_list()','public.app_goals_dashboard()',
    'public.app_goal_upsert(jsonb)','public.app_goal_delete(uuid)'] loop
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  -- _goal_actual stays internal (no authenticated EXECUTE)
end $$;

-- ####################################################################
-- SECTION B — News sources (was A4; entirely missing in production)
-- ####################################################################
create table if not exists public.news_sources (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  url         text check (url is null or url ~ '^https?://'),
  category    text not null default 'community'
              check (category in ('real_estate','housing','zoning','development','taxes','local_business','community')),
  is_fallback boolean not null default false,
  enabled     boolean not null default false,
  position    int not null default 0 check (position >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint news_enabled_needs_url check (not enabled or url is not null)
);

alter table public.news_sources enable row level security;
revoke all on public.news_sources from public, anon, authenticated;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='news_sources' and policyname='news_sources_read') then
    create policy news_sources_read on public.news_sources for select to authenticated using (enabled = true);
  end if;
end $$;
grant select on public.news_sources to authenticated;

-- default SOURCE CONFIGURATION (public feed URLs / placeholders) — only if empty.
-- This is feed configuration, NOT business data.
do $$
begin
  if not exists (select 1 from public.news_sources) then
    insert into public.news_sources (name, url, category, is_fallback, enabled, position) values
      ('Rockland County — Latest News',              null, 'community',   false, false, 0),
      ('Rockland County Executive — Press Releases', null, 'community',   false, false, 1),
      ('Rockland County Legislature — News',         null, 'community',   false, false, 2),
      ('HousingWire',            'https://www.housingwire.com/feed/',                          'real_estate', true, true, 10),
      ('NAR Economists'' Outlook','https://www.nar.realtor/blogs/economists-outlook/feed',     'real_estate', true, true, 11),
      ('Calculated Risk',        'https://calculatedriskblog.com/feeds/posts/default?alt=rss', 'housing',     true, true, 12);
  end if;
end $$;

create or replace function public.app_news_sources_list()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.app_is_admin() then return jsonb_build_object('error','forbidden'); end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'url',url,'category',category,
    'is_fallback',is_fallback,'enabled',enabled,'position',position) order by position, created_at)
    from public.news_sources), '[]'::jsonb);
end $$;

create or replace function public.app_news_sources_active()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'url',url,'category',category,'is_fallback',is_fallback)
    order by is_fallback, position) from public.news_sources where enabled and url is not null), '[]'::jsonb);
$$;

create or replace function public.app_news_source_upsert(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare nid uuid;
begin
  if not public.app_is_admin() then return jsonb_build_object('error','forbidden'); end if;
  insert into public.news_sources (id,name,url,category,is_fallback,enabled,position,updated_at)
  values (coalesce(nullif(p->>'id','')::uuid, gen_random_uuid()),
    p->>'name', nullif(p->>'url',''), coalesce(nullif(p->>'category',''),'community'),
    coalesce((p->>'is_fallback')::boolean,false), coalesce((p->>'enabled')::boolean,false),
    coalesce((p->>'position')::int,0), now())
  on conflict (id) do update set name=excluded.name, url=excluded.url, category=excluded.category,
    is_fallback=excluded.is_fallback, enabled=excluded.enabled, position=excluded.position, updated_at=now()
  returning id into nid;
  return jsonb_build_object('ok',true,'id',nid);
end $$;

create or replace function public.app_news_source_delete(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_is_admin() then return jsonb_build_object('error','forbidden'); end if;
  delete from public.news_sources where id = p_id;
  return jsonb_build_object('ok', found);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['public.app_news_sources_list()','public.app_news_sources_active()',
    'public.app_news_source_upsert(jsonb)','public.app_news_source_delete(uuid)'] loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('revoke all on function %s from authenticated', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

-- ####################################################################
-- SECTION C — Production widget audit (table + trigger + reader)
-- The installed production_widgets migration had no audit. This adds it without
-- touching the installed RPCs: an AFTER trigger records every row change, so
-- create/edit/duplicate/hide/delete/reorder/reset (all of which go through the
-- save/reset RPCs' delete+insert) are audited.
-- ####################################################################
create table if not exists public.production_widgets_audit (
  id         bigint generated always as identity primary key,
  widget_id  uuid,
  action     text not null,                 -- insert | update | delete
  snapshot   jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

alter table public.production_widgets_audit enable row level security;
revoke all on public.production_widgets_audit from public, anon, authenticated;
-- No SELECT policy: the audit is readable ONLY through the admin reader RPC below.

create or replace function public._pw_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.production_widgets_audit (widget_id, action, snapshot, changed_by)
  values (coalesce(new.id, old.id), lower(tg_op), to_jsonb(coalesce(new, old)), public.app_current_agent_id());
  return coalesce(new, old);
end $$;

create or replace trigger pw_audit_trg
  after insert or update or delete on public.production_widgets
  for each row execute function public._pw_audit();

create or replace function public.app_production_widgets_audit(p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.app_is_admin() then return jsonb_build_object('error','forbidden'); end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'widget_id',widget_id,'action',action,'changed_by',changed_by,'changed_at',changed_at) order by id desc)
    from (select * from public.production_widgets_audit order by id desc limit greatest(1, least(coalesce(p_limit,100),1000))) s), '[]'::jsonb);
end $$;

do $$
begin
  execute 'revoke all on function public.app_production_widgets_audit(int) from public, anon';
  execute 'grant execute on function public.app_production_widgets_audit(int) to authenticated';
  -- _pw_audit is a trigger function; not directly callable, no grant needed.
end $$;

-- ####################################################################
-- Repair bookkeeping (marker only; not used as a guard)
-- ####################################################################
insert into public._app_migrations (name, status, applied_at, rolled_back_at)
values ('COMMAND_CENTER_REPAIR_FOUNDATION','complete', now(), null)
on conflict (name) do update set status='complete', applied_at=now(), rolled_back_at=null;

commit;
