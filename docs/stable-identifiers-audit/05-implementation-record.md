# Stable-Identifier Implementation Record

Implementation branch: `codex/system-stable-identifiers`

Parent: Phase 2 access and integration repair (`d9e0d75`)

## Package 1 — Canonical registry and contracts

Status: **Implemented locally; database not changed**

This package adds:

- a versioned source catalog with immutable workflow, state, choice, role, and board
  codes;
- browser and server resolvers for code, legacy alias, display label, and semantic
  flags;
- additive workflow, choice, role, permission, board, transition, mapping, audit, and
  external-object-mapping tables;
- immutable-code triggers, catalog versioning, RLS, administrator-only definition
  writes, and service-only external mappings;
- an idempotent generated catalog seed that preserves administrator-edited labels;
- read-only census and verification SQL;
- behavioral tests proving legacy spellings resolve to one code, ambiguous aliases
  fail, and a label-only rename does not change semantic behavior;
- Linux CI coverage for catalog validation.

## Explicit non-completion

The system-wide migration is not complete at Package 1. Existing CRM records still
store legacy text. Additive ID columns, reviewed backfills, dual-write compatibility,
page/API/report/automation cutovers, RLS role assignments, and external provider
mappings must be completed in the dependency order defined by
`03-migration-roadmap.md`.

No SQL in this package has been executed against Supabase. No CRM record, external
account, environment variable, deployment, or Production service was changed.

## Read-only live census

Status: **Verified on 2026-08-11; no writes performed**

The authorized development/testing Supabase project was queried for distinct machine
values and counts only. The census found 19 distinct rows across the targeted fields.
All observed values resolve uniquely in catalog version 1:

- roles: `admin` (1), `agent` (8), `secretary` (1);
- contact status: `New` (30);
- deal stages: `Closed` (134), `Deal Fell Through` (24), `Negotiations` (1),
  `Offer Accepted` (10), `Under Contract` (82), `Under Shtar` (5);
- listing statuses: `Accepted offer` (9), `Active` (23), `Coming Soon` (1),
  `incomplete` (9);
- offer status: `Draft` (1);
- task priority/status: `normal` (4), `pending` (4);
- TC phases: `pre_listing` (3), `under_contract` (2).

No contact name, address, email, phone, transaction content, document, token, or
credential was selected.

## Package 2 — Additive core record IDs

Status: **Prepared locally; not executed**

`003_core_record_ids.sql` adds nullable foreign keys for the observed core workflow
fields, backfills only exact catalog/alias matches, records unresolved values as
exceptions, and installs dual-write triggers that reject unknown or mismatched
identity/legacy pairs. It does not remove or rewrite the legacy columns.

Package 2 must not be applied until Package 1 SQL has passed its verification queries.

## Package 3 — Core record compatibility layer

Status: **Implemented in code; database migration still not executed**

This package adds a shared record adapter for contacts, deals, listings, offers,
tasks, and TC phases. The adapter resolves stable workflow/choice codes, decorates
legacy rows with virtual code and presentation metadata, validates writes, supports
registered legacy aliases in filters, and removes presentation-only fields before a
database request. If a compatibility form changes a workflow value after the
additive foreign-key migration, its stale environment-specific foreign key is
cleared so the database trigger can resolve the correct canonical ID.

The main CRM data service now applies that adapter to contact, deal, listing, offer,
and task reads and writes. Contacts, Listings, Production, and Tasks use stable codes
for the migrated filters, counts, grouping, completion, lifecycle transitions,
automatic dates, and board behavior. Existing legacy values remain accepted and are
not rewritten merely because an unrelated field was edited.

Behavioral coverage verifies legacy-row decoration, stable-code writes, unknown-value
rejection, legacy task-note compatibility, stale decorated-form codes, stale foreign
keys, alias-aware filters, and code-based comparisons.

### Package 3 boundary

This is not the system-wide cutover. Direct Supabase queries outside the main CRM
service, serverless reports and communication jobs, dashboard pins, campaigns,
automations, TC-specific CRUD, user-role assignments, configurable boards, and
external-provider mappings still contain legacy-text paths. They remain scheduled
for later packages and must not be described as rename-safe yet.

No SQL was run, no database row was written, no external effect was enabled, and no
Production deployment was performed for Package 3.
