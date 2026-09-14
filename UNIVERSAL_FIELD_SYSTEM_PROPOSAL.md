# Universal Field & Reporting System — Design Proposal

**Status:** Proposal only. Nothing in this document has been built yet.
**Written:** September 2026, in response to a request for a Monday.com-style
system where any field added anywhere in the CRM automatically becomes
available to filter, report, and build dashboards on — without an
engineer writing code for that specific field.

---

## 1. What was asked for, in plain terms

Every piece of information recorded in the CRM — on every board (Contacts,
Deals, Listings, Transaction Coordinator, Tasks, and anything added later)
— should carry its own stable identity: a "code." That code should let
anyone, from the Dashboard, build a filter, a report, or a calculation
using that field, at any time, without a developer needing to wire it in
first. Adding a new column to a board should work the way it works in
Monday.com: as soon as the column exists, it's usable everywhere reporting
happens.

## 2. The good news: half of this already exists

TargetOS already has a real Custom Fields system. It lives on the
**Custom Fields** admin page (`src/pages/CustomFields.jsx`) and its
underlying library (`src/lib/customFields.js`). When an admin adds a
field there, it's saved with exactly the kind of stable identity being
asked for:

- a permanent **key** (e.g. `referral_source_detail`) — this is the
  "code"
- a **type** (Text, Number, Date, Dropdown, Yes/No, Long Text, URL,
  Phone, Email, Currency)
- which **board** it belongs to (today: Contacts and Deals/Production;
  Listings was planned but I haven't confirmed the database column for
  it actually exists yet)
- a label, section, and display order

The values themselves live in a `custom_data` column on each board's
table — a flexible bucket that can hold any custom field's value without
a database change every time a new field is added. That part already
delivers on "add a field without engineering work."

## 3. Where it breaks down today

None of that plugs into anything that reports or filters. Every place in
the app that currently offers a filter, a segment, a dashboard chart, or
a report is hand-coded against a fixed list of specific fields. Two
concrete examples from the actual codebase, so this isn't abstract:

**Segments** (`src/pages/Segments.jsx` + `src/lib/segments.js`) — the
"build a dynamic contact list" feature. The list of conditions a user can
pick from is a hardcoded array:

```js
const SEGMENT_CONDITIONS = [ /* status, source, type, has_phone, ... */ ]
```

and turning a chosen condition into an actual database filter is a fixed
if/else chain:

```js
export function applySegmentCondition(q, cond) {
  if (cond.key === 'status' && cond.value) return q.eq('status', cond.value)
  if (cond.key === 'source' && cond.value) return q.eq('source', cond.value)
  // ...
}
```

Every one of those `if` lines is a field a developer had to add by hand.
A custom field created on the Custom Fields page today has **no way** to
show up in this list — the code doesn't know it exists.

**Reports / Analytics / Dashboard** — same story, at a larger scale.
`Reports.jsx`, `Analytics.jsx`, and the scheduled email report system
(`sql/report_builder.sql`) are all built around a fixed set of named
metrics and columns baked into the code. None of them look at the Custom
Fields registry at all.

So today: you can add a custom field and fill it in on individual
records, but you cannot yet drag it into a dashboard filter, a segment,
or a report — someone has to write code for that one field, every time.
That gap is the actual thing standing between what exists now and the
Monday.com-style experience being asked for.

## 4. Proposed architecture

Three pieces, building on what already exists rather than replacing it.

### 4.1 The Field Catalog (new)

A single function, callable for any board, that returns **every**
field on that board — both the built-in ones (a short, one-time-written
list per board: `status`, `source`, `stage`, `agent_id`, `gci`, etc.) and
the custom ones (already stored dynamically via the existing
`customFields.js`). Each entry looks the same regardless of where it came
from:

```js
{ key: 'status', label: 'Status', type: 'select', options: [...], source: 'built_in' }
{ key: 'referral_source_detail', label: 'Referral Source Detail', type: 'text', source: 'custom' }
```

This is the "code" the request is asking about, made real and queryable:
one place that always knows every field that exists on a board, what kind
of data it holds, and how to filter on it. Writing the built-in list for
each board is a one-time cost — maybe half a day per board — done once,
ever. It is not repeated every time a new custom field is added; custom
fields already register themselves automatically today.

### 4.2 A generic filter engine (replaces the hardcoded if/else pattern)

One function that takes a field's **type** from the Field Catalog and a
chosen operator (`equals`, `contains`, `is empty`, `after this date`,
`greater than`, etc.) and builds the right database query — a plain
column filter for a built-in field, a `custom_data` lookup for a custom
one. This replaces `applySegmentCondition`'s hand-written chain with one
rule per **type** (there are only ~10 types) instead of one rule per
**field** (there will always be more of these, and they'll keep growing).
Once built, this same function can drive Segments, a redesigned
Dashboard filter bar, and a future Report Builder — one engine, three
consumers, instead of three separate hardcoded copies.

### 4.3 Generic filter/report UI components

A "choose a field" dropdown that reads the Field Catalog instead of a
fixed list, plus a handful of small input controls keyed off each type
(a date-range picker for Date fields, a multi-select for Dropdown fields,
a number range for Number/Currency fields, and so on). Built once, reused
everywhere a filter or a report column needs to be picked.

## 5. Rollout plan

This is real, meaningful engineering work — not a weekend change — but it
is scoped, and each phase is independently useful (nothing has to be
"finished" before you get value):

1. **Extend the existing Custom Fields system to every board** that
   should have it — confirm/add the `custom_data` column on Listings, and
   add it to Tasks, Transaction Coordinator deals, and anywhere else
   custom fields would help. Register each board with the Field Catalog.
2. **Build the Field Catalog and generic filter engine** described above.
3. **Rewire Segments to use it first** — lowest-risk proving ground,
   since Segments is already shaped around a list of conditions; this
   phase replaces the hardcoded list with the dynamic catalog and proves
   the engine works end to end.
4. **Wire the Dashboard and Reports pages to the same catalog** — this is
   the phase that actually delivers the "build my own filter/report from
   the dashboard" experience for Contacts, Deals, and every other board
   with the system enabled.
5. **From this point forward:** any new custom field an admin adds to any
   enabled board shows up automatically as a filter and report option
   everywhere that reads from the catalog — no further engineering work
   per field, which is the outcome originally asked for.

## 6. What this does not change

- Existing hardcoded reports, charts, and segments keep working exactly
  as they do today until each is deliberately migrated in the phases
  above — nothing breaks on day one.
- This does not touch permissions or row-level security; a filter or
  report built this way still only shows data the person building it is
  already allowed to see.
- This is additive at the database level (new catalog logic, and a
  `custom_data` column added to a few more tables) — no existing column
  is renamed, removed, or restructured.

## 7. Decision needed

This proposal is deliberately implementation-first: it describes how the
whole thing would work before any of it is built, per your request to
design one system for every board rather than piloting on one board
first. The next real decision is where Phase 1 starts — which boards
beyond Contacts and Deals should get custom fields and the catalog first
— and whether Segments (Phase 3) or Dashboard/Reports (Phase 4) matters
more to see working first.
