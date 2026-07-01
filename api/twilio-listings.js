// TargetOS V2 — CRM Listings Phone Search
// Multi-step keypad search: price → beds → baths → type → reads results
'use strict'
const querystring = require('querystring')

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return require('@supabase/supabase-js').createClient(url, key)
}

const say = (t, v) => '<Say voice="' + (v||'Polly.Joanna') + '">' + String(t||'') + '</Say>'
const wrap = xml => '<?xml version="1.0" encoding="UTF-8"?><Response>' + xml + '</Response>'

const PRICE_RANGES = {
  '1': { min:0,       max:499999,   label:'under 500 thousand' },
  '2': { min:500000,  max:749999,   label:'500 to 750 thousand' },
  '3': { min:750000,  max:999999,   label:'750 thousand to 1 million' },
  '4': { min:1000000, max:1499999,  label:'1 to 1.5 million' },
  '5': { min:1500000, max:1999999,  label:'1.5 to 2 million' },
  '6': { min:2000000, max:99999999, label:'over 2 million' },
  '0': { min:0,       max:99999999, label:'any price' },
}
const BED_MAP   = { '1':'1', '2':'2', '3':'3', '4':'4', '5':'5+', '0':'any' }
const BATH_MAP  = { '1':'1', '2':'2', '3':'3+', '0':'any' }
const TYPE_MAP  = { '1':'Single Family', '2':'Condo', '3':'Townhouse', '4':'Multi Family', '0':'any' }

