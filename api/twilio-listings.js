// TargetOS V2 — CRM Exclusive Listings Phone Search
// Simplified per business request (July 2026): caller picks ONE
// search method (area, price, or bedroom count) -- not a forced
// sequence through area+price+beds+baths+type. Bathroom and property
// type filtering removed entirely. Area list is built dynamically from
// whatever cities actually have ivr_enabled listings right now, rather
// than a hardcoded list that could drift out of sync with real data.
// Only searches listings with ivr_enabled=true and status=Active.
'use strict'
const querystring = require('querystring')

const { getSupabase, say, wrap, esc, BASE_URL, checkTwilioSignature, logCallEvent } = require('./_lib/phone')
const { walkFlow, ensureFlow } = require('./_lib/call-flow')

// Connects the caller directly to the round-robin agent pool, by
// jumping straight to the roundrobin node in the saved flow -- rather
// than redirecting to /api/twilio-inbound, which restarts the ENTIRE
// call flow from its very first node (the main greeting/menu). That
// redirect said "Connecting you with our team" but the caller would
// just hear the whole intro again, never actually reaching an agent --
// which is exactly what felt like "looping back to the beginning."
async function connectToAnyAgent(res, voice, callData, prefixMessage) {
  const sb = getSupabase()
  if (!sb) return res.send(wrap(say('Connection error. Please call back.', voice)))
  const prefix = prefixMessage ? say(prefixMessage, voice) : ''
  try {
    const { nodes, edges } = await ensureFlow(sb)
    const rrNode = nodes.find(n => n.type === 'roundrobin')
    if (rrNode) {
      const agentIds = rrNode.config?.agent_ids || []
      await logCallEvent(sb, callData.callSid, 'roundrobin_dial_attempt', agentIds.length + ' agent(s) configured in round-robin pool')
      const twiml = await walkFlow(nodes, edges, rrNode.id, callData, sb, 0)
      return res.send(wrap(prefix + twiml))
    }
    console.warn('[twilio-listings] no roundrobin node in saved flow, falling back to voicemail')
    await logCallEvent(sb, callData.callSid, 'voicemail_fallback', 'Saved call flow has no round-robin node at all')
  } catch(e) {
    console.warn('[twilio-listings] connectToAnyAgent failed:', e.message)
    await logCallEvent(sb, callData.callSid, 'voicemail_fallback', 'Error: ' + e.message)
  }
  // Genuine fallback if the flow has no roundrobin node at all (not
  // the everyday case, but must never leave the caller with nothing)
  return res.send(wrap(
    prefix +
    say('Please leave a message after the tone.', voice) +
    '<Record maxLength="120" transcribe="true" transcribeCallback="' + esc(BASE_URL + '/api/twilio-voicemail') + '" />'
  ))
}

const BASE = BASE_URL + '/api/twilio-listings'

const DEFAULT_INTRO = 'Welcome to our exclusive listings search. Search by area, price, bedrooms, and bathrooms.'
const DEFAULT_PRICE_RANGES = {
  '1': { min:0,       max:499999,   label:'under 500 thousand'        },
  '2': { min:500000,  max:749999,   label:'500 to 750 thousand'       },
  '3': { min:750000,  max:999999,   label:'750 thousand to 1 million' },
  '4': { min:1000000, max:1499999,  label:'1 to 1.5 million'          },
  '5': { min:1500000, max:1999999,  label:'1.5 to 2 million'          },
  '6': { min:2000000, max:99999999, label:'over 2 million'            },
}

const DEFAULT_AREAS = [
  'Monsey', 'Suffern', 'Spring Valley', 'New City', 'Nanuet', 'Airmont',
  'Wesley Hills', 'Pomona', 'Chestnut Ridge', 'Haverstraw', 'Congers',
  'Stony Point', 'Swan Lake', 'Monticello', 'Mountain Dale', 'Sloatsburg',
  'Tappan', 'Nyack', 'Valley Cottage', 'West Nyack', 'Orangeburg', 'Pearl River',
]
const DEFAULT_BED_MAP = { '1':'1','2':'2','3':'3','4':'4','5':'5+' }

