# TargetOS — Session Handoff (rev. 3, July 14 2026)

**Read this first in any new session.** It supersedes older handoff
packets. Companion docs: `docs/SECURITY_CHECKLIST.md` (security
actions + shipped hardening) and `docs/PERMISSIONS.md` (permissions
roadmap).

## Deploy workflow (CHANGED July 14)

- Claude sessions can push DIRECTLY to `v2` when Moshe pastes his
  fine-grained GitHub PAT at session start (repo-scoped, Contents
  read/write, expires ~Aug 13 2026). Claude pushes `v2` ONLY — never
  main. Scrub the token from git config after each push.
- Moshe promotes via the Vercel dashboard ("Promote to Production" on
  a deployment). **Always verify the commit hash/message on the
  deployment card before promoting** — on July 14 an older commit was
  promoted by accident and briefly broke production calls.
- Rollback: promote the previous good Production deployment from the
  Deployments list (Instant Rollback only appears on rows previously
  aliased to Production).
- Before advising any promote: `git log origin/main..origin/v2
  --oneline` and read what's going live. A dormant briefing cron
  activating on promote caused a team-wide email incident (July 14).

## Staged enforcement switches (waiting on log review)

Two env-var switches exist, both currently OFF (log-only):
- `AUTH_ENFORCE=true` → the 7 money/identity endpoints (send-sms,
  send-email, twilio-token, twilio-outbound, ai-assistant,
  generate-offer-pdf, twilio-recording-proxy) start rejecting calls
  without a valid Supabase login. Watch Vercel logs for `[AUTH]`.
- `TWILIO_SIG_ENFORCE=true` → the 13 Twilio webhooks start rejecting
  forged signatures. Watch for `[TWILIO-SIG]`.
Flip each only after a few days of clean logs. Both revert instantly.

## Daily briefing (hardened July 14)

Explicit opt-in ONLY (`briefing_prefs.enabled === true`), per-agent
send times (cron every 30 min, ET slots), `briefing_sends` unique
(agent_id, sent_date) makes duplicates impossible, CRON_SECRET
enforced. Manual "Send All" also honors opt-in. History: the cron
shipped dormant from an earlier session, went live unnoticed on a
promote, and mass-emailed the team for ~2 days — see SECURITY_CHECKLIST.

## What shipped July 13–14 (all live after the c076405+ promote)

- **TC Board**: morning summary strip (tap counts → task lists);
  People/Documents/Photography panels on each deal (Contacts-linked);
  deal chat with @mentions (notifies); contract-to-close toggle
  (weekly tasks + bill reminder); sign panel (Signs board linked);
  commission bill v1 (auto-filled, editable, emails attorneys — PDF
  version pending Moshe's sample); ⚙️ TC Settings (admin): photo
  services/prices, doc statuses, readiness checklist, people roles,
  per-phase task templates, commission rate — all CRM-editable.
- **Phone**: barge-in during listings readout; menu keypress logged;
  repeat-contact whisper by name; call journeys on the contact page.
- **Marketing**: 🎨 Design Studio (Canva-style editor, templates,
  brand kit, listing insert, PNG export, team templates).
- **Cross-board**: unit parsing + address autofill everywhere; TC
  forms have Google autocomplete; every person field Contacts-linked
  (incl. Gifts, Offers seller/co-buyer/co-seller); deals.listing_id
  triangle closed; Listings → Under Contract auto-creates the TC deal;
  BoardLinks chips deep-link (?open=<id>) to the exact record.
- **Contact page**: in-CRM email compose (Resend, reply-to agent).
- **Permissions**: phase 1 enforced (deletes, /call-flow, /tc-settings);
  phase 2 partially — CustomFields + Reports agent-stats now use can().
  NOTE: contacts/deals export & import BUTTONS DON'T EXIST YET — the
  permission keys were built ahead of the features.

## Env vars (Vercel)

All main keys are Production+Preview as of July 14 (RESEND_API_KEY
was Production-only and broke staging email tests — fixed). Env vars
bake at BUILD time: after scoping changes, redeploy.

## Outstanding

1. Moshe: repo → PRIVATE (still public as of this writing!), rotate
   VITE_GOOGLE_MAPS_KEY (old value was in the public repo), set
   CRON_SECRET if absent, RLS audit (checklist §5), storage bucket
   check, flip the two enforcement switches after log review.
2. Outlook connector (per-agent Graph Mail.Send): blocked on Moshe's
   Azure app registration; preconditions = repo private + RLS done.
   Design constraint: refresh tokens server-only, encrypted.
3. Commission bill PDF matching Moshe's exact format (needs upload).
4. Email blast via Resend replacing Mailchimp (~2k recipients,
   unsubscribe compliance required) — deferred by choice.
5. Permissions phase 2 remainder (blocked until export/import/
   reassign features exist) + phase 3 server-side (docs/PERMISSIONS.md).
6. `/route` page: routed but unlinked — Moshe to keep or kill.
7. `sql/` files are all idempotent; run in Supabase BEFORE the code
   that needs them. Through July 14 all shipped SQL has been run.
