// TargetOS V2 — Daily Briefing
// Email-safe HTML (table-based, no flex/grid), live customizer,
// per-agent prefs, KW quotes, admin send-all.
import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp }  from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { fmt$, fmtDate, isDueToday, isOverdue, getDaysUntil } from '../lib/utils'
import { Btn, Loading } from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

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

  // Safe table-based section
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

  // Build section rows
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

  // Outer wrapper
  '<table width="100%" cellpadding="0" cellspacing="0" style="background:' + bodyBg + ';padding:24px 0">' +
  '<tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px">' +

  // ── HEADER ──
  '<tr><td style="background:' + headerBg + ';padding:28px 32px;border-radius:8px 8px 0 0">' +
    '<p style="margin:0 0 4px 0;font-family:' + fontFamily + ';font-size:11px;font-weight:bold;color:rgba(255,255,255,0.45);text-transform:uppercase;letter-spacing:2px">TargetOS Daily Briefing</p>' +
    '<p style="margin:0 0 3px 0;font-family:' + fontFamily + ';font-size:24px;font-weight:900;color:#ffffff">Good morning, ' + (agentName.split(' ')[0]) + ' &#128075;</p>' +
    '<p style="margin:0 0 20px 0;font-family:' + fontFamily + ';font-size:13px;color:rgba(255,255,255,0.5)">' + today + '</p>' +

    // Stats row (table-based)
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

  // ── BODY ──
  '<tr><td style="background:#ffffff;padding:28px 32px">' +

  // Custom message
  (customMsg
    ? '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px"><tr><td style="background:#EFF6FF;border:1px solid #BFDBFE;border-left:4px solid #3B82F6;padding:12px 16px;border-radius:4px"><p style="margin:0;font-family:' + fontFamily + ';font-size:13px;color:#1E40AF;line-height:1.6">' + customMsg + '</p></td></tr></table>'
    : '') +

  // Sections
  (prefs.showTasks    ? section("Today's Tasks & Overdue", '&#10003;', taskRows)    : '') +
  (prefs.showCalendar && calRows ? section("Today's Calendar", '&#128197;', calRows) : '') +
  (prefs.showDeals    ? section('Active Deals', '&#128188;', dealRows)               : '') +
  (prefs.showClosings ? section('Upcoming Closings (30 days)', '&#127919;', closingRows) : '') +
  (prefs.showLeads    ? section('Hot &amp; Warm Leads', '&#128293;', leadRows)       : '') +
  (prefs.showListings ? section('Active Listings', '&#127968;', listingRows)         : '') +
  (prefs.showOpenHouses ? section('Open Houses This Week', '&#128682;', ohRows)      : '') +

  // Quote
  (prefs.showQuote && quote
    ? '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:' + headerBg + ';padding:20px 24px;border-radius:6px;border-left:4px solid ' + accentColor + '">' +
        '<p style="margin:0 0 10px 0;font-family:' + fontFamily + ';font-size:14px;font-style:italic;color:rgba(255,255,255,0.9);line-height:1.7">&#8220;' + quote.text + '&#8221;</p>' +
        '<p style="margin:0;font-family:' + fontFamily + ';font-size:11px;font-weight:bold;color:' + accentColor + ';text-transform:uppercase;letter-spacing:1px">&#8212; ' + quote.author + '</p>' +
      '</td></tr></table>'
    : '') +

  '</td></tr>' +

  // ── FOOTER ──
  '<tr><td style="background:#F1F5F9;padding:16px 32px;border-radius:0 0 8px 8px;border-top:1px solid #E2E8F0">' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
      '<td><p style="margin:0;font-family:' + fontFamily + ';font-size:11px;color:#94A3B8">TargetOS &#183; Target Team &#183; KW Valley Realty</p></td>' +
      '<td align="right"><p style="margin:0;font-family:' + fontFamily + ';font-size:11px;color:#94A3B8">845.424.1014</p></td>' +
    '</tr></table>' +
  '</td></tr>' +

  '</table></td></tr></table>' +
  '</body></html>'
}

// ── DEFAULT PREFS & STYLE ────────────────────────────────────────
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

