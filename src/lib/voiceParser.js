// ═══════════════════════════════════════════════════════════════
// SMART VOICE PARSER
// Handles: addresses, names, tasks, reminders, schedules
// ═══════════════════════════════════════════════════════════════

// ── ADDRESS DETECTION ─────────────────────────────────────────
// Matches: "47 Prairie Ave", "352 Blauvelt Rd Unit 201", "12 Sherman Drive #202"
const ADDRESS_RE = /\b(\d+)\s+([A-Za-z0-9\s]{2,30}(?:Ave|Avenue|Rd|Road|St|Street|Dr|Drive|Ln|Lane|Blvd|Boulevard|Ct|Court|Pl|Place|Way|Pkwy|Parkway|Hwy|Highway|Route|Rte|Unit|#)\s*[A-Za-z0-9\s#-]{0,20})/gi

// NY cities / neighborhoods commonly spoken
// ── ROCKLAND COUNTY — CITIES, HAMLETS, NEIGHBORHOODS ────────────
const KNOWN_PLACES = [
  // Cities & Villages
  'monsey','spring valley','suffern','nanuet','new city','nyack','haverstraw',
  'pomona','airmont','chestnut ridge','new hempstead','wesley hills','montebello',
  'sloatsburg','tallman','hillburn','woodbury','harriman',
  'tuxedo','monroe','kiryas joel','KJ','cornwall','newburgh','middletown',
  'goshen','warwick','florida','chester',
  'clarkstown','ramapo','stony point','tomkins cove',
  'rockland lake','blauvelt','sparkill','grandview',
  'west haverstraw','tappan','orangeburg','pearl river','congers',
  'valley cottage','west nyack','bardonia','palisades','piermont',
  'upper nyack','south nyack','garnerville','thiells',
  // NJ nearby
  'mahwah','ramsey','hillsdale','river vale','park ridge','woodcliff lake','montvale',
  // Other NY
  'brooklyn','manhattan','queens','bronx','staten island',
  'jersey city','hoboken','lakewood','brooklyn','boro park','williamsburg',
  'flatbush','kensington','midwood','crown heights','borough park',
]

// ── ROCKLAND COUNTY — STREETS & ADDRESSES ────────────────────────
// Common street names spoken in voice captures — helps parser
// recognize when someone says a Rockland address
const ROCKLAND_STREETS = new Set([
  // Route numbers & Highways
  'route 9w','route 306','route 45','route 59','route 202','route 304','route 340',
  'rt 9w','rt 306','rt 45','rt 59','rt 202','rt 304','rt 340',
  'new hempstead road','new hempstead rd',
  'route 9','route 17','route 304','route 340',
  // Monsey / Airmont
  'blauvelt road','blauvelt rd','main street','main st',
  'saddle river road','saddle river rd',
  'viola road','viola rd',
  'spook rock road','spook rock rd',
  'dutch hill road','dutch hill rd',
  'kearsing parkway','kearsing pkwy',
  'grove street','grove st',
  'warren court','warren ct',
  'calvert drive','calvert dr',
  'jeffrey place','jeffrey pl',
  'prime lane','prime ln',
  'nesher court','nesher ct',
  'lane street','lane st',
  'haskell avenue','haskell ave',
  'park lane','park ln',
  'west maple avenue','west maple ave','w maple ave',
  'cloverdale lane','cloverdale ln',
  'hilda lane','hilda ln',
  'miele road','miele rd',
  'horton drive','horton dr',
  'memorial park drive','memorial park dr',
  's remsen street','south remsen st','south remsen street',
  'remsen avenue','remsen ave',
  'maple avenue','maple ave',
  'bakertown road','bakertown rd',
  'church road','church rd',
  'forest avenue','forest ave',
  'ridge avenue','ridge ave',
  'woodland place','woodland pl',
  'airmont road','airmont rd',
  // Spring Valley
  'union road','union rd',
  'northbrook road','northbrook rd',
  'ellish parkway','ellish pkwy',
  'twin avenue','twin ave',
  'funston avenue','funston ave','e funston','w funston',
  'yale drive','yale dr',
  'oxford court','oxford ct',
  'parkview drive','parkview dr',
  'gladys drive','gladys dr',
  'alan road','alan rd',
  'division avenue','division ave',
  'francis place','francis pl','francis avenue','francis ave',
  'rigaud road','rigaud rd',
  'sneden court','sneden ct',
  'south cole court','south cole ct','s cole ct',
  'merrick lane','merrick ln',
  'buckman place','buckman pl',
  'paikin drive','paikin dr',
  'flint drive','flint dr',
  'fairview avenue','fairview ave',
  'greene road','greene rd',
  'sharon drive','sharon dr',
  'memory lane','memory ln',
  'evergreen drive','evergreen dr',
  'birchwood avenue','birchwood ave',
  // Suffern
  'washington avenue','washington ave',
  'bridge street','bridge st',
  'brook street','brook st','brook st suffern',
  'van orden avenue','van orden ave',
  'silverwood circle','silverwood cir',
  'smith hill road','smith hill rd',
  'clinton place','clinton pl',
  'prairie avenue','prairie ave',
  // New City / Nanuet
  'west burda','w burda',
  'zabella drive','zabella dr',
  'karsten drive','karsten dr',
  'valley drive','valley dr',
  'tennyson drive','tennyson dr',
  'freedman avenue','freedman ave',
  'n pascack road','north pascack road','n pascack rd',
  'medford place','medford pl',
  'lilburn drive','lilburn dr',
  // Nyack
  'south broadway','s broadway',
  'catherine street','catherine st',
  'broadway nyack','broadway haverstraw',
  'old nyack turnpike','old nyack tpke',
  'depew avenue','depew ave',
  'main street nyack',
  'north broadway','n broadway',
  'upper myrtle avenue','upper myrtle ave',
  // Haverstraw
  'pratt street','pratt st',
  'church street','church st haverstraw',
  'broadway haverstraw',
  // Other
  'old haverstraw road','old haverstraw rd',
  'central avenue','central ave',
  'saddle river','saddle river back unit',
  'amherst road','amherst rd',
])

// ── NAME DETECTION ────────────────────────────────────────────
// Jewish/Hebrew/Yiddish names common in Rockland County
// ── JEWISH / YIDDISH / HEBREW NAMES — COMPREHENSIVE ─────────────
// Covers the full range of names used in the Rockland County
// Orthodox / Chassidic community, including common variations
// and how they sound when spoken aloud.
const KNOWN_NAMES = new Set([
  // ── MALE — Hebrew / Biblical ──────────────────────────────────
  'moshe','moishe','moishi','moshiach',
  'shlomo','shloime','shloimi','shloimy',
  'yosef','yossi','yoss','yossie','yusuf',
  'yaakov','yankev','yankel','yanky','yaki',
  'menachem','mendel','mendy','mendi',
  'avraham','avrohom','avrum','avrumi','avremele','avrahamie',
  'yitzchak','yitzchok','itzy','itzik','itzikl',
  'shimon','simcha','simche','simchy',
  'levi','levie','levy','leivi',
  'dovid','david','duvid','duvy','duvi','dave',
  'mordechai','mottel','mottl','mordy','mordche',
  'chaim','haim','hyim','hyme','hymy','chaim',
  'nachman','nochum','nochumie','nachum',
  'pinchas','pinny','pini','pinchus','pinchos',
  'eliyahu','elya','eli','elie','eliezer','elazar','lazer','lazar',
  'aharon','aron','aaron','ahrele','arele',
  'binyamin','binyamin','bentzion','benzion','benzy','benjy','benji',
  'tzvi','tsvi','hirsh','hersh','hershel','heshy','heshi',
  'zev','zevi','volf','wolf','velvel','velvele',
  'baruch','boruch','borchy','baruchy',
  'gershon','gershom','gershy','gershoim',
  'nesanel','nissan','nissim','nissonl',
  'shmuel','shmueli','shmili','samuel',
  'refael','raphael','rafoel','ruffy',
  'gavriel','gavi','gavy','gabrielle',
  'uriel','uri','urie',
  'yehuda','yidel','yidl','yuda','yudi',
  'yehoshua','yeshua','shaya','shayale',
  'fishel','fishke','fishi','phishel',
  'leibish','leiby','leibel','leibush','leib',
  'nosson','noson','nussy','nussan','nasan',
  'akiva','kivie','kivi','akive',
  'betzalel','bezalel','betzalele',
  'nuchem','nuchimie','nuchum',
  'berel','berel','berele','ber',
  'sruli','sruly','srulik','srul','israel','yisroel','yisrael',
  'shimi','shimmy','shimie','shimmie','shimy',
  'yidel','yidl','yidi',
  'tuli','tully','tulle','tuvia','tuvie','tuvya',
  'hershel','herchy','hersh','hirschel','hirsh',
  'zishe','zishi','zishel','zissel',
  'pinchus','pinchos','pinches','finchus',
  'nuchem','nuchemia','nuchimie',
  'gilly','gilla','gili','gilli',
  'fishke','fischel','fische',
  'shloimy','shloimi','shloime',
  'tzalie','tzali','tzaliel',
  'alter','alterke',
  'feivel','feivish','faivel','feivel',
  'yoeli','yoel','joel','yoely',
  'azriel','ezriel','azriyel',
  'cheski','chezky','chezkel','chizkiyahu','yechezkel',
  'zelig','zeligman','zelik',
  'pesach','pessy','passover',
  'leibush','leibishe','leibusha',
  'kalmen','kalman','kalmy','klonimus',
  'ysroel','sroel','sroel',
  'elchonan','elchonon','elchanan',
  'yisachar','issac','yisachor','isochor',
  'zevulun','zvulun','zevulon',
  'dovber','dov','dov ber',
  'shrageh','shraga','shragie',
  'yisochor','yisochor','isocher',
  'doniel','daniel','doni','danny',
  'mindy','mindi','mindel','mindle',
  'naftoli','naftaly','naftule','naftali',
  'chananya','ananiah','chonanya',
  'michoel','michel','michael','michy','micky',
  'rachamim','ruchama','rachamy',
  'shneor','shneur','schneor','zalman','zalmy','shneur zalman',
  'yochanan','yochy','yochny','yochanan',
  'yirmiyahu','yirmy','yirmi','yirmya',
  'matisyahu','mattis','matys','mattisyahu',
  'heshel','heshy','heshky',
  'shimshon','shimson','samsons',
  // ── FEMALE — Hebrew / Yiddish ─────────────────────────────────
  'chana','chane','chanie','chany','hana','hannah',
  'rivka','rivky','rivkah','rivi','rifky','rifka','riva',
  'leah','lea','laia','laye',
  'rachel','raizel','raizy','rochel','rochele',
  'miriam','mirele','miri','mira','miry',
  'sarah','sara','sary','sarie','sarele',
  'devorah','devory','devoiry','deborah','dvorah',
  'esther','esty','esti','estie','esthy',
  'malka','malky','malki','malkah',
  'shira','shiri','shiry',
  'tzipora','tzipporah','zippy','zipora','tzipy',
  'raizel','raizy','raize',
  'gittel','gitty','gitti','gittie','gitte',
  'faigy','faigie','faige','faigie',
  'chayele','chaya','chaye','chay','haya',
  'baila','baile','baile','baily','bayleh',
  'bracha','brocha','bruchy','brochie',
  'penina','penine','penny','peni',
  'yael','yail','yaeli',
  'adina','adine','adiny',
  'avigail','avigayil','avigale','avigayle','avigale',
  'tzipporah','tzippy','tzipy','zippy','zippora',
  'nechamie','nechama','nechamy','nechamieh',
  'menucha','menuchah','menuchie',
  'shoshana','shoshi','shoshy','shoshane',
  'meirav','meirave','merav',
  'liora','liore','lior',
  'yehudis','yehudit','yehudith','yehudy',
  'zahava','zahave','zahavi','zahavalee',
  'tzirel','tzirell','tzirely',
  'sheindel','sheindi','sheindl','sheindla',
  'ruchel','ruchele','ruchely','ruchala',
  'nechama','nechame','nechamy',
  'fradel','fradl','fradle','frady',
  'deeny','dini','diny','deine','deini',
  'perle','perl','perele','perly',
  'blima','blime','blimie','blimele',
  'gitty','gitti','gitta','gittie',
  'mirel','mirele','mirelah','mirela',
  'hindel','hinde','hindy','hindi',
  'kreindel','kreindle','kreindi','kreindl',
  'tzirrel','tziril','tzirle',
  'pessel','pessy','pesse','pessele',
  'goldie','goldy','golda','goldele',
  'layah','laya','layie','leah',
  'soroh','sorah','sorel','sorele',
  'henya','henye','henye','henny',
  'dvorah','dvoire','dvoiry','dvoire',
  'zissel','zisi','zisel','zisele',
  'yente','yentl','yentle',
  'basya','basie','basi','basye','batsheva','batsheva',
  'tziviah','tzivia','tzivy',
  'rochel','rochele','rochely',
  'nussy','nussie','nussi',
  'rivky','rivkie','rivkele',
  'malky','malkie','malkele',
  'rivkah','rivky',
  'chayala','chayalah','chayale',
  // ── COMMON LAST NAMES in Rockland County ─────────────────────
  'goldberg','greenberg','klein','weiss','schwartz','friedman','rosenberg',
  'stein','weinstein','bernstein','rubinstein','feldman','kaplan','shapiro',
  'hoffman','silver','cohen','levy','katz','roth','weiner','schreiber',
  'teitelbaum','halberstam','rottenberg','spitzer','reich','blum','gross',
  'engel','mandelbaum','morgenstern','lieberman','glick','silber','felder',
  'twersky','horowitz','kohn','mandel','stern','waxman','markowitz',
  'steinberg','margolis','nadler','schonfeld','herskowitz','baumgarten',
  'goldstein','lefkowitz','perlmutter','adler','berkowitz','lichtenstein',
  'finkelstein','glasser','wiesel','rosenfeld','tannenbaum','fischman',
  'katzman','bloch','deutsch','ehrlich','fein','gottesman','kagan',
  'pollak','rabinowitz','silberstein','tepper','zimmer','zucker','frankel',
  'greenberg','hamburger','hertz','isaacs','jacobson','kessler','kramer',
  'landau','levine','loewenthal','marcus','miller','moskowitz','newman',
  'ostreicher','perlstein','pincus','reiss','richman','rothenberg','salomon',
  'sandler','schiff','schlossberg','seidman','shafran','shapiro','sheinfeld',
  'shulman','solomon','sonnenschein','spiegel','spira','strauss','treitel',
  'unger','wachtfogel','waldman','weissberg','weisz','willner','winkler',
  'wolf','wolfson','wortman','yoffe','zwiebel','farkas','jankovits',
  'lichtenstein','leibowitz','rottenstein','weinberger',
  // ── COMMON SECULAR NAMES ─────────────────────────────────────
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
  // ── PHONETIC CORRECTIONS ─────────────────────────────────────
  // How Google Speech API often mishears Jewish names
  'navasir','vassar','colma','shama','yama','mochie','moshie',
  'lazar','lezar','yozy','yozi',
])

// ── PHONETIC NAME CORRECTIONS ────────────────────────────────────
// Maps what Google Speech hears → the actual name
const PHONETIC_CORRECTIONS = {
  // Male names
  'yenky':'yanky','yanki':'yanky','yankee':'yanky',
  'moshe':'moshe','moshey':'moshe','moshi':'moshe','mosha':'moshe',
  'mendel':'mendel','mendle':'mendel','mendl':'mendel',
  'shmueli':'shmuel','shmooly':'shmuel','shmuly':'shmuel',
  'lazer':'lazer','laser':'lazer','lazar':'lazer','lezar':'lazer',
  'motty':'motti','moti':'motti','mottie':'motti',
  'leiby':'leiby','laibee':'leiby','laybee':'leiby',
  'yiddle':'yidel','yiddel':'yidel','yidl':'yidel',
  'hershie':'hershy','hirshie':'hershy','hershey':'hershy',
  'pini':'pinny','pennie':'pinny','penny':'pinny',
  'cheski':'cheski','chesky':'cheski','cheskie':'cheski',
  'borchy':'boruch','borchie':'boruch','borichi':'boruch',
  'gilly':'gilly','gili':'gilly','gillie':'gilly',
  'nussy':'nosson','nussie':'nosson','nussi':'nosson',
  'shaya':'shaya','shia':'shaya','shya':'shaya',
  'tully':'tuli','tullie':'tuli','toolie':'tuli',
  'duvy':'duvy','duvie':'duvy','doovy':'duvy','dovie':'duvy',
  'avrumi':'avrum','avroomy':'avrum','abrumie':'avrum',
  'fishy':'fishel','fishie':'fishel','feishy':'fishel',
  'zlaty':'zlata','zlatty':'zlata',
  // Female names
  'gitty':'gitty','gitti':'gitty','gittie':'gitty',
  'faigy':'faigy','faigee':'faigy','faigi':'faigy',
  'chani':'chanie','chaney':'chanie','chany':'chanie',
  'rivky':'rivky','rivkie':'rivky','rivkee':'rivky',
  'esty':'esty','estie':'esty','esti':'esty',
  'deeny':'deeny','deenie':'deeny','dini':'deeny',
  'perle':'perle','perlie':'perle','perel':'perle',
  'blimie':'blima','blimmy':'blima','blimy':'blima',
  'miri':'miriam','meery':'miriam','miry':'miriam',
  'nechamie':'nechama','nechamy':'nechama',
  'sheindi':'sheindel','sheindy':'sheindel',
  'yehudis':'yehudis','yehudy':'yehudis','yehudees':'yehudis',
  'tzippy':'tzipora','zippy':'tzipora','tzipy':'tzipora',
  'malky':'malka','malkie':'malka','malkee':'malka',
  'ruchi':'ruchel','ruchy':'ruchel','ruchie':'ruchel',
  'fraidy':'fradel','fridy':'fradel','freidy':'fradel',
  'goldie':'golda','goldy':'golda','goldee':'golda',
}

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
// Apply phonetic corrections to a word
function correctPhonetic(word) {
  const lower = word.toLowerCase()
  return PHONETIC_CORRECTIONS[lower] ? PHONETIC_CORRECTIONS[lower] : word
}

// Check if a word looks like a known name (handles phonetic variants)
function isKnownName(word) {
  const lower = word.toLowerCase()
  return KNOWN_NAMES.has(lower) || KNOWN_NAMES.has(PHONETIC_CORRECTIONS[lower] || lower)
}

// Check if a word is a known Rockland street
function isRocklandStreet(word) {
  return ROCKLAND_STREETS.has(word.toLowerCase())
}

export function parseVoice(rawText) {
  // Apply phonetic corrections to entire transcript before parsing
  const corrected = rawText.split(' ').map(w => {
    const fix = PHONETIC_CORRECTIONS[w.toLowerCase()]
    return fix ? fix.charAt(0).toUpperCase() + fix.slice(1) : w
  }).join(' ')
  rawText = corrected
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

// Correct a single name token (or "First Last") using the phonetic map
// + known-names set. Exported so the AI path can also fix misheard
// Jewish/Yiddish names.
export function correctNameToken(s) {
  if (!s) return s
  return s.split(/\s+/).map(w => {
    const lw = w.toLowerCase()
    const fixed = PHONETIC_CORRECTIONS[lw] || lw
    return fixed.charAt(0).toUpperCase() + fixed.slice(1)
  }).join(' ')
}
