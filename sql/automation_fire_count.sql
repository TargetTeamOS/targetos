-- ═══════════════════════════════════════════════════════════════
-- Atomic automation fire-count increment (Oct 2026, round-3 bug sweep)
--
-- automationEngine.js previously incremented fire_count with a plain
-- read-then-write: `fire_count: (automation.fire_count || 0) + 1`, where
-- `automation.fire_count` was whatever value was in memory when the
-- automation was loaded (cached up to 5s by automationDispatcher.js).
-- If the same rule's trigger condition is satisfied by two records at
-- nearly the same time, both calls compute "+1" off the same stale base
-- and the second write clobbers the first -- one increment is silently
-- lost (undercounts actual fires, and would let a "fire once" throttle
-- built on this counter fire more than once before either write lands).
--
-- This RPC does the increment inside Postgres, atomically, so concurrent
-- callers can never race each other. Run this once in the Supabase SQL
-- editor; automationEngine.js calls it first and only falls back to the
-- old read-modify-write if the RPC isn't deployed yet (so nothing breaks
-- for any environment that hasn't run this migration).
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════

create or replace function increment_automation_fire_count(p_automation_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update automations
  set fire_count = coalesce(fire_count, 0) + 1,
      last_fired = now()
  where id = p_automation_id;
$$;

grant execute on function increment_automation_fire_count(uuid) to authenticated;
