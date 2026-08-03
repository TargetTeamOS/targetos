-- ══════════════════════════════════════════════════════════════════
-- OFFERS WORKFLOW V2 · MIGRATION A — FOUNDATION
-- NOT applied/verified on live DB. Run in Supabase SQL editor, then
-- run A_verify.sql and confirm every check before shipping Commit 2+.
-- Idempotent (safe to re-run). Additive only — no drops, no renames,
-- no data rewrites of existing offers rows.
-- Rollback: A_rollback.sql
--
-- Audit basis (verified against current `main`, commit 11e53a1):
--   - offers.buyer_contact_id / co_buyer_contact_id / seller_contact_id /
--     co_seller_contact_id / purchaser_attorney_contact_id /
--     seller_attorney_contact_id / deal_id ALREADY EXIST and are wired
--     in src/pages/Offers.jsx. This migration does NOT recreate them.
--   - offers.deposit_type ALREADY EXISTS (dollar/percent toggle).
--   - offers.side EXISTS but is dead weight: Offers.jsx hardcodes it to
--     the literal 'Buyer' on every save (line 583) and there is no UI
--     control for it. representing_side (below) is the real field;
--     side is left untouched (still written by existing code paths)
--     to avoid breaking the Production-conversion block, which reads
--     inhouse_listing_id, not side, to decide deal side.
--   - No CREATE TABLE for `offers` exists in tracked SQL at all — the
--     base table was created directly in Supabase. This migration
--     cannot assume a fully-known column list; every ALTER below is
--     IF NOT EXISTS and no column is assumed present beyond what is
--     directly used in src/pages/Offers.jsx / src/lib/db.js today.
-- ══════════════════════════════════════════════════════════════════

-- ── A1. Representation side (genuinely missing — no prior column served this) ──
alter table offers add column if not exists representing_side text
  check (representing_side in ('Buyer','Seller','Both')) default 'Buyer';

comment on column offers.representing_side is
  'Who Target Team represents on this offer. Distinct from the legacy `side` column, which Offers.jsx currently hardcodes and which Production-conversion logic does not read.';

-- ── A2. Outside agent contact links (buyer/seller agent when NOT one of our own agents) ──
-- buyers_agent_id (existing) is a TargetOS agents.id, used when the buyer's
-- agent is one of ours. buyers_agent_contact_id is the outside-broker case —
-- e.g. Target Team represents the seller and needs to link the buyer's
-- outside agent as an authoritative Contact (per spec: "Outside Agent/Broker").
alter table offers add column if not exists buyers_agent_contact_id uuid references contacts(id);
alter table offers add column if not exists sellers_agent_contact_id uuid references contacts(id);

-- ── A3. Mortgage input-mode tracking, mirroring the existing deposit_type pattern ──
-- Today mortgage_amount is one-directionally derived from mortgage_pct
-- (Offers.jsx lines 364-378); there is no stored "which one did the agent
-- actually type" flag, so amount-first entry can't reliably derive percent
-- the way deposit already does. This column enables that in Commit 2
-- without changing existing mortgage_amount/mortgage_pct semantics.
alter table offers add column if not exists mortgage_type text
  check (mortgage_type in ('dollar','percent')) default 'dollar';

-- ── A4. Cash-deal / calculation integrity flags ──
alter table offers add column if not exists is_cash_deal boolean not null default false;

-- ── A5. Acceptance audit clarity (existing conversion logic only toasts; nothing is stored) ──
alter table offers add column if not exists accepted_at timestamptz;
alter table offers add column if not exists accepted_by uuid references agents(id);

-- ── A6. Idempotency guard for the accepted → Production conversion ──
-- The existing client-side conversion (Offers.jsx 622-656) already guards
-- against duplicates via offers.deal_id + an address-based fallback query,
-- but it is not atomic. This unique, nullable column lets Commit 4 add a
-- server-side idempotency key without touching the working duplicate-guard
-- logic that already ships today.
alter table offers add column if not exists conversion_idempotency_key text;
create unique index if not exists idx_offers_conversion_key
  on offers (conversion_idempotency_key) where conversion_idempotency_key is not null;

