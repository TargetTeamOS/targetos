-- Additive core record identifiers and compatibility dual-write triggers.
-- Prerequisites: reviewed 000 census, then 001 and 002.

begin;

create table if not exists public.identifier_backfill_exceptions (
  id uuid primary key default gen_random_uuid(),
  record_table text not null,
  record_id uuid not null,
  legacy_field text not null,
  legacy_value text null,
  reason_code text not null,
  reviewed boolean not null default false,
  resolution_notes text null,
  created_at timestamptz not null default now(),
  unique(record_table, record_id, legacy_field)
);
alter table public.identifier_backfill_exceptions enable row level security;
drop policy if exists identifier_admin_exception_access on public.identifier_backfill_exceptions;
create policy identifier_admin_exception_access on public.identifier_backfill_exceptions
  for all to authenticated
  using (public.app_current_agent_role() = 'admin')
  with check (public.app_current_agent_role() = 'admin');

alter table if exists public.contacts add column if not exists status_id uuid references public.workflow_states(id) on delete restrict;
alter table if exists public.deals add column if not exists stage_id uuid references public.workflow_states(id) on delete restrict;
alter table if exists public.listings add column if not exists status_id uuid references public.workflow_states(id) on delete restrict;
alter table if exists public.tasks add column if not exists status_id uuid references public.workflow_states(id) on delete restrict;
alter table if exists public.tasks add column if not exists priority_id uuid references public.choice_options(id) on delete restrict;
alter table if exists public.offers add column if not exists status_id uuid references public.workflow_states(id) on delete restrict;
alter table if exists public.tc_deals add column if not exists phase_id uuid references public.workflow_states(id) on delete restrict;
alter table if exists public.agents add column if not exists role_id uuid references public.role_definitions(id) on delete restrict;

update public.contacts set status_id = public.resolve_workflow_state_id('contact.lifecycle', status)
where status is not null and status_id is null and public.resolve_workflow_state_id('contact.lifecycle', status) is not null;
update public.deals set stage_id = public.resolve_workflow_state_id('deal.lifecycle', stage)
where stage is not null and stage_id is null and public.resolve_workflow_state_id('deal.lifecycle', stage) is not null;
update public.listings set status_id = public.resolve_workflow_state_id('listing.lifecycle', status)
where status is not null and status_id is null and public.resolve_workflow_state_id('listing.lifecycle', status) is not null;
update public.tasks set status_id = public.resolve_workflow_state_id('task.lifecycle', status)
where status is not null and status_id is null and public.resolve_workflow_state_id('task.lifecycle', status) is not null;
update public.tasks set priority_id = public.resolve_choice_option_id('task.priority', priority)
where priority is not null and priority <> 'note' and priority_id is null and public.resolve_choice_option_id('task.priority', priority) is not null;
update public.offers set status_id = public.resolve_workflow_state_id('offer.lifecycle', status)
where status is not null and status_id is null and public.resolve_workflow_state_id('offer.lifecycle', status) is not null;
update public.tc_deals set phase_id = public.resolve_workflow_state_id('tc.phase', tc_phase)
where tc_phase is not null and phase_id is null and public.resolve_workflow_state_id('tc.phase', tc_phase) is not null;
update public.agents a set role_id = r.id
from public.role_definitions r
where r.organization_id is null and r.code = lower(btrim(a.role)) and a.role_id is null;

insert into public.identifier_backfill_exceptions(record_table, record_id, legacy_field, legacy_value, reason_code)
select 'contacts', id, 'status', status, 'unmapped_value' from public.contacts where status is not null and status_id is null
on conflict (record_table, record_id, legacy_field) do nothing;
insert into public.identifier_backfill_exceptions(record_table, record_id, legacy_field, legacy_value, reason_code)
select 'deals', id, 'stage', stage, 'unmapped_value' from public.deals where stage is not null and stage_id is null
on conflict (record_table, record_id, legacy_field) do nothing;
insert into public.identifier_backfill_exceptions(record_table, record_id, legacy_field, legacy_value, reason_code)
select 'listings', id, 'status', status, 'unmapped_value' from public.listings where status is not null and status_id is null
on conflict (record_table, record_id, legacy_field) do nothing;
insert into public.identifier_backfill_exceptions(record_table, record_id, legacy_field, legacy_value, reason_code)
select 'tasks', id, 'status', status, 'unmapped_value' from public.tasks where status is not null and status_id is null
on conflict (record_table, record_id, legacy_field) do nothing;
insert into public.identifier_backfill_exceptions(record_table, record_id, legacy_field, legacy_value, reason_code)
select 'tasks', id, 'priority', priority, 'unmapped_value' from public.tasks where priority is not null and priority <> 'note' and priority_id is null
on conflict (record_table, record_id, legacy_field) do nothing;
insert into public.identifier_backfill_exceptions(record_table, record_id, legacy_field, legacy_value, reason_code)
select 'offers', id, 'status', status, 'unmapped_value' from public.offers where status is not null and status_id is null
on conflict (record_table, record_id, legacy_field) do nothing;
insert into public.identifier_backfill_exceptions(record_table, record_id, legacy_field, legacy_value, reason_code)
select 'tc_deals', id, 'tc_phase', tc_phase, 'unmapped_value' from public.tc_deals where tc_phase is not null and phase_id is null
on conflict (record_table, record_id, legacy_field) do nothing;
insert into public.identifier_backfill_exceptions(record_table, record_id, legacy_field, legacy_value, reason_code)
select 'agents', id, 'role', role, 'unmapped_value' from public.agents where role is not null and role_id is null
on conflict (record_table, record_id, legacy_field) do nothing;

