# Known Crashes, Technical Risks, Security Vulnerabilities, and Missing Files

## Critical verified findings

| Priority | Finding | Classification | Evidence in repository |
|---|---|---|---|
| P0 | 15 privileged API handlers rely on `AUTH_ENFORCE` as their only user-authentication gate | **Security risk** | Staged `requireUser` blocks without an independent hard role check |
| P0 | Google/Microsoft OAuth start accepts arbitrary `agent_id` without authentication | **Security risk** | `oauth-google.js`, `oauth-microsoft.js` |
| P0 | User creation/invite fallbacks use shared hard-coded passwords | **Security risk** | `admin-users.js` |
| P0 | Service-role Edge Function handlers have no in-code authentication | **Security risk** | All five `supabase/functions/*/index.ts` handlers |
| P0 | Repository cannot reproduce 24 runtime tables and four called RPCs | **Missing implementation** | Runtime reference versus SQL definition inventory |
| P1 | Report alert email branch uses undeclared `RESEND_KEY` | **Verified** runtime defect | `api/report-cron.js` |
| P1 | Closing-soon briefing automation uses undeclared `RESEND_KEY` | **Verified** runtime defect | `api/daily-briefing-cron.js` |
| P1 | Cron routes fail open when `CRON_SECRET` is absent | **Security risk** | All three Vercel cron handlers |
| P1 | OAuth token encryption permits plaintext when key is absent | **Security risk** | `_lib/emailCrypto.js` and `_lib/connectors.js` |
| P1 | Broad committed `system_settings` access can undermine permission overrides | **Security risk** | `system_settings_all` policy and `permissions.js` |

## Known crash and runtime-failure paths

- **Verified** — `runAlertAutomations()` in `api/report-cron.js` references an identifier that is not declared in module scope. The error is reached when an alert automation has a `send_email` action.
- **Verified** — The closing-soon branch in `api/daily-briefing-cron.js` has the same undeclared identifier and catches the resulting action failure, so the cron may return success while the email action failed.
- **Partially verified** — Calls to `production_totals`, `can_hear_recording`, `get_calls_list`, and `get_contact_calls` fail if those RPCs are absent from the live database. Their live existence is **Unknown**.
- **Partially verified** — Any runtime query to one of the 24 missing-definition tables fails in a clean deployment. Historical production may contain manually created versions.
- **Verified** — `ContactDetail` lists `targetos-files` objects and creates public URLs even though other repository code says that bucket is private.
- **Partially verified** — If `targetos-files` is private, agreement links produced by that component will not work as intended; if public, sensitive contact agreements may be exposed. Live bucket configuration is **Unknown**.
- **Verified** — Render smoke covers only nine page components, not the full 51-page inventory or all routed states.
- **Verified** — `SafePage` is unused, so a render failure inside any authenticated route reaches the single route-level error boundary rather than an isolated boundary per page.

## Security vulnerabilities

### Authentication and authorization

- **Security risk** — Conditional API authentication protects costly and privileged actions only when a deployment flag is enabled.
- **Security risk** — `/api/connectors` can save credentials, reveal webhook secrets, disconnect integrations, read events, and delete per-agent accounts; all are reachable without a valid user when `AUTH_ENFORCE` is off.
- **Security risk** — OAuth ownership is caller-selected at flow start.
- **Security risk** — `/reportbuilder` is an unguarded alias for team analytics.
- **Security risk** — Browser permissions are not a security boundary, and committed database enforcement is incomplete.
- **Security risk** — Service-role endpoints bypass RLS and do not share a central authorization policy.

### Webhooks, jobs, and abuse controls

- **Security risk** — Twilio signature validation fails open when validation is indeterminate and is log-only unless `TWILIO_SIG_ENFORCE=true`.
- **Security risk** — Cron endpoints are public when `CRON_SECRET` is absent.
- **Security risk** — The public tracking endpoint accepts web activity metadata without an authenticated principal or a repository-visible rate limiter.
- **Security risk** — TV authorization uses a query-string token, which is more likely to appear in browser history, proxy logs, analytics, and referrers.
- **Security risk** — Unsubscribe signatures have a predictable hard-coded fallback.
- **Missing implementation** — No common rate limiting, replay protection, request-size policy, or abuse budget is applied across APIs.

### Secrets and sensitive data

