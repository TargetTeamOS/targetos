'use strict'
// /api/market-strip — Command Center market data (rates + news).
// Rates: Freddie Mac PMMS via FRED (MORTGAGE30US / MORTGAGE15US). The FRED API
// key stays server-only (process.env.FRED_API_KEY) and never reaches the client.
// News: sources come from the admin-configured app_news_sources_active RPC;
// each feed is fetched, sanitized (tags stripped, entities decoded, summary
// truncated — never the full article), and one failing feed never breaks the
// others or the dashboard. Everything is cached in-memory for 30 minutes.
//
// This is intentionally separate from api/market-data.js (which powers the
// Marketing page with hard-coded feeds) so the Command Center can use the
// admin-configured sources without regressing that page.

const { createServiceClient } = require('./_lib/supabaseConfig')

const CACHE = { data: null, ts: 0 }
const CACHE_TTL = 30 * 60 * 1000 // 30 min

// National fallbacks used only if the sources RPC is unavailable, so news still
// renders. Mirrors the fallbacks seeded by A4_news_sources.sql.
const FALLBACK_SOURCES = [
  { name: 'HousingWire', url: 'https://www.housingwire.com/feed/', category: 'real_estate', is_fallback: true },
  { name: "NAR Economists' Outlook", url: 'https://www.nar.realtor/blogs/economists-outlook/feed', category: 'real_estate', is_fallback: true },
  { name: 'Calculated Risk', url: 'https://calculatedriskblog.com/feeds/posts/default?alt=rss', category: 'housing', is_fallback: true },
]

// ── pure helpers (exported for unit tests; no network) ──────────────────────

function sanitizeText(s) {
  if (!s) return ''
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    // decode entities FIRST so entity-encoded markup (&lt;p&gt;) becomes real
    // tags that the strip step below can remove — otherwise it survives.
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&apos;/gi, "'")
    .replace(/&#8217;/g, '\u2019').replace(/&#8220;|&#8221;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCharCode(+n) } catch { return '' } })
    .replace(/<[^>]+>/g, ' ')                 // now strip any (decoded) HTML tags
    .replace(/\s+/g, ' ')
    .trim()
}

function truncate(s, n = 180) {
  const t = sanitizeText(s)
  if (t.length <= n) return t
  return t.slice(0, n - 1).replace(/\s+\S*$/, '') + '\u2026'
}

// Parse up to `max` RSS <item> blocks into safe article objects. Never keeps
// full content — only headline, link, date, and a truncated summary.
function parseRssItems(xml, sourceName, category, max = 5) {
  if (!xml) return []
  const items = xml.match(/<item[\s>]([\s\S]*?)<\/item>/g) || xml.match(/<entry[\s>]([\s\S]*?)<\/entry>/g) || []
  const out = []
  for (const item of items.slice(0, max)) {
    const title = (item.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]
    let link = (item.match(/<link[^>]*>([\s\S]*?)<\/link>/) || [])[1]
    if (!link) link = (item.match(/<link[^>]*href="([^"]+)"/) || [])[1]
    const pub = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || item.match(/<updated>([\s\S]*?)<\/updated>/) || item.match(/<published>([\s\S]*?)<\/published>/) || [])[1]
    const desc = (item.match(/<description>([\s\S]*?)<\/description>/) || item.match(/<summary[^>]*>([\s\S]*?)<\/summary>/) || [])[1]
    const cleanTitle = sanitizeText(title)
    const cleanLink = link ? sanitizeText(link) : ''
    if (!cleanTitle || !/^https?:\/\//.test(cleanLink)) continue
    let iso = new Date().toISOString()
    if (pub) { const d = new Date(sanitizeText(pub)); if (!isNaN(d)) iso = d.toISOString() }
    out.push({ title: cleanTitle, link: cleanLink, source: sourceName, category: category || 'community', pubDate: iso, summary: truncate(desc, 180) })
  }
  return out
}

