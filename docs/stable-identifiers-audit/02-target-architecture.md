# Target Stable-Identifier Architecture

## Non-negotiable rule

An editable label must never be the value that determines identity, authorization,
workflow behavior, synchronization, reporting, or external mapping.

## Identity layers

| Layer | Purpose | Example | Change policy |
|---|---|---|---|
| Record ID | Relational identity inside the database | UUID for one contact or workflow state | Never changes |
| Immutable code | Portable identity used by code, seeds, APIs, and migrations | `deal.stage.closed` | Never renamed; new version/alias if semantics change |
| Display label | User-facing wording | `Completed Sale` | Editable without behavior change |
| Semantic flags | Behavior independent of wording | `is_terminal=true`, `counts_as_won=true` | Governed change with audit |
| External ID | Provider identity | Monday item/column ID, Graph account ID | Provider-scoped; never inferred from label |
| Alias | Legacy import compatibility | `Closed`, `Sold`, old spelling | Read/import compatibility only |

Database rows should store UUID foreign keys. Application source should refer to
immutable codes resolved through a catalog or generated contract. It should not
hard-code random UUIDs that differ between environments.

## Core definition model

### Workflows and states

Introduce a shared workflow catalog rather than a separate ad hoc status table for
every page:

```text
workflow_definitions
  id uuid primary key
  organization_id uuid nullable
  code text unique             -- deal.lifecycle, listing.lifecycle, task.lifecycle
  entity_type_code text
  label text
  version integer
  active boolean

workflow_states
  id uuid primary key
  workflow_id uuid references workflow_definitions
  code text                    -- closed, under_contract, done
  label text                   -- administrator-editable
  color text
  sort_order integer
  semantic_type text           -- open, won, lost, cancelled, completed, error
  is_initial boolean
  is_terminal boolean
  counts_as_active boolean
  counts_as_won boolean
  active boolean
  unique(workflow_id, code)

workflow_state_aliases
  workflow_state_id uuid
  alias text
  source_code text nullable    -- legacy, monday, import-v1
```

Records receive state foreign keys such as `contacts.status_id`, `deals.stage_id`,
`listings.status_id`, and `tasks.status_id`. Existing text columns remain during
compatibility phases.

Reports ask for semantic flags or stable state codes. For example, closed production
uses `counts_as_won`, not `label = 'Closed'`.

### Choice sets and custom fields

```text
field_definitions
  id uuid primary key
  code text immutable
  label text editable
  entity_type_code text
  storage_type text

choice_sets
  id uuid primary key
  code text unique
  label text

choice_options
  id uuid primary key
  choice_set_id uuid
  code text
  label text
  color text
  sort_order integer
  active boolean
  unique(choice_set_id, code)
```

Custom record data stores option IDs, not option labels. Renaming a field label or
option label updates only the definition row. Deactivation replaces deletion when an
option has history.

### Boards, groups, views, and navigation

```text
board_definitions(id, code, label, entity_type_code, active)
board_groups(id, board_id, code, label, color, sort_order, filter_definition)
view_definitions(id, board_id, code, label, owner_id, filter_definition, sort_definition)
navigation_items(id, code, label, route_code, permission_code, sort_order, active)
```

Filters store typed references:

```json
{
  "field_code": "deal.stage_id",
  "operator": "in",
  "value_ids": ["<workflow-state-uuid>"]
}
```

Board and tab labels can then be changed independently. Route codes and permission
codes remain stable even if the visible navigation wording changes.

### Roles and permissions

Authorization needs stable codes, not editable role names:

```text
role_definitions(id, code, label, active)
permission_definitions(id, code, label, group_code)
role_permissions(role_id, permission_id, allowed)
user_role_assignments(user_id, role_id, organization_id)
```

RLS resolves the authenticated user's role/permission IDs and immutable codes. An
administrator may rename `Secretary` to `Transaction Coordinator` without changing
RLS. Changing a role's capabilities remains a separate, audited action.

### Automations and events

Automation identity remains code-based, but conditions and actions must reference
definition IDs:

- Event type: immutable code, e.g. `deal.stage.changed`.
- Condition: `field_code=deal.stage_id`, `operator=equals`, `value_id=<state-id>`.
- Action type: immutable code, e.g. `task.create`.
- Actor/recipient: user ID, role ID, team ID, or explicit system recipient ID.
- Template: template ID plus a version, never template name.
- Idempotency: event ID plus automation/version/action ID.

One execution engine and one event vocabulary should replace divergent browser and
Edge trigger interpretations.

### Integrations and external identity

Use a provider-scoped mapping table:

```text
external_object_mappings
  id uuid primary key
  provider_code text
  connection_id uuid
  object_type_code text
  external_id text
  internal_entity_type_code text
  internal_id uuid
  external_version text nullable
  last_synced_at timestamptz
  unique(connection_id, object_type_code, external_id)
```

Monday board IDs, item IDs, column IDs, group IDs, and status-label indexes belong in
this mapping layer. Names and addresses may help a human resolve an initial match but
must not remain the synchronization key.

Google/Microsoft account ownership stays tied to authenticated user/agent IDs.
Provider codes remain immutable; provider names are display labels.

## API contract

APIs should return both machine and display fields during migration:

```json
{
  "stage_id": "<uuid>",
  "stage_code": "deal.stage.closed",
  "stage_label": "Completed Sale"
}
```

Writes accept IDs. A temporary compatibility endpoint may accept a legacy value only
when it resolves to exactly one alias; ambiguity is a validation error. Caller-supplied
labels never create a new state implicitly.

## State transition rules

State transitions belong in data, not label-specific `if` statements:

```text
workflow_transitions
  id
  workflow_id
  from_state_id nullable
  to_state_id
  transition_code
  permission_code
  side_effect_policy_code
```

Cross-board synchronization maps state IDs explicitly:

```text
workflow_state_mappings
  source_state_id
  target_workflow_id
  target_state_id
  mapping_code
```

This replaces `tcPhaseMap.js` string translation and makes missing or ambiguous
mappings fail clearly.

## Required platform services

1. A server-owned definition service with organization scoping and caching.
2. Generated TypeScript contracts for immutable codes and API payloads.
3. Database constraints validating IDs, codes, transitions, and organization scope.
4. A compatibility resolver for legacy values and external aliases.
5. An audit log for definition labels, semantic flags, transitions, mappings, and
   permission changes.
6. Versioned migrations with forward, verification, and rollback procedures.
7. Definition caches invalidated by version, not a fixed timeout alone.

## Rename operation

A safe rename is one transaction:

1. Authorize `definitions.rename` for the authenticated organization administrator.
2. Update only `label` and audit metadata.
3. Increment the definition catalog version.
4. Invalidate server/client caches.
5. Leave record foreign keys, codes, saved filters, automations, reports, mappings,
   and history unchanged.

No record backfill is required for a label-only rename.
