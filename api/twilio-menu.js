// TargetOS V2 — Twilio IVR Menu Handler
// Handles a keypress and continues walking the flow graph using the
// SAME shared walkFlow as twilio-inbound.js (see _lib/call-flow.js) —
// this guarantees every node type behaves identically whether it's the
// first step of a call or reached after a menu/language selection.
'use strict'

const querystring = require('querystring')
const { walkFlow, wrap, say, vmXml, storeMenuContext, loadMenuContext } = require('./_lib/call-flow')

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

// ── MAIN HANDLER ─────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  if (req.method !== 'POST') return res.status(405).end()

  let body = {}
  try { body = querystring.parse(await getRawBody(req)) } catch(e) { body = req.body || {} }

  const digits = body.Digits || ''
  const from   = body.From   || ''
  const to     = body.To     || ''

  const supabase = getSupabase()
  const fallbackVm = wrap(vmXml(null))

  // Parse context from query string — prefer the short ctxId (DB-backed),
  // fall back to the legacy full-JSON ctx param for backward compatibility
  const rawUrl = req.url || ''
  const qIdx = rawUrl.indexOf('?')
  let ctxParam = null, ctxIdParam = null
  if (qIdx >= 0) {
    const qs = rawUrl.slice(qIdx + 1)
    const qParsed = querystring.parse(qs)
    ctxParam   = qParsed.ctx   || null
    ctxIdParam = qParsed.ctxId || null
  }
  if (!ctxParam && body.ctx) ctxParam = body.ctx
  if (!ctxIdParam && body.ctxId) ctxIdParam = body.ctxId

  let ctx = null
  if (ctxIdParam) {
    ctx = await loadMenuContext(supabase, ctxIdParam)
  }
  if (!ctx && ctxParam) {
    try { ctx = JSON.parse(decodeURIComponent(ctxParam)) } catch(e) { ctx = null }
  }

  if (ctx) {
    try {
      const nodes = ctx.nodes || []
      const edges = ctx.edges || []
      const menuNodeId = ctx.menuNodeId

      const menuNode = nodes.find(n => n.id === menuNodeId)
      if (menuNode && menuNode.config && menuNode.config.options) {
        const opts = menuNode.config.options
        const chosen = opts.find(o => String(o.key) === String(digits))

        // Look up caller contact so downstream condition/assigned nodes work correctly
        let contact = null
        if (supabase && from) {
          const cleanPhone = from.replace(/\D/g, '').slice(-10)
          const cr = await supabase.from('contacts').select('id,first_name,last_name,agent_id').or('phone.ilike.%' + cleanPhone + '%').maybeSingle()
          contact = cr.data || null
        }
        const callData = { from, to, contact }

        if (chosen) {
          const leadSay = chosen.say ? say(chosen.say) : ''
          const portId = 'key_' + chosen.key
          const nextEdge = edges.find(e => e.from === menuNodeId && e.port === portId)

          if (nextEdge) {
            // Continue walking the SAME shared flow logic used everywhere else —
            // every node type (hold, audio, listings, mlssearch, assigned, etc.)
            // is fully supported here, not just a handful like before.
            const rest = await walkFlow(nodes, edges, nextEdge.to, callData, supabase, 0)
            return res.send(wrap(leadSay + rest))
          }

          // No edge connected for this key — check legacy direct-extension action
          if (chosen.action === 'extension' && chosen.value && supabase) {
            const extRes = await supabase.from('phone_extensions').select('*').eq('number', String(chosen.value)).eq('active', true).maybeSingle()
            const ext = extRes.data
            if (ext && ext.forward_to) {
              return res.send(wrap(
                leadSay +
                say('Connecting you to ' + ext.label + '.') +
                '<Dial callerId="' + to + '" timeout="30" record="record-from-answer" recordingStatusCallback="/api/twilio-status">' +
                  '<Number>' + ext.forward_to + '</Number></Dial>' +
                vmXml(ext.voicemail_greeting)
              ))
            }
          }
          if (chosen.action === 'voicemail') return res.send(wrap(leadSay + vmXml(null)))
        }

        // No match — replay the menu
        const replayCtxId = await storeMenuContext(supabase, ctx)
        const replayUrl = replayCtxId
          ? '/api/twilio-menu?ctxId=' + replayCtxId
          : '/api/twilio-menu?ctx=' + encodeURIComponent(JSON.stringify(ctx))
        let replayTwiml = '<Gather numDigits="1" action="' + replayUrl + '" method="POST" timeout="' + (menuNode.config.timeout || 10) + '">'
        replayTwiml += say('Invalid selection. ' + (menuNode.config.text || 'Please try again.'))
        replayTwiml += '</Gather>'
        replayTwiml += say('We did not receive your selection. Goodbye.')
        return res.send(wrap(replayTwiml))
      }
    } catch(e) {
      console.error('menu ctx parse error:', e.message)
    }
  }

  // ── LEGACY IVR MODE (no flow graph — old-style phone_ivr menu_options) ──
  if (!supabase) return res.send(fallbackVm)

  try {
    if (digits === '9') return res.send(wrap(vmXml(null)))

    const ivrRes = await supabase.from('phone_ivr').select('*').eq('is_active', true).maybeSingle()
    const ivr = ivrRes.data
    const options = (ivr && Array.isArray(ivr.menu_options)) ? ivr.menu_options : []

    if (digits === String((ivr && ivr.voicemail_extension) || '9')) return res.send(wrap(vmXml(null)))

    const chosen2 = options.find(o => String(o.key) === String(digits))
    if (!chosen2) {
      return res.send(wrap(say('Invalid selection.') + '<Redirect>/api/twilio-inbound</Redirect>'))
    }
    if (chosen2.action === 'voicemail') return res.send(wrap(vmXml(null)))

    if (chosen2.action === 'extension') {
      const extRes2 = await supabase.from('phone_extensions').select('*').eq('number', String(chosen2.value)).eq('active', true).maybeSingle()
      const ext3 = extRes2.data
      if (ext3 && ext3.forward_to) {
        return res.send(wrap(
          say('Connecting you to ' + ext3.label + '.') +
          '<Dial callerId="' + to + '" timeout="30" record="record-from-answer" recordingStatusCallback="/api/twilio-status">' +
            '<Number>' + ext3.forward_to + '</Number></Dial>' +
          vmXml(ext3.voicemail_greeting)
        ))
      }
    }

    if (chosen2.action === 'round_robin') {
      const rrRes = await supabase.from('phone_routing').select('*').eq('rule_type','round_robin').eq('is_active',true).maybeSingle()
      const ids3 = (rrRes.data && rrRes.data.config && rrRes.data.config.agent_ids) || []
      if (ids3.length > 0) {
        const recentRes3 = await supabase.from('calls').select('agent_id').eq('direction','Inbound').in('agent_id',ids3).order('called_at',{ascending:false}).limit(200)
        const counts3 = {}; ids3.forEach(id => { counts3[id] = 0 })
        ;(recentRes3.data || []).forEach(c => { if (counts3[c.agent_id] !== undefined) counts3[c.agent_id]++ })
        const nextId3 = ids3.reduce((a,b) => counts3[a] <= counts3[b] ? a : b)
        const extRes3 = await supabase.from('phone_extensions').select('*').eq('agent_id', nextId3).eq('active', true).maybeSingle()
        const ext4 = extRes3.data
        if (ext4 && ext4.forward_to) {
          return res.send(wrap(
            say('Connecting you to the next available agent.') +
            '<Dial callerId="' + to + '" timeout="30" record="record-from-answer" recordingStatusCallback="/api/twilio-status">' +
              '<Number>' + ext4.forward_to + '</Number></Dial>' +
            vmXml(null)
          ))
        }
      }
    }

    return res.send(wrap(vmXml(null)))
  } catch(err) {
    console.error('menu error:', err.message)
    return res.send(wrap(vmXml(null)))
  }
}
