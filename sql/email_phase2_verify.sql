-- ═══════════════════════════════════════════════════════════════
-- Connected Email — Phase 2 VERIFICATION (run as service role, read-only)
-- Confirms the staged backfill landed correctly. Decryptability itself is
-- checked by the Node backfill in --verify mode (it round-trips a sample);
-- SQL below covers counts, invariants, and the no-plaintext guarantee.
-- ═══════════════════════════════════════════════════════════════

-- 1. Row counts: every connected legacy account should have a connection.
select
  (select count(*) from integration_accounts where status = 'connected') as legacy_connected,
  (select count(*) from email_connections)                                as connections_total,
  (select count(*) from email_connections where status = 'active')        as connections_active;

-- 2. One-primary-per-user invariant (must return ZERO rows).
select crm_user_id, count(*) as primaries
from email_connections
where is_primary
group by crm_user_id
having count(*) > 1;

-- 3. Tokens must be stored ENCRYPTED (enc:v... envelope) or NULL — never
--    plaintext. This must return ZERO rows.
select id, provider, email_address
from email_connections
where (encrypted_access_token  is not null and encrypted_access_token  not like 'enc:v%')
   or (encrypted_refresh_token is not null and encrypted_refresh_token not like 'enc:v%');

-- 4. Every backfilled connection is traceable to its legacy source.
select count(*) as connections_without_source
from email_connections
where source_integration_account_id is null;

-- 5. Column-privilege check: the authenticated role must NOT have SELECT on
--    the encrypted token columns (must return ZERO rows).
select column_name
from information_schema.role_column_grants
where table_name = 'email_connections'
  and grantee = 'authenticated'
  and column_name in ('encrypted_access_token','encrypted_refresh_token');
