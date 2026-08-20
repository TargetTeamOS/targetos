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

## Package 4 — Operational APIs, dashboards, reports, and automations

Status: **Implemented in code; database migration still not executed**

This package extends the canonical resolver to server-side choice options and adds a
CommonJS record-identifier adapter for API handlers. Database filters can now expand
a stable code to every registered legacy alias, while in-memory rules compare the
resolved code rather than an editable label.

The following operational paths now use stable workflow or choice identities:

- agent activity conversion, closed-deal, and accepted-offer metrics;
- daily-briefing task, listing, lead, pipeline, closing, and GCI selection;
- dashboard-pin live counts and the primary CRM dashboard metrics and saved filters;
- scheduled and preview report task, offer, deal, commission, goal, and lead logic;
- campaign contact-status audience selection;
- task-reminder pending-state and priority handling;
- office-TV pipeline, closed, and closing-soon metrics;
- offer-send Draft-to-Sent transition preconditions;
- Twilio/IVR active-listing selection;
- automation trigger configuration, lifecycle events, open TC tasks, and identifier
  equality conditions; and
- the Reports page and the remaining Production stage filter.

Behavioral coverage proves that the server adapter resolves legacy aliases, expands
database filters, rejects unknown identifiers, and preserves the historical task-note
pseudo-priority. Automation-condition tests prove that deal, task, listing, and
contact conditions compare stable identities rather than display text.

### Package 4 boundary

This package does not yet replace editable legacy values in administrator-defined
widget configuration, form option constants, email template display text, every
secondary analytics/performance page, TC page CRUD, import/export data, or external
provider mappings. Those paths remain explicitly scheduled for later packages.

No SQL was run, no Supabase row was created or changed, no communication or webhook
was sent, no external effect was enabled, and no Production deployment was performed
for Package 4.

## Package 5 — Secondary analytics and agent workflow pages

Status: **Implemented in code; database migration still not executed**

This package removes editable workflow-label comparisons from the remaining high-use
analytics and personal workflow pages covered by this increment:

- Agent Performance deal, listing, offer, contact, and task metrics;
- Analytics pipeline, conversion, listing-health, lead-health, alert, goal, source,
  commission, and seller-accountability calculations;
- Daily Briefing task, pipeline, closing, active-listing, lead, and GCI selection for
  both individual previews and administrator send-all preparation;
- My Listings filters, alert behavior, summary counts, listing lifecycle writes, and
  listing-to-TC phase synchronization;
- the Pipeline board's terminal-state exclusion and stage grouping; and
- current and legacy Offers lifecycle metrics, filters, acceptance conversion,
  duplicate-deal detection, stable deal creation, and in-house listing transitions.

Direct lifecycle writes in these pages now pass through the shared compatibility
adapter. This means callers choose an immutable code while the current database
continues receiving its compatible legacy storage value until the additive ID
migration is approved. Duplicate-deal detection resolves each candidate's stage
instead of embedding a list of terminal display strings in a database filter.

Behavioral coverage now explicitly proves the legacy aliases used by these pages map
to the expected immutable codes and that accepted-offer conversion prepares compatible
deal and listing writes from stable codes.

### Package 5 boundary

This increment does not claim the entire application is rename-safe. Call outcomes,
commission states, the legacy `dead` TC phase, several TC-specific components and CRUD
paths, import/export formats, administrator-configurable labels and tabs, and external
provider mappings still require cataloging or cutover in later packages. Display-only
copy remains ordinary presentation text; it is not used to select backend behavior in
the paths listed above.

No SQL was run, no Supabase row was created or changed, no communication or webhook
was sent, no external effect was enabled, and no Production deployment was performed
for Package 5.

## Package 6 — Transaction Coordinator identity and cross-board synchronization

Status: **Implemented in code; additive TC-task migration prepared but not executed**

This package replaces the TC synchronization layer's historical label-key contract
with immutable lifecycle codes. In particular, the misspelled legacy value
`Offer Accapted` is now only a recognized compatibility alias; it is no longer
described or used as a canonical machine identity.

The package adds stable code maps for TC phase → Production stage, TC phase → Listing
status, Production stage → Listing status, and Production stage → TC phase. The older
text maps remain deprecated compatibility exports derived from the catalog. Deal
updates, TC edits, and the TC Sync Health repair tool compare codes and prepare legacy
database writes through the shared adapter.

TC tasks now share the canonical task lifecycle and priority identities in the browser
adapter, matching the server adapter. The TC board, morning summary, work-queue drawer,
Listing transaction progress, and Listing workspace use resolved task identities for
completion, overdue, progress, filtering, and generated task writes. Listing lifecycle
edits and Listing-created office tasks also pass through the adapter.

`004_tc_task_ids.sql` and its read-only verification companion prepare nullable
`status_id` and `priority_id` columns, exact backfills, exception capture, and dual-write
triggers for `tc_tasks`. They are sequenced after migrations 001-003 and have not been
run.

### Package 6 boundary

Photography/service readiness states, call outcomes, commission states, gifts, signs,
generic transactions, import/export contracts, administrator-configurable tabs and
labels, and external-provider mappings remain for later packages. Local component
states and provider protocol statuses are not presentation labels and must not be
mistaken for administrator-renamable business definitions.

No SQL was run, no Supabase row was created or changed, no communication or webhook
was sent, no external effect was enabled, and no Production deployment was performed
for Package 6.
