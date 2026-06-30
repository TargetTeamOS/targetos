-- TargetOS V2 — Call Flow Context Storage
-- Stores the flow graph temporarily while a caller is mid-menu/language
-- selection, so the Gather action URL only needs a short ID instead of
-- the entire flow JSON embedded in the query string (which could exceed
-- URL length limits on larger flows).
--
-- Rows are short-lived (a caller answers within ~10-15 seconds) so this
-- table self-cleans: run the cleanup statement periodically, or rely on
-- the fact that rows older than a few hours are never read again anyway.

create table if not exists call_flow_contexts (
  id          uuid primary key default gen_random_uuid(),
  context     jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_call_flow_contexts_created_at
  on call_flow_contexts (created_at);

-- Run this occasionally (or set up a cron/scheduled function) to purge
-- old rows — anything older than 1 hour is guaranteed to be a finished
-- or abandoned call and is safe to delete.
-- delete from call_flow_contexts where created_at < now() - interval '1 hour';