// Admin-customizable via Calls & SMS -> Listings Search Settings.
// Falls back to the defaults above if the settings table/row doesn't
// exist yet, or the query fails for any reason -- customization is a
// nice-to-have, never something that should be able to break the
// live phone search.
async function loadListingsSettings() {
  try {
    const supabase = getSupabase()
    if (!supabase) return { intro: DEFAULT_INTRO, priceRanges: DEFAULT_PRICE_RANGES, areas: DEFAULT_AREAS, bedMap: DEFAULT_BED_MAP }
    const { data } = await supabase.from('listings_ivr_settings').select('*').eq('id', 1).maybeSingle()
    if (!data) return { intro: DEFAULT_INTRO, priceRanges: DEFAULT_PRICE_RANGES, areas: DEFAULT_AREAS, bedMap: DEFAULT_BED_MAP }
    const priceRanges = {}
    ;(data.price_ranges || []).forEach((r, i) => { priceRanges[String(i + 1)] = r })
    const bedMap = {}
    ;(data.bed_options || []).forEach(b => { bedMap[b.digit] = b.label })
    return {
      intro: data.intro_text || DEFAULT_INTRO,
      priceRanges: Object.keys(priceRanges).length ? priceRanges : DEFAULT_PRICE_RANGES,
      areas: (data.areas && data.areas.length) ? data.areas : DEFAULT_AREAS,
      bedMap: Object.keys(bedMap).length ? bedMap : DEFAULT_BED_MAP,
    }
  } catch(e) {
    console.warn('[twilio-listings] loadListingsSettings failed, using defaults:', e.message)
    return { intro: DEFAULT_INTRO, priceRanges: DEFAULT_PRICE_RANGES, areas: DEFAULT_AREAS, bedMap: DEFAULT_BED_MAP }
  }
}

// City data lives inside the free-text addr field (e.g. "...Spring
// Valley, NY 10977"), not reliably in a separate city column -- most
// existing listings have city=NULL. Matching against a known list
// of local areas (customizable, see DEFAULT_AREAS), rather than
// trying to regex-parse city out of addr (which has too many
// inconsistent formats: sometimes comma-separated, sometimes not;
// "NY" vs "New York"; unit numbers interspersed).

function readListing(l, i, voice) {
  const price = l.list_price ? '$' + Number(l.list_price).toLocaleString() : 'price not listed'
  const addr  = [l.addr, l.city].filter(Boolean).join(', ') || 'address on file'
  const beds  = l.beds  ? l.beds  + ' bedroom' : ''
  const baths = l.baths ? l.baths + ' bathroom' : ''
  const type  = l.property_type || ''
  const sqft  = l.sqft ? Number(l.sqft).toLocaleString() + ' square feet' : ''
  const desc  = [beds, baths, type, sqft].filter(Boolean).join(', ')
  return say('Listing ' + (i+1) + '. ' + addr + '. ' + (desc ? desc + '. ' : '') + 'Listed at ' + price + '.', voice)
}

function buildNextUrl(step, params) {
  const qs = Object.entries(params).filter(([,v])=>v!==undefined&&v!=='').map(([k,v])=>k+'='+encodeURIComponent(v)).join('&')
  return BASE + '?step=' + step + (qs?'&'+qs:'')
}

