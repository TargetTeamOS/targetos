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
// of local areas (customizable, see DEFAULT_AREAS).

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
  const qs = Object.entries(params).filter(([,v])=>v!==undefined&&v!==''&&v!==null).map(([k,v])=>k+'='+encodeURIComponent(v)).join('&')
  return BASE + '?step=' + step + (qs?'&'+qs:'')
}

// Dial numbers must be E.164 (+1XXXXXXXXXX). Agent phones in the DB
// are stored in display formats like (845) 555-1234 -- dialing those
// raw is exactly why "connect to assigned agent" failed in testing.
function toE164(phone) {
  const d = String(phone || '').replace(/\D/g, '')
  if (d.length === 10) return '+1' + d
  if (d.length === 11 && d.startsWith('1')) return '+' + d
  if (String(phone || '').startsWith('+')) return phone
  return d ? '+' + d : ''
}

// ── REPEAT-ON-TIMEOUT (July 2026) ─────────────────────────────────
// Every prompt lives at its own step URL and re-renders itself when
// hit without digits. On Gather timeout (15s), TwiML falls through to
// a <Redirect> back to the same step with r+1 -- so the menu REPEATS
// instead of saying goodbye. After MAX_REPEATS, we assume the caller
// is gone.
const GATHER_TIMEOUT = 15
const MAX_REPEATS = 3

function promptGather(step, params, promptText, voice) {
  const r = parseInt(params.r || '0') || 0
  const self = buildNextUrl(step, { ...params, r: 0 })   // digits reset the repeat count
  const again = buildNextUrl(step, { ...params, r: r + 1 })
  let twiml =
    '<Gather numDigits="1" action="' + esc(self) + '" method="POST" timeout="' + GATHER_TIMEOUT + '">' +
      (r > 0 ? say('Are you still there? ', voice) : '') +
      say(promptText, voice) +
    '</Gather>'
  if (r + 1 < MAX_REPEATS) {
    twiml += '<Redirect method="GET">' + esc(again) + '</Redirect>'
  } else {
    twiml += say('We did not receive your selection. Thank you for calling Target Team. Goodbye.', voice) + '<Hangup />'
  }
  return twiml
}

// Builds the composite filter from whatever narrowing the caller has
// chosen so far (any combination of area, price range, bedrooms).
function buildFilter(p) {
  return q => {
    if (p.city) q = q.ilike('addr', '%' + p.city + '%')
    if (p.pmin !== undefined && p.pmin !== '') q = q.gte('list_price', parseInt(p.pmin))
    if (p.pmax !== undefined && p.pmax !== '') q = q.lte('list_price', parseInt(p.pmax))
    if (p.beds) { if (p.beds === '5+') q = q.gte('beds', 5); else q = q.eq('beds', parseInt(p.beds)) }
    return q
  }
}
function filterLabel(p) {
  const parts = []
  if (p.city) parts.push('in ' + p.city)
  if (p.plabel) parts.push(p.plabel)
  if (p.beds) parts.push('with ' + p.beds + ' bedrooms')
  return parts.join(', ')
}

