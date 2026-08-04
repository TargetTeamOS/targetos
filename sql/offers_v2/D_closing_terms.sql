-- ══════════════════════════════════════════════════════════════════
-- OFFERS WORKFLOW V2 · MIGRATION D — CLOSING TERMS (mode + real date)
-- NOT applied/verified on live DB. Requires A_foundation.sql already
-- applied. Idempotent. Additive only.
--
-- WHY: the printed template's "Closing time frame ___ DAYS" field is
-- a single-line field only 67.68pt wide (measured directly from the
-- template: rect [184.32, 408.72, 252.0, 421.44]), immediately
-- followed by the STATIC, unmovable printed word "DAYS" baked into the
-- page itself. That means the printed line can only ever safely hold
-- a short number before "DAYS" -- it cannot fit "On or about
-- September 18, 2026" without either overflowing or reading as broken
-- text glued onto "DAYS". Per the non-negotiable PDF requirement, the
-- printed layout cannot change to accommodate this.
--
-- The resolution: the CRM lets an agent pick "On or about" / "On or
-- before" a REAL calendar date (not just vague wording), and the
-- printed PDF prints the equivalent day-count computed from that date
-- (offer_date -> closing_target_date), so the page still reads
-- correctly ("45 DAYS"). The actual date the agent picked is stored
-- and always visible when the offer is reopened -- satisfying "need
-- the option of viewing the actual [date]" without violating the
-- immutable template.
-- ══════════════════════════════════════════════════════════════════

alter table offers add column if not exists closing_mode text
  check (closing_mode in ('days','on_or_about','on_or_before','custom')) default 'days';
alter table offers add column if not exists closing_target_date date;
alter table offers add column if not exists closing_custom_text text;

comment on column offers.closing_mode is
  'How the closing time frame was specified. "days" prints the number in closing_days directly (unchanged, existing behavior). "on_or_about"/"on_or_before" store a real target date and print the computed day-count. "custom" stores short free text that must fit the printed field''s 67.68pt width or PDF generation is refused (same never-truncate rule as Additional Terms).';
comment on column offers.closing_target_date is
  'The actual calendar date the agent picked for on_or_about/on_or_before -- always shown in the CRM even though the printed PDF shows a computed day-count instead, since the template field cannot fit a full date next to the static "DAYS" suffix.';

-- ══════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ══════════════════════════════════════════════════════════════════
-- select column_name from information_schema.columns
--   where table_name = 'offers'
--   and column_name in ('closing_mode','closing_target_date','closing_custom_text');
-- expect: 3 rows
--
-- select count(*) from offers where closing_mode is null;
-- expect: 0 (column has a default; existing rows backfill automatically)
