// ═══════════════════════════════════════════════════════════════
// WEATHER FORECAST (July 2026)
// Shows the forecast for a given address + date using Open-Meteo
// (free, no API key). Used when scheduling photography so we can
// see rain BEFORE booking. Forecasts are reliable ~16 days out;
// beyond that we say so honestly rather than guessing.
// ═══════════════════════════════════════════════════════════════
import React, { useState, useEffect } from 'react'

// WMO weather codes → label + emoji + rain risk
const WMO = {
  0:  ['Clear', '☀️', 0], 1: ['Mostly clear', '🌤️', 0], 2: ['Partly cloudy', '⛅', 0], 3: ['Overcast', '☁️', 0],
  45: ['Fog', '🌫️', 0], 48: ['Rime fog', '🌫️', 0],
  51: ['Light drizzle', '🌦️', 1], 53: ['Drizzle', '🌦️', 1], 55: ['Heavy drizzle', '🌧️', 2],
  56: ['Freezing drizzle', '🌧️', 2], 57: ['Freezing drizzle', '🌧️', 2],
  61: ['Light rain', '🌦️', 2], 63: ['Rain', '🌧️', 2], 65: ['Heavy rain', '🌧️', 3],
  66: ['Freezing rain', '🌧️', 3], 67: ['Freezing rain', '🌧️', 3],
  71: ['Light snow', '🌨️', 2], 73: ['Snow', '🌨️', 3], 75: ['Heavy snow', '❄️', 3], 77: ['Snow grains', '🌨️', 2],
  80: ['Rain showers', '🌦️', 2], 81: ['Rain showers', '🌧️', 3], 82: ['Violent showers', '⛈️', 3],
  85: ['Snow showers', '🌨️', 3], 86: ['Snow showers', '❄️', 3],
  95: ['Thunderstorm', '⛈️', 3], 96: ['Thunderstorm + hail', '⛈️', 3], 99: ['Thunderstorm + hail', '⛈️', 3],
}

const _geoCache = {}
async function geocode(address) {
  if (!address) return null
  if (_geoCache[address]) return _geoCache[address]
  try {
    const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&name=' + encodeURIComponent(address.split(',').slice(0, 2).join(',')))
    const d = await r.json()
    const hit = d.results?.[0]
    if (hit) { const g = { lat: hit.latitude, lng: hit.longitude }; _geoCache[address] = g; return g }
  } catch {}
  return null
}

