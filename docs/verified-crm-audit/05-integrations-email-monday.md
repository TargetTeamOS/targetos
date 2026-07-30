# Integrations, Email Paths, and Monday.com

## Microsoft Outlook and Microsoft 365

### Delegated user connection

- **Verified** — `/api/oauth-microsoft` implements authorization-code OAuth against the Microsoft common tenant.
- **Verified** — Requested delegated scopes are `offline_access`, `Mail.Send`, `User.Read`, and `Calendars.ReadWrite`.
- **Verified** — The callback calls Microsoft Graph `/me` to identify the mailbox and stores tokens in `integration_accounts` for per-agent connections or `integrations` for an office-level connection.
- **Verified** — `/api/connector-send` sends delegated Outlook mail through `POST https://graph.microsoft.com/v1.0/me/sendMail` with sent-item saving.
- **Verified** — `/api/calendar-push` can create Microsoft Graph `/me/events`.
- **Verified** — `/api/outlook-account` resolves the authenticated Supabase user to an agent and exposes/disconnects only that agent's Outlook connection.
- **Security risk** — The OAuth start route itself is unauthenticated and trusts `?agent_id=`. An attacker can begin a flow for another agent, causing state and ultimately account tokens to be associated with the supplied agent.
- **Security risk** — OAuth state is stored in a database JSON secret field rather than being cryptographically bound to the authenticated browser session.
- **Verified** — The delegated scope does not include `Mail.Read`.
- **Missing implementation** — There is no Outlook inbound mail synchronization, webhook/subscription lifecycle, delta cursor, Graph notification endpoint, or Outlook message ingestion.

### Microsoft system mailbox

- **Verified** — `_lib/systemMailer.js` uses Microsoft client credentials and `https://graph.microsoft.com/.default`.
- **Verified** — It sends with `POST /v1.0/users/{MICROSOFT_SYSTEM_MAILBOX}/sendMail`.
- **Verified** — `claim_system_email` and `system_email_log` implement server-side delivery claiming/idempotency.
- **Verified** — Scheduled report, daily briefing, and task reminder primary sends use the Microsoft system mailer.
- **Partially verified** — Application registration permissions, admin consent, mailbox rights, and live environment variables are **Unknown**.

## Google

### OAuth and outbound services

- **Verified** — `/api/oauth-google` implements authorization-code OAuth and requests Gmail send/read-only, Google Sheets, Calendar Events, and user-email scopes.
- **Verified** — Google tokens can be stored per agent or at the organization level.
- **Verified** — `/api/connector-send` sends through Gmail `users/me/messages/send`.
- **Verified** — `/api/calendar-push` supports Google Calendar event creation.
- **Verified** — `/api/sheets-export` creates spreadsheet exports.
- **Security risk** — The Google OAuth start route has the same unauthenticated arbitrary-`agent_id` ownership flaw as Microsoft.

### Gmail inbound synchronization

- **Verified** — `/api/email/gmail-watch` is hard-authenticated, ignores caller-supplied ownership identifiers, and resolves the caller's linked agent and Google connection.
- **Verified** — The endpoint supports create, renew, and stop operations for Gmail `users.watch`.
- **Verified** — `/api/webhooks/gmail-pubsub` fails closed unless Google Pub/Sub OIDC issuer, audience, service account, verified email, time claims, algorithm, key ID, and RSA signature pass.
- **Verified** — Pub/Sub payload ownership is resolved by mailbox from the database; `agent_id` is not trusted from the webhook.
- **Verified** — Gmail history IDs are compared as decimal strings/`BigInt`, and sync code supports locking, incremental history, recovery limits, threads, messages, delivery events, and sync state.
- **Missing implementation** — No Vercel cron or committed Supabase schedule renews Gmail watches before expiration. Renewal currently depends on an authenticated call to the watch endpoint or external scheduling.
- **Partially verified** — Pub/Sub topic configuration, push subscription settings, OIDC audience/service account, Gmail watch state, and production delivery are **Unknown**.

## Token storage

- **Verified** — OAuth access and refresh tokens can be sealed with AES-256-GCM using a versioned environment keyring.
- **Verified** — Microsoft/Google organization OAuth client secrets are also passed through the sealing boundary.
- **Security risk** — If `EMAIL_TOKEN_ENCRYPTION_KEY` is entirely absent, `seal()` intentionally stores legacy plaintext values and `open()` accepts plaintext. Encryption is therefore optional rather than fail-closed.
- **Verified** — If an encryption key is present but malformed, writes fail closed.
- **Partially verified** — Whether production has a valid encryption key and whether historical plaintext rows were backfilled is **Unknown**.

## Email sending and synchronization paths

