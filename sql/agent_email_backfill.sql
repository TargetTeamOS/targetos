-- ═══════════════════════════════════════════════════════════════
-- Agent Email Backfill (July 19, 2026)
-- Moves the hardcoded AGENT_EMAIL_MAP (automationEngine.js) into the
-- agents table, where it's admin-editable like everything else.
-- The engine already prefers agents.email; the hardcoded map is only
-- a fallback for rows with a missing email. After this runs and the
-- verify query shows every active agent has an email, the map can be
-- deleted from automationEngine.js (next session).
-- Idempotent — only fills blanks, never overwrites an existing email.
-- ═══════════════════════════════════════════════════════════════

update agents set email = v.email
from (values
  ('Lazer Farkas',       'lazer@targetreteam.com'),
  ('Mendy Jankovits',    'mendy@targetreteam.com'),
  ('Isaac Leibowitz',    'isaac@targetreteam.com'),
  ('Yanky Lichtenstein', 'yanky@targetreteam.com'),
  ('Gitty Fogel',        'office@targetreteam.com'),
  ('Joel Rottenstein',   'joel@targetreteam.com'),
  ('Eli Hoffman',        'eli@targetreteam.com'),
  ('Avraham Weinberger', 'avraham@targetreteam.com')
) as v(name, email)
where agents.name = v.name
  and (agents.email is null or agents.email = '');

-- ── VERIFY: must return zero rows ─────────────────────────────────
select id, name from agents where active = true and (email is null or email = '');
