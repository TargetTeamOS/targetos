# Phase 1 Security Implementation

Implementation branch: `codex/security-authentication-repair`
Audited base: `453461ed8bd3b07cf436f04a3dad290590ffd256`
Scope: fail-closed API authentication and secure OAuth ownership

## Scope and original risks

- **Verified** - The 14 handlers listed below previously allowed a missing/invalid bearer token whenever `AUTH_ENFORCE` was not exactly `true`.
- **Verified** - Google and Microsoft OAuth starts trusted query-string `agent_id`; OAuth state was an unsigned reusable value stored with the selected account.
- **Verified** - Connector personal-account actions trusted body `agent_id`; organization connector actions did not independently require an administrator.
- **Verified** - `admin-users.js` generated two predictable shared fallback passwords.
- **Verified** - cron and Twilio validation could allow requests when their required secret/configuration was absent; webhook validation accepted a URL secret; unsubscribe had a predictable fallback key.
- **Verified** - closing-soon and report-alert branches referenced undeclared `RESEND_KEY`.
- **Incorrect documentation** - `api/connector-send.js` was already hard-authenticated and ignored caller `agent_id`; this implementation preserves that behavior and its existing tests.

## Implemented security decisions

- **Verified** - `api/_lib/auth.js` now validates the Supabase bearer token, resolves the active linked `agents` row, and returns 401 for missing authentication or 403 for missing role/ownership.
- **Verified** - `api/_lib/requestSecurity.js` provides required-secret validation, constant-time comparison, approved origins/base URL parsing, cron/header checks, and signed expiring tokens.
- **Verified** - `api/_lib/oauthState.js` signs state with HMAC-SHA256 and binds provider, scope, Supabase user, agent, nonce, issued time, expiry, and approved redirect.
- **Verified** - OAuth start is authenticated POST-only. Organization scope requires an administrator. Callback state is signature/expiry checked, the user-agent relationship is rechecked, and the persisted nonce digest is consumed before token exchange.
- **Verified** - Database-backed nonce consumption uses a conditional update on the stored digest, so only one callback can consume the pending state.
- **Unknown** - The conditional consumption path still requires an integration test against the live Supabase schema before production.
- **Verified** - Personal connector status/disconnect always uses the authenticated agent. All other `/api/connectors` actions require an administrator.
- **Verified** - New users use Supabase invitation flows. Password reset sends a recovery email. No password is returned, displayed, or logged.
- **Verified** - cron endpoints fail with 503 when `CRON_SECRET` is absent and 401 when it is wrong. Twilio callbacks fail with 403 when signature verification cannot succeed.
- **Verified** - inbound integration secrets are accepted only in `X-Webhook-Secret`. Unsubscribe links use an expiring `UNSUB_SECRET` signature.
- **Verified** - the two undeclared `RESEND_KEY` branches now call the existing Microsoft system mailer.

## Handler permission matrix

| Handler | Required permission |
|---|---|
| `agent-activity` | Administrator |
| `briefing-check` | Administrator |
| `calendar-push` | Authenticated active agent; own delegated account, organization fallback only for administrator |
| `connectors` | Authenticated agent for personal actions; administrator for organization actions |
| `contact-automations` | Authenticated agent plus contact visibility/ownership, or administrator |
| `dashboard-data` | Authenticated agent; administrator for watch-area changes |
| `dashboard-pins` | Authenticated agent; ownership enforced for mutation; non-admin filters forced to self |
| `mailchimp-sync` | Administrator |
| `mls-search` | Authenticated agent plus existing feature-flag authorization |
| `report-send-now` | Administrator |
| `send-campaign` | Administrator |
| `sheets-export` | Authenticated active agent; own delegated account, organization fallback only for administrator |
| `team-notify` | Authorized team role |
| `transcribe` | Authenticated active agent |

## Environment and administrator actions

