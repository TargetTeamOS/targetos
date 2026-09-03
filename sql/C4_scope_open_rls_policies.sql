-- ═══════════════════════════════════════════════════════════════
-- C4 — Scope open ("using(true) with check(true)") RLS policies
-- (Sept 2026 audit, docs/robustness-audit-2026-09-02.md, finding C4)
--
-- docs/HANDOFF.md certifies "RLS ON for all tables," which is true, but
-- RLS being ON does not mean the policy does anything. The 8 tables
-- below all have a policy shaped `for all to authenticated using (true)
-- with check (true))` — i.e. any signed-in agent can read AND write
-- every row, including every OTHER agent's rows, regardless of what the
-- app's own UI-level role checks say. This is the exact same bug class
-- as the `offers-v2 commit 23` fix (RLS technically on, policy a no-op)
-- and the private_contacts_rls.sql fix already applied to `contacts`.
--
-- This migration replaces each blanket policy with one scoped to the
-- actual ownership/visibility model that migration already established
-- for `contacts`, and the app_can_view_agent()/app_can_edit_resource()/
-- secretary_permissions helpers sql/phase1/A_safe_foundation.sql already
-- built for exactly this purpose. It does NOT touch RLS on `contacts`,
-- `listings`, `deals`, `tasks`, etc. — those aren't in the audit finding
-- and this migration doesn't assume anything about their current state.
--
-- ── IMPORTANT — read before running ──────────────────────────────
-- I (Claude) do not have direct database access and could not test this
-- against your actual data or exercise every affected page. I read the
-- app's own source to infer each table's real intended access pattern
-- (who the client code expects to be able to read/write it) rather than
-- guessing, and left a comment on every table explaining that reasoning
-- and any judgment call. Please read those comments, and TEST ON THE v2
-- BRANCH FIRST — click through each affected page listed per table as a
-- non-admin agent AND as admin/secretary — before this ever touches
-- production data. If any page breaks, the ROLLBACK block at the bottom
-- restores today's fully-open policies exactly.
--
-- Two judgment calls worth flagging up front:
--  1. website_content and tv_playlist currently have NO write
--     restriction of any kind (any signed-in agent can overwrite your
--     public website or the office TV playlist). Neither table has a
--     "canManage" gate in the app's OWN UI except tv_playlist's — I
--     scoped both writes to admin-or-secretary (this codebase's
--     existing "canManage" role pair) to close the hole without
--     guessing at a finer-grained rule. If regular agents are expected
--     to edit these, loosen the relevant policy below.
--  2. system_settings stores several unrelated config blobs under one
--     table, keyed by `key` — including `permission_overrides`, which
--     is what actually grants extra admin-level permissions to specific
--     staff. Today ANY signed-in agent can overwrite that key directly
--     via the Supabase client and grant themselves admin rights. I
--     locked that specific key to admin-only and left every other key
--     admin-or-secretary. This is the highest-severity single fix in
--     this file even though the audit filed it under "lower severity."
--
-- Idempotent (safe to re-run). Run in the Supabase SQL editor.
-- ═══════════════════════════════════════════════════════════════

-- ── PRE-FLIGHT: the helper functions and columns this migration relies
--    on must already exist (from sql/phase1/A_safe_foundation.sql and
--    sql/private_contacts_rls.sql). If either of these returns an
--    error or zero rows, STOP — run those migrations first.
select 'app_is_admin exists: ok' as preflight
where to_regprocedure('public.app_is_admin()') is not null;

select 'contacts.is_private exists: ok' as preflight
where exists (
  select 1 from information_schema.columns
  where table_schema='public' and table_name='contacts' and column_name='is_private'
);

-- ═══ agent_goals — personal production numbers + goals ═══
-- App usage (src/pages/Analytics.jsx, AgentPerformance.jsx): any agent
-- can currently read/overwrite every OTHER agent's goals/GCI/production
-- straight from the browser. AgentPerformance.jsx's own UI already
-- computes `canEdit = isAdmin || canManage` before showing an edit
-- control — this migration is what makes that check actually mean
-- something at the data layer. Uses the 'goals' resource name already
-- referenced by app_agent_goal() in A_safe_foundation.sql.
drop policy if exists agent_goals_all on agent_goals;
drop policy if exists agent_goals_select on agent_goals;
drop policy if exists agent_goals_insert on agent_goals;
drop policy if exists agent_goals_update on agent_goals;
drop policy if exists agent_goals_delete on agent_goals;

