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
supabase secrets set RESEND_API_KEY=re_ShsDysNB_2MDVrReA864LkDRGCgbadc93
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your service role key from Supabase Settings>
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
