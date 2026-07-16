# TargetOS — Session Handoff (rev. 4, July 15 2026)

**Read this first in any new session.** Supersedes older handoff packets.
Companion docs: `docs/SECURITY_CHECKLIST.md`, `docs/PERMISSIONS.md`.

## Deploy workflow

- Claude pushes DIRECTLY when Moshe pastes his fine-grained GitHub PAT at
  session start (repo `TargetTeamOS/targetos`, Contents read/write, expires
  ~Aug 13 2026). Scrub token from git config after each push.
- **CURRENT MODE = Option A (pre-launch): Claude pushes straight to BOTH `v2`
  and `main`** so changes go live immediately on app.targetreteam.com. Moshe
  chose this while the CRM isn't yet in daily use. **When Moshe says "we're
  live," switch to Option B**: push `v2` only, he tests staging, then promotes.
- EXCEPTION even in Option A: anything touching live phone routing or outbound
  email/transcription gets flagged and pushed to `v2`-only first for staging
  test (e.g. the Whisper mic work was pushed to v2 only, awaiting Moshe's test).
- ALWAYS `npm run build && node scripts/validate.js` before any push. Both must
  pass. Never push on a red build.
- Local `git` refs in the sandbox go stale — verify real state with
  `git ls-remote https://github.com/TargetTeamOS/targetos.git refs/heads/main`.
- Vercel domain quirk: pushes to `main` sometimes DON'T auto-attach
  app.targetreteam.com ("Assigning Custom Domains: Skipped"). If the live site
  doesn't update, Moshe must Deployments → newest row → ⋯ → Promote to
  Production. STILL UNRESOLVED whether this is needed every time — Moshe to
  report; fix permanently if manual. A rollback pinned to an old deployment
  once blocked all updates until manually promoted.
- Staging URL: targetos-git-v2-target-team.vercel.app (shares prod DB/keys).

## Staged enforcement switches (still OFF / log-only — flip after clean logs)

- `AUTH_ENFORCE=true` → the money/identity endpoints (send-sms, send-email,
  twilio-token, twilio-outbound, ai-assistant, generate-offer-pdf,
  twilio-recording-proxy, send-campaign, report-send-now, transcribe) reject
  callers without a valid Supabase login. Watch `[AUTH]` log lines.
- `TWILIO_SIG_ENFORCE=true` → 13 Twilio webhooks reject forged signatures.
  Watch `[TWILIO-SIG]`.
Both revert instantly by setting back to false.

## SECURITY STATUS (updated July 15)

- ✅ RLS ON for all tables (Moshe verified — all rowsecurity=true).
- ✅ Storage bucket `targetos-files` now PRIVATE. App uses SIGNED URLs
  (`signedUrl()` in src/lib/storage.js); uploadFile stores PATH, signs on read;
  listFiles signs each file; SignedAudio component signs audio paths at play
  time. Removed the `public_read` (anon) policy; 7 authenticated policies kept.
  Org LOGO moved to PUBLIC `agent-photos` bucket (a logo must stay public).
  Other buckets (agent-photos, offer-docs) remain public by design.
- ⏳ Repo STILL PUBLIC — top outstanding item.
- ⏳ Rotate VITE_GOOGLE_MAPS_KEY (old value in public repo; code is env-only).
- ⏳ Set CRON_SECRET in Vercel (needed for report-cron + briefing-cron auth).

## Daily briefing (hardened July 14)

Explicit opt-in ONLY (`briefing_prefs.enabled===true`), per-agent send times
(cron every 30 min, ET slots), `briefing_sends` unique(agent_id,sent_date)
prevents dupes, CRON_SECRET enforced. Manual "Send All" also opt-in.

## What shipped THIS SESSION (July 15) — all live on main EXCEPT the mic Whisper work

- **Email Blast** (Marketing → 📨): audience all/status/tag, live count minus
  unsubscribes, {{first_name}}, preview, batches of 40 via Resend, campaign
  history. api/send-campaign.js + api/unsubscribe.js (HMAC public page →
  email_unsubscribes). Contacts import/export gated by can('contacts.export'
  /'contacts.import'). SQL: sql/email_campaigns.sql. NEEDS Vercel env for
  sending: BLAST_FROM, ORG_POSTAL_ADDRESS, PUBLIC_BASE_URL, UNSUB_SECRET +
  Resend domain verify for listings@targetreteam.com.
- **Report Builder** (nav 📧, admin-only): custom scheduled report emails.
  Pick blocks (calls, deals/GCI, tasks done+overdue, new contacts, listings,
  offers, per-agent table), date range, agent filter, schedule (daily OR
  weekly weekday+hour ET), recipients, LIVE preview, Save + Send-now. Every
  task/contact/listing line DEEP-LINKS to its CRM record. src/lib/reportEngine.js
  (+ api/_lib CommonJS copy), api/report-cron.js (hourly), api/report-send-now.js.
  SQL: sql/report_builder.sql. Hourly cron registered in vercel.json.
- **Contact page overhaul**: fixed CRITICAL bug (Deals panel loaded 10 random
  system-wide deals → now only this contact's, via contact_id + tc_participants);
  working Assign-Agent picker; working Call button; removed triplicate action
  rows (header = outward actions only; timeline tabs = view filter); replaced
  cheap ✏️ emoji with hover SVG edit; single status pill-dropdown; tightened
  top bar to one row. ADMIN LAYOUT CONTROL: src/lib/contactLayout.js
  (system_settings key 'contact_layout') + Settings → Contact Layout tab AND
  in-place "⚙ Arrange" on the contact page (drag ⠿ to reorder, Hide/Show per
  panel, live). All 11 right-panel sections tagged with hideKey/layout/order.
- **Filters**: removed default 'Active' filter on Listings + My Listings;
  FIXED phantom "Date Added: [object Object]" chip across ALL boards (empty
  object was truthy in FilterBar — isSet()/chipText() added).
- **Mobile nav**: added TC Board, Marketing, Notepad.
- **Notepad** (nav 📝, all roles): text + voice notes; voice notes save audio
  (MediaRecorder) + transcript; audio player per note; pin/delete.
  src/lib/useAudioNote.js. SQL: sql/notes.sql.
- **Voice mic** (major work): defaults RIGHT side, drag (mouse+touch) snaps to
  nearest side + persists per-user (localStorage 'micPos'); button 64px.
  Voice→contact captures property_interest, creates a follow-up task LINKED to
  the contact, emails the agent a deep link. Voice→task/event/note all keep
  their AUDIO RECORDING (linked notes row w/ audio_url+audio_path+linked_type/id);
  contact page shows a 🎤 Voice Recordings panel. FIXED: voiceParser.js
  (Rockland streets + Jewish/Yiddish names + phonetic corrections) was never
  imported by the mic — now voice.js delegates to it; also fixed a stray
  backtick that broke the build once imported.
- **Mic transcription (ON v2/STAGING ONLY — NOT yet on main)**: the phone
  browser's built-in speech engine returns nothing usable on Android Chrome.
  Real fix built: api/transcribe.js sends recorded audio to OpenAI Whisper
  (yi→en→es priority, reusing the proven voicemail approach). VoiceCapture now
  transcribes server-side (browser speech = live preview + fallback only).
  AWAITING Moshe's staging test before promoting. Needs OPENAI_API_KEY on
  Preview too. Cost: ~$0.006/min (paid API per capture).

## SQL run status

Idempotent files in sql/. Run in Supabase BEFORE the dependent code.
Through rev3 all were run. THIS SESSION added (confirm Moshe ran them):
sql/email_campaigns.sql, sql/report_builder.sql, sql/notes.sql. (notes.sql is
required for Notepad AND for mic audio recordings, since both use the notes table.)

## Outstanding

1. Moshe: repo → PRIVATE; rotate VITE_GOOGLE_MAPS_KEY; set CRON_SECRET; ensure
   OPENAI_API_KEY + report/blast env vars cover Preview; flip AUTH_ENFORCE then
   TWILIO_SIG_ENFORCE after clean logs.
2. TEST the Whisper mic on staging, then promote to main if good.
3. Outlook connector (per-agent Graph Mail.Send): blocked on Moshe's Azure app
   registration; preconditions = repo private (now closer — bucket done, RLS
   done). Tokens server-only/encrypted.
4. Commission bill PDF matching Moshe's format (needs his sample upload).
5. Report Builder: more metric blocks on request (open-house visitors, signs,
   conversion rates).
6. Permissions phase 2 remainder + phase 3 server-side (docs/PERMISSIONS.md).
   Contacts export/import now gated; deals export/import buttons still don't exist.
7. `/route` page: routed but unlinked — keep or kill (Moshe).
8. Mobile: phone sometimes shows full DESKTOP layout (sidebar on narrow screen)
   — mobile layout not always activating; and two mic entry points on mobile
   (floating button + MobileDashboard modal) are redundant. Both cosmetic,
   noted for a future cleanup.

## Key behavioral lessons (carried forward)

- Moshe's standing rules: (1) never crash production — build+validate+test;
  (2) everything end-user-controllable from the CRM UI; (3) verify before delete.
- NEW rule reinforced this session: don't push "should work" fixes blind,
  especially for device-dependent features (mic/speech). Claude cannot test
  browser mic/speech from the sandbox — when a fix depends on the user's
  device, push to staging and have Moshe verify before promoting.
- Template literals in .js/.jsx can break the validator/build — a stray
  backtick in voiceParser.js broke the build the moment it was imported.
- Env vars bake at BUILD time and are per-environment — a Production-only key
  (RESEND, OPENAI) breaks staging silently. Check Preview scope.
