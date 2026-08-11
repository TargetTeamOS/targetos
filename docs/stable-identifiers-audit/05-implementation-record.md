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