function readListing(l, i, voice) {
  const price  = l.price ? '$' + Number(l.price).toLocaleString() : 'price not listed'
  const addr   = l.address || 'address on file'
  const beds   = l.bedrooms ? l.bedrooms + ' bedroom' : ''
  const baths  = l.bathrooms ? (l.bathrooms + ' bathroom') : ''
  const type   = l.property_type || ''
  const desc   = [beds, baths, type].filter(Boolean).join(', ')
  return say('Listing ' + (i+1) + '. ' + addr + '. ' + (desc ? desc + '. ' : '') + 'Listed at ' + price + '.', voice)
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).send(wrap(say('Method not allowed.')))

  let body = {}
  if (req.method === 'POST') {
    try {
      const raw = await new Promise((ok,err) => { let d=''; req.on('data',c=>d+=c); req.on('end',()=>ok(d)); req.on('error',err) })
      body = querystring.parse(raw)
    } catch(e) { body = req.body || {} }
  }

  const rawUrl = req.url || ''
  const qStr   = rawUrl.includes('?') ? rawUrl.split('?')[1] : ''
  const qp     = querystring.parse(qStr)

  const digits   = body.Digits || ''
  const step     = qp.step     || 'intro'
  const voice    = qp.voice    || 'Polly.Joanna'
  const maxRes   = parseInt(qp.max||'5') || 5
  const introTxt = qp.intro ? decodeURIComponent(qp.intro) : 'Welcome to our available listings search.'
  const priceKey = qp.price || ''
  const bedsKey  = qp.beds  || ''
  const bathsKey = qp.baths || ''

  const base = 'https://app.targetreteam.com/api/twilio-listings'

  // ── INTRO: explain filters available ─────────────────────────
  if (step === 'intro') {
    const nextUrl = base + '?step=price&voice=' + encodeURIComponent(voice) + '&max=' + maxRes
    return res.send(wrap(
      '<Gather numDigits="1" action="' + nextUrl + '" method="POST" timeout="12">' +
        say(introTxt + ' Use your keypad to filter by price, bedrooms, and more. Press 1 for under 500 thousand. 2 for 500 to 750 thousand. 3 for 750 thousand to 1 million. 4 for 1 to 1.5 million. 5 for 1.5 to 2 million. 6 for over 2 million. Press 0 to hear all listings.', voice) +
      '</Gather>' +
      say('We did not receive your input. Goodbye.', voice)
    ))
  }

  // ── PRICE SELECTION ───────────────────────────────────────────
  if (step === 'price') {
    const range = PRICE_RANGES[digits]
    if (!range) {
      const retry = base + '?step=price&voice=' + encodeURIComponent(voice) + '&max=' + maxRes
      return res.send(wrap(
        '<Gather numDigits="1" action="' + retry + '" method="POST" timeout="10">' +
          say('Invalid selection. Press 1 through 6 for a price range, or 0 for any price.', voice) +
        '</Gather>' + say('Goodbye.', voice)
      ))
    }
    const nextUrl = base + '?step=beds&voice=' + encodeURIComponent(voice) + '&max=' + maxRes + '&price=' + digits
    return res.send(wrap(
      '<Gather numDigits="1" action="' + nextUrl + '" method="POST" timeout="12">' +
        say('You selected ' + range.label + '. Now press a number for bedrooms. 1 for 1 bedroom. 2 for 2 bedrooms. 3 for 3 bedrooms. 4 for 4 bedrooms. 5 for 5 or more. Press 0 for any number of bedrooms.', voice) +
      '</Gather>' + say('Goodbye.', voice)
    ))
  }

  // ── BEDROOM SELECTION ─────────────────────────────────────────
  if (step === 'beds') {
    if (!BED_MAP[digits]) {
      const retry = base + '?step=beds&voice=' + encodeURIComponent(voice) + '&max=' + maxRes + '&price=' + priceKey
      return res.send(wrap(
        '<Gather numDigits="1" action="' + retry + '" method="POST" timeout="10">' +
          say('Press 1 through 5 for bedrooms, or 0 for any.', voice) +
        '</Gather>' + say('Goodbye.', voice)
      ))
    }
    const nextUrl = base + '?step=baths&voice=' + encodeURIComponent(voice) + '&max=' + maxRes + '&price=' + priceKey + '&beds=' + digits
    return res.send(wrap(
      '<Gather numDigits="1" action="' + nextUrl + '" method="POST" timeout="12">' +
        say('Press 1 for 1 bathroom. 2 for 2 bathrooms. 3 for 3 or more. Press 0 to skip.', voice) +
      '</Gather>' + say('Goodbye.', voice)
    ))
  }

  // ── BATHROOM SELECTION ────────────────────────────────────────
  if (step === 'baths') {
    if (!BATH_MAP[digits]) {
      const retry = base + '?step=baths&voice=' + encodeURIComponent(voice) + '&max=' + maxRes + '&price=' + priceKey + '&beds=' + bedsKey
      return res.send(wrap(
        '<Gather numDigits="1" action="' + retry + '" method="POST" timeout="10">' +
          say('Press 1, 2, 3, or 0 to skip.', voice) +
        '</Gather>' + say('Goodbye.', voice)
      ))
    }
    const nextUrl = base + '?step=type&voice=' + encodeURIComponent(voice) + '&max=' + maxRes + '&price=' + priceKey + '&beds=' + bedsKey + '&baths=' + digits
    return res.send(wrap(
      '<Gather numDigits="1" action="' + nextUrl + '" method="POST" timeout="12">' +
        say('Press 1 for Single Family. 2 for Condo. 3 for Townhouse. 4 for Multi Family. Press 0 to see all types.', voice) +
      '</Gather>' + say('Goodbye.', voice)
    ))
  }

  // ── PROPERTY TYPE SELECTION → SEARCH AND READ RESULTS ────────
  if (step === 'type') {
    const typeKey = digits
    if (!TYPE_MAP[typeKey]) {
      const retry = base + '?step=type&voice=' + encodeURIComponent(voice) + '&max=' + maxRes + '&price=' + priceKey + '&beds=' + bedsKey + '&baths=' + qp.baths
      return res.send(wrap(
        '<Gather numDigits="1" action="' + retry + '" method="POST" timeout="10">' +
          say('Press 1 Single Family, 2 Condo, 3 Townhouse, 4 Multi Family, or 0 for all.', voice) +
        '</Gather>' + say('Goodbye.', voice)
      ))
    }

    // Run the actual search
    const supabase = getSupabase()
    if (!supabase) return res.send(wrap(say('Search is unavailable. Please call back later.', voice)))

    try {
      let q = supabase.from('listings').select('*').eq('status', 'Active').eq('ivr_enabled', true)

      const range = PRICE_RANGES[priceKey]
      if (range && priceKey !== '0') { q = q.gte('price', range.min).lte('price', range.max) }

      const beds = BED_MAP[bedsKey]
      if (beds && bedsKey !== '0') {
        if (beds === '5+') q = q.gte('bedrooms', 5)
        else q = q.eq('bedrooms', parseInt(beds))
      }

      const baths = BATH_MAP[qp.baths]
      if (baths && qp.baths !== '0') {
        if (baths === '3+') q = q.gte('bathrooms', 3)
        else q = q.eq('bathrooms', parseInt(baths))
      }

      const type = TYPE_MAP[typeKey]
      if (type && typeKey !== '0') q = q.eq('property_type', type)

      q = q.order('price', { ascending: true }).limit(maxRes)
      const { data: results } = await q

      if (!results || results.length === 0) {
        const restartUrl = base + '?step=intro&voice=' + encodeURIComponent(voice) + '&max=' + maxRes + '&intro=' + encodeURIComponent(introTxt)
        return res.send(wrap(
          say('We found no listings matching your search. ', voice) +
          '<Gather numDigits="1" action="' + restartUrl + '" method="GET" timeout="10">' +
            say('Press 1 to search again with different filters. Press 2 to speak with an agent.', voice) +
          '</Gather>' +
          say('Thank you for calling. Goodbye.', voice)
        ))
      }

      const summary = (range && priceKey !== '0' ? range.label : '') +
        (beds && bedsKey !== '0' ? ', ' + beds + ' bed' : '') +
        (baths && qp.baths !== '0' ? ', ' + baths + ' bath' : '') +
        (type && typeKey !== '0' ? ', ' + type : '')

      let twiml = say('We found ' + results.length + ' listing' + (results.length>1?'s':'') + (summary?' matching '+summary:'') + '. Here they are.', voice)
      results.forEach((l, i) => { twiml += readListing(l, i, voice) })

      const followUrl = base + '?step=followup&voice=' + encodeURIComponent(voice)
      twiml += '<Gather numDigits="1" action="' + followUrl + '" method="GET" timeout="12">' +
        say('Press 1 to search again. Press 2 to speak with an agent. Press 9 to leave a voicemail. Press star to end the call.', voice) +
      '</Gather>'
      twiml += say('Thank you for calling. Goodbye.', voice)
      return res.send(wrap(twiml))

    } catch(e) {
      console.error('Listings search error:', e.message)
      return res.send(wrap(say('We encountered an error. Please try again or call back later.', voice)))
    }
  }

  // ── FOLLOWUP ─────────────────────────────────────────────────
  if (step === 'followup') {
    if (digits === '1') {
      const restart = base + '?step=intro&voice=' + encodeURIComponent(voice) + '&max=' + maxRes
      return res.send(wrap('<Redirect method="GET">' + restart + '</Redirect>'))
    }
    if (digits === '9') return res.send(wrap(say('Please leave a message after the tone.', voice) + '<Record maxLength="120" transcribe="true" transcribeCallback="/api/twilio-voicemail" />'))
    if (digits === '*') return res.send(wrap(say('Thank you for calling. Goodbye.', voice) + '<Hangup />'))
    return res.send(wrap(say('Connecting you to an agent.', voice) + '<Redirect method="POST">https://app.targetreteam.com/api/twilio-inbound</Redirect>'))
  }

  return res.send(wrap(say('Thank you for calling. Goodbye.', voice) + '<Hangup />'))
}