// ── MAIN COMPONENT ───────────────────────────────────────────────
export function DailyBriefing() {
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()

  const [activeTab,    setActiveTab]    = useState('preview')
  const [data,         setData]         = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [sending,      setSending]      = useState(false)
  const [sendingAll,   setSendingAll]   = useState(false)
  const [prefs,        setPrefs]        = useState(DEFAULT_PREFS)
  const [emailStyle,   setEmailStyle]   = useState(DEFAULT_STYLE)
  const [customMsg,    setCustomMsg]    = useState('')
  const [customQuotes, setCustomQuotes] = useState([])
  const [newQuote,     setNewQuote]     = useState({ text:'', author:'' })
  const [addingQuote,  setAddingQuote]  = useState(false)
  const [agentPrefs,   setAgentPrefs]   = useState({})
  const [allAgents,    setAllAgents]    = useState([])
  const [savingPrefs,  setSavingPrefs]  = useState(false)
  const [previewFor,   setPreviewFor]   = useState(null)
  const [previewMode,  setPreviewMode]  = useState('app')  // 'app' | 'email'

  const viewAgent = previewFor || agent

  // ── LOAD DATA ──────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!viewAgent) return
    setLoading(true)
    try {
      const today   = new Date().toISOString().slice(0, 10)
      const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7)
      const wkStr   = weekEnd.toISOString().slice(0, 10)
      const isAdminView = isAdmin || canManage
      const filter  = (!isAdminView || previewFor) ? viewAgent.id : null

      let tasksQ   = supabase.from('tasks').select('*').neq('status','done')
      let dealsQ   = supabase.from('deals').select('*')
      let conQ     = supabase.from('contacts').select('id,first_name,last_name,status,phone')
      let listQ    = supabase.from('listings').select('*').eq('status','Active')
      let ohQ      = supabase.from('open_houses').select('*').gte('date',today).lte('date',wkStr)
      let calQ     = supabase.from('calendar_events').select('*').eq('date',today).order('start_time')

      if (filter) {
        tasksQ = tasksQ.eq('agent_id', filter)
        dealsQ = dealsQ.eq('agent_id', filter)
        conQ   = conQ.eq('agent_id', filter)
        listQ  = listQ.eq('agent_id', filter)
        ohQ    = ohQ.eq('agent_id', filter)
        calQ   = calQ.eq('agent_id', filter)
      }

      const [tasks, deals, contacts, listings, openHouses, anns, todayEvents] = await Promise.all([
        tasksQ.then(r => r.data || []),
        dealsQ.then(r => r.data || []),
        conQ.then(r => r.data || []),
        listQ.then(r => r.data || []),
        ohQ.then(r => r.data || []),
        supabase.from('announcements').select('*').order('pinned',{ascending:false}).limit(3).then(r => r.data || []),
        calQ.then(r => r.data || []),
      ])

      const todayTasks    = tasks.filter(t => isDueToday(t.due_date) || isOverdue(t.due_date))
      const overdueTasks  = tasks.filter(t => isOverdue(t.due_date))
      const activeDeals   = deals.filter(d => !['Closed','Deal Fell Through'].includes(d.stage))
      const upcomingClose = deals.filter(d => {
        const dt = d.expected_close_date || d.close_date
        if (!dt) return false
        const dy = getDaysUntil(dt)
        return dy !== null && dy >= 0 && dy <= 30 && d.stage !== 'Closed'
      }).sort((a,b) => getDaysUntil(a.expected_close_date||a.close_date) - getDaysUntil(b.expected_close_date||b.close_date))
      const hotLeads      = contacts.filter(c => ['Hot','Warm'].includes(c.status))
      const closedGCI     = deals.filter(d => d.stage==='Closed' && (d.ao_date||'').startsWith(String(new Date().getFullYear()))).reduce((s,d) => s+(parseFloat(d.gci)||0), 0)

      setData({ todayTasks, overdueTasks, activeDeals, upcomingClose, hotLeads, listings, openHouses, todayEvents, closedGCI })
    } catch(e) { toast('Load failed: ' + e.message, '#DC2626') }
    finally { setLoading(false) }
  }, [viewAgent?.id])

  // ── LOAD PREFS ─────────────────────────────────────────────────
  const loadPrefs = useCallback(async () => {
    if (!agent) return
    try {
      const { data: mp } = await supabase.from('briefing_prefs').select('*').eq('agent_id', agent.id).maybeSingle()
      if (mp) {
        setPrefs({ ...DEFAULT_PREFS, ...(mp.sections||{}), emailEnabled: mp.enabled ?? true, emailTime: mp.send_time || '07:00' })
        setCustomMsg(mp.custom_message || '')
        if (mp.email_style) setEmailStyle({ ...DEFAULT_STYLE, ...mp.email_style })
      }
      const { data: qts } = await supabase.from('briefing_quotes').select('*').order('created_at',{ascending:false})
      setCustomQuotes(qts || [])
      if (isAdmin || canManage) {
        const [agRes, apRes] = await Promise.all([
          supabase.from('agents').select('*').eq('active',true).order('name'),
          supabase.from('briefing_prefs').select('*'),
        ])
        setAllAgents(agRes.data || [])
        const pm = {}
        ;(apRes.data || []).forEach(p => { pm[p.agent_id] = p })
        setAgentPrefs(pm)
      }
    } catch(e) { console.warn('prefs:', e.message) }
  }, [agent?.id])

  useEffect(() => { load() },      [load])
  useEffect(() => { loadPrefs() }, [loadPrefs])

  // ── SAVE PREFS ─────────────────────────────────────────────────
  async function saveMyPrefs() {
    if (!agent) return
    setSavingPrefs(true)
    try {
      const { emailEnabled, emailTime, ...sections } = prefs
      // Check if pref row exists, then update or insert
      const { data: existingPref } = await supabase
        .from('briefing_prefs')
        .select('id')
        .eq('agent_id', agent.id)
        .maybeSingle()

      const prefData = {
        agent_id:       agent.id,
        enabled:        emailEnabled,
        send_time:      emailTime,
        sections:       sections,
        custom_message: customMsg,
        email_style:    emailStyle,
        updated_at:     new Date().toISOString(),
      }

      if (existingPref?.id) {
        await supabase.from('briefing_prefs').update(prefData).eq('id', existingPref.id)
      } else {
        await supabase.from('briefing_prefs').insert(prefData)
      }
      toast('✅ Preferences saved')
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
    finally { setSavingPrefs(false) }
  }

  // ── SEND MY EMAIL ──────────────────────────────────────────────
  async function sendMyEmail() {
    if (!agent?.email || !data) return
    setSending(true)
    try {
      const quote = getTodaysQuote(customQuotes)
      const html  = buildEmailHTML(agent.name, data, prefs, quote, customMsg, emailStyle)
      const { data: { session } } = await supabase.auth.getSession()
      const res   = await fetch('/api/send-email', {
        method: 'POST', headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': 'Bearer ' + session.access_token } : {}),
        },
        body: JSON.stringify({
          from:    'TargetOS Briefing <briefing@targetreteam.com>',
          to:      [agent.email],
          subject: '☀️ Daily Briefing — ' + new Date().toLocaleDateString('en-US', { weekday:'long', month:'short', day:'numeric', timeZone:'America/New_York' }),
          html,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Send failed')
      toast('✅ Briefing sent to ' + agent.email)
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
    finally { setSending(false) }
  }

  // ── SEND ALL ───────────────────────────────────────────────────
  async function sendAllBriefings() {
    if (!isAdmin && !canManage) return
    setSendingAll(true)
    let sent = 0, failed = 0
    try {
      const quotes = customQuotes
      const { data: { session } } = await supabase.auth.getSession()
      const authHeaders = session?.access_token ? { 'Authorization': 'Bearer ' + session.access_token } : {}
      for (const ag of allAgents) {
        const ap = agentPrefs[ag.id]
        if (ap && !ap.enabled) continue
        try {
          const today  = new Date().toISOString().slice(0,10)
          const wkEnd  = new Date(); wkEnd.setDate(wkEnd.getDate()+7)
          const [tasks,deals,cons,listings,ohs,cals] = await Promise.all([
            supabase.from('tasks').select('*').eq('agent_id',ag.id).neq('status','done').then(r=>r.data||[]),
            supabase.from('deals').select('*').eq('agent_id',ag.id).then(r=>r.data||[]),
            supabase.from('contacts').select('id,first_name,last_name,status').eq('agent_id',ag.id).then(r=>r.data||[]),
            supabase.from('listings').select('*').eq('agent_id',ag.id).eq('status','Active').then(r=>r.data||[]),
            supabase.from('open_houses').select('*').eq('agent_id',ag.id).gte('date',today).lte('date',wkEnd.toISOString().slice(0,10)).then(r=>r.data||[]),
            supabase.from('calendar_events').select('*').eq('agent_id',ag.id).eq('date',today).then(r=>r.data||[]),
          ])
          const agData = {
            todayTasks:    tasks.filter(t=>isDueToday(t.due_date)||isOverdue(t.due_date)),
            overdueTasks:  tasks.filter(t=>isOverdue(t.due_date)),
            activeDeals:   deals.filter(d=>!['Closed','Deal Fell Through'].includes(d.stage)),
            upcomingClose: deals.filter(d=>{const dt=d.expected_close_date||d.close_date;if(!dt)return false;const dy=getDaysUntil(dt);return dy!==null&&dy>=0&&dy<=30&&d.stage!=='Closed'}).sort((a,b)=>getDaysUntil(a.expected_close_date||a.close_date)-getDaysUntil(b.expected_close_date||b.close_date)),
            hotLeads:      cons.filter(c=>['Hot','Warm'].includes(c.status)),
            listings, openHouses:ohs, todayEvents:cals,
            closedGCI: deals.filter(d=>d.stage==='Closed'&&(d.ao_date||'').startsWith(String(new Date().getFullYear()))).reduce((s,d)=>s+(parseFloat(d.gci)||0),0),
          }
          const agStyle = (ap && ap.email_style) ? { ...DEFAULT_STYLE, ...ap.email_style } : emailStyle
          const agPrefs2 = ap?.sections ? { ...DEFAULT_PREFS, ...ap.sections } : DEFAULT_PREFS
          const html = buildEmailHTML(ag.name, agData, agPrefs2, getTodaysQuote(quotes), ap?.custom_message||'', agStyle)
          const res = await fetch('/api/send-email', {
            method:'POST', headers:{'Content-Type':'application/json', ...authHeaders},
            body: JSON.stringify({ from:'TargetOS Briefing <briefing@targetreteam.com>', to:[ag.email], subject:'☀️ Daily Briefing — ' + new Date().toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric',timeZone:'America/New_York'}), html }),
          })
          if (res.ok) sent++; else failed++
        } catch(e) { failed++ }
      }
      toast('✅ Sent ' + sent + ' briefings' + (failed ? ' · ' + failed + ' failed' : ''))
    } catch(e) { toast('Error: ' + e.message, '#DC2626') }
    finally { setSendingAll(false) }
  }

  // ── ADD QUOTE ──────────────────────────────────────────────────
  async function addQuote() {
    if (!newQuote.text.trim()) { toast('Enter quote text', '#F5A623'); return }
    setAddingQuote(true)
    try {
      const { data: q } = await supabase.from('briefing_quotes').insert({ text:newQuote.text.trim(), author:newQuote.author.trim()||'Unknown', added_by:agent?.id, created_at:new Date().toISOString() }).select().single()
      setCustomQuotes(prev => [q,...prev])
      setNewQuote({ text:'', author:'' })
      toast('✅ Quote added')
    } catch(e) { toast('Add failed — create briefing_quotes table first', '#DC2626') }
    finally { setAddingQuote(false) }
  }

  const quote   = getTodaysQuote(customQuotes)
  const todayStr = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric', timeZone:'America/New_York' })
  const TABS = [
    { id:'preview',  label:'📋 Preview' },
    { id:'design',   label:'🎨 Design' },
    { id:'settings', label:'⚙️ Settings' },
    { id:'quotes',   label:'💬 Quotes' },
    ...(isAdmin||canManage ? [{ id:'admin', label:'👥 Agents' }] : []),
  ]

  function ColorPicker({ label, k }) {
    return (
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>{label}</div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <input type="color" value={emailStyle[k]} onChange={e => setEmailStyle(s => ({ ...s, [k]: e.target.value }))}
            style={{ width:40, height:32, borderRadius:6, border:'1px solid var(--border)', cursor:'pointer', padding:2 }} />
          <input type="text" value={emailStyle[k]} onChange={e => setEmailStyle(s => ({ ...s, [k]: e.target.value }))}
            style={{ flex:1, padding:'6px 8px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff }} />
        </div>
      </div>
    )
  }

  function ToggleRow({ k, label }) {
    return (
      <label style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid var(--border)', cursor:'pointer' }}>
        <span style={{ fontSize:13, color:'var(--text)' }}>{label}</span>
        <div onClick={() => setPrefs(p => ({ ...p, [k]: !p[k] }))}
          style={{ width:40, height:22, borderRadius:11, background:prefs[k]?'#CC2200':'var(--dim)', border:'1px solid '+(prefs[k]?'#CC2200':'var(--border)'), position:'relative', cursor:'pointer', transition:'all .2s', flexShrink:0 }}>
          <div style={{ position:'absolute', top:2, left:prefs[k]?20:2, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,.2)' }} />
        </div>
      </label>
    )
  }

  return (
    <div style={{ fontFamily:ff }}>
      {/* Page header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:900, color:'var(--text)' }}>☀️ Daily Briefing</div>
          <div style={{ fontSize:13, color:'var(--muted)', marginTop:2 }}>{todayStr}</div>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={load} style={{ padding:'8px 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:ff }}>↻ Refresh</button>
          {(isAdmin||canManage) && (
            <button onClick={sendAllBriefings} disabled={sendingAll}
              style={{ padding:'8px 16px', borderRadius:8, border:'none', background:'#1B2B4B', color:'#fff', fontSize:13, fontWeight:700, cursor:sendingAll?'default':'pointer', fontFamily:ff, opacity:sendingAll?.7:1 }}>
              {sendingAll ? '⏳ Sending...' : '📨 Send All'}
            </button>
          )}
          <button onClick={sendMyEmail} disabled={sending}
            style={{ padding:'8px 16px', borderRadius:8, border:'none', background:'#CC2200', color:'#fff', fontSize:13, fontWeight:700, cursor:sending?'default':'pointer', fontFamily:ff, opacity:sending?.7:1 }}>
            {sending ? '⏳ Sending...' : '📧 Email Me'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:'2px solid var(--border)', marginBottom:24, gap:0, overflowX:'auto' }}>
        {TABS.map(t => {
          const active = activeTab === t.id
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{ padding:'9px 18px', border:'none', background:'none', cursor:'pointer',
                borderBottom:active?'2px solid #CC2200':'2px solid transparent', marginBottom:'-2px',
                fontSize:13, fontWeight:active?700:500, color:active?'#CC2200':'var(--muted)', fontFamily:ff, whiteSpace:'nowrap' }}>
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ── PREVIEW TAB ── */}
      {activeTab === 'preview' && (
        <div>
          {(isAdmin||canManage) && allAgents.length > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, padding:'10px 14px', background:'var(--dim)', borderRadius:10, border:'1px solid var(--border)', flexWrap:'wrap' }}>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--muted)' }}>Preview as:</span>
              <select value={previewFor?.id||''} onChange={e => setPreviewFor(allAgents.find(a=>a.id===e.target.value)||null)}
                style={{ padding:'5px 10px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }}>
                <option value="">My briefing</option>
                {allAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
                {[['app','📋 App view'],['email','📧 Email preview']].map(([v,l]) => (
                  <button key={v} onClick={() => setPreviewMode(v)}
                    style={{ padding:'5px 12px', borderRadius:7, border:'1px solid '+(previewMode===v?'#CC2200':'var(--border)'), background:previewMode===v?'rgba(204,34,0,.1)':'transparent', color:previewMode===v?'#CC2200':'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:ff, fontWeight:previewMode===v?700:400 }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading ? <Loading /> : !data ? null : previewMode === 'email' ? (
            // Email HTML preview in iframe
            <div style={{ border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'10px 16px', background:'var(--dim)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:12, height:12, borderRadius:'50%', background:'#DC2626' }} />
                <div style={{ width:12, height:12, borderRadius:'50%', background:'#F5A623' }} />
                <div style={{ width:12, height:12, borderRadius:'50%', background:'#10B981' }} />
                <span style={{ fontSize:11, color:'var(--muted)', marginLeft:8 }}>Email preview — exactly what the recipient sees</span>
              </div>
              <iframe
                srcDoc={buildEmailHTML((viewAgent?.name||agent?.name||'Agent'), data, prefs, quote, customMsg, emailStyle)}
                style={{ width:'100%', height:700, border:'none', display:'block', background:'#F8FAFC' }}
                title="Email preview"
              />
            </div>
          ) : (
            // App view
            <div style={{ maxWidth:680 }}>
              <div style={{ background:'var(--panel)', borderRadius:16, border:'1px solid var(--border)', overflow:'hidden' }}>
                <div style={{ background:emailStyle.headerBg, padding:'24px 28px' }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,.4)', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:5 }}>TargetOS Daily Briefing</div>
                  <div style={{ fontSize:22, fontWeight:900, color:'#fff', marginBottom:3 }}>Good morning, {(viewAgent?.name||agent?.name||'').split(' ')[0]} 👋</div>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,.4)', marginBottom:16 }}>{todayStr}</div>
                  <div style={{ display:'flex', gap:24, flexWrap:'wrap' }}>
                    {[
                      { l:'Tasks Due',    v:data.todayTasks?.length||0,  c:(data.overdueTasks?.length||0)>0?'#F87171':'#4ADE80' },
                      { l:'Active Deals', v:data.activeDeals?.length||0, c:'#FCD34D' },
                      { l:'Hot Leads',    v:data.hotLeads?.length||0,    c:'#F87171' },
                      { l:'YTD GCI',      v:fmt$(data.closedGCI||0),      c:'#4ADE80' },
                    ].map(s => (
                      <div key={s.l}>
                        <div style={{ fontSize:20, fontWeight:800, color:s.c }}>{s.v}</div>
                        <div style={{ fontSize:10, color:'rgba(255,255,255,.35)', textTransform:'uppercase', letterSpacing:'.06em' }}>{s.l}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ padding:'20px 28px' }}>
                  {customMsg && <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderLeft:'4px solid #3B82F6', borderRadius:4, padding:'10px 14px', marginBottom:18, fontSize:13, color:'#1E40AF', lineHeight:1.6 }}>{customMsg}</div>}

                  {prefs.showTasks && <AppSection title="Today's Tasks & Overdue" icon="✅" color={emailStyle.accentColor}>
                    {data.todayTasks?.length===0 && <AppEmpty>Nothing due today — all caught up! 🎉</AppEmpty>}
                    {data.todayTasks?.map(t => (
                      <AppRow key={t.id}>
                        <div style={{ flex:1, fontSize:13, color:isOverdue(t.due_date)?'#DC2626':'var(--text)', fontWeight:isOverdue(t.due_date)?700:400 }}>{t.title}</div>
                        {isOverdue(t.due_date) && <span style={{ fontSize:10, padding:'2px 7px', borderRadius:4, background:'#FEE2E2', color:'#DC2626', fontWeight:700 }}>OVERDUE</span>}
                        {!isOverdue(t.due_date) && t.due_date && <span style={{ fontSize:11, color:'var(--muted)' }}>{fmtDate(t.due_date)}</span>}
                      </AppRow>
                    ))}
                  </AppSection>}

                  {prefs.showCalendar && data.todayEvents?.length>0 && <AppSection title="Today's Calendar" icon="📅" color={emailStyle.accentColor}>
                    {data.todayEvents.map(e => (
                      <AppRow key={e.id}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{e.title}</div>
                          {e.location && <div style={{ fontSize:11, color:'var(--muted)' }}>📍 {e.location}</div>}
                        </div>
                        <span style={{ fontSize:12, color:'var(--muted)' }}>{e.start_time||''}</span>
                      </AppRow>
                    ))}
                  </AppSection>}

                  {prefs.showDeals && <AppSection title="Active Deals" icon="💼" color={emailStyle.accentColor}>
                    {data.activeDeals?.length===0 && <AppEmpty>No active deals.</AppEmpty>}
                    {data.activeDeals?.slice(0,8).map(d => (
                      <AppRow key={d.id}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{d.addr}</div>
                          {d.client_legal_name && <div style={{ fontSize:11, color:'var(--muted)' }}>{d.client_legal_name}</div>}
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <div style={{ fontSize:12, fontWeight:700, color:'#10B981' }}>{fmt$(d.gci)}</div>
                          <div style={{ fontSize:10, color:'var(--muted)' }}>{d.stage}</div>
                        </div>
                      </AppRow>
                    ))}
                  </AppSection>}

                  {prefs.showClosings && <AppSection title="Upcoming Closings (30 days)" icon="🎯" color={emailStyle.accentColor}>
                    {data.upcomingClose?.length===0 && <AppEmpty>No closings in the next 30 days.</AppEmpty>}
                    {data.upcomingClose?.map(d => {
                      const days = getDaysUntil(d.expected_close_date||d.close_date)
                      return (
                        <AppRow key={d.id}>
                          <div style={{ flex:1, fontSize:13, fontWeight:days<=7?700:400, color:days<=7?'#DC2626':'var(--text)' }}>{d.addr}</div>
                          <div style={{ textAlign:'right' }}>
                            <div style={{ fontSize:12, fontWeight:700, color:days<=7?'#DC2626':'#10B981' }}>{fmt$(d.gci)}</div>
                            <div style={{ fontSize:11, color:'var(--muted)' }}>{days}d · {fmtDate(d.expected_close_date||d.close_date)}</div>
                          </div>
                        </AppRow>
                      )
                    })}
                  </AppSection>}

                  {prefs.showLeads && <AppSection title="Hot & Warm Leads" icon="🔥" color={emailStyle.accentColor}>
                    {data.hotLeads?.length===0 && <AppEmpty>No hot or warm leads.</AppEmpty>}
                    {data.hotLeads?.slice(0,8).map(c => (
                      <AppRow key={c.id}>
                        <div style={{ flex:1, fontSize:13, color:'var(--text)' }}>{c.first_name} {c.last_name}</div>
                        <span style={{ fontSize:11, padding:'2px 8px', borderRadius:4, background:c.status==='Hot'?'#FEE2E2':'#FFF7ED', color:c.status==='Hot'?'#DC2626':'#F97316', fontWeight:700 }}>{c.status}</span>
                      </AppRow>
                    ))}
                  </AppSection>}

                  {prefs.showListings && <AppSection title="Active Listings" icon="🏡" color={emailStyle.accentColor}>
                    {data.listings?.length===0 && <AppEmpty>No active listings.</AppEmpty>}
                    {data.listings?.map(l => (
                      <AppRow key={l.id}>
                        <div style={{ flex:1, fontSize:13, color:'var(--text)' }}>{l.addr}</div>
                        <div style={{ fontSize:13, fontWeight:700, color:emailStyle.headerBg }}>{fmt$(l.list_price)}</div>
                      </AppRow>
                    ))}
                  </AppSection>}

                  {prefs.showOpenHouses && <AppSection title="Open Houses This Week" icon="🚪" color={emailStyle.accentColor}>
                    {data.openHouses?.length===0 && <AppEmpty>No open houses this week.</AppEmpty>}
                    {data.openHouses?.map(oh => (
                      <AppRow key={oh.id}>
                        <div style={{ flex:1, fontSize:13, color:'var(--text)' }}>{oh.listing_addr||'Open House'}</div>
                        <div style={{ fontSize:12, color:'var(--muted)' }}>{fmtDate(oh.date)} {oh.start_time&&'· '+oh.start_time}</div>
                      </AppRow>
                    ))}
                  </AppSection>}

                  {prefs.showQuote && (
                    <div style={{ background:emailStyle.headerBg, borderRadius:10, padding:'16px 20px', borderLeft:'4px solid '+emailStyle.accentColor }}>
                      <div style={{ fontSize:14, fontStyle:'italic', color:'rgba(255,255,255,.9)', lineHeight:1.7, marginBottom:8 }}>"{quote.text}"</div>
                      <div style={{ fontSize:11, fontWeight:700, color:emailStyle.accentColor, textTransform:'uppercase', letterSpacing:'.06em' }}>— {quote.author}</div>
                    </div>
                  )}
                </div>

                <div style={{ padding:'12px 28px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--dim)' }}>
                  <span style={{ fontSize:11, color:'var(--muted)' }}>TargetOS · KW Valley Realty · Target Team</span>
                  <button onClick={sendMyEmail} disabled={sending}
                    style={{ padding:'7px 14px', borderRadius:8, border:'none', background:'#CC2200', color:'#fff', fontSize:12, fontWeight:700, cursor:sending?'default':'pointer', fontFamily:ff }}>
                    {sending ? 'Sending...' : '📧 Email Me'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── DESIGN TAB ── */}
      {activeTab === 'design' && (
        <div style={{ display:'flex', gap:24, flexWrap:'wrap', alignItems:'flex-start' }}>
          <div style={{ flex:'0 0 280px' }}>
            <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:18, marginBottom:16 }}>
              <div style={{ fontSize:14, fontWeight:800, color:'var(--text)', marginBottom:14 }}>🎨 Email Colors</div>
              <ColorPicker label="Header background" k="headerBg" />
              <ColorPicker label="Accent / highlight color" k="accentColor" />
              <ColorPicker label="Body background" k="bodyBg" />
              <ColorPicker label="Body text" k="textColor" />
              <ColorPicker label="Muted text" k="mutedColor" />
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>Font family</div>
                <select value={emailStyle.fontFamily} onChange={e => setEmailStyle(s => ({ ...s, fontFamily: e.target.value }))}
                  style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }}>
                  <option value="Arial, Helvetica, sans-serif">Arial (safest)</option>
                  <option value="Georgia, 'Times New Roman', serif">Georgia (elegant)</option>
                  <option value="Trebuchet MS, sans-serif">Trebuchet</option>
                  <option value="Verdana, sans-serif">Verdana</option>
                  <option value="'Courier New', monospace">Courier (monospace)</option>
                </select>
              </div>
            </div>

            {/* Presets */}
            <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:18, marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:10 }}>Quick Presets</div>
              {[
                { label:'Target Team (default)', s:{ headerBg:'#1B2B4B', accentColor:'#CC2200', bodyBg:'#F8FAFC', textColor:'#1E293B', mutedColor:'#64748B', fontFamily:'Arial, Helvetica, sans-serif' }},
                { label:'Clean White',           s:{ headerBg:'#CC2200', accentColor:'#1B2B4B', bodyBg:'#FFFFFF', textColor:'#111827', mutedColor:'#6B7280', fontFamily:'Arial, Helvetica, sans-serif' }},
                { label:'Dark Mode',             s:{ headerBg:'#0F172A', accentColor:'#F5A623', bodyBg:'#1E293B', textColor:'#F1F5F9', mutedColor:'#94A3B8', fontFamily:'Arial, Helvetica, sans-serif' }},
                { label:'KW Red',                s:{ headerBg:'#CC2200', accentColor:'#222222', bodyBg:'#FFF5F5', textColor:'#1A1A1A', mutedColor:'#666666', fontFamily:'Arial, Helvetica, sans-serif' }},
                { label:'Elegant Navy',          s:{ headerBg:'#0F1A2E', accentColor:'#F5A623', bodyBg:'#F0F4F8', textColor:'#1E293B', mutedColor:'#64748B', fontFamily:'Georgia, serif' }},
              ].map(p => (
                <button key={p.label} onClick={() => setEmailStyle(p.s)}
                  style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--dim)', marginBottom:6, cursor:'pointer', fontFamily:ff, textAlign:'left' }}>
                  <div style={{ display:'flex', gap:3 }}>
                    {[p.s.headerBg, p.s.accentColor, p.s.bodyBg].map((c,i) => (
                      <div key={i} style={{ width:14, height:14, borderRadius:3, background:c, border:'1px solid rgba(0,0,0,.1)' }} />
                    ))}
                  </div>
                  <span style={{ fontSize:12, color:'var(--text)', fontWeight:500 }}>{p.label}</span>
                </button>
              ))}
            </div>

            <button onClick={() => { saveMyPrefs(); toast('Design saved') }}
              style={{ width:'100%', padding:12, borderRadius:10, border:'none', background:'#CC2200', color:'#fff', fontSize:14, fontWeight:800, cursor:'pointer', fontFamily:ff }}>
              💾 Save Design
            </button>
          </div>

          {/* Live preview */}
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:10 }}>Live Email Preview</div>
            {data && (
              <div style={{ border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                <div style={{ padding:'8px 14px', background:'var(--dim)', borderBottom:'1px solid var(--border)', display:'flex', gap:6 }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background:'#DC2626' }} />
                  <div style={{ width:10, height:10, borderRadius:'50%', background:'#F5A623' }} />
                  <div style={{ width:10, height:10, borderRadius:'50%', background:'#10B981' }} />
                  <span style={{ fontSize:10, color:'var(--muted)', marginLeft:6 }}>Email preview updates in real-time</span>
                </div>
                <iframe
                  srcDoc={buildEmailHTML(agent?.name||'Agent', data, prefs, quote, customMsg, emailStyle)}
                  style={{ width:'100%', height:600, border:'none', display:'block' }}
                  title="Live design preview"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SETTINGS TAB ── */}
      {activeTab === 'settings' && (
        <div style={{ maxWidth:520 }}>
          <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:18, marginBottom:14 }}>
            <div style={{ fontSize:14, fontWeight:800, color:'var(--text)', marginBottom:12 }}>📧 Email Delivery</div>
            <ToggleRow k="emailEnabled" label="Receive daily briefing by email" />
            <div style={{ marginTop:12 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>Preferred send time (ET)</div>
              <input type="time" value={prefs.emailTime||'07:00'} onChange={e => setPrefs(p => ({ ...p, emailTime:e.target.value }))}
                style={{ padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }} />
            </div>
          </div>

          <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:18, marginBottom:14 }}>
            <div style={{ fontSize:14, fontWeight:800, color:'var(--text)', marginBottom:4 }}>📋 Sections</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:12 }}>Toggle which sections appear in your email.</div>
            <ToggleRow k="showTasks"      label="✅ Today's Tasks & Overdue" />
            <ToggleRow k="showCalendar"   label="📅 Today's Calendar Events" />
            <ToggleRow k="showDeals"      label="💼 Active Deals" />
            <ToggleRow k="showClosings"   label="🎯 Upcoming Closings" />
            <ToggleRow k="showLeads"      label="🔥 Hot & Warm Leads" />
            <ToggleRow k="showListings"   label="🏡 Active Listings" />
            <ToggleRow k="showOpenHouses" label="🚪 Open Houses This Week" />
            <ToggleRow k="showQuote"      label="💬 Motivational Quote" />
          </div>

          <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:18, marginBottom:16 }}>
            <div style={{ fontSize:14, fontWeight:800, color:'var(--text)', marginBottom:4 }}>✍️ Custom Message</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:10 }}>Appears at the top of every briefing. Great for team goals or weekly focus.</div>
            <textarea value={customMsg} onChange={e => setCustomMsg(e.target.value)} rows={3}
              placeholder="e.g. Team goal: 20 deals this month. We're at 14 — strong finish!"
              style={{ width:'100%', padding:'9px 11px', borderRadius:9, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, resize:'vertical', boxSizing:'border-box' }} />
          </div>

          <button onClick={saveMyPrefs} disabled={savingPrefs}
            style={{ width:'100%', padding:12, borderRadius:10, border:'none', background:'#CC2200', color:'#fff', fontSize:14, fontWeight:800, cursor:savingPrefs?'default':'pointer', fontFamily:ff, opacity:savingPrefs?.7:1 }}>
            {savingPrefs ? 'Saving...' : '💾 Save Settings'}
          </button>
        </div>
      )}

      {/* ── QUOTES TAB ── */}
      {activeTab === 'quotes' && (
        <div style={{ maxWidth:640 }}>
          <div style={{ background:emailStyle.headerBg, borderRadius:12, padding:'18px 22px', marginBottom:18, borderLeft:'4px solid '+emailStyle.accentColor }}>
            <div style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,.4)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6 }}>Today's Quote</div>
            <div style={{ fontSize:14, fontStyle:'italic', color:'rgba(255,255,255,.9)', lineHeight:1.7, marginBottom:8 }}>"{quote.text}"</div>
            <div style={{ fontSize:11, fontWeight:700, color:emailStyle.accentColor, textTransform:'uppercase', letterSpacing:'.06em' }}>— {quote.author}</div>
          </div>

          <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:16, marginBottom:18 }}>
            <div style={{ fontSize:14, fontWeight:800, color:'var(--text)', marginBottom:12 }}>+ Add Your Own Quote</div>
            <textarea value={newQuote.text} onChange={e => setNewQuote(q => ({ ...q, text:e.target.value }))} rows={2}
              placeholder="Quote text..."
              style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, resize:'vertical', boxSizing:'border-box', marginBottom:8 }} />
            <input value={newQuote.author} onChange={e => setNewQuote(q => ({ ...q, author:e.target.value }))}
              placeholder="Author"
              style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, boxSizing:'border-box', marginBottom:10 }} />
            <button onClick={addQuote} disabled={addingQuote}
              style={{ padding:'8px 18px', borderRadius:8, border:'none', background:'#CC2200', color:'#fff', fontSize:13, fontWeight:700, cursor:addingQuote?'default':'pointer', fontFamily:ff }}>
              {addingQuote ? 'Adding...' : '+ Add Quote'}
            </button>
          </div>

          {customQuotes.length > 0 && (
            <div style={{ marginBottom:18 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:8 }}>Your Custom Quotes ({customQuotes.length})</div>
              {customQuotes.map(q => (
                <div key={q.id} style={{ padding:'10px 14px', background:'var(--panel)', borderRadius:10, border:'1px solid var(--border)', marginBottom:6, display:'flex', gap:10, alignItems:'flex-start' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontStyle:'italic', color:'var(--text)', lineHeight:1.55, marginBottom:3 }}>"{q.text}"</div>
                    <div style={{ fontSize:10, fontWeight:700, color:emailStyle.accentColor, textTransform:'uppercase', letterSpacing:'.06em' }}>— {q.author}</div>
                  </div>
                  <button onClick={() => { supabase.from('briefing_quotes').delete().eq('id',q.id); setCustomQuotes(p=>p.filter(x=>x.id!==q.id)); toast('Quote deleted') }}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#DC2626', fontSize:18, padding:4, flexShrink:0 }}>×</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:8 }}>Built-in KW / Gary Keller Quotes ({KW_QUOTES.length})</div>
          {KW_QUOTES.map((q,i) => (
            <div key={i} style={{ padding:'10px 14px', background:'var(--panel)', borderRadius:10, border:'1px solid var(--border)', marginBottom:6 }}>
              <div style={{ fontSize:12, fontStyle:'italic', color:'var(--text)', lineHeight:1.55, marginBottom:3 }}>"{q.text}"</div>
              <div style={{ fontSize:10, fontWeight:700, color:emailStyle.accentColor, textTransform:'uppercase', letterSpacing:'.06em' }}>— {q.author}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── ADMIN TAB ── */}
      {activeTab === 'admin' && (isAdmin||canManage) && (
        <div style={{ maxWidth:700 }}>
          <div style={{ fontSize:14, fontWeight:800, color:'var(--text)', marginBottom:4 }}>Agent Briefing Control</div>
          <div style={{ fontSize:13, color:'var(--muted)', marginBottom:18 }}>Toggle briefing email on/off per agent and control which sections they receive.</div>
          {allAgents.map(ag => {
            const ap = agentPrefs[ag.id]
            const enabled = ap?.enabled ?? true
            const sections = ap?.sections || {}
            async function toggleAgent(field, val) {
              const updated = { ...(agentPrefs[ag.id]||{}), [field]:val }
              setAgentPrefs(prev => ({ ...prev, [ag.id]:updated }))
              // Reliable: check existing then update or insert
              const { data: existPref } = await supabase.from('briefing_prefs').select('id').eq('agent_id', ag.id).maybeSingle()
              const pData = { agent_id:ag.id, enabled:field==='enabled'?val:(ap?.enabled??true), sections:field==='sections'?val:(ap?.sections||{}), updated_at:new Date().toISOString() }
              if (existPref?.id) { await supabase.from('briefing_prefs').update(pData).eq('id', existPref.id) }
              else { await supabase.from('briefing_prefs').insert(pData) }
            }
            return (
              <div key={ag.id} style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', marginBottom:10, overflow:'hidden' }}>
                <div style={{ padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:36, height:36, borderRadius:'50%', background:ag.color||'#CC2200', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'#fff', flexShrink:0 }}>
                    {(ag.name||'').split(' ').map(n=>n[0]).join('').slice(0,2)}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{ag.name}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{ag.email}</div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:12, color:'var(--muted)' }}>{enabled?'Enabled':'Off'}</span>
                    <div onClick={() => toggleAgent('enabled', !enabled)}
                      style={{ width:40, height:22, borderRadius:11, background:enabled?'#10B981':'var(--dim)', border:'1px solid '+(enabled?'#10B981':'var(--border)'), position:'relative', cursor:'pointer', transition:'all .2s', flexShrink:0 }}>
                      <div style={{ position:'absolute', top:2, left:enabled?20:2, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,.2)' }} />
                    </div>
                  </div>
                </div>
                {enabled && (
                  <div style={{ padding:'8px 16px 12px', borderTop:'1px solid var(--border)', background:'var(--dim)' }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Sections</div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      {[['showTasks','Tasks'],['showCalendar','Calendar'],['showDeals','Deals'],['showClosings','Closings'],['showLeads','Leads'],['showListings','Listings'],['showOpenHouses','Open Houses'],['showQuote','Quote']].map(([k,l]) => {
                        const on = sections[k] !== false
                        return (
                          <button key={k} onClick={() => toggleAgent('sections', { ...sections, [k]:!on })}
                            style={{ padding:'4px 10px', borderRadius:20, border:'1px solid '+(on?'#CC2200':'var(--border)'), background:on?'rgba(204,34,0,.1)':'transparent', color:on?'#CC2200':'var(--muted)', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:ff }}>
                            {on?'✓ ':''}{l}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AppSection({ title, icon, color, children }) {
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8, paddingBottom:6, borderBottom:'2px solid var(--border)' }}>
        <span>{icon}</span>
        <span style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em' }}>{title}</span>
      </div>
      {children}
    </div>
  )
}
function AppRow({ children }) {
  return <div style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 0', borderBottom:'1px solid var(--border)' }}>{children}</div>
}
function AppEmpty({ children }) {
  return <div style={{ fontSize:12, color:'var(--muted)', padding:'8px 0', fontStyle:'italic' }}>{children}</div>
}
