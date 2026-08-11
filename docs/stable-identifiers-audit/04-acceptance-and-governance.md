# Acceptance Tests and Identifier Governance

## System-wide rename invariant

For every configurable definition, this sequence must pass:

1. Create records and dependent objects using the definition ID.
2. Record API results, permissions, counts, transitions, automation plans, and external
   mappings.
3. Change only the display label.
4. Repeat the same operations.
5. Assert that only rendered/exported wording changed.

## Required behavioral suites

### Workflow states

- Rename contact, deal, listing, task, offer, gift, sign, commission, campaign, send,
  connector, and TC state labels.
- Confirm record membership, ordering, colors, transitions, active/won/lost totals,
  due/overdue rules, and cross-board synchronization are unchanged.
- Confirm historical audit entries resolve the current label while retaining the state
  ID and event-time metadata.

### Pages, tabs, navigation, boards, and fields

- Rename a navigation item, tab, board, group, view, column, custom field, and custom
  choice option.
- Confirm routes, deep links, saved layouts, filters, exports, imports, and permissions
  still resolve.
- Confirm two options may not share the same immutable code inside one choice set, but
  display-label uniqueness follows an explicit organization policy.

### Automations and reports

- Rename every state used by an automation condition and prove the same event produces
  the same planned actions.
- Rename templates and reports and prove schedules still reference IDs.
- Run with external effects disabled/mocked; assert idempotency keys and recipients are
  unchanged.
- Prove dashboards, pins, segments, widgets, and SQL/RPC totals do not change after a
  label-only rename.

### Authentication and permissions

- Rename each role label and prove all allowed and denied operations are identical.
- Confirm RLS, API authorization, UI permission guards, and administrator overrides
  use the same permission codes.
- Confirm cross-agent and cross-organization access remains denied.

### Integrations

- Rename an internal agent, board, field, status, and template without changing provider
  mappings.
- Change an external provider label and prove the mapping remains connected through
  provider object IDs.
- Confirm ambiguous name/address imports enter a reconciliation queue and never assign
  ownership automatically.

## Migration verification

Every migration PR must include:

- pre-migration distinct-value and row-count report;
- mapping manifest with aliases and explicit unknowns;
- forward migration and rollback or forward-fix procedure;
- post-migration null, orphan, duplicate, mismatch, and organization-scope checks;
- unchanged financial, pipeline, listing, task, and report aggregates;
- dual-write parity test while compatibility is active;
- rename-invariance test for the migrated domain;
- external-effects-disabled evidence where automations or communications are involved.

## Engineering rules

1. Components render `definition.label`; they compare `definition.id` or an immutable
   code from the generated contract.
2. Database records reference definition IDs. APIs do not accept arbitrary labels as
   state assignments.
3. Immutable codes are lowercase, namespaced, and documented. They are never reused for
   a different meaning.
4. Labels are editable, localizable, and audited.
5. A semantic change creates a new state/code or a governed flag/transition change; it
   is not disguised as a rename.
6. Deactivate definitions with history. Do not hard-delete them.
7. All definitions, records, mappings, and uniqueness constraints are organization-
   scoped where TargetOS supports multiple organizations.
8. External mappings always include provider, connection, object type, and external ID.
9. Import aliases are directional compatibility data; they never become the canonical
   value written to new records.
10. Definition writes are server-authorized, validated, versioned, and audit logged.

## Static guardrails

Add CI checks after the first domain migrates:

- forbid new equality comparisons against labels for migrated fields;
- forbid direct writes to legacy text state columns;
- forbid new choice objects where `value` is derived from `label`;
- forbid RLS role comparisons outside the canonical permission helpers;
- verify generated contracts match migration seeds;
- verify every persisted filter references a registered field and typed value;
- verify every automation trigger/action/condition type exists in the registry.

Static checks supplement behavioral tests; they do not replace them.

## Definition change policy

| Change | Normal approval | Data migration? |
|---|---|---|
| Label, description, icon, color | Authorized administrator | No |
| Sort order or visibility | Authorized administrator | No record rewrite |
| Semantic flag | Product/data owner plus test evidence | Usually no rewrite, but aggregate impact review required |
| Transition or permission | Security/workflow owner | No record rewrite; authorization/automation review required |
| Immutable code | Prohibited rename; create alias/new code | Compatibility migration |
| Merge/split states | Data-owner approval | Yes, explicit mapping and exception report |
| Delete used definition | Prohibited; deactivate instead | Separate retention process |

## Completion definition

The architecture is complete only when:

- all targeted records store state/choice/role IDs;
- application and SQL behavior uses IDs, immutable codes, or semantic flags;
- labels can be changed from one governed interface;
- saved filters, boards, reports, automations, and integrations reference IDs;
- RLS and API authorization do not depend on editable words;
- legacy aliases are isolated to import/compatibility boundaries;
- rename-invariance tests pass in CI for every migrated domain;
- no production communication or external side effect is needed to prove rename safety.
