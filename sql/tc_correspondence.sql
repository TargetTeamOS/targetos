-- ═══════════════════════════════════════════════════════════════
-- TC Correspondence / Email Log (July 2026)
-- Running log of emails/calls/messages per TC deal, so the whole
-- thread is tracked in one place. Run in Supabase. Idempotent.
-- ═══════════════════════════════════════════════════════════════
create table if not exists tc_correspondence (
  id uuid primary key default gen_random_uuid(),
  tc_deal_id uuid not null,
  direction text not null default 'note',   -- sent | received | call | note
  subject text,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_tc_corr_deal on tc_correspondence (tc_deal_id, created_at desc);
alter table tc_correspondence enable row level security;
drop policy if exists tc_corr_all on tc_correspondence;
create policy tc_corr_all on tc_correspondence for all to authenticated using (true) with check (true);