create or replace function public.sync_workflow_identifier_columns()
returns trigger language plpgsql set search_path = public as $$
declare
  legacy_value text := to_jsonb(new) ->> tg_argv[0];
  supplied_id uuid := nullif(to_jsonb(new) ->> tg_argv[1], '')::uuid;
  resolved_id uuid;
  storage_value text;
begin
  if supplied_id is not null then
    select s.legacy_storage_value into storage_value
    from public.workflow_states s
    join public.workflow_definitions w on w.id = s.workflow_id
    where s.id = supplied_id and s.active and w.active and w.code = tg_argv[2];
    if storage_value is null then raise exception 'invalid state identifier for %', tg_argv[2]; end if;
    if legacy_value is null then
      new := jsonb_populate_record(new, jsonb_build_object(tg_argv[0], storage_value));
    else
      resolved_id := public.resolve_workflow_state_id(tg_argv[2], legacy_value);
      if resolved_id is distinct from supplied_id then raise exception 'state identifier and legacy value disagree'; end if;
    end if;
  elsif legacy_value is not null then
    resolved_id := public.resolve_workflow_state_id(tg_argv[2], legacy_value);
    if resolved_id is null then raise exception 'unregistered workflow value for %', tg_argv[2]; end if;
    new := jsonb_populate_record(new, jsonb_build_object(tg_argv[1], resolved_id));
  end if;
  return new;
end;
$$;

create or replace function public.sync_choice_identifier_columns()
returns trigger language plpgsql set search_path = public as $$
declare
  legacy_value text := to_jsonb(new) ->> tg_argv[0];
  supplied_id uuid := nullif(to_jsonb(new) ->> tg_argv[1], '')::uuid;
  resolved_id uuid;
  storage_value text;
begin
  if supplied_id is not null then
    select o.legacy_storage_value into storage_value
    from public.choice_options o join public.choice_sets c on c.id = o.choice_set_id
    where o.id = supplied_id and o.active and c.active and c.code = tg_argv[2];
    if storage_value is null then raise exception 'invalid choice identifier for %', tg_argv[2]; end if;
    if legacy_value is null then
      new := jsonb_populate_record(new, jsonb_build_object(tg_argv[0], storage_value));
    else
      resolved_id := public.resolve_choice_option_id(tg_argv[2], legacy_value);
      if resolved_id is distinct from supplied_id then raise exception 'choice identifier and legacy value disagree'; end if;
    end if;
  elsif legacy_value is not null and legacy_value <> 'note' then
    resolved_id := public.resolve_choice_option_id(tg_argv[2], legacy_value);
    if resolved_id is null then raise exception 'unregistered choice value for %', tg_argv[2]; end if;
    new := jsonb_populate_record(new, jsonb_build_object(tg_argv[1], resolved_id));
  end if;
  return new;
end;
$$;

do $$
begin
  drop trigger if exists contacts_status_identifier_sync on public.contacts;
  create trigger contacts_status_identifier_sync before insert or update of status, status_id on public.contacts
    for each row execute function public.sync_workflow_identifier_columns('status', 'status_id', 'contact.lifecycle');
  drop trigger if exists deals_stage_identifier_sync on public.deals;
  create trigger deals_stage_identifier_sync before insert or update of stage, stage_id on public.deals
    for each row execute function public.sync_workflow_identifier_columns('stage', 'stage_id', 'deal.lifecycle');
  drop trigger if exists listings_status_identifier_sync on public.listings;
  create trigger listings_status_identifier_sync before insert or update of status, status_id on public.listings
    for each row execute function public.sync_workflow_identifier_columns('status', 'status_id', 'listing.lifecycle');
  drop trigger if exists tasks_status_identifier_sync on public.tasks;
  create trigger tasks_status_identifier_sync before insert or update of status, status_id on public.tasks
    for each row execute function public.sync_workflow_identifier_columns('status', 'status_id', 'task.lifecycle');
  drop trigger if exists tasks_priority_identifier_sync on public.tasks;
  create trigger tasks_priority_identifier_sync before insert or update of priority, priority_id on public.tasks
    for each row execute function public.sync_choice_identifier_columns('priority', 'priority_id', 'task.priority');
  drop trigger if exists offers_status_identifier_sync on public.offers;
  create trigger offers_status_identifier_sync before insert or update of status, status_id on public.offers
    for each row execute function public.sync_workflow_identifier_columns('status', 'status_id', 'offer.lifecycle');
  drop trigger if exists tc_phase_identifier_sync on public.tc_deals;
  create trigger tc_phase_identifier_sync before insert or update of tc_phase, phase_id on public.tc_deals
    for each row execute function public.sync_workflow_identifier_columns('tc_phase', 'phase_id', 'tc.phase');
end $$;

commit;

