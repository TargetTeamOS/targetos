-- Additive stable identifiers for secondary CRM workflows.
-- REVIEW ONLY: do not execute until 000-004 have passed and backups are confirmed.

begin;

do $$
declare
  item record;
  resolver text;
  sync_function text;
  trigger_name text;
begin
  for item in
    select * from (values
      ('deals','ctc','ctc_id','deal.ctc','workflow'),
      ('deals','deal_status','deal_status_id','deal.progress','workflow'),
      ('deals','command','command_status_id','command.lifecycle','workflow'),
      ('deals','commission_status','commission_status_id','commission.collection','workflow'),
      ('gifts','status','status_id','gift.lifecycle','workflow'),
      ('gifts','closing_gift_status','closing_gift_status_id','gift.closing','workflow'),
      ('gifts','label','recipient_type_id','gift.recipient_type','choice'),
      ('signs','order_status','order_status_id','sign.lifecycle','workflow'),
      ('calls','outcome','outcome_id','call.outcome','workflow'),
      ('calls','direction','direction_id','call.direction','choice'),
      ('tc_photography','status','status_id','photography.lifecycle','workflow'),
      ('email_campaigns','status','status_id','campaign.lifecycle','workflow'),
      ('integrations','status','status_id','connector.lifecycle','workflow'),
      ('integration_accounts','status','status_id','connector.lifecycle','workflow')
    ) as v(table_name, legacy_field, id_field, definition_code, definition_kind)
  loop
    if to_regclass(format('public.%I', item.table_name)) is null then
      raise notice 'Skipping absent table public.%', item.table_name;
      continue;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name=item.table_name and column_name=item.legacy_field
    ) then
      raise notice 'Skipping public.%.% because the legacy column is absent', item.table_name, item.legacy_field;
      continue;
    end if;

    if item.definition_kind = 'choice' then
      execute format('alter table public.%I add column if not exists %I uuid references public.choice_options(id) on delete restrict', item.table_name, item.id_field);
      resolver := 'resolve_choice_option_id';
      sync_function := 'sync_choice_identifier_columns';
    else
      execute format('alter table public.%I add column if not exists %I uuid references public.workflow_states(id) on delete restrict', item.table_name, item.id_field);
      resolver := 'resolve_workflow_state_id';
      sync_function := 'sync_workflow_identifier_columns';
    end if;

    execute format(
      'update public.%I set %I = public.%I(%L, %I) where %I is not null and %I is null and public.%I(%L, %I) is not null',
      item.table_name, item.id_field, resolver, item.definition_code, item.legacy_field,
      item.legacy_field, item.id_field, resolver, item.definition_code, item.legacy_field
    );

    execute format(
      'insert into public.identifier_backfill_exceptions(record_table,record_id,legacy_field,legacy_value,reason_code) select %L,id,%L,%I,''unmapped_value'' from public.%I where %I is not null and %I is null on conflict (record_table,record_id,legacy_field) do nothing',
      item.table_name, item.legacy_field, item.legacy_field, item.table_name,
      item.legacy_field, item.id_field
    );

    trigger_name := item.table_name || '_' || item.legacy_field || '_identifier_sync';
    execute format('drop trigger if exists %I on public.%I', trigger_name, item.table_name);
    execute format(
      'create trigger %I before insert or update of %I,%I on public.%I for each row execute function public.%I(%L,%L,%L)',
      trigger_name, item.legacy_field, item.id_field, item.table_name, sync_function,
      item.legacy_field, item.id_field, item.definition_code
    );
  end loop;
end $$;

commit;
