-- Run after 002_catalog_seed.generated.sql. Read-only.
select
  (select count(*) from public.workflow_definitions where organization_id is null) as workflow_count,
  (select count(*) from public.workflow_states s join public.workflow_definitions w on w.id = s.workflow_id where w.organization_id is null) as workflow_state_count,
  (select count(*) from public.workflow_state_aliases) as workflow_alias_count,
  (select count(*) from public.choice_sets where organization_id is null) as choice_set_count,
  (select count(*) from public.choice_options) as choice_option_count,
  (select count(*) from public.role_definitions where organization_id is null) as role_count,
  (select count(*) from public.board_definitions where organization_id is null) as board_count;

select
  public.resolve_workflow_state_id('deal.lifecycle', 'Offer Accapted')
    = public.resolve_workflow_state_id('deal.lifecycle', 'Offer Accepted') as legacy_spelling_resolves_identically,
  public.resolve_workflow_state_id('task.lifecycle', 'done')
    = public.resolve_workflow_state_id('task.lifecycle', 'completed') as task_completion_alias_resolves_identically,
  public.resolve_workflow_state_id('task.lifecycle', 'cancelled')
    = public.resolve_workflow_state_id('task.lifecycle', 'canceled') as task_cancellation_alias_resolves_identically;

select w.code as workflow_code, s.code as state_code, count(*) as alias_matches
from public.workflow_definitions w
join public.workflow_states s on s.workflow_id = w.id
join public.workflow_state_aliases a on a.workflow_state_id = s.id
group by w.code, s.code, lower(btrim(a.alias))
having count(*) > 1;
