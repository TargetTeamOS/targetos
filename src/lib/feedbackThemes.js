// ═══════════════════════════════════════════════════════════════
// Shared buyer-feedback theme engine.
// Used by: MyListings.jsx (list row "top issue" chip), ListingWorkspace.jsx
// (Buyer Feedback tab, Seller Report). One implementation, not three --
// this file exists specifically so those three surfaces can never drift.
//
// Keyword-based, with an explicit positive-override check so common
// false positives ("great price", "loved the kitchen", "beautiful
// bedrooms") are NOT counted as objections. Best-effort / approximate --
// always label UI built from this as "based on feedback text."
// ═══════════════════════════════════════════════════════════════

export const THEME_DEFS = [
  { id:'price',     label:'Price too high',              negative:['too expensive','overpriced','over priced','price too high','too high','price is high','pricey','out of budget','above budget'],
                     positive:['great price','good price','priced right','fair price','price is right','well priced','reasonably priced','good value','great value'] },
  { id:'taxes',      label:'Taxes too high',              negative:['taxes too high','taxes are high','high taxes','tax burden'], positive:[] },
  { id:'negotiate',  label:'Wants to negotiate',          negative:['negotiate','room to negotiate','flexible on price','open to offers below','will they take'], positive:[] },
  { id:'size',       label:'Size too small',              negative:['too small','not enough space','feels small','felt small','smaller than expected','cramped','tight'], positive:['not too small'] },
  { id:'bedrooms',   label:'Needs more bedrooms',         negative:['need more bedroom','needs more bedroom','not enough bedroom','too few bedroom'], positive:[] },
  { id:'bathrooms',  label:'Needs more bathrooms',        negative:['need more bathroom','needs more bathroom','not enough bathroom','too few bathroom'], positive:[] },
  { id:'basement',   label:'Basement concern',            negative:['basement is small','basement issue','basement concern','unfinished basement','basement flood','basement damp','basement musty'], positive:['loved the basement','great basement','finished basement'] },
  { id:'condition',  label:'Needs updates / condition',   negative:['needs work','needs updating','needs updates','dated','outdated','needs renovation','run down','fixer'], positive:[] },
  { id:'layout',     label:'Layout concern',              negative:['awkward layout','layout issue','weird layout',"layout doesn't work","layout didn't work",'poor flow'], positive:['great layout','loved the layout','good flow'] },
  { id:'location',   label:'Location concern',            negative:['bad location','busy street','traffic noise','too far','location concern','far from'], positive:['great location','loved the location','perfect location'] },
  { id:'kitchen',    label:'Kitchen concern',              negative:['kitchen is small','kitchen issue','kitchen needs','dated kitchen','outdated kitchen'], positive:['loved the kitchen','great kitchen','beautiful kitchen'] },
  { id:'parking',    label:'Parking / driveway issue',    negative:['no parking','parking issue','driveway issue','street parking only','tight driveway','not enough parking'], positive:[] },
  { id:'positive',   label:'Positive feedback',            negative:['loved it','love it','great price','perfect','beautiful','stunning','would offer','we love','they loved'], positive:[] },
  { id:'second_showing', label:'Wants second showing',    negative:['second showing','come back','another showing','wants to see again','bring the family'], positive:[] },
  { id:'offer_coming',   label:'Offer coming / serious interest', negative:['offer coming','writing an offer','putting in an offer','submitting an offer','very interested','serious interest'], positive:[] },
]

export function detectThemes(text) {
  if (!text) return []
  const t = text.toLowerCase()
  const found = []
  for (const theme of THEME_DEFS) {
    const hasNegative = theme.negative.some(p => t.includes(p))
    if (!hasNegative) continue
    const hasPositiveOverride = theme.positive.some(p => t.includes(p))
    if (hasPositiveOverride && theme.id !== 'positive') continue
    found.push(theme.id)
  }
  return found
}

export const themeLabel = id => (THEME_DEFS.find(t => t.id === id) || {}).label || id

// Main (highest-priority) theme for a single showing's compact-row chip --
// prefers a concern/objection over a purely positive/momentum theme.
export function mainThemeFor(showing) {
  const text = [showing.feedback, showing.notes].filter(Boolean).join('. ')
  const ids = detectThemes(text)
  if (!ids.length) return null
  return ids.find(id => !['positive','second_showing','offer_coming'].includes(id)) || ids[0]
}

// Full theme summary across a set of showings, with up to 5 example
// quotes per theme, sorted by frequency.
export function buildThemeSummary(showings) {
  const counts = {}; const examples = {}
  ;(showings || []).forEach(s => {
    const text = [s.feedback, s.notes].filter(Boolean).join('. ')
    detectThemes(text).forEach(id => {
      counts[id] = (counts[id]||0) + 1
      if (!examples[id]) examples[id] = []
      if (examples[id].length < 5) examples[id].push({ text, buyer: s.buyer_name || 'Anonymous', date: s.showing_date })
    })
  })
  return THEME_DEFS
    .filter(t => counts[t.id] > 0)
    .map(t => ({ id: t.id, label: t.label, count: counts[t.id], examples: examples[t.id] }))
    .sort((a,b) => b.count - a.count)
}

// Buyer breakdown: unique buyers, interested/neutral/not-interested/no-feedback.
export function buildBuyerStats(showings) {
  const list = showings || []
  const total = list.length
  const uniqueBuyers = new Set(list.map(s => (s.buyer_name||'').trim().toLowerCase()).filter(Boolean)).size
  const withFeedback = list.filter(s => (s.feedback && s.feedback.trim()) || (s.notes && s.notes.trim())).length
  return {
    total, uniqueBuyers,
    interested: list.filter(s => (s.interest_level||3) >= 4).length,
    neutral: list.filter(s => (s.interest_level||3) === 3).length,
    notInterested: list.filter(s => (s.interest_level||3) <= 2).length,
    noFeedback: total - withFeedback,
  }
}
