'use strict'
// ── OFFER FINANCIAL CALCULATIONS — decimal-safe shared engine ──────
// CommonJS mirror of src/lib/offerCalc.js. Vercel /api handlers must
// be CommonJS (see CLAUDE.md rule #3), so this cannot be a direct
// shared import from src/ without a build step this repo doesn't
// have — kept as a deliberate, clearly-labeled duplicate instead of
// silently drifting. Any change to the calculation rules must be
// made in BOTH files. src/__tests__/offerCalc.test.js tests the
// browser copy; keep this file byte-for-byte equivalent in logic.

function toCents(v) {
  if (v === null || v === undefined || v === '') return 0
  const n = parseFloat(String(v).replace(/[$,%]/g, ''))
  if (!isFinite(n)) return 0
  return Math.round(n * 100)
}

function centsToDollarString(cents) {
  return (Math.round(cents) / 100).toFixed(2).replace(/\.00$/, '')
}

function toPercentBasisPoints(v) {
  if (v === null || v === undefined || v === '') return 0
  const n = parseFloat(String(v).replace(/[$,%]/g, ''))
  if (!isFinite(n)) return 0
  return Math.round(n * 100)
}

function basisPointsToPercentString(bp) {
  const n = Math.round(bp) / 100
  return (Number.isInteger(n) ? n : n.toFixed(2)).toString()
}

function depositAmountFromPercent(priceCents, depositBp) {
  return Math.round(priceCents * depositBp / 10000)
}

function depositPercentFromAmount(priceCents, depositCents) {
  if (priceCents <= 0) return 0
  return Math.round(depositCents / priceCents * 10000)
}

function mortgageAmountFromPercent(priceCents, mortgageBp) {
  return Math.round(priceCents * mortgageBp / 10000)
}

function mortgagePercentFromAmount(priceCents, mortgageCents) {
  if (priceCents <= 0) return 0
  return Math.round(mortgageCents / priceCents * 10000)
}

function balanceAtClosingCents(priceCents, depositCents, mortgageCents) {
  return priceCents - depositCents - mortgageCents
}

function netToSellerCents(priceCents, concessionCents) {
  return priceCents - concessionCents
}

function computeOfferFinancials(f) {
  const priceCents = toCents(f.purchase_price)
  const isCash = !!f.is_cash_deal || !!f.subject_cash

  let depositCents, depositBp
  if (f.deposit_type === 'percent') {
    depositBp = toPercentBasisPoints(f.deposit)
    depositCents = depositAmountFromPercent(priceCents, depositBp)
  } else {
    depositCents = toCents(f.deposit)
    depositBp = depositPercentFromAmount(priceCents, depositCents)
  }

  let mortgageCents, mortgageBp
  if (isCash) {
    mortgageCents = 0
    mortgageBp = 0
  } else if (f.mortgage_type === 'percent') {
    mortgageBp = toPercentBasisPoints(f.mortgage_pct)
    mortgageCents = mortgageAmountFromPercent(priceCents, mortgageBp)
  } else {
    mortgageCents = toCents(f.mortgage_amount)
    mortgageBp = mortgagePercentFromAmount(priceCents, mortgageCents)
  }

  const concessionCents = toCents(f.sellers_concession)
  const netToSellerC = netToSellerCents(priceCents, concessionCents)
  const balanceC = isCash
    ? priceCents - depositCents
    : balanceAtClosingCents(priceCents, depositCents, mortgageCents)

  const warnings = []
  const blocking = []

  if (priceCents < 0) blocking.push('Purchase price cannot be negative.')
  if (depositCents < 0) blocking.push('Deposit cannot be negative.')
  if (mortgageCents < 0) blocking.push('Mortgage amount cannot be negative.')
  if (depositBp < 0 || depositBp > 10000) blocking.push('Deposit percentage must be between 0% and 100%.')
  if (mortgageBp < 0 || mortgageBp > 10000) blocking.push('Mortgage percentage must be between 0% and 100%.')
  if (priceCents > 0 && depositCents > priceCents) {
    blocking.push('Deposit cannot exceed the purchase price.')
  }
  if (priceCents > 0 && depositCents + mortgageCents > priceCents) {
    warnings.push('Deposit + mortgage exceed the purchase price — confirm before generating the PDF.')
  }
  if (isCash && mortgageCents > 0) {
    blocking.push('Cash Deal and a mortgage amount cannot both be set — clear one.')
  }

  return {
    values: {
      purchase_price:      priceCents ? centsToDollarString(priceCents) : f.purchase_price,
      deposit:             f.deposit_type === 'percent' ? f.deposit : (depositCents ? centsToDollarString(depositCents) : f.deposit),
      // Always the real dollar amount regardless of input mode — the
      // printed PDF's "Deposit upon contract" line only ever has a
      // static "$", never a "%", so anything printing that line must
      // use this, not `deposit` above (which deliberately echoes back
      // the raw percent while the CRM's own input is in percent mode,
      // for that field's own bidirectional-typing UX — a real, separate
      // concern from what belongs on the printed page).
      deposit_dollar_amount: centsToDollarString(depositCents),
      deposit_derived_pct: basisPointsToPercentString(depositBp),
      mortgage_amount:     isCash ? '0' : (f.mortgage_type === 'percent' ? centsToDollarString(mortgageCents) : f.mortgage_amount),
      mortgage_pct:        isCash ? '0' : (f.mortgage_type === 'percent' ? f.mortgage_pct : basisPointsToPercentString(mortgageBp)),
      net_to_seller:       centsToDollarString(netToSellerC),
      balance_at_closing:  centsToDollarString(balanceC),
    },
    warnings,
    blocking,
  }
}

module.exports = {
  toCents, centsToDollarString, toPercentBasisPoints, basisPointsToPercentString,
  depositAmountFromPercent, depositPercentFromAmount,
  mortgageAmountFromPercent, mortgagePercentFromAmount,
  balanceAtClosingCents, netToSellerCents, computeOfferFinancials,
}
