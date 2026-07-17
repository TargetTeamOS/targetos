-- Stage-change email alerts → Yanky (UUID ids for live schema). Idempotent.
insert into automations (id, name, description, active, trigger_type, action_nodes) values (
  'a0000000-0000-4000-8000-000000000101', '📧 Deal stage change → Yanky',
  'Emails yanky@targetreteam.com on every deal stage change with address, agent, who changed it, and deal numbers.',
  true, 'deal_stage_change',
  '[{"id":"a1","type":"send_email","config":{"to_email":"yanky@targetreteam.com",
     "subject":"🔁 {{addr}} — {{prev_stage}} → {{stage}}",
     "body":"Stage change on the Production board:\n\n🏠 Property: {{addr}}\n📊 Stage: {{prev_stage}} → {{stage}}\n👤 Assigned agent: {{agent_name}}\n✍️ Changed by: {{changed_by}}\n\n💰 Production: ${{production}}\n💵 GCI: ${{gci}}\n📅 Close date: {{close_date}}\n\nOpen: https://app.targetreteam.com/production"}}]'::jsonb
) on conflict (id) do nothing;

insert into automations (id, name, description, active, trigger_type, action_nodes) values (
  'a0000000-0000-4000-8000-000000000102', '📧 Listing status change → Yanky',
  'Emails yanky@targetreteam.com on every listing status change with address, agent, and who changed it.',
  true, 'listing_status_change',
  '[{"id":"a1","type":"send_email","config":{"to_email":"yanky@targetreteam.com",
     "subject":"🏷 {{listing_addr}} — listing now {{status}}",
     "body":"Listing status change:\n\n🏠 Property: {{listing_addr}}\n🏷 New status: {{status}}\n👤 Assigned agent: {{agent_name}}\n✍️ Changed by: {{changed_by}}\n💲 List price: ${{list_price}}\n\nOpen: https://app.targetreteam.com/listings"}}]'::jsonb
) on conflict (id) do nothing;
