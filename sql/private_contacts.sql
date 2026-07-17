-- ═══════════════════════════════════════════════════════════════
-- Private Contacts (July 2026)
-- Contacts marked private only appear in contact-search pickers for
-- admins and the contact's assigned agent. (App-level enforcement in
-- ContactPicker; the Contacts board itself is unchanged.)
-- Run in Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════
alter table contacts add column if not exists is_private boolean not null default false;
create index if not exists idx_contacts_private on contacts (is_private) where is_private;
