// TargetOS — MLS search proxy (MLS Grid RESO Web API v2)
// Keeps the MLS Grid access token SERVER-SIDE (never in the browser
// bundle — the old SimplyRETS wiring exposed creds via VITE_ vars).
// Normalizes RESO records to the listing shape MLSSearch.jsx already
// renders (SimplyRETS-ish), so the UI needed no rewrite.
//
// Env (Vercel):
//   MLSGRID_BASE   e.g. https://api-demo.mlsgrid.com/v2   (demo)
//                       https://api.mlsgrid.com/v2        (production)
//   MLSGRID_TOKEN  access token from MLS Grid
//   MLSGRID_ORIGINATING_SYSTEM  optional; REQUIRED by MLS Grid in
//     production (e.g. 'onekey'); demo data works without it.
//
// Query params (same names the UI already sends):
//   cities, type, minprice, maxprice, minbeds, q, limit, offset(skip),
//   next (an @odata.nextLink URL for paging — passed through verbatim
//   but only honored if it points at MLSGRID_BASE)
'use strict'

function esc(s) { return String(s).replace(/'/g, "''") }

function normalize(rec) {
  const media = Array.isArray(rec.Media) ? rec.Media : []
  const photos = media
    .filter(m => !m.MediaCategory || /photo|image/i.test(m.MediaCategory))
    .sort((a, b) => (a.Order || 0) - (b.Order || 0))
    .map(m => m.MediaURL)
    .filter(Boolean)
  // Split UnparsedAddress ("123 Main St, Monsey, NY 10952") as a
  // fallback when parsed fields are absent.
  const unparsed = rec.UnparsedAddress || ''
  return {
    mlsId: rec.ListingId || rec.ListingKey || '',
    listPrice: rec.ListPrice || null,
    listDate: rec.OnMarketDate || rec.ListingContractDate || null,
    remarks: rec.PublicRemarks || '',
    photos,
    address: {
      streetNumber: rec.StreetNumber || '',
      streetName: [rec.StreetName, rec.StreetSuffix].filter(Boolean).join(' ') || (unparsed.split(',')[0] || ''),
      unit: rec.UnitNumber || '',
      city: rec.City || (unparsed.split(',')[1] || '').trim(),
      state: rec.StateOrProvince || 'NY',
      postalCode: rec.PostalCode || '',
      county: rec.CountyOrParish || '',
    },
    property: {
      bedrooms: rec.BedroomsTotal ?? null,
      bathsFull: rec.BathroomsFull ?? rec.BathroomsTotalInteger ?? null,
      area: rec.LivingArea || rec.BuildingAreaTotal || null,
      type: rec.PropertySubType || rec.PropertyType || '',
      yearBuilt: rec.YearBuilt || null,
      garageSpaces: rec.GarageSpaces || null,
      lotSizeAcres: rec.LotSizeAcres || null,
      lotSizeSqft: rec.LotSizeSquareFeet || null,
      stories: rec.StoriesTotal || null,
      heating: Array.isArray(rec.Heating) ? rec.Heating.join(', ') : rec.Heating || '',
      cooling: Array.isArray(rec.Cooling) ? rec.Cooling.join(', ') : rec.Cooling || '',
    },
    tax: {
      annualAmount: rec.TaxAnnualAmount || null,
      assessedValue: rec.TaxAssessedValue || null,
      year: rec.TaxYear || null,
      parcelNumber: rec.ParcelNumber || '',
      lot: rec.TaxLot || '',
      block: rec.TaxBlock || '',
    },
    zoning: rec.Zoning || rec.ZoningDescription || '',
    hoa: { fee: rec.AssociationFee || null, frequency: rec.AssociationFeeFrequency || '' },
    daysOnMarket: rec.DaysOnMarket ?? null,
    mls: { status: rec.StandardStatus || rec.MlsStatus || 'Active' },
    school: { district: rec.HighSchoolDistrict || rec.ElementarySchoolDistrict || '' },
    agent: { firstName: rec.ListAgentFirstName || '', lastName: rec.ListAgentLastName || '' },
    office: { name: rec.ListOfficeName || '' },
    geo: { lat: rec.Latitude || null, lng: rec.Longitude || null },
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'GET') return res.status(405).end(JSON.stringify({ error: 'GET only' }))

  // Staged auth (same pattern as the other endpoints)
  const { requireUser } = require('./_lib/auth')
  const user = await requireUser(req)
  if (!user) {
    if (String(process.env.AUTH_ENFORCE || '').toLowerCase() === 'true') {
      return res.status(401).end(JSON.stringify({ error: 'unauthorized' }))
    }
    console.warn('[AUTH] unauthenticated call to /api/mls-search ALLOWED (log-only)')
  }

  const BASE  = (process.env.MLSGRID_BASE || '').replace(/\/$/, '')
  const TOKEN = process.env.MLSGRID_TOKEN
  if (!BASE || !TOKEN) {
    return res.status(500).end(JSON.stringify({ error: 'MLS not configured (MLSGRID_BASE / MLSGRID_TOKEN missing)' }))
  }

  // Feature flag: admin kill switch + per-agent allowlist, enforced
  // server-side so hiding the UI is not the only line of defense.
  // Fail-open on infrastructure errors (missing table), fail-closed
  // on an explicit OFF or allowlist exclusion.
  try {
    const { getSupabase } = require('./_lib/phone')
    const sb = getSupabase()
    if (sb) {
      const { data: flag } = await sb.from('feature_flags').select('*').eq('key', 'mls_search').maybeSingle()
      if (flag) {
        let agentRow = null
        if (user) {
          const { data } = await sb.from('agents').select('id,role').eq('auth_user_id', user.id).maybeSingle()
          agentRow = data
        }
        const isAdminCaller = agentRow?.role === 'admin'
        if (!isAdminCaller) {
          if (!flag.enabled) return res.status(403).end(JSON.stringify({ error: 'MLS Search is disabled by your administrator' }))
          const allow = Array.isArray(flag.allowed_agent_ids) ? flag.allowed_agent_ids : []
          if (allow.length > 0 && (!agentRow || !allow.includes(agentRow.id))) {
            return res.status(403).end(JSON.stringify({ error: 'MLS Search is not enabled for your account' }))
          }
        }
      }
    }
  } catch (e) { console.warn('[MLS] flag check skipped:', e.message) }

  const q = req.query || {}
  let url

  // Paging via @odata.nextLink — only follow links to our own base.
  if (q.next && String(q.next).startsWith(BASE)) {
    url = String(q.next)
  } else {
    const filters = ["StandardStatus eq 'Active'", 'MlgCanView eq true']
    const originating = process.env.MLSGRID_ORIGINATING_SYSTEM
    if (originating) filters.push("OriginatingSystemName eq '" + esc(originating) + "'")
    if (q.cities)   filters.push("City eq '" + esc(q.cities) + "'")
    if (q.minprice) filters.push('ListPrice ge ' + parseInt(q.minprice, 10))
    if (q.maxprice) filters.push('ListPrice le ' + parseInt(q.maxprice, 10))
    if (q.minbeds)  filters.push('BedroomsTotal ge ' + parseInt(q.minbeds, 10))
    if (q.minbaths) filters.push('BathroomsTotalInteger ge ' + parseInt(q.minbaths, 10))
    if (q.minsqft)  filters.push('LivingArea ge ' + parseInt(q.minsqft, 10))
    if (q.maxsqft)  filters.push('LivingArea le ' + parseInt(q.maxsqft, 10))
    if (q.minyear)  filters.push('YearBuilt ge ' + parseInt(q.minyear, 10))
    if (q.maxdom)   filters.push('DaysOnMarket le ' + parseInt(q.maxdom, 10))
    if (q.type)     filters.push("PropertyType eq '" + esc(q.type) + "'")
    // Map / draw-an-area search: bounding box on coordinates. The
    // client refines circles/polygons precisely; this narrows upstream.
    if (q.latmin && q.latmax && q.lngmin && q.lngmax) {
      filters.push('Latitude ge ' + parseFloat(q.latmin), 'Latitude le ' + parseFloat(q.latmax),
                   'Longitude ge ' + parseFloat(q.lngmin), 'Longitude le ' + parseFloat(q.lngmax))
    }
    // Free-text: match MLS number exactly, else search address
    if (q.q) {
      const term = esc(q.q)
      if (/^[A-Za-z0-9-]+$/.test(q.q) && /\d/.test(q.q)) {
        filters.push("(ListingId eq '" + term + "' or contains(UnparsedAddress,'" + term + "'))")
      } else {
        filters.push("contains(UnparsedAddress,'" + term + "')")
      }
    }
    const limit = Math.min(parseInt(q.limit, 10) || 25, 100)
    const params = new URLSearchParams()
    params.set('$filter', filters.join(' and '))
    params.set('$top', String(limit))
    params.set('$expand', 'Media')
    params.set('$orderby', 'ModificationTimestamp desc')
    url = BASE + '/Property?' + params.toString()
  }

  try {
    const r = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + TOKEN, 'Accept': 'application/json' },
    })
    const text = await r.text()
    if (!r.ok) {
      console.warn('[MLS] upstream', r.status, text.slice(0, 300))
      return res.status(502).end(JSON.stringify({ error: 'MLS API returned ' + r.status }))
    }
    const data = JSON.parse(text)
    const records = Array.isArray(data.value) ? data.value : []
    return res.status(200).end(JSON.stringify({
      listings: records.map(normalize),
      total: data['@odata.count'] ?? null,
      next: data['@odata.nextLink'] || null,
    }))
  } catch (e) {
    console.error('[MLS] fetch failed:', e.message)
    return res.status(502).end(JSON.stringify({ error: 'MLS fetch failed: ' + e.message }))
  }
}
