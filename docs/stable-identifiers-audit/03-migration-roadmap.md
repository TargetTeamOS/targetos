# Stable-Identifier Migration Roadmap

## Delivery principle

This is a compatibility migration, not a big-bang rewrite. Existing records and
integrations remain readable while IDs are introduced, backfilled, verified, and then
made authoritative.

## Phase 0 — Safety and contract freeze

1. Finish and merge the approved authentication/configuration foundation before
   identifier write paths are introduced.
2. Establish a clean migration directory and applied-migration ledger.
3. Capture live distinct values and counts for every affected text column without
   changing data.
4. Back up database and Storage and record restore evidence.
5. Keep external effects disabled while structural migrations are verified.
6. Freeze creation of new unregistered workflow values during the migration window.

**Exit:** verified value census, backup, schema baseline, and no uncontrolled writers.

## Phase 1 — Canonical registry and generated contracts

1. Add entity, workflow, state, choice, role, permission, board, and external-mapping
   definition tables.
2. Seed immutable codes for every existing value, including legacy spelling and
   aliases.
3. Add semantic flags for reporting and automation behavior.
4. Generate a TypeScript contract from the seed manifest.
5. Add server resolvers `code -> id`, `id -> definition`, and `legacy value -> id`.

**First implementation PR recommendation:** registry tables, seed manifest,
read-only resolvers, and tests only. Do not change record writes yet.

**Exit:** definitions reproduce all observed legacy values with no record changes.

## Phase 2 — Additive record columns and backfill

Add nullable FK columns without dropping text columns:

- `contacts.status_id`, `type_id`, `source_id`
- `deals.stage_id`, `deal_status_id`, `side_id`, `commission_status_id`
- `listings.status_id`, `property_type_id`, `deal_type_id`, `marketing_status_id`
- `tasks.status_id`, `priority_id`
- offer, gift, sign, campaign, send, connector, call, report, and TC state IDs
- role IDs for agents/users and participant-role IDs for TC people

Backfill through the alias registry. Produce explicit exception tables for null,
unknown, conflicting, or ambiguous values. Do not guess.

**Exit:** every non-null legacy value maps to exactly one definition or an approved
exception; row counts and business totals are unchanged.

## Phase 3 — Dual-read and dual-write compatibility

1. APIs return ID, code, and label.
2. New writes require IDs and temporarily maintain legacy text through one server-side
   compatibility function.
3. Reads prefer IDs and use legacy resolution only for unmigrated rows.
4. Add mismatch telemetry when ID and text disagree.
5. Prevent direct browser creation of arbitrary state text.

**Exit:** old and new clients can coexist; mismatch count is zero.

## Phase 4 — Core CRM workflows

Migrate in dependency order:

1. Tasks and priorities — smallest stable-code domain; reconcile `done` versus
   `completed` and `cancelled` versus `canceled`.
2. Contacts — status, type, source, interest, and lead-scoring semantics.
3. Deals/Production — stage, side, deal status, CTC, command, commission status.
4. Listings — lifecycle, property type, deal type, marketing/photo status.
5. Offers, gifts, signs, calls, campaigns, reports, and communications.

Each domain gets a value census, mapping, backfill, dual-write, rename test, and
rollback before the next domain starts.

## Phase 5 — Cross-page and board synchronization

1. Replace `tcPhaseMap.js` text maps with state-ID mappings.
2. Persist board/group definitions and group membership filters by IDs.
3. Migrate dashboard widgets, dashboard pins, segments, saved filters, and report
   definitions from text values to typed ID predicates.
4. Update analytics and SQL/RPC functions to use semantic flags or state IDs.
5. Preserve display labels in exported files, but include stable IDs/codes in a
   machine-readable import/export format.

**Exit:** a label rename changes presentation everywhere and changes no counts,
transitions, synchronization, filters, or historical rows.

## Phase 6 — Automations

1. Define one canonical event catalog.
2. Convert automation conditions and action configuration to IDs.
3. Version automation definitions and templates.
4. Replace recipient role strings with role/team/user IDs.
5. Consolidate browser, API, cron, and Edge execution on the same evaluator.
6. Add idempotency and transition-event audit records.

**Exit:** automations fire identically before and after any label rename, with external
effects mocked or disabled during verification.

## Phase 7 — Roles, permissions, and RLS

1. Backfill role definitions and user-role assignments.
2. Change permission evaluation and RLS helpers to role IDs/permission codes.
3. Keep old role text read-only during compatibility.
4. Test renamed role labels, role aliases, and cross-organization isolation.

**Exit:** renaming a role cannot grant or revoke access; capability changes require an
explicit permission edit and audit event.

## Phase 8 — Integrations and Monday mappings

1. Store provider connection IDs and provider object IDs.
2. Replace Monday name/address matching with explicit board, group, column, item, and
   user mappings.
3. Provide a human reconciliation queue for unmatched imports.
4. Preserve external status labels as provider metadata; map them to internal state IDs.
5. Apply the same mapping contract to Google, Microsoft, MLS, Mailchimp, Twilio, and
   future integrations where external objects are synchronized.

**Exit:** internal or external label changes do not relink ownership or duplicate
records.

## Phase 9 — Cutover and cleanup

1. Require new ID columns as `NOT NULL` where the business rule requires a state.
2. Add foreign keys, uniqueness, organization-scoping, and transition constraints.
3. Remove label fallback from `statusColor`, filter parsing, and custom-field options.
4. Stop dual-writing legacy text.
5. Retain legacy text in read-only history or remove it in a later, separately approved
   migration after a full retention period.
6. Remove duplicate constants and generate UI definitions from the catalog.

**Exit:** source and SQL contain no business branching on editable labels.

## Work packages by current code area

| Work package | Primary current files |
|---|---|
| Definition registry | New migrations and generated contract; `src/lib/constants.js`, `src/lib/customFields.js` |
| Task state pilot | `Tasks.jsx`, `ContactDetail.jsx`, `TransactionCoordinator.jsx`, `automationEngine.js`, Phase 1 My Day SQL |
| Deal/listing workflows | `Production.jsx`, `Listings.jsx`, `MyListings.jsx`, `tcPhaseMap.js`, automation dispatcher/Edge engine |
| Dashboards/reports | `boardOptions.js`, `Dashboard*.jsx`, `SmartWidget.jsx`, `api/dashboard-pins.js`, report engines, widget SQL |
| Automations | `automationConstants.js`, `automationDispatcher.js`, `automationEngine.js`, `Automations.jsx`, cron/Edge functions |
| Roles/permissions | `permissions.js`, `AuthContext.jsx`, API auth helpers, RLS SQL |
| Custom fields | `customFields.js`, `CustomFields.jsx`, `Production.jsx`, custom renderers |
| External mappings | `ImportExport.jsx`, `Listings.jsx`, connector libraries/APIs, integration schema |

## Explicitly prohibited shortcuts

- Global search-and-replace of visible words.
- Reusing a label slug as an immutable code after creation.
- Hard-coding environment-specific UUIDs throughout application source.
- Deleting legacy values before the alias/backfill report is clean.
- Allowing clients to write both ID and label independently.
- Making RLS decisions from editable role labels.
- Treating names, email addresses, property addresses, or titles as durable foreign keys.
