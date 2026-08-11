-- Read-only verification for Phase 2 access migration.
select to_regclass('public.agent_permission_grants') is not null as grant_table_exists;
select to_regprocedure('public.app_contact_directory(text,text,text,uuid,integer,integer)') is not null as directory_rpc_exists;
select to_regprocedure('public.app_has_permission(text)') is not null as permission_rpc_exists;
select to_regprocedure('public.app_calls_list(integer)') is not null as calls_rpc_exists;
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename in ('contacts', 'calls', 'agent_permission_grants', 'announcements', 'briefing_prefs', 'briefing_quotes', 'briefing_sends')
order by tablename, policyname;
