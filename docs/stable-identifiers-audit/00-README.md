# TargetOS Stable-Identifier Audit

Audit date: 2026-08-10

Audit branch: `codex/stable-identifiers-audit`

Audited base: `a7d8d0744ce2957c4701d71341fc70833b475a8a` (`main`)

Change type: documentation only

## Purpose

This audit defines how TargetOS can allow administrators to rename tabs, statuses,
stages, roles, boards, fields, templates, and other visible concepts without
changing application behavior or historical records.

The repository was inspected directly. Earlier CRM audit documents were used for
orientation only; every finding in this folder was rechecked against the audited
base.

## Finding labels

| Label | Meaning |
|---|---|
| **Verified** | Directly supported by code or SQL in the audited repository. |
| **Partially verified** | A stable identifier exists, but another layer still depends on editable text. |
| **Rename risk** | Changing visible wording can change, disable, split, or misclassify behavior. |
| **Missing implementation** | A required registry, constraint, migration, or test does not exist. |
| **Unknown** | Runtime database state is required to finish the finding. |

## Executive conclusion

- **Verified** — TargetOS is not uniformly name-driven. Record UUIDs, foreign-key-like
  columns such as `agent_id`, route parameters, many tab IDs, permission keys,
  automation type codes, provider codes, and widget keys already separate identity
  from display text.
- **Rename risk** — Core CRM workflow state is still stored and interpreted as text.
  Examples include contact `status`, deal `stage`, listing `status`, task `status`,
  commission status, connector status, transaction-coordinator participant roles,
  and custom select option values.
- **Rename risk** — The same business meaning is repeated in React, API handlers,
  Edge Functions, dashboard definitions, reports, tests, and loose SQL. Renaming one
  copy does not update the others.
- **Verified** — Some current code deliberately pins misspelled legacy values such as
  `Offer Accapted` because the spelling is the machine value. That preserves present
  behavior but proves that presentation text and identity are coupled.
- **Missing implementation** — There is no central, versioned definition registry
  for business entities, workflows, states, choice options, boards, groups, roles,
  or external mappings.
- **Missing implementation** — There are no rename-safety tests proving that changing
  a label leaves APIs, automations, reports, dashboards, permissions, and cross-board
  synchronization unchanged.

TargetOS should use two stable layers:

1. Database relationships store immutable UUIDs.
2. Application code and deployment seeds refer to immutable, human-readable codes.

Labels remain editable presentation data. Random environment-specific UUID literals
must not be scattered through frontend or API source.

## Documents

1. [01-verified-inventory.md](01-verified-inventory.md) — what is stable and what is name-coupled now.
2. [02-target-architecture.md](02-target-architecture.md) — the required professional identifier model.
3. [03-migration-roadmap.md](03-migration-roadmap.md) — an incremental, reversible implementation plan.
4. [04-acceptance-and-governance.md](04-acceptance-and-governance.md) — completion tests and engineering rules.

## Scope boundary

No application, API, SQL, migration, environment, or database behavior was changed.
No migration was executed and no live database was queried.

The audited base is `main` itself. Security/configuration work that remains on a
separate integration branch is not silently treated as merged. Any functional
stable-identifier branch must be created from the final reviewed security foundation,
not from this documentation commit alone.
