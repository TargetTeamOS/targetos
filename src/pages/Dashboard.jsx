import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useDeals } from '../lib/hooks/useDeals'
import { useContacts } from '../lib/hooks/useContacts'
import { useTasks } from '../lib/hooks/useTasks'
import { useListings } from '../lib/hooks/useListings'
import { useAgents } from '../lib/hooks/useAgents'
import { useApp } from '../context/AppContext'
import { fmt$, fmtDate } from '../lib/utils/format'
import { createContact } from '../lib/db/contacts'
import { createListing } from '../lib/db/listings'
import { createTask } from '../lib/db/tasks'
import { VoiceCapture } from '../components/VoiceCapture'

// Per-agent annual goals
const AGENT_GOALS = {
  'Lazer Farkas':       { gci: 200000, deals: 20 },
  'Mendy Jankovits':    { gci: 150000, deals: 15 },
  'Isaac Leibowitz':    { gci: 180000, deals: 18 },
  'Yanky Lichtenstein': { gci: 200000, deals: 20 },
  'Gitty Fogel':        { gci: 80000,  deals: 8  },
  'Joel Rottenstein':   { gci: 120000, deals: 12 },
  'Eli Hoffman':        { gci: 200000, deals: 20 },
  'Avraham Weinberger': { gci: 160000, deals: 16 },
}
const TEAM_GOAL_GCI   = 2000000
const TEAM_GOAL_DEALS = 50

const HEADLINES = [
  '📈 Rockland County median home price up 8% year over year',
  '🏠 Inventory remains tight — now is the time to list',
  '💰 Mortgage rates holding steady at 6.8% this week',
  '🔥 Spring market in full swing — buyer demand is high',
  '📋 HGAR new MLS rules effective July 1, 2026',
]

const STAGE_COLORS = {
  'Negotiations': '#037f4c', 'Offer Accapted': '#00c875',
  'Under Shtar': '#bb3354', 'Under Contract': '#757575',
}

const SOURCES = ['SOI','Referral','Zillow','Sign Call','Cold Call','Social Media','Past Client','Other']

