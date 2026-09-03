# TargetOS Edge Functions Setup Guide

## What these functions do:
- **daily-briefing** — Sends personalized emails to all 8 agents every morning at 7AM ET
- **automation-engine** — Fires when records change (new contact, deal stage change, etc.) and executes configured automation actions (emails, tasks, announcements)
- **no-activity-check** — Runs daily, flags contacts with no activity and creates follow-up tasks
- **task-overdue-check** — Runs daily, emails Yanky + Avraham a list of all overdue tasks

## Step 1 — Install Supabase CLI
```bash
npm install -g supabase
```

## Step 2 — Link your project
```bash
cd /path/to/targetos
supabase login
supabase link --project-ref sgrnyvdsyahmypibjarx
```

## Step 3 — Set secrets
```bash
supabase secrets set RESEND_API_KEY=<your Resend API key from resend.com/api-keys>
# NOTE: a real key was committed here until Sept 2 2026 (see
# docs/code-quality-audit-2026-09-02.md, finding U1) — this repo is public,
# so that key must be rotated in Resend's dashboard if it hasn't been already.
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your service role key from Supabase Settings>

# NEW (Sept 2026 audit, finding C5): daily-briefing, no-activity-check,
# and task-overdue-check used to have NO caller auth at all — anyone
# holding the public anon key (shipped in the client bundle) could
# invoke them directly and trigger a real email send. They now require
# this shared secret on every call. Generate one with
# `openssl rand -hex 32` and set it here:
supabase secrets set EDGE_FUNCTIONS_SECRET=<a long random string, e.g. from `openssl rand -hex 32`>
```

## Step 4 — Deploy all functions
```bash
supabase functions deploy daily-briefing
supabase functions deploy automation-engine
supabase functions deploy no-activity-check
supabase functions deploy task-overdue-check
```

## Step 5 — Run this SQL in Supabase SQL Editor
(This sets up the cron jobs and database webhooks)

**IMPORTANT — after Step 3/4, update whatever already schedules
`daily-briefing`, `no-activity-check`, and `task-overdue-check`** (a
`cron.schedule(...)` calling `net.http_post(...)` is the standard
Supabase pattern) so its call includes the new secret as a header, or
every scheduled run will now get a 401. Find the existing job in
Supabase → Database → Cron (or `select * from cron.job;` in the SQL
editor) and make sure its `net.http_post` call passes:
```sql
headers := jsonb_build_object(
  'Content-Type', 'application/json',
  'Authorization', 'Bearer <the same EDGE_FUNCTIONS_SECRET value from Step 3>'
)
```
`automation-engine` and `automation-scheduler` are unaffected — this
change only touches the three functions above.
