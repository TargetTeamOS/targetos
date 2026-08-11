-- Read-only verification for 001_registry.sql.
select
  to_regclass('public.workflow_definitions') is not null as workflow_definitions_exists,
  to_regclass('public.workflow_states') is not null as workflow_states_exists,
  to_regclass('public.workflow_state_aliases') is not null as workflow_aliases_exists,
  to_regclass('public.choice_sets') is not null as choice_sets_exists,
  to_regclass('public.choice_options') is not null as choice_options_exists,
  to_regclass('public.role_definitions') is not null as role_definitions_exists,
  to_regclass('public.permission_definitions') is not null as permission_definitions_exists,
  to_regclass('public.board_definitions') is not null as board_definitions_exists,
  to_regclass('public.external_object_mappings') is not null as external_mappings_exists,
  to_regclass('public.definition_change_audit') is not null as definition_audit_exists;

select scope_code, version > 0 as valid_version
from public.definition_catalog_versions
order by scope_code;

select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'workflow_definitions', 'workflow_states', 'workflow_state_aliases',
    'choice_sets', 'choice_options', 'role_definitions', 'permission_definitions',
    'board_definitions', 'external_object_mappings', 'definition_change_audit'
  )
order by tablename;

select
  to_regprocedure('public.resolve_workflow_state_id(text,text,uuid)') is not null as workflow_resolver_exists,
  to_regprocedure('public.resolve_choice_option_id(text,text,uuid)') is not null as choice_resolver_exists,
  to_regprocedure('public.prevent_identifier_code_change()') is not null as immutable_code_guard_exists;
