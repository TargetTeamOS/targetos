-- Connected Email — Phase 4 ROLLBACK (idempotent). Drops the RPC and the
-- log table (which removes the claim lease columns with it).
drop function if exists claim_system_email(text, uuid, int);
drop table if exists system_email_log cascade;
select 'phase4 rollback complete' as status;
