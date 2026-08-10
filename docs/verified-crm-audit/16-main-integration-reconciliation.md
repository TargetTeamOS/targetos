# Phase 1 Reconciliation with Current `main`

Status: Partially verified — implementation complete locally; Linux CI and
Preview validation pending.

## Source of truth

- **Verified** — The integration branch was created from remote `main` commit
  `a7d8d0744ce2957c4701d71341fc70833b475a8a` on 2026-08-10.
- **Verified** — The original working directory and its pending changes were
  not used or modified. Reconciliation was performed in a separate clean
  checkout on `codex/phase1-main-integration`.
- **Incorrect documentation** — The former stacked-PR records describe the
  July 31 branch topology. They remain useful implementation history but are
  no longer the merge plan for the current `main` lineage.

## Dependency correction

- **Verified** — The old Phase 1 branches were based on an unmerged connected-
  email lineage. Replaying them wholesale would also introduce system-mailer,
  encrypted-email-store, and connector persistence files not present on
  current `main`.
- **Verified** — Those email-only files were excluded. This reconciliation
  ports only authentication, authorization, OAuth ownership, Supabase
  configuration isolation, external-effects quarantine, and their directly
  required helpers.
- **Verified** — Existing `main` provider behavior remains in place for Resend
  report/reminder paths and personal Gmail/Outlook connector sending.

## Current-main conflict resolutions

- **Verified** — `api/connector-send.js` now ignores request `agent_id`, uses
  the authenticated active CRM agent, requires that agent's own connected
  mailbox, checks contact access before provider I/O, validates email headers,
  restricts CORS to `APP_ORIGINS`, and obeys the external-effects switch.
- **Verified** — `api/daily-briefing-cron.js`, `api/report-cron.js`, and
  `api/task-reminders.js` retain their existing providers but require both a
  valid cron secret and enabled external effects before any delivery work.
- **Verified** — `api/market-strip.js` no longer contains a project URL
  fallback and returns 503 when server Supabase configuration is unavailable.
- **Verified** — No system-mailer implementation, connected-email storage
  schema, or email synchronization feature was added by this reconciliation.

## Validation record

- **Verified** — Every JavaScript file under `api/` passes `node --check`.
- **Verified** — Repository static validation passes all non-test checks.
- **Blocked** — Windows cannot execute the installed esbuild binary and
  returns `EPERM`; therefore Vitest/build/render checks require Linux CI.
- **Unknown** — Linux CI, Vercel Preview runtime, and the synthetic role and
  ownership matrix remain pending until this local-only branch is pushed.

No Production deployment, database migration, CRM record mutation, Twilio
test, or external communication was performed.