create policy agent_goals_select on agent_goals for select to authenticated using (
  agent_id = public.app_current_agent_id()
  or public.app_can_view_agent(agent_id, 'goals')
  or public.app_can_view_financials(agent_id, 'goals', 'agent')
);
create policy agent_goals_insert on agent_goals for insert to authenticated with check (
  agent_id = public.app_current_agent_id() or public.app_can_create_for(agent_id, 'goals')
);
create policy agent_goals_update on agent_goals for update to authenticated
  using (agent_id = public.app_current_agent_id() or public.app_can_edit_resource(agent_id, 'goals'))
  with check (agent_id = public.app_current_agent_id() or public.app_can_edit_resource(agent_id, 'goals'));
create policy agent_goals_delete on agent_goals for delete to authenticated using (
  agent_id = public.app_current_agent_id() or public.app_can_delete(agent_id, 'goals')
);

-- ═══ system_settings — org config, INCLUDING permission_overrides ═══
-- Reads stay open (src/lib/customFields.js, tcSettings.js,
-- contactLayout.js, permissions.js, api/dashboard-data.js all expect
-- every signed-in agent to be able to read config broadly). Writes are
-- the real hole: today any agent can overwrite the 'permission_overrides'
-- key directly and grant themselves admin-level permissions — that key
-- is locked to admin only; every other key (custom_fields, side_colors,
-- tc_settings, contact_layout, dashboard_mls_areas, ...) is admin-or-
-- secretary, matching this codebase's existing "canManage" convention
-- (src/context/AuthContext.jsx: canManage = isAdmin || isSecretary).
drop policy if exists system_settings_all on system_settings;
drop policy if exists system_settings_select on system_settings;
drop policy if exists system_settings_write on system_settings;

create policy system_settings_select on system_settings for select to authenticated using (true);
create policy system_settings_write on system_settings for all to authenticated
  using (
    case when key = 'permission_overrides' then public.app_is_admin()
         else public.app_is_admin() or public.app_is_secretary() end
  )
  with check (
    case when key = 'permission_overrides' then public.app_is_admin()
         else public.app_is_admin() or public.app_is_secretary() end
  );

-- ═══ briefing_prefs — personal notification settings + one shared row ═══
-- Almost entirely per-agent personal preferences (src/lib/db/
-- briefingprefs.js, dashboardPrefs.js, DailyBriefing.jsx). One
-- exception: dashboardPrefs.js stores a SHARED "team goal" under the
-- sentinel agent_id 00000000-0000-0000-0000-000000000000, which every
-- agent's dashboard reads (Dashboard.jsx:1606, ungated) but only an
-- admin can save (Dashboard.jsx:1170: `if (isAdmin) await
-- saveTeamGoal(...)`) — the policy below reproduces exactly that split.
drop policy if exists briefing_prefs_all on briefing_prefs;
drop policy if exists briefing_prefs_select on briefing_prefs;
drop policy if exists briefing_prefs_insert on briefing_prefs;
drop policy if exists briefing_prefs_update on briefing_prefs;
drop policy if exists briefing_prefs_delete on briefing_prefs;

create policy briefing_prefs_select on briefing_prefs for select to authenticated using (
  agent_id = public.app_current_agent_id()
  or agent_id = '00000000-0000-0000-0000-000000000000'
  or public.app_is_admin()
);
create policy briefing_prefs_insert on briefing_prefs for insert to authenticated with check (
  agent_id = public.app_current_agent_id() or public.app_is_admin()
);
create policy briefing_prefs_update on briefing_prefs for update to authenticated
  using (agent_id = public.app_current_agent_id() or public.app_is_admin())
  with check (agent_id = public.app_current_agent_id() or public.app_is_admin());
create policy briefing_prefs_delete on briefing_prefs for delete to authenticated using (
  public.app_is_admin()
);

