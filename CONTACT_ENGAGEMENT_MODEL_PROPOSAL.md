# Shared Contact + Private Per-Agent Engagement — Design Proposal

Status: **draft for review — nothing in this document has been applied to the database or codebase.**
Scope: how a buyer/client should work when more than one agent has a relationship with the same person.

## 1. What you asked for

- One shared "parent" contact per real person: name, email, phone/address, and their history of past deals with the company — visible to everyone.
- Any agent can independently "work" that same person as their own buyer/lead: their own notes, tasks, status, and an automatic listing-email campaign — invisible to other agents.
- Multiple agents can do this on the same person at the same time, each with their own private relationship.
- Past deal history should be shared (not siloed per agent), since you chose that option.
- Regular agents (not just admin/secretary) should be able to start and stop their own automation campaigns on their own clients.

## 2. What's actually in the codebase today (important — this changes the plan)

I read through the contacts data model, the RLS files in `sql/`, `Contacts.jsx`, `ContactDetail.jsx`, and `ContactAutomations.jsx` before writing this. Three things matter a lot:

**A. There is already a partial, different version of this feature live in the app.** `Contacts.jsx` has a `startWorkingLead()` function (search that name) with this comment on it: *"'Start working this lead'... This creates MY OWN independent contact record — same parent identity (name/phone/email), but a completely separate row, with my own notes/status/tags/timeline from here on, invisible to the other agent(s)."*

That's a real, different design from what you just asked for. It's **duplicate-row-per-agent** (each agent gets their own full `contacts` row for the same person), not **one shared parent + a private overlay**. It ships privacy by literally copying the person's identity into a second row rather than sharing one identity record. Two consequences: (1) there's no single place "past deals" naturally lives across agents unless deals happen to reference a specific one of the duplicate rows, and (2) if the same person's info changes (new phone number, say), it has to be corrected in every agent's copy separately, or it silently drifts.

**B. That existing feature depends on an RLS migration whose own file says it was never confirmed applied.** `startWorkingLead()`'s privacy depends entirely on `sql/offers_v2/H_shared_contact_directory.sql` being live in Supabase — it tightens `contacts` row visibility to "owner agent, admin, or permitted secretary only," with a narrow `contacts_directory` view exposing just name/phone/email to everyone else. But that file's own header says: *"NOT applied/verified on live DB."*

If that migration was never actually run against your production database, the **older** policy (`sql/private_contacts_rls.sql`) is what's really in force: any contact not explicitly marked `is_private` is fully visible — notes, status, everything — to every agent. That would mean the privacy `startWorkingLead()` promises agents today ("invisible to the other agent(s)") **isn't actually true in production right now**, for every contact that isn't manually flagged private.

I can't check this myself — I don't have direct database access, only what's committed to this repo. **This is worth confirming before anything else**, independent of the new feature: run this in the Supabase SQL editor and tell me what comes back:

```sql
select polname, pg_get_expr(polqual, polrelid) as using_clause
from pg_policy
where polrelid = 'contacts'::regclass;
```

If `contacts_select`'s clause mentions `agent_id = public.current_agent_id() or public.current_agent_is_admin()` with **no** `is_private` check, migration H is live and the existing feature is doing what it claims. If it mentions `is_private = false or agent_id = ...`, migration H was never applied and non-private contacts are currently wide open to every agent.

**C. The privacy-relevant columns (notes, status, source, tags) already live directly on `contacts`, and `tasks`/`notes`/the audit-log timeline already carry an `agent_id` on every row.** That's good news for the new design — most of the plumbing needed to scope activity per-agent already exists at the column level; what's missing is the identity model above it and the RLS to match.

## 3. Proposed model

Keep `contacts` as the **shared parent** — but only for identity fields that should genuinely be the same for everyone working that person:

- `first_name`, `last_name`, `email`, `phone`, `address`, `type`
- Nothing else stays authoritative here going forward.

Add a new table, `contact_engagements` — one row per (contact, agent) pair, this is where an agent's private relationship with that person lives:

```sql
create table if not exists contact_engagements (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid not null references contacts(id) on delete cascade,
  agent_id      uuid not null references agents(id),
  status        text,              -- was contacts.status
  source        text,              -- was contacts.source
  tags          text[],            -- was contacts.tags
  notes         text,              -- was contacts.notes
  custom_fields jsonb default '{}',
  is_primary    boolean not null default false,  -- this agent's engagement is the "main" one, for legacy screens that expect exactly one
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (contact_id, agent_id)
);
create index if not exists idx_engagements_contact on contact_engagements (contact_id);
create index if not exists idx_engagements_agent   on contact_engagements (agent_id);
```

`tasks`, `notes`, and the timeline/audit-log already have both `contact_id` and `agent_id` on each row — under this model those keep working exactly as they do today, scoped by `agent_id`, no schema change needed there. Same for automation application (`contact-automations` API / `automation_fires`): it needs to start recording and checking `agent_id` alongside `contact_id`, so Agent A's campaign on a person and Agent B's campaign on the same person run independently.

