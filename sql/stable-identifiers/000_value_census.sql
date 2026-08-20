-- Read-only pre-migration census. Run and retain the result before applying 001/002.
select 'contacts.status' as field, status as legacy_value, count(*) as row_count
from public.contacts group by status
union all
select 'deals.stage', stage, count(*) from public.deals group by stage
union all
select 'listings.status', status, count(*) from public.listings group by status
union all
select 'tasks.status', status, count(*) from public.tasks group by status
union all
select 'tasks.priority', priority, count(*) from public.tasks group by priority
union all
select 'offers.status', status, count(*) from public.offers group by status
union all
select 'tc_deals.tc_phase', tc_phase, count(*) from public.tc_deals group by tc_phase
union all
select 'agents.role', role, count(*) from public.agents group by role
order by field, legacy_value nulls first;