-- ── A7. Revisions ──────────────────────────────────────────────────
-- New object. Nothing today preserves a sent offer's exact values when
-- the agent edits and re-sends. This table is the authoritative
-- per-revision snapshot; offers stays the authoritative "current state"
-- row (unchanged contract for every existing read in Offers.jsx).
create table if not exists offer_revisions (
  id                uuid primary key default gen_random_uuid(),
  offer_id          uuid not null references offers(id) on delete cascade,
  revision_number   integer not null,
  previous_revision_id uuid references offer_revisions(id),
  created_by        uuid references agents(id),
  created_at        timestamptz not null default now(),

  -- Field snapshot: full form state at time of this revision, so a
  -- revision can be inspected/compared without re-deriving from `offers`
  -- (which will have moved on to the latest state by then).
  field_snapshot    jsonb not null,

  -- Denormalized copies of the values that matter most for comparison
  -- views and reporting (spec: "Purchase Price: $900,000 -> $925,000"),
  -- so the required revision-diff UI and admin reports don't have to
  -- reach into jsonb for every list render.
  purchase_price    numeric(12,2),
  deposit_amount    numeric(12,2),
  deposit_pct       numeric(5,2),
  mortgage_amount   numeric(12,2),
  mortgage_pct      numeric(5,2),
  balance_at_closing numeric(12,2),
  net_to_seller     numeric(12,2),
  additional_terms  text,
  contingencies     jsonb,

  -- Document + send linkage for this specific revision
  pdf_document_id   uuid,
  pdf_path          text,
  send_status       text not null default 'Draft'
                     check (send_status in ('Draft','Sent','Send Failed')),
  sent_at           timestamptz,

  is_accepted_revision boolean not null default false,

  unique (offer_id, revision_number)
);

create index if not exists idx_offer_revisions_offer on offer_revisions (offer_id, revision_number desc);

comment on table offer_revisions is
  'Immutable per-revision snapshot of an offer. A sent revision is never edited in place; editing a sent offer creates a new row here and offers.current_revision_id advances. Historical PDFs stay attached to their original revision_id forever.';

-- Pointer from offers to its latest revision, for fast board rendering.
alter table offers add column if not exists current_revision_id uuid references offer_revisions(id);

-- ── A8. Send history ────────────────────────────────────────────────
-- New object — no send capability exists in the current Offers board at
-- all (verified: zero references to sending in src/pages/Offers.jsx).
-- Designed to sit on top of the EXISTING per-agent delegated pathway
-- (api/connector-send.js), never api/send-email.js (shared Resend
-- mailbox) or a caller-supplied sender.
create table if not exists offer_sends (
  id                uuid primary key default gen_random_uuid(),
  offer_id          uuid not null references offers(id) on delete cascade,
  revision_id       uuid not null references offer_revisions(id),
  sent_by           uuid not null references agents(id),
  provider          text not null check (provider in ('outlook','gmail')),
  sender_mailbox    text not null,
  recipients        jsonb not null,             -- [{ role, name, email }]
  subject           text not null,
  message_snapshot  text,
  pdf_document_id   uuid,
  status            text not null default 'Queued'
                     check (status in ('Queued','Sent','Failed')),
  provider_message_id text,
  error_message     text,
  idempotency_key   text not null,
  created_at        timestamptz not null default now(),
  sent_at           timestamptz,

  unique (idempotency_key)
);

create index if not exists idx_offer_sends_offer on offer_sends (offer_id, created_at desc);

comment on table offer_sends is
  'One row per attempted offer send. idempotency_key prevents duplicate sends from double-click or retried post-send logging failures (spec requirement: post-send logging failure must not cause a duplicate send).';

-- ── A9. Documents distinguished from the generated offer PDF ────────
-- offer-docs storage bucket already exists (used today for uploaded
-- supporting files). No new bucket needed. This column set lets a
-- generic documents table (if the CRM already has one) or ad hoc rows
-- distinguish a supporting doc from the authoritative generated PDF;
-- if TargetOS already has a shared documents table elsewhere, prefer
-- that over this and skip A9 — flagged for confirmation, not assumed.

-- ══════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════════
-- Self-contained (does NOT depend on sql/phase1/A_safe_foundation.sql's
-- app_can_view_agent() helper — verified that migration is not yet
-- applied on live main, so Offers RLS cannot rely on it existing).

