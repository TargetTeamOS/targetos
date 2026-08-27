# Phase 1 Reconciliation with Current `main`

Status: Partially verified — implementation and automated validation complete;
the authenticated Preview role/ownership matrix remains pending.

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

- **Verified** — Pull request #24 targets current `main` from
  `codex/phase1-main-integration`; it has not been merged.
- **Verified** — GitHub Actions Build Check #616 passed on Linux for commit
  `aa1f3186f852bf998e128fe61924c853ccf9a66b`, including static validation,
  every API syntax check, Node 24 build, smoke, and render-smoke checks.
- **Verified** — 33 Vitest files and 263 tests passed in both the push and
  pull-request workflows.
- **Verified** — Vercel reported the pull-request Preview Ready and its root
  rendered the TargetOS sign-in page.
- **Partially verified** — The original static assertion that prohibited any
  declared `RESEND_KEY` was corrected to require both explicit declaration
  and the shared external-effects guard. The delivery implementations retain
  their existing providers while remaining quarantined by default.
- **Blocked** — Authenticated administrator, two-agent, cross-agent, connector,
  and OAuth Preview tests require dedicated test users and staging-only Google
  and Microsoft accounts. These credentials were not requested or exposed.
- **Blocked** — Windows still cannot execute the installed esbuild binary and
  returns `EPERM`; Linux CI is the authoritative automated result.

No Production deployment, database migration, CRM record mutation, Twilio
test, or external communication was performed.
