// TargetOS V2 — Market Data: Mortgage Rates + Real Estate News
// Rates: Freddie Mac PMMS via FRED API (needs FRED_API_KEY in Vercel env vars)
// News: RSS feeds from HousingWire, NAR, Inman, Calculated Risk
'use strict'

const CACHE = { data: null, ts: 0 }
const CACHE_TTL = 30 * 60 * 1000 // 30 min

async function fetchRates() {
  const key = process.env.FRED_API_KEY
  console.log('FRED_API_KEY present:', !!key, key ? key.slice(0,6) + '...' : 'MISSING')

  if (!key) {
    return {
      rate30: null, rate30_prev: null, rate15: null,
      rate30_date: null, error: 'FRED_API_KEY not set in Vercel environment variables'
    }
  }

  try {
    // 30-year fixed
    const [r30res, r15res] = await Promise.all([
      fetch('https://api.stlouisfed.org/fred/series/observations?series_id=MORTGAGE30US&api_key=' + key + '&sort_order=desc&limit=4&file_type=json'),
      fetch('https://api.stlouisfed.org/fred/series/observations?series_id=MORTGAGE15US&api_key=' + key + '&sort_order=desc&limit=2&file_type=json'),
    ])

    const [d30, d15] = await Promise.all([r30res.json(), r15res.json()])

    if (d30.error_message) throw new Error(d30.error_message)

    const obs30  = (d30.observations || []).filter(o => o.value && o.value !== '.' && o.value.trim() !== '')
    const obs15  = (d15.observations || []).filter(o => o.value && o.value !== '.' && o.value.trim() !== '')
    const latest = obs30[0]
    const prev   = obs30[1]

    console.log('FRED obs30 sample:', JSON.stringify(obs30.slice(0,2)))

    const r30      = latest ? parseFloat(String(latest.value).trim()) : null
    const r30prev  = prev   ? parseFloat(String(prev.value).trim())   : null
    const r15      = obs15[0] ? parseFloat(String(obs15[0].value).trim()) : null
    const change   = (r30 && r30prev && !isNaN(r30) && !isNaN(r30prev))
                       ? parseFloat((r30 - r30prev).toFixed(2)) : null

    return {
      rate30:      (!isNaN(r30) && r30 > 0) ? r30 : null,
      rate30_prev: (!isNaN(r30prev) && r30prev > 0) ? r30prev : null,
      rate15:      (!isNaN(r15) && r15 > 0) ? r15 : null,
      rate30_date: latest?.date || null,
      change,
      source: 'Freddie Mac PMMS via FRED',
      // Debug fields — remove after confirming
      _raw30:   latest?.value,
      _raw30p:  prev?.value,
      _raw15:   obs15[0]?.value,
      _parsed30: r30,
    }
  } catch(e) {
    console.error('FRED fetch error:', e.message)
    return { rate30: null, rate30_prev: null, rate15: null, rate30_date: null, error: e.message }
  }
}

async function fetchNews() {
  const feeds = [
    { url: 'https://www.housingwire.com/feed/', source: 'HousingWire' },
    { url: 'https://www.nar.realtor/blogs/economists-outlook/feed', source: 'NAR' },
    { url: 'https://calculatedriskblog.com/feeds/posts/default?alt=rss', source: 'Calculated Risk' },
  ]

  const articles = []
  for (const feed of feeds) {
    try {
      const res = await fetch(feed.url, {
        headers: { 'User-Agent': 'TargetOS/2.0' },
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) continue
      const xml = await res.text()
      const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
      for (const item of items.slice(0, 5)) {
        const title = (
          item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
          item.match(/<title>(.*?)<\/title>/)
        )?.[1]?.trim()
        const link = (
          item.match(/<link>(.*?)<\/link>/) ||
          item.match(/<link href="(.*?)"/)
        )?.[1]?.trim()
        const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim()
        if (title && link) {
          articles.push({
            title: title
              .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
              .replace(/&#8217;/g, "'").replace(/&#8220;/g, '"').replace(/&#8221;/g, '"')
              .replace(/<[^>]+>/g, ''),
            link:    link.replace(/<[^>]+>/g, '').trim(),
            source:  feed.source,
            pubDate: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
          })
        }
      }
    } catch(e) {
      console.warn(feed.source + ' failed:', e.message)
    }
  }

  return articles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate)).slice(0, 12)
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Debug mode
  if (req.url?.includes('debug')) {
    return res.status(200).json({
      has_fred_key: !!process.env.FRED_API_KEY,
      fred_key_prefix: process.env.FRED_API_KEY?.slice(0, 6) || 'MISSING',
      node_version: process.version,
    })
  }

  // Bypass cache with ?refresh=1
  const refresh = req.url?.includes('refresh')
  if (!refresh && CACHE.data && Date.now() - CACHE.ts < CACHE_TTL) {
    return res.status(200).json({ ...CACHE.data, cached: true })
  }

  const [rates, news] = await Promise.all([fetchRates(), fetchNews()])

  const result = { rates, news, fetched_at: new Date().toISOString() }
  CACHE.data = result
  CACHE.ts   = Date.now()

  res.status(200).json(result)
}