**Deals stay pointed at `contacts.id`** (the shared parent) — unchanged. That's what gives you the "shared past deal history" you asked for, with no migration needed on the deals side, *as long as deals themselves are visible across agents at the RLS level* — worth a quick check, since this project has a known backlog item to audit overly-open (`using(true)`) RLS policies, and I haven't personally verified deals' current policy in this pass.

**RLS becomes simpler than the unapplied migration H, not harder** — because once status/source/tags/notes move off `contacts` and onto `contact_engagements`, the parent row genuinely has nothing private left on it. `contacts` itself can be readable by any signed-in agent (name/email/phone/address/type — that's the whole point of a shared directory), and privacy enforcement only has to happen on `contact_engagements`:

```sql
alter table contact_engagements enable row level security;

create policy engagements_select on contact_engagements
for select to authenticated
using (agent_id = public.current_agent_id() or public.current_agent_is_admin());

create policy engagements_insert on contact_engagements
for insert to authenticated
with check (agent_id = public.current_agent_id() or public.current_agent_is_admin());

create policy engagements_update on contact_engagements
for update to authenticated
using (agent_id = public.current_agent_id() or public.current_agent_is_admin());

create policy engagements_delete on contact_engagements
for delete to authenticated
using (agent_id = public.current_agent_id() or public.current_agent_is_admin());
```

(This reuses the `current_agent_id()` / `current_agent_is_admin()` helper functions `private_contacts_rls.sql` already created — no need to redefine them.)

## 4. The hard part: migrating what's already there

Because `startWorkingLead()` has presumably already been creating duplicate `contacts` rows per agent for shared people, moving to the new model isn't a clean additive change — it needs to find those duplicate rows (same person, different `agent_id`, matched by phone/email) and fold them into one parent + N engagements, while repointing every foreign key that currently references the duplicate rows (`tasks.contact_id`, `notes.linked_id` where `linked_type='contact'`, the audit log, `listing_contacts.contact_id`, offer records, `automation_fires`, anything else that references `contacts.id`).

I don't want to write that consolidation script blind — it's the one part of this with real data-loss risk if a matching heuristic is wrong (e.g., two different people who happen to share a phone number, which the existing dedup-on-create code explicitly calls out as a real scenario). Before I draft it, it's worth just measuring the size of the problem. This is **read-only** and safe to run any time:

```sql
-- How many "same person, different agent" duplicate branches exist today?
select phone, count(distinct agent_id) as agent_branches, count(*) as total_rows,
       array_agg(id) as contact_ids, array_agg(agent_id) as agent_ids
from contacts
where phone is not null
group by phone
having count(distinct agent_id) > 1
order by agent_branches desc;
```

If that comes back empty (or nearly), the migration is easy — there's little or nothing to consolidate, and we can move straight to the additive schema above plus a trivial backfill (one `contact_engagements` row per existing `contacts` row, using its current `status`/`source`/`tags`/`notes`/`agent_id`). If it comes back with real clusters, we'll design the consolidation step around exactly what that query shows, rather than guessing.

## 5. Recommended order of work

1. **Run the two read-only queries above** (RLS policy check + duplicate-branch count) and share the results. Both are safe, non-destructive, and take a minute.
2. Based on that: write and hand you the actual `contact_engagements` migration + backfill SQL (additive — doesn't touch or break anything currently working), plus the consolidation script only if step 1 shows real duplicates to merge.
3. App changes, roughly in this order: `db.js` (engagement CRUD + updated dedup/"start working" flow that creates an engagement instead of a duplicate contact), `ContactDetail.jsx` (load the current agent's own engagement instead of contact-level status/source/tags/notes), `Contacts.jsx` (board queries against engagements; replace `startWorkingLead`'s duplicate-row logic with an engagement-create), `ContactAutomations.jsx` + the `/api/contact-automations` route (scope by agent, and let non-admin agents apply/stop their own).
4. RLS: apply the `contact_engagements` policies above, and loosen `contacts` itself to identity-only-and-readable-by-all (retiring `private_contacts_rls.sql`'s `is_private` check and the unapplied migration H at the same time — they become unnecessary once nothing private is left on that table).
5. Once the app is verified working end-to-end against the new tables, decide whether to drop the now-unused `status`/`source`/`tags`/`notes`/`is_private` columns from `contacts`, or just leave them as unused legacy columns — no urgency either way.

## 6. Open question I didn't assume an answer to

Custom fields: you said "past deals or custom fields if needed" without specifying whether a custom field should be shared (part of the person's identity, like a spouse's name) or private (part of one agent's working relationship, like their own qualification notes). The schema above puts `custom_fields` on the engagement (private) by default. If you want some custom fields shared instead, that's a small addition to `contacts` itself — just let me know which ones.
