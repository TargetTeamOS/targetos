// TargetOS V2 — Daily Briefing (server-side)
// Ported from src/pages/DailyBriefing.jsx for use in the automated
// cron endpoint (api/daily-briefing-cron.js). Kept as a near-exact
// copy rather than a shared import because the frontend uses ES
// modules and API routes use CommonJS -- true de-duplication would
// need a build step this project doesn't have. If you change the
// email design/quotes in DailyBriefing.jsx, mirror the change here
// too, or the automated email and the in-app preview will drift out
// of sync.
'use strict'

function fmt$(n) {
  if (!n && n !== 0) return '—'
  const num = parseFloat(n)
  if (isNaN(num)) return '—'
  if (num >= 1_000_000) return '$' + (num / 1_000_000).toFixed(2).replace(/\.00$/, '') + 'M'
  if (num >= 1_000)     return '$' + (num / 1_000).toFixed(0) + 'K'
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtDate(d) {
  if (!d) return '—'
  const date = new Date(d + (d.length === 10 ? 'T00:00:00' : ''))
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getDaysUntil(d) {
  if (!d) return null
  const diff = new Date(d + 'T00:00:00').getTime() - Date.now()
  return Math.ceil(diff / 86400000)
}

function isOverdue(d) {
  if (!d) return false
  return new Date(d + 'T00:00:00').getTime() < Date.now()
}

function isDueToday(d) {
  if (!d) return false
  const today = new Date().toISOString().slice(0, 10)
  return d === today
}

// ── KW / GARY KELLER QUOTES ──────────────────────────────────────
const KW_QUOTES = [
  { text: 'Your job is not to be a great salesperson. Your job is to be a great human being who happens to sell real estate.', author: 'Gary Keller' },
  { text: 'Success is actually a short race — a sprint fueled by discipline just long enough for habit to kick in and take over.', author: 'Gary Keller' },
  { text: 'What is the ONE Thing you can do such that by doing it everything else will be easier or unnecessary?', author: 'Gary Keller' },
  { text: 'Your level of success will seldom exceed your level of personal development.', author: 'Gary Keller' },
  { text: 'Don\'t mistake movement for achievement. It\'s easy to be busy doing nothing.', author: 'Gary Keller' },
  { text: 'Multitasking is a lie. You can do two things at once, but you can\'t focus effectively on two things at once.', author: 'Gary Keller' },
  { text: 'Time on task, over time, eventually beats talent every time.', author: 'Gary Keller' },
  { text: 'A big life is just a small life with better habits.', author: 'Gary Keller' },
  { text: 'The people who achieve extraordinary results don\'t achieve them by working more hours. They achieve them by getting more done in the hours they work.', author: 'Gary Keller' },
  { text: 'Lead generation is the lifeblood of your business. Never stop prospecting.', author: 'Keller Williams' },
  { text: 'Your network is your net worth. Build relationships before you need them.', author: 'Keller Williams' },
  { text: 'Each person on your team multiplies your ability to serve clients and grow your business.', author: 'Keller Williams' },
  { text: 'Success is not about having the best plan. It\'s about executing consistently.', author: 'Keller Williams' },
  { text: 'Real estate agents who think marketing is an expense will always struggle. Agents who treat it as an investment will always win.', author: 'Gary Keller' },
  { text: 'Work is a rubber ball. If you drop it, it will bounce back. But the four other balls — family, health, friends, and integrity — are made of glass.', author: 'Gary Keller' },
]

function getTodaysQuote(customQuotes) {
  const all = [...KW_QUOTES, ...(customQuotes || [])]
  const idx = Math.floor(Date.now() / 86400000) % all.length
  return all[idx] || KW_QUOTES[0]
}

// ── EMAIL HTML (table-based, Gmail/Outlook safe) ─────────────────
function buildEmailHTML(agentName, data, prefs, quote, customMsg, style) {
  const s = style || {}
  const headerBg    = s.headerBg    || '#1B2B4B'
  const accentColor = s.accentColor || '#CC2200'
  const bodyBg      = s.bodyBg      || '#F8FAFC'
  const textColor   = s.textColor   || '#1E293B'
  const mutedColor  = s.mutedColor  || '#64748B'
  const fontFamily  = s.fontFamily  || 'Arial, Helvetica, sans-serif'

  const today = new Date().toLocaleDateString('en-US', {
    weekday:'long', year:'numeric', month:'long', day:'numeric', timeZone:'America/New_York'
  })

  function section(title, icon, rowsHTML) {
    if (!rowsHTML) return ''
    return (
      '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">' +
        '<tr><td style="padding-bottom:8px;border-bottom:2px solid ' + accentColor + '">' +
          '<span style="font-family:' + fontFamily + ';font-size:11px;font-weight:bold;color:' + accentColor + ';text-transform:uppercase;letter-spacing:1px">' + icon + ' ' + title + '</span>' +
        '</td></tr>' +
        rowsHTML +
      '</table>'
    )
  }

  function row(left, right, isAlert) {
    const bg = isAlert ? '#FFF5F5' : 'transparent'
    const lc = isAlert ? '#CC0000' : textColor
    return (
      '<tr style="background:' + bg + '">' +
        '<td style="font-family:' + fontFamily + ';font-size:13px;color:' + lc + ';padding:8px 4px 8px 0;border-bottom:1px solid #E8EDF2;font-weight:' + (isAlert?'bold':'normal') + '">' + left + '</td>' +
        '<td style="font-family:' + fontFamily + ';font-size:12px;color:' + mutedColor + ';padding:8px 0 8px 8px;border-bottom:1px solid #E8EDF2;text-align:right;white-space:nowrap">' + right + '</td>' +
      '</tr>'
    )
  }

  const taskRows = (prefs.showTasks && data.todayTasks && data.todayTasks.length > 0)
    ? data.todayTasks.map(t => row(
        (isOverdue(t.due_date) ? '&#9888; ' : '&#10003; ') + (t.title || ''),
        isOverdue(t.due_date) ? '<span style="color:#CC0000;font-weight:bold">OVERDUE</span>' : (t.due_date ? fmtDate(t.due_date) : ''),
        isOverdue(t.due_date)
      )).join('')
    : (prefs.showTasks ? row('Nothing due today — all caught up! &#127881;', '', false) : '')

  const calRows = (prefs.showCalendar && data.todayEvents && data.todayEvents.length > 0)
    ? data.todayEvents.map(e => row(e.title, (e.start_time || '') + (e.location ? ' &#183; ' + e.location : ''), false)).join('')
    : ''

  const dealRows = (prefs.showDeals && data.activeDeals && data.activeDeals.length > 0)
    ? data.activeDeals.slice(0, 8).map(d => row(
        (d.addr || '') + (d.client_legal_name ? '<br/><span style="font-size:11px;color:' + mutedColor + '">' + d.client_legal_name + '</span>' : ''),
        '<span style="color:#16A34A;font-weight:bold">' + fmt$(d.gci) + '</span><br/><span style="font-size:11px">' + (d.stage || '') + '</span>',
        false
      )).join('')
    : (prefs.showDeals ? row('No active deals right now.', '', false) : '')

  const closingRows = (prefs.showClosings && data.upcomingClose && data.upcomingClose.length > 0)
    ? data.upcomingClose.map(d => {
        const days = getDaysUntil(d.expected_close_date || d.close_date)
        const urgency = days <= 7
        return row(
          d.addr || '',
          '<span style="color:' + (urgency ? '#CC0000' : '#16A34A') + ';font-weight:bold">' + fmt$(d.gci) + '</span><br/><span style="font-size:11px">' + days + ' days &#183; ' + fmtDate(d.expected_close_date || d.close_date) + '</span>',
          urgency
        )
      }).join('')
    : (prefs.showClosings ? row('No closings in the next 30 days.', '', false) : '')

  const leadRows = (prefs.showLeads && data.hotLeads && data.hotLeads.length > 0)
    ? data.hotLeads.slice(0, 8).map(c => row(
        (c.first_name || '') + ' ' + (c.last_name || ''),
        '<span style="background:' + (c.status === 'Hot' ? '#FEE2E2' : '#FFF7ED') + ';color:' + (c.status === 'Hot' ? '#CC0000' : '#C2410C') + ';padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold">' + c.status + '</span>',
        false
      )).join('')
    : (prefs.showLeads ? row('No hot or warm leads right now.', '', false) : '')

  const listingRows = (prefs.showListings && data.listings && data.listings.length > 0)
    ? data.listings.map(l => row(l.addr || '', '<span style="font-weight:bold;color:' + textColor + '">' + fmt$(l.list_price) + '</span>', false)).join('')
    : (prefs.showListings ? row('No active listings.', '', false) : '')

  const ohRows = (prefs.showOpenHouses && data.openHouses && data.openHouses.length > 0)
    ? data.openHouses.map(oh => row(oh.listing_addr || 'Open House', fmtDate(oh.date) + (oh.start_time ? ' &#183; ' + oh.start_time : ''), false)).join('')
    : (prefs.showOpenHouses ? row('No open houses this week.', '', false) : '')

  return '<!DOCTYPE html>' +
  '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Daily Briefing</title></head>' +
  '<body style="margin:0;padding:0;background:' + bodyBg + ';font-family:' + fontFamily + '">' +

  '<table width="100%" cellpadding="0" cellspacing="0" style="background:' + bodyBg + ';padding:24px 0">' +
  '<tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px">' +

  '<tr><td style="background:' + headerBg + ';padding:28px 32px;border-radius:8px 8px 0 0">' +
    '<p style="margin:0 0 4px 0;font-family:' + fontFamily + ';font-size:11px;font-weight:bold;color:rgba(255,255,255,0.45);text-transform:uppercase;letter-spacing:2px">TargetOS Daily Briefing</p>' +
    '<p style="margin:0 0 3px 0;font-family:' + fontFamily + ';font-size:24px;font-weight:900;color:#ffffff">Good morning, ' + (agentName.split(' ')[0]) + ' &#128075;</p>' +
    '<p style="margin:0 0 20px 0;font-family:' + fontFamily + ';font-size:13px;color:rgba(255,255,255,0.5)">' + today + '</p>' +

    '<table cellpadding="0" cellspacing="0"><tr>' +
      [
        { label:'Tasks Due',    value: String(data.todayTasks?.length || 0),  color: (data.overdueTasks?.length||0)>0 ? '#F87171' : '#4ADE80' },
        { label:'Active Deals', value: String(data.activeDeals?.length || 0), color: '#FCD34D' },
        { label:'Hot Leads',    value: String(data.hotLeads?.length || 0),    color: '#F87171' },
        { label:'YTD GCI',      value: fmt$(data.closedGCI || 0),              color: '#4ADE80' },
      ].map(stat =>
        '<td style="padding-right:28px">' +
          '<p style="margin:0;font-family:' + fontFamily + ';font-size:22px;font-weight:900;color:' + stat.color + '">' + stat.value + '</p>' +
          '<p style="margin:0;font-family:' + fontFamily + ';font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px">' + stat.label + '</p>' +
        '</td>'
      ).join('') +
    '</tr></table>' +
  '</td></tr>' +

  '<tr><td style="background:#ffffff;padding:28px 32px">' +

  (customMsg
    ? '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px"><tr><td style="background:#EFF6FF;border:1px solid #BFDBFE;border-left:4px solid #3B82F6;padding:12px 16px;border-radius:4px"><p style="margin:0;font-family:' + fontFamily + ';font-size:13px;color:#1E40AF;line-height:1.6">' + customMsg + '</p></td></tr></table>'
    : '') +

  (prefs.showTasks    ? section("Today's Tasks & Overdue", '&#10003;', taskRows)    : '') +
  (prefs.showCalendar && calRows ? section("Today's Calendar", '&#128197;', calRows) : '') +
  (prefs.showDeals    ? section('Active Deals', '&#128188;', dealRows)               : '') +
  (prefs.showClosings ? section('Upcoming Closings (30 days)', '&#127919;', closingRows) : '') +
  (prefs.showLeads    ? section('Hot &amp; Warm Leads', '&#128293;', leadRows)       : '') +
  (prefs.showListings ? section('Active Listings', '&#127968;', listingRows)         : '') +
  (prefs.showOpenHouses ? section('Open Houses This Week', '&#128682;', ohRows)      : '') +

  (prefs.showQuote && quote
    ? '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:' + headerBg + ';padding:20px 24px;border-radius:6px;border-left:4px solid ' + accentColor + '">' +
        '<p style="margin:0 0 10px 0;font-family:' + fontFamily + ';font-size:14px;font-style:italic;color:rgba(255,255,255,0.9);line-height:1.7">&#8220;' + quote.text + '&#8221;</p>' +
        '<p style="margin:0;font-family:' + fontFamily + ';font-size:11px;font-weight:bold;color:' + accentColor + ';text-transform:uppercase;letter-spacing:1px">&#8212; ' + quote.author + '</p>' +
      '</td></tr></table>'
    : '') +

  '</td></tr>' +

  '<tr><td style="background:#F1F5F9;padding:16px 32px;border-radius:0 0 8px 8px;border-top:1px solid #E2E8F0">' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
      '<td><p style="margin:0;font-family:' + fontFamily + ';font-size:11px;color:#94A3B8">TargetOS &#183; Target Team &#183; KW Valley Realty</p></td>' +
      '<td align="right"><p style="margin:0;font-family:' + fontFamily + ';font-size:11px;color:#94A3B8">845.424.1014</p></td>' +
    '</tr></table>' +
  '</td></tr>' +

  '</table></td></tr></table>' +
  '</body></html>'
}

const DEFAULT_PREFS = {
  showTasks:true, showCalendar:true, showDeals:true,
  showClosings:true, showLeads:true, showListings:true,
  showOpenHouses:true, showQuote:true,
  emailEnabled:true, emailTime:'07:00',
}

const DEFAULT_STYLE = {
  headerBg:    '#1B2B4B',
  accentColor: '#CC2200',
  bodyBg:      '#F8FAFC',
  textColor:   '#1E293B',
  mutedColor:  '#64748B',
  fontFamily:  'Arial, Helvetica, sans-serif',
}

module.exports = {
  getTodaysQuote, buildEmailHTML, isDueToday, isOverdue, getDaysUntil, fmt$, fmtDate,
  DEFAULT_PREFS, DEFAULT_STYLE,
}
