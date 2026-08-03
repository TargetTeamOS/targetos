# Command Center — data-source audit

For every figure on `/dashboard/command-center`: where it comes from, the date
field, statuses/filters, the permission rule, and the RPC/view/table behind it.
No figure is hard-coded; each widget shows one honest state (real data / no
records / permission denied / setup required / data-source error). Sample values
appear **only** inside the widget builder preview, always labelled "Sample".

## Mortgage rates (top row)
- **Source:** FRED via `/api/market-strip` (server-only `FRED_API_KEY`). Series `MORTGAGE30US`, `MORTGAGE15US`.
- **Date field:** FRED weekly observation date. **Filters:** none. **Permission:** any authenticated user.
- **States:** real / data-source error (isolated) if FRED/key unavailable.
- Disclaimer shown: national weekly averages, not borrower quotes.

## Local & market news (top row)
- **Source:** admin-configured feeds via `app_news_sources_active()` (applied A4), fetched + sanitized server-side in `/api/market-strip`.
- **Filters:** enabled sources, non-fallback first. **Permission:** read for all authenticated; manage sources = admin (`app_news_source_*`).
- **States:** real / empty (no sources) / error. Compact (3 headlines) + expand modal.

## Monthly & yearly team goal (top row / main)
- **Source:** `app_goals_dashboard()` (applied A3). Actual is server-computed from `v_deals_canonical`; **never stored or editable**.
- **Date field:** goal `start_date`..`end_date`. **Basis:** accepted_offers (monthly) / production_volume (yearly) etc. **Statuses:** accepted-offer or official-closed flags per basis.
- **Permission:** team goals visible to all authenticated; individual goals only to that agent or admin.
- **Drill-down:** `app_goal_records(goal_id)` (**pending A5**) → exact deals; until applied the drill states the records view isn't deployed. Widget-level errors now show the real message.
- **States:** real / empty (no goal) / error (message surfaced) / setup-required (drill only).

## Front Runner of the Month (top row)
- **Source:** `app_agent_performance(from,to)` (**pending A7**); winner = max `accepted_offers` for the month, ties preserved.
- **Date field:** `ao_date`. **Statuses:** `is_accepted_offer`. **Permission:** admin/agent (team metric).
- **Presentation** (image/message/visibility): `app_dashboard_settings_set('front_runner')` (**pending A8**), session-local fallback. Winner/count never editable.
- **Drill-down:** `app_agent_records(agent,'accepted_offers',from,to)` (pending A7).
- **States:** real / no-offers-this-month / setup-required (compact).

## My Day (main)
- **Source:** `app_my_day()` (**pending A6**), scoped to `auth.uid()`'s agent only; buckets = tasks due/overdue/completed-today, appts today/upcoming, follow-ups due/overdue, reminders.
- **Date fields:** task `due_date`/`completed_at`, event `start_time`, interaction `follow_up_date`. **Permission:** strict owner-only (agents never see others' private items; admins see their own day; write actions allow a documented admin override).
- **Quick actions:** `app_task_complete` / `app_task_reschedule` / `app_event_reschedule` / `app_task_add_note` / `app_create_followup` (pending A6); disabled with "Secure action setup required" until applied.
- **States:** real / all-clear (empty) / setup-required (full scaffold, muted zeros).

## Agent performance (full width)
- **Source:** `app_agent_performance(from,to)` (**pending A7**) over `v_deals_canonical`; ranking derived client-side.
- **Metrics:** accepted_offers, closed_units, production_volume, buyers, listings; **GCI only when the server returns it (admins)**.
- **Date field:** `ao_date` (offers) / `close_date` (closed/production). **Permission:** admin/agent; secretary forbidden.
- **Drill-down:** `app_agent_records(agent,basis,from,to)` (pending A7); per-deal amounts admin-only.
- **States:** real / no-production-this-period / permission-denied / setup-required (full layout, no figures).

## Custom widgets (full width)
- **Source:** existing engine `production_widgets_migration.sql` (**pending**): `app_production_widget_values` (live values), `app_get_production_widgets` (admin defs), `app_preview_production_widgets` (draft preview), `app_save_production_widgets` (validated + audited full-replace).
- **Allowlist:** metric ∈ count/sum/avg/progress; field ∈ production/gci/expected_gci/collected_gci/pipeline_gci; date modes/fields, formats, and filter keys per `_pw_validate`; scope team; ≤12 widgets. No arbitrary SQL; admin enforced server-side; no service-role key in frontend.
- **States:** real (live values) / empty (none defined) / setup-required (sample gallery, persistence disabled).

## Settings (admin drawer)
- Team goals → `app_goal_upsert` (applied A3). News → `app_news_source_*` (applied A4). Front Runner / visible metrics / default range → `app_dashboard_settings_set` (pending A8, session fallback).
