-- Read-only verification for Phase 2 connector prerequisites.
select to_regclass('public.integrations') is not null as integrations_exists;
select to_regclass('public.integration_accounts') is not null as integration_accounts_exists;
select to_regclass('public.integration_events') is not null as integration_events_exists;
select id, name, status from public.integrations where id in ('google', 'outlook') order by id;
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename in ('integrations', 'integration_accounts', 'integration_events')
order by tablename, policyname;
