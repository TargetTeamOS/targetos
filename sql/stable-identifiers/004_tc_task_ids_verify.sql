-- Read-only verification for 004_tc_task_ids.sql.

select count(*) as unresolved_tc_task_statuses
from public.tc_tasks
where status is not null and status_id is null;

select count(*) as unresolved_tc_task_priorities
from public.tc_tasks
where priority is not null and priority_id is null;

select t.status, s.code, count(*) as records
from public.tc_tasks t
left join public.workflow_states s on s.id = t.status_id
group by t.status, s.code
order by t.status, s.code;

select t.priority, o.code, count(*) as records
from public.tc_tasks t
left join public.choice_options o on o.id = t.priority_id
group by t.priority, o.code
order by t.priority, o.code;
