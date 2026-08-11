-- Read-only parity and exception checks after 003_core_record_ids.sql.
select 'contacts.status' as field, count(*) as unmapped_rows from public.contacts where status is not null and status_id is null
union all select 'deals.stage', count(*) from public.deals where stage is not null and stage_id is null
union all select 'listings.status', count(*) from public.listings where status is not null and status_id is null
union all select 'tasks.status', count(*) from public.tasks where status is not null and status_id is null
union all select 'tasks.priority', count(*) from public.tasks where priority is not null and priority <> 'note' and priority_id is null
union all select 'offers.status', count(*) from public.offers where status is not null and status_id is null
union all select 'tc_deals.tc_phase', count(*) from public.tc_deals where tc_phase is not null and phase_id is null
union all select 'agents.role', count(*) from public.agents where role is not null and role_id is null
order by field;

select record_table, legacy_field, legacy_value, count(*) as affected_rows
from public.identifier_backfill_exceptions
where not reviewed
group by record_table, legacy_field, legacy_value
order by record_table, legacy_field, legacy_value;

select 'contacts.status' as field, count(*) as mismatch_count
from public.contacts c where c.status_id is distinct from public.resolve_workflow_state_id('contact.lifecycle', c.status)
union all select 'deals.stage', count(*) from public.deals d where d.stage_id is distinct from public.resolve_workflow_state_id('deal.lifecycle', d.stage)
union all select 'listings.status', count(*) from public.listings l where l.status_id is distinct from public.resolve_workflow_state_id('listing.lifecycle', l.status)
union all select 'tasks.status', count(*) from public.tasks t where t.status_id is distinct from public.resolve_workflow_state_id('task.lifecycle', t.status)
union all select 'offers.status', count(*) from public.offers o where o.status_id is distinct from public.resolve_workflow_state_id('offer.lifecycle', o.status)
union all select 'tc_deals.tc_phase', count(*) from public.tc_deals t where t.phase_id is distinct from public.resolve_workflow_state_id('tc.phase', t.tc_phase)
order by field;
