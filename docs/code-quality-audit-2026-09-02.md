# Code Quality & Hygiene Audit — September 2, 2026

Companion to `docs/robustness-audit-2026-09-02.md` (crashes/security). This
pass asks a different question: independent of whether it currently breaks,
**is this codebase well-written and maintainable?** Three lenses: frontend
(`src/`), backend (`api/`), and project-wide structure/hygiene. Every finding
below was verified by reading the real file — file:line cited throughout.

---

## URGENT — this is not a code-quality nitpick, act on this first

### U1. A live-looking Resend API key is committed in `EDGE_FUNCTIONS_SETUP.md`
Line 23: `supabase secrets set RESEND_API_KEY=re_ShsDy...c93` (redacted here
deliberately — see below) — a real-format key, not a placeholder, sitting in a checked-in markdown file
since this file was added, untouched by later commits (including ones titled
"security: complete Phase 1 foundation controls"). This repo is public, so
this key has been publicly visible for months.

**Do this now:** rotate the key in Resend's dashboard immediately — that
neutralizes it regardless of git history. Then replace the line in the doc
with a placeholder.

*(Update: the doc itself was fixed in this same session — the key is now
redacted with a placeholder and a rotation note. Rotating the actual key in
Resend's dashboard is still something only the repo owner can do.)*

### U2. Real client PII and commission data committed at the repo root
`monday_production_import.csv` (201 rows, tracked in git, not gitignored):
real client full names, personal emails, phone numbers, property addresses,
and exact commission (GCI) dollar amounts from actual closed deals. This is
production customer data, permanently in the git history of a public repo.

**Do this now:** decide whether this needs a privacy/legal review — real
people's contact information and financial details have been publicly
exposed, which may carry disclosure obligations depending on where your
clients are located (I'm not a lawyer; this is worth a quick check with one
given actual PII was involved, not just a hypothetical risk). Separately and
regardless: remove the file, rotate anything derived from it, and treat the
repo's public history as compromised for this data specifically.

**Note on scope:** deleting these from the current file tree (which I can do
immediately) stops the file from showing up in a fresh clone's normal view,
but does **not** remove it from git history — anyone who already has it, or
who checks out an old commit, still has it. Fully scrubbing history (e.g.
`git filter-repo`) is a more disruptive operation — it rewrites every commit
SHA and breaks any other clones/PRs — so I did not do that without asking.
Combined with `docs/HANDOFF.md`'s own outstanding item ("repo → PRIVATE,"
still unresolved as of its last update), this is the concrete cost of that
item sitting open: it's not an abstract best-practice, it's why these two
things are public right now.

### U3. `CLAUDE.md` contradicts itself on the one rule it calls mandatory
Line 25 (top of file, Deploy Workflow): `git push origin v2:main` with an
explicit "(NO --force — ever)". Line 144 (Tech Stack Quick Reference,
same file): `Deploy: git push origin v2:main --force → Vercel auto-deploys`.
A document whose stated purpose is "follow every rule here without
exception" tells the reader two opposite things about force-pushing to the
production branch. Whoever (human or AI) reads line 144 first and trusts it
will force-push over the other's work. **Fix:** delete the stale
`--force` on line 144.

*(Update: fixed in this same session.)*

---

## Frontend (`src/`, 247 files)

**What's genuinely consistent:** a sweep for Tailwind-style classes,
`.module.css` imports, and icon-library imports (`react-icons`,
`@heroicons`, `lucide-react`, etc.) found **zero violations** — the
CSS-variables-only / inline-SVG-or-emoji-only rules in `CLAUDE.md` are
followed everywhere. State is consistently read through `useApp()`/`useAuth()`
context (56/78 files) rather than reinvented per component.

**Where it isn't well-written:**

1. **`UI.jsx`'s shared `Table` component is imported by zero files** — 16
   pages hand-roll 36 raw `<table>` elements instead (`Analytics.jsx` alone
   has 8), so every table's styling has silently drifted independently.
2. **`Dashboard.jsx:950`'s `DetailPopup` is a near line-for-line clone of
   `UI.jsx:209`'s `Modal`** — same Escape-key handling, same
   click-outside-to-close, rebuilt from scratch. 34 files build their own
   overlay vs. only 12 that import the shared `Modal`.
3. **`Production.jsx:1222-2918`'s `DealDrawer` is a ~1,700-line God
   component** — 44 `useState` hooks, a 7-way tab switch, JSX nested 14
   levels deep, fetching/mutating/rendering all in one function. Same shape
   repeats in `Dashboard.jsx` (2,722 lines), `TransactionCoordinator.jsx`
   (1,808), `OffersV2.jsx` (1,734), `ListingWorkspace.jsx` (1,678) — this is
   a systemic pattern, not a one-off.
