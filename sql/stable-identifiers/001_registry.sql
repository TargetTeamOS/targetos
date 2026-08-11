-- TargetOS stable-identifier registry (additive foundation only).
-- This migration does not alter CRM records or existing legacy text columns.

begin;

create extension if not exists pgcrypto;

create table if not exists public.definition_catalog_versions (
  scope_code text primary key,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create table if not exists public.workflow_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null,
  code text not null,
  entity_type_code text not null,
  label text not null,
  version integer not null default 1 check (version > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists workflow_definitions_global_code_uq
  on public.workflow_definitions(code) where organization_id is null;
create unique index if not exists workflow_definitions_org_code_uq
  on public.workflow_definitions(organization_id, code) where organization_id is not null;

create table if not exists public.workflow_states (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflow_definitions(id) on delete restrict,
  code text not null,
  label text not null,
  color text null,
  sort_order integer not null default 0,
  semantic_type text not null default 'open',
  is_initial boolean not null default false,
  is_terminal boolean not null default false,
  counts_as_active boolean not null default false,
  counts_as_won boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workflow_id, code)
);

create unique index if not exists workflow_states_one_initial_uq
  on public.workflow_states(workflow_id) where is_initial and active;

create table if not exists public.workflow_state_aliases (
  id uuid primary key default gen_random_uuid(),
  workflow_state_id uuid not null references public.workflow_states(id) on delete cascade,
  alias text not null check (btrim(alias) <> ''),
  source_code text not null default 'legacy',
  created_at timestamptz not null default now()
);
create unique index if not exists workflow_state_aliases_scope_uq
  on public.workflow_state_aliases(workflow_state_id, source_code, lower(btrim(alias)));

create table if not exists public.workflow_transitions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflow_definitions(id) on delete restrict,
  from_state_id uuid null references public.workflow_states(id) on delete restrict,
  to_state_id uuid not null references public.workflow_states(id) on delete restrict,
  transition_code text not null,
  permission_code text null,
  side_effect_policy_code text not null default 'none',
  active boolean not null default true,
  unique(workflow_id, transition_code)
);

create table if not exists public.workflow_state_mappings (
  id uuid primary key default gen_random_uuid(),
  source_state_id uuid not null references public.workflow_states(id) on delete restrict,
  target_workflow_id uuid not null references public.workflow_definitions(id) on delete restrict,
  target_state_id uuid not null references public.workflow_states(id) on delete restrict,
  mapping_code text not null,
  unique(source_state_id, target_workflow_id, mapping_code)
);

create table if not exists public.choice_sets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null,
  code text not null,
  label text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists choice_sets_global_code_uq
  on public.choice_sets(code) where organization_id is null;
create unique index if not exists choice_sets_org_code_uq
  on public.choice_sets(organization_id, code) where organization_id is not null;

create table if not exists public.choice_options (
  id uuid primary key default gen_random_uuid(),
  choice_set_id uuid not null references public.choice_sets(id) on delete restrict,
  code text not null,
  label text not null,
  color text null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(choice_set_id, code)
);

create table if not exists public.choice_option_aliases (
  id uuid primary key default gen_random_uuid(),
  choice_option_id uuid not null references public.choice_options(id) on delete cascade,
  alias text not null check (btrim(alias) <> ''),
  source_code text not null default 'legacy',
  created_at timestamptz not null default now()
);
create unique index if not exists choice_option_aliases_scope_uq
  on public.choice_option_aliases(choice_option_id, source_code, lower(btrim(alias)));

create table if not exists public.role_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null,
  code text not null,
  label text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists role_definitions_global_code_uq
  on public.role_definitions(code) where organization_id is null;
create unique index if not exists role_definitions_org_code_uq
  on public.role_definitions(organization_id, code) where organization_id is not null;

create table if not exists public.permission_definitions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  group_code text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.role_definitions(id) on delete cascade,
  permission_id uuid not null references public.permission_definitions(id) on delete cascade,
  allowed boolean not null default false,
  primary key(role_id, permission_id)
);

create table if not exists public.board_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null,
  code text not null,
  label text not null,
  entity_type_code text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists board_definitions_global_code_uq
  on public.board_definitions(code) where organization_id is null;
create unique index if not exists board_definitions_org_code_uq
  on public.board_definitions(organization_id, code) where organization_id is not null;

create table if not exists public.external_object_mappings (
  id uuid primary key default gen_random_uuid(),
  provider_code text not null,
  connection_id uuid not null,
  object_type_code text not null,
  external_id text not null,
  internal_entity_type_code text not null,
  internal_id uuid not null,
  external_version text null,
  last_synced_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(connection_id, object_type_code, external_id)
);

create table if not exists public.definition_change_audit (
  id uuid primary key default gen_random_uuid(),
  definition_type text not null,
  definition_id uuid not null,
  action_code text not null,
  before_value jsonb null,
  after_value jsonb null,
  changed_by uuid null,
  changed_at timestamptz not null default now()
);

