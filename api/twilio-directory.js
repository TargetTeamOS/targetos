// TargetOS V2 — Agent Directory IVR
// Caller presses extension (101, 102, etc.) to reach a specific agent.
// Extensions are assigned in order of agent creation (first agent = 101, etc.)
'use strict'
const querystring = require('querystring')

const { getSupabase, say, wrap, esc, BASE_URL } = require('./_lib/phone')

const BASE = BASE_URL + '/api/twilio-directory'

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')

  let body = {}
  try {
    const raw = await new Promise((ok,err) => { let d=''; req.on('data',c=>d+=c); req.on('end',()=>ok(d)); req.on('error',err) })
    body = querystring.parse(raw)
  } catch(e) { body = req.body || {} }

  const rawUrl = req.url || ''
  const qp     = querystring.parse(rawUrl.includes('?') ? rawUrl.split('?')[1] : '')
  const digits  = body.Digits || ''
  const step    = qp.step    || 'announce'
  const voice   = qp.voice   || 'Polly.Joanna'
  const to      = body.To    || qp.to || ''

  const supabase = getSupabase()
  if (!supabase) return res.send(wrap(say('Directory is unavailable. Goodbye.', voice)))

  // Load active agents ordered consistently (by created_at) and assign extensions 101+
  const { data: agents } = await supabase
    .from('agents')
    .select('id,name,phone,role')
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(20)

  const agentList = (agents || []).filter(a => a.phone)
  agentList.forEach((a, i) => { a._ext = String(101 + i) })

  // ── ANNOUNCE: read all extensions ──────────────────────────────
  if (step === 'announce') {
    if (!agentList.length) {
      return res.send(wrap(say('No agents are currently available. Goodbye.', voice)))
    }

    const listText = agentList.map(a => {
      const firstName = a.name.split(' ')[0]
      return 'For ' + firstName + ', press ' + a._ext
    }).join('. ')

    const actionUrl = BASE + '?step=connect&voice=' + encodeURIComponent(voice) + '&to=' + encodeURIComponent(to)
    return res.send(wrap(
      '<Gather numDigits="3" action="' + actionUrl + '" method="POST" timeout="15">' +
        say('Our directory. ' + listText + '. Press 0 to return to the main menu.', voice) +
      '</Gather>' +
      say('We did not receive your selection. Goodbye.', voice)
    ))
  }

  // ── CONNECT: dial the chosen extension ─────────────────────────
  if (step === 'connect') {
    if (digits === '0') {
      // Back to main menu
      return res.send(wrap('<Redirect method="POST">' + BASE_URL + '/api/twilio-inbound</Redirect>'))
    }

    const agent = agentList.find(a => a._ext === digits)
    if (!agent) {
      // Invalid extension — replay directory
      const retryUrl = BASE + '?step=announce&voice=' + encodeURIComponent(voice) + '&to=' + encodeURIComponent(to)
      return res.send(wrap(
        '<Gather numDigits="3" action="' + BASE + '?step=connect&voice=' + encodeURIComponent(voice) + '&to=' + encodeURIComponent(to) + '" method="POST" timeout="12">' +
          say('Extension ' + digits + ' was not found. ' + agentList.map(a => 'For ' + a.name.split(' ')[0] + ', press ' + a._ext).join('. ') + '.', voice) +
        '</Gather>' +
        say('Goodbye.', voice)
      ))
    }

    let phone = agent.phone.replace(/[^+0-9]/g, '')
    if (!phone.startsWith('+')) phone = '+1' + phone
    const firstName = agent.name.split(' ')[0]

    return res.send(wrap(
      say('Connecting you to ' + firstName + '. Please hold.', voice) +
      '<Dial callerId="' + esc(to) + '" timeout="30" record="record-from-answer" recordingStatusCallback="' + BASE_URL + '/api/twilio-status">' +
        '<Number statusCallback="' + BASE_URL + '/api/twilio-status" statusCallbackMethod="POST">' + esc(phone) + '</Number>' +
      '</Dial>' +
      say('I\'m sorry, ' + firstName + ' is unavailable. Please leave a message after the tone.', voice) +
      '<Record maxLength="120" transcribe="true" transcribeCallback="' + BASE_URL + '/api/twilio-voicemail" />'
    ))
  }

  return res.send(wrap(say('Goodbye.', voice)))
}
