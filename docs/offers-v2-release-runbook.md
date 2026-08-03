# Offers V2 — Controlled Live-Release Package

**Base SHA:** `11e53a1` (verified `main`, unchanged throughout this project)
**Final HEAD (working copy):** `6a44968`
**Final HEAD (after `git am` in a fresh clone):** `e3fa203` — different hash, identical content; `git am` always mints new commit objects, this is expected.
**Patch file:** `offers-workflow-v2-complete.patch`
**Patch SHA-256:** `43d47bfab10dcd1aa9e68d04cfb0acf08556d43c913b540f6d1ef2b9cb45a6ef`
**Commit count:** 9

## Commit list

| # | Subject |
|---|---|
| 1 | Verified audit, RLS foundation, revision/send-history schema |
| 2 | Decimal-safe calc engine, contact/attorney/MLS fixes, representing side |
| 3a | Immutable one-page PDF fixes (checkboxes, terms fit, server-side calc validation) |
| 3b | Revision persistence, document storage, audit history |
| 4 | Real send pathway, contact/property offer history, hardened accepted-conversion |
| 5a | Admin reporting foundation with real drill-down |
| 6 | Admin-only beta gating via existing feature_flags table |
| 7 | Full-history reports, direct-route protection, mobile form layout |
| 8 | Secretary permission parity, remaining mobile grids |

## Verification already performed (not claimed, actually run)

Cloned `TargetTeamOS/targetos` fresh, checked out `11e53a1`, applied this exact patch with `git am` — all 9 commits applied cleanly, `git status --short` clean, `git diff --check` clean. From that clean state: **183/183 tests pass**, `npm run build` passes, `node scripts/smoke.js` passes, `node scripts/validate.js` (includes `npm test`) passes. `node scripts/render-smoke.js` could not complete within this sandbox's execution-time limit — this happened on every attempt across this entire project and is unrelated to Offers (it SSR-mounts Marketing/Admin/Settings/Dashboard/etc., never an Offers page). Reported as blocked, not passed.

**Not verified — genuinely blocked, no live credentials exist in this environment:** any live Supabase RLS behavior, live Microsoft Graph/Gmail sending, live Agent-A-vs-Agent-B database isolation, live secretary-role behavior. Everything above is correct-per-code and covered by logic/mock tests, not live-database-proven. That proof only happens once this is actually applied somewhere with real credentials — see the runbook below.

---

## 1. Codespaces commands — apply and push

Run these from a GitHub Codespace (or any machine with real push access to `TargetTeamOS/targetos`):

```bash
# 1. Fetch latest main and confirm the exact base SHA
git fetch origin
git checkout main
git pull
git rev-parse HEAD
# Confirm this prints 11e53a1... (or a later main commit — if main has
# moved past 11e53a1 since this patch was built, STOP and get a fresh
# patch regenerated against the new main instead of forcing this one)

# 2. Create the feature branch
git checkout -b feature/offers-workflow-v2

# 3. Apply the patch (upload offers-workflow-v2-complete.patch to the
#    Codespace first, e.g. drag into the file explorer)
git am offers-workflow-v2-complete.patch

# 4. Confirm all 9 commits landed
git log --oneline 11e53a1..HEAD
git status --short   # expect clean

# 5. Run the full gate
npm install
npm test
npm run build
node scripts/validate.js
node scripts/smoke.js
# node scripts/render-smoke.js  — optional; slow, may time out in some
#   environments even outside this sandbox. Not Offers-specific.

# 6. Push the feature branch (NOT main)
git push origin feature/offers-workflow-v2

# 7. Open a pull request to main
gh pr create --base main --head feature/offers-workflow-v2 \
  --title "Offers V2 — admin-only beta" \
  --body "See offers-v2-audit.md and the 9 commit messages for full detail. Admin-only via offers_v2_beta feature flag; regular agents unaffected until the flag is enabled."
# (or open the PR in the GitHub UI if you don't have `gh` installed)

# 8. Review the complete diff before merging
gh pr diff feature/offers-workflow-v2
# or review in the GitHub UI — read every file, not just the summary

# 9. Merge only after CI/gates pass on the PR itself
gh pr merge feature/offers-workflow-v2 --merge
# (squash/rebase is your call — this repo's history so far uses merge
#  commits for PRs, e.g. "Merge pull request #7")

# 10. Confirm the exact Vercel Production deployment commit
#     Vercel dashboard -> Deployments -> Production -> check the commit
#     SHA shown matches the merge commit you just created. If it
#     doesn't, Production has NOT picked up this change yet — do not
#     assume it deployed just because the merge succeeded (this repo's
#     own docs/HANDOFF.md notes a known quirk where domain
#     reattachment sometimes requires a manual "Promote to Production").
```

