-- Connected Email — Phase 4 VERIFICATION (run as service role)
do $$
declare n int;
begin
  select count(*) into n from pg_class where relname = 'system_email_log' and relrowsecurity;
  if n <> 1 then raise exception 'system_email_log missing or RLS not enabled'; end if;
  select count(*) into n from pg_indexes where tablename = 'system_email_log' and indexdef ilike '%idempotency_key%';
  if n < 1 then raise exception 'system_email_log idempotency_key unique index missing'; end if;
  select count(*) into n from pg_policies where tablename = 'system_email_log';
  if n <> 1 then raise exception 'expected exactly 1 select policy on system_email_log, found %', n; end if;
  select count(*) into n from information_schema.columns
   where table_name = 'system_email_log' and column_name in ('claim_token','claim_until');
  if n <> 2 then raise exception 'expected claim_token + claim_until columns, found %', n; end if;

  -- exact function signature: public.claim_system_email(text, uuid, integer)
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'claim_system_email'
     and pg_get_function_identity_arguments(p.oid) = 'p_key text, p_token uuid, p_ttl_seconds integer';
  if n <> 1 then raise exception 'claim_system_email(text,uuid,integer) not found with the exact signature'; end if;

  -- service_role must have EXECUTE; anon/authenticated must NOT
  if not has_function_privilege('service_role', 'public.claim_system_email(text, uuid, integer)', 'EXECUTE') then
    raise exception 'service_role is missing EXECUTE on claim_system_email';
  end if;
  if has_function_privilege('anon', 'public.claim_system_email(text, uuid, integer)', 'EXECUTE') then
    raise exception 'anon must NOT have EXECUTE on claim_system_email';
  end if;
  if has_function_privilege('authenticated', 'public.claim_system_email(text, uuid, integer)', 'EXECUTE') then
    raise exception 'authenticated must NOT have EXECUTE on claim_system_email';
  end if;
end $$;
select 'phase4 verify passed' as status;
