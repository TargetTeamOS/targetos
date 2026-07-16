import { authFetch } from './apiAuth'
// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Voice Parser
// Parses transcribed speech into structured data.
// Tuned for Rockland County NY real estate terminology.
// ═══════════════════════════════════════════════════════════════

// ── PHONE DETECTION ──────────────────────────────────────────────
function detectPhone(text) {
  const cleaned = text.replace(/\s+/g, ' ')
  // Match common spoken formats: "845 555 1234", "(845) 555-1234", "8455551234"
  const patterns = [
    /\((\d{3})\)\s*(\d{3})[-.\s](\d{4})/,
    /(\d{3})[-.\s](\d{3})[-.\s](\d{4})/,
    /(\d{10})/,
    // Spoken digit groups: "eight four five five five five one two three four"
  ]
  for (const p of patterns) {
    const m = cleaned.match(p)
    if (m) {
      const digits = m[0].replace(/\D/g, '')
      if (digits.length === 10) {
        return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
      }
    }
  }
  // Try to find 10 consecutive digits spoken separately
  const digitWords = {
    'zero':'0','one':'1','two':'2','three':'3','four':'4',
    'five':'5','six':'6','seven':'7','eight':'8','nine':'9'
  }
  let digitStr = ''
  const words = cleaned.toLowerCase().split(/\s+/)
  for (const w of words) {
    if (digitWords[w]) digitStr += digitWords[w]
    else if (/^\d$/.test(w)) digitStr += w
    else if (digitStr.length > 0 && digitStr.length < 10) digitStr = '' // reset on non-digit
  }
  if (digitStr.length === 10) {
    return `(${digitStr.slice(0,3)}) ${digitStr.slice(3,6)}-${digitStr.slice(6)}`
  }
  return null
}

// ── NAME DETECTION ───────────────────────────────────────────────
function detectName(text) {
  // Look for "my name is X" or "this is X" or "it's X" patterns
  const patterns = [
    /(?:my name is|this is|it's|its|name is|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /^([A-Z][a-z]+\s+[A-Z][a-z]+)/m, // First Last at start
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) {
      const parts = m[1].trim().split(/\s+/)
      return { first: parts[0] || '', last: parts.slice(1).join(' ') || '' }
    }
  }
  // Fallback: first two capitalized words that aren't common words
  const stopWords = new Set(['I', 'A', 'The', 'This', 'Is', 'My', 'New', 'Hi', 'Hello', 'Hey'])
  const words = text.split(/\s+/).filter(w => /^[A-Z][a-z]{1,}$/.test(w) && !stopWords.has(w))
  if (words.length >= 2) return { first: words[0], last: words[1] }
  if (words.length === 1) return { first: words[0], last: '' }
  return { first: '', last: '' }
}

// ── ADDRESS DETECTION ────────────────────────────────────────────
function detectAddress(text) {
  const m = text.match(/(\d+\s+[A-Za-z][A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Court|Ct|Lane|Ln|Blvd|Boulevard|Way|Place|Pl|Circle|Cir))/i)
  return m ? m[1].trim() : null
}

// ── CITY DETECTION ───────────────────────────────────────────────
const LOCAL_CITIES = [
  'Monsey','Spring Valley','New City','Suffern','Nanuet','West Nyack',
  'Blauvelt','Chestnut Ridge','Wesley Hills','Pomona','Airmont',
  'Monroe','Garnerville','Haverstraw','Stony Point','Nyack','Pearl River',
  'Orangeburg','Tappan','Viola','Tallman','Thiells'
]

function detectCity(text) {
  for (const city of LOCAL_CITIES) {
    if (text.toLowerCase().includes(city.toLowerCase())) return city
  }
  return null
}

// ── DATE DETECTION ───────────────────────────────────────────────
function detectDate(text) {
  const t = text.toLowerCase()
  const today = new Date()

  if (t.includes('today')) return today.toISOString().slice(0, 10)
  if (t.includes('tomorrow')) {
    const d = new Date(today); d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  }
  if (t.includes('next week')) {
    const d = new Date(today); d.setDate(d.getDate() + 7)
    return d.toISOString().slice(0, 10)
  }

  const months = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11,
    january:0,february:1,march:2,april:3,june:5,july:6,august:7,september:8,october:9,november:10,december:11 }

  for (const [name, idx] of Object.entries(months)) {
    const re = new RegExp(`${name}\\s+(\\d{1,2})`, 'i')
    const m = t.match(re)
    if (m) {
      const d = new Date(today.getFullYear(), idx, parseInt(m[1]))
      return d.toISOString().slice(0, 10)
    }
  }

  const dateRe = /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/
  const dm = t.match(dateRe)
  if (dm) {
    const month = parseInt(dm[1]) - 1
    const day   = parseInt(dm[2])
    const year  = dm[3] ? (dm[3].length === 2 ? 2000 + parseInt(dm[3]) : parseInt(dm[3])) : today.getFullYear()
    const d = new Date(year, month, day)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }

  return null
}

