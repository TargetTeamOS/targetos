-- Read-only verification for 005_secondary_record_ids.sql.
-- Returns one row per configured table/field that exists in this environment.

with configured(table_name, legacy_field, id_field) as (values
  ('deals','ctc','ctc_id'),
  ('deals','deal_status','deal_status_id'),
  ('deals','command','command_status_id'),
  ('deals','commission_status','commission_status_id'),
  ('gifts','status','status_id'),
  ('gifts','closing_gift_status','closing_gift_status_id'),
  ('gifts','label','recipient_type_id'),
  ('signs','order_status','order_status_id'),
  ('calls','outcome','outcome_id'),
  ('calls','direction','direction_id'),
  ('tc_photography','status','status_id'),
  ('email_campaigns','status','status_id'),
  ('integrations','status','status_id'),
  ('integration_accounts','status','status_id')
)
select c.*,
  to_regclass(format('public.%I', c.table_name)) is not null as table_exists,
  exists(select 1 from information_schema.columns x where x.table_schema='public' and x.table_name=c.table_name and x.column_name=c.legacy_field) as legacy_column_exists,
  exists(select 1 from information_schema.columns x where x.table_schema='public' and x.table_name=c.table_name and x.column_name=c.id_field) as identifier_column_exists
from configured c
order by c.table_name, c.legacy_field;

select record_table, legacy_field, reason_code, count(*) as exception_count
from public.identifier_backfill_exceptions
where record_table in ('deals','gifts','signs','calls','tc_photography','email_campaigns','integrations','integration_accounts')
group by record_table, legacy_field, reason_code
order by record_table, legacy_field, reason_code;
