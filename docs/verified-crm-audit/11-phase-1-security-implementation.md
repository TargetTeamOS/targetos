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
- **Security risk** - Identify and reset accounts created using `TargetOS2024!` or `Welcome2TargetOS!`. This PR does not alter production users.
- **Unknown** - The repository has no durable flag identifying which historical users received a fallback password. Administrators should review Supabase Auth creation dates and onboarding records; when uncertain, send recovery links to all pre-Phase-1 accounts and revoke active sessions after coordinating with users.
- **Missing implementation until configured** - Restart pending OAuth connections after deployment; old pending state is invalid.
- **Missing implementation until configured** - Replace legacy unsubscribe links; new links expire after 90 days.

## Tests and checks

- **Verified** - Added focused tests for 401/403 behavior, OAuth tampering/expiry/ownership, required-secret behavior, connector administration, unsubscribe tokens, fallback-password removal, and undeclared email-key removal.
- **Verified** - Existing connector-send tests remain unchanged.
- **Verified** - All API JavaScript files pass `node --check` locally.
- **Partially verified** - The repository validator passed its ten static source checks.
- **Partially verified** - Linux run `30569505625` exposed Node 20's missing native WebSocket support. Run `30569934750` confirmed Node 24 and exposed a test-only origin mismatch. Run `30570069359` passed unit/build/smoke and rendered all nine pages, but the generated render process retained open handles until its 60-second timeout. The harness now exits explicitly after success; rerun pending. Windows continues to block child-process execution with `EPERM`.

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
