// TargetOS V2 — AI House Scoring Algorithm
// Evaluates how well a listing matches a buyer's criteria.
// Uses the buyer profile fields from the contact record.
// Returns a score 0-100 with breakdown by category.

export function scoreHouseForBuyer(listing, buyer) {
  if (!listing || !buyer) return null

  const scores = {}
  let totalWeight = 0
  let totalScore  = 0

  function addScore(category, score, weight, reason) {
    scores[category] = { score, weight, reason }
    totalWeight += weight
    totalScore  += score * weight
  }

  // ── PRICE MATCH ─────────────────────────────────────────────────
  const price    = listing.list_price || listing.price || 0
  const maxBudget = parseNum(buyer.max_price) || parseNum(buyer.budget) || 0
  const minBudget = parseNum(buyer.min_price) || 0

  if (maxBudget > 0) {
    if (price <= maxBudget && price >= minBudget) {
      const pct = maxBudget > 0 ? ((maxBudget - price) / maxBudget) : 0
      const s = Math.min(100, 60 + pct * 40)
      addScore('Price', s, 30, `$${fmtNum(price)} within budget of $${fmtNum(maxBudget)}`)
    } else if (price > maxBudget) {
      const over = (price - maxBudget) / maxBudget
      const s = Math.max(0, 100 - over * 200)
      addScore('Price', s, 30, `$${fmtNum(price)} is ${Math.round(over*100)}% over budget`)
    } else {
      addScore('Price', 85, 30, `Below min budget — possibly underpriced`)
    }
  }

  // ── BEDROOM MATCH ────────────────────────────────────────────────
  const beds    = parseInt(listing.beds || listing.bedrooms || 0)
  const minBeds = parseInt(buyer.min_beds || buyer.bedrooms || 0)
  const maxBeds = parseInt(buyer.max_beds || 99)

  if (minBeds > 0) {
    if (beds >= minBeds && beds <= maxBeds) {
      addScore('Bedrooms', 100, 15, `${beds} beds matches requirement of ${minBeds}+`)
    } else if (beds < minBeds) {
      addScore('Bedrooms', Math.max(0, 100 - (minBeds - beds) * 30), 15, `${beds} beds — needs ${minBeds}+`)
    } else {
      addScore('Bedrooms', 80, 15, `${beds} beds — more than needed`)
    }
  }

  // ── BATHROOM MATCH ───────────────────────────────────────────────
  const baths    = parseFloat(listing.baths || listing.bathrooms || 0)
  const minBaths = parseFloat(buyer.min_baths || buyer.bathrooms || 0)

  if (minBaths > 0) {
    if (baths >= minBaths) {
      addScore('Bathrooms', 100, 10, `${baths} baths matches ${minBaths}+ requirement`)
    } else {
      addScore('Bathrooms', Math.max(0, 100 - (minBaths - baths) * 40), 10, `${baths} baths — needs ${minBaths}+`)
    }
  }

  // ── LOCATION MATCH ───────────────────────────────────────────────
  const city       = (listing.city || '').toLowerCase()
  const desiredCities = (buyer.desired_cities || buyer.areas || buyer.location || '').toLowerCase().split(',').map(c=>c.trim()).filter(Boolean)

  if (desiredCities.length > 0) {
    const match = desiredCities.some(dc => city.includes(dc) || dc.includes(city))
    addScore('Location', match ? 100 : 30, 20, match ? `${listing.city} matches desired area` : `${listing.city} not in preferred areas: ${desiredCities.join(', ')}`)
  }

  // ── PROPERTY TYPE ────────────────────────────────────────────────
  const propType    = (listing.property_type || '').toLowerCase()
  const wantedTypes = (buyer.property_type || buyer.home_type || '').toLowerCase()

  if (wantedTypes) {
    const match = wantedTypes.includes(propType) || propType.includes(wantedTypes.split(',')[0].trim())
    addScore('Property Type', match ? 100 : 40, 10, match ? `${listing.property_type} matches preference` : `Buyer prefers ${buyer.property_type}`)
  }

  // ── SQUARE FOOTAGE ───────────────────────────────────────────────
  const sqft    = parseInt(listing.sqft || listing.square_feet || 0)
  const minSqft = parseInt(buyer.min_sqft || 0)
  const maxSqft = parseInt(buyer.max_sqft || 99999)

  if (minSqft > 0 && sqft > 0) {
    if (sqft >= minSqft && sqft <= maxSqft) {
      addScore('Size', 100, 10, `${fmtNum(sqft)} sqft is in range`)
    } else if (sqft < minSqft) {
      const pct = sqft / minSqft
      addScore('Size', pct * 100, 10, `${fmtNum(sqft)} sqft below minimum ${fmtNum(minSqft)}`)
    } else {
      addScore('Size', 75, 10, `${fmtNum(sqft)} sqft — larger than needed`)
    }
  }

  // ── SHOWING HISTORY BONUS ────────────────────────────────────────
  // If buyer has shown this listing before and liked it, boost score
  if (buyer._showings) {
    const prev = buyer._showings.find(s => s.address === listing.addr || s.mls_number === listing.mls_number)
    if (prev) {
      const interestBonus = (prev.interest_level - 3) * 5 // -10 to +10
      addScore('Past Showing', 50 + interestBonus * 10, 5, `Shown before — rated "${prev.feedback || 'No feedback'}"`)
    }
  }

  // ── FINAL SCORE ──────────────────────────────────────────────────
  const final = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0
  const grade = final >= 85 ? 'A' : final >= 70 ? 'B' : final >= 55 ? 'C' : final >= 40 ? 'D' : 'F'
  const label = final >= 85 ? '🔥 Excellent match' : final >= 70 ? '✅ Good match' : final >= 55 ? '👍 Fair match' : final >= 40 ? '🤔 Weak match' : '❌ Poor match'
  const color = final >= 85 ? '#10B981' : final >= 70 ? '#3B82F6' : final >= 55 ? '#F5A623' : final >= 40 ? '#F97316' : '#DC2626'

  return { score: final, grade, label, color, breakdown: scores }
}

function parseNum(v) {
  return parseFloat(String(v || '').replace(/[$,]/g, '')) || 0
}
function fmtNum(n) {
  return Number(n).toLocaleString()
}

// ── SCORE DISPLAY COMPONENT ────────────────────────────────────────
export function HouseScoreCard({ listing, buyer }) {
  const result = scoreHouseForBuyer(listing, buyer)
  if (!result) return null

  return (
    <div style={{ background: result.color + '10', border: '1px solid ' + result.color + '44', borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: result.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900, flexShrink: 0 }}>
          {result.score}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: result.color }}>{result.label}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>Match score for this buyer</div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 24, fontWeight: 900, color: result.color }}>{result.grade}</div>
      </div>

      {/* Score breakdown */}
      {Object.entries(result.breakdown).map(([cat, data]) => (
        <div key={cat} style={{ marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>{cat}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: data.score >= 70 ? '#10B981' : data.score >= 40 ? '#F97316' : '#DC2626' }}>{Math.round(data.score)}%</span>
          </div>
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: data.score + '%', background: data.score >= 70 ? '#10B981' : data.score >= 40 ? '#F97316' : '#DC2626', borderRadius: 99, transition: 'width .4s' }} />
          </div>
          <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 1 }}>{data.reason}</div>
        </div>
      ))}
    </div>
  )
}
