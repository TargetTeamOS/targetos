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
export function parseVoice(text) {
  if (!text || !text.trim()) return null

  const name    = detectName(text)
  const phone   = detectPhone(text)
  const address = detectAddress(text)
  const city    = detectCity(text)
  const date    = detectDate(text)
  const intent  = detectIntent(text)

  return {
    rawText: text.trim(),
    name,
    phone,
    address,
    city,
    date,
    intent,
    hasName:    !!(name?.first),
    hasPhone:   !!phone,
    hasAddress: !!address,
    hasDate:    !!date,
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
    onResult?.(transcript, parseVoice(transcript))
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
