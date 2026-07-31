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

## Step 2 - Link your project
```bash
cd /path/to/targetos
supabase login
supabase link --project-ref "$SUPABASE_PROJECT_REF"
```

`SUPABASE_PROJECT_REF` is environment-specific. Confirm the selected project
before running any command. No project reference in this document is a default.

## Step 3 — Set secrets
```bash
supabase secrets set --env-file ./supabase-functions.env
```

Create `supabase-functions.env` outside the repository with the required
environment-specific values. Never paste secrets into this guide or commit the
file. Any credential previously committed in documentation must be revoked.

## Step 4 — Deploy all functions
```bash
supabase functions deploy daily-briefing
supabase functions deploy automation-engine
supabase functions deploy no-activity-check
supabase functions deploy task-overdue-check
```

## Step 5 - Run this SQL in Supabase SQL Editor
(This sets up the cron jobs and database webhooks)

Before running `edge_functions_sql.sql`, configure both database settings for
the selected environment:

- `app.edge_functions_base_url`: the exact HTTPS `/functions/v1` base URL.
- `app.service_role_key`: the environment's service-role credential.

The executable SQL intentionally fails when either setting is missing; it does
not contain or fall back to a project-specific URL or key.
