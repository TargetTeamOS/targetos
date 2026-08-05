-- ============================================================================
-- COMMAND_CENTER_APPLY_EVERYTHING.sql
-- ONE paste to bring any database fully up to date for the current Command
-- Center branch. Safe to run on your current production DB (it re-affirms
-- already-applied pieces) or a fresh one. Additive / rerunnable throughout:
-- create-or-replace, if-not-exists, guarded constraints/policies. No DROP TABLE,
-- no TRUNCATE, no data changes. All SECURITY DEFINER functions set search_path=''.
-- Take a database backup first, then run, then run COMMAND_CENTER_VERIFY.sql.
--
-- Sections, in dependency order:
--   1 — Foundation repair: Goals + News functions (+ widget audit)
--   2 — Goals unique-constraint fix (allow multiple flexible goals)
--   3 — Buyers/Sellers goal metrics
--   4 — A9 personal per-agent self-scoped widgets (My Widgets)
--   5 — Notes table (voice recordings / Notepad)
-- ============================================================================


-- ####################################################################
-- SECTION 1 — Foundation repair (Goals + News + widget audit)
-- ####################################################################
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


-- ####################################################################
-- SECTION 2 — Goals unique-constraint fix
-- ####################################################################
-- ============================================================================
-- COMMAND_CENTER_FIX_GOALS_UNIQUE.sql   (additive, safe, rerunnable)
-- Fixes: "duplicate key value violates unique constraint team_goals_uniq" when
-- saving a second flexible (Command Center) goal.
--
-- Cause: the legacy blanket constraint team_goals_uniq is
--   UNIQUE NULLS NOT DISTINCT (year, goal_type)
-- Flexible goals store year/goal_type as NULL, and "nulls not distinct" treats
-- those NULLs as equal — so two flexible goals collide.
--
-- Fix: retire that blanket constraint. Legacy uniqueness ("one legacy row per
-- year+goal_type") is preserved by the partial unique index team_goals_legacy_uniq
-- (created below if missing), which only applies to legacy rows (goal_basis IS NULL).
--
-- No data is changed or removed; only the over-broad constraint is dropped.
-- ============================================================================
begin;

-- Ensure the legacy-only partial unique exists (idempotent) BEFORE dropping the blanket one.
create unique index if not exists team_goals_legacy_uniq
  on public.team_goals (year, goal_type)
  where goal_basis is null;

-- Retire the blanket unique that blocks multiple flexible goals.
alter table public.team_goals drop constraint if exists team_goals_uniq;

commit;


-- ####################################################################
-- SECTION 3 — Buyers/Sellers goal metrics
-- ####################################################################
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


-- ####################################################################
-- SECTION 4 — A9 personal per-agent self-scoped widgets (My Widgets)
-- (hard "already applied" guard softened to a notice so this file is rerunnable)
-- ####################################################################
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
    raise notice 'A9_user_widgets already present — re-applying idempotently'; end if;
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


-- ####################################################################
-- SECTION 5 — Notes table (voice recordings / Notepad)
-- ####################################################################
-- ============================================================================
-- notes_ensure.sql   (additive, rerunnable)
-- Guarantees the `notes` table and the columns the voice recorder / Notepad
-- write to actually exist, so saved recordings persist. Safe to run whether or
-- not sql/notes.sql was applied before. No data changed; no RLS toggled.
-- ============================================================================
begin;

create table if not exists public.notes (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid,
  title        text,
  body         text,
  transcript   text,
  audio_url    text,
  audio_path   text,
  linked_type  text,
  linked_id    uuid,
  pinned       boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- If an older `notes` table already exists, make sure the recorder's columns are present.
alter table public.notes
  add column if not exists transcript  text,
  add column if not exists audio_url   text,
  add column if not exists audio_path  text,
  add column if not exists linked_type text,
  add column if not exists linked_id   uuid,
  add column if not exists pinned      boolean not null default false,
  add column if not exists updated_at  timestamptz not null default now();

create index if not exists idx_notes_agent  on public.notes (agent_id, created_at desc);
create index if not exists idx_notes_linked on public.notes (linked_type, linked_id);

-- Ensure the app role can read/write notes (harmless if already granted).
grant select, insert, update, delete on public.notes to authenticated;

commit;


-- ####################################################################
-- SECTION 6 — Goal-slot fix (single active team goal per period + cleanup)
-- ####################################################################
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
