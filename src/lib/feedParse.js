// feedParse — pure, framework-free RSS/rate helpers. This is the canonical,
// unit-tested reference implementation. api/market-strip.js keeps a byte-identical
// self-contained copy (a Vercel CommonJS function shouldn't import ESM app code),
// so keep the two in sync if either changes.

export function sanitizeText(s) {
  if (!s) return ''
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    // decode entities FIRST so entity-encoded markup becomes strippable tags
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&apos;/gi, "'")
    .replace(/&#8217;/g, '\u2019').replace(/&#8220;|&#8221;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCharCode(+n) } catch { return '' } })
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function truncate(s, n = 180) {
  const t = sanitizeText(s)
  if (t.length <= n) return t
  return t.slice(0, n - 1).replace(/\s+\S*$/, '') + '\u2026'
}

export function parseRssItems(xml, sourceName, category, max = 5) {
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

export function computeRateSummary(obs30 = [], obs15 = []) {
  const clean = (arr) => (arr || [])
    .filter((o) => o && o.value && String(o.value).trim() !== '' && String(o.value).trim() !== '.')
    .map((o) => ({ date: o.date, value: parseFloat(String(o.value).trim()) }))
    .filter((o) => !Number.isNaN(o.value) && o.value > 0)
  const c30 = clean(obs30)
  const c15 = clean(obs15)
  const latest = c30[0] || null
  const prev = c30[1] || null
  const rate30 = latest ? latest.value : null
  const rate30_prev = prev ? prev.value : null
  const change = (rate30 != null && rate30_prev != null) ? parseFloat((rate30 - rate30_prev).toFixed(2)) : null
  const direction = change == null ? 'flat' : change > 0.001 ? 'up' : change < -0.001 ? 'down' : 'flat'
  const history = c30.slice().reverse()
  return { rate30, rate30_prev, rate15: c15[0] ? c15[0].value : null, rate30_date: latest ? latest.date : null, change, direction, history, source: 'Freddie Mac PMMS via FRED' }
}
