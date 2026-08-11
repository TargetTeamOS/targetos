# Verified Identifier Inventory

## Summary matrix

| Domain | Current state | Finding |
|---|---|---|
| Record identity and relationships | CRM records use UUID-like `id` values and many relationships use `agent_id`, `contact_id`, `deal_id`, `listing_id`, or linked IDs. | **Verified foundation** |
| Routes and record navigation | Route paths use record IDs; `dashboardRoutes.js` maps stable record-type codes to paths. | **Verified foundation** |
| Tabs and navigation | Most tabs and navigation items already have separate `id` and `label` properties. Labels are source-defined rather than administrator-managed. | **Partially verified** |
| Permissions | Permission checks use keys such as `contacts.view_all`; display labels are separate. Role assignment and RLS still compare role text. | **Partially verified** |
| Automation definitions | Trigger and action types use codes such as `deal_stage_change` and `create_task`; status/stage condition values remain display strings. | **Partially verified** |
| Providers and connectors | Providers use codes such as `google`, `outlook`, and `gmail`; connection state uses text codes. | **Partially verified** |
| Statuses and stages | Most records store the visible word itself in a text column and code compares those words. | **Rename risk** |
| Boards, filters, reports, widgets | Board IDs and metric keys exist, but saved filters and calculations persist status/stage text. | **Rename risk** |
| Custom fields and choices | Field definitions have IDs and keys; new choice values default to labels and one editor rewrites value when label changes. | **Rename risk** |
| Transaction coordination | Phase IDs are stable, but phase-to-stage/status synchronization writes visible strings; participant roles and document statuses are editable strings. | **Rename risk** |
| Imports and Monday-related behavior | Imports ultimately write record IDs, but agent and listing matching can use names, partial names, addresses, and embedded sample data. | **Rename risk** |
| SQL, views, functions, RLS | SQL compares literal statuses and roles; no `status_id` or `stage_id` creation was found. | **Rename risk** |
| Rename regression coverage | Existing tests pin current strings; no rename-invariance suite was found. | **Missing implementation** |

## Stable foundations to preserve

### Record identity

- **Verified** — Pages and data services consistently pass record `id` values for
  contacts, deals, listings, tasks, offers, calendar events, transactions, and agents.
- **Verified** — `src/lib/dashboardRoutes.js` defines stable record-type keys and
  generates ID-based routes.
- **Verified** — `src/components/BoardLinks.jsx` discovers linked boards through
  `linked_deal_id`, `linked_listing_id`, and `listing_id`, not through board labels.
- **Verified** — Offer contact isolation tests and contact pickers use contact IDs.

### Tabs, navigation, and routes

- **Verified** — `AgentPerformance`, `ContactDetail`, `DailyBriefing`, `Admin`,
  `Analytics`, `Calls`, `Email`, `Marketing`, `Production`, `Settings`, and other
  screens generally store a tab key such as `activity`, `settings`, or `leaderboard`
  separately from its rendered label.
- **Verified** — `src/components/Layout.jsx` defines navigation `id` separately from
  `label`; `src/App.jsx` routes on paths rather than page titles.
- **Partially verified** — These definitions are hard-coded in source. A developer
  can rename a label without changing the key, but an administrator cannot yet manage
  labels from a governed configuration registry.
- **Rename risk** — `src/components/UI.jsx` still accepts bare string tabs, where the
  same string becomes both identity and label. `Contacts.jsx` uses this compatibility
  path for `info`, `notes`, `files`, and `activity`.

### Permissions and machine vocabularies

- **Verified** — `src/lib/permissions.js` uses stable permission keys such as
  `deals.view_gci` and separate labels/groups.
- **Verified** — `src/lib/automationConstants.js` separates trigger/action IDs from
  labels, and `src/lib/widgetModel.js` separates metric, field, date-mode, format,
  and display-type keys from labels.
- **Verified** — Google/Microsoft connector logic uses provider codes rather than
  provider display names.
- **Rename risk** — RLS and application checks compare literal role text including
  `admin` and `secretary`. Role display names and authorization identity are not
  represented by separate persisted definitions.

## Business-state coupling

### Contacts

- **Rename risk** — `src/lib/constants.js` defines contact options with
  `value === label` for values such as `New`, `Hot`, and `Warm`.
- **Rename risk** — `Analytics.jsx`, `Dashboard.jsx`, `DashboardV2.jsx`,
  `DailyBriefing.jsx`, `ContactDetail.jsx`, `api/report-cron.js`, and
  `api/_lib/briefing.js` branch directly on those strings.
- **Rename risk** — Changing `Hot` to another label can change priority assignment,
  dashboard counts, colors, briefing markup, and follow-up behavior.

### Deals and production

- **Rename risk** — Deal stages in `src/lib/constants.js` use visible text as the
  stored value. `Offer Accapted` is intentionally pinned as a machine value.
- **Rename risk** — `src/pages/Production.jsx` groups, moves, summarizes, colors, and
  synchronizes deals through exact stage text.
- **Rename risk** — `src/lib/tcPhaseMap.js`, `src/lib/automationDispatcher.js`,
  `supabase/functions/automation-engine/index.ts`, dashboards, reports, and SQL all
  duplicate stage meanings.
- **Rename risk** — `sql/reporting_tier_b.sql` calculates outstanding commissions
  with `stage = 'Closed'`; several Phase 1 SQL functions calculate task/deal metrics
  with literal state strings.

### Listings, tasks, offers, gifts, and signs

