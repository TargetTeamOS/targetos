-- ═══════════════════════════════════════════════════════════════
-- Marketing Cards upgrade (July 2026)
-- 1. listings.photo_url — the listing's main photo, so marketing
--    cards can auto-import the image when a listing is selected.
-- 2. card_templates price/details layers — For Sale cards carry
--    price and beds/baths text, positioned per template.
-- Run in Supabase SQL editor. Idempotent. The code deploys safely
-- BEFORE this runs (it falls back gracefully) — but auto photo
-- import and For Sale text saving activate only after it runs.
-- ═══════════════════════════════════════════════════════════════

alter table listings add column if not exists photo_url text;

alter table card_templates add column if not exists price_layer   jsonb;
alter table card_templates add column if not exists details_layer jsonb;
alter table card_templates add column if not exists erase_zones jsonb;
