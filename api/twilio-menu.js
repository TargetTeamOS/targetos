// TargetOS V2 — Twilio IVR Menu Handler
// Called when a caller presses a key after hearing the menu.
// Reloads the flow from phone_ivr (not from URL params) — no URL length issues.
'use strict'

const querystring = require('querystring')
const { walkFlow, wrap, say, vmXml } = require('./_lib/call-flow')

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return require('@supabase/supabase-js').createClient(url, key)
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let d = ''
    req.on('data', c => { d += c })
    req.on('end', () => resolve(d))
    req.on('error', reject)
  })
}

function parseJ(v) {
  if (!v) return null
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return null } }
  return v
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  if (req.method !== 'POST') return res.status(405).end()

  let body = {}
  try { body = querystring.parse(await getRawBody(req)) } catch(e) { body = req.body || {} }

  const digits     = body.Digits || ''
  const from       = body.From   || ''
  const to         = body.To     || ''

  // Parse URL params
  const rawUrl = req.url || ''
  const qp     = querystring.parse(rawUrl.includes('?') ? rawUrl.split('?')[1] : '')

  // menuNodeId is the primary way — passed from walkFlow's menu handler
  const menuNodeId = qp.menuNodeId || body.menuNodeId || null

  const supabase = getSupabase()

  // ── LOAD CALLER CONTACT ───────────────────────────────────────
  let contact = null
  if (supabase && from) {
    const clean = from.replace(/\D/g, '').slice(-10)
    try {
      const cr = await supabase.from('contacts')
        .select('id,first_name,last_name,agent_id')
        .or('phone.ilike.%' + clean + '%')
        .maybeSingle()
      contact = cr.data || null
    } catch(e) { console.warn('contact lookup:', e.message) }
  }

  const callData = { from, to, contact, callSid: body.CallSid || '', isRepeat: false }

  // ── LOAD FLOW FROM phone_ivr ──────────────────────────────────
  // Always reload fresh from DB — this is the source of truth.
  // No URL-length issues, no stale context, no encoding problems.
  let nodes = [], edges = []
  if (supabase) {
    try {
      let row = null
      const ar = await supabase.from('phone_ivr').select('*').eq('is_active', true).limit(1).maybeSingle()
      row = ar.data
      if (!row) {
        const br = await supabase.from('phone_ivr').select('*').order('updated_at', { ascending: false }).limit(1).maybeSingle()
        row = br.data
      }
      if (row) {
        nodes = parseJ(row.flow_nodes) || []
        edges = parseJ(row.flow_edges) || []
      }
    } catch(e) { console.warn('load flow:', e.message) }
  }

  // ── LEGACY FALLBACK: ctx / ctxId in URL ───────────────────────
  // Support old-style context params for backward compatibility
  // (calls that were in-flight before this deploy)
  if (!nodes.length) {
    const ctxIdParam = qp.ctxId || body.ctxId || null
    const ctxParam   = qp.ctx   || body.ctx   || null

    if (ctxIdParam && supabase) {
      try {
        const { data } = await supabase.from('call_flow_contexts').select('context').eq('id', ctxIdParam).maybeSingle()
        if (data?.context) {
          const c = typeof data.context === 'string' ? JSON.parse(data.context) : data.context
          nodes = c.nodes || []; edges = c.edges || []
        }
      } catch(e) {}
    }
    if (!nodes.length && ctxParam) {
      try {
        const c = JSON.parse(decodeURIComponent(ctxParam))
        nodes = c.nodes || []; edges = c.edges || []
      } catch(e) {}
    }
  }

  if (!nodes.length) {
    console.error('[twilio-menu] No flow found — phone_ivr empty and no ctx param')
    return res.send(wrap(say('We are experiencing technical difficulties. Please call back shortly.') + '<Hangup />'))
  }

  // ── FIND MENU NODE ────────────────────────────────────────────
  let menuNode = null
  if (menuNodeId) {
    menuNode = nodes.find(n => n.id === menuNodeId)
  }
  // Fallback: find the first menu or language node in the flow
  if (!menuNode) {
    menuNode = nodes.find(n => n.type === 'menu' || n.type === 'language')
  }

  if (!menuNode || !menuNode.config || !menuNode.config.options) {
    console.error('[twilio-menu] No menu node found, menuNodeId:', menuNodeId)
    return res.send(wrap(vmXml('We could not process your selection. Please leave a message.')))
  }

  // ── DEDUPLICATE OPTION KEYS ───────────────────────────────────
  const seenKeys = new Set()
  const opts = []
  for (let i = menuNode.config.options.length - 1; i >= 0; i--) {
    const o = menuNode.config.options[i]
    if (!seenKeys.has(String(o.key))) { opts.unshift(o); seenKeys.add(String(o.key)) }
  }

  // ── MATCH PRESSED DIGIT ───────────────────────────────────────
  const chosen = opts.find(o => String(o.key) === String(digits))

  if (!chosen) {
    // Invalid key — replay menu
    console.warn('[twilio-menu] No match for digit "' + digits + '" in options:', opts.map(o=>o.key).join(','))
    const replayUrl = 'https://app.targetreteam.com/api/twilio-menu?menuNodeId=' + encodeURIComponent(menuNode.id)
    return res.send(wrap(
      '<Gather numDigits="1" action="' + replayUrl + '" method="POST" timeout="' + (menuNode.config.timeout||10) + '">' +
        say('Invalid selection. ' + (menuNode.config.text || 'Please try again.'), menuNode.config.voice) +
      '</Gather>' +
      say('We did not receive your selection. Goodbye.', menuNode.config.voice)
    ))
  }

  // ── CONTINUE FLOW FROM CHOSEN DESTINATION ─────────────────────
  const leadSay = chosen.say ? say(chosen.say, menuNode.config.voice) : ''
  const portId  = 'key_' + chosen.key
  const nextEdge = edges.find(e => e.from === menuNode.id && e.port === portId)

  if (!nextEdge) {
    console.warn('[twilio-menu] No edge for port "' + portId + '" from node "' + menuNode.id + '"')
    return res.send(wrap(leadSay + vmXml('That option is not yet configured. Please leave a message.')))
  }

  try {
    const rest = await walkFlow(nodes, edges, nextEdge.to, callData, supabase, 0)
    return res.send(wrap(leadSay + rest))
  } catch(e) {
    console.error('[twilio-menu] walkFlow error:', e.message)
    return res.send(wrap(vmXml('We encountered an error. Please leave a message.')))
  }
}
