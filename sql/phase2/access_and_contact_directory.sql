-- TargetOS Phase 2: stable feature grants and safe shared contact directory
-- Review and apply in a controlled Supabase change window. Idempotent.
-- This migration does not alter or delete CRM records.

begin;

create table if not exists public.agent_permission_grants (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  permission_id text not null,
  enabled boolean not null default true,
  granted_by uuid references public.agents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_permission_grants_key unique (agent_id, permission_id),
  constraint agent_permission_grants_permission_id check (permission_id in ('calls.view'))
);

alter table public.agent_permission_grants enable row level security;
revoke all on public.agent_permission_grants from public, anon, authenticated;
grant select, insert, update, delete on public.agent_permission_grants to authenticated;

create or replace function public.app_current_agent_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.agents
  where auth_user_id = auth.uid() and coalesce(active, true)
  limit 1
$$;

create or replace function public.app_current_agent_role()
returns text language sql stable security definer set search_path = '' as $$
  select role from public.agents
  where auth_user_id = auth.uid() and coalesce(active, true)
  limit 1
$$;

create or replace function public.app_has_permission(permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when public.app_current_agent_role() in ('admin', 'secretary') then true
    else exists (
      select 1 from public.agent_permission_grants g
      where g.agent_id = public.app_current_agent_id()
        and g.permission_id = permission
        and g.enabled
    )
  end
$$;

drop policy if exists agent_permission_grants_read on public.agent_permission_grants;
create policy agent_permission_grants_read on public.agent_permission_grants
  for select to authenticated
  using (
    agent_id = public.app_current_agent_id()
    or public.app_current_agent_role() = 'admin'
  );

drop policy if exists agent_permission_grants_admin_write on public.agent_permission_grants;
create policy agent_permission_grants_admin_write on public.agent_permission_grants
  for all to authenticated
  using (public.app_current_agent_role() = 'admin')
  with check (public.app_current_agent_role() = 'admin');

-- Full contact rows are office/owner-only. Other agents use the directory RPC
-- below, which returns an intentionally small projection.
alter table public.contacts add column if not exists is_private boolean not null default false;
alter table public.contacts enable row level security;
do $$
declare p record;
begin
  for p in select policyname from pg_policies
    where schemaname = 'public' and tablename = 'contacts'
  loop
    execute format('drop policy if exists %I on public.contacts', p.policyname);
  end loop;
end $$;

create policy contacts_select on public.contacts
  for select to authenticated
  using (
    public.app_current_agent_role() in ('admin', 'secretary')
    or agent_id = public.app_current_agent_id()
  );

create policy contacts_insert on public.contacts
  for insert to authenticated
  with check (
    public.app_current_agent_role() in ('admin', 'secretary')
    or agent_id = public.app_current_agent_id()
  );

create policy contacts_update on public.contacts
  for update to authenticated
  using (
    public.app_current_agent_role() in ('admin', 'secretary')
    or agent_id = public.app_current_agent_id()
  )
  with check (
    public.app_current_agent_role() in ('admin', 'secretary')
    or agent_id = public.app_current_agent_id()
  );

create policy contacts_delete on public.contacts
  for delete to authenticated
  using (public.app_current_agent_role() = 'admin');

-- JSON keeps the directory compatible with historical contact schemas while
-- explicitly selecting the only fields shared across agents. An agent's own
-- rows remain complete; other agents receive name/type/status/owner only.
create or replace function public.app_contact_directory(
  p_search text default null,
  p_status text default null,
  p_type text default null,
  p_agent_id uuid default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.app_current_agent_id();
  caller_role text := public.app_current_agent_role();
  result jsonb;
begin
  if auth.uid() is null or caller_id is null then
    raise exception 'authenticated active agent required' using errcode = '42501';
  end if;

  with visible as (
    select c.*, a.name as directory_agent_name, a.color as directory_agent_color
    from public.contacts c
    left join public.agents a on a.id = c.agent_id
    where (
      caller_role in ('admin', 'secretary')
      or c.agent_id = caller_id
      or coalesce(c.is_private, false) = false
    )
      and (p_status is null or p_status = '' or c.status = p_status)
      and (p_type is null or p_type = '' or c.type = p_type)
      and (p_agent_id is null or c.agent_id = p_agent_id)
      and (
        p_search is null or length(trim(p_search)) < 2
        or coalesce(c.first_name, '') ilike '%' || p_search || '%'
        or coalesce(c.last_name, '') ilike '%' || p_search || '%'
        or (c.agent_id = caller_id and coalesce(c.phone, '') ilike '%' || p_search || '%')
        or (c.agent_id = caller_id and coalesce(c.email, '') ilike '%' || p_search || '%')
      )
  ), paged as (
    select v.*, count(*) over () as directory_total_count
    from visible v
    order by v.last_activity desc nulls last, v.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 250))
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select coalesce(jsonb_agg(
    case
      when caller_role in ('admin', 'secretary') or p.agent_id = caller_id then
        (to_jsonb(p) - 'directory_agent_name' - 'directory_agent_color' - 'directory_total_count')
        || jsonb_build_object(
          'agents', jsonb_build_object('id', p.agent_id, 'name', p.directory_agent_name, 'color', p.directory_agent_color),
          '_total_count', p.directory_total_count
        )
      else jsonb_build_object(
        'id', p.id,
        'first_name', p.first_name,
        'last_name', p.last_name,
        'status', p.status,
        'type', p.type,
        'agent_id', p.agent_id,
        'agents', jsonb_build_object('id', p.agent_id, 'name', p.directory_agent_name, 'color', p.directory_agent_color),
        'directory_only', true,
        '_total_count', p.directory_total_count
      )
    end
  ), '[]'::jsonb) into result
  from paged p;

  return result;
end
$$;

revoke all on function public.app_contact_directory(text,text,text,uuid,integer,integer) from public, anon;
grant execute on function public.app_contact_directory(text,text,text,uuid,integer,integer) to authenticated;
revoke all on function public.app_has_permission(text) from public, anon;
grant execute on function public.app_has_permission(text) to authenticated;

-- Call Log data is protected independently of navigation. Agents require an
-- explicit calls.view grant; recording URLs/transcripts are never returned to
-- individually granted agents by this list function.
alter table public.calls enable row level security;
do $$
declare p record;
begin
  for p in select policyname from pg_policies
    where schemaname = 'public' and tablename = 'calls'
  loop
    execute format('drop policy if exists %I on public.calls', p.policyname);
  end loop;
end $$;

create policy calls_select on public.calls
  for select to authenticated
  using (
    public.app_current_agent_role() in ('admin', 'secretary')
    or (
      public.app_has_permission('calls.view')
      and agent_id = public.app_current_agent_id()
    )
  );

create policy calls_insert on public.calls
  for insert to authenticated
  with check (
    public.app_current_agent_role() in ('admin', 'secretary')
    or agent_id = public.app_current_agent_id()
  );

create policy calls_update on public.calls
  for update to authenticated
  using (
    public.app_current_agent_role() in ('admin', 'secretary')
    or agent_id = public.app_current_agent_id()
  )
  with check (
    public.app_current_agent_role() in ('admin', 'secretary')
    or agent_id = public.app_current_agent_id()
  );

create policy calls_delete on public.calls
  for delete to authenticated
  using (public.app_current_agent_role() = 'admin');

create or replace function public.app_calls_list(p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.app_current_agent_id();
  caller_role text := public.app_current_agent_role();
  result jsonb;
begin
  if auth.uid() is null or not public.app_has_permission('calls.view') then
    raise exception 'call log access denied' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    case when caller_role in ('admin', 'secretary') then
      to_jsonb(c) || jsonb_build_object('agent_name', a.name, 'agent_color', a.color)
    else
      (to_jsonb(c) - 'recording_url' - 'recording_sid' - 'recording_storage_path' - 'transcript')
      || jsonb_build_object(
        'agent_name', a.name,
        'agent_color', a.color,
        'has_recording', coalesce(to_jsonb(c)->>'recording_url', '') <> ''
          or coalesce(to_jsonb(c)->>'recording_sid', '') <> ''
          or coalesce(to_jsonb(c)->>'recording_storage_path', '') <> ''
      )
    end order by c.called_at desc
  ), '[]'::jsonb) into result
  from (
    select * from public.calls
    where caller_role in ('admin', 'secretary') or agent_id = caller_id
    order by called_at desc
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  ) c
  left join public.agents a on a.id = c.agent_id;

  return result;