- **Rename risk** — Listing behavior compares `Active`, `Accepted offer`,
  `Under Contract`, `Sold`, `Expired`, and other visible strings across pages,
  automations, dashboards, and Edge Functions.
- **Partially verified** — Task values (`pending`, `in_progress`, `done`,
  `cancelled`) look like machine codes and labels are separate in constants.
  However the database has no referenced state definition, and other code also accepts
  `completed`, `canceled`, and boolean `completed`, creating multiple meanings.
- **Rename risk** — Offer code maintains arrays that equate legacy and new visible
  values (`AO`, `Accepted`, `Closed`, `Stuck`, and others). Tests preserve those
  strings rather than verify a state identity.
- **Rename risk** — Gift, sign, commission, campaign, report, connector, and send
  states are text codes without a shared registry or database constraint.

### Transaction coordinator

- **Verified foundation** — `tc_phase` uses codes such as `pre_listing`, `offer`, and
  `under_contract`, with separate labels in `TransactionCoordinator.jsx`.
- **Rename risk** — `tcPhaseMap.js` converts those codes to visible deal and listing
  strings, so cross-board synchronization remains label-dependent.
- **Rename risk** — `tcSettings.js` stores participant roles, document statuses,
  checklist items, and task-template buckets as strings or JSON object keys.
  Administrator edits can change the value consumed by existing records.

## Configuration and customization coupling

### Custom fields and options

- **Verified foundation** — Custom fields have an `id`, a `key`, and a separate
  `label`; data is stored under the field key in `custom_data`.
- **Partially verified** — Field keys are generated from the label when created and
  can be manually edited. There is no immutability enforcement, alias table, or
  dependency check before a key changes.
- **Rename risk** — `CustomFields.jsx` updates a select option with
  `{ label: newText, value: newText }`, changing identity when the label changes.
- **Partially verified** — The Production option editor preserves an existing value
  when only its label changes, but a newly added option derives its value from its
  label. The same concept behaves differently in two editors.
- **Rename risk** — `src/lib/utils.js` resolves colors by `value` **or** `label`, so a
  label can accidentally act as a machine identifier.

### Boards, groups, dashboards, and reports

- **Verified foundation** — `BOARD_OPTIONS` supplies stable board IDs (`contacts`,
  `deals`, `tasks`, and others) and separate board labels.
- **Rename risk** — Each board's `statusOptions` are literal record values. Smart
  dashboard starter widgets persist arrays of strings such as `['Closed']` and
  `['Under Contract']`.
- **Rename risk** — `api/dashboard-pins.js` evaluates saved filters by direct equality
  against `status`, `stage`, and `source` text.
- **Rename risk** — Production groups have their own IDs and labels, but group
  membership is an array of stage strings. Renaming a group label is only local React
  state; it is not persisted. New group IDs use `Date.now()` and also are not persisted.
- **Rename risk** — Report and widget SQL contains literal business values and some
  verification SQL finds seeded widgets by title.

## Automations and integrations

- **Verified foundation** — Automation rows have UUIDs; trigger/action types are
  machine codes. SQL seeds use fixed automation UUIDs and `ON CONFLICT (id)`.
- **Rename risk** — Automation conditions persist `to_status`, `from_status`,
  `to_stage`, and `from_stage` as the visible record text. Dispatchers compare exact
  strings.
- **Rename risk** — The Edge automation engine contains a separate trigger vocabulary
  and uses `Offer Accepted`, while other source uses `Offer Accapted`. This is already
  a concrete cross-engine vocabulary conflict.
- **Rename risk** — Seeded automation recipients and role targeting include literal
  role strings. Automation names are display-only, but one voicemail path retrieves a
  specific automation by fixed UUID, which is the correct identity pattern.
- **Verified foundation** — Connector provider selection uses stable provider codes.
  Connection status values are suitable as internal codes only if their UI labels are
  moved to a registry and the allowed transitions are constrained.

## Imports, external mappings, and names

- **Partially verified** — Import/export accepts stable database column keys and can
  resolve an imported agent name to `agent_id`.
- **Rename risk** — Name resolution uses exact or first/last-name matching; the
  listing Monday sync uses partial first-name matching. Agent renames, duplicates, or
  spelling changes can produce unmatched or incorrect ownership.
- **Rename risk** — The current Monday sync in `Listings.jsx` is embedded sample data,
  uses a hard-coded board number, matches existing listings by address prefix, and
  maps agents by names. It is not a durable external-ID synchronization model.
- **Rename risk** — `automationEngine.js` contains a last-resort exact contact-name
  match. Search by name is appropriate for discovery, but it must not establish a
  durable relationship without an ID confirmation.
- **Rename risk** — Notes use `(linked_type, linked_id)` with an unconstrained text
  discriminator. This is a machine code but has no registry or database constraint.

## Tests

- **Verified** — Existing tests exercise route resolution, offer ownership, dashboard
  rendering, TC phase mappings, and many current calculations.
- **Rename risk** — `tcPhaseMap.test.js` explicitly pins `Offer Accapted`; offer,
  dashboard, and report tests also construct rows with visible status strings.
- **Missing implementation** — No test renames a label while keeping its ID/code fixed
  and proves identical behavior across database queries, API output, UI, dashboards,
  automations, and reports.

## Highest-risk coupling points

1. Deal/listing stage synchronization across Production, TC, automations, and reports.
2. Saved dashboard/widget/pin filters that store status text.
3. Automation conditions and Edge triggers that compare different vocabularies.
4. Custom select option editing that changes stored value when its label changes.
5. SQL/RLS logic tied to literal stages, statuses, and roles.
6. External imports that establish ownership or deduplication from names/addresses.
