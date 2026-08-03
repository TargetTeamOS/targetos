-- ============================================================================
-- A8_dashboard_settings.sql — Command Center presentation settings store
-- ----------------------------------------------------------------------------
-- A tiny key→jsonb store for team-wide, NON-sensitive presentation settings the
-- admin controls from the Command Center settings drawer: Front Runner styling,
-- which performance metrics are visible, widget order/visibility, default range.
-- These are presentation only — they never change a calculated figure.
--
-- Read: app_dashboard_settings_get()            -> {key: value, ...} (authenticated)
-- Write: app_dashboard_settings_set(key, value) -> admin-only, allowlisted keys,
--        audited into dashboard_settings_audit.
--
-- Purely additive, idempotency-guarded, forward-only. No existing data touched.
-- Depends on A_safe_foundation (app_is_admin, app_current_agent_id).
-- Rollback: A8_rollback.sql.
--
-- REVIEW PENDING — do NOT apply until reviewed. Until applied, the settings
-- drawer falls back to session-local values and clearly says the store isn't
-- deployed; goals + news controls still work (they use the applied A3/A4 RPCs).
-- ============================================================================
begin;

do $$
begin
  if exists(select 1 from public._app_migrations where name='A8_dashboard_settings' and status='complete') then
    raise exception 'A8_dashboard_settings already applied.'; end if;
end $$;

insert into public._app_migrations(name,status,applied_at,rolled_back_at)
values ('A8_dashboard_settings','in_progress',now(),null)
on conflict (name) do update set status='in_progress', applied_at=now(), rolled_back_at=null;

create table if not exists public.dashboard_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint dashboard_settings_key_wl check (key in
    ('front_runner','performance_metrics','widget_order','widget_visibility','default_range'))
);

create table if not exists public.dashboard_settings_audit (
  id bigint generated always as identity primary key,
  key text not null, value jsonb, action text not null,
  changed_by uuid, changed_at timestamptz not null default now()
);

alter table public.dashboard_settings enable row level security;
drop policy if exists dashboard_settings_read on public.dashboard_settings;
create policy dashboard_settings_read on public.dashboard_settings for select to authenticated using (true);
revoke all on public.dashboard_settings from public, anon, authenticated;
grant select on public.dashboard_settings to authenticated;
revoke all on public.dashboard_settings_audit from public, anon, authenticated;

create or replace function public.app_dashboard_settings_get()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.dashboard_settings;
$$;

create or replace function public.app_dashboard_settings_set(p_key text, p_value jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.app_is_admin() then return jsonb_build_object('error','forbidden'); end if;
  if p_key not in ('front_runner','performance_metrics','widget_order','widget_visibility','default_range') then
    return jsonb_build_object('error','bad_key'); end if;
  if p_value is null or jsonb_typeof(p_value) not in ('object','array') then
    return jsonb_build_object('error','bad_value'); end if;

  insert into public.dashboard_settings(key, value, updated_at, updated_by)
  values (p_key, p_value, now(), public.app_current_agent_id())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;

  insert into public.dashboard_settings_audit(key, value, action, changed_by)
  values (p_key, p_value, 'set', public.app_current_agent_id());

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.app_dashboard_settings_get()          from public, anon;
revoke all on function public.app_dashboard_settings_set(text,jsonb) from public, anon;
grant execute on function public.app_dashboard_settings_get()        to authenticated;
grant execute on function public.app_dashboard_settings_set(text,jsonb) to authenticated;

update public._app_migrations set status='complete', applied_at=now() where name='A8_dashboard_settings';

commit;
