-- ============================================================================
-- 2026-10_my_day_start_time_cast.sql — fix "My Day" dashboard card crash
-- ----------------------------------------------------------------------------
-- BUG: app_my_day() treats calendar_events.start_time as if it carried the
-- event's date (start_time::date), but start_time is genuinely a bare
-- `time without time zone` column -- the date lives in a separate
-- start_date column (confirmed live: a calendar_events row has both
-- start_date:"2026-08-11" and start_time:"01:30:00"). Postgres correctly
-- refuses to cast time -> date, so every call to app_my_day() throws
-- "cannot cast type time without time zone to date" (error 42846), which
-- is exactly the error the live site returns right now and why the
-- dashboard's "My day" card shows "This card couldn't load right now."
--
-- Same wrong assumption also sits in app_event_reschedule(), which wrote
-- a full timestamptz straight into the bare `time` column start_time --
-- at best truncated to just the time-of-day (silently dropping any date
-- change from a reschedule), at worst a second cast error on save.
--
-- FIX: filter/sort on start_date (the real date column); build the
-- "upcoming" label from start_date + start_time together; split a
-- rescheduled timestamp back into start_date/start_time (and
-- end_date/end_time) on write.
--
-- Safe to run standalone and repeatedly: both are CREATE OR REPLACE on
-- functions already live in production (originally defined in
-- sql/phase1/A6_my_day.sql), so this only replaces their bodies -- no
-- schema change, no data touched until an agent next uses "My Day".
-- ============================================================================

create or replace function public.app_my_day()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := public.app_current_agent_id();
  d0 date := current_date;
  out jsonb;
begin
  if me is null then return jsonb_build_object('error','no_agent_link'); end if;

  with
  t as (select * from public.tasks where agent_id = me),
  ce as (select * from public.calendar_events where agent_id = me),
  ix as (select i.*, trim(coalesce(c.first_name,'')||' '||coalesce(c.last_name,'')) as cname
           from public.interactions i left join public.contacts c on c.id = i.contact_id
           where i.agent_id = me and i.follow_up is true and i.follow_up_date is not null)
  select jsonb_build_object(
    'agent_id', me,
    'tasks_due_today', coalesce((select jsonb_agg(x order by x_due) from (
        select jsonb_build_object('id',id,'type','task','label',coalesce(nullif(title,''),'Task'),
          'secondary', 'Due today','status',coalesce(priority,status)) x, due_date x_due
        from t where status <> 'done' and due_date::date = d0) s),'[]'::jsonb),
    'tasks_overdue', coalesce((select jsonb_agg(x order by x_due) from (
        select jsonb_build_object('id',id,'type','task','label',coalesce(nullif(title,''),'Task'),
          'secondary', 'Overdue · was due '||to_char(due_date,'Mon DD'),'status',coalesce(priority,status)) x, due_date x_due
        from t where status <> 'done' and due_date::date < d0) s),'[]'::jsonb),
    'tasks_completed_today', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('id',id,'type','task','label',coalesce(nullif(title,''),'Task'),
          'secondary','Completed today','status','done') x
        from t where status = 'done' and completed_at::date = d0) s),'[]'::jsonb),
    'appointments_today', coalesce((select jsonb_agg(x order by x_start) from (
        select jsonb_build_object('id',id,'type','appointment','label',coalesce(nullif(title,''),'Appointment'),
          'secondary', to_char(start_time,'HH12:MI AM')||coalesce(' · '||nullif(location,''),''),'status',null) x, start_time x_start
        from ce where start_date = d0) s),'[]'::jsonb),
    'appointments_upcoming', coalesce((select jsonb_agg(x order by x_start) from (
        select jsonb_build_object('id',id,'type','appointment','label',coalesce(nullif(title,''),'Appointment'),
          'secondary', to_char(start_date,'Mon DD')||' · '||to_char(start_time,'HH12:MI AM')||coalesce(' · '||nullif(location,''),''),'status',null) x, (start_date + start_time) x_start
        from ce where start_date > d0 and start_date <= d0 + 14) s),'[]'::jsonb),
    'followups_due_today', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('id',contact_id,'type','contact','label',coalesce(nullif(cname,''),'Contact'),
          'secondary','Follow-up due today','status',type,'related',jsonb_build_object('type','interaction','id',id)) x
        from ix where follow_up_date::date = d0 and contact_id is not null) s),'[]'::jsonb),
    'followups_overdue', coalesce((select jsonb_agg(x order by x_fu) from (
        select jsonb_build_object('id',contact_id,'type','contact','label',coalesce(nullif(cname,''),'Contact'),
          'secondary','Follow-up overdue · '||to_char(follow_up_date,'Mon DD'),'status',type,'related',jsonb_build_object('type','interaction','id',id)) x, follow_up_date x_fu
        from ix where follow_up_date::date < d0 and contact_id is not null) s),'[]'::jsonb),
    'reminders', coalesce((select jsonb_agg(x order by x_due) from (
        select jsonb_build_object('id',id,'type','task','label',coalesce(nullif(title,''),'Task'),
          'secondary', upper(priority)||' · due '||to_char(due_date,'Mon DD'),'status',priority) x, due_date x_due
        from t where status <> 'done' and coalesce(priority,'') in ('urgent','high')
          and due_date::date between d0 and d0 + 7) s),'[]'::jsonb),
    'capabilities', jsonb_build_object('complete',true,'reschedule',true,'add_note',true,'create_followup',true)
  ) into out;

  return out;
end $$;

create or replace function public.app_event_reschedule(p_event_id uuid, p_start timestamptz, p_end timestamptz)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare owns boolean;
begin
  if p_start is null then return jsonb_build_object('error','bad_date'); end if;
  select exists(select 1 from public.calendar_events e
    where e.id=p_event_id and (e.agent_id=public.app_current_agent_id() or public.app_is_admin())) into owns;
  if not owns then return jsonb_build_object('error','forbidden'); end if;
  update public.calendar_events
    set start_date = p_start::date,
        start_time = p_start::time,
        end_date   = case when p_end is not null then p_end::date else end_date end,
        end_time   = case when p_end is not null then p_end::time else end_time end
  where id=p_event_id;
  return jsonb_build_object('ok',true);
end $$;
