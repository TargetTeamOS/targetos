-- ══════════════════════════════════════════════════════════════════
-- OFFERS WORKFLOW V2 · MIGRATION F — closing qualifier (On or About / On or Before)
-- NOT applied/verified on live DB. Requires D_closing_terms.sql
-- already applied. Idempotent. Additive only.
--
-- Splits what migration D conflated into one closing_mode column into
-- two independent axes, per the owner's own examples ("on or about
-- 60 days from contract" AND "on or about September 15, 2026" both
-- need the qualifier, regardless of whether the underlying value is a
-- day-count or a specific date):
--   closing_qualifier: 'on_or_about' | 'on_or_before'  (NEW)
--   closing_mode:       'days' | 'date'                (existing column,
--                        narrowed — 'on_or_about'/'on_or_before'/
--                        'custom' values from migration D are left
--                        alone on any existing rows, not rewritten;
--                        the application layer treats them as
--                        equivalent to 'date'/'days' respectively for
--                        backward compatibility, same pattern as the
--                        offer-status legacy mapping)
--
-- "Existing historical offers without this value should safely
-- default to On or About without rewriting historical PDFs" — the
-- default below handles new/blank rows; it does not touch any
-- existing row's already-generated PDF (revisions are immutable and
-- were never going to change regardless of this migration).
-- ══════════════════════════════════════════════════════════════════

alter table offers add column if not exists closing_qualifier text
  check (closing_qualifier in ('on_or_about','on_or_before')) default 'on_or_about';

comment on column offers.closing_qualifier is
  'On or About vs On or Before, applies regardless of whether closing_mode is days or date. Defaults to on_or_about for any row that predates this column, per the explicit requirement not to leave historical rows in an undefined state.';

-- ══════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ══════════════════════════════════════════════════════════════════
-- select column_name from information_schema.columns
--   where table_name = 'offers' and column_name = 'closing_qualifier';
-- expect: 1 row
--
-- select count(*) from offers where closing_qualifier is null;
-- expect: 0 (column has a default; existing rows backfill automatically)