| Origin | Transport | Tracking/sync behavior | Status |
|---|---|---|---|
| Contact Detail composer | Delegated Outlook via `/api/connector-send` | Best-effort CRM timeline and sent telemetry after Graph accepts; no Resend fallback | **Verified** |
| General `emailService.sendEmail` | `/api/send-email` → Resend | Generic outbound path | **Verified** |
| Contacts bulk/action mail | `/api/send-email` → Resend | Hard any-agent role check | **Verified** |
| Daily Briefing manual sends | `/api/send-email` → Resend | UI-triggered | **Verified** |
| MLS Search email | `/api/send-email` → Resend | UI-triggered | **Verified** |
| Production email | `/api/send-email` → Resend | UI-triggered | **Verified** |
| Voice capture email action | `/api/send-email` → Resend | UI-triggered | **Verified** |
| Transaction Coordinator email | `/api/send-email` → Resend | UI-triggered | **Verified** |
| Email campaigns/blasts | `/api/send-campaign` → Resend | Campaign/unsubscribe tables | **Verified** |
| Scheduled reports | Microsoft system mailbox | `system_email_log` idempotency plus `report_sends` schedule dedupe | **Verified** |
| Report “send now” | Resend | Separate from scheduled system-mailer transport | **Verified** |
| Task reminders | Microsoft system mailbox | In-app preferences plus email opt-in and system-mail log | **Verified** |
| Daily briefing primary sends | Microsoft system mailbox | Explicit briefing opt-in plus `briefing_sends` and system-mail idempotency | **Verified** |
| Report alert automations | Intended Resend | References undeclared `RESEND_KEY` | **Missing implementation** |
| Daily briefing closing-soon automation | Intended Resend | References undeclared `RESEND_KEY` | **Missing implementation** |
| Twilio status/voicemail mail | Resend | Direct API calls | **Verified** |
| Supabase Edge automation/briefing/task mail | Resend | Direct API calls from Edge Functions | **Verified** |
| Gmail inbound | Gmail watch → Pub/Sub → history sync → email tables | Gmail only | **Verified** |
| Outlook inbound | None | No implementation | **Missing implementation** |

- **Verified** — The product has three outbound email transports: delegated user mailbox, Microsoft app-only system mailbox, and Resend.
- **Security risk** — Transport selection, authentication, tracking, retry, idempotency, and sender identity differ by feature; there is no single outbound mail contract.
- **Verified** — At the audited commit there is no `emailRender.js` or equivalent complete inbound email viewer/rendering path claimed by later handoff material.
- **Incorrect documentation** — Any handoff claim that Outlook inbound synchronization or the later email-viewer phase is present conflicts with this checkout.

## Monday.com

- **Verified** — `monday_production_import.csv` is committed as a static import artifact.
- **Verified** — Monday-inspired terms, statuses, board styling, import aliases, and column/group conventions appear throughout Production, Listings, Transactions, Gifts, automation UI, CSS, and constants.
- **Verified** — `ImportExport.jsx` recognizes Monday-style group-header rows and common Monday/Excel columns.
- **Verified** — Listings displays a “Sync from Monday.com” action.
- **Incorrect documentation** — That action does not call Monday.com. `syncFromMonday()` contains 20 hard-coded listing objects described in code as build-time data and writes them to Supabase.
- **Verified** — Duplicate avoidance uses a case-insensitive prefix match on the first 20 address characters; there is no provider item ID, cursor, update reconciliation, deletion handling, or durable idempotency key.
- **Missing implementation** — No Monday GraphQL/API client, OAuth/token configuration, webhook endpoint, board/item mapping table, scheduled sync, or Monday environment variable exists.
- **Security risk** — The UI labels a hard-coded import as a live API synchronization. Re-running it can skip legitimate address collisions or create drift when source records change.

## Other integrations

| Integration | Repository implementation | Status |
|---|---|---|
| Twilio | Voice SDK, outbound bridge, IVR, directory, MLS/listing search, SMS, voicemail, recordings, status callbacks | **Verified** |
| Mailchimp | Audience upsert/tagging through stored integration credentials | **Verified** |
| Slack/Teams | Generic incoming-webhook post through the `teamchat` integration | **Verified** |
| Zapier/API Nation | Inbound webhook route and integration secret/config | **Verified** |
| MLS Grid | Server-side RESO proxy | **Verified** |
| SimplyRETS | Server and optional browser configuration for MLS-related paths | **Verified** |
| FRED | Mortgage rate retrieval | **Verified** |
| OpenAI/Anthropic | AI assistant/transcription proxy paths | **Verified** |
| Sentry/PostHog | Browser initialization in `main.jsx` | **Verified** |

- **Partially verified** - Credentials, provider configuration, quotas, contractual access, and live operation for every external integration are **Unknown**.

## Phase 1 correction

- **Verified** - Google/Microsoft OAuth starts are authenticated POST requests; state is signed, expiring, provider/user/agent/scope-bound, and backed by a consumed nonce digest.
- **Verified** - Personal connector selection is derived from the authenticated agent. Organization connector configuration requires an administrator.
- **Incorrect documentation** - Earlier claims that `connector-send` needed Phase 1 hard authentication were incorrect; it already enforced authentication and caller-owned account selection.
