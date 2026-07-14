# TargetOS Security Checklist — July 2026

Two kinds of items: **code fixes (already shipped in the July 2026
hardening patches)** and **actions only the owner can do** in GitHub,
Vercel, Google Cloud, Supabase, and Twilio. Work the OWNER ACTIONS
top to bottom — they're ordered by urgency.

---

## OWNER ACTIONS (do these — code can't)

### 1. Make the GitHub repo PRIVATE — URGENT
`github.com/TargetTeamOS/targetos` is currently **public**. Anyone can
read the entire source: architecture, endpoint paths, SQL, comments.
GitHub → repo → Settings → General → Danger Zone → Change visibility →
Private. (Deploys are unaffected; Vercel uses its GitHub app.)

### 2. Rotate + restrict the Google Maps key — URGENT
A Google API key was hardcoded in 4 source files in the public repo
(now removed from code, but the key must be treated as leaked):
1. Google Cloud Console → Credentials → create a NEW key
2. Restrict it: Application restrictions → HTTP referrers →
   `app.targetreteam.com/*` and `*.vercel.app/*`
   API restrictions → Maps JavaScript API + Places API only
3. Put it in Vercel env as `VITE_GOOGLE_MAPS_KEY` (Production + Preview)
4. Delete the old key
Note: after the hardening patch, the app uses ONLY the env var — if
it's missing, address autocomplete shows a warning instead of working.

### 3. Set `CRON_SECRET` in Vercel (if not already set)
Both crons (task-reminders, daily-briefing) hard-block bad callers
only when this exists. Generate a long random string, add it as
`CRON_SECRET` in Vercel env vars. Vercel automatically presents it to
scheduled cron calls.

### 4. Flip Twilio signature enforcement
After a few days of clean Vercel logs (no `[TWILIO-SIG] FAILED` lines
for legitimate calls): set `TWILIO_SIG_ENFORCE=true` in Vercel. Kill
switch: set it back to `false`.

### 5. Supabase Row Level Security audit
Run in the Supabase SQL editor to see which tables have RLS off:
```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public' order by rowsecurity, tablename;
```
Anything with `rowsecurity = false` is fully readable AND writable by
anyone holding the anon key (which ships in the browser bundle).
Minimum recommended: enable RLS with `to authenticated using (true)`
policies on every table — that alone shuts out non-logged-in access
while changing nothing for the team. Per-role policies are Phase 3 of
docs/PERMISSIONS.md.

### 6. Supabase Storage bucket check
Dashboard → Storage → `targetos-files`: if the bucket is public,
anyone with a URL can read files (contracts, PDFs). Decide whether
that's acceptable; if not, switch to signed URLs (the code already
has `getSignedUrl` in src/lib/storage.js).

### 7. GitHub PAT hygiene
The deploy PAT should be fine-grained, scoped to this one repo,
contents read/write only, with an expiry. Rotate it if it's a classic
full-access token.

### 8. Auth account review
Supabase → Authentication → Users: remove/disable anyone who left the
team. The permissions system gates features, but a valid login is
still a valid login.

---

## SHIPPED CODE HARDENING (for the record)

| Area | Before | Now |
|---|---|---|
| 7 spending/acting endpoints (send-sms, send-email, twilio-token, twilio-outbound, ai-assistant, generate-offer-pdf, twilio-recording-proxy) | No caller check — anyone could send SMS/email as the team, mint call tokens, burn AI credits | Require a valid logged-in Supabase user (401 otherwise); every client call site attaches the session token |
| Daily briefing cron | Secret mismatch warned and SENT ANYWAY; opt-outs defaulted open; fixed 7am for all | Secret enforced (401); explicit opt-in only; per-agent send times; DB-level once-per-day guard |
| Twilio webhooks (13) | Log-only signature validation | Blocking available via `TWILIO_SIG_ENFORCE` env kill-switch |
| Google Maps key | Hardcoded fallback in 4 files in a public repo | Env var only |
| Permissions | Matrix existed, nothing enforced | Phase 1 enforced (deletes, call-flow route); Phases 2–3 in docs/PERMISSIONS.md |

## HOW TO KEEP IT WORKING (ongoing practice)

1. **Never skip** `npm run build && node scripts/validate.js` before pushing — it caught real bugs repeatedly this week.
2. **Staging first, always**: push `v2`, click through the changed feature on the staging URL, then promote.
3. **Before promoting, check for stowaways**: `git log origin/main..origin/v2 --oneline` shows everything that will go live — read the list. The briefing incident was exactly this.
4. **After promoting**: watch Vercel → Logs for 5 minutes; check the function list for errors.
5. **Weekly 2-minute check**: TC Board → Sync Check (boards drift), Vercel logs for `[TWILIO-SIG]` and `BLOCKED` lines, Resend dashboard for unexpected send volume.
6. **New SQL always before new code**, and only idempotent statements.
