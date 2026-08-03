-- ============================================================================
-- A6_my_day.sql — secure "My Day" read aggregation + quick-action write RPCs
-- ----------------------------------------------------------------------------
-- Everything here resolves the acting agent from auth.uid() via
-- app_current_agent_id(); a browser-supplied agent id is never trusted. The
-- strict privacy rule: a regular agent sees ONLY rows they own (agent_id = their
-- own id). "My Day" is personal, so even an admin sees their OWN day here; the
-- admin override exists only on the write actions (documented below) so an admin
-- can act on a task on someone's behalf. When ownership can't be proven the row
-- is simply not returned.
--
-- Read:  app_my_day()                     -> grouped jsonb buckets (own rows only)
-- Write: app_task_complete(uuid)
--        app_task_reschedule(uuid, date)
--        app_event_reschedule(uuid, timestamptz, timestamptz)
--        app_task_add_note(uuid, text)
--        app_create_followup(uuid, date, text)
--
-- All are security-definer, search_path='', granted to authenticated only.
-- Purely additive (no schema/data changes). Idempotency-guarded.
-- Depends on: A_safe_foundation (app_current_agent_id, app_is_admin), and the
-- existing tasks / calendar_events / interactions / contacts tables.
-- Rollback: A6_rollback.sql.
--
-- REVIEW PENDING — do NOT apply until reviewed. Until applied, My Day renders a
-- complete "Secure My Day setup required" scaffold and its quick actions are
-- shown but disabled.
-- ============================================================================
begin;

do $$
begin
  if exists(select 1 from public._app_migrations where name='A6_my_day' and status='complete') then
    raise exception 'A6_my_day already applied.'; end if;
end $$;

insert into public._app_migrations(name,status,applied_at,rolled_back_at)
values ('A6_my_day','in_progress',now(),null)
on conflict (name) do update set status='in_progress', applied_at=now(), rolled_back_at=null;

-- helper: does the acting agent own this task? (admin override allowed on writes)
create or replace function public._owns_task(p_task_id uuid, p_allow_admin boolean default true)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.tasks t
    where t.id = p_task_id
      and ( t.agent_id = public.app_current_agent_id()
            or (p_allow_admin and public.app_is_admin()) )
  );
$$;

-- ── READ: app_my_day() ──────────────────────────────────────────────────────
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
        from ce where start_time::date = d0) s),'[]'::jsonb),
    'appointments_upcoming', coalesce((select jsonb_agg(x order by x_start) from (
        select jsonb_build_object('id',id,'type','appointment','label',coalesce(nullif(title,''),'Appointment'),
          'secondary', to_char(start_time,'Mon DD · HH12:MI AM')||coalesce(' · '||nullif(location,''),''),'status',null) x, start_time x_start
        from ce where start_time::date > d0 and start_time::date <= d0 + 14) s),'[]'::jsonb),
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

-- ── WRITE: quick actions (owner-scoped; admin override documented) ───────────
create or replace function public.app_task_complete(p_task_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public._owns_task(p_task_id) then return jsonb_build_object('error','forbidden'); end if;
  update public.tasks set status='done', completed_at=now(), updated_at=now() where id=p_task_id;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.app_task_reschedule(p_task_id uuid, p_due date)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_due is null then return jsonb_build_object('error','bad_date'); end if;
  if not public._owns_task(p_task_id) then return jsonb_build_object('error','forbidden'); end if;
  update public.tasks set due_date=p_due, updated_at=now() where id=p_task_id;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.app_event_reschedule(p_event_id uuid, p_start timestamptz, p_end timestamptz)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare owns boolean;
begin
  if p_start is null then return jsonb_build_object('error','bad_date'); end if;
  select exists(select 1 from public.calendar_events e
    where e.id=p_event_id and (e.agent_id=public.app_current_agent_id() or public.app_is_admin())) into owns;
  if not owns then return jsonb_build_object('error','forbidden'); end if;
  update public.calendar_events set start_time=p_start, end_time=coalesce(p_end,end_time) where id=p_event_id;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.app_task_add_note(p_task_id uuid, p_note text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  if coalesce(trim(p_note),'')='' then return jsonb_build_object('error','empty_note'); end if;
  if not public._owns_task(p_task_id) then return jsonb_build_object('error','forbidden'); end if;
  update public.tasks
     set notes = coalesce(notes,'') || case when coalesce(notes,'')='' then '' else E'\n' end
                 || to_char(now(),'YYYY-MM-DD HH24:MI')||' — '||p_note,
         updated_at = now()
   where id = p_task_id;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.app_create_followup(p_contact_id uuid, p_when date, p_note text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := public.app_current_agent_id(); new_id uuid;
begin
  if me is null then return jsonb_build_object('error','no_agent_link'); end if;
  if p_contact_id is null or p_when is null then return jsonb_build_object('error','bad_input'); end if;
  insert into public.interactions(contact_id, agent_id, type, direction, follow_up, follow_up_date, notes, occurred_at)
  values (p_contact_id, me, 'follow-up', 'outbound', true, p_when, nullif(trim(coalesce(p_note,'')),''), now())
  returning id into new_id;
  return jsonb_build_object('ok',true,'id',new_id);
end $$;

-- grants
revoke all on function public._owns_task(uuid,boolean)             from public, anon;
revoke all on function public.app_my_day()                          from public, anon;
revoke all on function public.app_task_complete(uuid)               from public, anon;
revoke all on function public.app_task_reschedule(uuid,date)        from public, anon;
revoke all on function public.app_event_reschedule(uuid,timestamptz,timestamptz) from public, anon;
revoke all on function public.app_task_add_note(uuid,text)          from public, anon;
revoke all on function public.app_create_followup(uuid,date,text)   from public, anon;
grant execute on function public.app_my_day()                        to authenticated;
grant execute on function public.app_task_complete(uuid)             to authenticated;
grant execute on function public.app_task_reschedule(uuid,date)      to authenticated;
grant execute on function public.app_event_reschedule(uuid,timestamptz,timestamptz) to authenticated;
grant execute on function public.app_task_add_note(uuid,text)        to authenticated;
grant execute on function public.app_create_followup(uuid,date,text) to authenticated;

update public._app_migrations set status='complete', applied_at=now() where name='A6_my_day';

commit;
