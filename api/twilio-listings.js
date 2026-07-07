// TargetOS V2 — CRM Exclusive Listings Phone Search
// Step 1: Search by (1) Area  (2) Price  (3) Beds  (4) Baths  (5) Type
// All filters are optional — press 0 to skip any step.
// Only searches listings with ivr_enabled=true and status=Active.
'use strict'
const querystring = require('querystring')

const { getSupabase, say, wrap, BASE_URL } = require('./_lib/phone')

const BASE = BASE_URL + '/api/twilio-listings'

// ── ROCKLAND COUNTY AREAS ─────────────────────────────────────────
// These match what you'd type in the city/neighborhood field on the Listings board.
// Caller presses the number, it filters by city ILIKE %area%
const AREAS = {
  '1': { label:'Monsey',         value:'Monsey'         },
  '2': { label:'Suffern',        value:'Suffern'        },
  '3': { label:'Spring Valley',  value:'Spring Valley'  },
  '4': { label:'New City',       value:'New City'       },
  '5': { label:'Nanuet',         value:'Nanuet'         },
  '6': { label:'Airmont',        value:'Airmont'        },
  '7': { label:'Wesley Hills',   value:'Wesley Hills'   },
  '8': { label:'Pomona',         value:'Pomona'         },
  '9': { label:'Chestnut Ridge', value:'Chestnut Ridge' },
  '0': { label:'All areas',      value:null             },
}

const PRICE_RANGES = {
  '1': { min:0,       max:499999,   label:'under 500 thousand'        },
  '2': { min:500000,  max:749999,   label:'500 to 750 thousand'       },
  '3': { min:750000,  max:999999,   label:'750 thousand to 1 million' },
  '4': { min:1000000, max:1499999,  label:'1 to 1.5 million'          },
  '5': { min:1500000, max:1999999,  label:'1.5 to 2 million'          },
  '6': { min:2000000, max:99999999, label:'over 2 million'            },
  '0': { min:0,       max:99999999, label:'any price'                 },
}

const BED_MAP  = { '1':'1','2':'2','3':'3','4':'4','5':'5+','0':'any' }
const BATH_MAP = { '1':'1','2':'2','3':'3+','0':'any' }
const TYPE_MAP = { '1':'Single Family','2':'Condo','3':'Townhouse','4':'Multi Family','0':'any' }
const TYPE_LABELS = { '1':'Single Family','2':'Condo','3':'Townhouse','4':'Multi Family','0':'all types' }

function readListing(l, i, voice) {
  const price = l.list_price||l.price ? '$' + Number(l.list_price||l.price).toLocaleString() : 'price not listed'
  const addr  = [l.addr, l.city].filter(Boolean).join(', ') || 'address on file'
  const beds  = l.beds||l.bedrooms   ? (l.beds||l.bedrooms)   + ' bedroom' : ''
  const baths = l.baths||l.bathrooms ? (l.baths||l.bathrooms) + ' bathroom' : ''
  const type  = l.property_type || ''
  const desc  = [beds, baths, type].filter(Boolean).join(', ')
  return say('Listing ' + (i+1) + '. ' + addr + '. ' + (desc ? desc + '. ' : '') + 'Listed at ' + price + '.', voice)
}