-- ═══ briefing_sends — append-only "briefing already sent today" log ═══
-- Written by the hardened cron (api/daily-briefing-cron.js, service
-- role — unaffected by RLS) AND by DailyBriefing.jsx's "Send All" button,
-- which is gated `if (!isAdmin && !canManage) return` and inserts a row
-- per OTHER agent as it sends each one — so admin/secretary need insert
-- access for agent_id values that aren't their own, not just self.
drop policy if exists briefing_sends_all on briefing_sends;
drop policy if exists briefing_sends_select on briefing_sends;
drop policy if exists briefing_sends_insert on briefing_sends;
drop policy if exists briefing_sends_update on briefing_sends;
drop policy if exists briefing_sends_delete on briefing_sends;

create policy briefing_sends_select on briefing_sends for select to authenticated using (
  agent_id = public.app_current_agent_id() or public.app_is_admin() or public.app_is_secretary()
);
create policy briefing_sends_insert on briefing_sends for insert to authenticated with check (
  agent_id = public.app_current_agent_id() or public.app_is_admin() or public.app_is_secretary()
);
create policy briefing_sends_update on briefing_sends for update to authenticated
  using (public.app_is_admin()) with check (public.app_is_admin());
create policy briefing_sends_delete on briefing_sends for delete to authenticated using (
  public.app_is_admin()
);

-- ═══ contact_automations — automations attached to a contact ═══
-- In practice reached ONLY through api/contact-automations.js, which
-- uses the service-role key and bypasses RLS entirely (confirmed: no
-- direct `supabase.from('contact_automations')` call anywhere in src/).
-- So this policy is pure defense-in-depth against a client calling the
-- table directly with its own session. Mirrors contacts' own visibility
-- rule (private_contacts_rls.sql): visible/editable if the underlying
-- contact is visible to you.
drop policy if exists contact_automations_all on contact_automations;
drop policy if exists contact_automations_select on contact_automations;
drop policy if exists contact_automations_insert on contact_automations;
drop policy if exists contact_automations_update on contact_automations;
drop policy if exists contact_automations_delete on contact_automations;

create policy contact_automations_select on contact_automations for select to authenticated using (
  public.app_is_admin() or exists (
    select 1 from contacts c where c.id = contact_automations.contact_id
      and (c.is_private = false or c.agent_id = public.app_current_agent_id())
  )
);
create policy contact_automations_insert on contact_automations for insert to authenticated with check (
  public.app_is_admin() or exists (
    select 1 from contacts c where c.id = contact_automations.contact_id
      and (c.is_private = false or c.agent_id = public.app_current_agent_id())
  )
);
create policy contact_automations_update on contact_automations for update to authenticated
  using (
    public.app_is_admin() or exists (
      select 1 from contacts c where c.id = contact_automations.contact_id
        and (c.is_private = false or c.agent_id = public.app_current_agent_id())
    )
  )
  with check (
    public.app_is_admin() or exists (
      select 1 from contacts c where c.id = contact_automations.contact_id
        and (c.is_private = false or c.agent_id = public.app_current_agent_id())
    )
  );
create policy contact_automations_delete on contact_automations for delete to authenticated using (
  public.app_is_admin() or exists (
    select 1 from contacts c where c.id = contact_automations.contact_id
      and (c.is_private = false or c.agent_id = public.app_current_agent_id())
  )
);

-- ═══ contact_showings — buyer showings, logged from ContactDetail ═══
-- src/components/BuyerInterest.jsx reads/writes this for whatever
-- contact's detail page is currently open — since contacts are visible
-- team-wide unless marked private, showings should follow the same
-- rule as the contact they're attached to (contact_showings.agent_id is
-- whoever logged the showing, not necessarily the contact's owner, so
-- the contact_id join is the right visibility gate here, not agent_id).
drop policy if exists contact_showings_all on contact_showings;
drop policy if exists contact_showings_select on contact_showings;
drop policy if exists contact_showings_insert on contact_showings;
drop policy if exists contact_showings_update on contact_showings;
drop policy if exists contact_showings_delete on contact_showings;

