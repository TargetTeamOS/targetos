// Shared NY closing-cost estimator.
// Single source of truth for the Toolbox "Closing Costs" net sheets and the
// "Deal Analyzer" buyer/seller summaries (src/pages/Mortgage.jsx), so the
// same inputs always give the same totals in both tools.
//
// Buyer side: lender/title/recording costs + NY mansion tax (1% of price on
// residential sales >= $1M, paid by the buyer).
// Seller side: commission + NYS/NYC transfer tax (paid by the seller in NY,
// so it is NEVER part of the buyer's closing costs) + title/attorney/misc.

export const MANSION_TAX_THRESHOLD = 1000000
export const MANSION_TAX_RATE = 0.01

// NYS transfer tax 0.4%; NYC adds RPTT (combined ~1.425%).
export function transferTaxRate(county) {
  return county === 'nyc' ? 0.01425 : 0.004
}

// Mortgage recording tax (paid by the borrower on the loan amount).
export function mortgageRecordingTaxRate(county) {
  return county === 'nyc' ? 0.019 : 0.013
}

export function mansionTax(price) {
  return price >= MANSION_TAX_THRESHOLD ? price * MANSION_TAX_RATE : 0
}

function sum(obj) {
  return Object.values(obj).reduce((a, b) => a + b, 0)
}

// price: sale price ($); loan: loan amount ($); county: 'rockland' | 'westchester' | 'orange' | 'nyc'
export function buyerClosingCosts({ price, loan, county }) {
  const p = Number(price) || 0
  const l = Number(loan) || 0
  const items = {
    bankFees:       l * 0.01,
    appraisal:      750,
    titleSearch:    600,
    titleInsurance: l * 0.005,
    mortgageTax:    l * mortgageRecordingTaxRate(county),
    prepaids:       p * 0.005,
    inspections:    600,
    attorneyFee:    1500,
    mansionTax:     mansionTax(p),
    miscFees:       500,
  }
  return { items, total: sum(items) }
}

// commPct: total commission as a percent (e.g. 2.5)
export function sellerClosingCosts({ price, commPct, county }) {
  const p = Number(price) || 0
  const items = {
    commission:           p * ((Number(commPct) || 0) / 100),
    transferTax:          p * transferTaxRate(county),
    titleInsurance:       p * 0.004,
    attorneyFee:          1500,
    mortgageSatisfaction: 500,
    miscFees:             750,
  }
  const total = sum(items)
  return { items, total, net: p - total }
}
