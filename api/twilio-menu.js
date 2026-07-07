// TargetOS V2 — IVR Menu Keypress Handler
'use strict'

const {
  wrap, say, voicemailTwiml, hangup, esc,
  getSupabase, parseBody, parseQS, loadFlow, lookupContact, BASE_URL,
  logTwilioValidation,
} = require('./_lib/phone')
const { walkFlow } = require('./_lib/call-flow')

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  if (req.method !== 'POST') return res.status(405).end()

  const body = await parseBody(req)
  logTwilioValidation(req, body, 'twilio-menu')
  const qp   = parseQS(req)

  const digits     = String(body.Digits || '').trim()
  const from       = body.From || ''
  const to         = body.To   || ''
  const menuNodeId = qp.menuNodeId || body.menuNodeId || ''

  console.info('[menu] digit=' + digits + ' node=' + menuNodeId + ' from=...'+from.slice(-4))

  const sb = getSupabase()

  // Load flow from DB
  const { nodes, edges } = await loadFlow(sb)

  if (!nodes.length) {
    console.error('[menu] no flow in DB — phone_ivr is empty')
    return res.send(wrap(
      say('We are sorry, the phone system is not configured. Please call back later.') + hangup()
    ))
  }

  // Find menu node by ID, then fall back to first menu/language node
  let menuNode = menuNodeId ? nodes.find(n => n.id === menuNodeId) : null
  if (!menuNode) {
    menuNode = nodes.find(n => n.type === 'menu' || n.type === 'language')
    if (menuNode) console.warn('[menu] node "'+menuNodeId+'" not found, using "'+menuNode.id+'"')
    else console.error('[menu] no menu node found at all')
  }

  if (!menuNode) {
    return res.send(wrap(voicemailTwiml('We could not process your selection. Please leave a message.')))
  }

  const opts  = menuNode.config?.options || []
  const voice = menuNode.config?.voice   || 'Polly.Joanna'

  // Deduplicate keys
  const seen   = new Set()
  const deduped = []
  for (let i = opts.length - 1; i >= 0; i--) {
    const k = String(opts[i].key)
    if (!seen.has(k)) { deduped.unshift(opts[i]); seen.add(k) }
  }

  // Match digit to option
  const chosen = deduped.find(o => String(o.key) === digits)

  if (!chosen) {
    // Replay menu
    console.warn('[menu] digit "'+digits+'" not matched — valid: '+deduped.map(o=>o.key).join(','))
    const replayUrl = BASE_URL + '/api/twilio-menu?menuNodeId=' + encodeURIComponent(menuNode.id)
    return res.send(wrap(
      '<Gather numDigits="1" action="' + esc(replayUrl) + '" method="POST"' +
      ' timeout="' + (menuNode.config?.timeout || 10) + '">' +
        say('That was not a valid selection. ' + (menuNode.config?.text || 'Please try again.'), voice) +
      '</Gather>' +
      say('We did not receive your input. Goodbye.', voice) + hangup()
    ))
  }

  // Find the edge for this option
  const portId   = 'key_' + chosen.key
  const nextEdge = edges.find(e => e.from === menuNode.id && e.port === portId)

  if (!nextEdge) {
    console.error('[menu] no edge for port "'+portId+'" from "'+menuNode.id+'"')
    console.error('[menu] edges from this node:', edges.filter(e=>e.from===menuNode.id).map(e=>e.from+':'+e.port+' → '+e.to).join(', '))
    return res.send(wrap(
      say('That option is not available right now. Please try another selection.', voice) +
      voicemailTwiml()
    ))
  }

  // Load contact and continue walking flow
  const contact  = await lookupContact(sb, from)
  const callData = { from, to, contact, callSid: body.CallSid || '', isRepeat: false }

  const leadSay = chosen.say ? say(chosen.say, voice) : ''
  try {
    const rest = await walkFlow(nodes, edges, nextEdge.to, callData, sb, 0)
    return res.send(wrap(leadSay + rest))
  } catch(e) {
    console.error('[menu] walkFlow crashed:', e.message, e.stack)
    return res.send(wrap(voicemailTwiml('We encountered an error. Please leave a message.')))
  }
}