---

## 2. Production database — exact steps

**Do not run any of this from this Claude environment or automatically. These are commands for you or your DBA to run against the real Supabase project, after code is merged and deployed.**

### 2.1 Pre-migration checks (read-only — run these first, in order)

```sql
-- Confirm a current backup exists / trigger one via Supabase dashboard
-- (Project Settings -> Database -> Backups) before touching anything.

-- Record the current offer count (compare after migration — must be identical)
select count(*) as offer_count_before from offers;

-- Inspect the actual live offers schema (this project's migrations were
-- never able to see this directly — no CREATE TABLE for offers exists
-- in git; verify column names match what A_foundation.sql expects
-- before running it)
select column_name, data_type from information_schema.columns
where table_name = 'offers' order by ordinal_position;

-- Confirm Auth-to-agent linkage (a known historical gap per the System
-- Core Handoff — more agent profiles than linked Auth users)
select count(*) as agents_total,
       count(auth_user_id) as agents_linked
from agents;
-- if agents_linked < agents_total, some agents cannot pass any RLS
-- check this migration adds — decide whether that's acceptable before proceeding

-- Confirm existing RLS state on offers (should currently be OFF or
-- permissive, since no RLS for offers was found anywhere in git)
select tablename, rowsecurity from pg_tables where tablename = 'offers';

-- Confirm no naming conflicts with what this migration will create
select proname from pg_proc where proname in ('offers_v2_placeholder'); -- expect 0 rows (sanity check pattern)
select tablename from pg_tables where tablename in ('offer_revisions','offer_sends'); -- expect 0 rows
```

### 2.2 Forward migration — run in this exact order

```
sql/offers_v2/A_foundation.sql        -- new columns, offer_revisions, offer_sends, RLS
sql/offers_v2/B_beta_flag.sql         -- seeds offers_v2_beta + offers_v2_send_test flags (OFF)
sql/offers_v2/C_secretary_access.sql  -- corrects RLS to match existing secretary UI behavior
```

Run each file completely, in order, before moving to the next. All three are idempotent (safe to re-run) and additive (no `DROP`, no `TRUNCATE`, no unbounded `UPDATE`/`DELETE`).

### 2.3 Post-migration verification

