-- Connected Email — Phase 4 ROLLBACK (idempotent). Drops the RPC and the
-- log table (which removes the claim lease columns with it).
drop function if exists public.claim_system_email(text, uuid, integer);
drop table if exists public.system_email_log cascade;
select 'phase4 rollback complete' as status;
