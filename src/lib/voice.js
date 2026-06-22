/* ═══════════════════════════════════════════════════════════════
   TargetOS V2 — Voice Parser
   Parses natural speech into structured real estate data.
   Tuned for Rockland County NY real estate agents.
   ═══════════════════════════════════════════════════════════════ */

// ── PHONE DETECTION ───────────────────────────────────────────────
function detectPhone(text) {
  const clean = text.replace(/\b(one|two|three|four|five|six|seven|eight|nine|zero|oh)\b/gi, d => ({
    one:'1',two:'2',three:'3',four:'4',five:'5',
    six:'6',seven:'7',eight:'8',nine:'9',zero:'0',oh:'0'
  })[d.toLowerCase()])

  const matches = clean.match(/\b(\d[\d\s\-\.\(\)]{8,}\d)\b/)
  if (!matches) return null
  const digits = matches[1].replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits[0] === '1') return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`
  return null
}

// ── NAME DETECTION ────────────────────────────────────────────────
// Common names in Rockland County / Target Team's market
const FIRST_NAMES = new Set([
  // Jewish/Hebrew names common in area
  'yanky','yankel','moishe','lazer','feivel','sruli','shloime','mendel','gershon',
  'nesanel','shmuel','refael','gavriel','uriel','yehuda','yehoshua','fishel',
  'leibish','mottel','pinny','srulik','yossi','motti','nosson','avrumi','shloimi',
  'moishi','benji','duvy','sruly','shimi','bentzion','tzvi','hirsh','betzalel',
  'akiva','nochum','velvel','heshy','avigail','tzipporah','nechamie','menucha',
  'shoshana','meirav','liora','yehudis','zahava','tzirel','chaya','sheindel',
  'ruchel','nechama','avraham','avrohom','dovid','duvid','moshe','meir','yitzchok',
  'binyamin','nachman','leiby','shlomo','chaim','eliezer','pinchas','shimon',
  // Common English names
  'john','jane','michael','mike','sarah','david','james','robert','mary',
  'william','richard','joseph','thomas','charles','jessica','ashley','emily',
  'matthew','anthony','mark','donald','steven','paul','andrew','kenneth',
  'george','joshua','kevin','brian','edward','ronald','timothy','jason',
  'jeffrey','ryan','jacob','gary','nicholas','eric','jonathan','stephen',
  // Hispanic names common in area
  'jose','juan','carlos','miguel','luis','pedro','maria','rosa','elena',
  'rafael','antonio','francisco','roberto','jorge','manuel','alejandro',
  'isabella','sofia','camila','valentina','samuel','angel','daniel',
])

function detectName(text) {
  // Pattern: "Name is X Y" or "call X Y" or "contact X Y" or just "X Y" at start
  const patterns = [
    /(?:name(?:\s+is)?|called?|contact|new lead|lead is|client is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/i,
    /^([A-Z][a-z]+\s+[A-Z][a-z]+)(?:\s+\d|\s+at|\s+from|\s+in)/i,
    /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b(?=\s+(?:\d{3}|\(|\+))/,
  ]

  for (const pattern of patterns) {
    const m = text.match(pattern)
    if (m) {
      const parts = m[1].trim().split(/\s+/)
      const first = parts[0]
      if (FIRST_NAMES.has(first.toLowerCase()) || /^[A-Z]/.test(first)) {
        return {
          first: parts[0],
          last:  parts.slice(1).join(' ') || '',
          full:  m[1].trim()
        }
      }
    }
  }

  // Fallback: look for consecutive capitalized words not at sentence start
  const words = text.split(/\s+/)
  for (let i = 0; i < words.length - 1; i++) {
    const w1 = words[i].replace(/[^a-zA-Z]/g, '')
    const w2 = words[i+1].replace(/[^a-zA-Z]/g, '')
    if (
      w1.length > 1 && /^[A-Z]/.test(w1) &&
      w2.length > 1 && /^[A-Z]/.test(w2) &&
      FIRST_NAMES.has(w1.toLowerCase())
    ) {
      return { first: w1, last: w2, full: `${w1} ${w2}` }
    }
  }

  return null
}

// ── ADDRESS DETECTION ─────────────────────────────────────────────
const STREET_TYPES = [
  'avenue','ave','road','rd','street','st','drive','dr','lane','ln',
  'boulevard','blvd','court','ct','place','pl','way','parkway','pkwy',
  'highway','hwy','route','rte','terrace','ter','circle','cir','loop',
  'trail','trl','path','pass','crest','ridge','glen','hill','lake',
  'creek','park','commons','square','sq','crossing','xing','bridge',
  'point','pt','bay','cove','meadow','field','view','vista','heights',
  'manor','estates','gardens','pines','oak','elm','maple','cedar',
  'willow','cherry','forest','mill','spring','branch','hollow','row',
]

function detectAddress(text) {
  const streetPattern = new RegExp(
    `\\b(\\d+)\\s+([A-Za-z0-9\\s]{2,35}?\\s+(?:${STREET_TYPES.join('|')}))\\b`,
    'gi'
  )
  const match = text.match(streetPattern)
  return match ? match[0].trim() : null
}

// ── DATE/TIME DETECTION ───────────────────────────────────────────
const ROCKLAND_CITIES = [
  'monsey','spring valley','suffern','nanuet','new city','nyack','haverstraw',
  'pomona','airmont','chestnut ridge','new hempstead','wesley hills','montebello',
  'sloatsburg','tallman','hillburn','woodbury','harriman','tuxedo','monroe',
  'kiryas joel','cornwall','newburgh','middletown','goshen','warwick','florida',
  'chester','mahwah','ramsey','hillsdale','river vale','park ridge',
  'woodcliff lake','montvale','clarkstown','ramapo','stony point','blauvelt',
  'sparkill','orangeburg','pearl river','tappan','west nyack','congers',
]

function detectCity(text) {
  const lower = text.toLowerCase()
  for (const city of ROCKLAND_CITIES) {
    if (lower.includes(city)) return city.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
  }
  return null
}

function detectDateTime(text) {
  const lower = text.toLowerCase()
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  let date = null
  let dateLabel = null

  // Relative dates
  if (/\btoday\b/.test(lower)) {
    date = todayStr; dateLabel = 'Today'
  } else if (/\btomorrow\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 1)
    date = d.toISOString().split('T')[0]; dateLabel = 'Tomorrow'
  } else if (/\bnext week\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 7)
    date = d.toISOString().split('T')[0]; dateLabel = 'Next week'
  } else {
    // Day names
    const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
    for (let i = 0; i < days.length; i++) {
      if (lower.includes(days[i])) {
        const d = new Date(today)
        const targetDay = i
        const currentDay = d.getDay()
        let diff = targetDay - currentDay
        if (diff <= 0) diff += 7
        d.setDate(d.getDate() + diff)
        date = d.toISOString().split('T')[0]
        dateLabel = days[i].charAt(0).toUpperCase() + days[i].slice(1)
        break
      }
    }
  }

  // Time detection
  let time = null
  const timeMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)\b/)
  if (timeMatch) {
    let h = parseInt(timeMatch[1])
    const m = timeMatch[2] || '00'
    const ampm = timeMatch[3].toLowerCase()
    if (ampm === 'pm' && h !== 12) h += 12
    if (ampm === 'am' && h === 12) h = 0
    time = `${String(h).padStart(2,'0')}:${m}`
  }

  return date ? { date, dateLabel, time } : null
}

// ── INTENT DETECTION ──────────────────────────────────────────────
function detectIntent(text) {
  const lower = text.toLowerCase()

  if (/\b(note|remember|memo)\b/.test(lower)) return 'note'
  if (/\b(schedule|appointment|showing|meeting|open house)\b/.test(lower)) return 'schedule'
  if (/\b(remind|reminder|follow up|call back|callback|task|todo|to-do)\b/.test(lower)) return 'task'
  if (/\b(new lead|new contact|add contact|save contact|client|buyer|seller)\b/.test(lower)) return 'contact'

  return 'unknown'
}

// ── SOURCE DETECTION ──────────────────────────────────────────────
function detectSource(text) {
  const lower = text.toLowerCase()
  if (/sign call|sign/.test(lower))        return 'Sign Call'
  if (/open house/.test(lower))            return 'Open House'
  if (/referral|referred/.test(lower))     return 'Referral'
  if (/zillow/.test(lower))               return 'Zillow'
  if (/social media|instagram|facebook/.test(lower)) return 'Social Media'
  if (/cold call/.test(lower))            return 'Cold Call'
  if (/past client/.test(lower))          return 'Past Client'
  return 'Voice Capture'
}

// ── MAIN PARSER ───────────────────────────────────────────────────
export function parseVoice(text) {
  if (!text?.trim()) return null

  const name     = detectName(text)
  const phone    = detectPhone(text)
  const address  = detectAddress(text)
  const city     = detectCity(text)
  const dateTime = detectDateTime(text)
  const intent   = detectIntent(text)
  const source   = detectSource(text)

  return {
    rawText:  text.trim(),
    intent,
    name,
    phone,
    address,
    city,
    dateTime,
    source,
    // Confidence scores to show user what was detected
    confidence: {
      hasName:    !!name,
      hasPhone:   !!phone,
      hasAddress: !!address,
      hasDate:    !!dateTime?.date,
    }
  }
}