create policy contact_showings_select on contact_showings for select to authenticated using (
  public.app_is_admin() or exists (
    select 1 from contacts c where c.id = contact_showings.contact_id
      and (c.is_private = false or c.agent_id = public.app_current_agent_id())
  )
);
create policy contact_showings_insert on contact_showings for insert to authenticated with check (
  public.app_is_admin() or exists (
    select 1 from contacts c where c.id = contact_showings.contact_id
      and (c.is_private = false or c.agent_id = public.app_current_agent_id())
  )
);
create policy contact_showings_update on contact_showings for update to authenticated
  using (
    public.app_is_admin() or exists (
      select 1 from contacts c where c.id = contact_showings.contact_id
        and (c.is_private = false or c.agent_id = public.app_current_agent_id())
    )
  )
  with check (
    public.app_is_admin() or exists (
      select 1 from contacts c where c.id = contact_showings.contact_id
        and (c.is_private = false or c.agent_id = public.app_current_agent_id())
    )
  );
create policy contact_showings_delete on contact_showings for delete to authenticated using (
  public.app_is_admin() or exists (
    select 1 from contacts c where c.id = contact_showings.contact_id
      and (c.is_private = false or c.agent_id = public.app_current_agent_id())
  )
);

-- ═══ listing_showings — showings logged against one of your listings ═══
-- src/pages/MyListings.jsx already filters listings to `agent_id = you`
-- unless you hold the app-level 'listings.view_all' permission (a
-- JS-only permission not represented in SQL) — I could not replicate
-- that specific custom permission here, so admin-or-secretary stands in
-- for "elevated, sees everything" the same way it does elsewhere in
-- this file. listing_showings.agent_id is always set to the CURRENT
-- agent on insert (MyListings.jsx: `agent_id: agent?.id`), so ownership
-- is checked both ways: your own logged showings, or showings on a
-- listing you own.
drop policy if exists listing_showings_all on listing_showings;
drop policy if exists listing_showings_select on listing_showings;
drop policy if exists listing_showings_insert on listing_showings;
drop policy if exists listing_showings_update on listing_showings;
drop policy if exists listing_showings_delete on listing_showings;

create policy listing_showings_select on listing_showings for select to authenticated using (
  agent_id = public.app_current_agent_id()
  or public.app_is_admin() or public.app_is_secretary()
  or exists (select 1 from listings l where l.id = listing_showings.listing_id and l.agent_id = public.app_current_agent_id())
);
create policy listing_showings_insert on listing_showings for insert to authenticated with check (
  agent_id = public.app_current_agent_id()
  or public.app_is_admin() or public.app_is_secretary()
);
create policy listing_showings_update on listing_showings for update to authenticated
  using (
    agent_id = public.app_current_agent_id()
    or public.app_is_admin() or public.app_is_secretary()
    or exists (select 1 from listings l where l.id = listing_showings.listing_id and l.agent_id = public.app_current_agent_id())
  )
  with check (
    agent_id = public.app_current_agent_id()
    or public.app_is_admin() or public.app_is_secretary()
    or exists (select 1 from listings l where l.id = listing_showings.listing_id and l.agent_id = public.app_current_agent_id())
  );
create policy listing_showings_delete on listing_showings for delete to authenticated using (
  public.app_is_admin() or public.app_is_secretary()
);

