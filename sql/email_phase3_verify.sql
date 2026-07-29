-- ═══════════════════════════════════════════════════════════════
-- Connected Email — Phase 3 VERIFICATION (run as service role)
-- Asserts all four Phase 3 columns exist on email_sync_state with the
-- expected types. A clean run (no exception) = pass.
-- ═══════════════════════════════════════════════════════════════

do $$
declare n int;
begin
  select count(*) into n
    from information_schema.columns
   where table_name = 'email_sync_state'
     and column_name in ('last_error_code', 'last_error_at', 'sync_lock_token', 'sync_lock_until');
  if n <> 4 then raise exception 'expected 4 Phase 3 columns on email_sync_state, found %', n; end if;
end $$;

-- Type spot-check: sync_lock_token must be uuid, sync_lock_until timestamptz.
do $$
declare t text;
begin
  select data_type into t from information_schema.columns
   where table_name = 'email_sync_state' and column_name = 'sync_lock_token';
  if t <> 'uuid' then raise exception 'sync_lock_token must be uuid, found %', t; end if;
  select data_type into t from information_schema.columns
   where table_name = 'email_sync_state' and column_name = 'sync_lock_until';
  if t not like 'timestamp%' then raise exception 'sync_lock_until must be timestamptz, found %', t; end if;
end $$;

select 'phase3 verify passed' as status;
