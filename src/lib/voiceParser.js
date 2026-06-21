// ═══════════════════════════════════════════════════════════════
// SMART VOICE PARSER
// Handles: addresses, names, tasks, reminders, schedules
// ═══════════════════════════════════════════════════════════════

// ── ADDRESS DETECTION ─────────────────────────────────────────
// Matches: "47 Prairie Ave", "352 Blauvelt Rd Unit 201", "12 Sherman Drive #202"
const ADDRESS_RE = /\b(\d+)\s+([A-Za-z0-9\s]{2,30}(?:Ave|Avenue|Rd|Road|St|Street|Dr|Drive|Ln|Lane|Blvd|Boulevard|Ct|Court|Pl|Place|Way|Pkwy|Parkway|Hwy|Highway|Route|Rte|Unit|#)\s*[A-Za-z0-9\s#-]{0,20})/gi

// NY cities / neighborhoods commonly spoken
const KNOWN_PLACES = [
  'monsey','spring valley','suffern','nanuet','new city','nyack','haverstraw',
  'pomona','airmont','chestnut ridge','new hempstead','wesley hills','montebello',
  'sloatsburg','tallman','tallman ny','Tallman','hillburn','woodbury','harriman',
  'tuxedo','monroe','kiryas joel','KJ','cornwall','newburgh','middletown',
  'goshen','warwick','florida','chester','mahwah','ramsey','hillsdale',
  'river vale','park ridge','woodcliff lake','montvale','park ridge',
  'clarkstown','ramapo','stony point','tomkins cove','letchworth',
  'rockland lake','blauvelt','sparkill','snedens landing','grandview',
  'west haverstraw','stony point','tappan','orangeburg','pearl river','congers',
  'valley cottage','west nyack','blauvelt','bardonia','palisades','piermont',
  'upper nyack','south nyack','garnerville','thiells','pomona','airmont',
  'wesley hills','new hempstead','chestnut ridge','montebello','sloatsburg',
  'ramapo','mahwah','rockland','brooklyn','manhattan','queens','bronx',
  'staten island','new york','jersey city','hoboken','lakewood',
  'kiryas joel','monroe','woodbury','swan lake','liberty','fallsburg',
]

// ── NAME DETECTION ────────────────────────────────────────────
// Jewish/Hebrew/Yiddish names common in Rockland County
const KNOWN_NAMES = new Set([
  'moshe','shlomo','yosef','yaakov','menachem','avraham','yitzchak','shimon',
  'levi','dovid','mordechai','chaim','nachman','pinchas','eliyahu','aharon',
  'binyamin','tzvi','zev','baruch','chana','rivka','leah','rachel','miriam',
  'sarah','devorah','esther','malka','shira','tzipora','raizel','gittel',
  'faigy','chayele','baila','bracha','penina','naomi','yael','adina',
  'yanky','yankel','moishe','lazer','feivel','sruli','shloime','mendel',
  'gershon','nesanel','shmuel','refael','gavriel','uriel','yehuda','yehoshua',
  'fishel','leibish','mottel','pinny','srulik','yossi','motti','nosson',
  'avrumi','shloimi','moishi','benji','duvy','sruly','shimi','bentzion',
  'tzvi','hirsh','betzalel','akiva','nochum','velvel','heshy','gilly',
  'avigail','tzipporah','nechamie','menucha','shoshana','meirav','liora',
  'yehudis','zahava','tzirel','chaya','sheindel','ruchel','nechama',
  // Real estate client names common in area
  'jose','juan','carlos','miguel','luis','pedro','maria','rosa','elena',
  'rafael','antonio','francisco','roberto','jorge','manuel','alejandro',
  'aisha','fatima','omar','ali','hassan','ahmed','yusuf','ibrahim',
  'nuchem','boruch','velvel','berel','leiby','shmueli','hershy','yidel',
  'gitty','fradel','chanie','rivky','esty','deeny','perle','blima',
  // Common secular names
  'john','james','michael','david','daniel','robert','william','richard',
  'charles','joseph','thomas','christopher','matthew','anthony','mark',
  'donald','steven','paul','andrew','kenneth','joshua','kevin','brian',
  'george','edward','timothy','jason','jeffrey','ryan','jacob','gary',
  'nicholas','eric','jonathan','stephen','larry','justin','scott','brandon',
  'raymond','frank','benjamin','samuel','patrick','jack','dennis','jerry',
  'alexander','tyler','henry','douglas','peter','adam','nathan','zachary',
  'mary','patricia','jennifer','linda','barbara','elizabeth','susan',
  'jessica','sarah','karen','lisa','nancy','betty','margaret','sandra',
  'ashley','dorothy','kimberly','emily','donna','michelle','carol','amanda',
  'melissa','deborah','stephanie','rebecca','sharon','laura','cynthia',
  'navasir','vassar','colma', // ones that came up in testing
])

// Filler words to strip before name extraction
const FILLER_WORDS = new Set([
  'my','name','is','i','am','this','call','me','its',"it's",'hi','hey',
  'hello','the','a','an','and','or','with','number','phone','at','also',
  'new','lead','contact','note','adding','add','for','to','about','just',
  'um','uh','so','okay','ok','yeah','yes','no','well','like','you know',
  'reminder','task','schedule','appointment','meeting','remind','follow','up',
])

// ── TASK / INTENT DETECTION ───────────────────────────────────
const TASK_PATTERNS = [
  /\b(task|todo|to do|to-do|add task|create task|make task)\b/i,
  /\b(remember to|don't forget|need to|have to|must)\b/i,
  /\bfollow[\s-]?up\b/i,
  /\bcall\s+(back|them|him|her)\b/i,
]

const REMINDER_PATTERNS = [
  /\b(remind|reminder|remindme|remind me)\b/i,
  /\b(don't let me forget|make sure i|alert me)\b/i,
]

const SCHEDULE_PATTERNS = [
  /\b(schedule|appointment|meeting|showing|open house|set up)\b/i,
  /\b(at \d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i,
  /\b(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\b(next week|this week|next month)\b/i,
  /\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/,
]

// ── DATE/TIME EXTRACTION ──────────────────────────────────────
function extractDateTime(text) {
  const t = text.toLowerCase()
  const today = new Date()
  const result = { date: null, time: null, dateLabel: '' }

  // Time: "at 3pm", "at 10:30 am", "at noon"
  const timeMatch = t.match(/\bat\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i)
  if(timeMatch) {
    let h = parseInt(timeMatch[1])
    const m = timeMatch[2] ? parseInt(timeMatch[2]) : 0
    const ampm = timeMatch[3]
    if(ampm === 'pm' && h < 12) h += 12
    if(ampm === 'am' && h === 12) h = 0
    result.time = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
  }

  // Noon/midnight
  if(/\bnoon\b/.test(t)) result.time = '12:00'
  if(/\bmidnight\b/.test(t)) result.time = '00:00'

  // Date keywords
  const d = new Date(today)
  if(/\btoday\b/.test(t)) { result.date = toDateStr(d); result.dateLabel = 'Today' }
  else if(/\btomorrow\b/.test(t)) { d.setDate(d.getDate()+1); result.date = toDateStr(d); result.dateLabel = 'Tomorrow' }
  else if(/\bnext week\b/.test(t)) { d.setDate(d.getDate()+7); result.date = toDateStr(d); result.dateLabel = 'Next week' }
  else if(/\bmonday\b/.test(t)) { result.date = toDateStr(nextWeekday(today,1)); result.dateLabel = 'Monday' }
  else if(/\btuesday\b/.test(t)) { result.date = toDateStr(nextWeekday(today,2)); result.dateLabel = 'Tuesday' }
  else if(/\bwednesday\b/.test(t)) { result.date = toDateStr(nextWeekday(today,3)); result.dateLabel = 'Wednesday' }
  else if(/\bthursday\b/.test(t)) { result.date = toDateStr(nextWeekday(today,4)); result.dateLabel = 'Thursday' }
  else if(/\bfriday\b/.test(t)) { result.date = toDateStr(nextWeekday(today,5)); result.dateLabel = 'Friday' }
  else if(/\bsunday\b/.test(t)) { result.date = toDateStr(nextWeekday(today,0)); result.dateLabel = 'Sunday' }

  // Numeric date: "6/25", "6/25/2026"
  const numDate = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
  if(numDate && !result.date) {
    const year = numDate[3] ? (numDate[3].length===2?'20'+numDate[3]:numDate[3]) : today.getFullYear()
    result.date = `${year}-${String(numDate[1]).padStart(2,'0')}-${String(numDate[2]).padStart(2,'0')}`
    result.dateLabel = `${numDate[1]}/${numDate[2]}`
  }

  return result
}

function toDateStr(d) { return d.toISOString().split('T')[0] }
function nextWeekday(from, day) {
  const d = new Date(from); const cur = d.getDay()
  const diff = (day - cur + 7) % 7 || 7
  d.setDate(d.getDate() + diff); return d
}

// ── STRIP ADDRESS FROM NAME SEARCH ───────────────────────────
function stripAddresses(text) {
  return text.replace(ADDRESS_RE, '').replace(/\d+\s*(?:#|unit|apt)\s*\d+/gi, '').replace(/\s+/g,' ').trim()
}

// ── EXTRACT CLEAN NAME ────────────────────────────────────────
function extractName(text) {
  const noAddr = stripAddresses(text)
  // Remove phone numbers
  const noPhone = noAddr.replace(/\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}/g,'').replace(/\b\d{10,11}\b/g,'')
  // Remove filler + intent keywords
  const cleaned = noPhone
    .replace(/\b(task|todo|reminder|remind|schedule|appointment|meeting|showing|follow up|follow-up|call back|don't forget|remember to|need to|have to|at \d[\d:]*\s*(?:am|pm)?|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|this week)\b/gi,' ')
    .replace(/[^a-zA-Z\s'-]/g,' ')
    .replace(/\s+/g,' ').trim()

  const words = cleaned.split(' ').filter(w => w.length > 1 && !FILLER_WORDS.has(w.toLowerCase()))
  if(words.length === 0) return { first:'', last:'' }

  // Prefer known names
  const knownFirst = words.find(w => KNOWN_NAMES.has(w.toLowerCase()))
  if(knownFirst) {
    const idx = words.indexOf(knownFirst)
    const last = words[idx+1] && !FILLER_WORDS.has(words[idx+1].toLowerCase()) ? words[idx+1] : ''
    return { first: cap(knownFirst), last: cap(last) }
  }

  if(words.length === 1) return { first: cap(words[0]), last:'' }
  return { first: cap(words[0]), last: cap(words[words.length-1]) }
}

// ── PHONE EXTRACTION ──────────────────────────────────────────
function extractPhone(text) {
  const m = text.match(/\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}|\d{10,11}/)
  if(!m) return ''
  const digits = m[0].replace(/\D/g,'')
  if(digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  if(digits.length === 11 && digits[0]==='1') return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`
  return m[0]
}

// ── ADDRESS EXTRACTION ────────────────────────────────────────
function extractAddresses(text) {
  const addresses = []
  const matches = text.matchAll(ADDRESS_RE)
  for(const m of matches) addresses.push(m[0].trim())

  // Also check for city names
  const tl = text.toLowerCase()
  const city = KNOWN_PLACES.find(p => tl.includes(p))

  return { addresses, city: city ? cap(city) : '' }
}

// ── MAIN PARSE FUNCTION ───────────────────────────────────────
export function parseVoice(rawText) {
  const text = rawText.trim()
  const tl = text.toLowerCase()

  // Detect intents
  const isTask     = TASK_PATTERNS.some(re => re.test(text))
  const isReminder = REMINDER_PATTERNS.some(re => re.test(text))
  const isSchedule = SCHEDULE_PATTERNS.some(re => re.test(text))

  // Extract everything
  const phone    = extractPhone(text)
  const name     = extractName(text)
  const { addresses, city } = extractAddresses(text)
  const dateTime = extractDateTime(text)

  // Build intent summary
  const intents = []
  if(isTask || isReminder)  intents.push('task')
  if(isSchedule)            intents.push('schedule')
  if(phone || name.first)   intents.push('contact')
  if(addresses.length > 0)  intents.push('address')

  // Build clean note (preserve original but mark addresses)
  const cleanNote = text

  return {
    raw: text,
    // Contact info
    name,
    phone,
    // Address info
    addresses,
    city,
    // Scheduling
    dateTime,
    // Flags
    isTask,
    isReminder,
    isSchedule,
    intents,
    // Suggested actions based on content
    suggestions: buildSuggestions({ text, name, phone, addresses, dateTime, isTask, isReminder, isSchedule }),
  }
}

function buildSuggestions({ text, name, phone, addresses, dateTime, isTask, isReminder, isSchedule }) {
  const s = []

  if(name.first || phone) {
    s.push({ type:'contact', label:`Save as new contact — ${name.first} ${name.last}`.trim(), icon:'👤' })
  }
  if(isTask || isReminder) {
    const taskTitle = cleanTaskText(text)
    s.push({ type:'task', label:`Create task: "${taskTitle.slice(0,50)}"`, icon:'✓', title: taskTitle, dueDate: dateTime.date })
  }
  if(isSchedule && !isTask) {
    s.push({ type:'schedule', label:`Schedule: ${dateTime.dateLabel||''}${dateTime.time?' at '+fmtTime(dateTime.time):''}`.trim(), icon:'📅', dateTime })
  }
  if(addresses.length > 0) {
    s.push({ type:'address', label:`Address: ${addresses[0]}${addresses[0].toLowerCase().includes(text.toLowerCase().match(/monsey|spring valley|suffern|nanuet/i)?.[0]||'')?'':addresses.length>1?' + '+(addresses.length-1)+' more':''}`, icon:'🏠' })
  }
  // Always save as note
  s.push({ type:'note', label:'Save as note only', icon:'📝' })

  return s
}

function cleanTaskText(text) {
  return text
    .replace(/\b(remind me to|remember to|task|create task|add task|don't forget to|need to|have to)\b/gi, '')
    .replace(/\b(at \d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/gi, '')
    .replace(/\s+/g,' ').trim()
}

function fmtTime(t) {
  const [h,m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '' }
