// ── OFFER FINANCIAL CALCULATIONS — decimal-safe shared engine ──────
// Used by src/pages/Offers.jsx (browser) and mirrored 1:1 in
// api/_lib/offerCalc.js (CommonJS, server-side) so the same rules
// that render in the form are the same rules that validate before
// PDF generation / send. Keep both files in sync — see the header
// comment in api/_lib/offerCalc.js.
//
// All money math is done in integer cents to avoid the penny-drift
// float bugs that parseFloat()+Math.round() produce when compounded
// across deposit/mortgage/balance/net-to-seller in sequence.

export function toCents(v) {
  if (v === null || v === undefined || v === '') return 0
  const n = parseFloat(String(v).replace(/[$,%]/g, ''))
  if (!isFinite(n)) return 0
  return Math.round(n * 100)
}

export function centsToDollarString(cents) {
  return (Math.round(cents) / 100).toFixed(2).replace(/\.00$/, '')
}

export function toPercentBasisPoints(v) {
  if (v === null || v === undefined || v === '') return 0
  const n = parseFloat(String(v).replace(/[$,%]/g, ''))
  if (!isFinite(n)) return 0
  return Math.round(n * 100) // basis points, e.g. 5.25% -> 525
}

export function basisPointsToPercentString(bp) {
  const n = Math.round(bp) / 100
  return (Number.isInteger(n) ? n : n.toFixed(2)).toString()
}

/** deposit amount (cents) = purchase price (cents) x deposit% */
export function depositAmountFromPercent(priceCents, depositBp) {
  return Math.round(priceCents * depositBp / 10000)
}

/** deposit% (basis points) derived from a dollar amount */
export function depositPercentFromAmount(priceCents, depositCents) {
  if (priceCents <= 0) return 0
  return Math.round(depositCents / priceCents * 10000)
}

export function mortgageAmountFromPercent(priceCents, mortgageBp) {
  return Math.round(priceCents * mortgageBp / 10000)
}

export function mortgagePercentFromAmount(priceCents, mortgageCents) {
  if (priceCents <= 0) return 0
  return Math.round(mortgageCents / priceCents * 10000)
}

/** Balance at Closing = purchase price - deposit - mortgage.
 *  Per spec: do NOT subtract Seller's Concession here unless a
 *  verified business rule requires it — none was found, so this
 *  stays the default formula. */
export function balanceAtClosingCents(priceCents, depositCents, mortgageCents) {
  return priceCents - depositCents - mortgageCents
}

/** Net to Seller = purchase price - seller's concession.
 *  Per spec: do NOT subtract brokerage commission unless a verified
 *  business rule requires it — none was found. */
export function netToSellerCents(priceCents, concessionCents) {
  return priceCents - concessionCents
}

/**
 * Computes every dependent financial field from the current form
 * state. Pure function — no state mutation, no side effects — so it
 * can run identically in the browser and on the server.
 *
 * @param {object} f - form-shaped input; string/number values ok
 * @returns {{ values: object, warnings: string[], blocking: string[] }}
 */
export function computeOfferFinancials(f) {
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
  if (!isCash && f.subject_mortgage === false && mortgageCents > 0) {
    warnings.push('Mortgage amount is set but "Mortgage" is not checked under Subject To.')
  }

  return {
    values: {
      purchase_price:     priceCents ? centsToDollarString(priceCents) : f.purchase_price,
      deposit:            f.deposit_type === 'percent' ? f.deposit : (depositCents ? centsToDollarString(depositCents) : f.deposit),
      deposit_derived_pct: basisPointsToPercentString(depositBp),
      mortgage_amount:    isCash ? '0' : (f.mortgage_type === 'percent' ? centsToDollarString(mortgageCents) : f.mortgage_amount),
      mortgage_pct:       isCash ? '0' : (f.mortgage_type === 'percent' ? f.mortgage_pct : basisPointsToPercentString(mortgageBp)),
      net_to_seller:      centsToDollarString(netToSellerC),
      balance_at_closing: centsToDollarString(balanceC),
    },
    warnings,
    blocking,
  }
}
