# Phase 1 Stack Repair and External-Effects Control

Status: Verified implementation record

## Corrected stack

- PR #4 is rebuilt from the verified PR #3 head and contains only its ten
  pre-launch documentation files. Application code, tests, scripts, and file
  modes are inherited unchanged from PR #3.
- PR #5 is rebuilt on the corrected PR #4 and retains the explicit browser and
  server Supabase configuration requirements.
- The combined stack adds the ownership and external-effects corrections below.

## Authorization vocabulary

`api/_lib/auth.js` is authoritative. Roles are normalized to:

- `admin`: `admin`, `administrator`, and `owner`.
- `secretary`: `secretary`, `transaction_coordinator`, and
  `transaction coordinator`.
- `agent`: `agent`, `manager`, `team_leader`, and `team leader`.

The legacy phone authorization wrappers delegate to the authoritative helper.
Missing server configuration returns 503, an absent or invalid session returns
401, and an authenticated identity without the required role returns 403.

## Ownership corrections

- SMS attribution always uses the authenticated CRM agent. A body `agentId` is
  ignored. A contact owned by another agent is rejected unless the caller is an
  administrator and provides both `admin_override: true` and a non-trivial
  `admin_reason`. The message remains attributed to the authenticated admin.
- Outbound calling ignores body `agentId` and selects a phone only by the
  authenticated CRM agent ID. An agent cannot select another agent's phone.

## External-effects control

`EXTERNAL_EFFECTS_ENABLED` is a server-side, fail-closed switch. Only the exact
case-insensitive value `true` enables effects; missing, empty, or false values
return 503 before provider I/O. It protects email, SMS, outbound calls,
campaigns, reminders, briefings, reports, invitations, password-reset mail,
calendar and Sheets writes, team-chat tests, Mailchimp synchronization, and
outbound automation webhooks.

Provider callbacks remain reachable so providers do not enter retry storms.
When the switch is disabled, callback database bookkeeping may continue but
callback-triggered email or SMS notifications are skipped. Twilio signature
verification remains mandatory and fail-closed. No live Twilio call or SMS is
part of the automated validation.

Automated webhook delivery now passes through an authenticated server route.
That route enforces the external-effects switch and rejects non-HTTPS, local,
or private-network destinations.

## Environment strategy

- Preview and structural-test deployments: omit the variable or set it to
  `false`.
- Production: keep it `false` until a separately approved communications
  enablement change.
- CI: sets it to `true` only while provider calls are mocked and recipients are
  synthetic. A dedicated test passes an empty environment and proves the
  system mailer performs no database or provider I/O.

## Executable SQL isolation

`edge_functions_sql.sql` no longer contains a fixed Supabase project URL or
credential placeholder. It requires the environment-specific database settings
`app.edge_functions_base_url` and `app.service_role_key`; PostgreSQL fails the
statement when either setting is absent. The setup guide uses placeholders and
requires previously documented credentials to be revoked if they ever entered
repository history.

## Behavioral coverage

- Cross-agent contact rejection and explicit administrator override.
- Authenticated-agent-only phone selection.
- Canonical role aliases.
- External-effects default denial.
- System-mail denial before database claims, token requests, or provider calls.
- Rejection of unsafe automation-webhook destinations.

Manual Preview validation is still required before merge. Production deployment
and live external communications remain prohibited.
