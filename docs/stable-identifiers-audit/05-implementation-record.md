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
