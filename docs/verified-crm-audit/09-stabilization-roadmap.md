# Prioritized Stabilization Roadmap

This roadmap orders repairs by exploitability, reproducibility, and dependency. No repair in this plan was implemented by the audit branch.

## Phase 1 — Critical authentication and OAuth security

**Verified priority:** P0

1. Replace conditional `AUTH_ENFORCE` blocks with a shared fail-closed `requireUser` middleware.
2. Add explicit role and resource ownership rules per endpoint; derive agent identity from the validated Supabase user.
3. Require authentication on Google/Microsoft OAuth start, create a short-lived signed state bound to user, agent, provider, redirect, and nonce, and consume it once.
4. Restrict `/api/connectors` credential/config actions to admins and “my account” actions to the caller's linked agent.
5. Remove shared passwords; use invite/reset links only, require password setup, and invalidate any accounts created with known fallbacks.
6. Make Twilio validation fail closed when enforcement is enabled, require a configured auth token, and verify proxy/public URL handling.
7. Require non-empty `CRON_SECRET`; remove the unsubscribe fallback and use a dedicated signing secret.
8. Authenticate Edge Functions in handler code or commit and verify platform JWT/service-to-service controls.
9. Lock down `system_settings`, integrations, private contacts, analytics sources, recordings, and storage with tested RLS/policies.
10. Add request-size and basic rate/abuse limits to cost-incurring/public endpoints.

**Exit criteria**

- **Verified plan** — Anonymous requests receive 401/403 on every privileged or paid endpoint without relying on an optional flag.
- **Verified plan** — OAuth tests prove one user cannot connect/disconnect another user's account and state is single-use.
- **Verified plan** — No shared or hard-coded password remains.
- **Verified plan** — Webhooks/crons fail closed in a test deployment.

## Phase 2 — Build and runtime stability

**Verified priority:** P0/P1

1. Fix undeclared `RESEND_KEY` paths or route all automated email through the system-mail abstraction.
2. Re-establish an executable Node/Vite toolchain and run tests, build, validator, smoke, and render-smoke in CI.
3. Add all routed top-level pages and critical states to render smoke.
4. Add static analysis for undefined identifiers, hooks, unused/dead imports, and API syntax.
5. Resolve stale `src/index.jsx`, unused routed-page imports, duplicate DB modules, missing direct `react-resizable` dependency, and encoding corruption.
6. Define supported Node and package-manager versions and pin CI to them.

**Exit criteria**

- **Verified plan** — Clean checkout passes install, tests, build, validator, smoke, render smoke, and lint.
- **Verified plan** — Both scheduled alert branches have regression tests.
- **Verified plan** — Every route mounts without a white screen in CI.

## Phase 3 — Database schema and migration accuracy

**Verified priority:** P0

1. Export the live schema read-only, including columns, constraints, indexes, functions, triggers, RLS, policies, storage, extensions, and schedules.
2. Reconcile all 24 missing table definitions and four missing RPC definitions.
3. Convert live state into ordered, idempotent migrations; separate deploy, rollback, verification, seed, and destructive maintenance scripts.
4. Establish a migration ledger and clean-database replay test.
5. Review every permissive policy; add role/ownership test cases for admin, secretary, agent, anonymous, and service paths.
6. Reconcile `SERVICE_ROLE_KEY` naming and Edge Function deployment configuration.

**Exit criteria**

- **Verified plan** — A blank local/test database can be built from committed migrations.
- **Verified plan** — Generated schema diff against the approved live database is empty.
- **Verified plan** — RLS tests pass for every browser-accessible table and storage bucket.

## Phase 4 — Shared hooks and data-fetching reliability

**Verified priority:** P1

1. Choose one data-access architecture and remove/quarantine the unused duplicate layer.
2. Standardize query errors, loading, cancellation, pagination, retry, and realtime channel lifecycle.
3. Prevent large unbounded browser downloads; move team analytics to scoped RPC/server queries.
4. Make permission scope explicit in hooks rather than relying on page-specific filtering.
5. Add contract tests mapping hook fields to the reconciled schema.

**Exit criteria**

- **Verified plan** — One maintained implementation exists per entity.
- **Verified plan** — Hooks expose consistent typed/validated results and do not silently swallow critical failures.
- **Verified plan** — Realtime subscriptions are unique, cleaned up, and load-tested.

## Phase 5 — Core CRM pages and records

**Verified priority:** P1

1. Validate Contacts, Contact Detail, Tasks, Calendar, Deals/Production, Listings, Offers, Calls/SMS, Notes, Signs, and TC against the reconciled schema.
2. Test create/read/update/delete, route deep links, role visibility, private contacts, attachments, exports/imports, and error states.
3. Replace private-document `getPublicUrl` usage with signed URLs and verified storage policies.
4. Resolve route/component mismatches for reports/performance/activity.
5. Decide which dashboard/page variants are canonical and retire or clearly label the rest.

**Exit criteria**

