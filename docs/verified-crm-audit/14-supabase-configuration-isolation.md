# Supabase Configuration Isolation

Status date: 2026-07-31
Pull request: #5 `codex/supabase-config-isolation`
Verified head: `0e2c52a8782e198a050b61ba680d120a6570bc8a`

## Implementation result

- **Verified** - Browser initialization now requires both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` and rejects a missing value or a URL that is not an exact HTTPS origin.
- **Verified** - Server clients require `SUPABASE_URL` and either `SUPABASE_SERVICE_ROLE_KEY` or the documented `SUPABASE_SERVICE_KEY` alias.
- **Verified** - Active frontend and API code no longer silently selects the previously embedded Supabase project or browser key.
- **Verified** - Service-role credentials remain server-only and are not introduced into browser configuration.
- **Verified** - The core correction changes 18 environment, client, API, page, and regression-test files. Two additional files adjust the Linux workflow and render-smoke harness so the fail-closed configuration is exercised consistently.

## Linux verification

- **Verified** - Push Build Check run `30642629829` passed for commit `0e2c52a8782e198a050b61ba680d120a6570bc8a`.
- **Verified** - Pull-request Build Check run `30642636188` passed for the same commit.
- **Verified** - Both runs completed dependency installation, repository static validation, API JavaScript syntax checks, the full unit-test step, Vite build, smoke checks, and render-smoke checks.
- **Verified** - The Vercel Preview deployment also completed successfully.
- **Partially verified** - Local Windows execution remains blocked by host child-process policy for `cmd.exe`/esbuild. The clean Linux runs are the authoritative automated result.

## Deployment status

- **Verified** - PR #5 is stacked on PR #4, which is stacked on the Phase 1 security branch.
- **Verified** - No merge or Production deployment was performed as part of this correction.
- **Security risk** - Correct environment-variable presence does not prove that Preview or future Production values identify the intended Supabase project. Administrators must verify project identity and scope without exposing values before promotion.
- **Unknown** - Live authenticated role, OAuth ownership/replay, and test-email workflows remain unexecuted against isolated synthetic accounts.
