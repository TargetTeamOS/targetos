# Automations, Background Jobs, Users, Authentication, and Permissions

## Users and authentication

- **Verified** — Browser authentication uses Supabase email/password sessions.
- **Verified** — `AuthContext` loads the current `agents` row by `auth_user_id`; if absent, it falls back to matching the Supabase user's email.
- **Security risk** — Email fallback can attach an authenticated account to an existing agent row without a committed server-side account-linking workflow. Its safety depends on trusted/verified Supabase email ownership and live data uniqueness.
- **Verified** — The application does not enter its authenticated shell unless both a Supabase user and agent row are present.
- **Verified** — Server `requireUser` validates bearer tokens through `supabase.auth.getUser`.
- **Verified** — Server role checks resolve `agents.auth_user_id` and accept `admin`, `secretary`, and/or `agent` according to the endpoint.
- **Security risk** — 22 handlers contain staged `requireUser` checks. Seven add a hard any-agent role check; 15 privileged handlers have no independent user-authentication gate and reject a missing/invalid user only when `AUTH_ENFORCE` is exactly `true`.
- **Unknown** — The production value of `AUTH_ENFORCE` cannot be determined from the repository.

## Roles and client permissions

| Role | Default scope represented in code | Status |
|---|---|---|
| `admin` | All declared client permissions | **Verified** |
| `secretary` | Broad contacts/deals/tasks/report access, selected edit/export, no user/system/permission administration | **Verified** |
| `agent` | Own/general CRM use with reduced all-agent, delete, export, report, and administration abilities | **Verified** |

Declared permission groups:

| Group | Keys | Status |
|---|---|---|
| Contacts | view, view-all, create, edit, delete, export, import, reassign | **Verified** |
| Deals/Production | view, view-all, create, edit, edit widgets, delete, export, import, GCI/team GCI | **Verified** |
| Listings | view, view-all, create, edit, delete | **Verified** |
| Tasks | view, view-all, create, edit own/any, delete | **Verified** |
| Calls | view, view-all, make, own/all recordings, flow edit | **Verified** |
| Reports | view, export, agent stats | **Verified** |
| Administration | users, customize, permissions, system, automations, audit log, record activity, data export | **Verified** |
| Settings | profile, notifications, branding | **Verified** |

- **Verified** — Admin overrides are loaded from `system_settings` key `permission_overrides`, cached for five minutes, and applied ahead of defaults.
- **Security risk** — The committed `system_settings_all` policy is broad; if applied as written, authenticated users may be able to alter permission overrides directly.
- **Verified** — Route guards exist only for call flow, automations, custom fields, TC settings, and reports.
- **Verified** — Admin and Transaction Coordinator enforce roles within their page components.
- **Security risk** — The unguarded `/reportbuilder` route renders the same `Analytics` component that `/reports` protects with `reports.view`.
- **Partially verified** — Many pages hide controls with client permissions, but complete server/database enforcement is not present in one auditable layer.
- **Incorrect documentation** — `docs/PERMISSIONS.md` describes later enforcement phases as only designed, while the code contains some Phase 2 route guards. It is partially stale, and the unfinished server/database enforcement remains accurate.

## User administration

- **Verified** — `/api/admin-users` hard-requires an admin bearer token and then uses a Supabase service key for create, invite, update, deactivate/delete, reset, and list operations.
- **Security risk** — Create-without-password falls back to the hard-coded password `TargetOS2024!`.
- **Security risk** — If an email invite fails, the fallback account is created with the hard-coded password `Welcome2TargetOS!`, confirmed, and that password is included in the welcome email.
- **Security risk** — Hard-coded shared temporary passwords create predictable account access and should be removed before further user provisioning.
- **Verified** — The browser `Admin` page rejects non-admin users before rendering administration controls.

## Automation architecture

The repository contains overlapping automation engines:

| Engine | Trigger path | Actions/data | Status |
|---|---|---|---|
| Browser automation engine | CRM mutations through `db.js`/dispatcher | Tasks, notifications, status/stage/tag updates, email/team notifications and other configured actions | **Verified** |
| Database notification triggers | PostgreSQL triggers on contacts/deals/listings | Invokes the Supabase automation Edge Function through database notification/webhook logic | **Partially verified** |
| Supabase `automation-engine` | HTTP JSON change event | Loads active `automations`, evaluates node triggers, executes actions with service role | **Verified** |
| Supabase `automation-scheduler` | Intended hourly schedule | No-activity, closing-soon, overdue-task checks; action nodes and run logging | **Verified** |
| Supabase `no-activity-check` | Intended schedule/manual invocation | Creates re-engagement tasks from stale contacts | **Verified** |
| Supabase `task-overdue-check` | Intended schedule/manual invocation | Emails a fixed recipient list through Resend | **Verified** |
| Supabase `daily-briefing` | Intended schedule/manual invocation | Sends briefing emails through Resend | **Verified** |
| Vercel daily briefing cron | Every 30 minutes in configured UTC window | Per-agent briefing plus closing-soon automation evaluation | **Verified** |
| Vercel report cron | Hourly | Scheduled reports plus three report alert automation types | **Verified** |
| Vercel task reminder cron | Daily | Task/TC reminders and notifications | **Verified** |
| Contact automation API | UI request | Applies/stops contact automation associations | **Verified** |

## Automation and job defects

- **Verified** — `api/report-cron.js` references `RESEND_KEY` inside report alert sending but never declares it. Alert sends throw `ReferenceError` when reached.
- **Verified** — `api/daily-briefing-cron.js` references `RESEND_KEY` inside the closing-soon email action but never declares it. That action throws when reached.
- **Security risk** — All three Vercel cron endpoints accept unauthenticated requests when `CRON_SECRET` is absent.
- **Security risk** — The five Edge Function handlers contain no in-code caller authentication while using service-role credentials.
- **Unknown** — Supabase platform JWT verification may protect deployed functions, but there is no committed `config.toml` or deployment command proving it.
- **Missing implementation** — No Edge Function schedules or pg_cron definitions are committed.
- **Security risk** — `no-activity-check` and `task-overdue-check` contain hard-coded agent/recipient email data.
- **Verified** — Edge Functions disagree on the service-key variable: the scheduler uses `SUPABASE_SERVICE_ROLE_KEY`; four others use `SERVICE_ROLE_KEY`.
- **Security risk** — Multiple engines evaluate overlapping conditions such as no activity, closing soon, overdue tasks, and change-based automation. Not every engine shares the same dedupe mechanism.
- **Verified** — Vercel jobs use `briefing_sends`, `report_sends`, `automation_fires`, and system-mail claims for selected dedupe paths.
- **Partially verified** — The Edge scheduler logs `automation_runs`, but the repository lacks creation SQL for that table.
- **Verified** — The browser engine and Edge engines use different automation representations (`nodes` versus `trigger_type`/`trigger_config`/`action_nodes`) in different paths.
- **Security risk** — Divergent automation schemas and engines can produce missed, duplicated, or behaviorally inconsistent actions.

## Background schedules

| Schedule source | Path/function | Committed schedule | Status |
|---|---|---|---|
| Vercel | `/api/task-reminders` | `0 12 * * *` | **Verified** |
| Vercel | `/api/daily-briefing-cron` | `*/30 10-23 * * *` | **Verified** |
| Vercel | `/api/report-cron` | `0 * * * *` | **Verified** |
| Supabase | `automation-engine` | Triggered by database-side notification intent | **Partially verified** |
| Supabase | `automation-scheduler` | Comment says hourly | **Unknown** — no schedule definition |
| Supabase | `daily-briefing` | No committed schedule | **Unknown** |
| Supabase | `no-activity-check` | No committed schedule | **Unknown** |
| Supabase | `task-overdue-check` | No committed schedule | **Unknown** |

## Required security model

- **Verified** — Browser permission checks must be treated as presentation only.
- **Verified** — API authentication must fail closed and derive agent identity from the validated Supabase user, never from a caller-supplied `agent_id`.
- **Verified** — Service-role handlers need explicit resource/role authorization because service-role queries bypass RLS.
- **Verified** — Database RLS and restricted RPCs must be the final enforcement layer for browser-direct Supabase calls.
- **Verified** - Cron and webhook endpoints require fail-closed secrets/signatures with safe rotation and no "configured only" bypass.

## Phase 1 correction

- **Verified** - The 14 audited flag-dependent handlers no longer consult `AUTH_ENFORCE`; their permission levels are recorded in `11-phase-1-security-implementation.md`.
- **Verified** - Predictable account password fallbacks were removed in favor of invitation/recovery flows.
- **Verified** - cron, inbound webhook, Twilio, and unsubscribe validation now fail closed when required secrets are absent or invalid.