4. **`Production.jsx:855`'s `BoardGroup` takes 22 props** — the prop-drilling
   the project's own `AppContext` pattern exists to avoid.
5. **Two disagreeing sources of truth for stage colors** —
   `lib/constants.js:8-14`'s `DEAL_STAGES.hex` vs. `Production.jsx:52-59`'s
   independently hardcoded `STAGE_ACCENT` map — different shades for the
   same stage label.
6. **Date/currency formatting bypasses `lib/utils.js` almost everywhere** —
   30+ files call `.toLocaleDateString()` directly with ad hoc options
   instead of using the `fmtDate`/`fmt$` helpers that already exist.
7. **60+ unused imports found and individually verified**, e.g.
   `Production.jsx:22` imports `fmt$, fmtFull$, fmtDate` and uses none of
   them in a 3,199-line file. No lint config exists in the repo to catch
   this automatically.
8. **`ImportExport.jsx`'s Excel-import path is a copy-paste of its own
   CSV-import path** with every variable mechanically renamed with a
   trailing "2" (`reader2`, `autoMap2`), instead of one shared parser. Also
   leaves 11 `console.log` debug statements in, one dumping a raw record via
   `JSON.stringify`.
9. **No z-index scale** — 38 distinct raw values (0 to 99999) as inline
   `style={{zIndex:N}}` across dozens of files, no shared constant.
10. **Index-as-key in 92 places**, a handful on lists that actually
    reorder/filter (`ImportExport.jsx:844`, `MLSSearch.jsx:357,425`), which
    risks stale-row bugs on re-render.

**Verdict:** disciplined at the convention level, undisciplined at the
component level. Well-built shared primitives (`Modal`, `Table`,
`lib/utils.js`) exist but most of the code doesn't use them, favoring
copy-paste-and-rename over reuse. Half a dozen pages have grown into
1,700–3,200-line God components — the single biggest cost to whoever
touches them next.

---

## Backend (`api/`, 51 files + `api/_lib/`)

**What's followed correctly:** both of CLAUDE.md's stated API rules
(CommonJS only, Supabase client created inside the handler) hold with zero
violations across all 51 files.

**Where it isn't well-written:**

1. **`parseBody(req)` is copy-pasted as a private function in 18 separate
   handler files**, even though `_lib/phone.js` already exports one, and at
   least 3 slightly different implementations exist among the copies.
2. **9 files independently reimplement "create a Supabase client from env
   vars"** with different fallback behavior, instead of reusing any of the
   three that already exist in `_lib/`.
3. **Those three existing "shared" Supabase-client factories
   (`_lib/phone.js`, `_lib/connectors.js`, `_lib/offersDb.js`) each have a
   different failure philosophy** for the identical job — one silently
   falls back through three key types, one throws, one fails closed
   returning `null`. Moving logic between files silently changes what
   happens when an env var is missing.
4. **No `_lib/email.js`** — 9 files each hand-roll their own
   `fetch('https://api.resend.com/emails', ...)` call, and the sender
   identity has already drifted (different `from` strings across files that
   should all be "the system").
5. **`_lib/phone.js` (446 lines) is a dumping ground**, not a phone module —
   it also exports generic HTTP body-parsing and generic role-based auth
   helpers used by files that have nothing to do with phones.
6. **Two independent reimplementations of "who is this caller"** —
   `_lib/auth.js`'s `requireUser` and `_lib/phone.js`'s `requireRole` — with
   different token-extraction methods and incompatible return shapes.
7. **Inconsistent success/error response shapes app-wide**, and — more
   seriously — several files return **HTTP 200 on failure**, including
   `daily-briefing-cron.js`'s catch-all exception handler, meaning a genuine
   crash in that cron job reports as a success to any status-based monitor.
8. **`admin-users.js` is a 232-line single function with 9 responsibilities**
   (create/invite/reset/update/delete/etc. as sequential `if` blocks),
   including an 18-line hand-built HTML email template inlined at the call
   site.
9. **18 Twilio webhook handlers use at least 4 different body-parsing/
   signature-check patterns** for structurally identical work — no single
   template a new endpoint is written from.

**Verdict:** individual files are generally readable and often
well-commented — this wasn't written carelessly. But it reads as 51 files
grown independently rather than one system: the same half-dozen
cross-cutting concerns were each reinvented 3–18 times instead of being
centralized, and where a shared module does exist, it absorbed unrelated
responsibilities rather than staying scoped to its name.

---

## Project-wide structure & hygiene