end
$$;

revoke all on function public.app_calls_list(integer) from public, anon;
grant execute on function public.app_calls_list(integer) to authenticated;

-- Announcements and briefing administration are office-only at both the UI
-- and database layers. Service-role jobs continue to bypass RLS. Existing
-- rows and configuration are preserved.
alter table public.announcements enable row level security;
do $$
declare p record;
begin
  for p in select policyname from pg_policies
    where schemaname = 'public' and tablename = 'announcements'
  loop
    execute format('drop policy if exists %I on public.announcements', p.policyname);
  end loop;
end $$;
create policy announcements_office_read on public.announcements
  for select to authenticated
  using (public.app_current_agent_role() in ('admin', 'secretary'));
create policy announcements_office_write on public.announcements
  for all to authenticated
  using (public.app_current_agent_role() in ('admin', 'secretary'))
  with check (public.app_current_agent_role() in ('admin', 'secretary'));

do $$
declare table_name text; p record;
begin
  foreach table_name in array array['briefing_prefs', 'briefing_quotes', 'briefing_sends']
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      for p in select pp.policyname from pg_policies pp
        where pp.schemaname = 'public' and pp.tablename = table_name
      loop
        execute format('drop policy if exists %I on public.%I', p.policyname, table_name);
      end loop;
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.app_current_agent_role() in (''admin'', ''secretary'')) with check (public.app_current_agent_role() in (''admin'', ''secretary''))',
        table_name || '_office_only', table_name
      );
    end if;
  end loop;
end $$;

commit;
