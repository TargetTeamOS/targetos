# Stable-Identifier Migrations

These migrations are additive. They do not deploy the application, enable external
effects, delete records, or rewrite legacy workflow text. The reviewed backfill
migrations do populate newly added identifier columns on existing records.

## Required order

1. Confirm database and Storage backups.
2. Run `000_value_census.sql` and retain its read-only results.
3. Compare every observed value with `shared/identifierCatalog.json`. Add explicit
   aliases or approved exceptions; never guess.
4. Run `001_registry.sql`.
5. Run `001_registry_verify.sql`.
6. Run `002_catalog_seed.generated.sql`.
7. Run `002_catalog_seed_verify.sql`.
8. Run `003_core_record_ids.sql` only after reviewing its backfill scope.
9. Run `003_core_record_ids_verify.sql` and resolve every exception.
10. Run `004_tc_task_ids.sql` only after confirming the TC Board tables exist.
11. Run `004_tc_task_ids_verify.sql` and resolve every exception.
12. Review the environment-aware table/column skips in `005_secondary_record_ids.sql`.
13. Run `005_secondary_record_ids.sql` only after the secondary-workflow census is approved.
14. Run `005_secondary_record_ids_verify.sql`; investigate every skipped field and exception.

`002_catalog_seed.generated.sql` is produced by `npm run identifiers:generate` and
must pass `npm run identifiers:check`. Existing definition labels and semantic flags
are intentionally not overwritten when the seed is rerun.

## Recovery

The registry is not coupled to CRM records in this package, so an application rollback
requires only reverting the application commit. Keep the additive registry tables in
place until the retention period ends. Dropping definition tables is intentionally not
automated because doing so after later ID backfills would destroy relational history.
Use a reviewed forward-fix migration for schema defects.

## Safety boundary

- Do not execute the prepared record-ID migrations or backfills until the census and
  migration-specific verification plan are reviewed.
- Do not enable external effects during migration testing.
- Do not update labels to repair an alias; aliases are compatibility data.
- Do not edit generated seed SQL directly.
