-- ============================================================================
-- 2026-10_audit_fixes.sql — fixes for the October 2026 CRM audit
-- ----------------------------------------------------------------------------
-- Run ONCE in the Supabase SQL editor (paste the whole file, click Run).
-- Everything is inside one transaction: if any step fails, nothing changes.
-- Safe to re-run.
--
-- 1. Accepted offers: the reporting view only recognised the stage spelled
--    'Offer Accepted', but the app (and the monday.com import) store it as
--    'Offer Accapted'. So every accepted-offer count built on the view was 0,
--    including the Dashboard "Front Runner of the Month" card. The view now
--    accepts both spellings.
-- 2. "My day" dashboard card: app_my_day() treated calendar_events.start_time
--    as a timestamp, but it is a time-of-day column (the date is in
--    start_date). Postgres rejected the cast on every call, so the card always
--    showed "This card couldn't load right now". Now uses start_date.
-- 3. app_event_reschedule() had the same mix-up when moving an event; it now
--    writes both start_date and start_time.
-- 4. Website Builder: creates the website_content table if it's missing
--    (the page used to print this SQL on screen).
-- ============================================================================
begin;

-- ── 1. Canonical deals view: accept both spellings of "offer accepted" ──────
-- Dropped and recreated (not "create or replace") because the view uses
-- d.*, and any column added to deals since it was created would make
-- "create or replace" fail. If something else depends on the view, the drop
-- fails and the whole transaction rolls back untouched.
drop view if exists public.v_deals_canonical;

create view public.v_deals_canonical with (security_invoker = true) as
  select d.*,
    (d.is_duplicate=false and d.is_test=false and d.archived_at is null and d.deleted_at is null) as is_countable,
    (lower(trim(d.stage))='closed' and lower(trim(coalesce(d.deal_status,'')))='closed'
      and d.is_duplicate=false and d.is_test=false and d.archived_at is null and d.deleted_at is null) as is_closed_official,
    (lower(trim(d.stage)) in ('offer accepted','offer accapted')
      and d.is_duplicate=false and d.is_test=false and d.archived_at is null and d.deleted_at is null) as is_accepted_offer,
    (lower(trim(d.stage))='under contract'
      and d.is_duplicate=false and d.is_test=false and d.archived_at is null and d.deleted_at is null) as is_under_contract,
    (lower(trim(d.stage)) in ('negotiations','offer accepted','offer accapted','under shtar','under contract')
      and d.is_duplicate=false and d.is_test=false and d.archived_at is null and d.deleted_at is null) as is_active_pipeline,
    lower(trim(coalesce(d.side,''))) as side_norm,
    coalesce(d.expected_gci, d.gci) as pipeline_gci_val
  from public.deals d;
revoke all on public.v_deals_canonical from public, anon, authenticated;

-- ── 2. My Day: read appointments by start_date (start_time is time-of-day) ──
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
          'secondary', coalesce(to_char(start_date + start_time,'HH12:MI AM'),'All day')||coalesce(' · '||nullif(location,''),''),'status',null) x,
          (start_date + coalesce(start_time, time '00:00')) x_start
        from ce where start_date = d0) s),'[]'::jsonb),
    'appointments_upcoming', coalesce((select jsonb_agg(x order by x_start) from (
        select jsonb_build_object('id',id,'type','appointment','label',coalesce(nullif(title,''),'Appointment'),
          'secondary', to_char(start_date,'Mon DD')||coalesce(' · '||to_char(start_date + start_time,'HH12:MI AM'),'')||coalesce(' · '||nullif(location,''),''),'status',null) x,
          (start_date + coalesce(start_time, time '00:00')) x_start
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

-- ── 3. Event reschedule: write the date AND the time-of-day ─────────────────
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
         end_date   = case when p_end is null then end_date else p_end::date end,
         end_time   = case when p_end is null then end_time else p_end::time end
   where id = p_event_id;
  return jsonb_build_object('ok',true);
end $$;

revoke all on function public.app_my_day() from public, anon;
grant execute on function public.app_my_day() to authenticated;
revoke all on function public.app_event_reschedule(uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.app_event_reschedule(uuid,timestamptz,timestamptz) to authenticated;

-- ── 4. Website Builder storage table (no-op if it already exists) ────────────
create table if not exists public.website_content (
  id uuid default gen_random_uuid() primary key,
  section text unique not null,
  content jsonb,
  updated_at timestamptz default now()
);
alter table public.website_content enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='website_content') then
    create policy "Allow all" on public.website_content for all using (true);
  end if;
end $$;

commit;

-- ── Quick checks (optional — run after the above) ───────────────────────────
-- Should now show your accepted-offer deals instead of 0:
--   select count(*) from public.v_deals_canonical where is_accepted_offer;
-- Should return a JSON object instead of an error (when run as an app user):
--   select public.app_my_day();
