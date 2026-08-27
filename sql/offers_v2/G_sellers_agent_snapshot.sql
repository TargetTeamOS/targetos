-- ══════════════════════════════════════════════════════════════════
-- OFFERS WORKFLOW V2 · MIGRATION G — seller's agent email/phone snapshot
-- NOT applied/verified on live DB. Requires A_foundation.sql already
-- applied. Idempotent. Additive only.
--
-- WHY: sellers_agent_email and sellers_agent_phone have been read/set
-- in the client (Offers.jsx, send-offer recipient logic) for several
-- commits, but were never actually added as columns on `offers` --
-- unlike the attorney fields, which already had real snapshot columns
-- from the pre-existing schema. That meant this data lived only in
-- React state for the duration of one browser session and was lost on
-- reopen, which directly breaks "must persist after Save / reopen"
-- and is part of why an outside agent's contact information could
-- appear to vanish. This migration is what actually makes it durable.
-- ══════════════════════════════════════════════════════════════════

alter table offers add column if not exists sellers_agent_email text;
alter table offers add column if not exists sellers_agent_phone text;

comment on column offers.sellers_agent_email is
  'Editable snapshot of the linked sellers_agent_contact_id Contact''s email at the time of this offer -- a later change to the master Contact''s email must not silently change an already-generated legal PDF or already-sent email.';
comment on column offers.sellers_agent_phone is
  'Editable snapshot of the linked sellers_agent_contact_id Contact''s phone, same rule as sellers_agent_email above.';

-- ══════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ══════════════════════════════════════════════════════════════════
-- select column_name from information_schema.columns
--   where table_name = 'offers' and column_name in ('sellers_agent_email','sellers_agent_phone');
-- expect: 2 rows
