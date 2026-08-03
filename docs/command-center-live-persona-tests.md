# Command Center — live persona tests (run in Supabase SQL Editor)

These prove the security matrix against the **real** database after
`COMMAND_CENTER_APPLY_ALL.sql` is applied. They are **read-mostly and
non-destructive**: every block runs inside `begin … rollback`, so nothing is
persisted — even the positive-path write tests are rolled back.

You run these (they require your Supabase sign-in). Record the actual result of
each in the table at the bottom. Do **not** claim a pass from mocked tests.

> The SQL Editor connects as a superuser that bypasses RLS. To test *as a user*
> we set the request JWT claims so `auth.uid()` / `auth.role()` resolve to that
> persona, and `set local role authenticated` so RLS applies. `rollback` at the
> end of each block guarantees no change is saved.

---

## 0. Pick your personas (no new users created)

Run this once and copy four `auth_user_id` values. Use existing accounts; if you
need isolated data, create **clearly-marked synthetic** rows in step 6 (and roll
them back).

```sql
select a.id as agent_id, a.auth_user_id, a.name, a.role, a.active
from public.agents a
order by a.role, a.name;
```

Fill in below and reuse in every block:

- `:ADMIN`      = an admin's `auth_user_id`
- `:SECRETARY`  = a secretary/TC's `auth_user_id`
- `:AGENT_A`    = an active agent's `auth_user_id`
- `:AGENT_B`    = a *different* active agent's `auth_user_id`

Impersonation preamble (used in every block):

```sql
select set_config('request.jwt.claims', json_build_object('sub','PASTE_AUTH_UID','role','authenticated')::text, true);
set local role authenticated;
```

---

## 1. Unauthenticated users cannot read protected dashboard data

```sql
begin;
  select set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  set local role anon;
  -- EXPECT: permission denied / no execute (anon was never granted these)
  select public.app_my_day();
rollback;
```
**PASS =** error `permission denied for function app_my_day` (anon has no EXECUTE).

## 2. Agent A cannot read Agent B's private tasks / appointments

```sql
begin;
  select set_config('request.jwt.claims', json_build_object('sub','AGENT_A','role','authenticated')::text, true);
  set local role authenticated;
  -- app_my_day is auth.uid()-scoped: returns ONLY Agent A's own buckets
  select public.app_my_day();
  -- direct table reads are governed by RLS; A must not see B's private rows
  select count(*) as b_tasks_visible_to_a
    from public.tasks where agent_id = (select id from public.agents where auth_user_id='AGENT_B');
  select count(*) as b_events_visible_to_a
    from public.calendar_events where agent_id = (select id from public.agents where auth_user_id='AGENT_B');
rollback;
```
**PASS =** `app_my_day` shows only A's records; `b_tasks_visible_to_a` and
`b_events_visible_to_a` are **0** (calendar RLS already restricts agents to their
own events; confirm tasks RLS does likewise for private tasks).

## 3. Agent A cannot update Agent B's records

```sql
begin;
  select set_config('request.jwt.claims', json_build_object('sub','AGENT_A','role','authenticated')::text, true);
  set local role authenticated;
  -- pick any task owned by B:
  select public.app_task_complete((select id from public.tasks
     where agent_id=(select id from public.agents where auth_user_id='AGENT_B') limit 1));
  select public.app_task_add_note((select id from public.tasks
     where agent_id=(select id from public.agents where auth_user_id='AGENT_B') limit 1), 'ZZZ_TEST should be rejected');
rollback;
```
**PASS =** both return `{"error":"forbidden"}` (ownership enforced in `_owns_task`).

## 4. Agent A cannot obtain Agent B's restricted (financial) drill records

```sql
begin;
  select set_config('request.jwt.claims', json_build_object('sub','AGENT_A','role','authenticated')::text, true);
  set local role authenticated;
  -- team production is visible (Access Model A), but per-deal $ must be null for non-admins:
  select r->>'label' as label, r->>'amount' as amount
  from jsonb_array_elements(
     public.app_agent_records((select id from public.agents where auth_user_id='AGENT_B'),
       'production_volume', date_trunc('year',now())::date, now()::date)) r
  limit 20;
rollback;
```
**PASS =** rows may list (team-visible), but every `amount` is **null** for the
non-admin caller. Run the same as `:ADMIN` and confirm `amount` is populated.

