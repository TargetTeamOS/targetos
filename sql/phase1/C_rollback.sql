-- PHASE 1 · MIGRATION C — ROLLBACK
-- Restores permissive access so no one is locked out while you debug.
-- (Recreates the open policies that existed before C.)
do $$ declare t text; begin
  foreach t in array array['deals','listings','tasks','offers','calls','gifts','open_houses','contacts','calendar_events','agent_goals'] loop
    execute format('drop policy if exists %1$s_sel on %1$I', t);
    execute format('drop policy if exists %1$s_ins on %1$I', t);
    execute format('drop policy if exists %1$s_upd on %1$I', t);
    execute format('drop policy if exists %1$s_del on %1$I', t);
    execute format('drop policy if exists %1$s_wr on %1$I', t);
    execute format('create policy %1$s_all on %1$I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
select 'MIGRATION C rolled back — permissive access restored' as status;