create or replace function public.resolve_workflow_state_id(
  p_workflow_code text,
  p_value text,
  p_organization_id uuid default null
)
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  resolved_id uuid;
  match_count integer;
begin
  select (array_agg(distinct s.id))[1], count(distinct s.id)
    into resolved_id, match_count
  from public.workflow_definitions w
  join public.workflow_states s on s.workflow_id = w.id and s.active
  left join public.workflow_state_aliases a on a.workflow_state_id = s.id
  where w.active
    and w.code = p_workflow_code
    and (w.organization_id = p_organization_id or (p_organization_id is null and w.organization_id is null))
    and (
      s.code = p_value
      or lower(btrim(a.alias)) = lower(btrim(p_value))
    );

  if match_count > 1 then
    raise exception 'ambiguous workflow state alias for %:%', p_workflow_code, p_value;
  end if;
  return resolved_id;
end;
$$;

create or replace function public.resolve_choice_option_id(
  p_choice_set_code text,
  p_value text,
  p_organization_id uuid default null
)
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  resolved_id uuid;
  match_count integer;
begin
  select (array_agg(distinct o.id))[1], count(distinct o.id)
    into resolved_id, match_count
  from public.choice_sets c
  join public.choice_options o on o.choice_set_id = c.id and o.active
  left join public.choice_option_aliases a on a.choice_option_id = o.id
  where c.active
    and c.code = p_choice_set_code
    and (c.organization_id = p_organization_id or (p_organization_id is null and c.organization_id is null))
    and (
      o.code = p_value
      or lower(btrim(a.alias)) = lower(btrim(p_value))
    );

  if match_count > 1 then
    raise exception 'ambiguous choice option alias for %:%', p_choice_set_code, p_value;
  end if;
  return resolved_id;
end;
$$;

create or replace function public.prevent_identifier_code_change()
returns trigger language plpgsql as $$
begin
  if new.code is distinct from old.code then
    raise exception 'immutable identifier code cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function public.audit_identifier_definition_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if to_jsonb(new) is distinct from to_jsonb(old) then
    insert into public.definition_change_audit(
      definition_type, definition_id, action_code, before_value, after_value, changed_by
    ) values (tg_table_name, new.id, 'updated', to_jsonb(old), to_jsonb(new), auth.uid());
    insert into public.definition_catalog_versions(scope_code, version, updated_at, updated_by)
      values ('global', 1, now(), auth.uid())
      on conflict (scope_code) do update set
        version = public.definition_catalog_versions.version + 1,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;
  end if;
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'workflow_definitions', 'workflow_states', 'choice_sets', 'choice_options',
    'role_definitions', 'permission_definitions', 'board_definitions'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'identifier_code_immutable', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.prevent_identifier_code_change()',
      'identifier_code_immutable', table_name
    );
    execute format('drop trigger if exists %I on public.%I', 'identifier_change_audit', table_name);
    execute format(
      'create trigger %I after update on public.%I for each row execute function public.audit_identifier_definition_change()',
      'identifier_change_audit', table_name
    );
  end loop;
end $$;

insert into public.definition_catalog_versions(scope_code, version)
values ('global', 1)
on conflict (scope_code) do nothing;

alter table public.workflow_definitions enable row level security;
alter table public.workflow_states enable row level security;
alter table public.workflow_state_aliases enable row level security;
alter table public.workflow_transitions enable row level security;
alter table public.workflow_state_mappings enable row level security;
alter table public.choice_sets enable row level security;
alter table public.choice_options enable row level security;
alter table public.choice_option_aliases enable row level security;
alter table public.role_definitions enable row level security;
alter table public.permission_definitions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.board_definitions enable row level security;
alter table public.external_object_mappings enable row level security;
alter table public.definition_change_audit enable row level security;
alter table public.definition_catalog_versions enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'workflow_definitions', 'workflow_states', 'workflow_state_aliases',
    'workflow_transitions', 'workflow_state_mappings', 'choice_sets', 'choice_options',
    'choice_option_aliases', 'role_definitions', 'permission_definitions',
    'role_permissions', 'board_definitions', 'definition_catalog_versions'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'identifier_authenticated_read', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      'identifier_authenticated_read', table_name
    );
    execute format('drop policy if exists %I on public.%I', 'identifier_admin_write', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.app_current_agent_role() = ''admin'') with check (public.app_current_agent_role() = ''admin'')',
      'identifier_admin_write', table_name
    );
  end loop;
end $$;

drop policy if exists identifier_admin_audit_read on public.definition_change_audit;
create policy identifier_admin_audit_read on public.definition_change_audit
  for select to authenticated using (public.app_current_agent_role() = 'admin');

drop policy if exists identifier_service_mapping_access on public.external_object_mappings;
create policy identifier_service_mapping_access on public.external_object_mappings
  for all to service_role using (true) with check (true);

commit;