## 5. Financial fields hidden from unauthorized users (leaderboard)

```sql
-- as AGENT_A:
begin;
  select set_config('request.jwt.claims', json_build_object('sub','AGENT_A','role','authenticated')::text, true);
  set local role authenticated;
  select r->>'name' as name, r->>'gci' as gci
  from jsonb_array_elements(public.app_agent_performance(date_trunc('month',now())::date, now()::date)) r;
rollback;
-- as ADMIN: repeat with 'sub','ADMIN' → gci should be non-null
```
**PASS =** `gci` is **null** for Agent A; **non-null** for Admin.

## 6. Non-admins cannot change settings or widgets

```sql
begin;
  select set_config('request.jwt.claims', json_build_object('sub','AGENT_A','role','authenticated')::text, true);
  set local role authenticated;
  select public.app_dashboard_settings_set('front_runner', '{"message":"ZZZ_TEST"}'::jsonb);
  select public.app_save_production_widgets('[]'::jsonb);
rollback;
```
**PASS =** settings call returns `{"error":"forbidden"}`; widget save raises/returns
forbidden (admin-only). Repeat as `:SECRETARY` → also forbidden.

## 7. Spoofed caller identity is ignored

`app_my_day`, `app_task_*`, `app_create_followup` take **no agent-id parameter** —
identity is always `auth.uid()`. Demonstrate that changing only the JWT `sub`
changes the data, and that there is no parameter to spoof:

```sql
begin;
  select set_config('request.jwt.claims', json_build_object('sub','AGENT_A','role','authenticated')::text, true);
  set local role authenticated;
  select (public.app_my_day())->>'agent_id' as resolved_agent;  -- = Agent A's agent id
rollback;
```
**PASS =** `resolved_agent` equals Agent A's agent id (never a value the caller
supplied), and repeating with `AGENT_B` yields Agent B's id.

## 8. Admin + Secretary documented access

```sql
-- ADMIN: My Day works, settings write works (rolled back)
begin;
  select set_config('request.jwt.claims', json_build_object('sub','ADMIN','role','authenticated')::text, true);
  set local role authenticated;
  select public.app_dashboard_settings_set('default_range','"ytd"'::jsonb);   -- EXPECT {"ok":true}
  select public.app_agent_performance(date_trunc('month',now())::date, now()::date) is not null; -- EXPECT true
rollback;

-- SECRETARY: performance is forbidden by design (documented)
begin;
  select set_config('request.jwt.claims', json_build_object('sub','SECRETARY','role','authenticated')::text, true);
  set local role authenticated;
  select public.app_agent_performance(date_trunc('month',now())::date, now()::date); -- EXPECT {"error":"forbidden"}
rollback;
```
**PASS =** admin write returns `{"ok":true}`; secretary performance returns
`{"error":"forbidden"}` (adjust to your documented secretary policy if different).

## 9. (Optional) synthetic private row, verify isolation, auto-rollback

```sql
begin;
  -- create a clearly-marked synthetic private task for Agent B
  insert into public.tasks (agent_id, title, status, due_date, priority)
  values ((select id from public.agents where auth_user_id='AGENT_B'),
          'ZZZ_TEST private task', 'open', current_date, 'high');
  -- now impersonate Agent A and confirm it is NOT visible via My Day
  select set_config('request.jwt.claims', json_build_object('sub','AGENT_A','role','authenticated')::text, true);
  set local role authenticated;
  select public.app_my_day();   -- EXPECT: does not contain 'ZZZ_TEST private task'
rollback;   -- synthetic row is discarded
```

---

## Record the results

| # | Check | Admin | Secretary | Agent A | Agent B |
|---|-------|-------|-----------|---------|---------|
| 1 | Unauth blocked | n/a | n/a | n/a | n/a |
| 2 | A can't read B private tasks/appts | | | | |
| 3 | A can't update B records | | | | |
| 4 | A can't get B financial drill | | | | |
| 5 | GCI hidden from non-admin | | | | |
| 6 | Non-admin can't change settings/widgets | | | | |
| 7 | Spoofed id ignored | | | | |
| 8 | Admin/Secretary documented access | | | | |
| 9 | Synthetic private row isolated | | | | |

Any `REVIEW REQUIRED`/unexpected result: paste it back and I'll correct the
migration before you re-apply.
