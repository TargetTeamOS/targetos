-- ═══════════════════════════════════════════════════════════════
-- Private Contacts — RLS ENFORCEMENT (July 19, 2026)
-- Upgrades privacy from picker-only hiding to database-level control.
-- After this runs, a private contact is invisible to every agent
-- except its assigned agent and admins — no matter what the client
-- code does. Server /api routes use the service key and bypass RLS,
-- so Twilio/cron/automation server paths are unaffected.
--
-- ⚠️ RUN THE PRE-FLIGHT CHECK FIRST. If it returns any rows, fix
--    those agents before applying, or they will lose contact access.
-- Idempotent. Rollback block at the bottom.
-- ═══════════════════════════════════════════════════════════════

-- ── PRE-FLIGHT: every active agent must be linked to an auth user ──
-- Must return ZERO rows before you apply the policies below.
select id, name, email
from agents
where active = true and auth_user_id is null;

-- ── Helper functions (security definer avoids RLS recursion) ──────
create or replace function public.current_agent_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select id from agents where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.current_agent_is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role = 'admin' from agents where auth_user_id = auth.uid() limit 1),
    false
  );
$$;

-- ── Enable RLS on contacts ────────────────────────────────────────
alter table contacts enable row level security;

-- ── SELECT: everyone sees non-private; private = owner or admin ──
drop policy if exists contacts_select on contacts;
create policy contacts_select on contacts
for select to authenticated
using (
  is_private = false
  or agent_id = public.current_agent_id()
  or public.current_agent_is_admin()
);

-- ── INSERT: any signed-in agent (matches current app behavior) ───
drop policy if exists contacts_insert on contacts;
create policy contacts_insert on contacts
for insert to authenticated
with check (auth.uid() is not null);

-- ── UPDATE/DELETE: same visibility rule as SELECT ─────────────────
drop policy if exists contacts_update on contacts;
create policy contacts_update on contacts
for update to authenticated
using (
  is_private = false
  or agent_id = public.current_agent_id()
  or public.current_agent_is_admin()
);

drop policy if exists contacts_delete on contacts;
create policy contacts_delete on contacts
for delete to authenticated
using (
  is_private = false
  or agent_id = public.current_agent_id()
  or public.current_agent_is_admin()
);

-- ── POST-CHECK (run as a normal agent in the app, not SQL editor):
--    1. Contacts board loads normally (non-private all visible)
--    2. Mark a contact 🔒 private as Agent A → Agent B search: gone
--    3. Admin still sees it everywhere
--    Note: the SQL editor uses the service role and bypasses RLS —
--    it will always show all rows. Test through the app.

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK (only if something breaks — restores pre-RLS behavior)
-- ═══════════════════════════════════════════════════════════════
-- alter table contacts disable row level security;
-- drop policy if exists contacts_select on contacts;
-- drop policy if exists contacts_insert on contacts;
-- drop policy if exists contacts_update on contacts;
-- drop policy if exists contacts_delete on contacts;
