-- ══════════════════════════════════════════════════════════════════
-- OFFERS WORKFLOW V2 · MIGRATION A — ROLLBACK
-- Reverses A_foundation.sql. Safe to run even if only part of A ran.
-- Does NOT touch any pre-existing offers data or columns that predate
-- this migration (buyer_contact_id, deposit_type, deal_id, etc. are
-- untouched — they existed before this project and are out of scope).
-- ══════════════════════════════════════════════════════════════════

drop policy if exists offers_select on offers;
drop policy if exists offers_write  on offers;
drop policy if exists offer_revisions_select on offer_revisions;
drop policy if exists offer_revisions_write  on offer_revisions;
drop policy if exists offer_sends_select on offer_sends;
drop policy if exists offer_sends_write  on offer_sends;

-- Leaving RLS enabled on `offers` is safe even after policies are
-- dropped (fails closed, not open) — do not disable it as part of a
-- rollback. If a rollback of RLS enablement itself is genuinely
-- required, that is an explicit separate decision, not automatic here.

alter table offers drop column if exists current_revision_id;
drop table if exists offer_sends;
drop table if exists offer_revisions;

alter table offers drop column if exists conversion_idempotency_key;
alter table offers drop column if exists accepted_by;
alter table offers drop column if exists accepted_at;
alter table offers drop column if exists is_cash_deal;
alter table offers drop column if exists mortgage_type;
alter table offers drop column if exists sellers_agent_contact_id;
alter table offers drop column if exists buyers_agent_contact_id;
alter table offers drop column if exists representing_side;
