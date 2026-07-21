-- DUPLICATE CLEANUP — ROLLBACK. Un-marks the duplicates.
update deals set is_duplicate=false, duplicate_of=null
where id in (select id from _backup_dupe_deals_20260721);
select 'duplicate marking reversed' as status;
-- drop table if exists _backup_dupe_deals_20260721;  -- optional, after confidence
