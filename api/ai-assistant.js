// TargetOS V2 — AI Assistant proxy
// Supports both OpenAI (ChatGPT) and Anthropic (Claude)
// Set OPENAI_API_KEY in Vercel to use ChatGPT
// Set ANTHROPIC_API_KEY in Vercel to use Claude
// If both are set, OpenAI takes priority
'use strict'

async function parseBody(req) {
  return new Promise((ok, err) => {
    let d = ''
    req.on('data', c => { d += c })
    req.on('end', () => { try { ok(JSON.parse(d || '{}')) } catch { ok({}) } })
    req.on('error', err)
  })
}

const { requireAnyAgent } = require('./_lib/phone')

module.exports = async function handler(req, res) {
  // HARDENED (July 2026): caller authentication with staged rollout,
  // same pattern as TWILIO_SIG_ENFORCE. Log-only until AUTH_ENFORCE
  // is set to 'true' in Vercel — watch logs for '[AUTH]' lines, flip
  // the env var when clean. Kill-switch: set it back to 'false'.
  const { requireUser } = require('./_lib/auth')
  const __user = await requireUser(req)
  if (!__user) {
    if (String(process.env.AUTH_ENFORCE || '').toLowerCase() === 'true') {
      console.warn('[AUTH] BLOCKED unauthenticated call to ' + req.url)
      res.statusCode = 401; res.setHeader('Content-Type','application/json'); return res.end(JSON.stringify({ error: 'unauthorized' }))
    }
    console.warn('[AUTH] unauthenticated call to ' + req.url + ' ALLOWED (log-only — set AUTH_ENFORCE=true in Vercel to block)')
  }
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // CRITICAL: forwards to OpenAI/Anthropic using OUR API key, at our
  // cost, with an attacker-controllable max_tokens. Had ZERO auth
  // until July 2026.
  const authCheck = await requireAnyAgent(req)
  if (!authCheck.ok) return res.status(authCheck.status).json({ error: authCheck.message })

  const body = await parseBody(req)
  const { messages, system } = body
  // Cap max_tokens server-side regardless of what the client sends —
  // an authenticated agent shouldn't be able to request an
  // arbitrarily expensive response either.
  const max_tokens = Math.min(Number(body.max_tokens) || 1000, 2000)
  if (!messages?.length) return res.status(400).json({ error: 'messages required' })

  const openaiKey    = process.env.OPENAI_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY

  if (!openaiKey && !anthropicKey) {
    return res.status(500).json({
      error: 'No AI API key configured. Add OPENAI_API_KEY or ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables.'
    })
  }

  try {
    // ── OpenAI (ChatGPT) ──────────────────────────────────────────
    if (openaiKey) {
      const openaiMessages = []
      if (system) openaiMessages.push({ role: 'system', content: system })
      messages.forEach(m => openaiMessages.push({ role: m.role, content: m.content }))

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer ' + openaiKey,
        },
        body: JSON.stringify({
          model:      'gpt-4o',
          max_tokens: max_tokens || 1000,
          messages:   openaiMessages,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        return res.status(response.status).json({ error: data.error?.message || 'OpenAI error' })
      }

      // Normalize to Anthropic-style response so frontend works with both
      const text = data.choices?.[0]?.message?.content || ''
      return res.status(200).json({ content: [{ type: 'text', text }] })
    }

    // ── Anthropic (Claude) ────────────────────────────────────────
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: max_tokens || 1000,
        system:     system || '',
        messages,
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Anthropic error' })
    }
    return res.status(200).json(data)

  } catch(e) {
    return res.status(500).json({ error: e.message })
  }
}