// Build the rate summary + ascending history array from FRED observations.
function computeRateSummary(obs30 = [], obs15 = []) {
  const clean = (arr) => (arr || [])
    .filter((o) => o && o.value && String(o.value).trim() !== '' && String(o.value).trim() !== '.')
    .map((o) => ({ date: o.date, value: parseFloat(String(o.value).trim()) }))
    .filter((o) => !isNaN(o.value) && o.value > 0)
  const c30 = clean(obs30) // FRED returns newest-first
  const c15 = clean(obs15)
  const latest = c30[0] || null
  const prev = c30[1] || null
  const rate30 = latest ? latest.value : null
  const rate30_prev = prev ? prev.value : null
  const change = (rate30 != null && rate30_prev != null) ? parseFloat((rate30 - rate30_prev).toFixed(2)) : null
  const direction = change == null ? 'flat' : change > 0.001 ? 'up' : change < -0.001 ? 'down' : 'flat'
  const history = c30.slice().reverse() // oldest → newest for charting
  return { rate30, rate30_prev, rate15: c15[0] ? c15[0].value : null, rate30_date: latest ? latest.date : null, change, direction, history, source: 'Freddie Mac PMMS via FRED' }
}

// ── network fetchers ────────────────────────────────────────────────────────

async function fetchRates() {
  const key = process.env.FRED_API_KEY
  if (!key) return { error: 'unavailable', rate30: null, rate15: null, history: [] }
  try {
    const base = 'https://api.stlouisfed.org/fred/series/observations?file_type=json&sort_order=desc&api_key=' + key
    const [r30, r15] = await Promise.all([
      fetch(base + '&series_id=MORTGAGE30US&limit=16', { signal: AbortSignal.timeout(6000) }),
      fetch(base + '&series_id=MORTGAGE15US&limit=2', { signal: AbortSignal.timeout(6000) }),
    ])
    const [d30, d15] = await Promise.all([r30.json(), r15.json()])
    if (d30.error_message) throw new Error(d30.error_message)
    return computeRateSummary(d30.observations, d15.observations)
  } catch (e) {
    return { error: 'unavailable', rate30: null, rate15: null, history: [] }
  }
}

async function fetchNewsSources(sb) {
  if (!sb) return FALLBACK_SOURCES
  try {
    const { data, error } = await sb.rpc('app_news_sources_active')
    if (error) return FALLBACK_SOURCES
    const arr = Array.isArray(data) ? data : (data ? JSON.parse(data) : [])
    return (arr && arr.length) ? arr : FALLBACK_SOURCES
  } catch { return FALLBACK_SOURCES }
}

async function fetchNews(sources) {
  const results = await Promise.allSettled((sources || []).map(async (s) => {
    if (!s || !s.url) return []
    const res = await fetch(s.url, { headers: { 'User-Agent': 'TargetOS/2.0' }, signal: AbortSignal.timeout(5000) })
    if (!res.ok) return []
    const xml = await res.text()
    return parseRssItems(xml, s.name, s.category, 5)
  }))
  const articles = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  // newest first, de-dup by link, cap total
  const seen = new Set()
  return articles
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .filter((a) => (seen.has(a.link) ? false : (seen.add(a.link), true)))
    .slice(0, 12)
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const refresh = req.url && req.url.includes('refresh')
  if (!refresh && CACHE.data && Date.now() - CACHE.ts < CACHE_TTL) {
    return res.status(200).json({ ...CACHE.data, cached: true })
  }

  let sb
  try {
    sb = createServiceClient()
  } catch {
    return res.status(503).json({ error: 'Server database configuration is unavailable' })
  }

  // Rates and news are independent: one failing must not break the other.
  const sources = await fetchNewsSources(sb)
  const [rates, news] = await Promise.all([
    fetchRates().catch(() => ({ error: 'unavailable', rate30: null, rate15: null, history: [] })),
    fetchNews(sources).catch(() => []),
  ])

  const result = { rates, news, fetched_at: new Date().toISOString() }
  CACHE.data = result
  CACHE.ts = Date.now()
  res.status(200).json(result)
}

module.exports = handler
module.exports.sanitizeText = sanitizeText
module.exports.truncate = truncate
module.exports.parseRssItems = parseRssItems
module.exports.computeRateSummary = computeRateSummary