// Runs the actual search + reads results, given a single filter.
// Shared by all 3 search methods so there's one search implementation,
// not three near-duplicates.
async function runSearch(res, voice, maxRes, base, filterFn, summaryLabel) {
  const supabase = getSupabase()
  if (!supabase) return res.send(wrap(say('Search is temporarily unavailable. Please call back shortly.', voice)))

  try {
    let q = supabase.from('listings').select('addr,city,list_price,beds,baths,property_type,sqft,agent_id')
      .eq('status', 'Active').eq('ivr_enabled', true)
    q = filterFn(q)
    q = q.order('list_price', { ascending: true }).limit(maxRes)
    const { data: results, error } = await q
    if (error) throw error

    if (!results || results.length === 0) {
      const restartUrl = buildNextUrl('intro', base)
      return res.send(wrap(
        say('We found no available listings' + (summaryLabel ? ' ' + summaryLabel : '') + '.', voice) +
        '<Gather numDigits="1" action="' + esc(restartUrl) + '" method="GET" timeout="10">' +
          say('Press 1 to search again. Press 2 to speak with an agent.', voice) +
        '</Gather>' +
        say('Thank you for calling. Goodbye.', voice)
      ))
    }

    let twiml = say('We found ' + results.length + ' exclusive listing' + (results.length > 1 ? 's' : '') + (summaryLabel ? ' ' + summaryLabel : '') + '. Here they are.', voice)
    results.forEach((l, i) => { twiml += readListing(l, i, voice) })

    // Encode each listing's agent_id + addr so the followup step can
    // connect the caller directly to that listing's agent, with a
    // whisper telling the agent which listing the caller is asking
    // about (see twilio-recording-notice.js).
    const listingRefs = results.map(l => (l.agent_id || '') + '~' + (l.addr || '')).join('|')
    const followUrl = buildNextUrl('followup', { ...base, listings: listingRefs })
    const connectOptions = results.map((l, i) => 'Press ' + (i + 1) + ' to connect about listing ' + (i + 1) + '.').join(' ')
    twiml += '<Gather numDigits="1" action="' + esc(followUrl) + '" method="GET" timeout="15">' +
      say(connectOptions + ' Press 6 to search again. Press 7 to speak with any agent. Press 9 to leave a voicemail. Press star to end the call.', voice) +
    '</Gather>'
    twiml += say('Thank you for calling. Goodbye.', voice)
    return res.send(wrap(twiml))
  } catch(e) {
    console.error('Listings search error:', e.message)
    return res.send(wrap(say('We encountered an error searching listings. Please try again or press 0 to speak with an agent.', voice)))
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')

  let body = {}
  try {
    const raw = await new Promise((ok,err)=>{ let d=''; req.on('data',c=>d+=c); req.on('end',()=>ok(d)); req.on('error',err) })
    body = querystring.parse(raw)
  } catch(e) { body = req.body||{} }
  if (!checkTwilioSignature(req, res, body, 'twilio-listings')) return

  const rawUrl = req.url||''
  const qp     = querystring.parse(rawUrl.includes('?') ? rawUrl.split('?')[1] : '')
  const digits = body.Digits||''
  const step   = qp.step  || 'intro'
  const voice  = qp.voice || 'Polly.Joanna'
  const maxRes = parseInt(qp.max||'5')||5
  const base   = { voice, max: maxRes }
  const callData = { from: body.From||'', to: body.To||'', callSid: body.CallSid||'', callId: null, contact: null, isRepeat: false }
  // Unconditional diagnostic: log every single hit to this endpoint,
  // no matter the step or outcome, so it's possible to see exactly
  // which steps a real call actually reached without guessing.
  await logCallEvent(getSupabase(), callData.callSid, 'listings_step_' + step, 'digits=' + JSON.stringify(digits) + ' callSid=' + callData.callSid)

  // ── INTRO — choose ONE search method ─────────────────────────────
  if (step === 'intro') {
    const settings = await loadListingsSettings()
    const intro = qp.intro ? decodeURIComponent(qp.intro) : settings.intro
    const nextUrl = buildNextUrl('method', base)
    return res.send(wrap(
      say(intro, voice) +
      '<Gather numDigits="1" action="' + esc(nextUrl) + '" method="POST" timeout="12">' +
        say('Press 1 to search by area. Press 2 to search by price. Press 3 to search by bedroom count.', voice) +
      '</Gather>' +
      say('We did not receive your input. Goodbye.', voice)
    ))
  }

  // ── METHOD CHOICE ─────────────────────────────────────────────────
  if (step === 'method') {
    if (digits === '1') {
      await logCallEvent(getSupabase(), callData.callSid, 'method_selected', 'Search by area')
      // Build the area list from real addr text, matched against
      // admin-customizable local areas (city column is mostly NULL
      // in real data).
      const supabase = getSupabase()
      if (!supabase) return res.send(wrap(say('Search is temporarily unavailable. Please call back shortly.', voice)))
      const settings = await loadListingsSettings()
      const { data: rows } = await supabase.from('listings').select('addr')
        .eq('status', 'Active').eq('ivr_enabled', true)
      const addrs = (rows || []).map(r => (r.addr || '').toLowerCase())
      const cities = settings.areas.filter(area =>
        addrs.some(a => a.includes(area.toLowerCase()))
      ).slice(0, 9)

      if (!cities.length) {
        return connectToAnyAgent(res, voice, callData, 'No areas are currently available to search. Connecting you to an agent. Please hold.')
      }
      const nextUrl = buildNextUrl('area', { ...base, cities: cities.join('|') })
      const optionsText = cities.map((c, i) => 'Press ' + (i + 1) + ' for ' + c + '.').join(' ')
      return res.send(wrap(
        '<Gather numDigits="1" action="' + esc(nextUrl) + '" method="POST" timeout="12">' +
          say('Choose an area. ' + optionsText, voice) +
        '</Gather>' + say('Goodbye.', voice)
      ))
    }
    if (digits === '2') {
      await logCallEvent(getSupabase(), callData.callSid, 'method_selected', 'Search by price')
      const settings = await loadListingsSettings()
      const nextUrl = buildNextUrl('price', base)
      const optionsText = Object.entries(settings.priceRanges).map(([k, r]) => 'Press ' + k + ' for ' + r.label + '.').join(' ')
      return res.send(wrap(
        '<Gather numDigits="1" action="' + esc(nextUrl) + '" method="POST" timeout="12">' +
          say('Choose a price range. ' + optionsText, voice) +
        '</Gather>' + say('Goodbye.', voice)
      ))
    }
    if (digits === '3') {
      await logCallEvent(getSupabase(), callData.callSid, 'method_selected', 'Search by bedroom count')
      const settings = await loadListingsSettings()
      const nextUrl = buildNextUrl('beds', base)
      const bedOptionsText = Object.entries(settings.bedMap).map(([k, label]) => k + ' for ' + label).join('. ')
      return res.send(wrap(
        '<Gather numDigits="1" action="' + esc(nextUrl) + '" method="POST" timeout="12">' +
          say('Choose a bedroom count. Press ' + bedOptionsText + '.', voice) +
        '</Gather>' + say('Goodbye.', voice)
      ))
    }
    // Invalid digit — retry
    return res.send(wrap(
      '<Gather numDigits="1" action="' + esc(buildNextUrl('method', base)) + '" method="POST" timeout="10">' +
        say('Press 1 for area. Press 2 for price. Press 3 for bedrooms.', voice) +
      '</Gather>' + say('Goodbye.', voice)
    ))
  }

  // ── AREA → SEARCH ──────────────────────────────────────────────────
  if (step === 'area') {
    const cities = (qp.cities || '').split('|').filter(Boolean)
    const city = cities[parseInt(digits) - 1]
    if (!city) {
      return res.send(wrap(
        '<Gather numDigits="1" action="' + esc(buildNextUrl('area', { ...base, cities: qp.cities })) + '" method="POST" timeout="10">' +
          say('Press 1 through ' + cities.length + ' for an area.', voice) +
        '</Gather>' + say('Goodbye.', voice)
      ))
    }
    await logCallEvent(getSupabase(), callData.callSid, 'area_selected', city)
    return runSearch(res, voice, maxRes, base, q => q.ilike('addr', '%' + city + '%'), 'in ' + city)
  }

  // ── PRICE → SEARCH ─────────────────────────────────────────────────
  if (step === 'price') {
    const settings = await loadListingsSettings()
    const range = settings.priceRanges[digits]
    if (!range) {
      return res.send(wrap(
        '<Gather numDigits="1" action="' + esc(buildNextUrl('price', base)) + '" method="POST" timeout="10">' +
          say('Press 1 through 6 for a price range.', voice) +
        '</Gather>' + say('Goodbye.', voice)
      ))
    }
    await logCallEvent(getSupabase(), callData.callSid, 'price_selected', range.label)
    return runSearch(res, voice, maxRes, base, q => q.gte('list_price', range.min).lte('list_price', range.max), range.label)
  }

  // ── BEDROOMS → SEARCH ──────────────────────────────────────────────
  if (step === 'beds') {
    const settings = await loadListingsSettings()
    const beds = settings.bedMap[digits]
    if (!beds) {
      return res.send(wrap(
        '<Gather numDigits="1" action="' + esc(buildNextUrl('beds', base)) + '" method="POST" timeout="10">' +
          say('Press 1 through 5 for bedrooms.', voice) +
        '</Gather>' + say('Goodbye.', voice)
      ))
    }
    await logCallEvent(getSupabase(), callData.callSid, 'beds_selected', beds + ' bedrooms')
    const filterFn = beds === '5+' ? (q => q.gte('beds', 5)) : (q => q.eq('beds', parseInt(beds)))
    return runSearch(res, voice, maxRes, base, filterFn, 'with ' + beds + ' bedrooms')
  }

  // ── FOLLOWUP ────────────────────────────────────────────────────
  if (step === 'followup') {
    const listingRefs = (qp.listings || '').split('|').map(s => {
      const [agentId, addr] = s.split('~')
      return { agentId, addr }
    })
    const chosen = listingRefs[parseInt(digits) - 1]

    // Digit 1-5 (whichever listings actually exist): connect to that
    // specific listing's agent, with a whisper telling them what the
    // call is about before they pick up.
    if (chosen) {
      await logCallEvent(getSupabase(), callData.callSid, 'listing_selected', chosen.addr || '(address unknown)')
      if (chosen.agentId) {
        const supabase = getSupabase()
        try {
          const { data: agent } = await supabase.from('agents').select('phone, name').eq('id', chosen.agentId).maybeSingle()
          if (agent?.phone) {
            await logCallEvent(getSupabase(), callData.callSid, 'routed_to_assigned_agent', 'Assigned agent: ' + (agent.name || chosen.agentId) + ' — dialing ' + agent.phone)
            const whisperUrl = BASE_URL + '/api/twilio-recording-notice?context=listing&addr=' + encodeURIComponent(chosen.addr || '')
            return res.send(wrap(
              say('Connecting you about ' + (chosen.addr || 'that listing') + '. Please hold.', voice) +
              '<Dial callerId="' + esc(callData.from || callData.to) + '" record="record-from-answer" timeout="20">' +
                '<Number url="' + esc(whisperUrl) + '">' + esc(agent.phone) + '</Number>' +
              '</Dial>' +
              say('That agent is unavailable. Please leave a message after the tone.', voice) +
              '<Record maxLength="120" transcribe="true" transcribeCallback="' + esc(BASE_URL + '/api/twilio-voicemail') + '" />'
            ))
          }
          await logCallEvent(getSupabase(), callData.callSid, 'assigned_agent_lookup_failed', 'Agent id ' + chosen.agentId + ' has no phone number on file')
        } catch(e) {
          console.warn('[twilio-listings] agent lookup failed:', e.message)
          await logCallEvent(getSupabase(), callData.callSid, 'assigned_agent_lookup_failed', e.message)
        }
      } else {
        await logCallEvent(getSupabase(), callData.callSid, 'no_agent_assigned', 'Listing has no agent_id set: ' + (chosen.addr || ''))
      }
      // Reaches here if: no agentId on this listing at all, the agent
      // lookup failed, or that agent has no phone on file. Say so
      // explicitly instead of silently falling through to the general
      // agent-connect path below, which felt like an unexplained loop
      // back to the start of the call.
      await logCallEvent(getSupabase(), callData.callSid, 'routed_to_roundrobin', 'Falling back to round-robin pool')
      return connectToAnyAgent(res, voice, callData,
        'That listing does not have a specific agent assigned right now. Connecting you with our team instead. Please hold.')
    }

    if (digits === '6') return res.send(wrap('<Redirect method="GET">' + esc(buildNextUrl('intro', base)) + '</Redirect>'))
    if (digits === '9') return res.send(wrap(say('Please leave a message after the tone.', voice) + '<Record maxLength="120" transcribe="true" transcribeCallback="' + esc(BASE_URL + '/api/twilio-voicemail') + '" />'))
    if (digits === '*') return res.send(wrap(say('Thank you for calling Target Team. Goodbye.', voice) + '<Hangup />'))
    // Press 7 or anything else → connect to any agent
    return connectToAnyAgent(res, voice, callData, 'Connecting you to an agent. Please hold.')
  }

  return res.send(wrap(say('Thank you for calling. Goodbye.', voice) + '<Hangup />'))
}