- **Missing implementation until configured** - Generate independent strong values for `OAUTH_STATE_SECRET`, `CRON_SECRET`, and `UNSUB_SECRET`.
- **Missing implementation until configured** - Set and verify `APP_ORIGINS`, `PUBLIC_BASE_URL`, and `TWILIO_AUTH_TOKEN`.
- **Missing implementation until configured** - Update Zapier/API Nation to send `X-Webhook-Secret`; URL query secrets are rejected.
- **Security risk** - Identify and reset accounts that may have received either retired shared fallback credential. The retired values are intentionally not reproduced in this staging record. This PR does not alter production users.
- **Unknown** - The repository has no durable flag identifying which historical users received a fallback password. Administrators should review Supabase Auth creation dates and onboarding records; when uncertain, send recovery links to all pre-Phase-1 accounts and revoke active sessions after coordinating with users.
- **Missing implementation until configured** - Restart pending OAuth connections after deployment; old pending state is invalid.
- **Missing implementation until configured** - Replace legacy unsubscribe links; new links expire after 90 days.

## Tests and checks

- **Verified** - Added focused tests for 401/403 behavior, OAuth tampering/expiry/ownership, required-secret behavior, connector administration, unsubscribe tokens, fallback-password removal, and undeclared email-key removal.
- **Verified** - Existing connector-send tests remain unchanged.
- **Verified** - All API JavaScript files pass `node --check` locally.
- **Partially verified** - The repository validator passed its ten static source checks.
- **Verified** - Linux GitHub Actions run `30570480980` passed dependency installation, static validation, all API syntax checks, unit tests, production build, smoke checks, and all nine render checks in 39 seconds.
- **Partially verified** - Earlier runs `30569505625`, `30569934750`, and `30570069359` exposed and corrected the Node/WebSocket version, test-only origin list, and render-harness retained-handle issues. Windows continues to block child-process execution with `EPERM`; Linux CI is the authoritative full check.
- **Verified** - Final staging-readiness commit `2e904349a50d8bda0a4def72aa16ae4f198501a4` passed both Linux Build Check runs: push run `30578751561` in 37 seconds and pull-request run `30578754442` in 41 seconds.

## Deployment prerequisites and rollback

- **Verified** - Do not deploy until all required secrets are configured and GitHub Actions passes.
- **Verified** - Stage with one account per role, exercise personal and organization OAuth, verify Twilio signatures against the deployed public URL, and test Zapier/API Nation with the header secret.
- **Verified** - Roll back by reverting the single Phase 1 commit and restoring the preceding application version. Retain prior provider credentials during the staging window.
- **Security risk** - Rolling back re-enables the audited fail-open behavior; rollback should be used only to restore availability while an immediate security correction is prepared.

## Remaining risks

- **Security risk** - Browser-direct Supabase access and live RLS remain outside this PR.
- **Security risk** - Unscoped API handlers not included in the audited set may still use staged authentication; they require a separate approved phase.
- **Unknown** - Live environment values, database policies, migration state, and third-party provider configuration have not been inspected.
- **Missing implementation** - Rate limiting, request-size limits, centralized security logging, and production OAuth concurrency testing remain.

## Final pull-request review

Review date: 2026-07-30
Pull request: `#3`
Reviewed base: `codex/verified-crm-audit` at `453461ed8bd3b07cf436f04a3dad290590ffd256`
Reviewed head before staging-readiness corrections: `05235f17d3986c934b0463fe08feb0493608eb1f`