Run `sql/offers_v2/A_verify.sql` in full. Expected results (from that file's own comments):
- 9 new columns on `offers`
- 2 new tables (`offer_revisions`, `offer_sends`), both with `rowsecurity = true`
- 6 named policies across the three tables (after `C_secretary_access.sql`, the policy *definitions* change but the *count* stays the same — verify with `select tablename, policyname, cmd from pg_policies where tablename in ('offers','offer_revisions','offer_sends')`)
- `select count(*) from offers` still equals the number recorded in step 2.1 — **if this number changed, stop and investigate before doing anything else**
- `select count(*) from offers where representing_side is null` returns 0

```sql
-- Confirm both new flags exist, OFF, empty allowlist
select key, enabled, allowed_agent_ids from feature_flags
where key in ('offers_v2_beta','offers_v2_send_test');
```

### 2.4 Admin runtime check (needs a real Admin login)

1. Log in as an Admin who is NOT yet on the `offers_v2_beta` allowlist. Open `/offers`. **Expect: the existing (legacy) Offers board, unchanged.**
2. In Admin -> Features, add that Admin's own agent ID to `offers_v2_beta.allowed_agent_ids` and set `enabled = true`.
3. Reload `/offers`. **Expect: Offers V2** (Representing Side selector, Send Offer button, Reports view visible).
4. Create a test offer, generate a PDF, confirm it's exactly one page and matches `sample_offer_synthetic.pdf`'s layout.

### 2.5 Agent-isolation check (needs two real non-admin logins)

1. As Agent A, create an offer. Note its URL (`/offers/<id>`).
2. Log in as Agent B (not on the beta allowlist, or on it but not the owner). Paste Agent A's offer URL directly into the address bar.
3. **Expect:** either the legacy board (if Agent B isn't in the beta) or, if Agent B is in the beta, an explicit "not authorized" message and redirect back to `/offers` — never Agent A's offer content.
4. As Agent B, confirm `/offers` (V2, if enabled for them) shows only their own offers, plus the "By Agent" admin section absent (Agent B is not admin/secretary).

### 2.6 Rollback trigger conditions

Roll back immediately if any of the following happen:
- The offer count in 2.3 doesn't match 2.1.
- Any agent reports seeing another agent's offer they shouldn't.
- The generated PDF is not exactly one page, or the layout/branding/legal text visibly differs from `sample_offer_synthetic.pdf`.
- Any error in Vercel function logs referencing `offer_revisions`, `offer_sends`, or `offersDb`.

**Rollback (no code deploy required, instant):**
```sql
update feature_flags set enabled = false where key = 'offers_v2_beta';
update feature_flags set enabled = false where key = 'offers_v2_send_test';
```
This immediately returns every user to the legacy Offers board. The new tables/columns stay in place (harmless — nothing reads them once the flag is off) unless you also want to run `sql/offers_v2/A_rollback.sql`, which is safe to run at any time and touches nothing that predates this project.

---

## 3. Admin-only feature-flag setup (recap)

- `offers_v2_beta` — gates the whole V2 board. OFF by default. No automatic admin bypass (deliberately — see commit 6's message). To let the owner test alone: set `enabled = true` and `allowed_agent_ids = array['<owner-agent-id>']`. To roll out fully: `enabled = true`, `allowed_agent_ids = array[]::uuid[]`.
- `offers_v2_send_test` — gates REAL sending specifically, on top of the `EXTERNAL_EFFECTS_ENABLED` env var (both must be true). Same pattern, same defaults (OFF, empty allowlist).

Both are managed through the **existing** Admin -> Features UI — nothing new to build or learn.

---

## 4. Live test checklist (run in `app.targetreteam.com` after deployment)

- [ ] Open Offers as a non-beta agent — confirm legacy board, unchanged
- [ ] Open Offers as the beta-enabled Admin — confirm V2 board
- [ ] Create a buyer-side draft
- [ ] Create a seller-side draft
- [ ] Select an existing contact as buyer/seller
- [ ] Create a new contact from the offer form
- [ ] Select an existing attorney; create a new one
- [ ] Search an in-house property (confirm TargetOS-listing-first detection fires)
- [ ] Use manual/off-market entry
- [ ] Calculate deposit by amount, then by percent — confirm both directions
- [ ] Calculate mortgage by amount, then by percent
- [ ] Verify Balance at Closing updates correctly
- [ ] Generate the PDF — confirm exactly one page, matches the synthetic sample's layout, checkboxes reflect Subject To selections correctly
- [ ] Reopen and revise the offer — confirm a new revision is created, old one preserved
- [ ] Compare revisions (initial vs. current values)
- [ ] View Documents tab — confirm generated PDF is distinguishable from supporting docs
- [ ] View the buyer/seller Contact Detail page — confirm "Related Offers" section shows this offer
- [ ] View the in-house listing's Price & Activity tab — confirm the offer appears there
- [ ] With `EXTERNAL_EFFECTS_ENABLED` and `offers_v2_send_test` both off: click Send Offer — confirm a clear "validated but not sent" message, no real email
- [ ] Mark an offer Accepted — confirm exactly one Production record is created (check twice — click Save again and confirm no duplicate)
- [ ] Open Admin -> Reports (as Admin/secretary only) — confirm regular agents cannot reach this view
- [ ] Drill into a report card — confirm the exact underlying offers open
- [ ] Test on a phone-width browser window or real device — confirm no horizontal overflow on the Full Offer Form

Regular agents must see only their own offers/counts throughout, and must never see the Reports view.

---

## 5. Known, stated limitations

1. Nothing in this package has been proven against a live database, live Auth users, or live email providers — only against code, logic tests, and mocked integrations. Section 2 above is how that gets proven for real.
2. `_lib/phone.js` and `_lib/connectors.js` (pre-existing, unrelated to this project) still contain a hard-coded Supabase project URL fallback — flagged twice earlier in this project, already the subject of open PR #5. Not fixed here; out of scope for Offers V2.
3. `render-smoke.js` could not be run to completion in any environment available during this project.
4. Reporting's "average time from first Sent to Accepted" is approximated from `offer_date` -> `accepted_at`, not true send-timestamp precision (would require joining `offer_sends`, not currently done in that view).