// ── INTENT DETECTION ─────────────────────────────────────────────
function detectIntent(text) {
  const t = text.toLowerCase()
  const taskWords    = ['call','follow up','follow-up','remind','schedule','meeting','appointment','task','todo','to do','check in']
  const noteWords    = ['note','remember','memo','wrote','writing','detail','info','information']
  const contactWords = ['new lead','new contact','prospect','client','buyer','seller','lead']

  let scores = { contact: 0, task: 0, note: 0 }
  for (const w of taskWords)    if (t.includes(w)) scores.task++
  for (const w of noteWords)    if (t.includes(w)) scores.note++
  for (const w of contactWords) if (t.includes(w)) scores.contact++

  // If phone found, lean toward contact
  if (detectPhone(text)) scores.contact += 2

  const max = Math.max(scores.contact, scores.task, scores.note)
  if (max === 0) return 'contact' // default
  if (scores.contact === max) return 'contact'
  if (scores.task === max) return 'task'
  return 'note'
}

// ── MAIN PARSE FUNCTION ──────────────────────────────────────────
import { parseVoice as parseVoiceRich, correctNameToken } from './voiceParser'

export function parseVoice(text) {
  if (!text || !text.trim()) return null

  // Use the rich Rockland-County + Jewish/Yiddish-name parser (with
  // phonetic mishear corrections). Fall back to the simple detectors
  // only for anything it doesn't return.
  let rich = null
  try { rich = parseVoiceRich(text) } catch { /* fall back below */ }

  const name    = (rich?.name?.first || rich?.name?.last) ? rich.name : detectName(text)
  const phone   = rich?.phone || detectPhone(text)
  const address = (rich?.addresses && rich.addresses[0]) || detectAddress(text)
  const city    = rich?.city || detectCity(text)
  const date    = (rich?.dateTime && (rich.dateTime.iso || rich.dateTime.date)) || detectDate(text)
  const intent  = rich?.intents?.[0] || detectIntent(text)

  return {
    rawText: (rich?.raw || text).trim(),   // note: rich.raw is phonetically corrected
    name,
    phone,
    address,
    city,
    date,
    intent,
    interest:   address || '',
    hasName:    !!(name?.first),
    hasPhone:   !!phone,
    hasAddress: !!address,
    hasDate:    !!date,
  }
}

// ── AI-POWERED PARSE (replaces rigid regex matching) ────────────────
// Uses the existing /api/ai-assistant endpoint -- works today via
// Claude (already configured), no OpenAI dependency for this part.
// Falls back to the regex-based parseVoice() above if the AI call
// fails for any reason (no key configured, network error, bad JSON
// back) so the feature never fully breaks.
export async function parseVoiceWithAI(text, authHeaders) {
  if (!text?.trim()) return null
  const today = new Date().toISOString().slice(0, 10)

  const system = 'You are a voice-command parser for a real estate CRM used in Rockland County, NY. ' +
    'The agent just spoke a command that should become a CONTACT, TASK, CALENDAR EVENT, or NOTE. ' +
    'Extract ONLY a JSON object, no markdown fences, no explanation, matching this exact shape:\n' +
    '{"intent":"contact"|"task"|"event"|"note",' +
    '"first_name":string|null,"last_name":string|null,' +
    '"phone":string|null (format as (XXX) XXX-XXXX),"email":string|null,"address":string|null,' +
    '"title":string|null (short title, for task/event),' +
    '"notes":string (a clean, well-written summary of what was said),' +
    '"due_date":string|null (YYYY-MM-DD, resolve relative dates like tomorrow/next Friday using today\'s date),' +
    '"event_time":string|null (HH:MM 24-hour, only if a specific time was mentioned),' +
    '"reminder_days":number|null (days BEFORE due_date to send a reminder, only if the agent asked for an early reminder; null means remind exactly on the due date)}\n' +
    'Today\'s date is ' + today + '. Return ONLY the JSON object.'

  try {
    const res = await authFetch('/api/ai-assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(authHeaders || {}) },
      body: JSON.stringify({
        system,
        max_tokens: 500,
        messages: [{ role: 'user', content: text }],
      }),
    })
    if (!res.ok) throw new Error('AI parse request failed')
    const data = await res.json()
    const raw = data.content?.[0]?.text || ''
    const clean = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)

    return {
      rawText: text.trim(),
      intent:  parsed.intent || 'note',
      name:    { first: correctNameToken(parsed.first_name || ''), last: correctNameToken(parsed.last_name || '') },
      phone:   parsed.phone || null,
      email:   parsed.email || null,
      address: parsed.address || null,
      title:   parsed.title || null,
      notes:   parsed.notes || text.trim(),
      date:    parsed.due_date || null,
      eventTime: parsed.event_time || null,
      reminderDays: parsed.reminder_days || null,
      hasName:    !!(parsed.first_name),
      hasPhone:   !!parsed.phone,
      hasAddress: !!parsed.address,
      hasDate:    !!parsed.due_date,
      aiParsed:   true,
    }
  } catch(e) {
    console.warn('[parseVoiceWithAI] falling back to regex parser:', e.message)
    return { ...parseVoice(text), aiParsed: false }
  }
}

// ── VOICE RECORDING ──────────────────────────────────────────────
export function startRecording(onResult, onError) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognition) {
    onError?.('Voice not supported in this browser. Try Chrome.')
    return null
  }

  const rec = new SpeechRecognition()
  rec.lang = 'en-US'
  rec.continuous = false
  rec.interimResults = false
  rec.maxAlternatives = 1

  rec.onresult = (e) => {
    const transcript = e.results[0][0].transcript
    onResult?.(transcript)
  }

  rec.onerror = (e) => {
    if (e.error !== 'no-speech' && e.error !== 'aborted') {
      onError?.(e.error)
    }
  }

  try {
    rec.start()
  } catch(e) {
    onError?.('Could not start microphone')
  }

  return rec
}