- **Verified** - The five-commit chain is linear and starts from the approved audited base.
- **Verified** - GitHub reports 47 changed files. Forty-six have content changes; `scripts/validate.js` has only an accidental mode change from executable to non-executable.
- **Verified** - The content changes are confined to Phase 1 authentication, OAuth/connector ownership, protected jobs and callbacks, password provisioning, the two automated-email runtime corrections, security tests, CI, and verified-audit documentation. No unrelated CRM entity, page, schema, synchronization, Outlook-inbound, Monday.com, or automation feature was added.
- **Verified** - The 14 audited API handlers call fail-closed authentication and no longer consult `AUTH_ENFORCE`.
- **Verified** - Personal connector status, disconnect, calendar, Sheets, and OAuth ownership derive the agent from the validated Supabase user. Caller body/query `agent_id` is not used as identity.
- **Verified** - Google and Microsoft starts are authenticated `POST` requests. State is signed, expires after ten minutes, binds provider/scope/user/agent/origin/nonce, and is conditionally consumed once before token exchange.
- **Verified** - Personal connector management is restricted to the authenticated agent. Organization connector configuration, credential display, event access, testing, and disconnect actions require an administrator.
- **Verified** - The two predictable passwords and administrator-selected reset passwords were removed; invitation and recovery flows are used instead.
- **Verified** - Missing/incorrect cron credentials, missing/incorrect Twilio verification, bad webhook secrets, and missing/invalid unsubscribe secrets no longer allow the protected operation.
- **Verified** - The undeclared `RESEND_KEY` branches now use `sendSystemEmail`.
- **Verified** - No production secret value was added. Workflow values are visibly test-only and `.env.example` contains blank secret placeholders.
- **Verified correction** - Review found that `api/calendar-push.js` and `api/sheets-export.js` unnecessarily removed the existing authenticated organization-account fallback for non-admin agents. The fallback was restored while organization connector management remains admin-only. A regression assertion was added.
- **Verified correction** - Stale fail-open comments in `api/task-reminders.js`, `api/webhook-inbound.js`, and the active Twilio validation description were corrected. No protected behavior was relaxed.
- **Verified correction** - The final commit must restore executable mode `100755` on `scripts/validate.js`; this is a mode-only correction with no source change.
- **Verified** - With those narrow corrections, the final PR review and both Linux Build Check runs pass. Staging approval remains conditional on required environment configuration, preview access, and the blocked live tests below.

Exact review concerns:

| Concern | Exact location | Disposition |
|---|---|---|
| Organization calendar fallback was restricted more than the approved management rule and broke an existing authenticated workflow | `api/calendar-push.js:77` and the following fallback block | Corrected; authenticated use restored, configuration remains admin-only |
| Organization Sheets fallback was restricted more than the approved management rule | `api/sheets-export.js:47` and the following fallback block | Corrected; authenticated use restored, configuration remains admin-only |
| Twilio comments still described log-only/flag-controlled behavior after enforcement became unconditional | `api/_lib/phone.js:147` and the `checkTwilioSignature` block | Corrected; unreachable fail-open branch removed |
| Cron and inbound-webhook comments described superseded fail-open/query-secret behavior | `api/task-reminders.js:13`; `api/webhook-inbound.js:4` | Corrected; behavior unchanged |
| Organization-fallback preservation lacked a regression assertion | `src/lib/connectorsAuthorization.test.js:25` | Corrected |
| Validator executable bit was removed by the Windows-created commit | `scripts/validate.js` file mode (`100755` to `100644`), not a line-addressable change | Must be restored in the staging-review commit |
| Some pre-existing Twilio paths can direct preview activity to production callback URLs | `api/twilio-outbound.js:39`; `api/twilio-setup.js:35`; `api/twilio-inbound.js:79` | Not changed in this PR; blocks real Twilio outbound/setup staging tests |

## Staging configuration checklist

Configure values in Vercel under the `targetos` project, scoped to **Preview** and, where supported, specifically to branch `codex/security-authentication-repair`. Do not copy production secret values into Preview. After any change, redeploy the preview because serverless functions receive environment values at build/deployment time.

Preview origin used by PR #3:

`https://targetos-git-codex-security-authentication-repair-target-team.vercel.app`

