# Robustness & Security Audit — September 2, 2026

Full-codebase pass across frontend (`src/`), serverless API (`api/`), Supabase
edge functions, SQL/RLS, and the deploy-gate scripts themselves. Goal: find
what's actually solid vs. what will crash, leak data, or silently misbehave
in production. Everything below was verified by reading the real code (file
+ line cited); a few of the highest-impact items were independently
re-checked line-by-line before writing this up.

Baseline at time of audit: `npm run build` ✓, `node scripts/smoke.js` ✓,
`node scripts/validate.js` ✗ (two false-positive "NO EXPORT" failures on
`ContactDetail.test.jsx` / `Contacts.test.jsx` — the check at line 110 scans
everything in `src/pages/`, including test files, for an export).
`node scripts/render-smoke.js` effectively unusable: the esbuild step
(`npx esbuild ...`) has no timeout and can hang indefinitely if `npx`'s
registry check stalls, and — separately — the script never called
`process.exit(0)` on its success path, so even a fully passing run could
leave the process hanging forever (some provider does work outside a
`useEffect` that leaves a handle/timer open under Node's SSR environment).
Net effect: `npm run preflight` — the single command CLAUDE.md says proves
it's safe to deploy — could not reliably complete at all going into this
audit.

**Three mechanical fixes were made directly, before writing anything else
below, since without them there was no way to prove the deploy gate itself
works:**
1. `scripts/validate.js` CHECK 8 (line 110) now excludes `*.test.jsx` —
   fixes the false-positive failures above.
2. `scripts/render-smoke.js` now calls the local `node_modules/.bin/esbuild`
   binary directly instead of `npx esbuild`, removing the network-dependent
   registry check that had no timeout.
3. `scripts/render-smoke.js`'s generated entry script now calls
   `process.exit(0)` after printing "ALL PAGES RENDER," matching the
   explicit `process.exit(1)` already present on the failure path.

`npm run preflight` now completes cleanly end-to-end in under a second
(confirmed by re-running it after these three fixes). No other files were
touched — everything else below is a finding, not a change.

---

## CRITICAL — live exposure, fix first

### C1. Twilio Auth Token can be exfiltrated via a forged webhook
`api/_lib/phone.js:329-347` (`transcribeAudio`) fetches whatever URL it's
given as `Authorization: Basic base64(TWILIO_ACCOUNT_SID:TWILIO_AUTH_TOKEN)`.
That URL comes straight from the webhook body's `RecordingUrl` field with no
validation it's actually a Twilio domain — see `api/twilio-voicemail.js:12,17`
and `api/twilio-status.js:78,98`. Both handlers *do* call
`checkTwilioSignature` (`api/_lib/phone.js:178`) before proceeding, but that
check only logs and allows the request through unless `TWILIO_SIG_ENFORCE`
is set to `'true'` (`phone.js:183,195`) — and it currently is not (per
`docs/HANDOFF.md`, confirmed log-only in code).

**Concrete exploit, live today:** POST a forged `RecordingUrl=https://
attacker.example/x` to `/api/twilio-voicemail` or `/api/twilio-status`. The
server fetches that URL with the real Twilio Account SID + Auth Token in the
`Authorization` header — full account compromise, not just spoofed call
data. This is the single highest-priority item in this report.

**Fix:** set `TWILIO_SIG_ENFORCE=true` in Vercel (blocks this and 12 other
webhooks at once), and validate `RecordingUrl` actually starts with
`https://api.twilio.com/` before fetching it, as defense in depth.

### C2. Three endpoints have no auth at all, flag says otherwise
`docs/HANDOFF.md` lists 10 endpoints as gated by `AUTH_ENFORCE`. In practice,
7 of them (`send-sms`, `send-email`, `twilio-token`, `twilio-outbound`,
`ai-assistant`, `generate-offer-pdf`, `twilio-recording-proxy`) have a
**second, unconditional** `requireAnyAgent`/`requireRole` check that already
blocks unauthenticated callers regardless of the flag. `transcribe.js`,
`report-send-now.js`, and `send-campaign.js` do **not** have that second
check — right now they're reachable by anyone on the internet.
`report-send-now.js` is worst: an anonymous caller can supply an arbitrary
report definition and recipient list, computed with the service-role
Supabase client (bypasses RLS), and have it emailed anywhere.

**Fix:** add the same `requireAnyAgent`/role check those other 7 already
have to these 3 handlers, independent of the `AUTH_ENFORCE` flag.

### C3. `CRON_SECRET` unset → cron endpoints fail open
`api/report-cron.js:18` and `api/daily-briefing-cron.js:57` use
`if (CRON_SECRET && header !== ...)` — when the env var isn't set, the
check is skipped entirely rather than blocking. `docs/HANDOFF.md`'s own
outstanding list still shows "Set CRON_SECRET in Vercel" unresolved.
`daily-briefing-cron.js` also accepts a `?force=1` param, so anyone who
finds the URL can force an immediate resend to the whole team right now.

**Fix:** set `CRON_SECRET` in Vercel; also consider making the check fail
*closed* (reject) when the secret isn't configured, not just when it
mismatches.

### C4. RLS policies that are `using (true) with check (true)` — open CRUD
`docs/HANDOFF.md` certifies "RLS ON for all tables," which is true, but
"RLS on" doesn't mean the policy does anything. `sql/connectors.sql:241`
(`agent_goals_all`) grants every authenticated agent full read/write over
every *other* agent's production numbers and goals — no ownership check.
Same open-CRUD shape (lower sensitivity, same bug class) on:
`system_settings_all` (:246), `briefing_prefs_all` (:274),
`briefing_sends_all` (:277), `contact_automations_all` (:213),
`contact_showings_all` (:229), `website_content_all` (:236),
`listing_showings_all` (:258), `tv_playlist_all` (:132). This is the same
class of bug as the `offers-v2 commit 23` fix (RLS technically on, policy a
no-op) — it just wasn't caught here yet.

**Fix:** scope each policy to the owning agent (or admin/secretary via the
existing `app_can_view_financials()`/`secretary_permissions` helpers already
built for this exact purpose in `sql/phase1/A_safe_foundation.sql`).

### C5. Supabase edge functions: no caller auth, no send-gate
`supabase/functions/{task-overdue-check,no-activity-check,daily-briefing}/index.ts`
have zero inbound auth checks — any caller holding the public anon key
(shipped in the client bundle) can invoke them. Unlike
`api/report-cron.js`/`api/daily-briefing-cron.js`, which gate on
`CRON_SECRET`, these three send real emails unconditionally, without the
`EXTERNAL_EFFECTS_ENABLED` gate `automation-engine/index.ts:8-15,37` uses
for the same kind of send. `no-activity-check/index.ts` also has no dedupe —
every invocation re-inserts a "Re-engage" task per stale contact, so repeat
calls mass-create duplicate tasks.

**Fix:** add the same secret-gate pattern used by the two `api/*-cron.js`
files, and a dedupe check before inserting tasks.

### C6. `xlsx` dependency has two unpatched high-severity CVEs
`package.json:14` pins `xlsx@^0.18.5`. `npm audit` flags prototype pollution
(GHSA-4r6h-8v6p-xvw6) and ReDoS (GHSA-5pgg-2g8v-p4x9), both `fixAvailable:
false` — SheetJS stopped patching the npm-published range. It's used
directly in `src/components/ImportExport.jsx:201-204` to parse
user-uploaded contact-import files, so a crafted `.xlsx` upload can pollute
`Object.prototype` or hang the tab.

**Fix:** migrate to SheetJS's own CDN-hosted build (their recommended
distribution channel post-CVE) or an actively patched alternative.

