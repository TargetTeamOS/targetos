-- ============================================================================
-- A4_news_sources.sql — Admin-configurable news feeds (Decision 3)
-- ----------------------------------------------------------------------------
-- One new config table + admin RPCs. Feeds are FETCHED SERVER-SIDE (api layer),
-- content sanitized there; this migration only stores which sources exist,
-- their category, order, and enabled state. No business data touched.
--
-- Seeds the three official Rockland County sources with url=NULL / enabled=false
-- (URLs are unknown and will NOT be fabricated — an admin sets the real feed URL
-- to enable). National feeds are seeded enabled as fallbacks.
--
-- Depends on: A2 (app_is_admin). Idempotency-guarded. Rollback: A4_rollback.sql
-- ============================================================================
begin;

do $$
begin
  if exists(select 1 from public._app_migrations where name='A4_news_sources' and status='complete') then
    raise exception 'A4_news_sources already applied.'; end if;
  if to_regclass('public.news_sources') is not null then
    raise exception 'public.news_sources already exists — rollback first.'; end if;
end $$;

insert into public._app_migrations(name,status,applied_at,rolled_back_at)
values ('A4_news_sources','in_progress',now(),null)
on conflict (name) do update set status='in_progress', applied_at=now(), rolled_back_at=null;

create table public.news_sources (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  url         text check (url is null or url ~ '^https?://'),
  category    text not null default 'community'
              check (category in ('real_estate','housing','zoning','development',
                                  'taxes','local_business','community')),
  is_fallback boolean not null default false,
  enabled     boolean not null default false,
  position    int not null default 0 check (position >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- cannot enable a source with no URL
  constraint news_enabled_needs_url check (not enabled or url is not null)
);
alter table public.news_sources enable row level security;
revoke all on public.news_sources from public, anon, authenticated;
-- authenticated may read enabled sources (rendering); management via definer RPCs
create policy news_sources_read on public.news_sources
  for select to authenticated using (enabled = true);
grant select on public.news_sources to authenticated;

-- Seeds: official Rockland County (URLs pending admin entry), then national fallbacks
insert into public.news_sources (name, url, category, is_fallback, enabled, position) values
  ('Rockland County — Latest News',              null, 'community',   false, false, 0),
  ('Rockland County Executive — Press Releases', null, 'community',   false, false, 1),
  ('Rockland County Legislature — News',         null, 'community',   false, false, 2),
  ('HousingWire',        'https://www.housingwire.com/feed/',                          'real_estate', true, true, 10),
  ('NAR Economists'' Outlook','https://www.nar.realtor/blogs/economists-outlook/feed', 'real_estate', true, true, 11),
  ('Calculated Risk',    'https://calculatedriskblog.com/feeds/posts/default?alt=rss', 'housing',     true, true, 12);

-- ── Admin RPCs ──────────────────────────────────────────────────────────────
create or replace function public.app_news_sources_list()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.app_is_admin() then return jsonb_build_object('error','forbidden'); end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'name',name,'url',url,'category',category,'is_fallback',is_fallback,
    'enabled',enabled,'position',position) order by position, created_at)
    from public.news_sources), '[]'::jsonb);
end $$;

-- Server/dashboard read of active sources (ordered); non-fallback first
create or replace function public.app_news_sources_active()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'name',name,'url',url,'category',category,'is_fallback',is_fallback)
    order by is_fallback, position)
    from public.news_sources where enabled and url is not null), '[]'::jsonb);
$$;

create or replace function public.app_news_source_upsert(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare nid uuid;
begin
  if not public.app_is_admin() then return jsonb_build_object('error','forbidden'); end if;
  insert into public.news_sources (id,name,url,category,is_fallback,enabled,position,updated_at)
  values (
    coalesce(nullif(p->>'id','')::uuid, gen_random_uuid()),
    p->>'name', nullif(p->>'url',''), coalesce(nullif(p->>'category',''),'community'),
    coalesce((p->>'is_fallback')::boolean,false), coalesce((p->>'enabled')::boolean,false),
    coalesce((p->>'position')::int,0), now())
  on conflict (id) do update set
    name=excluded.name, url=excluded.url, category=excluded.category,
    is_fallback=excluded.is_fallback, enabled=excluded.enabled,
    position=excluded.position, updated_at=now()
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
  foreach fn in array array[
    'public.app_news_sources_list()','public.app_news_sources_active()',
    'public.app_news_source_upsert(jsonb)','public.app_news_source_delete(uuid)'] loop
    execute format('revoke all on function %s from public',  fn);
    execute format('revoke all on function %s from anon',    fn);
    execute format('revoke all on function %s from authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.app_news_sources_list()','public.app_news_sources_active()',
    'public.app_news_source_upsert(jsonb)','public.app_news_source_delete(uuid)'] loop
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

update public._app_migrations set status='complete', applied_at=now(), rolled_back_at=null
  where name='A4_news_sources';
commit;
select 'A4 applied — sources seeded' as status, count(*) as sources,
  count(*) filter (where enabled) as enabled from public.news_sources;
