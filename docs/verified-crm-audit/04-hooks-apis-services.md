# Custom Hooks, APIs, Services, and Shared Utilities

## Client hooks

| Hook/module | Verified behavior | Status |
|---|---|---|
| `useAgents` | CRUD/realtime wrapper for `agents` | **Verified** |
| `useContacts` | CRUD/realtime wrapper for `contacts` | **Verified** |
| `useDeals` | CRUD/realtime wrapper for `deals` | **Verified** |
| `useListings` | CRUD/realtime wrapper for `listings` | **Verified** |
| `useGifts` | CRUD/realtime wrapper for `gifts` | **Verified** |
| `useOffers` | CRUD/realtime wrapper for `offers` | **Verified** |
| `useTransactions` | CRUD/realtime wrapper for `transactions` | **Verified** |
| `useTasks` | CRUD/realtime wrapper for `tasks` | **Verified** |
| `useCalls` | Read/update/realtime wrapper for `calls` | **Verified** |
| `useCalendar` | CRUD/realtime wrapper for `calendar_events` | **Verified** |
| `useOpenHouses` | CRUD/realtime wrapper for `open_houses` | **Verified** |
| `useAnnouncements` | CRUD/realtime wrapper for `announcements` | **Verified** |
| `useSigns` | CRUD/realtime wrapper for `signs` | **Verified** |
| `useListingPrep` | CRUD/realtime wrapper for `listing_prep` | **Verified** |
| `useEmailTemplates` | CRUD/realtime wrapper for `email_templates` | **Partially verified** — table creation SQL is missing |
| `useAutomations` | CRUD/realtime wrapper for `automations` | **Verified** |
| `useAuditLog` | Read/realtime wrapper for `audit_log` | **Partially verified** — table creation SQL is missing |
| `useIsMobile` | Window-width responsive state | **Verified** |
| `useFeature` | Feature-flag lookup and access logic | **Verified** |
| `useAudioNote` | Audio capture/upload helper | **Verified** |
| `usePageView` | Page-view tracking from `PageViewTracking` | **Verified** |
| `useCommandPalette` | Command palette open/close state | **Verified** |

- **Verified** — Most entity hooks are generated through the internal `useTable` pattern in `src/lib/hooks.js`.
- **Security risk** — Client hooks rely on RLS for authorization. Their ability to query a table is not proof that the live table is correctly protected.
- **Verified** — Additional realtime consumers exist in activity log/feed, notification, and SMS components outside `useTable`.

## Client services and utilities

| Area | Files | Status |
|---|---|---|
| Data access | `db.js`, inactive `db/*.js` modules | **Verified** — `db.js` is used; modular copies have no imports |
| Authentication/API | `apiAuth.js`, `permissions.js`, `supabase.js` | **Verified** |
| Email | `emailService.js`, `contactEmailSend.js` | **Verified** |
| Automation | `automationConstants.js`, `automationDispatcher.js`, `automationEngine.js` | **Verified** |
| Reporting/analytics | `analytics.js`, `reportEngine.js`, `goals.js` | **Verified** |
| Dashboard/boards | `boardOptions.js`, `dashboardPrefs.js` | **Verified** |
| CRM configuration | `constants.js`, `customFields.js`, `contactLayout.js`, `tcSettings.js`, `tcPhaseMap.js`, `features.js` | **Verified** |
| Activity/notification | `activityLog.js`, `recordActivity.js`, `notifications.js`, `notify.js` | **Verified** |
| Marketing/design | `designStudio.js`, `segments.js`, `leadScoring.jsx`, `aiHouseScore.js` | **Verified** |
| Voice/audio | `voice.js`, `voiceParser.js`, `useAudioNote.js`, `storage.js` | **Verified** |
| Briefing/preferences | `dailyBriefing.js`, `holidays.js`, `userPrefs.js` | **Verified** |
| Platform helpers | `sentry.js`, `time.js`, `utils.js` | **Verified** |

- **Verified** — `src/lib/db.js` includes side effects beyond CRUD: audit/activity logging, notification attempts, automation dispatch, lifecycle behavior, and deal/listing/TC synchronization.
- **Security risk** — Cross-record synchronization in browser-side service calls is not transactional and often treats secondary-write failure as non-fatal.
- **Verified** — `userPrefs.js` exports preference functions; despite its filename, it is not a React hook.
- **Verified** — 20 `*.test.js` files cover utilities, TC mapping, email crypto/storage/sync/webhook behavior, Outlook send/account paths, system mailer, and report-mailer behavior.
- **Missing implementation** — No tests were found for route authorization as a complete matrix, RLS, board synchronization transactions, Monday import, or the five Edge Functions.