---

## HIGH — real crashes users will hit

### H1. `MLSSearch.jsx` — Rules of Hooks violation, crashes on normal use
`ShortlistPanel` (`src/components/MLSSearch.jsx:143-231`) declares 4
`useState` + 1 `useRef` (143-147), then an early return at line 149
(`if (shortlist.length === 0) return (...)`), then declares **3 more
hooks after that return** (158-160, 231). The panel is mounted once and
kept alive while `shortlist.length` changes. Saving the first item to an
empty shortlist (0→1) or removing the last one (1→0) while the panel is
open flips the hook count mid-life — React throws "Rendered more hooks
than during the previous render" and the page crashes. This is reachable
through ordinary use of MLS search, not an edge case.

**Fix:** move all hooks above the early return (standard Rules-of-Hooks
fix — the conditional early return in `AppContext`/other pages does this
correctly; this file is the outlier).

### H2. `TransactionCoordinator.jsx` — same bug class, believed already fixed
Lines 726-758: a comment claims hooks are "placed after every hook call...
so this conditional return never violates the rules of hooks," but
`useLocation()` (741), a `useState` (742), a `useEffect` (743-754), and 3
more `useState` calls (756-758) all come **after** the `if (!canManage)
return` at line 731. Any agent-record refresh that changes `role` while the
TC Board is open (permission change, `onAuthStateChange` firing) will flip
the hook count and crash the board — the exact React error #310 mechanism
`CLAUDE.md` already documents as a past outage, in code that believes
itself immune to it.

