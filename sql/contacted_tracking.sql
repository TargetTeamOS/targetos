-- ═══════════════════════════════════════════════════════════════
-- Auto "contacted" tracking (July 2026)
-- A DB trigger on `calls` marks the linked contact as contacted on
-- any real call/SMS/voicemail (inbound or outbound). Notes and the
-- manual button are handled client-side via the same field updates.
-- Requires the Tier-B contact columns (contacted, first_contact_at,
-- last_contact_at) — see reporting_tier_b.sql. Idempotent.
-- ═══════════════════════════════════════════════════════════════

-- Ensure columns exist (safe if reporting_tier_b.sql already ran)
alter table contacts add column if not exists contacted        boolean default false;
alter table contacts add column if not exists first_contact_at timestamptz;
alter table contacts add column if not exists last_contact_at  timestamptz;

-- Trigger function: when a call/text/voicemail row references a contact,
-- stamp that contact as contacted. first_contact_at set once (coalesce),
-- last_contact_at always bumped. Assigned agent filled only if blank.
create or replace function mark_contact_contacted() returns trigger as $$
begin
  if new.contact_id is not null then
    update contacts
      set contacted        = true,
          first_contact_at = coalesce(first_contact_at, coalesce(new.called_at, now())),
          last_contact_at  = coalesce(new.called_at, now()),
          agent_id         = coalesce(agent_id, new.agent_id)
    where id = new.contact_id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_mark_contacted on calls;
create trigger trg_mark_contacted
  after insert on calls
  for each row execute function mark_contact_contacted();

-- Optional: also stamp last_activity_at on deals is handled elsewhere.
