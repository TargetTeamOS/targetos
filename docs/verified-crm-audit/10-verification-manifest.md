# Verification Manifest

## Repository identity

| Item | Result | Status |
|---|---|---|
| Remote | `https://github.com/TargetTeamOS/targetos.git` | **Verified** |
| Source ref | `feature/connected-email-accounts` | **Verified** |
| Source commit | `726fe39d9d66e3f34eaa1cbc3864bf5899396c51` | **Verified** |
| Audit branch | `codex/verified-crm-audit` | **Verified** |
| Remote comparison | Source ref and local audited HEAD matched at checkout time | **Verified** |
| Native Git | Not installed/available in this Windows environment | **Verified** |
| Git implementation used | `isomorphic-git@1.36.1` for clone, branch, status, and audit commit | **Verified** |

## Inventory counts

| Inventory | Count/result | Status |
|---|---|---|
| Page modules | 51 | **Verified** |
| Component modules | 62 | **Verified** |
| Source JavaScript/JSX files | 197 | **Verified** |
| `src/lib` files including tests | 78 | **Verified** |
| API JavaScript route handlers | 53 | **Verified** |
| API shared JavaScript libraries | 17 | **Verified** |
| API JavaScript files total | 70 | **Verified** |
| Supabase Edge Functions | 5 | **Verified** |
| Test files | 20 | **Verified** |
| Non-catch-all route paths seen by smoke script | 66 | **Verified** |
| Relative source imports seen by smoke script | 670 | **Verified** |
| Committed policy statements across loose SQL | 64 | **Verified** |
| Runtime tables without committed creation SQL | 24 | **Verified** |
| Runtime RPCs without committed function SQL | 4 | **Verified** |

## Commands and operations run

The audit used read-only repository searches plus documentation writes. Important commands/operations:

| Command/operation | Result | Status |
|---|---|---|
| Inspect both configured workspace roots and locate repository material | Initial Documents root was empty; Desktop contained only a handoff patch | **Verified** |
| Install local `isomorphic-git@1.36.1` helper | Completed | **Verified** |
| Clone `feature/connected-email-accounts` and create `codex/verified-crm-audit` | Completed | **Verified** |
| Compare remote refs and local HEAD | Source ref matched `726fe39...` | **Verified** |
| `rg --files src api sql supabase docs scripts` | Completed source inventory | **Verified** |
| `rg` searches for routes, Supabase tables/RPCs, auth controls, environment variables, email providers, Monday, storage, and integration code | Completed | **Verified** |
| PowerShell extraction of SQL tables/views/functions/triggers/policies | Completed | **Verified** |
| PowerShell comparison of runtime table/RPC references against SQL definitions | Completed | **Verified** |
| PowerShell endpoint authentication matrix | Completed | **Verified** |
| `npm ci` | Failed with `spawn EPERM` | **Unknown** environment/toolchain block |
| Elevated approved `npm ci` retry | Failed because Windows denied execution of `node_modules/@esbuild/win32-x64/esbuild.exe` | **Unknown** environment/toolchain block |
| `node scripts/validate.js` | Ten static checks passed; unit-test child process blocked by `spawnSync cmd.exe EPERM` | **Partially verified** |
| `node scripts/smoke.js` | Imports/routes/default exports passed; API esbuild transform blocked because install did not complete | **Partially verified** |
| `node --check` over all `api/**/*.js` | 70/70 passed | **Verified** |
| Documentation link/count validation | 11 Markdown files found; all local Markdown links resolve | **Verified** |
| Documentation coverage comparison | 51/51 page module names and 53/53 API route filenames represented | **Verified** |
| SQL-object coverage comparison | 103 unique committed table/view/function/trigger names represented in the database audit | **Verified** |
| Finding-label scan | No unlabeled finding bullets outside the action-only roadmap | **Verified** |

## Checks passed

- **Verified** — No JSX-context backticks found by the repository validator.
- **Verified** — Validator relative imports resolve.
- **Verified** — Top-level API route files use CommonJS.
- **Verified** — Validator found no undefined `custom` variable in its checked pattern.
- **Verified** — Validator found required `useLocation()` hooks for its checked pattern.
- **Verified** — `vercel.json` passed the repository validator.
- **Verified** — Validator found no duplicate static Supabase channel names.
- **Verified** — All page modules export a component/value.
- **Verified** — Validator's selected hook-order checks passed.
- **Verified** — Validator's selected component-import checks passed.
- **Verified** — Smoke import resolution passed for 670 relative imports across 197 source files.
- **Verified** — Smoke route checks found 66 unique paths and all route elements imported.
- **Verified** — Smoke confirmed default exports for API routes.
- **Verified** — Native Node syntax checking passed for all 70 API JavaScript files.
- **Verified** — All 11 audit files resolve their local Markdown links.
- **Verified** — Page, API route, and SQL object coverage checks found no omitted names.

## Checks blocked

- **Unknown** — `npm test` could not execute because Windows blocked the child command/tool binary.
- **Unknown** — `npm run build` could not be run because the locked dependency install could not complete its esbuild install script.
- **Unknown** — API esbuild transformation in `scripts/smoke.js` could not run.
- **Unknown** — `npm run render-smoke` could not run because it requires esbuild.
- **Unknown** — Full `npm run preflight` could not run for the same dependency/tool execution reason.
- **Unknown** — Live database schema, migration history, RLS/policies, storage, functions, and schedules were not accessible.
- **Unknown** — Production Vercel environment flags and secrets were not accessible.
- **Unknown** — External provider connections and live end-to-end workflows were not exercised.

## Audit limitations

- **Verified** — A static audit can prove committed code paths and concrete source defects.
- **Unknown** — It cannot prove live deployment state, data quality, third-party consent/configuration, historical migrations, or actual workflow success.
- **Verified** - Blocked checks are reported as blocked, not passed or failed.

## Phase 1 verification addendum

- **Verified** - Remote audit branch `codex/verified-crm-audit` resolves to `453461ed8bd3b07cf436f04a3dad290590ffd256`.
- **Verified** - Repair work started from that exact commit on `codex/security-authentication-repair`.
- **Verified** - API syntax checks pass after implementation.
- **Partially verified** - Static source validation passes; its nested unit-test launch is blocked by Windows `EPERM`.
- **Unknown** - Linux GitHub Actions results are pending publication of the repair branch.