**Fix:** same as H1 — hoist all hooks above the conditional return.

### H3. Voice recording doesn't stop on navigation — mic stays open
`src/components/VoiceCapture.jsx` has **zero `useEffect` cleanup** — the
MediaRecorder, AudioContext, mic stream, and timers are all set up inside
`startRecord()` and only torn down in `mr.onstop`. `App.jsx:240` only
mounts it on the dashboard route, so navigating away mid-recording unmounts
the component without calling `mr.stop()` — the mic stays physically open
and a stray 2-minute hard-cap timer later fires network calls against an
unmounted component. `src/lib/useAudioNote.js` (used by Notepad) has the
identical gap but with no auto-stop timer at all — a note recording started
and abandoned via navigation leaves the mic open indefinitely.

**Fix:** add a `useEffect` cleanup that force-stops any in-progress
recording on unmount, in both files.

### H4. One error boundary for the whole app, and it doesn't reset on navigation
`src/App.jsx:68-104,138` wraps the entire route tree in a single
`<ErrorBoundary>`. A `SafePage` helper meant to key a per-route boundary
(`key={window.location.pathname}`, line 102-104) is defined but never
actually used. Once any page throws (H1/H2 above, or anything else), the
boundary's error state persists across client-side navigation since
`<Routes>` never remounts — clicking sidebar links doesn't recover the app,
only a full reload does.

**Fix:** actually apply the `SafePage`/keyed-boundary pattern per route so
one page crashing doesn't take down in-app navigation entirely.

---

## MEDIUM — the deploy gate has blind spots

These matter because `CLAUDE.md` treats a clean `validate.js`/`smoke.js`/
`render-smoke.js` run as proof it's safe to push. Several of the checks
don't actually cover what their names/comments claim.

### M1. The backtick check misses CLAUDE.md's own canonical crash example
`scripts/validate.js:39`: `/[={>]\s*\`/.test(l)` requires `=`, `{`, or `>`
to sit immediately (mod whitespace) before the backtick. Run it against
`CLAUDE.md`'s own "❌ CRASHES AT RUNTIME" example —
`<div style={{ border: \`1px solid ${color}\` }}>` — and it returns
**false**, because the backtick is preceded by `border: `, not one of those
three characters. The exact bug this check exists to catch would currently
ship with a clean pass.

**Fix:** loosen the regex to catch a backtick anywhere on a line that also
looks like a JSX attribute/style value, not just immediately after
`=`/`{`/`>`.

