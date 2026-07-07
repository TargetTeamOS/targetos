// TargetOS V2 — Live MLS Search via Phone (OneKey / SimplyRETS)
// Multi-step keypad search: price → beds → baths → type → live MLS results
'use strict'

const querystring = require('querystring')

const { say, wrap, BASE_URL } = require('./_lib/phone')

const MLS_USER = process.env.SIMPLYRETS_USER || process.env.VITE_SIMPLYRETS_USER || 'simplyrets'
const MLS_PASS = process.env.SIMPLYRETS_PASS || process.env.VITE_SIMPLYRETS_PASS || 'simplyrets'
const MLS_BASE = 'https://api.simplyrets.com'

const PRICE_RANGES = {
  '1': { min:0,       max:499999,   label:'under 500 thousand' },
  '2': { min:500000,  max:749999,   label:'500 to 750 thousand' },
  '3': { min:750000,  max:999999,   label:'750 thousand to 1 million' },
  '4': { min:1000000, max:1499999,  label:'1 to 1.5 million' },
  '5': { min:1500000, max:1999999,  label:'1.5 to 2 million' },
  '6': { min:2000000, max:99999999, label:'over 2 million' },
  '0': { min:0,       max:99999999, label:'any price' },
}
const BED_MAP  = { '1':'1', '2':'2', '3':'3', '4':'4', '5':'5+', '0':'any' }
const BATH_MAP = { '1':'1', '2':'2', '3':'3+', '0':'any' }
const TYPE_MAP = { '1':'SingleFamily', '2':'Condominium', '3':'Townhouse', '4':'MultiFamily', '0':'any' }
const TYPE_LABELS = { '1':'Single Family', '2':'Condo', '3':'Townhouse', '4':'Multi Family', '0':'any type' }

