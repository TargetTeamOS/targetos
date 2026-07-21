-- ══════════════════════════════════════════════════════════════════
-- PHASE 1 · MIGRATION C — FINAL ENFORCEMENT
-- ⛔ DO NOT RUN UNTIL MIGRATION B VERIFIES ALL ACTIVE USERS ARE LINKED
-- ⛔ (B5 and B6 must both return 0 rows). Running this early locks out
-- ⛔ every unlinked user. Test on a Supabase branch/copy first.
-- Replaces permissive USING(true) policies with real ownership rules.
-- Requires Migration A (helper functions) already applied.
-- ══════════════════════════════════════════════════════════════════

-- Pattern per table: admin=all, agent=own rows, secretary=granted rows.
-- WITH CHECK prevents inserting/reassigning to another agent.
-- Unassigned (agent_id is null): admin only (agents excluded).

do $$
declare t text;
begin
  foreach t in array array['deals','listings','tasks','offers','calls','gifts','open_houses','contacts','calendar_events'] loop
    -- drop known permissive policies (adjust names to match B-audit output)
    execute format('drop policy if exists %I_all on %I', t, t);
    execute format('drop policy if exists %I_select on %I', t, t);
    execute format('drop policy if exists %I_rw on %I', t, t);
    execute format('alter table %I enable row level security', t);

    -- SELECT: own, or admin, or secretary-granted, or (admin-only) unassigned
    execute format($f$
      create policy %1$s_sel on %1$I for select to authenticated using (
        app_is_admin()
        or (agent_id = app_current_agent_id())
        or (agent_id is null and app_is_admin())
        or (app_is_secretary() and app_can_view_agent(agent_id))
      )$f$, t);

    -- INSERT: cannot create under another agent unless authorized
    execute format($f$
      create policy %1$s_ins on %1$I for insert to authenticated with check (
        app_is_admin()
        or (agent_id = app_current_agent_id())
        or (app_is_secretary() and app_can_edit_resource(agent_id, %1$L))
      )$f$, t);

    -- UPDATE: can edit own/authorized; WITH CHECK stops reassigning ownership away
    execute format($f$
      create policy %1$s_upd on %1$I for update to authenticated
      using (
        app_is_admin() or agent_id = app_current_agent_id()
        or (app_is_secretary() and app_can_edit_resource(agent_id, %1$L)))
      with check (
        app_is_admin() or agent_id = app_current_agent_id()
        or (app_is_secretary() and app_can_edit_resource(agent_id, %1$L)))$f$, t);

    -- DELETE: admin only (agents/secretaries need explicit grant elsewhere)
    execute format($f$
      create policy %1$s_del on %1$I for delete to authenticated using (app_is_admin())$f$, t);
  end loop;
end $$;

-- agent_goals: agent reads own, admin all, secretary if granted
drop policy if exists agent_goals_all on agent_goals;
alter table agent_goals enable row level security;
create policy agent_goals_sel on agent_goals for select to authenticated using (
  app_is_admin() or agent_id = app_current_agent_id() or (app_is_secretary() and app_can_view_agent(agent_id)));
create policy agent_goals_wr on agent_goals for all to authenticated
  using (app_is_admin()) with check (app_is_admin());

-- revoke leftover anon table grants
do $$ declare t text; begin
  foreach t in array array['deals','listings','tasks','offers','calls','gifts','open_houses','contacts','calendar_events','agent_goals'] loop
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;

select 'MIGRATION C applied — verify with the security test matrix' as status;
