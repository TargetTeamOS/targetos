-- PHASE 1 · MIGRATION A — ROLLBACK. Reverses A_safe_foundation.sql.
-- Safe: only drops objects A created; does not touch existing policies/data.
drop function if exists app_dashboard_summary(text,uuid,date,date);
drop function if exists app_agent_goal(uuid,int);
drop function if exists app_team_goal(int);
drop function if exists app_data_quality();
drop function if exists app_can_view_agent(uuid);
drop function if exists app_can_edit_resource(uuid,text);
drop function if exists app_can_view_financials();
drop function if exists app_current_agent();
drop function if exists app_current_agent_id();
drop function if exists app_current_role();
drop function if exists app_is_admin();
drop function if exists app_is_secretary();
drop function if exists app_is_agent();
drop view if exists v_deals_canonical;
drop table if exists secretary_permissions;
drop index if exists idx_deals_close_date;
drop index if exists idx_deals_report;
drop index if exists idx_tasks_overdue;
drop index if exists idx_cal_agent_start;
delete from system_settings where key = 'team_goal_2026';
-- exclusion columns are additive/harmless; drop only if you truly want to reverse:
-- alter table deals drop column if exists is_duplicate, drop column if exists is_test,
--   drop column if exists archived_at, drop column if exists deleted_at, drop column if exists duplicate_of;
select 'MIGRATION A rolled back' as status;
