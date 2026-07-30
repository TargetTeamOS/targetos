# Environment Variables

## Audit boundary

- **Verified** — Names below are read by committed source through `process.env`, `import.meta.env`, `Deno.env`, or dynamic key lookup.
- **Unknown** — Values, scopes, and presence in live Vercel/Supabase environments were not inspected.
- **Missing implementation** — No `.env.example` or machine-readable environment schema is committed.

## Browser build variables

| Variable | Consumer/purpose | Status |
|---|---|---|
| `VITE_GOOGLE_MAPS_KEY` | Address/maps UI | **Verified** |
| `VITE_MLS_DEMO_FALLBACK` | MLS demo fallback behavior | **Verified** |
| `VITE_POSTHOG_KEY` | PostHog initialization | **Verified** |
| `VITE_SENTRY_DSN` | Sentry initialization | **Verified** |
| `VITE_SIMPLYRETS_USER` | Browser-visible SimplyRETS configuration path | **Security risk** |
| `VITE_SIMPLYRETS_PASS` | Browser-visible SimplyRETS configuration path | **Security risk** |

- **Security risk** — Every `VITE_*` value is browser-exposed by design. `VITE_SIMPLYRETS_PASS` must not contain a reusable secret.
- **Verified** — `import.meta.env.PROD` is used as Vite's built-in production flag.
- **Incorrect documentation** — `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are read by some server code through `process.env`, but the active browser client ignores them and uses hard-coded values.

## Supabase/server foundation

| Variable | Purpose | Status |
|---|---|---|
| `SUPABASE_URL` | Server/Edge project URL | **Verified** |
| `SUPABASE_SERVICE_KEY` | Service-role access in several Vercel APIs | **Verified** |
| `SUPABASE_SERVICE_ROLE_KEY` | Alternate service-role name used by server modules and Edge scheduler | **Verified** |
| `SERVICE_ROLE_KEY` | Service-role name used by four Edge Functions | **Verified** |
| `VITE_SUPABASE_URL` | Server fallback in selected API code, despite Vite prefix | **Verified** |
| `VITE_SUPABASE_ANON_KEY` | Server fallback in selected API code, despite Vite prefix | **Verified** |

- **Security risk** — Three names are used for the service credential. A deployment can configure one engine correctly while silently breaking another.
- **Security risk** — A service-role key must never be placed in a `VITE_*` value.

## Authentication, origins, cron, and URLs

| Variable | Purpose | Status |
|---|---|---|
| `AUTH_ENFORCE` | Turns staged user-auth checks in 22 handlers from log-only to blocking; 15 lack another hard user gate | **Security risk** |
| `APP_ORIGINS` | Allowed origins for hardened Gmail-watch CORS | **Verified** |
| `CRON_SECRET` | Vercel cron authorization and an unsubscribe fallback | **Security risk** |
| `UNSUB_SECRET` | Unsubscribe signature secret | **Verified** |
| `BASE_URL` | Server base URL in selected phone/URL helpers | **Verified** |
| `PUBLIC_BASE_URL` | Public URL generation | **Verified** |

- **Security risk** — `AUTH_ENFORCE` and `CRON_SECRET` controls fail open when absent.
- **Security risk** — Unsubscribe signing falls back to `CRON_SECRET`, then the hard-coded string `targetos-unsub`.

## Microsoft and connected-email encryption

| Variable | Purpose | Status |
|---|---|---|
| `MICROSOFT_SYSTEM_CLIENT_ID` | App-only system mailer client | **Verified** |
| `MICROSOFT_SYSTEM_CLIENT_SECRET` | App-only system mailer secret | **Verified** |
| `MICROSOFT_SYSTEM_TENANT_ID` | App-only system mailer tenant | **Verified** |
| `MICROSOFT_SYSTEM_MAILBOX` | Mailbox used by app-only sends | **Verified** |
| `EMAIL_TOKEN_ENCRYPTION_KEY` | Current OAuth-token AES key | **Verified** |
| `EMAIL_TOKEN_KEY_VERSION` | Current token-key version label | **Verified** |
| `EMAIL_TOKEN_ENCRYPTION_KEY_V<n>` | Dynamically discovered prior token keys | **Verified** |

- **Security risk** — Token encryption is plaintext-compatible when the current encryption key is absent.

## Gmail and Google Pub/Sub

| Variable | Purpose | Status |
|---|---|---|
| `GMAIL_PUBSUB_TOPIC` | Gmail watch topic | **Verified** |
| `GMAIL_PUBSUB_AUDIENCE` | Required OIDC audience | **Verified** |
| `GMAIL_PUBSUB_SERVICE_ACCOUNT` | Required push service-account email | **Verified** |
| `GOOGLE_OIDC_CERTS_URL` | Optional JWKS URL override | **Verified** |
| `GMAIL_API_TIMEOUT_MS` | Gmail request timeout | **Verified** |
| `GMAIL_SYNC_MAX_PAGES` | Incremental sync page bound | **Verified** |
| `GMAIL_RECOVERY_MAX_THREADS` | Recovery/backfill thread bound | **Verified** |

- **Verified** — Pub/Sub verification fails closed if its audience or service-account variables are absent.

## Email and messaging

| Variable | Purpose | Status |
|---|---|---|
| `RESEND_API_KEY` | Resend sends from Vercel and Edge Functions | **Verified** |
| `BLAST_FROM` | Campaign/report-alert sender | **Verified** |
| `ORG_POSTAL_ADDRESS` | Campaign compliance/footer data | **Verified** |

## Twilio

| Variable | Purpose | Status |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio account | **Verified** |
| `TWILIO_AUTH_TOKEN` | API credential and signature validation | **Verified** |
| `TWILIO_API_KEY_SID` | Browser Voice access-token key | **Verified** |
| `TWILIO_API_KEY_SECRET` | Browser Voice access-token secret | **Verified** |
| `TWILIO_PHONE_NUMBER` | Calling/SMS number | **Verified** |
| `TWILIO_TWIML_APP_SID` | Browser Voice TwiML application | **Verified** |
| `TWILIO_SIG_ENFORCE` | Enables blocking webhook-signature failures | **Security risk** |
| `IVR_RECORD_FULL_CALL` | Full-call recording behavior | **Verified** |

- **Security risk** — Signature validation permits requests when validation is indeterminate, including a missing Twilio auth token.

## MLS and market data

| Variable | Purpose | Status |
|---|---|---|
| `MLSGRID_API_TOKEN` | MLS Grid token name used by code | **Verified** |
| `MLSGRID_TOKEN` | Alternate MLS Grid token name | **Verified** |
| `MLSGRID_BASE` | MLS Grid API base | **Verified** |
| `MLSGRID_ORIGINATING_SYSTEM` | RESO originating-system filter/header | **Verified** |
| `SIMPLYRETS_USER` | Server-side SimplyRETS username | **Verified** |
| `SIMPLYRETS_PASS` | Server-side SimplyRETS password | **Verified** |
| `FRED_API_KEY` | FRED mortgage-rate data | **Verified** |

## AI

| Variable | Purpose | Status |
|---|---|---|
| `OPENAI_API_KEY` | AI assistant/transcription OpenAI paths | **Verified** |
| `ANTHROPIC_API_KEY` | AI assistant Anthropic path | **Verified** |

## Environment consistency risks

- **Verified** — There are alternate names for Supabase service keys and MLS Grid tokens.
- **Verified** — Several modules contain fallback production URLs or sender addresses.
- **Verified** — Edge Functions use hard-coded application URLs and, in two functions, hard-coded personal recipient mappings/lists.
- **Missing implementation** — No startup/preflight environment validator verifies required combinations, forbids service keys in browser variables, or checks that security flags are enabled.
- **Missing implementation** — No documented rotation process exists for OAuth token keys, cron/unsubscribe secrets, Twilio credentials, service keys, provider secrets, or webhook secrets.
