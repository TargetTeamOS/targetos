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
  select count(*) into n from pg_proc where proname = 'claim_system_email';
  if n < 1 then raise exception 'claim_system_email RPC missing'; end if;
end $$;
select 'phase4 verify passed' as status;
