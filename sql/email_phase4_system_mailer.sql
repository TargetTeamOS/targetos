-- ═══════════════════════════════════════════════════════════════
-- Connected Email — Phase 4: system mailbox delivery log (idempotent)
-- Records automated sends from the fixed Microsoft system mailbox. A unique
-- idempotency_key + an atomic claim lease (claim_token / claim_until) give
-- race-free, exactly-one-sender idempotency. RLS: admins may read (status
-- indicator); writes are service-role only. The claim is performed through
-- the claim_system_email() RPC so the check-and-set is a single atomic
-- database operation. Rollback: email_phase4_system_mailer_rollback.sql
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.system_email_log (
  id               uuid primary key default gen_random_uuid(),
  idempotency_key  text unique,
  provider         text not null default 'microsoft',
  to_address       text,
  subject          text,
  status           text not null default 'pending' check (status in ('pending','sent','error')),
  attempts         int  not null default 0,
  last_error_code  text,
  claim_token      uuid,
  claim_until      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
-- Idempotent add for tables created before the claim lease existed.
alter table public.system_email_log add column if not exists claim_token uuid;
alter table public.system_email_log add column if not exists claim_until timestamptz;

create index if not exists idx_system_email_status on public.system_email_log (status);

alter table public.system_email_log enable row level security;

-- Admins may read the log (status indicator). No secrets are stored here.
-- Writes happen only via the service role.
drop policy if exists system_email_log_select on public.system_email_log;
create policy system_email_log_select on public.system_email_log
for select to authenticated
using (public.current_agent_is_admin());

-- ───────────────────────────────────────────────────────────────
-- Atomic claim. Returns:
--   'claimed'      caller now holds the lease (only this caller may send)
--   'duplicate'    already delivered (status='sent') — do not send again
--   'in_progress'  another live claim holds the lease — do not send
-- A single INSERT..ON CONFLICT DO NOTHING decides the first claimant; an
-- existing row is inspected under a row lock so an expired lease can be
-- safely taken over.
--
-- SECURITY DEFINER with a PINNED search_path (pg_catalog, public) so a
-- caller cannot influence name resolution; all objects are schema-qualified.
-- EXECUTE is granted only to service_role (the backend); PUBLIC/anon/
-- authenticated are revoked.
-- ───────────────────────────────────────────────────────────────
create or replace function public.claim_system_email(p_key text, p_token uuid, p_ttl_seconds integer)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now  timestamptz := now();
  v_row  public.system_email_log%rowtype;
begin
  insert into public.system_email_log (idempotency_key, provider, status, attempts, claim_token, claim_until, updated_at)
  values (p_key, 'microsoft', 'pending', 0, p_token, v_now + make_interval(secs => p_ttl_seconds), v_now)
  on conflict (idempotency_key) do nothing;
  if found then
    return 'claimed';           -- we inserted the row -> first claimant
  end if;

  select * into v_row from public.system_email_log where idempotency_key = p_key for update;
  if v_row.status = 'sent' then
    return 'duplicate';
  end if;
  if v_row.claim_until is not null and v_row.claim_until > v_now then
    return 'in_progress';        -- a live lease is held by another worker
  end if;

  -- lease absent or expired -> take it over with a fresh token
  update public.system_email_log
     set claim_token = p_token,
         claim_until = v_now + make_interval(secs => p_ttl_seconds),
         status      = 'pending',
         updated_at  = v_now
   where idempotency_key = p_key;
  return 'claimed';
end $$;

-- Lock down execution to the backend service role only.
revoke all on function public.claim_system_email(text, uuid, integer) from public;
revoke all on function public.claim_system_email(text, uuid, integer) from anon;
revoke all on function public.claim_system_email(text, uuid, integer) from authenticated;
grant execute on function public.claim_system_email(text, uuid, integer) to service_role;

-- VERIFY (service role): table + claim columns + RPC exist.
select
  (select count(*) from pg_class where relname = 'system_email_log' and relrowsecurity) as rls_on,
  (select count(*) from information_schema.columns where table_name = 'system_email_log' and column_name in ('claim_token','claim_until')) as claim_cols,
  (select count(*) from pg_proc where proname = 'claim_system_email') as claim_rpc;
