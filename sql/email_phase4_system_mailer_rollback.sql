-- Connected Email — Phase 4 ROLLBACK (idempotent). Drops only the log table.
drop table if exists system_email_log cascade;
select 'phase4 rollback complete' as status;
