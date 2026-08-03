-- ══════════════════════════════════════════════════════════════════
-- OFFERS WORKFLOW V2 · MIGRATION B — BETA FLAG SEED
-- NOT applied/verified on live DB. Requires sql/feature_flags.sql to
-- already be run (creates the feature_flags table this depends on).
-- Idempotent. Additive only.
--
-- Deliberately a SEPARATE file from sql/feature_flags.sql rather than
-- an edit to it: that file is shared, general-purpose flag seeding
-- unrelated to this project; editing it risks colliding with other
-- concurrent flag work. This just adds one row via the same table.
--
-- IMPORTANT — this flag is evaluated with different semantics than
-- every other flag in this table. See src/lib/offersV2Flag.js: this
-- one fails CLOSED (no row / disabled = OFF for everyone, including
-- admins) and has no automatic admin bypass, unlike the general
-- fail-open flagAllows() used elsewhere. That is intentional and is
-- enforced in application code, not by this seed row — this row is
-- just data.
-- ══════════════════════════════════════════════════════════════════

insert into feature_flags (key, label, description, enabled, allowed_agent_ids)
values (
  'offers_v2_beta',
  'Offers V2 (Beta)',
  'The rebuilt Offers board: representing-side selection, decimal-safe calculations, immutable one-page PDF with fixed checkboxes, revisions, send-from-your-mailbox, contact/property offer history, accepted-offer conversion hardening, and admin reporting. OFF by default and does not auto-include admins -- add specific agent IDs below to let them test, or flip Enabled once ready for a full rollout. Regular agents without access continue seeing the existing Offers board exactly as before.',
  false,               -- OFF by default, not the general system's fail-open default
  array[]::uuid[]       -- empty allowlist to start; the owner adds their own agent id
                        -- (or specific testers') here via Admin -> Features before
                        -- flipping `enabled` to test without a full rollout
)
on conflict (key) do nothing;

-- To let the owner test alone once their agent id is known, run (replace the UUID):
--   update feature_flags set enabled = true,
--     allowed_agent_ids = array['<owner-agent-id>']::uuid[]
--   where key = 'offers_v2_beta';
--
-- To roll out to the whole office once testing is complete:
--   update feature_flags set enabled = true, allowed_agent_ids = array[]::uuid[]
--   where key = 'offers_v2_beta';
--
-- To roll back to the old Offers board for everyone instantly, with no
-- code deploy required:
--   update feature_flags set enabled = false where key = 'offers_v2_beta';

-- Second, independent flag: gates REAL sending specifically (on top of
-- the EXTERNAL_EFFECTS_ENABLED env var), per the requirement that the
-- rest of Offers V2 stay testable while sends stay off. Same fail-
-- closed, no-admin-bypass semantics as offers_v2_beta.
insert into feature_flags (key, label, description, enabled, allowed_agent_ids)
values (
  'offers_v2_send_test',
  'Offers V2 — Real Send Testing',
  'Allows specific agents to actually send offer emails for real (via their own connected mailbox) instead of the safe preview/validate-only path. Requires EXTERNAL_EFFECTS_ENABLED=true as well -- this flag alone is not sufficient. OFF by default.',
  false,
  array[]::uuid[]
)
on conflict (key) do nothing;

-- To let the owner test real sending alone (replace the UUID):
--   update feature_flags set enabled = true,
--     allowed_agent_ids = array['<owner-agent-id>']::uuid[]
--   where key = 'offers_v2_send_test';