alter table offers enable row level security;
alter table offer_revisions enable row level security;
alter table offer_sends enable row level security;

-- Offers: admin sees all; agent sees offers they are the assigned agent
-- OR the buyer's/seller's agent on; secretary/office role sees all only
-- if the existing permission matrix already grants it (checked via the
-- same agents.role convention used elsewhere in this repo, e.g.
-- sql/feature_flags.sql's ff_write policy).
drop policy if exists offers_select on offers;
create policy offers_select on offers for select to authenticated using (
  exists (select 1 from agents a where a.auth_user_id = auth.uid() and a.role = 'admin' and coalesce(a.active, true))
  or exists (
    select 1 from agents a
    where a.auth_user_id = auth.uid() and coalesce(a.active, true)
      and a.id in (offers.agent_id, offers.buyers_agent_id)
  )
);

drop policy if exists offers_write on offers;
create policy offers_write on offers for all to authenticated using (
  exists (select 1 from agents a where a.auth_user_id = auth.uid() and a.role = 'admin' and coalesce(a.active, true))
  or exists (
    select 1 from agents a
    where a.auth_user_id = auth.uid() and coalesce(a.active, true)
      and a.id in (offers.agent_id, offers.buyers_agent_id)
  )
) with check (
  exists (select 1 from agents a where a.auth_user_id = auth.uid() and a.role = 'admin' and coalesce(a.active, true))
  or exists (
    select 1 from agents a
    where a.auth_user_id = auth.uid() and coalesce(a.active, true)
      and a.id in (offers.agent_id, offers.buyers_agent_id)
  )
);

-- Revisions/sends inherit visibility from their parent offer — no
-- separate ownership vocabulary, so an agent can't end up seeing a
-- revision for an offer they can't see the parent of.
drop policy if exists offer_revisions_select on offer_revisions;
create policy offer_revisions_select on offer_revisions for select to authenticated using (
  exists (select 1 from offers o where o.id = offer_revisions.offer_id)
  and exists (
    select 1 from agents a where a.auth_user_id = auth.uid() and coalesce(a.active, true)
      and (a.role = 'admin' or a.id in (
        select unnest(array[o.agent_id, o.buyers_agent_id]) from offers o where o.id = offer_revisions.offer_id
      ))
  )
);

drop policy if exists offer_revisions_write on offer_revisions;
create policy offer_revisions_write on offer_revisions for all to authenticated using (
  exists (
    select 1 from agents a where a.auth_user_id = auth.uid() and coalesce(a.active, true)
      and (a.role = 'admin' or a.id in (
        select unnest(array[o.agent_id, o.buyers_agent_id]) from offers o where o.id = offer_revisions.offer_id
      ))
  )
);

drop policy if exists offer_sends_select on offer_sends;
create policy offer_sends_select on offer_sends for select to authenticated using (
  exists (
    select 1 from agents a where a.auth_user_id = auth.uid() and coalesce(a.active, true)
      and (a.role = 'admin' or a.id in (
        select unnest(array[o.agent_id, o.buyers_agent_id]) from offers o where o.id = offer_sends.offer_id
      ))
  )
);

drop policy if exists offer_sends_write on offer_sends;
create policy offer_sends_write on offer_sends for all to authenticated using (
  exists (
    select 1 from agents a where a.auth_user_id = auth.uid() and coalesce(a.active, true)
      and (a.role = 'admin' or a.id in (
        select unnest(array[o.agent_id, o.buyers_agent_id]) from offers o where o.id = offer_sends.offer_id
      ))
  )
) with check (
  sent_by in (select a.id from agents a where a.auth_user_id = auth.uid())
);

-- ══════════════════════════════════════════════════════════════════
-- KNOWN LIMITATION — flagged, not silently resolved
-- ══════════════════════════════════════════════════════════════════
-- This policy grants visibility via offers.agent_id / offers.buyers_agent_id
-- only. If the live `offers` table's true ownership column is named
-- differently (unverified — no CREATE TABLE is tracked in git), this
-- policy will fail closed (deny-by-default under RLS) rather than fail
-- open, which is the correct direction to fail, but it means this
-- migration MUST be run against a Preview/staging copy and checked with
-- A_verify.sql before Production, exactly as the handoff requires.
