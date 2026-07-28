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
end $$;
select 'phase4 verify passed' as status;
