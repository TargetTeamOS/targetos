-- ═══════════════════════════════════════════════════════════════
-- Connected Email — Phase 2 RLS / migration STRUCTURAL TESTS
-- Run in Supabase (SQL editor / CI) AFTER email_phase2_schema.sql. Each
-- block raises an exception if an invariant is violated, so a clean run =
-- pass. These assert structure/policy/grant wiring; behavioural
-- per-role checks should also be exercised with a normal-agent JWT in
-- preview (see APPLY doc).
-- ═══════════════════════════════════════════════════════════════

-- 1. All six tables exist and have RLS enabled.
do $$
declare n int;
begin
  select count(*) into n from pg_class
   where relname in ('email_connections','email_sync_state','email_threads',
                     'email_messages','email_delivery_events','system_email_configuration')
     and relrowsecurity;
  if n <> 6 then raise exception 'expected 6 RLS-enabled tables, found %', n; end if;
end $$;

-- 2. Token columns are NOT granted to the authenticated role.
do $$
declare n int;
begin
  select count(*) into n from information_schema.role_column_grants
   where table_name = 'email_connections' and grantee = 'authenticated'
     and column_name in ('encrypted_access_token','encrypted_refresh_token');
  if n <> 0 then raise exception 'token columns are exposed to authenticated (% grants)', n; end if;
end $$;

-- 3. Metadata columns ARE granted to authenticated (sanity: connection is usable).
do $$
declare n int;
begin
  select count(*) into n from information_schema.role_column_grants
   where table_name = 'email_connections' and grantee = 'authenticated'
     and column_name in ('email_address','status','is_primary');
  if n < 3 then raise exception 'expected metadata columns granted to authenticated, found %', n; end if;
end $$;

-- 4. email_sync_state has NO policies (server-only).
do $$
declare n int;
begin
  select count(*) into n from pg_policies where tablename = 'email_sync_state';
  if n <> 0 then raise exception 'email_sync_state must have no policies, found %', n; end if;
end $$;

-- 5. The one-primary-per-user partial unique index exists.
do $$
declare n int;
begin
  select count(*) into n from pg_indexes
   where tablename = 'email_connections' and indexname = 'uq_email_conn_one_primary';
  if n <> 1 then raise exception 'missing one-primary-per-user unique index'; end if;
end $$;

-- 6. Idempotency unique index on provider message id exists.
do $$
declare n int;
begin
  select count(*) into n from pg_indexes
   where tablename = 'email_messages' and indexname = 'uq_msg_provider_msg';
  if n <> 1 then raise exception 'missing unique index on (connection_id, provider_message_id)'; end if;
end $$;

select 'phase2 structural RLS tests passed' as status;