| Variable | Protection and dependent code | Staging value and format | Missing behavior | Different from production | Redeploy |
|---|---|---|---|---|---|
| `OAUTH_STATE_SECRET` | HMAC integrity, expiry, ownership, and replay protection in `oauth-google`, `oauth-microsoft`, and `_lib/oauthState` | Independent random secret generated by a cryptographically secure password/secret generator; at least 32 random bytes, stored as an opaque string with no surrounding quotes or whitespace | OAuth start/callback returns 503 or fails before authorization | **Required** | **Yes** |
| `CRON_SECRET` | Bearer authentication for `task-reminders`, `daily-briefing-cron`, and `report-cron` | Independent random secret of at least 32 random bytes; Vercel sends it as `Authorization: Bearer <value>` | Routes return 503 and send nothing | **Required** | **Yes** |
| `UNSUB_SECRET` | Ninety-day signed unsubscribe tokens in `unsubscribe` and campaign links | Independent random secret of at least 32 random bytes; do not reuse the cron or OAuth secret | Token generation fails; verification returns 503 and no unsubscribe write occurs | **Required** | **Yes** |
| `APP_ORIGINS` | Allowed browser origins for hardened connector/email CORS and redirect validation | Comma-separated exact HTTPS origins, no paths. For this preview use the preview origin above. Add another staging origin only if it is actually used | Cross-origin browser calls receive no allow-origin header; unapproved redirect targets are rejected | **Normally required**; staging must not implicitly trust production-only origins | **Yes** |
| `PUBLIC_BASE_URL` | OAuth callback construction, approved redirects, admin invite/recovery links, connector inbound URL display, and Twilio signature reconstruction | Exact HTTPS origin only, no path/query/fragment and no trailing slash. For this preview use the preview origin above | OAuth/admin/connectors return 503 where required; Twilio verification returns 403 | **Required** | **Yes** |
| `TWILIO_AUTH_TOKEN` | Twilio request-signature verification and authenticated recording retrieval | Use the auth token for a dedicated staging Twilio account/subaccount; copy exactly from Twilio, with no quotes/whitespace | Every protected Twilio callback returns 403 | **Required** | **Yes** |

Generate each application-owned secret independently in a private administrator shell or password manager, for example with a cryptographically secure 32-byte-or-longer generator. Paste it directly into Vercel's encrypted environment-variable UI. Do not place generated values in shell history arguments, tickets, chat, screenshots, repository files, PR text, or build logs. `TWILIO_AUTH_TOKEN` is supplied by Twilio and must not be locally invented.

### Existing environment dependencies still used by Phase 1 paths

| Variables | Purpose and staging requirement |
|---|---|
| `SUPABASE_URL` plus `SUPABASE_SERVICE_KEY` or `SUPABASE_SERVICE_ROLE_KEY` | JWT validation, agent ownership resolution, connectors, OAuth pending-state storage/consumption, jobs, and service-role queries. Use the staging Supabase project. Do not put a service key in any `VITE_*` variable. |
| `EMAIL_TOKEN_ENCRYPTION_KEY`, `EMAIL_TOKEN_KEY_VERSION`, prior `EMAIL_TOKEN_ENCRYPTION_KEY_V<n>` values | OAuth token sealing/opening and rotation. Encryption remains plaintext-compatible when the current key is absent, so a staging key is strongly required even though this PR does not make it mandatory. |
| `MICROSOFT_SYSTEM_TENANT_ID`, `MICROSOFT_SYSTEM_CLIENT_ID`, `MICROSOFT_SYSTEM_CLIENT_SECRET`, `MICROSOFT_SYSTEM_MAILBOX` | System mailer used by scheduled reports, reminders, briefings, and the two repaired alert branches. Use a staging/test mailbox and application. |
| `RESEND_API_KEY`, `BLAST_FROM`, `ORG_POSTAL_ADDRESS` | Existing campaign, send-now, and welcome-email paths. Use a staging Resend credential and non-production recipients/sender policy. |
| `TWILIO_ACCOUNT_SID` | Existing authenticated recording retrieval and Twilio API operations. It must belong to the same staging account as `TWILIO_AUTH_TOKEN`. |
| `OPENAI_API_KEY` | Authenticated transcription route. Use a staging/restricted key if transcription is tested. |
| `MLSGRID_BASE`, `MLSGRID_TOKEN`, `MLSGRID_API_TOKEN`, `MLSGRID_ORIGINATING_SYSTEM` | Authenticated MLS and dashboard routes. Use provider-approved test/demo configuration. |
| `BASE_URL` | A legacy callback in `twilio-inbound` still reads this separate name. If staging Twilio is tested, set it to the same preview origin as `PUBLIC_BASE_URL`; several other older Twilio paths remain hard-coded to production and are listed as a blocker below. |
| `VITE_SUPABASE_ANON_KEY` | Legacy fallback in `_lib/phone`; it is not a substitute for the service key on service-role Phase 1 routes. |

