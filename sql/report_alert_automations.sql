-- ═══════════════════════════════════════════════════════════════
-- Report alert automations (July 2026) — new rows for the existing
-- automation engine. These surface on the Automations board and can
-- be toggled/edited there. Idempotent (fixed UUIDs).
-- NOTE: outstanding-commission + falls-behind-goal are evaluated by
-- the daily cron; closing-within-7-days already exists (...006).
-- ═══════════════════════════════════════════════════════════════

-- Outstanding commission reminder (weekly digest to Yanky)
insert into automations (id, name, description, active, trigger_type, trigger_config, action_nodes) values (
  'a0000000-0000-4000-8000-000000000201', '💰 Outstanding commission → Yanky (weekly)',
  'Weekly email listing closed deals whose commission is not yet collected.',
  true, 'commission_outstanding', '{"day":"Mon","hour":8}'::jsonb,
  '[{"id":"a1","type":"send_email","config":{"to_email":"yanky@targetreteam.com","subject":"💰 Outstanding commissions","body":"These closed deals still have commission outstanding:\n\n{{outstanding_list}}\n\nTotal outstanding: {{outstanding_total}}"}}]'::jsonb
) on conflict (id) do nothing;

-- Agent falling behind goal (weekly)
insert into automations (id, name, description, active, trigger_type, trigger_config, action_nodes) values (
  'a0000000-0000-4000-8000-000000000202', '🎯 Agent behind goal → Yanky (weekly)',
  'Weekly email flagging agents whose projected year-end is below their goal.',
  true, 'agent_behind_goal', '{"day":"Mon","hour":8}'::jsonb,
  '[{"id":"a1","type":"send_email","config":{"to_email":"yanky@targetreteam.com","subject":"🎯 Agents behind pace","body":"These agents are projected to miss their yearly goal:\n\n{{behind_list}}"}}]'::jsonb
) on conflict (id) do nothing;

-- Lead not contacted (daily)
insert into automations (id, name, description, active, trigger_type, trigger_config, action_nodes) values (
  'a0000000-0000-4000-8000-000000000203', '📞 Uncontacted new leads → Yanky (daily)',
  'Daily email listing new leads that have not been contacted yet.',
  true, 'leads_uncontacted', '{"hour":8}'::jsonb,
  '[{"id":"a1","type":"send_email","config":{"to_email":"yanky@targetreteam.com","subject":"📞 New leads awaiting contact","body":"These new leads have not been contacted:\n\n{{uncontacted_list}}"}}]'::jsonb
) on conflict (id) do nothing;
