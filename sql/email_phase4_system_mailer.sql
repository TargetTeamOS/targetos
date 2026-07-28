-- ═══════════════════════════════════════════════════════════════
-- Connected Email — Phase 4: system mailbox delivery log (idempotent)
-- Records automated sends from the fixed Microsoft system mailbox. The
-- unique idempotency_key gives replay-safe, idempotent delivery. RLS:
-- admins may read (for the status indicator); writes are service-role only.
-- Rollback: email_phase4_system_mailer_rollback.sql
-- ═══════════════════════════════════════════════════════════════

create table if not exists system_email_log (
  id               uuid primary key default gen_random_uuid(),
  idempotency_key  text unique,
  provider         text not null default 'microsoft',
  to_address       text,
  subject          text,
  status           text not null default 'pending' check (status in ('pending','sent','error')),
  attempts         int  not null default 0,
  last_error_code  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_system_email_status on system_email_log (status);

alter table system_email_log enable row level security;

-- Admins may read the log (status indicator / troubleshooting). No secrets
-- are stored in this table. Writes happen only via the service role.
drop policy if exists system_email_log_select on system_email_log;
create policy system_email_log_select on system_email_log
for select to authenticated
using (public.current_agent_is_admin());

-- VERIFY (service role): table exists, is RLS-enabled, key is unique.
select
  (select count(*) from pg_class where relname = 'system_email_log' and relrowsecurity) as rls_on,
  (select count(*) from pg_indexes where tablename = 'system_email_log' and indexdef ilike '%idempotency_key%') as key_indexes;