## Server shared libraries

| File | Responsibility | Status |
|---|---|---|
| `_lib/auth.js` | Supabase bearer-token validation | **Verified** |
| `_lib/phone.js` | Service client, role checks, Twilio validation, phone/IVR utilities | **Verified** |
| `_lib/connectors.js` | Integration storage, token refresh, per-agent accounts, contact access, Mailchimp/team chat | **Verified** |
| `_lib/emailCrypto.js` | AES-256-GCM token envelopes and key rotation | **Verified** |
| `_lib/emailStore.js` | Connected-email rows, sync state, messages/threads, delivery events, contact follow-up | **Verified** |
| `_lib/emailBackfill.js` | Token encryption backfill support | **Verified** |
| `_lib/emailSanitize.js` | Email content sanitization helpers | **Verified** |
| `_lib/gmailApi.js` | Gmail API calls | **Verified** |
| `_lib/gmailParse.js` | MIME/message parsing | **Verified** |
| `_lib/gmailSync.js` | Incremental history synchronization and recovery | **Verified** |
| `_lib/pubsubVerify.js` | Google Pub/Sub OIDC/JWKS verification | **Verified** |
| `_lib/systemMailer.js` | Microsoft app-only system-mailbox send and idempotency | **Verified** |
| `_lib/briefing.js` | Briefing calculations and HTML rendering | **Verified** |
| `_lib/reportEngine.js` | Report queries, calculations, and rendering | **Verified** |
| `_lib/notify.js` | In-app notification preference handling | **Verified** |
| `_lib/call-flow.js` | IVR flow execution | **Verified** |
| `_lib/default-flow.js` | Default IVR definition | **Verified** |

## API route inventory

### Identity, connectors, email, and webhooks

| Endpoint | Purpose | Authentication found in code | Status |
|---|---|---|---|
| `/api/admin-users` | Supabase Auth and `agents` administration | Hard admin role check | **Verified** |
| `/api/connectors` | Integration credentials/config, events, own-account status/disconnect | User check only when `AUTH_ENFORCE=true` | **Security risk** |
| `/api/oauth-google` | Google OAuth start/callback | None | **Security risk** |
| `/api/oauth-microsoft` | Microsoft OAuth start/callback | None | **Security risk** |
| `/api/outlook-account` | Caller-owned Outlook status/disconnect | Hard user check and linked-agent resolution | **Verified** |
| `/api/connector-send` | Delegated Gmail/Outlook send | User check only when `AUTH_ENFORCE=true`; performs agent/contact checks when a user is present | **Security risk** |
| `/api/email/gmail-watch` | Create/renew/stop caller-owned Gmail watch | Hard user check | **Verified** |
| `/api/webhooks/gmail-pubsub` | Gmail Pub/Sub push and incremental sync | Fail-closed Pub/Sub OIDC | **Verified** |
| `/api/send-email` | Resend proxy | Staged user check plus hard any-agent role check | **Verified** |
| `/api/send-campaign` | Resend campaign delivery | User check only when `AUTH_ENFORCE=true` | **Security risk** |
| `/api/unsubscribe` | Public signed unsubscribe | HMAC-like secret with predictable fallback | **Security risk** |
| `/api/webhook-inbound` | Zapier/API Nation inbound events | Always-enforced integration shared secret | **Verified** |
| `/api/system-mailer-status` | Microsoft system-mailer health/counts | Hard user check; code contains admin resolution | **Verified** |

### CRM, reporting, AI, and external data