(Beyond U1–U3 above, which live here but earned top billing.)

1. **Two test files test source-code text, not behavior** —
   `ContactDetail.test.jsx` and `Contacts.test.jsx` (already known from the
   robustness audit's validator false-positive) never render or call the
   component; they regex-match against the raw source file. A rename or
   reformat fails them for no real reason; a logic bug that keeps the same
   literal strings passes clean. This is the outlier, not the norm — the
   codebase clearly knows how to write real tests (`offerCalc.test.js`,
   `goalMath.test.js`, RTL-based component tests are genuine).
2. **Zero test coverage for the permissions system and all deadline/date
   math** — `lib/permissions.js`'s 48-key RBAC matrix and all business-day
   deadline logic have no tests anywhere, despite being as business-critical
   as the pricing math that *is* well tested.
3. **`offerCalc.js` has already drifted between browser and server copies**
   despite a header comment in both mandating they stay byte-identical:
   the browser copy (`src/lib/offerCalc.js:126`) has an extra warning check
   for `subject_mortgage === false` that the server copy
   (`api/_lib/offerCalc.js`) lacks entirely. No test catches this — it's the
   exact failure mode the comment exists to prevent, already happening.
4. **21 of 25 non-main/v2 branches look abandoned** — 11 have zero commits
   not already in `main` (pure litter), another 6 are ~109 commits behind
   current `main` and almost certainly superseded. Only one
   (`codex/targetos-live-release`, 3 behind) looks plausibly still relevant.
5. **`package.json`'s `engines: {"node": ">=18.0.0"}` is incompatible with
   its own devDependencies** — `jsdom@^30` and `vitest@^4` both require
   Node versions newer than 18-22, so a contributor on a "supported" Node
   version per this file cannot actually run the test suite.
6. **`sql/`'s organization is accidental, not principled** — ~35 flat files
   alongside a `sql/phase1/` lettered-migration scheme, a *different*
   lettered scheme in `sql/offers_v2/`, ALL-CAPS one-off repair scripts, and
   3 more loose migration files at the repo root outside `sql/` entirely.
   Notably, `supabase_migration.sql` — one of those root-level files — is
   where the `briefing_prefs` open-CRUD policy the robustness audit already
   flagged (C4) originated: ungoverned root-level SQL is concretely where
   that bug class enters. There are also two overlapping "apply everything"
   mega-files, the same "duplicate migration bundle" shape already flagged
   once elsewhere (M6 in the other audit), recurring a second time.
7. **`DEPLOY.md` is a 2-line dead stub** ("# TargetOS V2" / a build
   timestamp from 2.5 months ago) — anyone looking for deploy docs where the
   filename says to look finds nothing; the real instructions live only in
   `CLAUDE.md` (which, per U3, contradicted itself until this session).
8. **`docs/SECURITY_CHECKLIST.md` overstates what's actually enforced** —
   it lists the 7 money/identity endpoints' auth requirement as a completed
   fact, when in the actual code that check only fires if
   `AUTH_ENFORCE==='true'`, which `docs/HANDOFF.md`'s own outstanding list
   says is still unresolved. A reader trusting only the checklist would
   believe this is live protection; it isn't yet.
9. **`docs/offers-v2-release-runbook.md` documents a PR-based release
   process the repo no longer follows** — the last several commits on
   `main` are direct pushes, matching `CLAUDE.md`'s actual workflow, not
   this runbook's process. It also references an "open PR #5" for a fix
   that appears to still be unfixed in code with no visible open PR.

**Verdict:** the code itself is in better shape than the documentation and
repo hygiene around it. The newer unit tests and the SQL migration *pattern*
(where principled) are genuinely good. But the project-wide layer is where
real risk concentrates — U1/U2 carry actual legal/security exposure
independent of anything code-level, and the self-contradicting deploy doc
means the next engineer (human or AI) who trusts it at face value has a
coin-flip chance of doing the dangerous thing.

---

## Suggested order of attack

1. **U1 + U2** — rotate the Resend key now; decide on PII/legal handling for
   the CSV; both are live exposure, not theoretical.
2. **U3** — one-line doc fix, but resolves a genuine contradiction on the
   single most dangerous command in the workflow.
3. Backend duplication (#1–#6 above) — centralizing Supabase-client setup,
   body parsing, and email sending into `_lib/` pays for itself the next
   time any of those six things needs a bug fix.
4. Frontend God components (`DealDrawer`, `Dashboard()`, etc.) — highest
   effort, highest long-term payoff; tackle opportunistically alongside
   feature work in those files rather than as a standalone project.
5. Branch cleanup, doc corrections, engines field — cheap, do whenever.
