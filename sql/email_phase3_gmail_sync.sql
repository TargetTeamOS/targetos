-- ═══════════════════════════════════════════════════════════════
-- Connected Email — Phase 3: Gmail sync columns (idempotent)
-- Adds error/lock bookkeeping to email_sync_state. Uses a dedicated lock
-- token + expiry for concurrency control (NOT overloaded onto watch_status,
-- which continues to hold the real watch status: active/stopped/error/…).
-- Depends on Phase 2 (email_sync_state). Rollback: email_phase3_rollback.sql
-- ═══════════════════════════════════════════════════════════════

alter table email_sync_state add column if not exists last_error_code  text;
alter table email_sync_state add column if not exists last_error_at    timestamptz;
alter table email_sync_state add column if not exists sync_lock_token  uuid;
alter table email_sync_state add column if not exists sync_lock_until  timestamptz;

-- Helps the claim query find unlocked/expired locks quickly.
create index if not exists idx_sync_lock_until on email_sync_state (sync_lock_until);

-- VERIFY (as service role): the four Phase 3 columns exist.
select column_name
from information_schema.columns
where table_name = 'email_sync_state'
  and column_name in ('last_error_code', 'last_error_at', 'sync_lock_token', 'sync_lock_until')
order by column_name;
