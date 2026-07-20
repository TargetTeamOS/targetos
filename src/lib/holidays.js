// ═══════════════════════════════════════════════════════════════
// HOLIDAYS (July 2026)
// US federal holidays (computed) + Jewish holidays & events (from
// @hebcal/core — accurate Hebrew-calendar dates, not hardcoded).
// Returns { 'YYYY-MM-DD': [{ name, kind }] } for a given year.
// kind: 'us' | 'jewish' | 'jewish-minor'
// ═══════════════════════════════════════════════════════════════
import { HebrewCalendar, flags } from '@hebcal/core'

// ── US federal / common holidays ────────────────────────────────
function nthWeekday(year, month, weekday, n) {
  // month 0-indexed; weekday 0=Sun; n=1..5 or -1 for last
  if (n === -1) {
    const last = new Date(year, month + 1, 0)
    let d = last.getDate()
    while (last.getDay() !== weekday) { last.setDate(--d) }
    return last
  }
  const first = new Date(year, month, 1)
  let offset = (weekday - first.getDay() + 7) % 7
  return new Date(year, month, 1 + offset + (n - 1) * 7)
}
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')

function usHolidays(year) {
  const out = {}
  const add = (d, name) => { const k = iso(d); (out[k] = out[k] || []).push({ name, kind: 'us' }) }
  add(new Date(year, 0, 1),   "New Year's Day")
  add(nthWeekday(year, 0, 1, 3),  'Martin Luther King Jr. Day')
  add(nthWeekday(year, 1, 1, 3),  "Presidents' Day")
  add(nthWeekday(year, 4, 1, -1), 'Memorial Day')
  add(new Date(year, 5, 19),  'Juneteenth')
  add(new Date(year, 6, 4),   'Independence Day')
  add(nthWeekday(year, 8, 1, 1),  'Labor Day')
  add(nthWeekday(year, 9, 1, 2),  'Columbus Day')
  add(new Date(year, 10, 11),  'Veterans Day')
  add(nthWeekday(year, 10, 4, 4), 'Thanksgiving')
  add(new Date(year, 11, 25),  'Christmas Day')
  return out
}

// ── Jewish holidays via hebcal ──────────────────────────────────
// Major holidays get 'jewish'; minor days (Rosh Chodesh, fasts,
// special Shabbatot) get 'jewish-minor' so the UI can de-emphasize.
function jewishHolidays(year) {
  const out = {}
  try {
    const events = HebrewCalendar.calendar({
      year, isHebrewYear: false, numYears: 1,
      candlelighting: false, sedrot: false, omer: false, molad: false,
      noMinorFast: false, noRoshChodesh: false,
    })
    for (const ev of events) {
      const f = ev.getFlags ? ev.getFlags() : 0
      // Skip parsha readings / daily-study noise if any slipped in
      if (flags && (f & flags.PARSHA_HASHAVUA)) continue
      const major = flags && (f & (flags.CHAG | flags.YOM_TOV_ENDS | flags.MAJOR_FAST | flags.LIGHT_CANDLES))
      const minor = flags && (f & (flags.ROSH_CHODESH | flags.MINOR_FAST | flags.SPECIAL_SHABBAT | flags.MINOR_HOLIDAY | flags.MODERN_HOLIDAY))
      const kind = major ? 'jewish' : (minor ? 'jewish-minor' : 'jewish')
      const k = iso(ev.getDate().greg())
      ;(out[k] = out[k] || []).push({ name: ev.render('en'), kind })
    }
  } catch (e) { /* if hebcal fails, US holidays still show */ }
  return out
}

const _cache = {}
export function holidaysForYear(year, { includeJewish = true, includeUS = true } = {}) {
  const ck = year + ':' + includeJewish + ':' + includeUS
  if (_cache[ck]) return _cache[ck]
  const merged = {}
  const merge = src => { for (const k in src) { (merged[k] = merged[k] || []).push(...src[k]) } }
  if (includeUS)     merge(usHolidays(year))
  if (includeJewish) merge(jewishHolidays(year))
  _cache[ck] = merged
  return merged
}

export function holidaysOnDate(dateStr, opts) {
  const year = parseInt(dateStr.slice(0, 4), 10)
  return holidaysForYear(year, opts)[dateStr] || []
}