function readListing(l, i, voice) {
  const price = l.listPrice ? '$' + Number(l.listPrice).toLocaleString() : 'price not listed'
  const addr  = l.address ? [l.address.streetNumber, l.address.streetName, l.address.city].filter(Boolean).join(' ') : 'address on file'
  const beds  = l.property && l.property.bedrooms ? l.property.bedrooms + ' bed' : ''
  const baths = l.property && l.property.bathsFull ? l.property.bathsFull + ' bath' : ''
  const desc  = [beds, baths].filter(Boolean).join(', ')
  return say('Listing ' + (i+1) + '. ' + addr + '. ' + (desc ? desc + '. ' : '') + 'Listed at ' + price + '.', voice)
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')

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
  const area     = qp.area ? decodeURIComponent(qp.area) : ''
  const introTxt = qp.intro ? decodeURIComponent(qp.intro) : 'Welcome to our live M L S search.'
  const priceKey = qp.price || ''
  const bedsKey  = qp.beds  || ''

  const base = BASE_URL + '/api/twilio-mls-search'

  if (step === 'intro') {
    const nextUrl = base + '?step=price&voice=' + encodeURIComponent(voice) + '&max=' + maxRes + (area ? '&area=' + encodeURIComponent(area) : '')
    return res.send(wrap(
      '<Gather numDigits="1" action="' + nextUrl + '" method="POST" timeout="12">' +
        say(introTxt + ' Press 1 for under 500 thousand. 2 for 500 to 750 thousand. 3 for 750 thousand to 1 million. 4 for 1 to 1.5 million. 5 for 1.5 to 2 million. 6 for over 2 million. Press 0 for any price.', voice) +
      '</Gather>' +
      say('We did not receive your input. Goodbye.', voice)
    ))
  }

  if (step === 'price') {
    const range = PRICE_RANGES[digits]
    if (!range) {
      const retry = base + '?step=price&voice=' + encodeURIComponent(voice) + '&max=' + maxRes
      return res.send(wrap('<Gather numDigits="1" action="' + retry + '" method="POST" timeout="10">' + say('Press 1 through 6 for a price range, or 0 for any.', voice) + '</Gather>' + say('Goodbye.', voice)))
    }
    const nextUrl = base + '?step=beds&voice=' + encodeURIComponent(voice) + '&max=' + maxRes + '&price=' + digits + (area ? '&area=' + encodeURIComponent(area) : '')
    return res.send(wrap('<Gather numDigits="1" action="' + nextUrl + '" method="POST" timeout="12">' + say('You selected ' + range.label + '. Press 1 for 1 bedroom, 2 for 2, 3 for 3, 4 for 4, 5 for 5 or more, 0 for any.', voice) + '</Gather>' + say('Goodbye.', voice)))
  }

  if (step === 'beds') {
    if (!BED_MAP[digits]) {
      const retry = base + '?step=beds&voice=' + encodeURIComponent(voice) + '&max=' + maxRes + '&price=' + priceKey
      return res.send(wrap('<Gather numDigits="1" action="' + retry + '" method="POST" timeout="10">' + say('Press 1 through 5 for bedrooms, or 0 for any.', voice) + '</Gather>' + say('Goodbye.', voice)))
    }
    const nextUrl = base + '?step=baths&voice=' + encodeURIComponent(voice) + '&max=' + maxRes + '&price=' + priceKey + '&beds=' + digits + (area ? '&area=' + encodeURIComponent(area) : '')
    return res.send(wrap('<Gather numDigits="1" action="' + nextUrl + '" method="POST" timeout="12">' + say('Press 1 for 1 bathroom, 2 for 2, 3 for 3 or more, 0 to skip.', voice) + '</Gather>' + say('Goodbye.', voice)))
  }

  if (step === 'baths') {
    if (!BATH_MAP[digits]) {
      const retry = base + '?step=baths&voice=' + encodeURIComponent(voice) + '&max=' + maxRes + '&price=' + priceKey + '&beds=' + bedsKey
      return res.send(wrap('<Gather numDigits="1" action="' + retry + '" method="POST" timeout="10">' + say('Press 1, 2, 3, or 0 to skip.', voice) + '</Gather>' + say('Goodbye.', voice)))
    }
    const nextUrl = base + '?step=type&voice=' + encodeURIComponent(voice) + '&max=' + maxRes + '&price=' + priceKey + '&beds=' + bedsKey + '&baths=' + digits + (area ? '&area=' + encodeURIComponent(area) : '')
    return res.send(wrap('<Gather numDigits="1" action="' + nextUrl + '" method="POST" timeout="12">' + say('Press 1 for Single Family, 2 for Condo, 3 for Townhouse, 4 for Multi Family, or 0 for all types.', voice) + '</Gather>' + say('Goodbye.', voice)))
  }

  if (step === 'type') {
    const typeKey = digits
    if (!TYPE_MAP[typeKey]) {
      const retry = base + '?step=type&voice=' + encodeURIComponent(voice) + '&max=' + maxRes + '&price=' + priceKey + '&beds=' + bedsKey + '&baths=' + qp.baths
      return res.send(wrap('<Gather numDigits="1" action="' + retry + '" method="POST" timeout="10">' + say('Press 1 Single Family, 2 Condo, 3 Townhouse, 4 Multi Family, or 0 for all.', voice) + '</Gather>' + say('Goodbye.', voice)))
    }

    try {
      const params = new URLSearchParams({ limit: maxRes, status: 'Active' })
      const range = PRICE_RANGES[priceKey]
      if (range && priceKey !== '0') { params.set('minprice', String(range.min)); params.set('maxprice', String(range.max)) }
      const beds = BED_MAP[bedsKey]
      if (beds && bedsKey !== '0') params.set('minbeds', beds === '5+' ? '5' : beds)
      const baths = BATH_MAP[qp.baths]
      if (baths && qp.baths !== '0') params.set('minbaths', baths === '3+' ? '3' : baths)
      const type = TYPE_MAP[typeKey]
      if (type && typeKey !== '0') params.set('type', type)
      if (area) params.set('cities', area)

      const auth = Buffer.from(MLS_USER + ':' + MLS_PASS).toString('base64')
      const mlsRes = await fetch(MLS_BASE + '/properties?' + params.toString(), {
        headers: { 'Authorization': 'Basic ' + auth, 'Accept': 'application/json' }
      })
      if (!mlsRes.ok) throw new Error('MLS API ' + mlsRes.status)
      const results = await mlsRes.json()

      if (!results || results.length === 0) {
        const restart = base + '?step=intro&voice=' + encodeURIComponent(voice) + '&max=' + maxRes + (area ? '&area=' + encodeURIComponent(area) : '')
        return res.send(wrap(
          say('No live M L S listings found matching your search.', voice) +
          '<Gather numDigits="1" action="' + restart + '" method="GET" timeout="10">' +
            say('Press 1 to search again. Press 2 to speak with an agent.', voice) +
          '</Gather>' + say('Goodbye.', voice)
        ))
      }

      const range2 = PRICE_RANGES[priceKey]
      let twiml = say('Found ' + results.length + ' M L S listing' + (results.length>1?'s':'') + (range2&&priceKey!=='0'?' in the ' + range2.label + ' range':'') + '.', voice)
      results.forEach((l,i) => { twiml += readListing(l, i, voice) })

      const followUrl = base + '?step=followup&voice=' + encodeURIComponent(voice)
      twiml += '<Gather numDigits="1" action="' + followUrl + '" method="GET" timeout="12">' +
        say('Press 1 to search again. Press 2 for an agent. Press 9 for voicemail. Star to end.', voice) +
      '</Gather>'
      twiml += say('Thank you for calling. Goodbye.', voice)
      return res.send(wrap(twiml))

    } catch(e) {
      console.error('MLS error:', e.message)
      return res.send(wrap(say('We could not reach the M L S right now. Please try again later.', voice)))
    }
  }

  if (step === 'followup') {
    if (digits === '1') return res.send(wrap('<Redirect method="GET">' + base + '?step=intro&voice=' + encodeURIComponent(voice) + '</Redirect>'))
    if (digits === '9') return res.send(wrap(say('Please leave a message after the tone.', voice) + '<Record maxLength="120" transcribe="true" transcribeCallback="' + BASE_URL + '/api/twilio-voicemail" />'))
    if (digits === '*') return res.send(wrap(say('Goodbye.', voice) + '<Hangup />'))
    return res.send(wrap(say('Connecting you to an agent.', voice) + '<Redirect method="POST">' + BASE_URL + '/api/twilio-inbound</Redirect>'))
  }

  return res.send(wrap(say('Thank you for calling. Goodbye.', voice) + '<Hangup />'))
}
