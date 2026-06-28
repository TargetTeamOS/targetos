// /api/twilio-listings — Phone system listing search
// Caller presses 3 → hears available listings → can search by bedrooms
const querystring = require('querystring')
function getRawBody(req) { return new Promise((res,rej)=>{ let d=''; req.on('data',c=>{d+=c}); req.on('end',()=>res(d)); req.on('error',rej) }) }
const wrap = (xml) => `<?xml version="1.0" encoding="UTF-8"?><Response>${xml}</Response>`
const say  = (t)   => `<Say voice="Polly.Joanna">${t}</Say>`

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  const body = req.method === 'POST' ? querystring.parse(await getRawBody(req)) : (req.query || {})
  const digits   = body.Digits || ''
  const action   = body.action || 'menu'

  function fmt$(n) { return n ? '$' + Number(n).toLocaleString() : '' }

  try {
    const { createClient } = require('@supabase/supabase-js')
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

    // Fetch IVR-enabled active listings
    const { data: listings } = await supabase
      .from('listings')
      .select('*')
      .eq('status', 'Active')
      .eq('ivr_enabled', true)
      .order('list_price', { ascending: true })

    const all = listings || []

    if (action === 'search' && digits) {
      const beds = parseInt(digits)
      const matches = all.filter(l => parseInt(l.beds) === beds)
      if (matches.length === 0) {
        return res.send(wrap(
          say(`We currently have no listings with ${beds} bedrooms. Let me read you all available listings.`) +
          '<Redirect>/api/twilio-listings?action=list&index=0</Redirect>'
        ))
      }
      // Read first match
      const l = matches[0]
      const desc = l.ivr_description || `${l.addr}. ${l.beds} bedrooms, ${l.baths} bathrooms, ${l.sqft ? l.sqft + ' square feet.' : ''} Listed at ${fmt$(l.list_price)}.`
      return res.send(wrap(
        say(`We have ${matches.length} listing${matches.length > 1 ? 's' : ''} with ${beds} bedrooms. ` + desc) +
        `<Gather numDigits="1" action="/api/twilio-listings?action=nav&beds=${beds}&index=0" method="POST" timeout="8">` +
          say('Press 1 to hear more details. Press 2 for the next listing. Press 9 to speak with an agent. Or stay on the line to hear it again.') +
        '</Gather>' +
        '<Redirect>/api/twilio-listings?action=search&index=0</Redirect>'
      ))
    }

    if (action === 'nav') {
      const idx  = parseInt(body.index || '0')
      const beds = body.beds ? parseInt(body.beds) : null
      const pool = beds ? all.filter(l => parseInt(l.beds) === beds) : all
      if (digits === '9') {
        return res.send(wrap(say('Connecting you to an agent now.') + '<Redirect>/api/twilio-inbound</Redirect>'))
      }
      if (digits === '2') {
        const nextIdx = idx + 1
        if (nextIdx >= pool.length) {
          return res.send(wrap(say('That was our last listing. Thank you for calling Target Team!') + '<Hangup/>'))
        }
        const l    = pool[nextIdx]
        const desc = l.ivr_description || `${l.addr}. ${l.beds} bedrooms, ${l.baths} bathrooms, ${l.sqft ? l.sqft + ' square feet.' : ''} Listed at ${fmt$(l.list_price)}.`
        return res.send(wrap(
          say(desc) +
          `<Gather numDigits="1" action="/api/twilio-listings?action=nav&beds=${beds||''}&index=${nextIdx}" method="POST" timeout="8">` +
            say('Press 2 for the next listing. Press 9 to speak with an agent.') +
          '</Gather>'
        ))
      }
    }

    // Default: listings menu
    if (all.length === 0) {
      return res.send(wrap(say('We currently have no listings available on our system. Please call back soon or press 9 to speak with an agent.') + '<Gather numDigits="1" action="/api/twilio-inbound" method="POST" timeout="8"></Gather>'))
    }

    return res.send(wrap(
      say(`Target Team has ${all.length} active listings available. `) +
      `<Gather numDigits="1" action="/api/twilio-listings?action=search" method="POST" timeout="10">` +
        say('Please enter the number of bedrooms you are looking for, then press pound. Or press 0 to hear all available listings. Or press 9 to speak with an agent.') +
      '</Gather>' +
      '<Redirect>/api/twilio-listings</Redirect>'
    ))

  } catch(err) {
    console.error('listings IVR error:', err.message)
    return res.send(wrap(say('Unable to load listings at this time. Please call back shortly.')))
  }
}