| Endpoint | Purpose | Authentication found in code | Status |
|---|---|---|---|
| `/api/agent-activity` | Team activity aggregation | Conditional `AUTH_ENFORCE` | **Security risk** |
| `/api/ai-assistant` | OpenAI/Anthropic proxy | Staged user check plus hard any-agent role check | **Verified** |
| `/api/briefing-check` | Briefing diagnostics/manual behavior | Conditional `AUTH_ENFORCE`; also references cron secret | **Security risk** |
| `/api/calendar-push` | Push CRM events to connected Microsoft/Google calendar | Conditional `AUTH_ENFORCE` | **Security risk** |
| `/api/contact-automations` | Apply/stop/list contact automations | Conditional `AUTH_ENFORCE` | **Security risk** |
| `/api/dashboard-data` | MLS and market dashboard data | Conditional `AUTH_ENFORCE` | **Security risk** |
| `/api/dashboard-pins` | Dashboard saved filters | Conditional `AUTH_ENFORCE` | **Security risk** |
| `/api/generate-offer-pdf` | Fill offer PDF | Staged user check plus hard any-agent role check | **Verified** |
| `/api/mailchimp-sync` | Mailchimp contact sync | Conditional `AUTH_ENFORCE` | **Security risk** |
| `/api/market-data` | Mortgage rates/news | No authentication found | **Partially verified** — appears intentionally read-only |
| `/api/mls-search` | MLS Grid proxy | Conditional `AUTH_ENFORCE` | **Security risk** |
| `/api/report-send-now` | Send a report immediately | Conditional `AUTH_ENFORCE` | **Security risk** |
| `/api/send-sms` | Send Twilio SMS | Staged user check plus hard any-agent role check | **Verified** |
| `/api/sheets-export` | Google Sheets export | Conditional `AUTH_ENFORCE` | **Security risk** |
| `/api/team-notify` | Slack/Teams webhook post | Conditional `AUTH_ENFORCE` | **Security risk** |
| `/api/track-activity` | Public-site activity collection | None | **Security risk** |
| `/api/transcribe` | Audio transcription | Conditional `AUTH_ENFORCE` | **Security risk** |
| `/api/tv-data` | Read-only TV data | Display token query parameter | **Security risk** — query tokens leak more readily into logs/history |
| `/api/ping` | Health response | None | **Verified** |

### Scheduled endpoints

| Endpoint | Schedule | Authentication found in code | Status |
|---|---|---|---|
| `/api/task-reminders` | Daily at `0 12 * * *` | Validates `CRON_SECRET` only if configured | **Security risk** |
| `/api/daily-briefing-cron` | Every 30 minutes, 10:00–23:59 UTC | Validates `CRON_SECRET` only if configured | **Security risk** |
| `/api/report-cron` | Hourly | Validates `CRON_SECRET` only if configured | **Security risk** |

### Twilio

| Endpoints | Authentication found in code | Status |
|---|---|---|
| `twilio-bridge-twiml`, `twilio-browser-twiml`, `twilio-directory`, `twilio-inbound`, `twilio-listings`, `twilio-menu`, `twilio-mls-search`, `twilio-outbound-twiml`, `twilio-recording-notice`, `twilio-sms-inbound`, `twilio-status`, `twilio-voicemail-access`, `twilio-voicemail` | Signature check blocks only when validation is definitively false and `TWILIO_SIG_ENFORCE=true`; missing token/validation errors fail open | **Security risk** |
| `twilio-outbound`, `twilio-recording-proxy`, `twilio-token` | Staged user check plus hard any-agent role check | **Verified** |
| `twilio-reset-flow`, `twilio-setup` | Hard admin role check | **Verified** |

### Non-JavaScript API assets

- **Verified** — `fill_offer_pdf.py` and `generate_offer_pdf.py` are Python PDF helpers, while the active Vercel route is `generate-offer-pdf.js`.
- **Verified** — `Offer_For_Sale_Form.pdf` is the PDF form asset used by offer generation.
- **Partially verified** — The Python helpers are not referenced by the JavaScript route inventory and may be legacy/manual tools.

## API reliability observations

- **Verified** — All 70 JavaScript files under `api/` pass `node --check`.
- **Verified** — The repository smoke script verified that all route handlers have `module.exports`, every route element is imported, 670 relative source imports resolve, and 66 non-catch-all route paths are unique.
- **Security risk** — Fifteen privileged handlers rely on `AUTH_ENFORCE` as their only user-authentication gate. Many service-role APIs also accept caller-supplied record or agent identifiers, so ownership cannot be safely tied to a verified caller when that flag is off.
- **Security risk** — Several APIs return underlying `error.message`, increasing internal schema/provider disclosure.
- **Missing implementation** - There is no centralized middleware that fails closed for authentication, role, origin, method, size, and rate limits.

## Phase 1 correction

- **Verified** - `api/_lib/auth.js` and `api/_lib/requestSecurity.js` now centralize fail-closed identity, role, required-secret, constant-time, origin, and expiring-token checks for the approved Phase 1 routes.
- **Partially verified** - Rate limiting and request-size enforcement remain missing, and non-Phase-1 routes were not broadened into this PR.