function buildNextUrl(step, params) {
  const qs = Object.entries(params).filter(([,v])=>v!==undefined&&v!=='').map(([k,v])=>k+'='+encodeURIComponent(v)).join('&')
  return BASE + '?step=' + step + (qs?'&'+qs:'')
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')

  let body = {}
  try {
    const raw = await new Promise((ok,err)=>{ let d=''; req.on('data',c=>d+=c); req.on('end',()=>ok(d)); req.on('error',err) })
    body = querystring.parse(raw)
  } catch(e) { body = req.body||{} }

  const rawUrl = req.url||''
  const qp     = querystring.parse(rawUrl.includes('?') ? rawUrl.split('?')[1] : '')
  const digits = body.Digits||''
  const step   = qp.step  || 'intro'
  const voice  = qp.voice || 'Polly.Joanna'
  const maxRes = parseInt(qp.max||'5')||5

  // Carry filter state through URL params
  const areaKey  = qp.area  || ''
  const priceKey = qp.price || ''
  const bedsKey  = qp.beds  || ''
  const bathsKey = qp.baths || ''

  const base = { voice, max:maxRes }

  // ── INTRO ────────────────────────────────────────────────────────
  if (step === 'intro') {
    const intro = qp.intro ? decodeURIComponent(qp.intro) : 'Welcome to our exclusive listings search.'
    const nextUrl = buildNextUrl('area', base)
    return res.send(wrap(
      say(intro, voice) +
      '<Gather numDigits="1" action="' + nextUrl + '" method="POST" timeout="12">' +
        say('Search by area. Press 1 for Monsey. Press 2 for Suffern. Press 3 for Spring Valley. Press 4 for New City. Press 5 for Nanuet. Press 6 for Airmont. Press 7 for Wesley Hills. Press 8 for Pomona. Press 9 for Chestnut Ridge. Press 0 to search all areas.', voice) +
      '</Gather>' +
      say('We did not receive your input. Goodbye.', voice)
    ))
  }

  // ── AREA SELECTION ───────────────────────────────────────────────
  if (step === 'area') {
    const area = AREAS[digits]
    if (!area) {
      return res.send(wrap(
        '<Gather numDigits="1" action="' + buildNextUrl('area', base) + '" method="POST" timeout="10">' +
          say('Press 1 through 9 for an area, or 0 for all areas.', voice) +
        '</Gather>' + say('Goodbye.', voice)
      ))
    }
    const nextUrl = buildNextUrl('price', { ...base, area: digits })
    return res.send(wrap(
      '<Gather numDigits="1" action="' + nextUrl + '" method="POST" timeout="12">' +
        say('You selected ' + area.label + '. Now select a price range. Press 1 for under 500 thousand. Press 2 for 500 to 750 thousand. Press 3 for 750 thousand to 1 million. Press 4 for 1 to 1.5 million. Press 5 for 1.5 to 2 million. Press 6 for over 2 million. Press 0 for any price.', voice) +
      '</Gather>' + say('Goodbye.', voice)
    ))
  }

  // ── PRICE SELECTION ──────────────────────────────────────────────
  if (step === 'price') {
    const range = PRICE_RANGES[digits]
    if (!range) {
      return res.send(wrap(
        '<Gather numDigits="1" action="' + buildNextUrl('price', { ...base, area: areaKey }) + '" method="POST" timeout="10">' +
          say('Press 1 through 6 for a price range, or 0 for any price.', voice) +
        '</Gather>' + say('Goodbye.', voice)
      ))
    }
    const nextUrl = buildNextUrl('beds', { ...base, area: areaKey, price: digits })
    return res.send(wrap(
      '<Gather numDigits="1" action="' + nextUrl + '" method="POST" timeout="12">' +
        say('You selected ' + range.label + '. Now press a number for bedrooms. 1 for 1 bedroom. 2 for 2. 3 for 3. 4 for 4. 5 for 5 or more. Press 0 for any.', voice) +
      '</Gather>' + say('Goodbye.', voice)
    ))
  }

  // ── BEDROOM SELECTION ────────────────────────────────────────────
  if (step === 'beds') {
    if (!BED_MAP[digits]) {
      return res.send(wrap(
        '<Gather numDigits="1" action="' + buildNextUrl('beds', { ...base, area: areaKey, price: priceKey }) + '" method="POST" timeout="10">' +
          say('Press 1 through 5 for bedrooms, or 0 for any.', voice) +
        '</Gather>' + say('Goodbye.', voice)
      ))
    }
    const nextUrl = buildNextUrl('baths', { ...base, area: areaKey, price: priceKey, beds: digits })
    return res.send(wrap(
      '<Gather numDigits="1" action="' + nextUrl + '" method="POST" timeout="12">' +
        say('Press 1 for 1 bathroom. 2 for 2. 3 for 3 or more. Press 0 to skip.', voice) +
      '</Gather>' + say('Goodbye.', voice)
    ))
  }

  // ── BATHROOM SELECTION ───────────────────────────────────────────
  if (step === 'baths') {
    if (!BATH_MAP[digits]) {
      return res.send(wrap(
        '<Gather numDigits="1" action="' + buildNextUrl('baths', { ...base, area: areaKey, price: priceKey, beds: bedsKey }) + '" method="POST" timeout="10">' +
          say('Press 1, 2, 3, or 0 to skip.', voice) +
        '</Gather>' + say('Goodbye.', voice)
      ))
    }
    const nextUrl = buildNextUrl('type', { ...base, area: areaKey, price: priceKey, beds: bedsKey, baths: digits })
    return res.send(wrap(
      '<Gather numDigits="1" action="' + nextUrl + '" method="POST" timeout="12">' +
        say('Press 1 for Single Family. 2 for Condo. 3 for Townhouse. 4 for Multi Family. Press 0 for all types.', voice) +
      '</Gather>' + say('Goodbye.', voice)
    ))
  }

  // ── PROPERTY TYPE → SEARCH ───────────────────────────────────────
  if (step === 'type') {
    if (!TYPE_MAP[digits]) {
      return res.send(wrap(
        '<Gather numDigits="1" action="' + buildNextUrl('type', { ...base, area: areaKey, price: priceKey, beds: bedsKey, baths: bathsKey }) + '" method="POST" timeout="10">' +
          say('Press 1 Single Family, 2 Condo, 3 Townhouse, 4 Multi Family, or 0 for all.', voice) +
        '</Gather>' + say('Goodbye.', voice)
      ))
    }

    const supabase = getSupabase()
    if (!supabase) return res.send(wrap(say('Search is temporarily unavailable. Please call back shortly.', voice)))

    try {
      let q = supabase.from('listings').select('addr,city,list_price,price,beds,bedrooms,baths,bathrooms,property_type')
        .eq('status','Active').eq('ivr_enabled', true)

      // Area filter
      const area = AREAS[areaKey]
      if (area?.value) q = q.ilike('city', '%' + area.value + '%')

      // Price filter
      const range = PRICE_RANGES[priceKey]
      if (range && priceKey !== '0') q = q.gte('list_price', range.min).lte('list_price', range.max)

      // Beds filter
      const beds = BED_MAP[bedsKey]
      if (beds && bedsKey !== '0') {
        if (beds === '5+') q = q.gte('beds', 5)
        else q = q.eq('beds', parseInt(beds))
      }

      // Baths filter
      const baths = BATH_MAP[bathsKey]
      if (baths && bathsKey !== '0') {
        if (baths === '3+') q = q.gte('baths', 3)
        else q = q.eq('baths', parseInt(baths))
      }

      // Type filter
      const type = TYPE_MAP[digits]
      if (type && digits !== '0') q = q.eq('property_type', type)

      q = q.order('list_price', { ascending: true }).limit(maxRes)
      const { data: results, error } = await q
      if (error) throw error

      // Build a human-readable summary of what was searched
      const parts = []
      if (area?.value) parts.push('in ' + area.label)
      if (range && priceKey !== '0') parts.push(range.label)
      if (beds && bedsKey !== '0') parts.push(beds + ' bed')
      if (baths && bathsKey !== '0') parts.push(baths + ' bath')
      if (type && digits !== '0') parts.push(TYPE_LABELS[digits])
      const summary = parts.length ? parts.join(', ') : ''

      if (!results || results.length === 0) {
        const restartUrl = buildNextUrl('intro', base)
        return res.send(wrap(
          say('We found no available listings' + (summary ? ' matching ' + summary : '') + '. ', voice) +
          '<Gather numDigits="1" action="' + restartUrl + '" method="GET" timeout="10">' +
            say('Press 1 to search again with different filters. Press 2 to speak with an agent.', voice) +
          '</Gather>' +
          say('Thank you for calling. Goodbye.', voice)
        ))
      }

      let twiml = say('We found ' + results.length + ' exclusive listing' + (results.length > 1 ? 's' : '') + (summary ? ' matching ' + summary : '') + '. Here they are.', voice)
      results.forEach((l, i) => { twiml += readListing(l, i, voice) })

      const followUrl = buildNextUrl('followup', base)
      twiml += '<Gather numDigits="1" action="' + followUrl + '" method="GET" timeout="15">' +
        say('Press 1 to search again. Press 2 to speak with an agent. Press 9 to leave a voicemail. Press star to end the call.', voice) +
      '</Gather>'
      twiml += say('Thank you for calling. Goodbye.', voice)
      return res.send(wrap(twiml))

    } catch(e) {
      console.error('Listings search error:', e.message)
      return res.send(wrap(say('We encountered an error searching listings. Please try again or press 0 to speak with an agent.', voice)))
    }
  }

  // ── FOLLOWUP ────────────────────────────────────────────────────
  if (step === 'followup') {
    if (digits === '1') return res.send(wrap('<Redirect method="GET">' + buildNextUrl('intro', base) + '</Redirect>'))
    if (digits === '9') return res.send(wrap(say('Please leave a message after the tone.', voice) + '<Record maxLength="120" transcribe="true" transcribeCallback="' + BASE_URL + '/api/twilio-voicemail" />'))
    if (digits === '*') return res.send(wrap(say('Thank you for calling Target Team. Goodbye.', voice) + '<Hangup />'))
    // Press 2 or anything else → connect to agent
    return res.send(wrap(say('Connecting you to an agent. Please hold.', voice) + '<Redirect method="POST">' + BASE_URL + '/api/twilio-inbound</Redirect>'))
  }

  return res.send(wrap(say('Thank you for calling. Goodbye.', voice) + '<Hangup />'))
}
