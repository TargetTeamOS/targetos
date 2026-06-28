// TargetOS V2 — Daily Briefing
// Full system: per-agent email prefs, custom quotes, KW quotes,
// admin controls for who gets what, real email via Resend.
import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp }  from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { fmt$, fmtDate, isDueToday, isOverdue, getDaysUntil } from '../lib/utils'
import { Btn, Loading, Avatar } from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// ── KW / GARY KELLER QUOTES ──────────────────────────────────────
const KW_QUOTES = [
  { text: 'Your job is not to be a great salesperson. Your job is to be a great human being who happens to sell real estate.', author: 'Gary Keller' },
  { text: 'Success is actually a short race — a sprint fueled by discipline just long enough for habit to kick in and take over.', author: 'Gary Keller' },
  { text: 'The ONE Thing. What is the one thing I can do such that by doing it everything else will be easier or unnecessary?', author: 'Gary Keller' },
  { text: 'Your level of success will seldom exceed your level of personal development.', author: 'Gary Keller' },
  { text: 'In matters of style, swim with the current; in matters of principle, stand like a rock.', author: 'Gary Keller' },
  { text: 'Don\'t mistake movement for achievement. It\'s easy to be busy doing nothing.', author: 'Gary Keller' },
  { text: 'Multitasking is a lie. You can do two things at once, but you can\'t focus effectively on two things at once.', author: 'Gary Keller' },
  { text: 'Time on task, over time, eventually beats talent every time.', author: 'Gary Keller' },
  { text: 'A big life is just a small life with better habits.', author: 'Gary Keller' },
  { text: 'You need to be doing fewer things for more effect instead of doing more things with side effects.', author: 'Gary Keller' },
  { text: 'The challenge is not to manage time, but to manage ourselves.', author: 'Gary Keller' },
  { text: 'Work is a rubber ball. If you drop it, it will bounce back. But the four other balls — family, health, friends, and integrity — are made of glass.', author: 'Gary Keller' },
  { text: 'The people who achieve extraordinary results don\'t achieve them by working more hours. They achieve them by getting more done in the hours they work.', author: 'Gary Keller' },
  { text: 'Knowing when to persevere and when to quit is a critical business skill that must be mastered.', author: 'Gary Keller' },
  { text: 'Real estate agents who think marketing is an expense will always struggle. Agents who treat it as an investment will always win.', author: 'Gary Keller' },
  { text: 'Success is not about having the best plan. It\'s about executing consistently.', author: 'Keller Williams' },
  { text: 'Your network is your net worth. Build relationships before you need them.', author: 'Keller Williams' },
  { text: 'The best time to plant a tree was 20 years ago. The second best time is today. The same applies to building your database.', author: 'Keller Williams' },
  { text: 'Lead generation is the lifeblood of your business. Never stop prospecting.', author: 'Keller Williams' },
  { text: 'Each person on your team multiplies your ability to serve clients and grow your business.', author: 'Keller Williams' },
]

function getTodaysQuote(customQuotes) {
  const all = [...KW_QUOTES, ...(customQuotes || [])]
  const dayIndex = Math.floor(Date.now() / 86400000) % all.length
  return all[dayIndex] || KW_QUOTES[0]
}