- **Verified plan** — Role-based end-to-end tests cover core records and attachments.
- **Verified plan** — No routed name renders an unrelated page unintentionally.
- **Verified plan** — Private contact documents cannot be accessed without authorized signed access.

## Phase 6 — Cross-page and board synchronization

**Verified priority:** P1

1. Define a canonical source of truth for deal, listing, and TC status/financial/address fields.
2. Move multi-record transitions into transactional RPCs or a durable server workflow.
3. Add idempotency, event/outbox records, retries, and visible failure status.
4. Expand sync-health diagnostics and build repair-only admin tooling.
5. Test concurrent updates and automation-trigger interaction.

**Exit criteria**

- **Verified plan** — A status transition commits atomically or rolls back.
- **Verified plan** — Drift is detected, attributed, retryable, and covered by integration tests.

## Phase 7 — Outlook and email integration

**Verified priority:** P1

1. Complete the secure OAuth work from Phase 1 and make token encryption mandatory.
2. Backfill/rotate historical tokens and verify no plaintext remains.
3. Define one outbound mail interface with explicit delegated/system/marketing transports, sender policy, idempotency, retry, telemetry, and failure semantics.
4. Add Gmail watch renewal monitoring/scheduling.
5. Design and implement Outlook inbound only after schema/security foundations: Graph subscription lifecycle, validation tokens, notification authentication, delta sync, renewal, replay handling, ownership, and sanitized rendering.
6. Add user-visible connection health, last sync, recoverable errors, and disconnect/revoke behavior.

**Exit criteria**

- **Verified plan** — Tokens are encrypted at rest and rotation is tested.
- **Verified plan** — Every outbound path has a documented transport and delivery contract.
- **Verified plan** — Gmail and any new Outlook inbound path survive expiration, duplicate delivery, and provider retry tests.

## Phase 8 — Monday.com and remaining integrations

**Verified priority:** P2

1. Rename/remove the fake Monday “Sync” immediately unless a real integration is approved.
2. If approved, implement authenticated Monday API access, board/item mapping, provider IDs, cursors/webhooks, updates/deletes, dry run, and idempotency.
3. Reconcile the committed CSV and hard-coded listings into an explicit one-time import migration or remove them.
4. Review Mailchimp, Slack/Teams, Zapier/API Nation, MLS, FRED, Twilio, AI, Sentry, and PostHog for ownership, secrets, rate limits, error policy, and test coverage.

**Exit criteria**

- **Verified plan** — UI labels accurately describe every integration.
- **Verified plan** — Every synchronization has stable external IDs, reconciliation rules, and safe retries.

## Phase 9 — Automations

**Verified priority:** P1/P2

1. Select one canonical automation schema and execution model.
2. Inventory and migrate active production automations before removing legacy engines.
3. Authenticate triggers, centralize actions, and use one dedupe/idempotency model.
4. Commit schedules and deployment configuration.
5. Remove fixed personal email maps/recipients and resolve recipients from authorized configuration.
6. Add run state, retries, dead-letter handling, observability, and manual safe replay.

**Exit criteria**

- **Verified plan** — Each business event is evaluated once by the intended engine.
- **Verified plan** — Duplicate/retry tests do not create duplicate emails, tasks, or record transitions.
- **Verified plan** — Operators can see and safely replay failed runs.

## Phase 10 — Testing and production readiness

**Verified priority:** Release gate

1. Add CI for install, unit tests, build, schema replay/diff, RLS tests, API auth matrix, smoke, render, and browser E2E.
2. Add dependency, secret, SAST, and migration safety scanning.
3. Create staging with separate Supabase/provider credentials and representative non-production data.
4. Run role-based UAT for admin, secretary, agent, public website, and TV board.
5. Establish backups, restore drill, observability, alerting, incident runbooks, key rotation, and rollback.
6. Measure workflow completion and production errors before assigning a final usability percentage.

**Exit criteria**

- **Verified plan** — All release gates pass from a clean checkout and clean database.
- **Verified plan** — Security review and UAT are signed off.
- **Verified plan** — Restore, rollback, OAuth rotation, and incident drills are completed.

## Recommended first repair pull request

**PR: “Fail-closed API authentication and secure OAuth ownership”**

Scope:

1. Add shared hard fail-closed authentication and role/agent resolution.
2. Convert all 15 flag-dependent privileged handlers to explicit required auth, then remove redundant staged checks from the seven handlers that already hard-require an agent role.
3. Split connector admin actions from caller-owned account actions.
4. Bind Google/Microsoft OAuth state to the authenticated user/agent; remove caller-selected ownership.
5. Remove hard-coded password fallbacks.
6. Require cron/unsubscribe secrets and add regression tests for anonymous denial, cross-agent denial, OAuth state replay, and admin-only actions.

- **Verified recommendation** — This is the first PR because it reduces active account, integration, paid-provider, and data-access exposure without depending on unresolved feature design.
- **Verified recommendation** — Database RLS hardening should follow immediately as a separate PR after a read-only live schema snapshot, because changing unknown live policies in the first PR would combine two high-risk rollback domains.
