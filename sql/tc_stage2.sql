-- ═══════════════════════════════════════════════════════════════
-- TC Operations — Stage 2 (July 2026)
-- Run in Supabase SQL editor BEFORE deploying the matching code.
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════

-- Deal chat: running update log per TC deal with @mentions.
-- Mentioned agents get a bell/email notification; full history
-- stays on the deal forever.
create table if not exists tc_comments (
  id          uuid primary key default gen_random_uuid(),
  tc_deal_id  uuid not null,
  agent_id    uuid,                 -- who wrote it
  body        text not null,
  mentions    jsonb,                -- array of mentioned agent ids
  created_at  timestamptz not null default now()
);
create index if not exists idx_tc_comments_deal on tc_comments (tc_deal_id, created_at);

-- Contract-to-close service toggle + linked sign
alter table tc_deals add column if not exists c2c_enabled boolean not null default false;
alter table tc_deals add column if not exists linked_sign_id uuid;

-- Offers: persist co-buyer / co-seller contact links (search existed,
-- stored link did not — completes the contact connectivity pass)
alter table offers add column if not exists co_buyer_contact_id uuid;
alter table offers add column if not exists co_seller_contact_id uuid;
