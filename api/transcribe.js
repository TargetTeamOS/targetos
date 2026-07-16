// ═══════════════════════════════════════════════════════════════
// /api/transcribe — accepts an audio blob from the mic (base64) and
// returns a transcript via OpenAI Whisper. Uses Yiddish→English→
// Spanish priority (same approach proven for voicemail, since the
// team's calls are heavily Yiddish/English). This is the reliable
// path that doesn't depend on the phone browser's flaky built-in
// speech engine.
//
// Body: { audioBase64, mimeType }
// Returns: { text, language }
// ═══════════════════════════════════════════════════════════════
'use strict'

async function parseBody(req) {
  return new Promise((resolve) => {
    let d = ''
    req.on('data', c => { d += c })
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')) } catch { resolve({}) } })
    req.on('error', () => resolve({}))
  })
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')

  // Staged auth (same pattern as the other endpoints)
  const { requireUser } = require('./_lib/auth')
  const user = await requireUser(req)
  if (!user) {
    if (String(process.env.AUTH_ENFORCE || '').toLowerCase() === 'true') {
      return res.status(401).end(JSON.stringify({ error: 'unauthorized' }))
    }
    console.warn('[AUTH] unauthenticated call to /api/transcribe ALLOWED (log-only)')
  }

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    return res.status(500).end(JSON.stringify({ error: 'Transcription not configured (OPENAI_API_KEY missing)' }))
  }

  const body = await parseBody(req)
  const b64 = (body.audioBase64 || '').split(',').pop()   // strip data: prefix if present
  const mimeType = body.mimeType || 'audio/webm'
  if (!b64) return res.status(400).end(JSON.stringify({ error: 'No audio provided' }))

  let audioBuffer
  try { audioBuffer = Buffer.from(b64, 'base64') } catch { return res.status(400).end(JSON.stringify({ error: 'Bad audio encoding' })) }
  if (!audioBuffer.length) return res.status(400).end(JSON.stringify({ error: 'Empty audio' }))

  const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('mpeg') ? 'mp3' : mimeType.includes('wav') ? 'wav' : 'webm'
  const priorityOrder = ['yi', 'en', 'es']
  const CONFIDENCE_THRESHOLD = -0.5
  let bestSoFar = null

  try {
    for (const lang of priorityOrder) {
      let attempt = null
      try {
        const form = new FormData()
        form.append('file', new Blob([audioBuffer], { type: mimeType }), 'audio.' + ext)
        form.append('model', 'whisper-1')
        form.append('language', lang)
        form.append('response_format', 'verbose_json')

        const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + openaiKey },
          body: form,
        })
        if (r.ok) {
          const result = await r.json()
          const segments = result.segments || []
          const avgLogProb = segments.length
            ? segments.reduce((s, seg) => s + (seg.avg_logprob || -10), 0) / segments.length
            : -10
          attempt = { lang, text: (result.text || '').trim(), avgLogProb }
        } else {
          const errTxt = await r.text().catch(() => '')
          console.warn('[transcribe] whisper ' + lang + ' failed:', r.status, errTxt.slice(0, 120))
        }
      } catch (e) { console.warn('[transcribe] ' + lang + ' error:', e.message) }

      if (attempt && attempt.text) {
        if (!bestSoFar || attempt.avgLogProb > bestSoFar.avgLogProb) bestSoFar = attempt
        if (attempt.avgLogProb >= CONFIDENCE_THRESHOLD) break  // confident on higher-priority lang; stop
      }
    }

    if (!bestSoFar || !bestSoFar.text) {
      return res.status(200).end(JSON.stringify({ text: '', language: null, note: 'No speech detected' }))
    }
    return res.status(200).end(JSON.stringify({ text: bestSoFar.text, language: bestSoFar.lang }))
  } catch (e) {
    console.error('[transcribe] fatal:', e.message)
    return res.status(500).end(JSON.stringify({ error: e.message }))
  }
}
