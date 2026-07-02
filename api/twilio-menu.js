// TargetOS V2 — IVR Menu Keypress Handler
// Called by Twilio when a caller presses a key during a Gather.
// Loads the flow fresh from DB every time (no URL-length issues).
'use strict'

const {
  wrap, say, voicemailTwiml, hangup,
  getSupabase, parseBody, parseQS, loadFlow, lookupContact,
} = require('./_lib/phone')
const { walkFlow } = require('./_lib/call-flow')

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')

  if (req.method !== 'POST') return res.status(405).end()

  const body = await parseBody(req)
  const qp   = parseQS(req)

  const digits     = String(body.Digits || '').trim()
  const from       = body.From    || ''
  const to         = body.To      || ''
  const menuNodeId = qp.menuNodeId || body.menuNodeId || ''

  console.info('[menu] digits=' + digits + ' menuNodeId=' + menuNodeId + ' from=' + from.slice(-4))

  const supabase = getSupabase()
  if (!supabase) {
    return res.send(wrap(voicemailTwiml('We are experiencing technical difficulties. Please leave a message.')))
  }

  // ── LOAD FLOW FROM DATABASE ───────────────────────────────────
  const { nodes, edges } = await loadFlow(supabase)

  if (!nodes.length) {
    console.error('[menu] No flow found in phone_ivr')
    return res.send(wrap(
      say('We are experiencing technical difficulties. Please call back shortly.') + hangup()
    ))
  }

  // ── FIND MENU NODE ────────────────────────────────────────────
  // First try by the explicit ID passed from walkFlow.
  // Fallback: find the first menu node in the flow.
  let menuNode = menuNodeId ? nodes.find(n => n.id === menuNodeId) : null
  if (!menuNode) {
    menuNode = nodes.find(n => n.type === 'menu' || n.type === 'language')
    if (menuNode) {
      console.warn('[menu] menuNodeId "' + menuNodeId + '" not found, using first menu node "' + menuNode.id + '"')
    }
  }

  if (!menuNode) {
    console.error('[menu] No menu node found at all')
    return res.send(wrap(voicemailTwiml('We could not process your selection. Please leave a message.')))
  }

  const opts = menuNode.config?.options || []
  const voice = menuNode.config?.voice || 'Polly.Joanna'

  // ── LOAD CALLER CONTACT ───────────────────────────────────────
  const contact = await lookupContact(supabase, from)
  const callData = { from, to, contact, callSid: body.CallSid || '', isRepeat: false }

  // ── MATCH DIGIT TO OPTION ─────────────────────────────────────
  // Deduplicate option keys first (last definition wins)
  const seen = new Set()
  const deduped = []
  for (let i = opts.length - 1; i >= 0; i--) {
    const k = String(opts[i].key)
    if (!seen.has(k)) { deduped.unshift(opts[i]); seen.add(k) }
  }

  const chosen = deduped.find(o => String(o.key) === digits)

  // ── NO MATCH → REPLAY MENU ────────────────────────────────────
  if (!chosen) {
    console.warn('[menu] No option for digit "' + digits + '". Valid keys: ' + deduped.map(o => o.key).join(','))
    const replayUrl = 'https://app.targetreteam.com/api/twilio-menu?menuNodeId=' + encodeURIComponent(menuNode.id)
    return res.send(wrap(
      '<Gather numDigits="1" action="' + replayUrl + '" method="POST" timeout="' + (menuNode.config?.timeout || 10) + '">' +
        say('That was not a valid option. ' + (menuNode.config?.text || 'Please try again.'), voice) +
      '</Gather>' +
      say('We did not receive your selection. Goodbye.', voice) +
      hangup()
    ))
  }

  // ── FIND DESTINATION EDGE ─────────────────────────────────────
  const portId   = 'key_' + chosen.key
  const nextEdge = edges.find(e => e.from === menuNode.id && e.port === portId)

  if (!nextEdge) {
    console.error('[menu] No edge for port "' + portId + '" from node "' + menuNode.id + '"')
    console.error('[menu] Available edges from this node:', edges.filter(e => e.from === menuNode.id).map(e => e.port).join(', '))
    return res.send(wrap(
      say('That option is not connected yet. Please try another selection or leave a voicemail.', voice) +
      voicemailTwiml()
    ))
  }

  // ── WALK TO DESTINATION ───────────────────────────────────────
  const leadSay = chosen.say ? say(chosen.say, voice) : ''
  try {
    const rest = await walkFlow(nodes, edges, nextEdge.to, callData, supabase, 0)
    return res.send(wrap(leadSay + rest))
  } catch(e) {
    console.error('[menu] walkFlow error:', e.message, e.stack)
    return res.send(wrap(voicemailTwiml('We encountered an error. Please leave a message.')))
  }
}
