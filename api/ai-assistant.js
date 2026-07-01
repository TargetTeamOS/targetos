// TargetOS V2 — AI Assistant proxy
// Routes Claude API calls through Vercel so the API key stays server-side
'use strict'

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in Vercel environment variables' })

  const { messages, system, max_tokens } = req.body || {}
  if (!messages?.length) return res.status(400).json({ error: 'messages required' })

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
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
      return res.status(response.status).json({ error: data.error?.message || 'Anthropic API error' })
    }
    return res.status(200).json(data)
  } catch(e) {
    return res.status(500).json({ error: e.message })
  }
}