export function Dashboard({ setPage }) {
  const { agent, isAdmin } = useAuth()
  const { toast } = useApp()
  const year = new Date().getFullYear().toString()

  // Data hooks — RLS ensures each agent sees only their own data, admin sees all
  const { deals,    loading: dLoad } = useDeals({ year })
  const { contacts, loading: cLoad } = useContacts()
  const { tasks,    loading: tLoad } = useTasks({ status: 'pending' })
  const { listings, loading: lLoad } = useListings()
  const { agents }                   = useAgents()

  const [quickAdd, setQuickAdd] = useState(null) // 'lead' | 'listing' | 'task'
  const [form, setForm]         = useState({})
  const [saving, setSaving]     = useState(false)
  const [showVoice, setShowVoice] = useState(false)
  const [adminTab, setAdminTab] = useState('overview') // 'overview' | 'agents' | 'pipeline'

  const today = new Date().toISOString().split('T')[0]
  const set   = (k,v) => setForm(f => ({...f, [k]:v}))

  // ── STATS ────────────────────────────────────────────────────
  const closedDeals    = deals.filter(d => d.stage === 'Closed')
  const activeDeals    = deals.filter(d => ['Negotiations','Offer Accapted','Under Shtar','Under Contract'].includes(d.stage))
  const totalGCI       = closedDeals.reduce((s,d) => s+(d.gci||0), 0)
  const totalVolume    = closedDeals.reduce((s,d) => s+(d.production||0), 0)
  const pendingGCI     = activeDeals.reduce((s,d) => s+(d.gci||0), 0)
  const overdueTasks   = tasks.filter(t => t.due_date && t.due_date < today)
  const todayTasks     = tasks.filter(t => t.due_date === today)
  const upcomingTasks  = tasks.filter(t => !t.due_date || t.due_date > today)
  const hotLeads       = contacts.filter(c => c.status === 'Hot')
  const warmLeads      = contacts.filter(c => c.status === 'Warm')
  const activeListings = listings.filter(l => l.status === 'Active')

  const goal    = AGENT_GOALS[agent?.name] || { gci: 150000, deals: 15 }
  const gciPct  = Math.min(Math.round(totalGCI / goal.gci * 100), 100)
  const dealPct = Math.min(Math.round(closedDeals.length / goal.deals * 100), 100)
  const color   = agent?.color || '#CC2200'
  const name    = agent?.name?.split(' ')[0] || 'Agent'

  // Admin: per-agent breakdown
  const agentStats = agents.map(a => {
    const aDeals   = deals.filter(d => d.agent_id === a.id)
    const aClosed  = aDeals.filter(d => d.stage === 'Closed')
    const aActive  = aDeals.filter(d => ['Negotiations','Offer Accapted','Under Shtar','Under Contract'].includes(d.stage))
    const aGCI     = aClosed.reduce((s,d) => s+(d.gci||0), 0)
    const aVol     = aClosed.reduce((s,d) => s+(d.production||0), 0)
    const aPending = aActive.reduce((s,d) => s+(d.gci||0), 0)
    const aGoal    = AGENT_GOALS[a.name] || { gci: 150000, deals: 15 }
    const aPct     = Math.min(Math.round(aGCI / aGoal.gci * 100), 100)
    const aListings = listings.filter(l => l.agent_id === a.id && l.status === 'Active').length
    const aContacts = contacts.filter(c => c.agent_id === a.id).length
    return { ...a, closed: aClosed.length, active: aActive.length, gci: aGCI, volume: aVol, pending: aPending, pct: aPct, goal: aGoal, listings: aListings, contacts: aContacts }
  }).sort((a,b) => b.gci - a.gci)

  const teamGCI   = agentStats.reduce((s,a) => s+a.gci, 0)
  const teamVol   = agentStats.reduce((s,a) => s+a.volume, 0)
  const teamDeals = agentStats.reduce((s,a) => s+a.closed, 0)
  const teamPct   = Math.min(Math.round(teamGCI / TEAM_GOAL_GCI * 100), 100)

  // ── QUICK SAVE ───────────────────────────────────────────────
  async function saveLead() {
    if (!form.first_name?.trim()) { toast('Name required','#DC2626'); return }
    setSaving(true)
    try {
      await createContact({ ...form, agent_id: agent?.id, status:'New', last_activity: new Date().toISOString() })
      toast('✅ Lead saved!'); setQuickAdd(null); setForm({})
    } catch(e) { toast(e.message,'#DC2626') } finally { setSaving(false) }
  }

  async function saveListing() {
    if (!form.addr?.trim()) { toast('Address required','#DC2626'); return }
    setSaving(true)
    try {
      await createListing({ ...form, agent_id: agent?.id, status:'Active', spend:[], showings:[], interests:[] })
      toast('✅ Listing saved!'); setQuickAdd(null); setForm({})
    } catch(e) { toast(e.message,'#DC2626') } finally { setSaving(false) }
  }

  async function saveTask() {
    if (!form.title?.trim()) { toast('Title required','#DC2626'); return }
    setSaving(true)
    try {
      await createTask({ ...form, agent_id: agent?.id, created_by: agent?.id, status:'pending', priority: form.priority||'normal' })
      toast('✅ Task saved!'); setQuickAdd(null); setForm({})
    } catch(e) { toast(e.message,'#DC2626') } finally { setSaving(false) }
  }

  function goTo(page) { if(setPage) setPage(page) }

  return (
    <div style={{ fontFamily:'Inter,system-ui,sans-serif' }}>

      {/* ── TOP BAR ─────────────────────────────────────────── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'16px', flexWrap:'wrap', gap:'10px' }}>
        <div>
          <div style={{ fontSize:'22px', fontWeight:900 }}>
            Good {tod()}, {name} 👋
          </div>
          <div style={{ fontSize:'12px', color:'var(--muted)', marginTop:'3px' }}>
            {new Date().toLocaleDateString('en-US',{ weekday:'long', month:'long', day:'numeric', year:'numeric' })}
            {isAdmin && <span style={{ marginLeft:'8px', fontSize:'11px', fontWeight:700, color:'#CC2200', background:'rgba(204,34,0,.1)', padding:'2px 9px', borderRadius:'20px' }}>ADMIN</span>}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display:'flex', gap:'7px', flexWrap:'wrap', alignItems:'center' }}>
          {/* Voice button */}
          <button onClick={() => setShowVoice(s => !s)}
            style={{ width:40, height:40, borderRadius:'50%', background:showVoice?color:'var(--panel)', border:`2px solid ${showVoice?color:'var(--border)'}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:'18px', transition:'all .15s' }}>
            🎙
          </button>

          {[
            { key:'lead',    label:'+ Lead',    icon:'👤' },
            { key:'listing', label:'+ Listing', icon:'🏠' },
            { key:'task',    label:'+ Task',    icon:'✓'  },
          ].map(b => (
            <button key={b.key} onClick={() => { setQuickAdd(quickAdd===b.key?null:b.key); setForm({}) }}
              style={{ background:quickAdd===b.key?color:'var(--panel)', border:`1.5px solid ${quickAdd===b.key?color:'var(--border)'}`, borderRadius:'9px', color:quickAdd===b.key?'#fff':'var(--text)', fontSize:'12px', fontWeight:700, padding:'8px 13px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif', transition:'all .15s' }}>
              {b.icon} {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── VOICE CAPTURE ───────────────────────────────────── */}
      {showVoice && (
        <div style={{ marginBottom:'14px' }}>
          <VoiceCapture onClose={() => setShowVoice(false)} embedded />
        </div>
      )}

      {/* ── QUICK ADD FORMS ─────────────────────────────────── */}
      {quickAdd === 'lead' && (
        <div style={{ background:'var(--panel)', border:`1.5px solid ${color}`, borderRadius:'12px', padding:'14px 16px', marginBottom:'14px' }}>
          <div style={{ fontSize:'12px', fontWeight:700, color, marginBottom:'10px' }}>👤 Quick Add Lead</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr auto', gap:'7px' }}>
            <input value={form.first_name||''} onChange={e=>set('first_name',e.target.value)} placeholder="First name *" style={inp} autoFocus/>
            <input value={form.last_name||''} onChange={e=>set('last_name',e.target.value)} placeholder="Last name" style={inp}/>
            <input value={form.phone||''} onChange={e=>set('phone',e.target.value)} placeholder="Phone" style={inp}/>
            <input value={form.email||''} onChange={e=>set('email',e.target.value)} placeholder="Email" style={inp}/>
            <select value={form.source||''} onChange={e=>set('source',e.target.value)} style={inp}>
              <option value="">Source...</option>
              {SOURCES.map(s => <option key={s}>{s}</option>)}
            </select>
            <button onClick={saveLead} disabled={saving} style={saveBtn}>{saving?'…':'Save'}</button>
          </div>
        </div>
      )}

      {quickAdd === 'listing' && (
        <div style={{ background:'var(--panel)', border:`1.5px solid ${color}`, borderRadius:'12px', padding:'14px 16px', marginBottom:'14px' }}>
          <div style={{ fontSize:'12px', fontWeight:700, color, marginBottom:'10px' }}>🏠 Quick Add Listing</div>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr auto', gap:'7px' }}>
            <input value={form.addr||''} onChange={e=>set('addr',e.target.value)} placeholder="Property address *" style={inp} autoFocus/>
            <input value={form.city||''} onChange={e=>set('city',e.target.value)} placeholder="City" style={inp}/>
            <input value={form.list_price||''} onChange={e=>set('list_price',e.target.value)} placeholder="Price $" type="number" style={inp}/>
            <input value={form.beds||''} onChange={e=>set('beds',e.target.value)} placeholder="Beds" style={inp}/>
            <input value={form.baths||''} onChange={e=>set('baths',e.target.value)} placeholder="Baths" style={inp}/>
            <button onClick={saveListing} disabled={saving} style={saveBtn}>{saving?'…':'Save'}</button>
          </div>
        </div>
      )}

      {quickAdd === 'task' && (
        <div style={{ background:'var(--panel)', border:`1.5px solid ${color}`, borderRadius:'12px', padding:'14px 16px', marginBottom:'14px' }}>
          <div style={{ fontSize:'12px', fontWeight:700, color, marginBottom:'10px' }}>✓ Quick Add Task / Note / Reminder</div>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 120px 130px auto', gap:'7px' }}>
            <input value={form.title||''} onChange={e=>set('title',e.target.value)} placeholder="What needs to be done?" style={inp} autoFocus
              onKeyDown={e => e.key==='Enter' && saveTask()}/>
            <select value={form.priority||'normal'} onChange={e=>set('priority',e.target.value)} style={inp}>
              <option value="urgent">🔴 Urgent</option>
              <option value="high">🟠 High</option>
              <option value="normal">🔵 Normal</option>
              <option value="low">⚪ Low</option>
              <option value="note">📌 Note</option>
            </select>
            <input value={form.due_date||''} onChange={e=>set('due_date',e.target.value)} type="date" style={inp}/>
            <button onClick={saveTask} disabled={saving} style={saveBtn}>{saving?'…':'Save'}</button>
          </div>
        </div>
      )}

      {/* ── ADMIN: TEAM OVERVIEW TABS ────────────────────────── */}
      {isAdmin && (
        <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'14px', overflow:'hidden', marginBottom:'14px' }}>
          {/* Tab bar */}
          <div style={{ display:'flex', borderBottom:'1px solid var(--border)', background:'var(--dim)' }}>
            {[['overview','📊 Overview'],['agents','👥 All Agents'],['pipeline','📈 Pipeline']].map(([k,l]) => (
              <button key={k} onClick={() => setAdminTab(k)}
                style={{ padding:'11px 18px', border:'none', background:'transparent', cursor:'pointer', fontSize:'12px', fontWeight:700, fontFamily:'Inter,system-ui,sans-serif',
                  color: adminTab===k ? '#CC2200' : 'var(--muted)',
                  borderBottom: adminTab===k ? '2px solid #CC2200' : '2px solid transparent' }}>
                {l}
              </button>
            ))}
            <div style={{ marginLeft:'auto', padding:'10px 16px', fontSize:'11px', color:'var(--muted)' }}>
              {new Date().getFullYear()} YTD
            </div>
          </div>

          {/* Overview tab */}
          {adminTab === 'overview' && (
            <div style={{ padding:'16px' }}>
              {/* Team GCI progress */}
              <div style={{ marginBottom:'16px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                  <div>
                    <div style={{ fontSize:'13px', fontWeight:700 }}>Team GCI Progress</div>
                    <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:'2px' }}>{fmt$(teamGCI)} of {fmt$(TEAM_GOAL_GCI)} goal · {teamDeals} deals closed</div>
                  </div>
                  <div style={{ fontSize:'24px', fontWeight:900, color:teamPct>=100?'#16A34A':'#CC2200' }}>{teamPct}%</div>
                </div>
                <div style={{ background:'var(--dim)', borderRadius:'99px', height:10, overflow:'hidden' }}>
                  <div style={{ background:'linear-gradient(90deg,#CC2200,#E8650A)', borderRadius:'99px', height:10, width:teamPct+'%', transition:'width .5s' }}/>
                </div>
              </div>

              {/* Team stats grid */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'8px' }}>
                {[
                  ['Total GCI', fmt$(teamGCI), '#16A34A'],
                  ['Total Volume', fmt$(teamVol), '#225091'],
                  ['Closed Deals', teamDeals, '#CC2200'],
                  ['Active Deals', agentStats.reduce((s,a)=>s+a.active,0), '#D97706'],
                  ['Pending GCI', fmt$(agentStats.reduce((s,a)=>s+a.pending,0)), '#7C3AED'],
                ].map(([k,v,c]) => (
                  <div key={k} style={{ background:'var(--dim)', borderRadius:'10px', padding:'12px' }}>
                    <div style={{ fontSize:'9px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.7px', marginBottom:'4px' }}>{k}</div>
                    <div style={{ fontSize:'18px', fontWeight:900, color:c }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All Agents tab */}
          {adminTab === 'agents' && (
            <div style={{ overflowX:'auto' }}>
              {/* Header row */}
              <div style={{ display:'grid', gridTemplateColumns:'160px 90px 80px 90px 90px 90px 70px 70px 80px', background:'var(--dim)', borderBottom:'1px solid var(--border)', minWidth:'900px' }}>
                {['Agent','GCI','Goal %','Volume','Pending GCI','Closed','Active','Listings','Contacts'].map(h => (
                  <div key={h} style={{ padding:'8px 10px', fontSize:'9px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.5px', borderRight:'1px solid var(--border)' }}>{h}</div>
                ))}
              </div>
              {agentStats.map((a,i) => (
                <div key={a.id} style={{ display:'grid', gridTemplateColumns:'160px 90px 80px 90px 90px 90px 70px 70px 80px', borderBottom:'1px solid var(--border)', background:i%2?'rgba(0,0,0,.01)':'transparent', minWidth:'900px' }}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'}
                  onMouseLeave={e=>e.currentTarget.style.background=i%2?'rgba(0,0,0,.01)':'transparent'}>
                  {/* Agent name */}
                  <div style={{ padding:'10px', borderRight:'1px solid var(--border)', display:'flex', alignItems:'center', gap:'8px' }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', background:a.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:800, color:'#fff', flexShrink:0 }}>
                      {a.name?.[0]}
                    </div>
                    <div>
                      <div style={{ fontSize:'12px', fontWeight:700 }}>{a.name.split(' ')[0]}</div>
                      <div style={{ fontSize:'10px', color:'var(--muted)', textTransform:'capitalize' }}>{a.role}</div>
                    </div>
                  </div>
                  {/* GCI */}
                  <div style={{ padding:'10px', borderRight:'1px solid var(--border)', display:'flex', alignItems:'center' }}>
                    <span style={{ fontSize:'12px', fontWeight:700, color:'#16A34A' }}>{fmt$(a.gci)}</span>
                  </div>
                  {/* Goal % with bar */}
                  <div style={{ padding:'10px', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', justifyContent:'center', gap:'4px' }}>
                    <div style={{ fontSize:'12px', fontWeight:700, color:a.pct>=100?'#16A34A':a.color }}>{a.pct}%</div>
                    <div style={{ background:'var(--dim)', borderRadius:'99px', height:4, overflow:'hidden' }}>
                      <div style={{ background:a.pct>=100?'#16A34A':a.color, borderRadius:'99px', height:4, width:a.pct+'%' }}/>
                    </div>
                  </div>
                  {/* Volume */}
                  <div style={{ padding:'10px', borderRight:'1px solid var(--border)', display:'flex', alignItems:'center' }}>
                    <span style={{ fontSize:'12px', color:'#225091', fontWeight:600 }}>{fmt$(a.volume)}</span>
                  </div>
                  {/* Pending GCI */}
                  <div style={{ padding:'10px', borderRight:'1px solid var(--border)', display:'flex', alignItems:'center' }}>
                    <span style={{ fontSize:'12px', color:'#D97706', fontWeight:600 }}>{fmt$(a.pending)}</span>
                  </div>
                  {/* Closed */}
                  <div style={{ padding:'10px', borderRight:'1px solid var(--border)', display:'flex', alignItems:'center' }}>
                    <span style={{ fontSize:'12px', fontWeight:700 }}>{a.closed} <span style={{ fontSize:'10px', color:'var(--muted)' }}>of {a.goal.deals}</span></span>
                  </div>
                  {/* Active deals */}
                  <div style={{ padding:'10px', borderRight:'1px solid var(--border)', display:'flex', alignItems:'center' }}>
                    <span style={{ fontSize:'12px', fontWeight:600, color:a.active>0?'#D97706':'var(--muted)' }}>{a.active}</span>
                  </div>
                  {/* Listings */}
                  <div style={{ padding:'10px', borderRight:'1px solid var(--border)', display:'flex', alignItems:'center' }}>
                    <span style={{ fontSize:'12px', fontWeight:600, color:a.listings>0?'#0EA5E9':'var(--muted)' }}>{a.listings}</span>
                  </div>
                  {/* Contacts */}
                  <div style={{ padding:'10px', display:'flex', alignItems:'center' }}>
                    <span style={{ fontSize:'12px', fontWeight:600 }}>{a.contacts}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pipeline tab */}
          {adminTab === 'pipeline' && (
            <div style={{ padding:'14px' }}>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:'8px' }}>
                {agentStats.filter(a => a.active > 0).map(a => (
                  <div key={a.id} style={{ background:'var(--dim)', borderRadius:'10px', padding:'12px', borderLeft:`3px solid ${a.color}` }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'7px', marginBottom:'8px' }}>
                      <div style={{ width:24, height:24, borderRadius:'50%', background:a.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'10px', fontWeight:800, color:'#fff' }}>{a.name?.[0]}</div>
                      <span style={{ fontSize:'12px', fontWeight:700 }}>{a.name.split(' ')[0]}</span>
                    </div>
                    <div style={{ fontSize:'16px', fontWeight:900, color:a.color, marginBottom:'2px' }}>{fmt$(a.pending)}</div>
                    <div style={{ fontSize:'10px', color:'var(--muted)' }}>{a.active} active deal{a.active!==1?'s':''}</div>
                  </div>
                ))}
              </div>
              {agentStats.every(a => a.active === 0) && (
                <div style={{ padding:'24px', textAlign:'center', color:'var(--muted)', fontSize:'13px' }}>No active deals in pipeline</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── AGENT: GCI PROGRESS ─────────────────────────────── */}
      {!isAdmin && (
        <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'13px', padding:'16px 18px', marginBottom:'14px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
            <div>
              <div style={{ fontSize:'13px', fontWeight:700 }}>My GCI Progress {year}</div>
              <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:'2px' }}>
                {fmt$(totalGCI)} of {fmt$(goal.gci)} · {closedDeals.length} of {goal.deals} deals
              </div>
            </div>
            <div style={{ fontSize:'24px', fontWeight:900, color:gciPct>=100?'#16A34A':color }}>{gciPct}%</div>
          </div>
          <div style={{ background:'var(--dim)', borderRadius:'99px', height:10, overflow:'hidden', marginBottom:'6px' }}>
            <div style={{ background:`linear-gradient(90deg,${color},${color}99)`, borderRadius:'99px', height:10, width:gciPct+'%', transition:'width .5s' }}/>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'10px', color:'var(--muted)' }}>
            <span>Deals: {dealPct}%</span>
            <span>{goal.deals - closedDeals.length > 0 ? `${goal.deals - closedDeals.length} deals to goal` : '🎉 Goal reached!'}</span>
          </div>
        </div>
      )}

      {/* ── AGENT STATS GRID ────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:'8px', marginBottom:'14px' }}>
        {[
          { label:'Closed GCI',      value:fmt$(totalGCI),         color:'#16A34A' },
          { label:'Total Volume',    value:fmt$(totalVolume),      color:'#225091' },
          { label:'Pending GCI',     value:fmt$(pendingGCI),       color:'#D97706' },
          { label:'Closed Deals',    value:closedDeals.length,     color:'#CC2200' },
          { label:'Active Deals',    value:activeDeals.length,     color:'#E8650A' },
          { label:'Hot Leads',       value:hotLeads.length,        color:'#DC2626' },
          { label:'Warm Leads',      value:warmLeads.length,       color:'#D97706' },
          { label:'Active Listings', value:activeListings.length,  color:'#0EA5E9' },
          { label:'Total Contacts',  value:contacts.length,        color:'#7C3AED' },
        ].map(s => (
          <div key={s.label} style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'11px', padding:'12px' }}>
            <div style={{ fontSize:'9px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.7px', marginBottom:'4px' }}>{s.label}</div>
            <div style={{ fontSize:'20px', fontWeight:900, color:s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── BOTTOM GRID ─────────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'14px' }}>

        {/* Today's Tasks */}
        <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'13px', overflow:'hidden' }}>
          <div style={{ padding:'11px 14px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:'13px', fontWeight:700 }}>✓ Today's Tasks</span>
            <div style={{ display:'flex', gap:'5px' }}>
              {overdueTasks.length > 0 && <Tag label={`${overdueTasks.length} overdue`} color="#DC2626"/>}
              <Tag label={`${todayTasks.length} today`} color="#CC2200"/>
            </div>
          </div>
          {tLoad ? <Ldr/> :
            (overdueTasks.length === 0 && todayTasks.length === 0)
            ? <Empty icon="🎯" text="All clear — nothing due today!"/>
            : <>
                {overdueTasks.slice(0,3).map(t => (
                  <TaskRow key={t.id} task={t} color="#DC2626" badge="Overdue"/>
                ))}
                {todayTasks.slice(0,5).map(t => (
                  <TaskRow key={t.id} task={t} color={t.priority==='urgent'?'#DC2626':t.priority==='high'?'#D97706':'#0EA5E9'}/>
                ))}
              </>
          }
          <button onClick={() => goTo('tasks')} style={linkBtn}>View all tasks →</button>
        </div>

        {/* Active Pipeline */}
        <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'13px', overflow:'hidden' }}>
          <div style={{ padding:'11px 14px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:'13px', fontWeight:700 }}>📈 Active Pipeline</span>
            <span style={{ fontSize:'11px', color:'var(--muted)' }}>{fmt$(pendingGCI)} pending</span>
          </div>
          {dLoad ? <Ldr/> :
            activeDeals.length === 0
            ? <Empty icon="📋" text="No active deals"/>
            : activeDeals.slice(0,6).map(d => (
                <div key={d.id} style={{ padding:'9px 14px', borderBottom:'1px solid var(--border)', display:'flex', gap:'8px', alignItems:'center' }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:STAGE_COLORS[d.stage]||'#94A3B8', flexShrink:0 }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:'12px', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.addr}</div>
                    <div style={{ fontSize:'10px', color:'var(--muted)' }}>{d.stage} · {d.client_name||''}</div>
                  </div>
                  <span style={{ fontSize:'11px', fontWeight:700, color:'#16A34A', flexShrink:0 }}>{fmt$(d.gci)}</span>
                </div>
              ))
          }
          <button onClick={() => goTo('production')} style={linkBtn}>View production board →</button>
        </div>
      </div>

      {/* Headlines */}
      <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'13px', overflow:'hidden' }}>
        <div style={{ padding:'11px 14px', borderBottom:'1px solid var(--border)', fontSize:'13px', fontWeight:700 }}>📰 Market Headlines</div>
        {HEADLINES.map((h,i) => (
          <div key={i} style={{ padding:'10px 14px', borderBottom:i<HEADLINES.length-1?'1px solid var(--border)':'none', fontSize:'12px', color:'var(--muted)', lineHeight:1.6 }}>
            {h}
          </div>
        ))}
      </div>

    </div>
  )
}

// ── SMALL COMPONENTS ──────────────────────────────────────────
function TaskRow({ task, color, badge }) {
  return (
    <div style={{ padding:'9px 14px', borderBottom:'1px solid var(--border)', display:'flex', gap:'8px', alignItems:'center' }}>
      <div style={{ width:7, height:7, borderRadius:'2px', background:color, flexShrink:0 }}/>
      <span style={{ fontSize:'12px', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:badge?color:'var(--text)' }}>{task.title}</span>
      {badge && <span style={{ fontSize:'10px', color, fontWeight:700, flexShrink:0 }}>{badge}</span>}
    </div>
  )
}

function Tag({ label, color }) {
  return (
    <span style={{ fontSize:'10px', fontWeight:700, background:color+'18', color, border:`1px solid ${color}30`, borderRadius:'99px', padding:'2px 8px' }}>
      {label}
    </span>
  )
}

function Ldr() {
  return <div style={{ padding:'20px', textAlign:'center', color:'var(--muted)', fontSize:'12px' }}>Loading...</div>
}

function Empty({ icon, text }) {
  return <div style={{ padding:'24px', textAlign:'center', color:'var(--muted)', fontSize:'12px' }}>{icon} {text}</div>
}

function tod() {
  const h = new Date().getHours()
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
}

const inp     = { background:'var(--inp)', border:'1.5px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'12px', fontFamily:'Inter,system-ui,sans-serif', padding:'8px 10px', outline:'none', width:'100%', boxSizing:'border-box' }
const saveBtn = { background:'#CC2200', border:'none', borderRadius:'8px', color:'#fff', fontSize:'12px', fontWeight:700, padding:'9px 18px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif', whiteSpace:'nowrap' }
const linkBtn = { display:'block', width:'100%', textAlign:'left', padding:'9px 14px', background:'none', border:'none', cursor:'pointer', fontSize:'11px', color:'var(--muted)', fontFamily:'Inter,system-ui,sans-serif' }