### M2. The duplicate-channel check misses every dynamically-built name
`scripts/validate.js:99`:
``/supabase\.channel\(['"`]([^'"`\$]+)['"`]\)/`` only matches a channel name
that is a bare string literal with nothing else inside the parens. Every
concatenated name in the app — `'rt_'+tableName+'_'+instanceId`
(`hooks.js:46`), `'activity_'+recordId` (`RecordActivityFeed.jsx:208`),
`'sms_'+contactId` (`SMSInbox.jsx:26`), `'notifs_'+agent.id`
(`NotificationBell.jsx:40`) — is invisible to it. No live duplicate exists
today, but a future file computing the same concatenated name would sail
through undetected — the exact class of bug that caused the
`postgres_changes` production crash `CLAUDE.md` documents.

### M3. The hook-order and missing-import checks only cover 2–4 hardcoded files
`scripts/validate.js:124-127` (hook-order/#310 check) only scans
`{Dashboard,Contacts,Tasks,ContactDetail}.jsx`; line 158 (missing-import
check) only scans `{ContactDetail,Dashboard}.jsx`. That's out of 56 files
in `src/pages/`. Neither check would have caught H1 or H2 above — both are
in files outside the allowlist. Every page shipped this session (EmailBlast,
ReportBuilder, Notepad, OffersV2, etc.) is unchecked by either.

### M4. `render-smoke.js` mounts 9 of 56 pages
`scripts/render-smoke.js:20-30`'s `PAGES` array covers Marketing,
Announcements, Admin, Settings, Calendar, TVBoard, AgentActivity, Dashboard,
DashboardSmart — and omits `ContactDetail.jsx` (the page `HANDOFF.md` says
just got a "CRITICAL bug" fix), EmailBlast, ReportBuilder, Notepad,
Contacts, Tasks, Pipeline, Production, OffersV2, and 38 others. A mount
crash (TDZ/undefined-state — exactly what this script exists to catch) on
any of the other 47 pages currently ships to production with a clean
"ALL PAGES RENDER."

### M5. SQL view comment contradicts its own (correct) code
`sql/offers_v2/H_shared_contact_directory.sql:75-79`: the comment above
`grant select` claims `security_invoker=true` — but no such clause exists
on the `create or replace view` at line 65 (correctly, since omitting it
was the actual fix in `H_fix_directory_view_security.sql`). A future edit
that "fixes" the code to match the wrong comment would reintroduce the
exact leak `offers-v2 commit 23` already fixed once.

### M6. Two migrations claim the same objects under separate name-gates
`sql/phase1/A_safe_foundation.sql:264` and
`sql/phase1/A2_reporting_foundation.sql:106` both create
`public.v_deals_canonical` (and overlapping `secretary_permissions`/
`team_goals`-adjacent objects), each checking only its own migration-record
name. Running both aborts safely via existence-check, but produces a
confusing "already exists" error with no cross-reference — a hygiene risk
for whoever runs migrations next.

---

## LOW / cosmetic

- `src/lib/db.js`: only `contacts.update` (243-247) turns an RLS-blocked
  update (`PGRST116`) into a friendly message; `deals`/`listings`/`gifts`
  updates surface Postgres's raw error text to the toast instead.
- `src/lib/voiceParser.js:561,565-585`: `buildSuggestions()` computes a
  `suggestions` array on every voice parse that nothing downstream reads
  (`voice.js` only consumes `name/phone/address/city/date/intents`) — wasted
  work, not a bug.
- `scripts/render-smoke.js:69` writes its bundle to a fixed path
  (`os.tmpdir()/render-smoke.cjs`), not one unique per run/PID. Two
  overlapping runs (e.g. two people or two CI jobs running `npm run
  preflight` at the same moment) can read/write that file concurrently and
  corrupt each other's result — this is what produced a one-off false
  "TVBoard CRASHES ON MOUNT: window is not defined" during this audit,
  which did not reproduce on a clean sequential run. Not fixed here since
  it only bites concurrent invocations; worth a `pid`-suffixed filename if
  this is ever run in parallel CI.
- `scripts/smoke.js:79`'s import-resolution regex can't match
  `import * as X from ...` (namespace imports) — currently latent (the one
  existing case resolves fine) but the "every import resolves" guarantee
  doesn't actually hold for that import style.

---

## What's already solid

Worth saying explicitly: outside the items above, the codebase is
unusually defensive for its size — `data || []` guards and optional
chaining are used consistently, most async calls are wrapped in try/catch,
`vercel.json` has all three required fields and the cron paths all resolve
to real files, all `api/*.js` handlers correctly use CommonJS with the
Supabase client created inside the handler (the documented anti-pattern
was **not** found anywhere), the two `api/*-cron.js` jobs do have real
unique-constraint dedupe against double-sends, and the `sql/phase1/` and
`sql/offers_v2/` migrations use a deliberate preflight-abort pattern that's
genuinely safe to re-run even though it isn't literally
`IF NOT EXISTS`/`OR REPLACE` everywhere.

---

## Suggested order of attack

1. C1 (Twilio token exfiltration) and C2 (unauthenticated endpoints) —
   both are live, exploitable right now, and both are just flipping an env
   var / adding one existing helper call.
2. C3 (`CRON_SECRET`) and C4 (open RLS policies) — same shape, both quick.
3. H1/H2 (hooks-of-hooks crashes) — small, mechanical fixes, prevents real
   user-facing crashes.
4. M1–M4 (deploy-gate blind spots) — fixing these raises confidence in
   every future "✅ ALL CHECKS PASSED," including for issues not listed here.
5. Everything else opportunistically.
