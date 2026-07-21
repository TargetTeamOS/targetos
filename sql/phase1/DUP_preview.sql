-- ══════════════════════════════════════════════════════════════════
-- DUPLICATE CLEANUP — PREVIEW ONLY (read-only, changes nothing)
-- Verified: 45 rows stage='Closed', deal_status blank, created ~Jul 1,
-- duplicating 89 official rows (deal_status='Closed', created ~Jul 8)
-- on address/unit/close_date/production/gci. Confirm before any action.
-- ══════════════════════════════════════════════════════════════════

-- P1. The suspected 45 (blank deal_status closed rows)
select id, addr, unit, close_date, production, gci, created_at
from deals
where stage='Closed' and coalesce(deal_status,'')=''
order by close_date, addr;

-- P2. Confirm each suspected dup HAS an official twin (should match count ~45)
select count(*) as dups_with_official_twin
from deals dup
where dup.stage='Closed' and coalesce(dup.deal_status,'')=''
  and exists (
    select 1 from deals off
    where off.stage='Closed' and off.deal_status='Closed'
      and coalesce(off.addr,'')=coalesce(dup.addr,'')
      and coalesce(off.unit,'')=coalesce(dup.unit,'')
      and off.close_date is not distinct from dup.close_date
      and off.production is not distinct from dup.production
      and off.gci is not distinct from dup.gci);

-- P3. Any suspected dup WITHOUT a twin (would be unsafe to delete — review!)
select dup.id, dup.addr, dup.unit, dup.close_date
from deals dup
where dup.stage='Closed' and coalesce(dup.deal_status,'')=''
  and not exists (
    select 1 from deals off
    where off.stage='Closed' and off.deal_status='Closed'
      and coalesce(off.addr,'')=coalesce(dup.addr,'')
      and coalesce(off.unit,'')=coalesce(dup.unit,'')
      and off.close_date is not distinct from dup.close_date
      and off.production is not distinct from dup.production
      and off.gci is not distinct from dup.gci);

-- P4. Dependency check — are any suspected dups referenced elsewhere?
select 'offers' as tbl, count(*) from offers where listing_id in (select listing_id from deals where stage='Closed' and coalesce(deal_status,'')='')
union all
select 'tasks', count(*) from tasks where deal_id in (select id from deals where stage='Closed' and coalesce(deal_status,'')='');