// ── EMAIL HTML BUILDER ───────────────────────────────────────────
function buildEmailHTML(agentName, data, prefs, quote, customMessage) {
  const today = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric', timeZone:'America/New_York' })

  function section(title, icon, rows) {
    if (!rows || rows.length === 0) return ''
    return '<div style="margin-bottom:24px"><div style="font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.08em;border-bottom:2px solid #E2E8F0;padding-bottom:6px;margin-bottom:10px">' + icon + ' ' + title + '</div>' + rows.join('') + '</div>'
  }
  function row(left, right, highlight) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #F1F5F9"><div style="font-size:13px;color:' + (highlight ? '#DC2626' : '#1E293B') + ';font-weight:' + (highlight ? '700' : '400') + '">' + left + '</div><div style="font-size:12px;color:#64748B;text-align:right">' + right + '</div></div>'
  }

  const taskRows = (prefs.showTasks && data.todayTasks) ? data.todayTasks.map(t =>
    row((isOverdue(t.due_date) ? '⚠ ' : '• ') + t.title, isOverdue(t.due_date) ? '<span style="color:#DC2626;font-weight:700">OVERDUE</span>' : (t.due_date ? fmtDate(t.due_date) : ''), isOverdue(t.due_date))
  ) : []

  const calRows = (prefs.showCalendar && data.todayEvents) ? data.todayEvents.map(e =>
    row('📅 ' + e.title, (e.start_time || '') + (e.location ? ' · ' + e.location : ''), false)
  ) : []

  const dealRows = (prefs.showDeals && data.activeDeals) ? data.activeDeals.slice(0, 8).map(d =>
    row(d.addr, '<span style="color:#10B981;font-weight:700">' + fmt$(d.gci) + '</span> · ' + (d.stage || ''), false)
  ) : []

  const closingRows = (prefs.showClosings && data.upcomingClose) ? data.upcomingClose.map(d => {
    const days = getDaysUntil(d.expected_close_date || d.close_date)
    return row(d.addr, '<span style="color:' + (days <= 7 ? '#DC2626' : '#10B981') + ';font-weight:700">' + days + ' days · ' + fmt$(d.gci) + '</span>', days <= 7)
  }) : []

  const leadRows = (prefs.showLeads && data.hotLeads) ? data.hotLeads.slice(0, 8).map(c =>
    row(c.first_name + ' ' + (c.last_name || ''), '<span style="background:' + (c.status === 'Hot' ? '#FEE2E2' : '#FFF7ED') + ';color:' + (c.status === 'Hot' ? '#DC2626' : '#F97316') + ';padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700">' + c.status + '</span>', false)
  ) : []

  const listingRows = (prefs.showListings && data.listings) ? data.listings.map(l =>
    row(l.addr, '<span style="font-weight:700;color:#1B2B4B">' + fmt$(l.list_price) + '</span>', false)
  ) : []

  const ohRows = (prefs.showOpenHouses && data.openHouses) ? data.openHouses.map(oh =>
    row(oh.listing_addr || 'Open House', fmtDate(oh.date) + (oh.start_time ? ' · ' + oh.start_time : ''), false)
  ) : []

  const stats = [
    { label: 'Tasks Due', value: String(data.todayTasks?.length || 0), color: (data.overdueTasks?.length || 0) > 0 ? '#DC2626' : '#10B981' },
    { label: 'Active Deals', value: String(data.activeDeals?.length || 0), color: '#F5A623' },
    { label: 'Hot Leads', value: String(data.hotLeads?.length || 0), color: '#CC2200' },
    { label: 'YTD GCI', value: fmt$(data.closedGCI || 0), color: '#10B981' },
  ]

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Daily Briefing</title></head><body style="margin:0;padding:0;background:#F1F5F9;font-family:Inter,system-ui,sans-serif">' +
  '<div style="max-width:620px;margin:0 auto;padding:24px 16px">' +

  // Header
  '<div style="background:linear-gradient(135deg,#0F1A2E 0%,#1B2B4B 100%);border-radius:16px 16px 0 0;padding:28px 32px">' +
  '<div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">TargetOS Daily Briefing</div>' +
  '<div style="font-size:24px;font-weight:900;color:#fff;margin-bottom:4px">Good morning, ' + (agentName.split(' ')[0]) + ' 👋</div>' +
  '<div style="font-size:13px;color:rgba(255,255,255,.5)">' + today + '</div>' +
  '<div style="display:flex;gap:20px;margin-top:18px">' +
    stats.map(s => '<div><div style="font-size:22px;font-weight:900;color:' + s.color + '">' + s.value + '</div><div style="font-size:10px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.06em">' + s.label + '</div></div>').join('') +
  '</div></div>' +

  // Body
  '<div style="background:#fff;padding:28px 32px">' +

  // Custom message
  (customMessage ? '<div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#1E40AF;line-height:1.6">' + customMessage + '</div>' : '') +

  // Sections
  section('Today\'s Tasks & Overdue', '✅', taskRows) +
  section('Today\'s Calendar', '📅', calRows) +
  section('Active Deals', '💼', dealRows) +
  section('Upcoming Closings', '🎯', closingRows) +
  section('Hot & Warm Leads', '🔥', leadRows) +
  section('Active Listings', '🏡', listingRows) +
  section('Open Houses This Week', '🚪', ohRows) +

  // Quote
  (prefs.showQuote && quote ? '<div style="background:linear-gradient(135deg,#1B2B4B,#0F1A2E);border-radius:12px;padding:20px 24px;margin-top:8px"><div style="font-size:14px;font-style:italic;color:rgba(255,255,255,.9);line-height:1.7;margin-bottom:8px">"' + quote.text + '"</div><div style="font-size:11px;font-weight:700;color:#F5A623;text-transform:uppercase;letter-spacing:.06em">— ' + quote.author + '</div></div>' : '') +

  '</div>' +

  // Footer
  '<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 16px 16px;padding:14px 32px;display:flex;justify-content:space-between;align-items:center">' +
  '<div style="font-size:11px;color:#94A3B8">TargetOS · Target Team · KW Valley Realty</div>' +
  '<div style="font-size:11px;color:#94A3B8">845.424.1014</div>' +
  '</div>' +

  '</div></body></html>'
}

// ── DEFAULT PREFS ────────────────────────────────────────────────
const DEFAULT_PREFS = {
  showTasks: true, showCalendar: true, showDeals: true,
  showClosings: true, showLeads: true, showListings: true,
  showOpenHouses: true, showQuote: true,
  emailEnabled: true, emailTime: '07:00',
}

