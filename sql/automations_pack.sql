-- ═══════════════════════════════════════════════════════════════
-- Automations Pack (July 2026) — Yanky's 8 rules
-- All rows appear on the Automations board: edit recipients/wording,
-- toggle on/off, or delete there anytime. Idempotent.
-- ═══════════════════════════════════════════════════════════════

-- 1. Voicemail → email with audio attached (handled server-side in
--    the voicemail webhook; this row is its on/off switch + config)
insert into automations (id, name, description, active, trigger_type, action_nodes) values (
  'sys-voicemail-email', '📬 Voicemail → Yanky (audio attached)',
  'Emails every voicemail with the audio file attached, caller phone/name, and transcript. Edit to_email/cc_email in the action config.',
  true, 'voicemail_received',
  '[{"id":"a1","type":"send_email","config":{"to_email":"yanky@targetreteam.com","cc_email":""}}]'::jsonb
) on conflict (id) do nothing;

-- 2. Under contract → secretary gets the open TC task list (cc Yanky)
insert into automations (id, name, description, active, trigger_type, action_nodes) values (
  'sys-uc-secretary-tasks', '📋 Under Contract → Secretary task list',
  'When a deal goes Under Contract, the secretary gets the open TC tasks (each linked) — cc Yanky.',
  true, 'deal_under_contract',
  '[{"id":"a1","type":"send_email","config":{"to_role":"secretary","cc_email":"yanky@targetreteam.com",
     "subject":"📋 UNDER CONTRACT: {{addr}} — tasks to get moving",
     "body":"{{addr}} just went Under Contract.\n\n👤 Client: {{client_name}}\n👤 Agent: {{agent_name}}\n✍️ Changed by: {{changed_by}}\n\nOpen tasks:\n{{tc_open_tasks}}\n\nTC board: https://app.targetreteam.com/tc"}}]'::jsonb
) on conflict (id) do nothing;

-- 3. Sold → secretary gets the task list (cc Yanky)
insert into automations (id, name, description, active, trigger_type, action_nodes) values (
  'sys-sold-secretary-tasks', '🏁 Sold → Secretary task list',
  'When a deal Closes, the secretary gets the remaining TC tasks (each linked) — cc Yanky.',
  true, 'deal_closed',
  '[{"id":"a1","type":"send_email","config":{"to_role":"secretary","cc_email":"yanky@targetreteam.com",
     "subject":"🏁 SOLD: {{addr}} — closing tasks",
     "body":"{{addr}} just CLOSED. 🎉\n\n👤 Client: {{client_name}}\n👤 Agent: {{agent_name}}\n💰 Production: ${{production}} · GCI: ${{gci}}\n\nRemaining tasks:\n{{tc_open_tasks}}\n\nTC board: https://app.targetreteam.com/tc"}}]'::jsonb
) on conflict (id) do nothing;

-- 4. Under contract → gift board entry
insert into automations (id, name, description, active, trigger_type, action_nodes) values (
  'sys-uc-gift', '🎁 Under Contract → Gift board',
  'Creates a Gifts entry when a deal goes Under Contract: client name, client home address (from Contacts when on file), side, client type.',
  true, 'deal_under_contract',
  '[{"id":"a1","type":"create_gift","config":{"notes":"UNDER CONTRACT · Property: {{addr}} · Side: {{side}}"}}]'::jsonb
) on conflict (id) do nothing;

-- 5. Sold → gift board entry
insert into automations (id, name, description, active, trigger_type, action_nodes) values (
  'sys-sold-gift', '🎁 Sold → Gift board',
  'Creates a Gifts entry when a deal Closes: client name, client home address (from Contacts when on file), side, deal type.',
  true, 'deal_closed',
  '[{"id":"a1","type":"create_gift","config":{"notes":"SOLD 🎉 · Property: {{addr}} · Side: {{side}}"}}]'::jsonb
) on conflict (id) do nothing;

-- 6. One week before closing → commission-bill task + email (cc Yanky)
insert into automations (id, name, description, active, trigger_type, trigger_config, action_nodes) values (
  'sys-closing-commission', '💵 1 week to closing → Commission bill',
  'Seven days before the expected closing date: creates a task for the secretary and emails secretary + Yanky about sending the commission bill.',
  true, 'closing_soon', '{"days": 7}'::jsonb,
  '[{"id":"a1","type":"create_task","config":{"assign_to":"secretary","title":"💵 Send commission bill — {{addr}}","due_days":2,"priority":"high","notes":"Closing expected {{close_date}}. Client: {{client_name}} · Agent: {{agent_name}} · Production ${{production}}"}},
    {"id":"a2","type":"send_email","config":{"to_role":"secretary","cc_email":"yanky@targetreteam.com",
     "subject":"💵 Commission bill needed — {{addr}} closes {{close_date}}",
     "body":"{{addr}} is expected to close on {{close_date}} (about a week out).\n\nPlease prepare and send the commission bill.\n\n👤 Client: {{client_name}}\n👤 Agent: {{agent_name}}\n💰 Production: ${{production}} · GCI: ${{gci}}\n\nA task has been created and assigned."}}]'::jsonb
) on conflict (id) do nothing;

-- 7. New contact → Yanky gets the full details
insert into automations (id, name, description, active, trigger_type, action_nodes) values (
  'sys-contact-created-email', '👤 New contact → Yanky',
  'Every contact created anywhere in the system emails Yanky the full details.',
  true, 'new_contact',
  '[{"id":"a1","type":"send_email","config":{"to_email":"yanky@targetreteam.com",
     "subject":"👤 New contact: {{name}}",
     "body":"A new contact was just created:\n\n👤 Name: {{name}}\n📞 Phone: {{phone}}\n✉️ Email: {{email}}\n🏷 Type: {{type}} · Status: {{status}}\n📥 Source: {{source}}\n👤 Assigned agent: {{agent_name}}\n✍️ Created by: {{changed_by}}\n\nOpen: https://app.targetreteam.com/contacts"}}]'::jsonb
) on conflict (id) do nothing;

-- 8. Photography scheduled → agent readiness email
insert into automations (id, name, description, active, trigger_type, action_nodes) values (
  'sys-photography-agent', '📸 Photography scheduled → Agent',
  'When a shoot is scheduled on the TC board, the deal''s agent gets the time + address with a house-readiness reminder.',
  true, 'photography_scheduled',
  '[{"id":"a1","type":"send_email","config":{
     "subject":"📸 Photography scheduled — {{addr}}",
     "body":"Photography has been scheduled:\n\n🏠 {{addr}}\n🗓 {{photo_when}}\n📷 Photographer: {{photographer}}\n\n⚠️ Please make sure the house is READY for photography — lights on, clutter away, curtains open, cars off the driveway."}}]'::jsonb
) on conflict (id) do nothing;
