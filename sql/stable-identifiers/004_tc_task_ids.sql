-- Additive stable identifiers for Transaction Coordinator tasks.
-- Prerequisites: the TC Board tables and stable-identifiers migrations 001-003.

begin;

alter table public.tc_tasks
  add column if not exists status_id uuid references public.workflow_states(id) on delete restrict;
alter table public.tc_tasks
  add column if not exists priority_id uuid references public.choice_options(id) on delete restrict;

update public.tc_tasks
set status_id = public.resolve_workflow_state_id('task.lifecycle', status)
where status is not null and status_id is null
  and public.resolve_workflow_state_id('task.lifecycle', status) is not null;

update public.tc_tasks
set priority_id = public.resolve_choice_option_id('task.priority', priority)
where priority is not null and priority_id is null
  and public.resolve_choice_option_id('task.priority', priority) is not null;

insert into public.identifier_backfill_exceptions(record_table, record_id, legacy_field, legacy_value, reason_code)
select 'tc_tasks', id, 'status', status, 'unmapped_value'
from public.tc_tasks where status is not null and status_id is null
on conflict (record_table, record_id, legacy_field) do nothing;

insert into public.identifier_backfill_exceptions(record_table, record_id, legacy_field, legacy_value, reason_code)
select 'tc_tasks', id, 'priority', priority, 'unmapped_value'
from public.tc_tasks where priority is not null and priority_id is null
on conflict (record_table, record_id, legacy_field) do nothing;

drop trigger if exists tc_tasks_status_identifier_sync on public.tc_tasks;
create trigger tc_tasks_status_identifier_sync
before insert or update of status, status_id on public.tc_tasks
for each row execute function public.sync_workflow_identifier_columns('status', 'status_id', 'task.lifecycle');

drop trigger if exists tc_tasks_priority_identifier_sync on public.tc_tasks;
create trigger tc_tasks_priority_identifier_sync
before insert or update of priority, priority_id on public.tc_tasks
for each row execute function public.sync_choice_identifier_columns('priority', 'priority_id', 'task.priority');

commit;
