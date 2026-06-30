// TargetOS V2 — Twilio Live MLS Search
// Called when a caller selects the "MLS Search" node in the call flow.
// Same keypad price-range flow as twilio-listings.js, but queries the
// live OneKey MLS feed (via SimplyRETS) instead of the CRM's own listings.
'use strict'

const querystring = require('querystring')

const MLS_USER = process.env.SIMPLYRETS_USER || process.env.VITE_SIMPLYRETS_USER || 'simplyrets'
const MLS_PASS = process.env.SIMPLYRETS_PASS || process.env.VITE_SIMPLYRETS_PASS || 'simplyrets'
const MLS_BASE = 'https://api.simplyrets.com'

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let d = ''; req.on('data', c => d += c); req.on('end', () => resolve(d)); req.on('error', reject)
  })
}

const wrap = xml => '<?xml version="1.0" encoding="UTF-8"?><Response>' + xml + '</Response>'
const say  = (t, voice) => '<Say voice="' + (voice||'Polly.Joanna') + '">' + (t||'') + '</Say>'

// Read a live MLS listing aloud (SimplyRETS shape, not our internal CRM shape)
function readListing(l, voice) {
  const price = l.listPrice ? '$' + Number(l.listPrice).toLocaleString() : 'price not listed'
  const addr  = l.address ? [l.address.streetNumber, l.address.streetName].filter(Boolean).join(' ') : 'address on file'
  const city  = l.address && l.address.city ? ' in ' + l.address.city : ''
  const beds  = l.property && l.property.bedrooms ? l.property.bedrooms + ' bedroom, ' : ''
  const baths = l.property && l.property.bathsFull ? l.property.bathsFull + ' bathroom ' : ''
  return say(addr + city + '. ' + beds + baths + 'home. Listed at ' + price + '.', voice)
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  if (req.method !== 'POST') return res.status(405).send(wrap(say('Method not allowed.')))

  let body = {}
  try { body = querystring.parse(await getRawBody(req)) } catch(e) { body = req.body || {} }

  const digits = body.Digits || ''

  const rawUrl = req.url || ''
  const qStr   = rawUrl.includes('?') ? rawUrl.split('?')[1] : ''
  const qp     = querystring.parse(qStr)
  const step   = qp.step   || 'intro'
  const voice  = qp.voice  || 'Polly.Joanna'
  const maxRes = parseInt(qp.max || '5') || 5
  const area   = qp.area ? decodeURIComponent(qp.area) : ''
  const introText = qp.intro ? decodeURIComponent(qp.intro) : 'Welcome to our live MLS search. Use your keypad to search.'

  // ── STEP: intro — present price range menu ────────────────
  if (step === 'intro') {
    const base = '/api/twilio-mls-search?step=price&voice=' + encodeURIComponent(voice) + '&max=' + maxRes + '&area=' + encodeURIComponent(area)
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
      const base = '/api/twilio-mls-search?step=price&voice=' + encodeURIComponent(voice) + '&max=' + maxRes + '&area=' + encodeURIComponent(area)
      return res.send(wrap(
        '<Gather numDigits="1" action="' + base + '" method="POST" timeout="10">' +
          say('Invalid selection. Press 1 for under 500 thousand. 2 for 500k to 1 million. 3 for 1 to 2 million. 4 for over 2 million. 5 for all.', voice) +
        '</Gather>' +
        say('Goodbye.', voice)
      ))
    }

    const base = '/api/twilio-mls-search?step=beds&voice=' + encodeURIComponent(voice) + '&max=' + maxRes +
      '&minp=' + range.min + '&maxp=' + range.max + '&range=' + encodeURIComponent(range.label) + '&area=' + encodeURIComponent(area)

    const twiml =
      '<Gather numDigits="1" action="' + base + '" method="POST" timeout="12">' +
        say('You selected ' + range.label + '. Now press a number for bedrooms. Press 1 for 1 bedroom. 2 for 2 bedrooms. 3 for 3 bedrooms. 4 for 4 or more bedrooms. Press 5 to skip and hear all.', voice) +
      '</Gather>' +
      say('Goodbye.', voice)
    return res.send(wrap(twiml))
  }

  // ── STEP: beds — query live MLS and read results ─────────
  if (step === 'beds') {
    const minPrice = parseInt(qp.minp || '0')
    const maxPrice = parseInt(qp.maxp || '99999999')
    const rangeLabel = qp.range ? decodeURIComponent(qp.range) : ''
    const BED_MAP = { '1':1, '2':2, '3':3, '4':4, '5':null }
    const minBeds = BED_MAP[digits] !== undefined ? BED_MAP[digits] : null

    try {
      const params = new URLSearchParams({ limit: maxRes, status: 'Active' })
      params.set('minprice', String(minPrice))
      params.set('maxprice', String(maxPrice))
      if (minBeds)  params.set('minbeds', String(minBeds))
      if (area)     params.set('cities', area)

      const auth = Buffer.from(MLS_USER + ':' + MLS_PASS).toString('base64')
      const mlsRes = await fetch(MLS_BASE + '/properties?' + params.toString(), {
        headers: { 'Authorization': 'Basic ' + auth, 'Accept': 'application/json' }
      })

      if (!mlsRes.ok) throw new Error('MLS API returned ' + mlsRes.status)
      const results = await mlsRes.json()

      if (!results.length) {
        const retry = '/api/twilio-mls-search?step=intro&voice=' + encodeURIComponent(voice) + '&max=' + maxRes + '&area=' + encodeURIComponent(area)
        return res.send(wrap(
          say('We found no active MLS listings matching your search' + (rangeLabel ? ' in the ' + rangeLabel + ' range' : '') + (area ? ' in ' + area : '') + '.', voice) +
          '<Gather numDigits="1" action="' + retry + '" method="POST" timeout="10">' +
            say('Press 1 to search again with different criteria, or press 2 to speak with an agent.', voice) +
          '</Gather>' +
          say('Thank you for calling Target Team. Goodbye.', voice)
        ))
      }

      let twiml = say('We found ' + results.length + ' listing' + (results.length > 1 ? 's' : '') + ' on the M L S' + (rangeLabel ? ' in the ' + rangeLabel + ' range' : '') + (area ? ' in ' + area : '') + '. Here they are.', voice)

      results.forEach((l, i) => {
        twiml += say('Listing ' + (i+1) + '.', voice)
        twiml += readListing(l, voice)
      })

      const followup = '/api/twilio-mls-search?step=followup&voice=' + encodeURIComponent(voice)
      twiml +=
        '<Gather numDigits="1" action="' + followup + '" method="POST" timeout="12">' +
          say('Press 1 to search again. Press 2 to speak with an agent. Press 9 to leave a voicemail. Or press star to end the call.', voice) +
        '</Gather>' +
        say('Thank you for calling Target Team. Goodbye.', voice)

      return res.send(wrap(twiml))
    } catch(e) {
      console.error('MLS search error:', e.message)
      return res.send(wrap(
        say('We are having trouble reaching the M L S right now. Please try again later or speak with an agent.', voice) +
        '<Redirect method="POST">https://app.targetreteam.com/api/twilio-inbound</Redirect>'
      ))
    }
  }

  // ── STEP: followup — after listings were read ─────────────
  if (step === 'followup') {
    if (digits === '1') {
      const restart = '/api/twilio-mls-search?step=intro&voice=' + encodeURIComponent(voice)
      return res.send(wrap('<Redirect method="GET">' + restart + '</Redirect>'))
    }
    if (digits === '9') {
      return res.send(wrap(
        say('Please leave your name and number after the tone.', voice) +
        '<Record maxLength="120" transcribe="true" transcribeCallback="/api/twilio-voicemail" />'
      ))
    }
    if (digits === '*') return res.send(wrap(say('Thank you for calling Target Team. Goodbye.', voice) + '<Hangup />'))
    return res.send(wrap(
      say('Connecting you to a Target Team agent.', voice) +
      '<Redirect method="POST">https://app.targetreteam.com/api/twilio-inbound</Redirect>'
    ))
  }

  return res.send(wrap(say('Thank you for calling Target Team. Goodbye.', voice)))
}
