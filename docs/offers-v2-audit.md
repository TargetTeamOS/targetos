# Offers Board v2 — Verified Audit (Commit 1 basis)

Verified against `main` @ `11e53a13867f10efd8c130bd7e43aa6b6abed275`. Branch: `feature/offers-workflow-v2`.

## What already exists (do not rebuild)

- **Authoritative contact linking is already substantially built.** `offers` already
  carries `buyer_contact_id`, `co_buyer_contact_id`, `seller_contact_id`,
  `co_seller_contact_id`, `purchaser_attorney_contact_id`, `seller_attorney_contact_id`,
  and `deal_id`, all wired into `src/pages/Offers.jsx`'s contact/attorney search and
  save paths, with editable snapshot fields alongside each FK (name/phone/email/address
  can be edited on the offer without mutating the master Contact). This matches the
  spec's "authoritative FK + historical snapshot" requirement — extend it, don't
  duplicate it.
- **Deposit dual-mode input already exists** (`deposit_type`: dollar/percent), with
  live recalculation in the save handler.
- **Accepted-offer → Production conversion already exists** (`Offers.jsx` lines
  622–656): on `AO`/`Accepted`, creates a `deals` row, links back via `offers.deal_id`,
  flips an in-house listing to "Accepted offer," guarded against duplicates by
  `deal_id` presence + an address-based open-deal fallback query. It is real,
  shipped logic — not something to build from scratch. It is not atomic (pure
  client-side) and the deal's `stage` value is written as `'Offer Accapted'`, a
  typo baked into the existing `DEAL_STAGES` constant and used consistently
  elsewhere — flagged, not renamed, per the handoff's rule against changing
  canonical Production stage values without inspecting every dependent.
- **PDF generation already uses the correct architecture.** `api/generate-offer-pdf.js`
  loads the real `api/Offer_For_Sale_Form.pdf` (an Acrobat AcroForm with 37 named
  fields) via `pdf-lib`, sets field text, flattens. No redrawing. Rendered comparison
  against the uploaded canonical PDF confirms identical layout, branding, legal text,
  footer, and signature lines (one page, 612×792pt, both files).

## Real gaps found (basis for Commits 1-5)

1. **No representation-side selection.** `offers.side` exists as a column but
   `Offers.jsx` hardcodes it to the literal string `'Buyer'` on every save (line 583);
   there is no UI control for it anywhere in the file. `representing_side` (new column,
   Commit 1) is the actual field going forward; `side` is left untouched since the
   Production-conversion block does not read it (it reads `inhouse_listing_id`).
2. **No outside-agent contact linking.** `sellers_agent_name` / `seller_agent_company`
   are free-text snapshots only — no Contact FK, so an outside listing agent can't be
   looked up, deduped, or have offer history queried against them. Same gap for an
   outside buyer's agent when Target Team represents the seller. New columns:
   `buyers_agent_contact_id`, `sellers_agent_contact_id`.
3. **Mortgage input is one-directional.** `mortgage_amount` is always derived from
   `mortgage_pct` when the latter is set; there is no stored input-mode flag, so
   amount-first entry can't reliably derive the displayed percentage the way deposit
   already can. New column: `mortgage_type`, mirroring `deposit_type`.
4. **No revision history.** Editing and resending an offer overwrites the same row.
   Nothing preserves an earlier sent PDF's exact values. New table: `offer_revisions`.
5. **No send capability at all.** Zero references to sending anywhere in
   `Offers.jsx`. Must be built against `api/connector-send.js` (the real per-agent
   OAuth Outlook/Gmail pathway) — never `api/send-email.js`, which is a shared
   system Resend mailbox and exactly the fallback the spec forbids for personal
   agent sends. New table: `offer_sends`, with a unique `idempotency_key`.
6. **Two dead PDF generators.** `api/fill_offer_pdf.py` and `api/generate_offer_pdf.py`
   are not called by anything. The latter redraws the entire document with reportlab —
   the exact anti-pattern ("recreate from scratch") the spec forbids. Scheduled for
   removal in Commit 3 rather than left as a landmine.
7. **Checkbox fields never set.** The template's six "Subject to" checkboxes
   (`x`, `x_2`…`x_6` — all `/Tx` text fields, not real PDF checkboxes) are present in
   the form but `generate-offer-pdf.js` never calls `set()` on any of them. Contingency
   selections never reach the printed PDF today. Fix scheduled for Commit 3.
8. **Faint field-border artifact.** The 37-field template renders with tiny extra tick
   marks at the end of several blank lines versus the clean uploaded PDF — an
   AcroForm widget appearance/border issue, not a layout or content change. Fix
   scheduled for Commit 3 (field appearance flags), verified by re-diffing rendered
   images against the uploaded canonical PDF.
9. **No RLS confirmed for `offers`.** No `CREATE TABLE offers` and no RLS policy for
   it exists anywhere in tracked SQL — the base table was created directly in
   Supabase. Ownership filtering today is client-side only
   (`isAdmin || canManage ? {} : { agent_id: agent?.id }`). Commit 1 adds explicit,
   self-contained RLS (not dependent on the still-unapplied `sql/phase1` helper
   functions) — see `sql/offers_v2/A_foundation.sql`.
10. **Unverified live column list.** Because the base table isn't in git, this
    migration only touches columns directly observed in use in `Offers.jsx`/`db.js`.
    `A_verify.sql` must be run against staging before Commit 2's application code is
    trusted against a live database.

## Reused, not duplicated

Per the handoff's "existing data first" rule, this project does **not** create:
a second offers table, a separate "offer contacts" table (existing FK columns on
`offers` are reused), a separate attorney directory (Contacts already supports it),
or a new email-sending pathway (extends `connector-send.js`).
