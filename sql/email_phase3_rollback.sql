-- ═══════════════════════════════════════════════════════════════
-- Connected Email — Phase 3 ROLLBACK (idempotent)
-- Removes ONLY the four Phase 3 columns added to email_sync_state. All
-- Phase 2 structure and data are left intact.
-- ═══════════════════════════════════════════════════════════════

drop index if exists idx_sync_lock_until;

alter table email_sync_state drop column if exists sync_lock_until;
alter table email_sync_state drop column if exists sync_lock_token;
alter table email_sync_state drop column if exists last_error_at;
alter table email_sync_state drop column if exists last_error_code;

select 'phase3 rollback complete' as status;
