// ESLint flat config (ESLint 9+ format).
//
// Added Sept 2026 as part of the robustness audit follow-up: this project's
// only pre-existing safety net for React mistakes was a homegrown
// regex/brace-depth scanner in scripts/validate.js (see M3 in
// docs/code-quality-audit-2026-09-02.md). That scanner is a reasonable
// stopgap but it's fragile by construction -- it re-implements Rules of
// Hooks detection with string matching instead of an AST. Real ESLint +
// eslint-plugin-react-hooks (the same plugin the React team ships) catches
// the same bug class (and more) with an actual parser, so it now runs
// alongside validate.js in `npm run preflight` rather than replacing it --
// belt and suspenders, since validate.js also catches a few project-specific
// patterns (duplicate Supabase channel names, JSX-attribute template-literal
// crashes) that a generic linter has no way to know about.
//
// Scope: src/**, api/**, scripts/**. supabase/functions/**/*.ts is
// deliberately NOT linted here -- those are Deno-flavored TypeScript
// (top-level `!` non-null assertions, Deno.serve, esm.sh imports) and
// linting them properly needs @typescript-eslint + a Deno-aware global set,
// which is a bigger follow-up than this pass (tracked as a future upgrade,
// not silently skipped).
import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

export default [
  {
    // Build output and vendored/local tooling -- never lint these.
    ignores: ['dist/**', 'node_modules/**', '.npm-global/**', 'supabase/functions/**'],
  },

  // ── Frontend app code (src/**) ────────────────────────────────────────────
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      // `process` is declared here even though this scope is otherwise
      // browser-only: src/lib/reportEngine.js runs isomorphically (both
      // client preview and server cron) and reads it behind a
      // `typeof process !== 'undefined'` guard -- a real, deliberate
      // pattern, not a bug, so it shouldn't be flagged.
      globals: { ...globals.browser, ...globals.es2021, process: 'readonly' },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...js.configs.recommended.rules,
      // eslint-plugin-react-hooks v7's "recommended" config bundles the
      // React Compiler's much broader rule set (set-state-in-effect,
      // static-components, immutability, purity, etc.) -- valuable, but a
      // separate, deliberate adoption project for ~90 existing pages, not
      // something to silently turn on as "error" in a lint-setup pass. We
      // only turn on the two classic, unambiguous-bug rules this task was
      // actually about:
      //  - rules-of-hooks: the exact bug class behind findings H1/H2 (a
      //    hook called after an early return, or inside a condition/loop --
      //    always a real crash, never a style choice).
      //  - exhaustive-deps: real signal, but many existing effects
      //    intentionally omit a dependency, so this stays a warning rather
      //    than blocking the build.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': 'off', // not enforcing fast-refresh conventions retroactively on ~90 existing pages
      // This codebase leans on unused destructured/catch-block variables
      // and work-in-progress imports in a lot of existing files; treat as
      // a warning so the linter is adoptable without a giant unrelated
      // cleanup PR blocking every future change. Real dead-code removal is
      // tracked separately (task #15).
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-empty': 'warn',
      'no-constant-condition': ['error', { checkLoops: false }],
      // This codebase's idiomatic pattern for "safely parse this, default
      // if it fails" is `let x = default; try { x = real() } catch { x =
      // fallback }` -- every branch always reassigns before x is read, so
      // ESLint 9's newer no-useless-assignment rule flags the initial
      // default every time. That's real defensive style here, not a bug,
      // so it's a warning rather than blocking the build.
      'no-useless-assignment': 'warn',
    },
  },

  // ── Tests (src/**/*.test.{js,jsx}, src/__tests__/**) ──────────────────────
  // Layered on top of the src/** block above: vitest.config's `test.environment:
  // 'node'` means these files can genuinely use require()/__dirname/global
  // (several import CommonJS api/*.js handlers directly -- see the comment
  // in offerPdfBuild.test.js), which src/**'s browser-only globals don't
  // include. vitest also injects describe/it/expect etc. as real globals
  // (test.globals: true), even though most files here import them from
  // 'vitest' explicitly anyway.
  {
    files: ['src/**/*.test.{js,jsx}', 'src/__tests__/**/*.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.vitest },
    },
  },

  // ── Vercel serverless functions (api/**) -- CommonJS, Node ────────────────
  {
    files: ['api/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-empty': 'warn',
      'no-useless-assignment': 'warn', // see the same rule in src/** above
    },
  },

  // ── Build/deploy-gate scripts (scripts/**) -- CommonJS, Node ──────────────
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      // Deliberate best-effort `catch {}` / `catch (e) {}` blocks -- e.g.
      // "delete this temp file, but don't fail the build if it's already
      // gone" -- not bugs.
      'no-empty': 'warn',
    },
  },

  // Config files themselves (this file, vite.config.js) run under Node/ESM.
  {
    files: ['*.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
]