export function WeatherForecast({ address, date }) {
  const [state, setState] = useState({ loading: false, data: null, error: null, tooFar: false })

  useEffect(() => {
    if (!date) { setState({ loading: false, data: null, error: null, tooFar: false }); return }
    const dayStr = String(date).slice(0, 10)
    const target = new Date(dayStr + 'T12:00:00')
    const days = Math.round((target - new Date()) / 86400000)
    if (days < 0) { setState({ loading: false, data: null, error: null, past: true }); return }
    if (days > 15) { setState({ loading: false, data: null, error: null, tooFar: true }); return }

    let alive = true
    setState({ loading: true, data: null, error: null })
    ;(async () => {
      const geo = await geocode(address)
      if (!geo) { if (alive) setState({ loading: false, data: null, error: 'no-location' }); return }
      try {
        const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + geo.lat + '&longitude=' + geo.lng +
          '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum' +
          '&temperature_unit=fahrenheit&timezone=auto&start_date=' + dayStr + '&end_date=' + dayStr
        const r = await fetch(url)
        const d = await r.json()
        if (!d.daily || !d.daily.weather_code?.length) throw new Error('no data')
        if (alive) setState({ loading: false, data: {
          code: d.daily.weather_code[0],
          tmax: Math.round(d.daily.temperature_2m_max[0]),
          tmin: Math.round(d.daily.temperature_2m_min[0]),
          pop:  d.daily.precipitation_probability_max?.[0] ?? null,
          precip: d.daily.precipitation_sum?.[0] ?? 0,
        }, error: null })
      } catch { if (alive) setState({ loading: false, data: null, error: 'fetch' }) }
    })()
    return () => { alive = false }
  }, [address, date])

  if (!date) return null
  const box = (bg, border, children) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 9, background: bg, border: '1px solid ' + border, fontSize: 12.5, marginTop: 6, fontFamily: 'Inter,system-ui,sans-serif' }}>{children}</div>
  )
  if (state.past) return null
  if (state.loading) return box('var(--dim)', 'var(--border)', <span style={{ color: 'var(--muted)' }}>⏳ Checking the forecast…</span>)
  if (state.tooFar) return box('var(--dim)', 'var(--border)', <span style={{ color: 'var(--muted)' }}>📅 More than ~2 weeks out — forecast not available yet. Check back closer to the date.</span>)
  if (state.error === 'no-location') return box('var(--dim)', 'var(--border)', <span style={{ color: 'var(--muted)' }}>📍 Couldn't locate this address for a forecast.</span>)
  if (state.error) return box('var(--dim)', 'var(--border)', <span style={{ color: 'var(--muted)' }}>Weather unavailable right now.</span>)
  if (!state.data) return null

  const [label, emoji, rainRisk] = WMO[state.data.code] || ['—', '🌡️', 0]
  const pop = state.data.pop
  const bad = rainRisk >= 2 || (pop != null && pop >= 50)
  const warn = rainRisk === 1 || (pop != null && pop >= 30)
  const bg = bad ? 'rgba(220,38,38,.08)' : warn ? 'rgba(245,166,35,.10)' : 'rgba(16,185,129,.08)'
  const bd = bad ? 'rgba(220,38,38,.30)' : warn ? 'rgba(245,166,35,.30)' : 'rgba(16,185,129,.30)'
  const col = bad ? '#DC2626' : warn ? '#B45309' : '#0B7A45'

  return box(bg, bd, (
    <>
      <span style={{ fontSize: 18 }}>{emoji}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, color: col }}>
          {label} · {state.data.tmax}°/{state.data.tmin}°F
          {pop != null && <span style={{ fontWeight: 600 }}> · {pop}% chance of precip</span>}
        </div>
        {bad && <div style={{ fontSize: 11, color: col, fontWeight: 700 }}>⚠️ Rain/bad weather likely — consider rescheduling this shoot</div>}
        {warn && !bad && <div style={{ fontSize: 11, color: col }}>Some chance of rain — keep an eye on it</div>}
        {!bad && !warn && <div style={{ fontSize: 11, color: col }}>✓ Looks good for photography</div>}
      </div>
    </>
  ))
}

// ── Compact badge for calendar day cells ────────────────────────
// Small icon + temp + rain% for a day that has events. Falls back to
// Rockland County (the team's area) when an event has no address.
export function DayWeather({ address, date }) {
  const [d, setD] = useState(null)
  useEffect(() => {
    const dayStr = String(date).slice(0, 10)
    const days = Math.round((new Date(dayStr + 'T12:00:00') - new Date()) / 86400000)
    if (days < 0 || days > 15) { setD(null); return }
    let alive = true
    ;(async () => {
      const geo = (await geocode(address)) || { lat: 41.11, lng: -74.05 } // Rockland fallback
      try {
        const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + geo.lat + '&longitude=' + geo.lng +
          '&daily=weather_code,temperature_2m_max,precipitation_probability_max&temperature_unit=fahrenheit&timezone=auto&start_date=' + dayStr + '&end_date=' + dayStr
        const r = await fetch(url); const j = await r.json()
        if (alive && j.daily?.weather_code?.length) setD({
          code: j.daily.weather_code[0], tmax: Math.round(j.daily.temperature_2m_max[0]), pop: j.daily.precipitation_probability_max?.[0] ?? null })
      } catch {}
    })()
    return () => { alive = false }
  }, [address, date])
  if (!d) return null
  const [, emoji, rainRisk] = WMO[d.code] || ['', '🌡️', 0]
  const bad = rainRisk >= 2 || (d.pop != null && d.pop >= 50)
  return (
    <div title={'Forecast: ' + (d.pop != null ? d.pop + '% precip, ' : '') + d.tmax + '°F'}
      style={{ fontSize: 10, marginTop: 2, color: bad ? '#DC2626' : 'var(--muted)', fontWeight: bad ? 700 : 500 }}>
      {emoji} {d.tmax}°{d.pop != null && d.pop >= 30 ? ' · ' + d.pop + '%💧' : ''}
    </div>
  )
}
