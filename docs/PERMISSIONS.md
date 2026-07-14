# TargetOS Permissions — Enforcement Design

*Status as of July 2026: Phase 1 shipped. Phases 2–3 designed, not built.*

## What already existed

`src/lib/permissions.js` has the full data model: `DEFAULT_PERMISSIONS`
(48 permission keys across 8 groups, per-role defaults for
admin/secretary/agent), admin overrides stored in
`system_settings.permission_overrides`, a 5-minute cache, and
`buildPermissionChecker(role, overrides)` which returns a
`can(key) → boolean` function. The Admin → Permissions tab edits
overrides and they save correctly. **Nothing enforced them.**

## Phase 1 (SHIPPED)

1. **`can()` is now app-wide.** `AuthContext` loads the overrides when
   the agent loads and exposes `can(key)` (plus `refreshPermissions()`)
   through `useAuth()`. Until overrides load, role defaults apply — there
   is no window where checks are simply off. No agent → everything denied.

2. **Destructive actions enforced.** Delete handlers now check
   permission before touching the database (guard is in the *handler*,
   not just the button, so it holds regardless of how the action is
   triggered):
   - `Contacts.jsx` — single + bulk delete → `contacts.delete`
   - `Production.jsx` — single + bulk deal delete → `deals.delete`
   - `Listings.jsx` — listing delete → `listings.delete`

3. **Route guard primitive.** `<RequirePermission perm="...">` in
   `App.jsx` redirects home when denied. Applied to `/call-flow`
   (`calls.flow_edit`) — previously ANY logged-in agent could open the
   live IVR editor.

## Phase 2 (NEXT) — widen client-side coverage

Mechanical application of the same two primitives:

- Gate export/import buttons: `contacts.export/import`, `deals.export/import`, `reports.export`
- Gate reassignment UI: `contacts.reassign`
- Gate GCI visibility: `deals.view_gci`, `deals.view_team_gci` (Production board columns + Dashboard widgets)
- Route-guard `/automations` (`admin.automations`), `/custom-fields` (`admin.customize`), `/reports` (`reports.view`)
- Replace ad-hoc `isAdmin`/`canManage` checks with `can()` calls page by page, so the Admin → Permissions tab actually controls what it claims to

**Rule for Phase 2:** never *loosen* an existing hardcoded check.
Where a page currently requires admin, `can()` must be at least as
strict under the default matrix.

## Phase 3 (LATER) — server-side enforcement

Client-side checks are UX, not security: anyone with the anon key can
call Supabase directly. Real enforcement means:

1. **API routes:** extend `requireRole()` in `api/_lib/phone.js` to a
   `requirePermission(req, key)` that loads overrides server-side
   (service key, cached) and checks the caller's role against the same
   matrix. Apply to `admin-users.js`, export endpoints, etc.
2. **RLS alignment:** today RLS mostly blocks writes wholesale and the
   app routes writes through API endpoints. Phase 3 should express the
   highest-value rules (delete policies per role) as actual RLS
   policies so the database is the last line of defense.
3. **Shared matrix:** move `DEFAULT_PERMISSIONS` to a plain JSON module
   importable from both the Vite client and CommonJS API code (or
   duplicate with a unit test asserting the two copies match — same
   pattern as `tcPhaseMap.test.js`).

## Gotchas

- `system_settings.permission_overrides` must remain readable by all
  authenticated roles (the client checker needs it) but writable only
  via the Admin UI path.
- The 5-minute cache in `permissions.js` means a permission change can
  take up to 5 minutes to reach other logged-in users. Acceptable;
  document it in the Admin UI if anyone asks.
- Do not route-guard `/activitylog` — it self-scopes (non-admins see
  only their own entries by design).
