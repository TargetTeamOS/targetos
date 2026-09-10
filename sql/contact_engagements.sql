-- ══════════════════════════════════════════════════════════════════
-- Contact Engagements (Sept 2026) — shared contact + private per-agent
-- working relationship. See CONTACT_ENGAGEMENT_MODEL_PROPOSAL.md for
-- the full design writeup.
--
-- ADDITIVE AND NON-DESTRUCTIVE: this only creates a new table and
-- backfills it. It does not alter, drop, or rename any existing
-- column, table, or RLS policy on `contacts` — those are left exactly
-- as they are today, since this repo cannot currently confirm whether
-- sql/offers_v2/H_shared_contact_directory.sql was ever applied to
-- the live database (its own header says "NOT applied/verified").
-- Tightening `contacts` itself to identity-only-and-shared is a
-- deliberate follow-up migration, not part of this file.
--
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- CORRECTED TWICE (post-diagnostic-query review):
--
-- 1st correction: this originally called public.current_agent_id()/
-- public.current_agent_is_admin(), assuming sql/private_contacts_rls.sql's
-- helper functions were live. The read-only RLS diagnostic query from
-- CONTACT_ENGAGEMENT_MODEL_PROPOSAL.md showed the LIVE `contacts` policy
-- actually uses app_current_agent_role()/app_current_agent_id() instead,
-- so this was rewritten to call public.app_current_agent_id() /
-- public.app_is_admin() / public.app_is_secretary() -- the functions
-- sql/phase1/A_safe_foundation.sql defines and sql/C4_scope_open_rls_
-- policies.sql appears to call.
--
-- 2nd correction: running that version against production failed with
-- "function public.app_is_secretary() does not exist". A direct query
-- of pg_proc (select proname, pg_get_function_identity_arguments(oid)
-- from pg_proc where pronamespace = 'public'::regnamespace and proname
-- like 'app\_%') confirmed only app_current_agent_id(), app_is_admin(),
-- and app_current_agent_role() exist from that family -- app_is_
-- secretary() and app_is_agent() were never actually created live,
-- despite being defined in sql/phase1/A_safe_foundation.sql and called
-- by sql/C4_scope_open_rls_policies.sql (whether that migration fully
-- succeeded is now an open question, outside this file's scope). The
-- failed run left no partial state (select to_regclass('public.
-- contact_engagements') returned null -- a multi-statement script in
-- the Supabase SQL editor runs as one implicit transaction, so the
-- error rolled back everything in this file, cleanly).
--
-- This version instead copies the exact live shape of the `contacts`
-- policy: agent_id = public.app_current_agent_id() or
-- public.app_current_agent_role() = any(array['admin','secretary']).
-- Both app_current_agent_id() and app_current_agent_role() are
-- confirmed live via the pg_proc query above.
-- ══════════════════════════════════════════════════════════════════

-- ── TABLE ──────────────────────────────────────────────────────────
-- One row per (contact, agent) — this is where an agent's own private
-- relationship with a shared contact lives: status, source, tags,
-- notes, and any agent-private custom fields. `contacts` itself stays
-- the shared identity (name/email/phone/address/type).
create table if not exists contact_engagements (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid not null references contacts(id) on delete cascade,
  agent_id      uuid not null references agents(id),
  status        text,
  source        text,
  tags          text[],
  notes         text,
  custom_fields jsonb not null default '{}'::jsonb,
  -- Marks the engagement that was migrated from (or matches) the
  -- legacy contacts.agent_id owner, so screens that still expect
  -- "the one owning agent" during the transition have an unambiguous
  -- row to read. Not meaningful once the app is fully engagement-aware.
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (contact_id, agent_id)
);
create index if not exists idx_engagements_contact on contact_engagements (contact_id);
create index if not exists idx_engagements_agent    on contact_engagements (agent_id);

-- ── updated_at trigger (matches the convention used elsewhere) ─────
create or replace function public.touch_contact_engagements_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_contact_engagements_updated_at on contact_engagements;
create trigger trg_contact_engagements_updated_at
before update on contact_engagements
for each row execute function public.touch_contact_engagements_updated_at();

-- ── BACKFILL ───────────────────────────────────────────────────────
-- One engagement per existing contacts row that has an assigned
-- agent, carrying over its current status/source/tags/notes.
-- Idempotent: the `where not exists` guard means re-running this
-- after new contacts/agents are added only inserts the missing rows,
-- it never duplicates or overwrites ones already backfilled.
--
-- NOTE: this does NOT attempt to detect or merge duplicate branches
-- (the same real person with more than one contacts row under
-- different agents, from the existing "Start working this lead"
-- flow in Contacts.jsx). That consolidation is a separate, later
-- step once the duplicate-branch count from
-- CONTACT_ENGAGEMENT_MODEL_PROPOSAL.md's audit query is known — this
-- backfill just gives every existing contacts row its own matching
-- engagement, which is correct regardless of whether consolidation
-- happens later (consolidation would merge multiple engagements onto
-- one contact_id afterward, not require redoing this step).
insert into contact_engagements (contact_id, agent_id, status, source, tags, notes, is_primary, created_at, updated_at)
select c.id, c.agent_id, c.status, c.source, c.tags, c.notes, true, c.created_at, c.updated_at
from contacts c
where c.agent_id is not null
  and not exists (
    select 1 from contact_engagements ce
    where ce.contact_id = c.id and ce.agent_id = c.agent_id
  );

-- ── RLS ────────────────────────────────────────────────────────────
-- An engagement is visible/editable only to the agent who owns it, or
-- an admin/secretary (matches the exact shape of the live `contacts`
-- policy: owner OR role in admin/secretary, secretary included because
-- the app's own canManage check treats secretary as a manager role too
-- -- see AuthContext.jsx). This is the actual privacy boundary for
-- status/source/tags/notes/custom_fields going forward.
alter table contact_engagements enable row level security;

drop policy if exists engagements_select on contact_engagements;
create policy engagements_select on contact_engagements
for select to authenticated
using (agent_id = public.app_current_agent_id() or public.app_current_agent_role() = any(array['admin','secretary']));

drop policy if exists engagements_insert on contact_engagements;
create policy engagements_insert on contact_engagements
for insert to authenticated
with check (agent_id = public.app_current_agent_id() or public.app_current_agent_role() = any(array['admin','secretary']));

drop policy if exists engagements_update on contact_engagements;
create policy engagements_update on contact_engagements
for update to authenticated
using (agent_id = public.app_current_agent_id() or public.app_current_agent_role() = any(array['admin','secretary']));

drop policy if exists engagements_delete on contact_engagements;
create policy engagements_delete on contact_engagements
for delete to authenticated
using (agent_id = public.app_current_agent_id() or public.app_current_agent_role() = any(array['admin','secretary']));

-- ══════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ══════════════════════════════════════════════════════════════════
-- select count(*) from contact_engagements;
--   -- expect roughly one row per contacts row that has agent_id set

-- select c.id, c.first_name, c.last_name, ce.agent_id, ce.status
-- from contacts c join contact_engagements ce on ce.contact_id = c.id
-- limit 20;
--   -- spot-check the backfill carried status/source/tags/notes over correctly

-- Runtime persona test (requires two real Auth-linked agents):
-- As Agent A: select * from contact_engagements where agent_id = <agent A id>;
--   -- expect: only Agent A's own engagement rows
-- As Agent B querying the SAME contact_id Agent A has an engagement on:
--   select * from contact_engagements where contact_id = '<shared contact id>';
--   -- expect: only Agent B's own row (if any), never Agent A's

-- ══════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ══════════════════════════════════════════════════════════════════
-- drop trigger if exists trg_contact_engagements_updated_at on contact_engagements;
-- drop function if exists public.touch_contact_engagements_updated_at();
-- drop table if exists contact_engagements;
