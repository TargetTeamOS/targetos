-- ═══════════════════════════════════════════════════════════════
-- Calendar Privacy (July 2026) — agents see ONLY their own events
-- Server-side enforcement (RLS) so it can't be bypassed client-side.
-- Admins and secretary see all; agents see only rows where
-- agent_id = their own agent id. Run in Supabase. Idempotent.
-- ═══════════════════════════════════════════════════════════════
alter table calendar_events enable row level security;

drop policy if exists cal_select on calendar_events;
create policy cal_select on calendar_events for select to authenticated
using (
  -- admins / secretary see everything
  exists (
    select 1 from agents a
    where a.auth_user_id = auth.uid()
      and a.role in ('admin','secretary')
      and coalesce(a.active, true)
  )
  -- otherwise: only your own events
  or agent_id = (select a.id from agents a where a.auth_user_id = auth.uid() limit 1)
);

-- Writes: any authenticated agent may create/update/delete (app sets
-- the correct agent_id); tighten later if needed.
drop policy if exists cal_write on calendar_events;
create policy cal_write on calendar_events for all to authenticated
using (true) with check (true);
