-- ═══════════════════════════════════════════════════════════════
-- Interactions (July 2026) — structured log of every contact touch
-- (call, SMS, WhatsApp, email, in-person, note) that happens outside
-- the auto-captured Twilio calls. One clean table future WhatsApp/
-- email integrations can also write to. A trigger marks the contact
-- contacted, mirroring the calls-table trigger. Idempotent.
-- ═══════════════════════════════════════════════════════════════

create table if not exists interactions (
  id uuid primary key default gen_random_uuid(),
  contact_id   uuid not null references contacts(id) on delete cascade,
  agent_id     uuid,
  type         text not null default 'note',    -- call | sms | whatsapp | email | in_person | note | other
  direction    text default 'outbound',         -- outbound | inbound
  notes        text,
  occurred_at  timestamptz not null default now(),
  follow_up    boolean default false,
  follow_up_date date,
  counts_as_contact boolean default true,        -- did this touch the client?
  created_by   uuid,
  created_at   timestamptz not null default now()
);
create index if not exists idx_interactions_contact on interactions (contact_id, occurred_at desc);
alter table interactions enable row level security;
drop policy if exists interactions_all on interactions;
create policy interactions_all on interactions for all to authenticated using (true) with check (true);

-- Trigger: when an interaction that counts as contact is logged, stamp
-- the contact (same rules as the calls trigger). first_contact_at set
-- once; last_contact_at always; blank agent filled.
create or replace function mark_contact_from_interaction() returns trigger as $$
begin
  if new.contact_id is not null and coalesce(new.counts_as_contact, true) then
    update contacts
      set contacted        = true,
          first_contact_at = coalesce(first_contact_at, coalesce(new.occurred_at, now())),
          last_contact_at  = coalesce(new.occurred_at, now()),
          last_activity_at = coalesce(new.occurred_at, now()),
          agent_id         = coalesce(agent_id, new.agent_id)
    where id = new.contact_id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_interaction_contacted on interactions;
create trigger trg_interaction_contacted
  after insert on interactions
  for each row execute function mark_contact_from_interaction();

-- last_activity_at on contacts (safe if already added)
alter table contacts add column if not exists last_activity_at timestamptz;

-- Also mark contacted when an SMS is logged (sms_messages table).
-- Only if the table exists; wrap in a DO block so it's safe either way.
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'sms_messages') then
    execute $trg$
      create or replace function mark_contact_from_sms() returns trigger as $f$
      begin
        if new.contact_id is not null then
          update contacts
            set contacted = true,
                first_contact_at = coalesce(first_contact_at, coalesce(new.created_at, now())),
                last_contact_at = coalesce(new.created_at, now()),
                last_activity_at = coalesce(new.created_at, now())
          where id = new.contact_id;
        end if;
        return new;
      end;
      $f$ language plpgsql security definer;
    $trg$;
    execute 'drop trigger if exists trg_sms_contacted on sms_messages';
    execute 'create trigger trg_sms_contacted after insert on sms_messages for each row execute function mark_contact_from_sms()';
  end if;
end $$;