-- ═══ website_content — public marketing site sections ═══
-- src/pages/PublicSite.jsx (the unauthenticated /public/* site) and
-- WebsiteBuilder.jsx (the in-app editor, currently gated by NOTHING —
-- isAdmin is destructured but never actually checked) both read this
-- table directly. Reads are left open (unclear whether anonymous
-- visitors to /public/* hit RLS as 'anon' or 'authenticated' depending
-- on your Supabase anonymous-auth setting — this migration doesn't
-- change that either way). Writes are scoped to admin-or-secretary,
-- which is a NEW restriction: today literally any signed-in agent can
-- rewrite your public website. If regular agents are expected to edit
-- their own bio/section, loosen this.
drop policy if exists website_content_all on website_content;
drop policy if exists website_content_select on website_content;
drop policy if exists website_content_write on website_content;

create policy website_content_select on website_content for select to authenticated using (true);
create policy website_content_write on website_content for all to authenticated
  using (public.app_is_admin() or public.app_is_secretary())
  with check (public.app_is_admin() or public.app_is_secretary());

-- ═══ tv_playlist — shared office TV playlist ═══
-- src/components/TVStudio.jsx is the only place this is written from,
-- and it's already gated in the UI by `canManage` (Announcements.jsx:
-- `{pageTab === 'playlist' && canManage && (...)}`, where canManage =
-- isAdmin || isSecretary in AuthContext.jsx) — this policy just makes
-- that check real at the data layer instead of decorative. The public
-- /tv board itself goes through api/tv-data.js (service role), so
-- reads are left open for the in-app editor without affecting the
-- public board either way.
drop policy if exists tv_playlist_all on tv_playlist;
drop policy if exists tv_playlist_select on tv_playlist;
drop policy if exists tv_playlist_write on tv_playlist;

create policy tv_playlist_select on tv_playlist for select to authenticated using (true);
create policy tv_playlist_write on tv_playlist for all to authenticated
  using (public.app_is_admin() or public.app_is_secretary())
  with check (public.app_is_admin() or public.app_is_secretary());

select 'C4 RLS scoping applied' as status;

-- ═══════════════════════════════════════════════════════════════
-- POST-CHECK (run through the app as different roles, not the SQL
-- editor — the SQL editor uses the service role and bypasses RLS, so
-- it will always show everything regardless of these policies):
--   1. As a regular agent: Analytics/AgentPerformance shows your own
--      goal row; you can edit your own goal but not (via devtools)
--      another agent's.
--   2. As admin/secretary: goals, TV playlist, website content, and
--      system settings all still fully editable.
--   3. As a regular agent: ContactDetail → showings/automations still
--      work normally for any non-private contact; a private contact
--      you don't own shows neither.
--   4. As a regular agent: Daily Briefing page loads your own prefs;
--      "Send All" is hidden/blocked unless you're admin/secretary.
--   5. MyListings still shows your own listings' showings; an
--      admin/secretary still sees everyone's.
-- ═══════════════════════════════════════════════════════════════

-- ═══ ROLLBACK — restores today's fully-open policies exactly ═══
-- Run this block alone (comment out everything above) to revert.
--
-- drop policy if exists agent_goals_select on agent_goals; drop policy if exists agent_goals_insert on agent_goals; drop policy if exists agent_goals_update on agent_goals; drop policy if exists agent_goals_delete on agent_goals;
-- create policy agent_goals_all on agent_goals for all to authenticated using (true) with check (true);
--
-- drop policy if exists system_settings_select on system_settings; drop policy if exists system_settings_write on system_settings;
-- create policy system_settings_all on system_settings for all to authenticated using (true) with check (true);
--
-- drop policy if exists briefing_prefs_select on briefing_prefs; drop policy if exists briefing_prefs_insert on briefing_prefs; drop policy if exists briefing_prefs_update on briefing_prefs; drop policy if exists briefing_prefs_delete on briefing_prefs;
-- create policy briefing_prefs_all on briefing_prefs for all to authenticated using (true) with check (true);
--
-- drop policy if exists briefing_sends_select on briefing_sends; drop policy if exists briefing_sends_insert on briefing_sends; drop policy if exists briefing_sends_update on briefing_sends; drop policy if exists briefing_sends_delete on briefing_sends;
-- create policy briefing_sends_all on briefing_sends for all to authenticated using (true) with check (true);
--
-- drop policy if exists contact_automations_select on contact_automations; drop policy if exists contact_automations_insert on contact_automations; drop policy if exists contact_automations_update on contact_automations; drop policy if exists contact_automations_delete on contact_automations;
-- create policy contact_automations_all on contact_automations for all to authenticated using (true) with check (true);
--
-- drop policy if exists contact_showings_select on contact_showings; drop policy if exists contact_showings_insert on contact_showings; drop policy if exists contact_showings_update on contact_showings; drop policy if exists contact_showings_delete on contact_showings;
-- create policy contact_showings_all on contact_showings for all to authenticated using (true) with check (true);
--
-- drop policy if exists listing_showings_select on listing_showings; drop policy if exists listing_showings_insert on listing_showings; drop policy if exists listing_showings_update on listing_showings; drop policy if exists listing_showings_delete on listing_showings;
-- create policy listing_showings_all on listing_showings for all to authenticated using (true) with check (true);
--
-- drop policy if exists website_content_select on website_content; drop policy if exists website_content_write on website_content;
-- create policy website_content_all on website_content for all to authenticated using (true) with check (true);
--
-- drop policy if exists tv_playlist_select on tv_playlist; drop policy if exists tv_playlist_write on tv_playlist;
-- create policy tv_playlist_all on tv_playlist for all to authenticated using (true) with check (true);
