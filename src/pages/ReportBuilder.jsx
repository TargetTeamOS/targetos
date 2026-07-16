// ═══════════════════════════════════════════════════════════════
// Report Builder (admin) — define custom report emails: pick metric
// blocks, date range, per-agent filters, schedule (daily or weekly on
// a weekday+hour), recipients. Live preview (matches the sent email,
// including deep links back into the CRM). Save + send-now.
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { authFetch } from '../lib/apiAuth'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { Btn } from '../components/UI'
import { computeReport, renderReportHtml } from '../lib/reportEngine'

const BLOCK_OPTIONS = [
  { id: 'calls',     label: '📞 Calls' },
  { id: 'deals',     label: '💼 Deals / GCI' },
  { id: 'tasks',     label: '✅ Tasks (done + overdue, linked)' },
  { id: 'contacts',  label: '🧑 New contacts (linked)' },
  { id: 'listings',  label: '🏡 Listings (linked)' },
  { id: 'offers',    label: '📝 Offers' },
  { id: 'open_house', label: '🚪 Open house visitors (linked)' },
  { id: 'signs',     label: '🪧 Sign inventory status' },
  { id: 'conversion', label: '📈 Conversion rates' },
  { id: 'per_agent', label: '👥 Per-agent activity table' },
]
const RANGES = [
  { id: 'today', label: 'Today' },
  { id: 'week_to_date', label: 'This week so far' },
  { id: 'this_week', label: 'This week' },
  { id: 'last_7_days', label: 'Last 7 days' },
  { id: 'this_month', label: 'This month' },
]
const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const inp = { width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', fontSize:13, background:'var(--bg)', color:'var(--text)', boxSizing:'border-box' }
const lb = { fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', display:'block', margin:'12px 0 4px' }

const NEW_REPORT = () => ({
  name:'Weekly Team Report', blocks:['calls','deals','tasks','per_agent'],
  range:'week_to_date', filters:{ agent_ids:[] },
  schedule:{ type:'weekly', weekday:5, hour:17 }, recipients:[], enabled:true,
})

export function ReportBuilder() {
  const { agent, isAdmin } = useAuth()
  const { toast } = useApp()
  const [list, setList]   = useState([])
  const [def, setDef]     = useState(NEW_REPORT())
  const [agents, setAgents] = useState([])
  const [preview, setPreview] = useState('')
  const [busy, setBusy]   = useState(false)
  const [recipientInput, setRecipientInput] = useState('')

  async function loadAll() {
    const { data } = await supabase.from('report_definitions').select('*').order('created_at', { ascending:false })
    setList(data || [])
  }
  useEffect(() => { loadAll(); supabase.from('agents').select('id,name').eq('active',true).then(({data})=>setAgents(data||[])) }, [])

  // live preview
  useEffect(() => {
    let cancel = false
    ;(async () => {
      try { const data = await computeReport(supabase, def); if (!cancel) setPreview(renderReportHtml(def, data)) }
      catch { if (!cancel) setPreview('<p style="color:#94A3B8;padding:20px">Preview unavailable</p>') }
    })()
    return () => { cancel = true }
  }, [JSON.stringify(def)])

  if (!isAdmin) return <div style={{ padding:20, color:'var(--muted)' }}>Report Builder is available to admins.</div>

  const toggleBlock = id => setDef(d => ({ ...d, blocks: d.blocks.includes(id) ? d.blocks.filter(b=>b!==id) : [...d.blocks, id] }))
  const toggleAgent = id => setDef(d => {
    const cur = d.filters?.agent_ids || []
    return { ...d, filters: { ...d.filters, agent_ids: cur.includes(id) ? cur.filter(a=>a!==id) : [...cur, id] } }
  })
  const addRecipient = () => {
    const e = recipientInput.trim()
    if (e && !def.recipients.includes(e)) setDef(d => ({ ...d, recipients:[...d.recipients, e] }))
    setRecipientInput('')
  }

  async function save() {
    setBusy(true)
    try {
      const payload = { ...def, created_by: agent?.id || null }
      if (def.id) { const { error } = await supabase.from('report_definitions').update(payload).eq('id', def.id); if (error) throw error }
      else { const { data, error } = await supabase.from('report_definitions').insert(payload).select().single(); if (error) throw error; setDef(data) }
      toast('Report saved'); loadAll()
    } catch (e) { toast('Save failed: ' + e.message, '#DC2626') } finally { setBusy(false) }
  }
  async function sendNow() {
    if (!def.recipients.length) { toast('Add at least one recipient', '#DC2626'); return }
    setBusy(true)
    try {
      const r = await authFetch('/api/report-send-now', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ def, recipients: def.recipients }) })
      const j = await r.json(); if (!r.ok) throw new Error(j.error||'failed')
      toast('📨 Report sent to ' + j.sent)
    } catch (e) { toast('Send failed: ' + e.message, '#DC2626') } finally { setBusy(false) }
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, alignItems:'start' }}>
      <div>
        <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
          <Btn variant="secondary" onClick={()=>setDef(NEW_REPORT())}>+ New report</Btn>
          <select style={{ ...inp, width:'auto', flex:1 }} value={def.id||''} onChange={e => { const r = list.find(x=>x.id===e.target.value); if (r) setDef(r) }}>
            <option value="">— Saved reports —</option>
            {list.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>

        <span style={lb}>Report name</span>
        <input style={inp} value={def.name} onChange={e=>setDef(d=>({...d,name:e.target.value}))} />

        <span style={lb}>Include</span>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
          {BLOCK_OPTIONS.map(b => (
            <label key={b.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, cursor:'pointer', background: def.blocks.includes(b.id)?'rgba(204,34,0,.06)':'transparent' }}>
              <input type="checkbox" checked={def.blocks.includes(b.id)} onChange={()=>toggleBlock(b.id)} />
              {b.label}
            </label>
          ))}
        </div>

        <span style={lb}>Time range</span>
        <select style={inp} value={def.range} onChange={e=>setDef(d=>({...d,range:e.target.value}))}>
          {RANGES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>

        <span style={lb}>Filter to agents (none = whole team)</span>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
          {agents.map(a => (
            <span key={a.id} onClick={()=>toggleAgent(a.id)}
              style={{ padding:'5px 12px', borderRadius:99, fontSize:12, cursor:'pointer', border:'1px solid var(--border)',
                background:(def.filters?.agent_ids||[]).includes(a.id)?'var(--brand)':'var(--dim)',
                color:(def.filters?.agent_ids||[]).includes(a.id)?'#fff':'var(--text)' }}>
              {a.name}
            </span>
          ))}
        </div>

        <span style={lb}>Schedule</span>
        <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
          <select style={{ ...inp, width:'auto' }} value={def.schedule.type} onChange={e=>setDef(d=>({...d,schedule:{...d.schedule,type:e.target.value}}))}>
            <option value="weekly">Weekly</option>
            <option value="daily">Daily</option>
          </select>
          {def.schedule.type === 'weekly' && (
            <select style={{ ...inp, width:'auto' }} value={def.schedule.weekday} onChange={e=>setDef(d=>({...d,schedule:{...d.schedule,weekday:Number(e.target.value)}}))}>
              {WEEKDAYS.map((w,i) => <option key={i} value={i}>{w}</option>)}
            </select>
          )}
          <select style={{ ...inp, width:'auto' }} value={def.schedule.hour} onChange={e=>setDef(d=>({...d,schedule:{...d.schedule,hour:Number(e.target.value)}}))}>
            {Array.from({length:24},(_, h)=><option key={h} value={h}>{((h%12)||12)+(h<12?' AM':' PM')} ET</option>)}
          </select>
        </div>

        <span style={lb}>Recipients</span>
        <div style={{ display:'flex', gap:6 }}>
          <input style={inp} value={recipientInput} onChange={e=>setRecipientInput(e.target.value)} placeholder="email@targetreteam.com"
            onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); addRecipient() } }} />
          <Btn variant="secondary" onClick={addRecipient}>Add</Btn>
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:6 }}>
          {def.recipients.map(r => (
            <span key={r} style={{ padding:'4px 10px', borderRadius:99, background:'var(--dim)', border:'1px solid var(--border)', fontSize:12 }}>
              {r} <span onClick={()=>setDef(d=>({...d,recipients:d.recipients.filter(x=>x!==r)}))} style={{ cursor:'pointer', color:'var(--muted)', marginLeft:4 }}>✕</span>
            </span>
          ))}
        </div>

        <label style={{ display:'flex', alignItems:'center', gap:8, marginTop:12, fontSize:13 }}>
          <input type="checkbox" checked={def.enabled} onChange={e=>setDef(d=>({...d,enabled:e.target.checked}))} />
          Active (sends on schedule)
        </label>

        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:14 }}>
          <Btn variant="secondary" onClick={sendNow} loading={busy}>Send now (test)</Btn>
          <Btn onClick={save} loading={busy}>Save report</Btn>
        </div>
      </div>

      <div style={{ position:'sticky', top:12 }}>
        <span style={lb}>Live preview — links open records in the CRM</span>
        <div style={{ border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', background:'#fff', maxHeight:640, overflowY:'auto' }}
             dangerouslySetInnerHTML={{ __html: preview }} />
      </div>
    </div>
  )
}
