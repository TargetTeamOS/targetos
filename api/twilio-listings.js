// TargetOS V2 — Twilio Listing Search
// Called when a caller selects the "Listings" option.
// Prompts for price range via keypad, reads matching listings.
'use strict'

const querystring = require('querystring')

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return require('@supabase/supabase-js').createClient(url, key)
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let d = ''; req.on('data', c => d += c); req.on('end', () => resolve(d)); req.on('error', reject)
  })
}

const wrap = xml => '<?xml version="1.0" encoding="UTF-8"?><Response>' + xml + '</Response>'
const say  = (t, voice) => '<Say voice="' + (voice||'Polly.Joanna') + '">' + (t||'') + '</Say>'

// Read a listing aloud
function readListing(l, voice) {
  const price  = l.list_price ? '$' + Number(l.list_price).toLocaleString() : 'price not listed'
  const addr   = l.addr || 'address on file'
  const beds   = l.beds  ? l.beds  + ' bedroom, ' : ''
  const baths  = l.baths ? l.baths + ' bathroom ' : ''
  const city   = l.city  ? ' in ' + l.city : ''
  return say(addr + city + '. ' + beds + baths + 'home. Listed at ' + price + '.', voice)
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  if (req.method !== 'POST') return res.status(405).send(wrap(say('Method not allowed.')))

  let body = {}
  try { body = querystring.parse(await getRawBody(req)) } catch(e) { body = req.body || {} }

  const digits  = body.Digits || ''
  const to      = body.To     || ''
  const voice   = body.voice  || 'Polly.Joanna'

  // Parse state from query string
  const rawUrl  = req.url || ''
  const qStr    = rawUrl.includes('?') ? rawUrl.split('?')[1] : ''
  const qp      = querystring.parse(qStr)
  const step    = qp.step    || 'intro'
  const maxRes  = parseInt(qp.max||'5') || 5
  const introText = qp.intro ? decodeURIComponent(qp.intro) : 'Welcome to our available listings. Use your keypad to search.'

  const supabase = getSupabase()

  // ── STEP: intro — present price range menu ────────────────
  if (step === 'intro') {
    const base = '/api/twilio-listings?step=price&voice=' + encodeURIComponent(voice) + '&max=' + maxRes + '&intro=' + encodeURIComponent(introText)
    const twiml =
      '<Gather numDigits="1" action="' + base + '" method="POST" timeout="12">' +
        say(introText + ' Press 1 for under 500 thousand. Press 2 for 500 thousand to 1 million. Press 3 for 1 million to 2 million. Press 4 for over 2 million. Press 5 to hear all available listings.', voice) +
      '</Gather>' +
      say('We did not receive your selection. Goodbye.', voice)
    return res.send(wrap(twiml))
  }

  // ── STEP: price — filter by selected range, then ask beds ─
  if (step === 'price') {
    const RANGES = {
      '1': { min: 0,       max: 499999,   label: 'under 500 thousand' },
      '2': { min: 500000,  max: 999999,   label: '500 thousand to 1 million' },
      '3': { min: 1000000, max: 1999999,  label: '1 million to 2 million' },
      '4': { min: 2000000, max: 99999999, label: 'over 2 million' },
      '5': { min: 0,       max: 99999999, label: 'all price ranges' },
    }
    const range = RANGES[digits]
    if (!range) {
      const base = '/api/twilio-listings?step=price&voice=' + encodeURIComponent(voice) + '&max=' + maxRes
      return res.send(wrap(
        '<Gather numDigits="1" action="' + base + '" method="POST" timeout="10">' +
          say('Invalid selection. Press 1 for under 500 thousand. 2 for 500k to 1 million. 3 for 1 to 2 million. 4 for over 2 million. 5 for all.', voice) +
        '</Gather>' +
        say('Goodbye.', voice)
      ))
    }

    const base = '/api/twilio-listings?step=beds&voice=' + encodeURIComponent(voice) + '&max=' + maxRes +
      '&minp=' + range.min + '&maxp=' + range.max + '&range=' + encodeURIComponent(range.label)

    const twiml =
      '<Gather numDigits="1" action="' + base + '" method="POST" timeout="12">' +
        say('You selected ' + range.label + '. Now press a number for bedrooms. Press 1 for 1 bedroom. 2 for 2 bedrooms. 3 for 3 bedrooms. 4 for 4 or more bedrooms. Press 5 to skip and hear all.', voice) +
      '</Gather>' +
      say('Goodbye.', voice)
    return res.send(wrap(twiml))
  }

  // ── STEP: beds — search and read results ─────────────────
  if (step === 'beds') {
    const minPrice = parseInt(qp.minp || '0')
    const maxPrice = parseInt(qp.maxp || '99999999')
    const rangeLabel = qp.range ? decodeURIComponent(qp.range) : ''
    const BED_MAP = { '1':1, '2':2, '3':3, '4':4, '5':null }
    const minBeds = BED_MAP[digits] !== undefined ? BED_MAP[digits] : null

    if (!supabase) return res.send(wrap(say('Database unavailable. Please call back.', voice)))

    try {
      let q = supabase.from('listings')
        .select('addr, city, list_price, beds, baths, property_type, status')
        .eq('ivr_enabled', true)
        .eq('status', 'Active')
        .gte('list_price', minPrice)
        .lte('list_price', maxPrice)
        .order('list_price', { ascending: true })
        .limit(maxRes)

      if (minBeds) q = q.gte('beds', minBeds)

      const { data: listings } = await q
      const results = listings || []

      if (results.length === 0) {
        const retry = '/api/twilio-listings?step=intro&voice=' + encodeURIComponent(voice) + '&max=' + maxRes
        return res.send(wrap(
          say('We found no available listings matching your search' + (rangeLabel ? ' in the ' + rangeLabel + ' range' : '') + '.', voice) +
          '<Gather numDigits="1" action="' + retry + '" method="POST" timeout="10">' +
            say('Press 1 to search again with different criteria, or press 2 to speak with an agent.', voice) +
          '</Gather>' +
          say('Thank you for calling Target Team. Goodbye.', voice)
        ))
      }

      // Build reading TwiML
      let twiml = say('We found ' + results.length + ' listing' + (results.length > 1 ? 's' : '') + (rangeLabel ? ' in the ' + rangeLabel + ' range' : '') + '. Here they are.', voice)

      results.forEach((l, i) => {
        twiml += say('Listing ' + (i+1) + '.', voice)
        twiml += readListing(l, voice)
      })

      // After listings — offer options
      const to_number = to || process.env.TWILIO_PHONE_NUMBER || ''
      const agentUrl  = to_number ? 'https://app.targetreteam.com/api/twilio-inbound' : ''

      const followup = '/api/twilio-listings?step=followup&voice=' + encodeURIComponent(voice)
      twiml +=
        '<Gather numDigits="1" action="' + followup + '" method="POST" timeout="12">' +
          say('Press 1 to search again. Press 2 to speak with an agent. Press 9 to leave a voicemail. Or press star to end the call.', voice) +
        '</Gather>' +
        say('Thank you for calling Target Team. Goodbye.', voice)

      return res.send(wrap(twiml))
    } catch(e) {
      console.error('listing search error:', e.message)
      return res.send(wrap(say('We encountered an error retrieving listings. Please try again. ' + e.message, voice)))
    }
  }

  // ── STEP: followup — after listings were read ─────────────
  if (step === 'followup') {
    if (digits === '1') {
      // Search again
      const restart = '/api/twilio-listings?step=intro&voice=' + encodeURIComponent(voice)
      return res.send(wrap('<Redirect method="GET">' + restart + '</Redirect>'))
    }
    if (digits === '9') {
      return res.send(wrap(
        say('Please leave your name and number after the tone.', voice) +
        '<Record maxLength="120" transcribe="true" transcribeCallback="/api/twilio-voicemail" />'
      ))
    }
    if (digits === '*') return res.send(wrap(say('Thank you for calling Target Team. Goodbye.', voice) + '<Hangup />'))
    // digits === '2' or anything else — connect to agent
    return res.send(wrap(
      say('Connecting you to a Target Team agent.', voice) +
      '<Redirect method="POST">https://app.targetreteam.com/api/twilio-inbound</Redirect>'
    ))
  }

  // Default
  return res.send(wrap(say('Thank you for calling Target Team. Goodbye.', voice)))
}
