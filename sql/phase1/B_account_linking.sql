-- ══════════════════════════════════════════════════════════════════
-- PHASE 1 · MIGRATION B — ACCOUNT LINKING PREFLIGHT  (safe, read+guided)
-- 6 agents + secretary have no auth_user_id. Restrictive RLS (C) will
-- lock them out until linked. This finds & safely links them. No guessing.
-- ══════════════════════════════════════════════════════════════════

-- B1. Who needs linking (read-only)
select a.id, a.name, a.email, a.role, a.active, a.auth_user_id
from agents a
where coalesce(a.active,true) and a.auth_user_id is null
order by a.role, a.name;

-- B2. Duplicate-email safety checks (read-only)
select lower(email) as email, count(*) from agents where email is not null
group by lower(email) having count(*) > 1;
select lower(email) as email, count(*) from auth.users where email is not null
group by lower(email) having count(*) > 1;

-- B3. Candidate matches by EXACT email (review before applying — do NOT auto-run the update blindly)
select a.id as agent_id, a.name, a.email as agent_email, u.id as auth_user_id, u.email as auth_email
from agents a
join auth.users u on lower(u.email) = lower(a.email)
where a.auth_user_id is null and coalesce(a.active,true)
order by a.name;

-- B4. LINK (run only after reviewing B3; links strictly on exact email match)
-- Review the B3 output first. When satisfied, uncomment and run:
-- update agents a set auth_user_id = u.id
-- from auth.users u
-- where lower(u.email) = lower(a.email)
--   and a.auth_user_id is null and coalesce(a.active,true);

-- B5. VERIFY every active user is linked (must return 0 rows before running C)
select a.name, a.role from agents a
where coalesce(a.active,true) and a.auth_user_id is null;

-- B6. Verify no auth user maps to 2 agents (must return 0 rows)
select auth_user_id, count(*) from agents where auth_user_id is not null
group by auth_user_id having count(*) > 1;
