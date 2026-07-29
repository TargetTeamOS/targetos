-- ═══════════════════════════════════════════════════════════════
-- Connected Email — Phase 2 ROLLBACK (idempotent)
-- Drops ONLY the Phase 2 tables (and their policies/grants drop with
-- them). integration_accounts and all legacy token data are left intact,
-- so the app can revert to the pre-Phase-2 connectors path with no data
-- loss. Run in reverse-dependency order.
-- ═══════════════════════════════════════════════════════════════

drop table if exists email_delivery_events      cascade;
drop table if exists email_messages             cascade;
drop table if exists email_threads              cascade;
drop table if exists email_sync_state           cascade;
drop table if exists email_connections          cascade;
drop table if exists system_email_configuration cascade;

-- Note: helper functions current_agent_id()/current_agent_is_admin() are
-- shared with contacts RLS and are intentionally NOT dropped here.

select 'phase2 rollback complete' as status;