- **Security risk** — OAuth token encryption is optional.
- **Security risk** — Integration credentials are stored in database JSON and accessed with a service role; compromise of a conditionally authenticated connector route has a large blast radius.
- **Security risk** — Hard-coded temporary passwords are shared across accounts.
- **Security risk** — Browser variables include a `VITE_SIMPLYRETS_PASS` path.
- **Security risk** — Contact agreements use an inconsistent private/public storage access pattern.
- **Partially verified** — The repository is publicly cloneable. A publishable Supabase key is not itself a secret, but history and current files must still be scanned for service keys, provider secrets, OAuth tokens, personal data, and credentials.

### Data integrity and privacy

- **Security risk** — Deals, listings, and TC records are synchronized through multiple non-transactional browser writes.
- **Security risk** — Analytics downloads up to tens of thousands of rows to the browser and depends on RLS for privacy and scope.
- **Security risk** — Multiple overlapping automation engines can duplicate actions or diverge.
- **Security risk** — Several committed policies are permissive or historical; loose SQL makes policy regression likely.

## Technical debt and reliability risks

- **Verified** — There are three dashboard implementations and four unused name-matched analytics/report page modules, creating routing and maintenance ambiguity.
- **Verified** — There are parallel active/inactive database layers (`db.js` and unused `db/*.js`).
- **Verified** — `react-resizable` CSS is imported transitively through `react-grid-layout` but is not a direct package dependency.
- **Verified** — `lucide-react` is declared but no source import was found.
- **Verified** — Repository text contains mojibake/replacement characters in source comments and visible strings.
- **Verified** — NPM reports the installed Recharts 2.x line as no longer active.
- **Verified** — There is no ESLint, TypeScript check, schema generation, or API contract validation.
- **Verified** — The validator's hook-order and missing-component checks inspect only selected files, so a pass is not exhaustive.
- **Verified** — Production analytics performs large client-side aggregations rather than bounded server-side reporting.
- **Verified** — Monday “sync” is static data insertion, not provider synchronization.

## Missing migrations or repository files

| Missing artifact | Impact | Status |
|---|---|---|
| Base migrations for 24 referenced tables | Clean deployments cannot reproduce core CRM | **Missing implementation** |
| Definitions for four called RPCs | Calls/production features depend on uncommitted live objects | **Missing implementation** |
| Ordered migration history/ledger | SQL application order and drift cannot be audited | **Missing implementation** |
| Supabase `config.toml` and Edge deployment/schedule config | Edge auth and schedules cannot be reproduced | **Missing implementation** |
| `.env.example`/environment schema | Required configuration and safe defaults are not enforced | **Missing implementation** |
| CI workflow | Tests/preflight are not automatically required | **Missing implementation** |
| Outlook inbound schema/webhook/sync | Outlook is send/calendar only | **Missing implementation** |
| Gmail watch-renewal schedule | Gmail sync can expire | **Missing implementation** |
| Central API auth/authorization middleware | Security behavior is duplicated and flag-dependent | **Missing implementation** |
| Transactional CRM synchronization RPC | Linked boards can drift | **Missing implementation** |
| Complete route/render/E2E coverage | Most pages and workflows are unverified | **Missing implementation** |
| Dependency/security scanning config | Public repository risk is not continuously checked | **Missing implementation** |

## Handoff conflicts

- **Incorrect documentation** — A `/route` feature is documented but absent.
- **Incorrect documentation** — Later email-viewer/Outlook-inbound handoff claims are absent from the audited commit.
- **Incorrect documentation** — Claims of fully verified live RLS and private storage cannot be derived from this repository.
- **Incorrect documentation** — Monday.com is presented in UI/comments as a synchronization source, but no live Monday API exists.
- **Partially verified** — Handoff statements that `AUTH_ENFORCE` and Twilio signature enforcement are staged/log-only match relevant code paths, but seven staged-auth handlers also have a hard role check and the production flag values remain **Unknown**.
- **Partially verified** — Permission documentation is behind code on route guards but correctly signals that server/database enforcement is unfinished.

## Readiness assessment

- **Partially verified** — The repository demonstrates a wide and substantial CRM implementation, but it is not production-auditable or safely reproducible in its current form.
- **Partially verified** — A repository-only usability estimate would be approximately **55–65% for controlled internal use**, not a measured production uptime score. The range reflects broad UI coverage offset by security gates, missing schema, job defects, integration gaps, and blocked end-to-end verification.
- **Unknown** — Actual user usability may be higher if production contains the missing schema and secure environment settings, or lower if it does not. A live read-only audit and role-based workflow test are required for a defensible percentage.
- **Verified** — Continued development is feasible, but the next work should be stabilization and security rather than adding new surface area.