// Runs the actual search + reads results with barge-in.
async function runSearch(res, voice, maxRes, base, p) {
  const supabase = getSupabase()
  if (!supabase) return res.send(wrap(say('Search is temporarily unavailable. Please call back shortly.', voice)))
  const summaryLabel = filterLabel(p)
  try {
    let q = supabase.from('listings').select('addr,city,list_price,beds,baths,property_type,sqft,agent_id')
      .eq('status', 'Active').eq('ivr_enabled', true)
    q = buildFilter(p)(q)
    q = q.order('list_price', { ascending: true }).limit(maxRes)
    const { data: results, error } = await q
    if (error) throw error

    if (!results || results.length === 0) {
      return res.send(wrap(
        say('We found no available listings' + (summaryLabel ? ' ' + summaryLabel : '') + '.', voice) +
        promptGather('noresults', base, 'Press 1 to search again. Press 2 to speak with an agent.', voice)
      ))
    }

    const listingRefs = results.map(l => (l.agent_id || '') + '~' + (l.addr || '')).join('|')
    const followParams = { ...base, listings: listingRefs }
    const connectOptions = results.map((l, i) => 'Press ' + (i + 1) + ' to connect about listing ' + (i + 1) + '.').join(' ')

    // BARGE-IN: the entire readout lives INSIDE one <Gather> so the
    // caller can press a listing number the moment they hear the one
    // they want. Timeout repeats the results (promptGather pattern
    // inlined here because the readout is dynamic).
    const r = parseInt(base.r || '0') || 0
    const selfUrl  = buildNextUrl('followup', { ...followParams, r: 0 })
    const againUrl = buildNextUrl('replay', { ...followParams, r: r + 1 })
    let twiml = '<Gather numDigits="1" action="' + esc(selfUrl) + '" method="POST" timeout="' + GATHER_TIMEOUT + '">' +
      say('We found ' + results.length + ' exclusive listing' + (results.length > 1 ? 's' : '') + (summaryLabel ? ' ' + summaryLabel : '') + '. You can press a listing number at any time to be connected. Here they are.', voice)
    results.forEach((l, i) => { twiml += readListing(l, i, voice) })
    twiml += say(connectOptions + ' Press 6 to search again. Press 7 to speak with any agent. Press 8 to hear the listings again. Press 9 to leave a voicemail. Press star to end the call.', voice) +
    '</Gather>'
    if (r + 1 < MAX_REPEATS) twiml += '<Redirect method="GET">' + esc(againUrl) + '</Redirect>'
    else twiml += say('Thank you for calling Target Team. Goodbye.', voice) + '<Hangup />'
    return res.send(wrap(twiml))
  } catch(e) {
    console.error('Listings search error:', e.message)
    return res.send(wrap(say('We encountered an error searching listings. Please call back shortly.', voice)))
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
  const digits = String(body.Digits||'').trim()
  const step   = qp.step  || 'intro'
  const voice  = qp.voice || 'Polly.Joanna'
  const maxRes = parseInt(qp.max||'5')||5
  // base carries the caller's narrowing choices through every step
  const base   = { voice, max: maxRes, r: qp.r,
                   city: qp.city, pmin: qp.pmin, pmax: qp.pmax, plabel: qp.plabel, beds: qp.beds }
  const callData = { from: body.From||'', to: body.To||'', callSid: body.CallSid||'', callId: null, contact: null, isRepeat: false }
  const sb = getSupabase()
  await logCallEvent(sb, callData.callSid, 'listings_step_' + step, 'digits=' + JSON.stringify(digits) + (qp.r ? ' repeat=' + qp.r : ''))

  const settings = await loadListingsSettings()

  // ── INTRO ────────────────────────────────────────────────────────
  if (step === 'intro') {
    const intro = qp.intro ? decodeURIComponent(qp.intro) : settings.intro
    return res.send(wrap(
      say(intro, voice) +
      '<Redirect method="GET">' + esc(buildNextUrl('method', { voice, max: maxRes })) + '</Redirect>'
    ))
  }

  // ── METHOD — self-rendering: no digits = (re)play the prompt ─────
  if (step === 'method') {
    if (!digits) {
      return res.send(wrap(promptGather('method', base,
        'Press 1 to search by area. Press 2 to search by price. Press 3 to search by bedroom count.', voice)))
    }
    if (digits === '1') {
      await logCallEvent(sb, callData.callSid, 'method_selected', 'Search by area')
      return res.send(wrap('<Redirect method="GET">' + esc(buildNextUrl('area', { voice, max: maxRes })) + '</Redirect>'))
    }
    if (digits === '2') {
      await logCallEvent(sb, callData.callSid, 'method_selected', 'Search by price')
      return res.send(wrap('<Redirect method="GET">' + esc(buildNextUrl('price', { voice, max: maxRes })) + '</Redirect>'))
    }
    if (digits === '3') {
      await logCallEvent(sb, callData.callSid, 'method_selected', 'Search by bedroom count')
      return res.send(wrap('<Redirect method="GET">' + esc(buildNextUrl('beds', { voice, max: maxRes })) + '</Redirect>'))
    }
    return res.send(wrap(say('That is not a valid option.', voice) +
      '<Redirect method="GET">' + esc(buildNextUrl('method', { voice, max: maxRes })) + '</Redirect>'))
  }

  // ── AREA — pick an area, then choose: hear ALL, or narrow ────────
  if (step === 'area') {
    if (!sb) return res.send(wrap(say('Search is temporarily unavailable. Please call back shortly.', voice)))
    const { data: rows } = await sb.from('listings').select('addr')
      .eq('status', 'Active').eq('ivr_enabled', true)
    const addrs = (rows || []).map(x => (x.addr || '').toLowerCase())
    const cities = settings.areas.filter(area => addrs.some(a => a.includes(area.toLowerCase()))).slice(0, 9)
    if (!cities.length) {
      return connectToAnyAgent(res, voice, callData, 'No areas are currently available to search. Connecting you to an agent. Please hold.')
    }
    if (!digits) {
      const optionsText = cities.map((c, i) => 'Press ' + (i + 1) + ' for ' + c + '.').join(' ')
      return res.send(wrap(promptGather('area', base, 'Choose an area. ' + optionsText, voice)))
    }
    const city = cities[parseInt(digits) - 1]
    if (!city) {
      return res.send(wrap(say('That is not a valid area.', voice) +
        '<Redirect method="GET">' + esc(buildNextUrl('area', { voice, max: maxRes })) + '</Redirect>'))
    }
    await logCallEvent(sb, callData.callSid, 'area_selected', city)
    return res.send(wrap('<Redirect method="GET">' + esc(buildNextUrl('scope', { voice, max: maxRes, city })) + '</Redirect>'))
  }

  // ── SCOPE — hear all in area, or narrow by price / bedrooms ──────
  if (step === 'scope') {
    if (!digits) {
      return res.send(wrap(promptGather('scope', base,
        'Press 1 to hear all listings in ' + base.city + '. Press 2 to narrow by price. Press 3 to narrow by bedroom count.', voice)))
    }
    if (digits === '1') {
      await logCallEvent(sb, callData.callSid, 'scope_selected', 'All listings in ' + base.city)
      return runSearch(res, voice, maxRes, { voice, max: maxRes, city: base.city }, { city: base.city })
    }
    if (digits === '2') {
      await logCallEvent(sb, callData.callSid, 'scope_selected', 'Narrow ' + base.city + ' by price')
      return res.send(wrap('<Redirect method="GET">' + esc(buildNextUrl('price', { voice, max: maxRes, city: base.city })) + '</Redirect>'))
    }
    if (digits === '3') {
      await logCallEvent(sb, callData.callSid, 'scope_selected', 'Narrow ' + base.city + ' by bedrooms')
      return res.send(wrap('<Redirect method="GET">' + esc(buildNextUrl('beds', { voice, max: maxRes, city: base.city })) + '</Redirect>'))
    }
    return res.send(wrap(say('That is not a valid option.', voice) +
      '<Redirect method="GET">' + esc(buildNextUrl('scope', { voice, max: maxRes, city: base.city })) + '</Redirect>'))
  }

  // ── PRICE — standalone or narrowing an area ──────────────────────
  if (step === 'price') {
    if (!digits) {
      const optionsText = Object.entries(settings.priceRanges).map(([k, rg]) => 'Press ' + k + ' for ' + rg.label + '.').join(' ')
      return res.send(wrap(promptGather('price', base, 'Choose a price range. ' + optionsText, voice)))
    }
    const range = settings.priceRanges[digits]
    if (!range) {
      return res.send(wrap(say('That is not a valid price option.', voice) +
        '<Redirect method="GET">' + esc(buildNextUrl('price', { voice, max: maxRes, city: base.city })) + '</Redirect>'))
    }
    await logCallEvent(sb, callData.callSid, 'price_selected', range.label + (base.city ? ' (in ' + base.city + ')' : ''))
    const p = { voice, max: maxRes, city: base.city, pmin: range.min, pmax: range.max, plabel: range.label }
    // Offer one more narrowing step (bedrooms) before reading results
    return res.send(wrap('<Redirect method="GET">' + esc(buildNextUrl('scope2', p)) + '</Redirect>'))
  }

  // ── SCOPE2 — results now, or also narrow by bedrooms ─────────────
  if (step === 'scope2') {
    const p = { voice, max: maxRes, city: base.city, pmin: base.pmin, pmax: base.pmax, plabel: base.plabel }
    if (!digits) {
      return res.send(wrap(promptGather('scope2', base,
        'Press 1 to hear the listings. Press 2 to also narrow by bedroom count.', voice)))
    }
    if (digits === '1') {
      await logCallEvent(sb, callData.callSid, 'scope_selected', 'Hear results')
      return runSearch(res, voice, maxRes, p, p)
    }
    if (digits === '2') {
      await logCallEvent(sb, callData.callSid, 'scope_selected', 'Also narrow by bedrooms')
      return res.send(wrap('<Redirect method="GET">' + esc(buildNextUrl('beds', p)) + '</Redirect>'))
    }
    return res.send(wrap(say('That is not a valid option.', voice) +
      '<Redirect method="GET">' + esc(buildNextUrl('scope2', p)) + '</Redirect>'))
  }

  // ── BEDS — standalone or final narrowing ─────────────────────────
  if (step === 'beds') {
    if (!digits) {
      const bedOptionsText = Object.entries(settings.bedMap).map(([k, label]) => k + ' for ' + label).join('. ')
      return res.send(wrap(promptGather('beds', base, 'Choose a bedroom count. Press ' + bedOptionsText + '.', voice)))
    }
    const beds = settings.bedMap[digits]
    if (!beds) {
      return res.send(wrap(say('That is not a valid bedroom option.', voice) +
        '<Redirect method="GET">' + esc(buildNextUrl('beds', { voice, max: maxRes, city: base.city, pmin: base.pmin, pmax: base.pmax, plabel: base.plabel })) + '</Redirect>'))
    }
    await logCallEvent(sb, callData.callSid, 'beds_selected', beds + ' bedrooms' + (base.city ? ' (in ' + base.city + ')' : '') + (base.plabel ? ' (' + base.plabel + ')' : ''))
    const p = { voice, max: maxRes, city: base.city, pmin: base.pmin, pmax: base.pmax, plabel: base.plabel, beds }
    return runSearch(res, voice, maxRes, p, p)
  }

  // ── REPLAY — timeout on results readout: read them again ─────────
  if (step === 'replay') {
    const p = { voice, max: maxRes, r: qp.r, city: base.city, pmin: base.pmin, pmax: base.pmax, plabel: base.plabel, beds: base.beds }
    return runSearch(res, voice, maxRes, p, p)
  }

  // ── NORESULTS — retry menu after an empty search ─────────────────
  if (step === 'noresults') {
    if (digits === '1') return res.send(wrap('<Redirect method="GET">' + esc(buildNextUrl('method', { voice, max: maxRes })) + '</Redirect>'))
    if (digits === '2') return connectToAnyAgent(res, voice, callData, 'Connecting you to an agent. Please hold.')
    return res.send(wrap(promptGather('noresults', base, 'Press 1 to search again. Press 2 to speak with an agent.', voice)))
  }

  // ── FOLLOWUP — caller picked a listing → assigned agent ──────────
  if (step === 'followup') {
    const listingRefs = (qp.listings || '').split('|').map(x => {
      const [agentId, addr] = x.split('~')
      return { agentId, addr }
    })
    const chosen = listingRefs[parseInt(digits) - 1]

    if (chosen) {
      await logCallEvent(sb, callData.callSid, 'listing_selected', chosen.addr || '(address unknown)')
      if (chosen.agentId) {
        try {
          const { data: agent } = await sb.from('agents').select('phone, name').eq('id', chosen.agentId).maybeSingle()
          const dialNumber = toE164(agent?.phone)
          if (dialNumber) {
            await logCallEvent(sb, callData.callSid, 'routed_to_assigned_agent', 'Assigned agent: ' + (agent.name || chosen.agentId) + ' — dialing ' + dialNumber)
            const whisperUrl = BASE_URL + '/api/twilio-recording-notice?context=listing&addr=' + encodeURIComponent(chosen.addr || '')
            return res.send(wrap(
              say('Connecting you about ' + (chosen.addr || 'that listing') + '. Please hold.', voice) +
              '<Dial callerId="' + esc(callData.from || callData.to) + '" record="record-from-answer" recordingStatusCallback="' + esc(BASE_URL + '/api/twilio-status') + '" timeout="25" action="' + esc(buildNextUrl('dialresult', { voice, max: maxRes })) + '" method="GET">' +
                '<Number url="' + esc(whisperUrl) + '">' + esc(dialNumber) + '</Number>' +
              '</Dial>'
            ))
          }
          await logCallEvent(sb, callData.callSid, 'assigned_agent_lookup_failed',
            'Agent id ' + chosen.agentId + ' phone unusable: "' + (agent?.phone || 'none on file') + '"')
        } catch(e) {
          console.warn('[twilio-listings] agent lookup failed:', e.message)
          await logCallEvent(sb, callData.callSid, 'assigned_agent_lookup_failed', e.message)
        }
      } else {
        await logCallEvent(sb, callData.callSid, 'no_agent_assigned', 'Listing has no agent_id set: ' + (chosen.addr || ''))
      }
      await logCallEvent(sb, callData.callSid, 'routed_to_roundrobin', 'Falling back to round-robin pool')
      return connectToAnyAgent(res, voice, callData,
        'That listing does not have a specific agent assigned right now. Connecting you with our team instead. Please hold.')
    }

    if (digits === '6') return res.send(wrap('<Redirect method="GET">' + esc(buildNextUrl('method', { voice, max: maxRes })) + '</Redirect>'))
    if (digits === '8') return res.send(wrap('<Redirect method="GET">' + esc(buildNextUrl('replay', { voice, max: maxRes, city: base.city, pmin: base.pmin, pmax: base.pmax, plabel: base.plabel, beds: base.beds })) + '</Redirect>'))
    if (digits === '9') return res.send(wrap(say('Please leave a message after the tone.', voice) + '<Record maxLength="120" transcribe="true" transcribeCallback="' + esc(BASE_URL + '/api/twilio-voicemail') + '" />'))
    if (digits === '*') return res.send(wrap(say('Thank you for calling Target Team. Goodbye.', voice) + '<Hangup />'))
    return connectToAnyAgent(res, voice, callData, 'Connecting you to an agent. Please hold.')
  }

  // ── DIALRESULT — assigned agent didn't answer ────────────────────
  if (step === 'dialresult') {
    const status = body.DialCallStatus || ''
    await logCallEvent(sb, callData.callSid, 'assigned_agent_dial_result', status || 'unknown')
    if (status === 'completed') return res.send(wrap('<Hangup />'))
    return res.send(wrap(
      say('That agent is unavailable right now. Please leave a message after the tone and they will call you back.', voice) +
      '<Record maxLength="120" transcribe="true" transcribeCallback="' + esc(BASE_URL + '/api/twilio-voicemail') + '" />'
    ))
  }

  return res.send(wrap(say('Thank you for calling. Goodbye.', voice) + '<Hangup />'))
}
