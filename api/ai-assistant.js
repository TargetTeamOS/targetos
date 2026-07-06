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

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const body = await parseBody(req)
  const { messages, system, max_tokens } = body
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
