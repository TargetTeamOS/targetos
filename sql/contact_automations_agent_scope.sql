-- ══════════════════════════════════════════════════════════════════
-- Per-agent automation scoping on contacts (Sept 2026)
-- Companion to sql/contact_engagements.sql -- see
-- CONTACT_ENGAGEMENT_MODEL_PROPOSAL.md for the full design.
--
-- Today, `contact_automations` has one row per (contact, automation)
-- with no notion of WHICH agent applied it -- so if two agents each
-- work the same shared contact and both apply the same automation,
-- they collide on the same row: the second agent's "apply" just
-- re-activates the first agent's row, and either agent's "stop"
-- silently kills the other's running campaign. This adds agent_id so
-- each agent's campaign on a shared contact is its own independent
-- row, matching api/contact-automations.js's updated scoping.
--
-- ADDITIVE AND NON-DESTRUCTIVE: adds one nullable column, backfills
-- it from the existing applied_by (auth user id) where possible, and
-- leaves every existing row and its behavior otherwise untouched.
-- Rows that can't be backfilled (applied_by null, or no matching
-- agent) simply keep agent_id = null -- treated by the API as
-- legacy/unscoped: visible to every agent on that contact (the
-- current, pre-migration behavior), never treated as any one agent's
-- private campaign.
-- Run in the Supabase SQL editor. Idempotent.
-- ══════════════════════════════════════════════════════════════════

alter table contact_automations add column if not exists agent_id uuid references agents(id);
create index if not exists idx_contact_automations_agent on contact_automations (contact_id, automation_id, agent_id);

-- Backfill: applied_by on existing rows is the Supabase auth user id
-- (auth.users.id), not agents.id -- resolve it through agents.auth_user_id.
update contact_automations ca
set agent_id = a.id
from agents a
where ca.agent_id is null
  and ca.applied_by is not null
  and a.auth_user_id = ca.applied_by;

-- ══════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ══════════════════════════════════════════════════════════════════
-- select count(*) filter (where agent_id is not null) as scoped,
--        count(*) filter (where agent_id is null) as legacy_unscoped
-- from contact_automations;

-- ══════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ══════════════════════════════════════════════════════════════════
-- drop index if exists idx_contact_automations_agent;
-- alter table contact_automations drop column if exists agent_id;
