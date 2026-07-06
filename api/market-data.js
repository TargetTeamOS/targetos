// /api/market-data
// Returns live mortgage rates + real estate news headlines
// Rates: fetched from Freddie Mac / FFIEC public data
// News: RSS feeds from NAR, HousingWire, Calculated Risk
'use strict'

const CACHE = { data: null, ts: 0 }
const CACHE_TTL = 30 * 60 * 1000 // 30 min

async function fetchRates() {
  // Freddie Mac PMMS data via FRED API — requires free API key
  // Get yours free at https://fred.stlouisfed.org/docs/api/api_key.html
  const FRED_KEY = process.env.FRED_API_KEY

  if (FRED_KEY) {
    try {
      const res = await fetch(
        'https://api.stlouisfed.org/fred/series/observations?series_id=MORTGAGE30US&api_key=' + FRED_KEY + '&sort_order=desc&limit=4&file_type=json'
      )
      if (res.ok) {
        const data = await res.json()
        const obs    = (data.observations || []).filter(o => o.value !== '.')
        const latest = obs[0]
        const prev   = obs[1]
        return {
          rate30:      latest ? parseFloat(latest.value) : null,
          rate30_prev: prev   ? parseFloat(prev.value)   : null,
          rate30_date: latest?.date || null,
        }
      }
    } catch(e) { console.warn('FRED 30yr failed:', e.message) }
  }

  // Fallback: scrape Mortgage News Daily public rate (no key needed)
  try {
    const res = await fetch('https://www.mortgagenewsdaily.com/mortgage-rates/rss/30-year-fixed', {
      headers: { 'User-Agent': 'TargetOS/2.0' },
      signal: AbortSignal.timeout(6000),
    })
    if (res.ok) {
      const xml = await res.text()
      // Extract rate from RSS description field
      const match = xml.match(/(\d+\.\d+)%/)
      if (match) {
        return { rate30: parseFloat(match[1]), rate30_prev: null, rate30_date: new Date().toISOString().slice(0,10) }
      }
    }
  } catch(e) { console.warn('MND fallback failed:', e.message) }

  // Final fallback: return null so UI shows "—" not broken
  return { rate30: null, rate30_prev: null, rate30_date: null }
}

async function fetch15YrRate() {
  const FRED_KEY = process.env.FRED_API_KEY
  if (!FRED_KEY) return null
  try {
    const res = await fetch(
      'https://api.stlouisfed.org/fred/series/observations?series_id=MORTGAGE15US&api_key=' + FRED_KEY + '&sort_order=desc&limit=1&file_type=json'
    )
    const data = await res.json()
    const obs = (data.observations || []).find(o => o.value !== '.')
    return obs ? parseFloat(obs.value) : null
  } catch { return null }
}

async function fetchNews() {
  // Parse RSS from HousingWire + NAR + Calculated Risk
  const feeds = [
    { url: 'https://www.housingwire.com/feed/', source: 'HousingWire' },
    { url: 'https://www.nar.realtor/blogs/economists-outlook/feed', source: 'NAR' },
    { url: 'https://calculatedriskblog.com/feeds/posts/default?alt=rss', source: 'Calculated Risk' },
    { url: 'https://feeds.feedburner.com/inman/allnews', source: 'Inman' },
  ]

  const articles = []

  for (const feed of feeds) {
    try {
      const res = await fetch(feed.url, {
        headers: { 'User-Agent': 'TargetOS/2.0 (Real Estate CRM)' },
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) continue
      const xml = await res.text()

      // Simple XML parsing — extract item titles, links, pubDate
      const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
      for (const item of items.slice(0, 4)) {
        const title   = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                         item.match(/<title>(.*?)<\/title>/))?.[1]?.trim()
        const link    = (item.match(/<link>(.*?)<\/link>/))?.[1]?.trim() ||
                        (item.match(/<link href="(.*?)"/)?.[1])
        const pubDate = (item.match(/<pubDate>(.*?)<\/pubDate>/))?.[1]?.trim()
        if (title && link) {
          articles.push({
            title: title.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#8217;/g,"'").replace(/&#8220;/g,'"').replace(/&#8221;/g,'"'),
            link,
            source: feed.source,
            pubDate: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
          })
        }
      }
    } catch(e) {
      console.warn(feed.source + ' feed failed:', e.message)
    }
  }

  // Sort by date, newest first
  return articles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate)).slice(0, 12)
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')

  // Return cache if fresh
  if (CACHE.data && Date.now() - CACHE.ts < CACHE_TTL) {
    return res.status(200).json(CACHE.data)
  }

  try {
    const [rates, rate15, news] = await Promise.all([
      fetchRates(),
      fetch15YrRate(),
      fetchNews(),
    ])

    const result = {
      rates: {
        rate_30yr:      rates.rate30,
        rate_30yr_prev: rates.rate30_prev,
        rate_15yr:      rate15,
        as_of:          rates.rate30_date,
        change:         rates.rate30 && rates.rate30_prev
                          ? parseFloat((rates.rate30 - rates.rate30_prev).toFixed(2))
                          : null,
        source:         'Freddie Mac PMMS via FRED',
      },
      news,
      fetched_at: new Date().toISOString(),
    }

    CACHE.data = result
    CACHE.ts   = Date.now()

    res.status(200).json(result)
  } catch(e) {
    res.status(500).json({ error: e.message })
  }
}
