# Phase 2 access and personal integrations

Status: implementation branch; not merged or deployed to Production.

This change set addresses the approved operational findings without changing
display labels into business keys. New access decisions use stable permission
IDs (`calls.view`, `marketing.access`, `daily_briefing.access`, and
`announcements.access`).

## Implemented behavior

- Agents see a safe directory projection for non-private contacts assigned to
  other agents: name, type, status, and assigned agent only. Phone, email,
  address, notes, activity, files, deals, and edit actions remain private.
- Agents can read and edit their own full contact records.
- Call history defaults to admin and secretary. An admin may grant one agent
  access from Admin -> Users -> Call Log Access; that agent sees only their own
  calls. Recording data remains subject to the existing recording permission
  and authenticated recording proxy.
- Marketing, Daily Briefing, and Announcements are denied to agents in desktop
  navigation, mobile navigation, direct routes, and the relevant database
  policies.
- Personal Google and Outlook connection starts are owned by the authenticated
  CRM user. The Settings page reports whether platform and provider setup are
  complete without exposing configuration values.
- Contact email sends use only the authenticated agent's connected Google or
  Outlook mailbox. There is no silent shared-sender fallback. Provider errors
  are rendered as readable messages rather than `[object Object]`.
- Calendar events always save to TargetOS first. External calendar sync then
  reports success, missing personal connection, disabled external effects, or
  provider failure separately.
- Call setup now checks server/Twilio readiness before creating a local call
  record, preventing disabled environments from generating false call logs.

## Database change order

Apply these files in a controlled Supabase change window and inspect their
read-only verification output before application testing:

1. `sql/phase2/access_and_contact_directory.sql`
2. `sql/phase2/access_and_contact_directory_verify.sql` (read-only)
3. `sql/phase2/connector_prerequisites.sql`
4. `sql/phase2/connector_prerequisites_verify.sql` (read-only)

Both migrations are idempotent and preserve CRM records, integration records,
tokens, credentials, and event history. They do not send communications or
invoke external providers. Do not run the historical catch-all
`sql/connectors.sql` merely to establish email prerequisites; it contains many
unrelated legacy changes.

## Administrator configuration (names only)

The Preview deployment must have its existing browser/server Supabase
configuration plus:

- `PUBLIC_BASE_URL`
- `APP_ORIGINS`
- `OAUTH_STATE_SECRET`
- `EXTERNAL_EFFECTS_ENABLED`

Google and Microsoft application client IDs/secrets remain stored through the
admin connector workflow, not in frontend code. No secret belongs in a
`VITE_*` variable.

Register these exact callback shapes at the providers, using the same HTTPS
origin configured as `PUBLIC_BASE_URL`:

- Google: `<PUBLIC_BASE_URL>/api/oauth-google`
- Microsoft: `<PUBLIC_BASE_URL>/api/oauth-microsoft`

After changing deployment variables, redeploy the Preview before testing.
Keep `EXTERNAL_EFFECTS_ENABLED=false` for structural/ownership tests. Set it to
`true` only in an approved non-production test window with synthetic recipients;
otherwise email, calendar provider writes, calls, SMS, webhooks, and other
external effects intentionally remain blocked.

## Required Preview matrix

Use one admin, one secretary, two agents, and synthetic `CODEX TEST -` records.

- Agent A sees Agent B's allowed directory fields, but cannot open, edit,
  email, or inspect Agent B's contact.
- Each agent retains full access to their own contact.
- Marketing, Briefing, Announcements, Calls, and their direct URLs deny a
  normal agent.
- Admin and secretary retain access to restricted office workspaces.
- Grant `calls.view` to Agent A only; Agent A sees only Agent A calls and Agent
  B remains denied. Remove the grant and confirm access closes immediately
  after permission refresh/sign-in.
- Google and Microsoft Connect buttons show actionable readiness, start only
  for the signed-in user, and reject manipulated/expired state.
- With external effects disabled, email/calendar/call attempts explain that
  delivery is disabled and create no false success.
- In a separately approved external-effects window, send one email from each
  provider to a synthetic test recipient and create one synthetic calendar
  event; confirm provider Sent/Calendar state and TargetOS timeline state.

Twilio/SMS testing remains excluded until callback URLs and credentials are
separately confirmed safe.
