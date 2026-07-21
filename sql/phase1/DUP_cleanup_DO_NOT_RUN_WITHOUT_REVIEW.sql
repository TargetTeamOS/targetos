-- ══════════════════════════════════════════════════════════════════
-- DUPLICATE CLEANUP — MIGRATION  ⛔ DO NOT RUN WITHOUT REVIEWING PREVIEW
-- Non-destructive: marks dups via is_duplicate + duplicate_of instead of
-- deleting, so it is fully reversible and preserves an audit trail.
-- Requires Migration A (adds is_duplicate/duplicate_of columns).
-- Only touches rows that HAVE a confirmed official twin (P3 must be empty).
-- ══════════════════════════════════════════════════════════════════

-- Backup the affected rows first
create table if not exists _backup_dupe_deals_20260721 as
  select * from deals where stage='Closed' and coalesce(deal_status,'')='';

-- Mark (not delete) — link each dup to its official twin
update deals dup
set is_duplicate = true,
    duplicate_of = (
      select off.id from deals off
      where off.stage='Closed' and off.deal_status='Closed'
        and coalesce(off.addr,'')=coalesce(dup.addr,'')
        and coalesce(off.unit,'')=coalesce(dup.unit,'')
        and off.close_date is not distinct from dup.close_date
        and off.production is not distinct from dup.production
        and off.gci is not distinct from dup.gci
      limit 1)
where dup.stage='Closed' and coalesce(dup.deal_status,'')=''
  and exists (
    select 1 from deals off
    where off.stage='Closed' and off.deal_status='Closed'
      and coalesce(off.addr,'')=coalesce(dup.addr,'')
      and coalesce(off.unit,'')=coalesce(dup.unit,'')
      and off.close_date is not distinct from dup.close_date
      and off.production is not distinct from dup.production
      and off.gci is not distinct from dup.gci);

-- After: official closed count (should read 89, dups now excluded by canonical view)
select count(*) as official_closed from v_deals_canonical where is_closed_official;
select count(*) as marked_duplicate from deals where is_duplicate;