// ── MAIN COMPONENT ───────────────────────────────────────────────
export function DailyBriefing() {
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()

  const [activeTab,  setActiveTab]  = useState('preview')   // preview | settings | quotes | admin
  const [data,       setData]       = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [sending,    setSending]    = useState(false)
  const [sendingAll, setSendingAll] = useState(false)
  const [prefs,      setPrefs]      = useState(DEFAULT_PREFS)
  const [customMsg,  setCustomMsg]  = useState('')
  const [customQuotes, setCustomQuotes] = useState([])
  const [newQuote,   setNewQuote]   = useState({ text: '', author: '' })
  const [addingQuote,setAddingQuote]= useState(false)
  const [agentPrefs, setAgentPrefs] = useState({})  // agentId -> prefs (admin view)
  const [allAgents,  setAllAgents]  = useState([])
  const [savingPrefs,setSavingPrefs]= useState(false)
  const [previewFor, setPreviewFor] = useState(null) // agent to preview as (admin)

  const viewAgent = previewFor || agent

  // ── LOAD DATA ──────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!viewAgent) return
    setLoading(true)
    try {
      const today   = new Date().toISOString().slice(0, 10)
      const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7)
      const weekStr = weekEnd.toISOString().slice(0, 10)

      const isAdminView = isAdmin || canManage
      const agentFilter = !isAdminView || previewFor ? viewAgent.id : null

      let tasksQ = supabase.from('tasks').select('*').neq('status', 'done')
      let dealsQ = supabase.from('deals').select('*, agents(id,name,color)')
      let contactsQ = supabase.from('contacts').select('id,first_name,last_name,status,phone')
      let listingsQ = supabase.from('listings').select('*').eq('status', 'Active')
      let ohQ = supabase.from('open_houses').select('*').gte('date', today).lte('date', weekStr)
      let calQ = supabase.from('calendar_events').select('*').eq('date', today).order('start_time')

      if (agentFilter) {
        tasksQ     = tasksQ.eq('agent_id', agentFilter)
        dealsQ     = dealsQ.eq('agent_id', agentFilter)
        contactsQ  = contactsQ.eq('agent_id', agentFilter)
        listingsQ  = listingsQ.eq('agent_id', agentFilter)
        ohQ        = ohQ.eq('agent_id', agentFilter)
        calQ       = calQ.eq('agent_id', agentFilter)
      }

      const [tasks, deals, contacts, listings, openHouses, announcements, todayEvents] = await Promise.all([
        tasksQ.then(r => r.data || []),
        dealsQ.then(r => r.data || []),
        contactsQ.then(r => r.data || []),
        listingsQ.then(r => r.data || []),
        ohQ.then(r => r.data || []),
        supabase.from('announcements').select('*').order('pinned', { ascending: false }).limit(3).then(r => r.data || []),
        calQ.then(r => r.data || []),
      ])

      const todayTasks    = tasks.filter(t => isDueToday(t.due_date) || isOverdue(t.due_date))
      const overdueTasks  = tasks.filter(t => isOverdue(t.due_date))
      const activeDeals   = deals.filter(d => !['Closed','Deal Fell Through'].includes(d.stage))
      const upcomingClose = deals.filter(d => {
        const date = d.expected_close_date || d.close_date
        if (!date) return false
        const days = getDaysUntil(date)
        return days !== null && days >= 0 && days <= 30 && d.stage !== 'Closed'
      }).sort((a,b) => getDaysUntil(a.expected_close_date||a.close_date) - getDaysUntil(b.expected_close_date||b.close_date))
      const hotLeads      = contacts.filter(c => ['Hot','Warm'].includes(c.status))
      const closedGCI     = deals.filter(d => d.stage === 'Closed' && (d.ao_date||'').startsWith(String(new Date().getFullYear()))).reduce((s, d) => s + (parseFloat(d.gci)||0), 0)

      setData({ todayTasks, overdueTasks, activeDeals, upcomingClose, hotLeads, listings, openHouses, announcements, closedGCI, allTasks: tasks, todayEvents })
    } catch(e) {
      toast('Failed to load briefing: ' + e.message, '#DC2626')
    } finally { setLoading(false) }
  }, [viewAgent?.id])

  // ── LOAD PREFS ─────────────────────────────────────────────────
  const loadPrefs = useCallback(async () => {
    if (!agent) return
    try {
      // Load my prefs
      const { data: myPrefs } = await supabase.from('briefing_prefs').select('*').eq('agent_id', agent.id).maybeSingle()
      if (myPrefs) {
        const p = myPrefs.sections || {}
        setPrefs({ ...DEFAULT_PREFS, ...p, emailEnabled: myPrefs.enabled ?? true, emailTime: myPrefs.send_time || '07:00' })
        setCustomMsg(myPrefs.custom_message || '')
      }

      // Load custom quotes
      const { data: quotes } = await supabase.from('briefing_quotes').select('*').order('created_at', { ascending: false })
      setCustomQuotes(quotes || [])

      // If admin, load all agents + their prefs
      if (isAdmin || canManage) {
        const [agentsRes, allPrefsRes] = await Promise.all([
          supabase.from('agents').select('*').eq('active', true).order('name'),
          supabase.from('briefing_prefs').select('*'),
        ])
        setAllAgents(agentsRes.data || [])
        const prefsMap = {}
        ;(allPrefsRes.data || []).forEach(p => { prefsMap[p.agent_id] = p })
        setAgentPrefs(prefsMap)
      }
    } catch(e) { console.warn('prefs load:', e.message) }
  }, [agent?.id])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadPrefs() }, [loadPrefs])

  // ── SAVE MY PREFS ──────────────────────────────────────────────
  async function saveMyPrefs() {
    if (!agent) return
    setSavingPrefs(true)
    try {
      const { emailEnabled, emailTime, ...sections } = prefs
      await supabase.from('briefing_prefs').upsert({
        agent_id:       agent.id,
        enabled:        emailEnabled,
        send_time:      emailTime,
        sections:       sections,
        custom_message: customMsg,
        updated_at:     new Date().toISOString(),
      }, { onConflict: 'agent_id' })
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
      const html  = buildEmailHTML(agent.name, data, prefs, quote, customMsg)
      const res   = await fetch('/api/send-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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

  // ── SEND ALL AGENTS (admin) ────────────────────────────────────
  async function sendAllBriefings() {
    if (!isAdmin && !canManage) return
    setSendingAll(true)
    let sent = 0, failed = 0
    try {
      for (const ag of allAgents) {
        const agPref = agentPrefs[ag.id]
        if (!agPref?.enabled && agPref !== undefined) continue  // skip if explicitly disabled

        // Load this agent's data
        try {
          const today  = new Date().toISOString().slice(0, 10)
          const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7)
          const [tasks, deals, contacts, listings, openHouses, calEvents] = await Promise.all([
            supabase.from('tasks').select('*').eq('agent_id', ag.id).neq('status','done').then(r=>r.data||[]),
            supabase.from('deals').select('*').eq('agent_id', ag.id).then(r=>r.data||[]),
            supabase.from('contacts').select('id,first_name,last_name,status').eq('agent_id', ag.id).then(r=>r.data||[]),
            supabase.from('listings').select('*').eq('agent_id', ag.id).eq('status','Active').then(r=>r.data||[]),
            supabase.from('open_houses').select('*').eq('agent_id', ag.id).gte('date',today).lte('date',weekEnd.toISOString().slice(0,10)).then(r=>r.data||[]),
            supabase.from('calendar_events').select('*').eq('agent_id', ag.id).eq('date', today).then(r=>r.data||[]),
          ])

          const agData = {
            todayTasks:   tasks.filter(t => isDueToday(t.due_date) || isOverdue(t.due_date)),
            overdueTasks: tasks.filter(t => isOverdue(t.due_date)),
            activeDeals:  deals.filter(d => !['Closed','Deal Fell Through'].includes(d.stage)),
            upcomingClose: deals.filter(d => { const dt=d.expected_close_date||d.close_date; if(!dt) return false; const dy=getDaysUntil(dt); return dy!==null&&dy>=0&&dy<=30&&d.stage!=='Closed' }),
            hotLeads:     contacts.filter(c => ['Hot','Warm'].includes(c.status)),
            listings, openHouses, todayEvents: calEvents,
            closedGCI: deals.filter(d=>d.stage==='Closed'&&(d.ao_date||'').startsWith(String(new Date().getFullYear()))).reduce((s,d)=>s+(parseFloat(d.gci)||0),0),
          }

          const agPrefs = agPref?.sections ? { ...DEFAULT_PREFS, ...agPref.sections } : DEFAULT_PREFS
          const quote   = getTodaysQuote(customQuotes)
          const html    = buildEmailHTML(ag.name, agData, agPrefs, quote, agPref?.custom_message || '')

          const res = await fetch('/api/send-email', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from:    'TargetOS Briefing <briefing@targetreteam.com>',
              to:      [ag.email],
              subject: '☀️ Daily Briefing — ' + new Date().toLocaleDateString('en-US', { weekday:'long', month:'short', day:'numeric', timeZone:'America/New_York' }),
              html,
            }),
          })
          if (res.ok) sent++
          else failed++
        } catch(e) { failed++ }
      }
      toast('✅ Sent ' + sent + ' briefings' + (failed ? ' · ' + failed + ' failed' : ''))
    } catch(e) { toast('Error: ' + e.message, '#DC2626') }
    finally { setSendingAll(false) }
  }

  // ── ADD CUSTOM QUOTE ───────────────────────────────────────────
  async function addQuote() {
    if (!newQuote.text.trim()) { toast('Quote text is required', '#F5A623'); return }
    setAddingQuote(true)
    try {
      const { data: q } = await supabase.from('briefing_quotes').insert({
        text: newQuote.text.trim(),
        author: newQuote.author.trim() || 'Unknown',
        added_by: agent?.id,
        created_at: new Date().toISOString(),
      }).select().single()
      setCustomQuotes(prev => [q, ...prev])
      setNewQuote({ text: '', author: '' })
      toast('✅ Quote added')
    } catch(e) { toast('Add failed — run the SQL below first', '#DC2626') }
    finally { setAddingQuote(false) }
  }

  async function deleteQuote(id) {
    await supabase.from('briefing_quotes').delete().eq('id', id)
    setCustomQuotes(prev => prev.filter(q => q.id !== id))
    toast('Quote deleted')
  }

  const quote   = getTodaysQuote(customQuotes)
  const today   = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric', timeZone:'America/New_York' })
  const TABS    = [
    { id:'preview',  label:'📋 Briefing' },
    { id:'settings', label:'⚙️ My Settings' },
    { id:'quotes',   label:'💬 Quotes' },
    ...(isAdmin || canManage ? [{ id:'admin', label:'👥 All Agents' }] : []),
  ]

  // Section toggle helper
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
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:900, color:'var(--text)' }}>☀️ Daily Briefing</div>
          <div style={{ fontSize:13, color:'var(--muted)', marginTop:2 }}>{today}</div>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={load} style={{ padding:'8px 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:ff }}>↻ Refresh</button>
          {(isAdmin || canManage) && (
            <button onClick={sendAllBriefings} disabled={sendingAll}
              style={{ padding:'8px 16px', borderRadius:8, border:'none', background:'#1B2B4B', color:'#fff', fontSize:13, fontWeight:700, cursor:sendingAll?'default':'pointer', fontFamily:ff, opacity:sendingAll?.7:1 }}>
              {sendingAll ? '⏳ Sending...' : '📨 Send All Briefings'}
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
                borderBottom: active?'2px solid #CC2200':'2px solid transparent', marginBottom:'-2px',
                fontSize:13, fontWeight:active?700:500, color:active?'#CC2200':'var(--muted)', fontFamily:ff, whiteSpace:'nowrap' }}>
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ── PREVIEW TAB ── */}
      {activeTab === 'preview' && (
        <div style={{ maxWidth:680 }}>
          {/* Preview agent selector (admin) */}
          {(isAdmin || canManage) && allAgents.length > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, padding:'10px 14px', background:'var(--dim)', borderRadius:10, border:'1px solid var(--border)' }}>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--muted)' }}>Preview as:</span>
              <select value={previewFor?.id || ''} onChange={e => {
                const ag = allAgents.find(a => a.id === e.target.value)
                setPreviewFor(ag || null)
              }} style={{ padding:'5px 10px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }}>
                <option value="">My own briefing</option>
                {allAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              {previewFor && <button onClick={() => { setPreviewFor(null) }} style={{ fontSize:11, color:'var(--muted)', background:'none', border:'none', cursor:'pointer', fontFamily:ff }}>← Back to mine</button>}
            </div>
          )}

          {loading ? <Loading /> : !data ? null : (
            <div style={{ background:'var(--panel)', borderRadius:16, border:'1px solid var(--border)', overflow:'hidden', boxShadow:'0 4px 24px rgba(0,0,0,.08)' }}>

              {/* Email header */}
              <div style={{ background:'linear-gradient(135deg,#0F1A2E 0%,#1B2B4B 100%)', padding:'26px 30px' }}>
                <div style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,.35)', textTransform:'uppercase', letterSpacing:'.12em', marginBottom:6 }}>TargetOS Daily Briefing</div>
                <div style={{ fontSize:22, fontWeight:900, color:'#fff', marginBottom:3 }}>Good morning, {(viewAgent?.name||'').split(' ')[0]} 👋</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,.4)' }}>{today}</div>
                <div style={{ display:'flex', gap:24, marginTop:18, flexWrap:'wrap' }}>
                  {[
                    { label:'Tasks Due',    value: data.todayTasks?.length || 0,  color: (data.overdueTasks?.length||0) > 0 ? '#DC2626' : '#10B981' },
                    { label:'Active Deals', value: data.activeDeals?.length || 0, color:'#F5A623' },
                    { label:'Hot Leads',    value: data.hotLeads?.length || 0,    color:'#CC2200' },
                    { label:'YTD GCI',      value: fmt$(data.closedGCI || 0),       color:'#10B981' },
                  ].map(s => (
                    <div key={s.label}>
                      <div style={{ fontSize:20, fontWeight:800, color:s.color }}>{s.value}</div>
                      <div style={{ fontSize:10, color:'rgba(255,255,255,.35)', textTransform:'uppercase', letterSpacing:'.06em' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ padding:'22px 30px' }}>
                {customMsg && (
                  <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:10, padding:'12px 16px', marginBottom:20, fontSize:13, color:'#1E40AF', lineHeight:1.6 }}>
                    {customMsg}
                  </div>
                )}

                {/* Tasks */}
                {prefs.showTasks && <BriefSection title="Today's Tasks & Overdue" icon="✅" warn={(data.overdueTasks?.length||0)>0}>
                  {data.todayTasks?.length === 0 && <BriefEmpty text="Nothing due today — you're all caught up! 🎉" />}
                  {data.todayTasks?.map(t => (
                    <BriefRow key={t.id}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:isOverdue(t.due_date)?'#DC2626':'#F97316', flexShrink:0, marginTop:2 }} />
                      <div style={{ flex:1, fontSize:13, color:'var(--text)', fontWeight:isOverdue(t.due_date)?700:400 }}>{t.title}</div>
                      {isOverdue(t.due_date) && <span style={{ fontSize:10, padding:'2px 7px', borderRadius:10, background:'#FEE2E2', color:'#DC2626', fontWeight:700 }}>OVERDUE</span>}
                      {!isOverdue(t.due_date) && t.due_date && <span style={{ fontSize:11, color:'var(--muted)' }}>{fmtDate(t.due_date)}</span>}
                    </BriefRow>
                  ))}
                </BriefSection>}

                {/* Today's Calendar */}
                {prefs.showCalendar && data.todayEvents?.length > 0 && <BriefSection title="Today's Calendar" icon="📅">
                  {data.todayEvents.map(e => (
                    <BriefRow key={e.id}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{e.title}</div>
                        {e.location && <div style={{ fontSize:11, color:'var(--muted)' }}>📍 {e.location}</div>}
                      </div>
                      <div style={{ fontSize:12, color:'var(--muted)', flexShrink:0 }}>{e.start_time || ''}</div>
                    </BriefRow>
                  ))}
                </BriefSection>}

                {/* Active Deals */}
                {prefs.showDeals && <BriefSection title="Active Deals" icon="💼">
                  {data.activeDeals?.length === 0 && <BriefEmpty text="No active deals." />}
                  {data.activeDeals?.slice(0,8).map(d => (
                    <BriefRow key={d.id}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{d.addr}</div>
                        {d.client_legal_name && <div style={{ fontSize:11, color:'var(--muted)' }}>{d.client_legal_name}</div>}
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:12, fontWeight:700, color:'#10B981' }}>{fmt$(d.gci)}</div>
                        <div style={{ fontSize:10, color:'var(--muted)' }}>{d.stage}</div>
                      </div>
                    </BriefRow>
                  ))}
                </BriefSection>}

                {/* Upcoming Closings */}
                {prefs.showClosings && <BriefSection title="Upcoming Closings (30 days)" icon="🎯">
                  {data.upcomingClose?.length === 0 && <BriefEmpty text="No closings in the next 30 days." />}
                  {data.upcomingClose?.map(d => {
                    const days = getDaysUntil(d.expected_close_date || d.close_date)
                    return (
                      <BriefRow key={d.id}>
                        <div style={{ flex:1, fontSize:13, fontWeight:days<=7?700:400, color:days<=7?'#DC2626':'var(--text)' }}>{d.addr}</div>
                        <div style={{ textAlign:'right' }}>
                          <div style={{ fontSize:12, fontWeight:700, color:days<=7?'#DC2626':'#10B981' }}>{fmt$(d.gci)}</div>
                          <div style={{ fontSize:11, color:'var(--muted)' }}>{days}d · {fmtDate(d.expected_close_date||d.close_date)}</div>
                        </div>
                      </BriefRow>
                    )
                  })}
                </BriefSection>}

                {/* Hot Leads */}
                {prefs.showLeads && <BriefSection title="Hot & Warm Leads" icon="🔥">
                  {data.hotLeads?.length === 0 && <BriefEmpty text="No hot or warm leads right now." />}
                  {data.hotLeads?.slice(0,8).map(c => (
                    <BriefRow key={c.id}>
                      <div style={{ flex:1, fontSize:13, color:'var(--text)' }}>{c.first_name} {c.last_name}</div>
                      <span style={{ fontSize:11, padding:'2px 8px', borderRadius:10, background:c.status==='Hot'?'#FEE2E2':'#FFF7ED', color:c.status==='Hot'?'#DC2626':'#F97316', fontWeight:700 }}>{c.status}</span>
                    </BriefRow>
                  ))}
                </BriefSection>}

                {/* Listings */}
                {prefs.showListings && <BriefSection title="Active Listings" icon="🏡">
                  {data.listings?.length === 0 && <BriefEmpty text="No active listings." />}
                  {data.listings?.map(l => (
                    <BriefRow key={l.id}>
                      <div style={{ flex:1, fontSize:13, color:'var(--text)' }}>{l.addr}</div>
                      <div style={{ fontSize:13, fontWeight:700, color:'#1B2B4B' }}>{fmt$(l.list_price)}</div>
                    </BriefRow>
                  ))}
                </BriefSection>}

                {/* Open Houses */}
                {prefs.showOpenHouses && <BriefSection title="Open Houses This Week" icon="🚪">
                  {data.openHouses?.length === 0 && <BriefEmpty text="No open houses this week." />}
                  {data.openHouses?.map(oh => (
                    <BriefRow key={oh.id}>
                      <div style={{ flex:1, fontSize:13, color:'var(--text)' }}>{oh.listing_addr || 'Open House'}</div>
                      <div style={{ fontSize:12, color:'var(--muted)' }}>{fmtDate(oh.date)} {oh.start_time && '· ' + oh.start_time}</div>
                    </BriefRow>
                  ))}
                </BriefSection>}

                {/* Quote */}
                {prefs.showQuote && (
                  <div style={{ background:'linear-gradient(135deg,#1B2B4B,#0F1A2E)', borderRadius:12, padding:'18px 22px', marginTop:8 }}>
                    <div style={{ fontSize:14, fontStyle:'italic', color:'rgba(255,255,255,.9)', lineHeight:1.7, marginBottom:8 }}>
                      "{quote.text}"
                    </div>
                    <div style={{ fontSize:11, fontWeight:700, color:'#F5A623', textTransform:'uppercase', letterSpacing:'.06em' }}>
                      — {quote.author}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ padding:'13px 30px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--dim)' }}>
                <div style={{ fontSize:11, color:'var(--muted)' }}>TargetOS · KW Valley Realty · Target Team</div>
                <button onClick={sendMyEmail} disabled={sending}
                  style={{ padding:'7px 16px', borderRadius:8, border:'none', background:'#CC2200', color:'#fff', fontSize:12, fontWeight:700, cursor:sending?'default':'pointer', fontFamily:ff }}>
                  {sending ? 'Sending...' : '📧 Send to ' + (viewAgent?.email || 'me')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SETTINGS TAB ── */}
      {activeTab === 'settings' && (
        <div style={{ maxWidth:520 }}>
          <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:20, marginBottom:16 }}>
            <div style={{ fontSize:14, fontWeight:800, color:'var(--text)', marginBottom:16 }}>📧 Email Delivery</div>
            <ToggleRow k="emailEnabled" label="Receive daily briefing email" />
            <div style={{ marginTop:12 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>Preferred send time (ET)</div>
              <input type="time" value={prefs.emailTime || '07:00'} onChange={e => setPrefs(p => ({ ...p, emailTime: e.target.value }))}
                style={{ padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }} />
            </div>
          </div>

          <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:20, marginBottom:16 }}>
            <div style={{ fontSize:14, fontWeight:800, color:'var(--text)', marginBottom:4 }}>📋 Sections to Include</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:14 }}>Toggle which sections appear in your briefing email.</div>
            <ToggleRow k="showTasks"      label="✅ Today's Tasks & Overdue" />
            <ToggleRow k="showCalendar"   label="📅 Today's Calendar Events" />
            <ToggleRow k="showDeals"      label="💼 Active Deals" />
            <ToggleRow k="showClosings"   label="🎯 Upcoming Closings (30 days)" />
            <ToggleRow k="showLeads"      label="🔥 Hot & Warm Leads" />
            <ToggleRow k="showListings"   label="🏡 Active Listings" />
            <ToggleRow k="showOpenHouses" label="🚪 Open Houses This Week" />
            <ToggleRow k="showQuote"      label="💬 Daily Motivational Quote" />
          </div>

          <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:20, marginBottom:20 }}>
            <div style={{ fontSize:14, fontWeight:800, color:'var(--text)', marginBottom:4 }}>✍️ Custom Message</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:10 }}>This message appears at the top of your briefing every day. Great for team goals or reminders.</div>
            <textarea value={customMsg} onChange={e => setCustomMsg(e.target.value)} rows={3}
              placeholder="e.g. Team goal: 20 deals this month. We're at 14 — let's close strong this week!"
              style={{ width:'100%', padding:'9px 11px', borderRadius:9, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, resize:'vertical', boxSizing:'border-box' }} />
          </div>

          <button onClick={saveMyPrefs} disabled={savingPrefs}
            style={{ width:'100%', padding:12, borderRadius:10, border:'none', background:'#CC2200', color:'#fff', fontSize:14, fontWeight:800, cursor:savingPrefs?'default':'pointer', fontFamily:ff }}>
            {savingPrefs ? 'Saving...' : '💾 Save My Preferences'}
          </button>

          <div style={{ marginTop:14, padding:'12px 14px', background:'var(--dim)', borderRadius:8, border:'1px solid var(--border)', fontSize:11, color:'var(--muted)', lineHeight:1.6 }}>
            <strong style={{ color:'var(--text)' }}>Note:</strong> Automatic scheduling requires a Supabase scheduled function or cron job calling <code>/api/send-briefings</code>. For now, use the "Send All Briefings" button or "Email Me" manually.
          </div>
        </div>
      )}

      {/* ── QUOTES TAB ── */}
      {activeTab === 'quotes' && (
        <div style={{ maxWidth:640 }}>
          {/* Today's quote */}
          <div style={{ background:'linear-gradient(135deg,#1B2B4B,#0F1A2E)', borderRadius:14, padding:'20px 24px', marginBottom:20 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,.4)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 }}>Today's Quote</div>
            <div style={{ fontSize:15, fontStyle:'italic', color:'rgba(255,255,255,.9)', lineHeight:1.7, marginBottom:10 }}>"{quote.text}"</div>
            <div style={{ fontSize:11, fontWeight:700, color:'#F5A623', textTransform:'uppercase', letterSpacing:'.06em' }}>— {quote.author}</div>
          </div>

          {/* Add custom quote */}
          <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:18, marginBottom:20 }}>
            <div style={{ fontSize:14, fontWeight:800, color:'var(--text)', marginBottom:12 }}>+ Add Your Own Quote</div>
            <textarea value={newQuote.text} onChange={e => setNewQuote(q => ({ ...q, text: e.target.value }))} rows={2}
              placeholder="Enter quote text..."
              style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, resize:'vertical', boxSizing:'border-box', marginBottom:8 }} />
            <input value={newQuote.author} onChange={e => setNewQuote(q => ({ ...q, author: e.target.value }))}
              placeholder="Author (e.g. Tony Robbins)"
              style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, boxSizing:'border-box', marginBottom:12 }} />
            <button onClick={addQuote} disabled={addingQuote}
              style={{ padding:'8px 18px', borderRadius:8, border:'none', background:'#CC2200', color:'#fff', fontSize:13, fontWeight:700, cursor:addingQuote?'default':'pointer', fontFamily:ff }}>
              {addingQuote ? 'Adding...' : '+ Add Quote'}
            </button>
            <div style={{ marginTop:10, padding:'9px 12px', background:'var(--dim)', borderRadius:7, border:'1px solid var(--border)', fontSize:11, color:'var(--muted)' }}>
              Run this SQL in Supabase first if the quotes table doesn't exist:<br/>
              <code style={{ fontFamily:'monospace', color:'#CC2200' }}>create table briefing_quotes (id uuid default gen_random_uuid() primary key, text text, author text, added_by uuid references agents(id), created_at timestamptz default now()); create policy "Allow all" on briefing_quotes for all using (true); alter table briefing_quotes enable row level security;</code>
            </div>
          </div>

          {/* KW built-in quotes */}
          <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:10 }}>Built-in KW / Gary Keller Quotes ({KW_QUOTES.length})</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
            {KW_QUOTES.map((q, i) => (
              <div key={i} style={{ padding:'10px 14px', background:'var(--panel)', borderRadius:10, border:'1px solid var(--border)' }}>
                <div style={{ fontSize:12, color:'var(--text)', lineHeight:1.55, fontStyle:'italic', marginBottom:4 }}>"{q.text}"</div>
                <div style={{ fontSize:10, fontWeight:700, color:'#F5A623', textTransform:'uppercase', letterSpacing:'.06em' }}>— {q.author}</div>
              </div>
            ))}
          </div>

          {/* Custom quotes */}
          {customQuotes.length > 0 && (
            <>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:10 }}>Your Custom Quotes ({customQuotes.length})</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {customQuotes.map(q => (
                  <div key={q.id} style={{ padding:'10px 14px', background:'var(--panel)', borderRadius:10, border:'1px solid var(--border)', display:'flex', gap:12, alignItems:'flex-start' }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, color:'var(--text)', lineHeight:1.55, fontStyle:'italic', marginBottom:4 }}>"{q.text}"</div>
                      <div style={{ fontSize:10, fontWeight:700, color:'#F5A623', textTransform:'uppercase', letterSpacing:'.06em' }}>— {q.author}</div>
                    </div>
                    <button onClick={() => deleteQuote(q.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#DC2626', fontSize:18, padding:4, flexShrink:0 }}>×</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ADMIN TAB ── */}
      {activeTab === 'admin' && (isAdmin || canManage) && (
        <div style={{ maxWidth:700 }}>
          <div style={{ fontSize:14, fontWeight:800, color:'var(--text)', marginBottom:4 }}>Agent Briefing Control</div>
          <div style={{ fontSize:13, color:'var(--muted)', marginBottom:20 }}>Control who receives a daily briefing email and what sections they see. Each agent can also manage their own preferences.</div>

          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {allAgents.map(ag => {
              const ap = agentPrefs[ag.id]
              const enabled = ap?.enabled ?? true
              const sections = ap?.sections || {}

              async function toggleAgent(field, val) {
                const updated = { ...(agentPrefs[ag.id] || {}), [field]: val }
                setAgentPrefs(prev => ({ ...prev, [ag.id]: updated }))
                await supabase.from('briefing_prefs').upsert({
                  agent_id:   ag.id,
                  enabled:    field === 'enabled' ? val : (ap?.enabled ?? true),
                  sections:   field === 'sections' ? val : (ap?.sections || {}),
                  updated_at: new Date().toISOString(),
                }, { onConflict: 'agent_id' })
              }

              return (
                <div key={ag.id} style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', overflow:'hidden' }}>
                  {/* Agent header */}
                  <div style={{ padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ width:36, height:36, borderRadius:'50%', background:ag.color||'#CC2200', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'#fff', flexShrink:0 }}>
                      {(ag.name||'').split(' ').map(n=>n[0]).join('').slice(0,2)}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{ag.name}</div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>{ag.email} · {ag.role}</div>
                    </div>
                    {/* Master on/off toggle */}
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:12, color:'var(--muted)' }}>{enabled ? '✅ Enabled' : '❌ Off'}</span>
                      <div onClick={() => toggleAgent('enabled', !enabled)}
                        style={{ width:40, height:22, borderRadius:11, background:enabled?'#10B981':'var(--dim)', border:'1px solid '+(enabled?'#10B981':'var(--border)'), position:'relative', cursor:'pointer', transition:'all .2s', flexShrink:0 }}>
                        <div style={{ position:'absolute', top:2, left:enabled?20:2, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,.2)' }} />
                      </div>
                    </div>
                  </div>

                  {/* Sections grid */}
                  {enabled && (
                    <div style={{ padding:'8px 16px 14px', borderTop:'1px solid var(--border)', background:'var(--dim)' }}>
                      <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Sections</div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                        {[
                          { k:'showTasks',      l:'Tasks' },
                          { k:'showCalendar',   l:'Calendar' },
                          { k:'showDeals',      l:'Deals' },
                          { k:'showClosings',   l:'Closings' },
                          { k:'showLeads',      l:'Leads' },
                          { k:'showListings',   l:'Listings' },
                          { k:'showOpenHouses', l:'Open Houses' },
                          { k:'showQuote',      l:'Quote' },
                        ].map(({ k, l }) => {
                          const on = sections[k] !== false  // default true
                          return (
                            <button key={k} onClick={() => toggleAgent('sections', { ...sections, [k]: !on })}
                              style={{ padding:'4px 10px', borderRadius:20, border:'1px solid '+(on?'#CC2200':'var(--border)'), background:on?'rgba(204,34,0,.1)':'transparent', color:on?'#CC2200':'var(--muted)', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:ff }}>
                              {on ? '✓ ' : ''}{l}
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

          <div style={{ marginTop:20, padding:'12px 16px', background:'var(--dim)', borderRadius:10, border:'1px solid var(--border)', fontSize:12, color:'var(--muted)', lineHeight:1.6 }}>
            Changes to agent settings save instantly. Use the <strong style={{ color:'var(--text)' }}>Send All Briefings</strong> button at the top to send to all enabled agents right now.
          </div>
        </div>
      )}
    </div>
  )
}

function BriefSection({ title, icon, warn, children }) {
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8, paddingBottom:6, borderBottom:'2px solid var(--border)' }}>
        <span>{icon}</span>
        <span style={{ fontSize:11, fontWeight:700, color:warn?'#DC2626':'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em' }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

function BriefRow({ children }) {
  return <div style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 0', borderBottom:'1px solid var(--border)' }}>{children}</div>
}

function BriefEmpty({ text }) {
  return <div style={{ fontSize:12, color:'var(--muted)', padding:'8px 0', fontStyle:'italic' }}>{text}</div>
}