`AUTH_ENFORCE` and `TWILIO_SIG_ENFORCE` are not relied on by the hardened Phase 1 behavior.

## External-service staging updates

### Microsoft Entra

1. Use a staging app registration or add a staging **Web** redirect URI to the approved non-production registration:
   `https://targetos-git-codex-security-authentication-repair-target-team.vercel.app/api/oauth-microsoft`
2. Preserve delegated permissions `offline_access`, `Mail.Send`, `User.Read`, and `Calendars.ReadWrite`.
3. Keep the production redirect URI registered; do not replace it.
4. Store the staging client ID and client secret in the staging `integrations` row through Admin -> Connectors. Only an administrator may perform this operation.
5. Personal start: authenticated `POST /api/oauth-microsoft?step=start`.
6. Organization start: administrator-authenticated `POST /api/oauth-microsoft?step=start&scope=organization`.
7. Expected start response is `200` JSON containing the Microsoft authorization URL. Missing login returns `401`; non-admin organization start returns `403`; missing staging configuration returns `400`/`503`.

### Google Cloud OAuth

1. Use a staging OAuth client or add this authorized redirect URI:
   `https://targetos-git-codex-security-authentication-repair-target-team.vercel.app/api/oauth-google`
2. If the OAuth client records authorized JavaScript origins, add the exact preview origin without a trailing slash.
3. Preserve the requested Gmail send/read-only, Sheets, Calendar Events, and user-email scopes and add only staging test users while the consent screen is in test mode.
4. Store staging client credentials through Admin -> Connectors; do not replace production credentials.
5. Personal start: authenticated `POST /api/oauth-google?step=start`.
6. Organization start: administrator-authenticated `POST /api/oauth-google?step=start&scope=organization`.
7. Expected responses match Microsoft: `200` with an authorization URL, `401` without login, `403` for non-admin organization scope, and `400` for invalid/expired/reused callback state.

### Twilio

1. Use a staging Twilio subaccount, phone number, and TwiML application. Do not point a production number at the preview.
2. Set the staging number's voice webhook to:
   `POST <preview-origin>/api/twilio-inbound`
3. Set the staging number's messaging webhook to:
   `POST <preview-origin>/api/twilio-sms-inbound`
4. Configure call/status/recording callbacks as applicable at:
   `<preview-origin>/api/twilio-status`,
   `<preview-origin>/api/twilio-recording-notice`,
   `<preview-origin>/api/twilio-voicemail`,
   and the generated menu/directory/listings/MLS routes returned by TwiML.
5. Twilio supplies `X-Twilio-Signature`; administrators must not manufacture or proxy-rewrite it. The scheme, host, path, query, method, and form parameters seen by the function must match the URL Twilio signed.
6. Valid signatures continue into the existing TwiML behavior. Invalid, missing, or unverifiable signatures return `403 Forbidden`.
7. **Blocked risk** - `twilio-outbound.js` and `twilio-setup.js` contain production-hard-coded callback bases, and one `twilio-inbound.js` callback reads legacy `BASE_URL`. Do not run real staging outbound/setup calls until those existing paths are isolated from production in an approved Twilio follow-up.

### Zapier, API Nation, and other webhook callers

- Zapier URL: `POST <preview-origin>/api/webhook-inbound?source=zapier`
- API Nation URL: `POST <preview-origin>/api/webhook-inbound?source=apination`
- Required header: `X-Webhook-Secret: <the corresponding staging integrations-row secret>`
- Required content type: `Content-Type: application/json`
- Supported event payloads remain `contact.create` and `note.add`.
- Do not send `secret` in the query string or body; those locations are ignored.
- Wrong/missing secret returns `401 {"error":"bad secret"}`. Missing staging connector configuration returns `503`. A valid test request may create data, so use staging-only contacts and records.
- Any other machine caller must use its own staging `zapier` or `apination` connector secret and the same header contract. Do not reuse a production webhook secret.

### Existing cron jobs

- Routes are `<preview-origin>/api/task-reminders`, `/api/daily-briefing-cron`, and `/api/report-cron`.
- Send `Authorization: Bearer <staging CRON_SECRET>`.
- Wrong credential returns `401`; missing/short server configuration returns `503`. Neither condition runs the job.
- Vercel schedules use `CRON_SECRET` automatically when configured. External schedulers must be updated manually.
- Do not manually trigger a valid cron in staging until recipients, Microsoft system mailbox, and data are confirmed non-production.

### Existing unsubscribe links

- New link format remains `/api/unsubscribe?email=<encoded-email>&token=<signed-token>`, but the token is now an expiring HMAC envelope tied to the normalized email.
- Invalid/expired token returns `400`; missing `UNSUB_SECRET` returns `503`; neither writes an unsubscribe row.
- Previously issued legacy tokens cannot be converted. Regenerate campaign links after staging/production secrets are set.

## Preview test record

Preview URL:

`https://targetos-git-codex-security-authentication-repair-target-team.vercel.app`

- **Verified** - The deployment is reachable but protected by Vercel authentication. An unauthenticated browser is redirected to `vercel.com/login` before TargetOS or any `/api` handler executes.
- **Blocked** - No authenticated Vercel preview session, staging CRM test accounts, staging provider accounts, or staging-only secrets were available to this review. The protection was not bypassed.
- **Verified** - GitHub registered the final staging-readiness commit as the sixth commit in PR #3. Push Build Check run `30578751561` and pull-request Build Check run `30578754442` both passed.
- **Verified** - Vercel reported the branch preview Ready after building commit `2e904349a50d8bda0a4def72aa16ae4f198501a4`.
- **Verified** - A local `node --check` pass completed for every API JavaScript file after the correction.
- **Blocked locally** - Focused local Vitest execution could not start because this Windows checkout does not contain the Vitest executable/dependency installation. The two successful Linux Build Check runs are the authoritative automated results for the final correction.

| Requested staging test | Result | Evidence/action |
|---|---|---|
| 1. Unauthenticated API returns 401 | **Blocked live**; **passed unit/code review** | Vercel login intercepts requests. `authFailClosed.test.js` covers 401. |
| 2. Unauthorized role returns 403 | **Blocked live**; **passed unit/code review** | `authFailClosed.test.js` covers role denial. |
| 3. Cross-agent connector access denied | **Blocked live**; **passed unit/code review** | Personal queries use authenticated `identity.agent.id`. |
| 4. Caller `agent_id` cannot change ownership | **Blocked live**; **passed unit/code review** | Connector/OAuth tests and source assertions ignore it. |
| 5. Admin connector actions reject non-admin | **Blocked live**; **passed unit/code review** | Connector authorization tests cover the policy. |
| 6-7. Google/Microsoft starts use logged-in owner | **Blocked live**; **passed unit/code review** | Authenticated POST and signed owner fields are tested. |
| 8. Invalid OAuth state rejected | **Blocked live**; **passed unit** | Tamper test passes in Linux CI. |
| 9. Expired OAuth state rejected | **Blocked live**; **passed unit** | Expiry test passes in Linux CI. |
| 10. Reused OAuth state rejected | **Blocked** | Digest/conditional-consumption code reviewed; requires live staging database callback test. |
| 11. Incorrect cron secret rejected | **Blocked live**; **passed unit** | Expected `401`. |
| 12. Missing cron secret fails closed | **Blocked live**; **passed unit** | Expected `503`. |
| 13. Incorrect webhook secret rejected | **Blocked live**; **passed unit/code review** | Expected `401`; live test needs staging integrations row. |
| 14. Invalid Twilio signature rejected | **Blocked live**; **passed unit/code review** | Validator denies missing configuration; handlers return `403`. |
| 15. Invalid unsubscribe token rejected | **Blocked live**; **passed unit** | Invalid/expired token coverage passes in Linux CI. |
| 16. Authorized connected email still sends | **Blocked live**; **passed existing route tests** | Requires staging mailbox and recipient; no production send attempted. |
| 17. CRM login and authorized pages work | **Blocked live**; **passed build/render checks** | Requires preview access and staging CRM users. |
| 18. No production data changes | **Passed** | No provider authorization, valid webhook, valid cron, email send, user change, or database mutation was performed. |

No live test failed; the listed items are blocked rather than failed.

## Historical fallback-password account review

- **Unknown** - The old provisioning paths did not store a durable marker identifying accounts that received either retired shared fallback credential.
- **Partially verified heuristic** - High-priority candidates are Auth users created while the pre-Phase-1 handler was deployed, especially records with no `invited_at`, immediate `email_confirmed_at`, and a matching `agents.created_at`. This is not proof because legitimate administrator-created accounts can have the same timestamps.

Safe administrator procedure:

1. Determine the production deployment timestamp at which the old handler stopped being active.
2. Export/read Auth user metadata and `agents` linkage for accounts created before that timestamp; do not export password hashes or tokens.
3. Review Supabase Auth audit logs, onboarding records, administrator communications, `invited_at`, `created_at`, `email_confirmed_at`, and last-sign-in data to narrow candidates.
4. Coordinate with each candidate user and send an individual Supabase recovery link using the repaired administrator action.
5. After the user confirms the new password, revoke that user's existing sessions through the approved Supabase administrator workflow.
6. Record completion in an access-review ledger containing user ID, email, review reason, reset date, and administrator - never a password.
7. For uncertainty, prefer a coordinated recovery campaign for all pre-Phase-1 administrator-provisioned users. Do not bulk-disable or silently reset active users.

This review did not display passwords, reset users, disable users, revoke sessions, or modify production Auth records.

## Legacy OAuth, link, cron, and webhook impact

| Existing item | Impact |
|---|---|
| OAuth attempt started before Phase 1 | **Must restart.** Unsigned/reusable legacy state does not satisfy the new signature and nonce record. |
| Existing connected Google account | **Remains valid.** Stored access/refresh tokens and account ownership rows are preserved. Reconnect only if token refresh independently fails. |
| Existing connected Microsoft account | **Remains valid.** The same token/account storage remains. Reconnect only for provider revocation/refresh failure. |
| Existing organization Google/Microsoft connector | **Remains valid.** Management is admin-only; authenticated calendar/Sheets fallback use remains supported after the staging-review correction. |
| Old unsubscribe link | **Must regenerate.** Legacy signatures and predictable fallback tokens are rejected; new links expire after 90 days. |
| Scheduled cron using old/missing credential | **Administrator update required.** It receives 401/503 and performs no work until it sends the current environment-scoped secret. |
| Zapier/API Nation URL query or body secret | **Administrator update required.** Move the existing staging secret to `X-Webhook-Secret`; query/body secrets are ignored. |
| Twilio callback with valid current-account signature and exact URL | **Remains valid.** Missing token, URL mismatch, proxy rewrite, or bad signature now returns 403. |

## Final rollback and staging recommendation

- **Verified** - Do not merge PR #3 directly to production and do not deploy it to production from this review.
- **Verified** - If staging fails, revert the Phase 1 commits in the staging branch and preserve logs/evidence. A rollback re-enables audited fail-open behavior, so it is an availability-only emergency measure and not an acceptable long-term state.
- **Verified** - Keep provider application credentials available during the staging window, but do not restore old OAuth state or legacy unsubscribe signatures.
- **Partially verified recommendation** - PR #3 is ready to merge into a **staging branch only** after the six required Preview values and existing dependencies are configured, Vercel preview access is granted, and the blocked role/OAuth/replay/email/login tests are executed with staging-only accounts and records. The correction commit is pushed, both Linux Build Check runs pass, and the preview deployment is Ready.
- **Verified** - PR #3 is not yet approved for production merge or production deployment.
