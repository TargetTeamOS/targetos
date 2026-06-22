import React, { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useDeals } from '../lib/hooks/useDeals'
import { useAgents } from '../lib/hooks/useAgents'
import { useApp } from '../context/AppContext'
import { fmt$, fmtDate } from '../lib/utils/format'

const STAGES = [
  { label:'Negotiations',      color:'#037f4c' },
  { label:'Offer Accapted',    color:'#00c875' },
  { label:'Under Shtar',       color:'#bb3354' },
  { label:'Under Contract',    color:'#757575' },
  { label:'Closed',            color:'#225091' },
  { label:'Deal Fell Through', color:'#ff007f' },
]
const CTC_STAGES = ['Inspection scheduled','Mortgage process','Appraisal ordered','Conditional Approval','Clear to close','Closing scheduled','Issue','Canceled','Closed']
const SIDES = ['Buyer','Listing','Dual','Dual  Buyer','Dual Listing','Seller','Rental','Flip']
const PROPERTY_TYPES = ['Condo','Single Family','Multi Family','New Construction','Land','Co-Op','Summer Home','Commercial']
const SALE_TYPES = ['On Market','Off Market','FSBO']
const SOURCES = ['Past Client Repeat','Past Client Referral','SOI','Referral','System Call','Social Media','Sign Call','Farm','Cold Calls','Sign','Zillow','Israel','Office Referral','Approached','Other']
const COMMISSION_STATUSES = ['Working on it','Done','Stuck']
const CMD_STATUSES = ['Working on it','Done','Stuck','Waiting for approval','No command','Contact Info needed','Sent not signed','Not Yet','Client has been notified']
const SIGN_STATUSES = ['Under Contract Sent','Sold Sign Sent']

const GROUPS = [
  { id:'ao',       title:'ACCEPTED OFFERS',         stages:['Offer Accapted'] },
  { id:'shtar',    title:'UNDER SHTAR',              stages:['Under Shtar'] },
  { id:'contract', title:'UNDER CONTRACT',           stages:['Under Contract'] },
  { id:'sold',     title:'Sold',                     stages:['Closed'] },
  { id:'fell',     title:'Deal Fell Through',        stages:['Deal Fell Through'] },
]

const STAGE_C = s => STAGES.find(x=>x.label===s)?.color || '#c4c4c4'

function Pill({ value, options, onChange }) {
  const [open, setOpen] = useState(false)
  const opt = (options || []).find(o => (o.label||o) === value)
  const color = opt?.color || '#c4c4c4'
  if (!onChange) return (
    <span style={{ background:color+'20', border:`1px solid ${color}40`, borderRadius:'4px', padding:'2px 7px', fontSize:'10px', fontWeight:600, color, whiteSpace:'nowrap' }}>{value||'—'}</span>
  )
  return (
    <div style={{ position:'relative' }}>
      <div onClick={()=>setOpen(o=>!o)} style={{ cursor:'pointer', background:color+'20', border:`1px solid ${color}40`, borderRadius:'4px', padding:'2px 7px', fontSize:'10px', fontWeight:600, color, whiteSpace:'nowrap', userSelect:'none' }}>
        {value||'—'}
      </div>
      {open && (
        <div style={{ position:'fixed', zIndex:200, background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'10px', boxShadow:'0 8px 24px rgba(0,0,0,.2)', minWidth:'160px', maxHeight:'220px', overflowY:'auto' }}
          onMouseLeave={()=>setOpen(false)}>
          {(options||[]).map(o => {
            const lbl = o.label||o; const c = o.color||'#94A3B8'
            return (
              <div key={lbl} onClick={()=>{onChange(lbl);setOpen(false)}}
                style={{ padding:'7px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:'8px', fontSize:'12px', fontWeight:600 }}
                onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <div style={{ width:8, height:8, borderRadius:'2px', background:c }}/>
                {lbl}
              </div>
            )
          })}
          <div onClick={()=>{onChange('');setOpen(false)}} style={{ padding:'6px 12px', cursor:'pointer', fontSize:'11px', color:'var(--muted)', borderTop:'1px solid var(--border)' }}>Clear</div>
        </div>
      )}
    </div>
  )
}

function EditCell({ value, onChange, type='text', prefix='' }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value||'')
  if (!editing) return (
    <div onClick={()=>{setVal(value||'');setEditing(true)}} style={{ cursor:'text', fontSize:'12px', color:value?'var(--text)':'var(--muted)', padding:'1px 3px', borderRadius:'4px', minWidth:'50px' }}
      onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
      {value?(prefix+(type==='number'?Number(value).toLocaleString():value)):'—'}
    </div>
  )
  return (
    <input type={type} value={val} onChange={e=>setVal(e.target.value)} autoFocus
      onBlur={()=>{onChange(val);setEditing(false)}}
      onKeyDown={e=>{if(e.key==='Enter'){onChange(val);setEditing(false)}if(e.key==='Escape')setEditing(false)}}
      style={{ width:'100%', background:'var(--inp)', border:'1.5px solid #CC2200', borderRadius:'4px', color:'var(--text)', fontSize:'12px', fontFamily:'Inter,system-ui,sans-serif', padding:'2px 6px', outline:'none' }}/>
  )
}

export function Production() {
  const navigate = useNavigate()
  const { id: urlId } = useParams()
  const { agent, isAdmin } = useAuth()
  const { toast } = useApp()
  const { agents } = useAgents()
  const [filterYear, setFilterYear]   = useState('2026')
  const [filterAgent, setFilterAgent] = useState(isAdmin ? '' : agent?.id)
  const [search, setSearch]           = useState('')
  const [showAdd, setShowAdd]         = useState(false)
  const [expanded, setExpanded]       = useState({ ao:true, shtar:true, contract:true, sold:true, fell:false })
  const [form, setForm]               = useState(defaultForm())
  const [saving, setSaving]           = useState(false)

  const { deals, loading, add, update, remove } = useDeals({
    agentId: filterAgent || undefined,
    year: filterYear || undefined,
  })

  function defaultForm() {
    return { addr:'', agent_id:agent?.id||'', side:'Buyer', stage:'Offer Accapted', production:'', gci:'',
      ao_date:'', contract_date:'', expected_close_date:'', close_date:'', property_type:'', sale_type:'On Market',
      sales_source:'', client_name:'', client_legal_name:'', client_email:'', client_phone:'',
      atty_name:'', atty_email:'', unit:'', ctc:'', command:'', sign:'', commission_received:'', agent_commission_sent:'', referral_agent:'', notes:'' }
  }

  const filtered = deals.filter(d => {
    if (search && !d.addr?.toLowerCase().includes(search.toLowerCase()) && !(d.client_name||'').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  async function updateField(id, field, value) {
    try {
      await update(id, { [field]: value })
    } catch(e) { toast('Save failed: '+e.message, '#DC2626') }
  }

  async function handleAdd() {
    if (!form.addr.trim()) { toast('Address required', '#DC2626'); return }
    setSaving(true)
    try {
      const payload = { ...form, agent_id: form.agent_id || agent?.id,
        production: parseFloat(form.production)||0, gci: parseFloat(form.gci)||0 }
      await add(payload)
      toast('✅ Deal added!')
      setShowAdd(false)
      setForm(defaultForm())
    } catch(e) { toast('Error: '+e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  const closedDeals = filtered.filter(d=>d.stage==='Closed')
  const totalGCI    = closedDeals.reduce((s,d)=>s+(d.gci||0),0)
  const totalProd   = closedDeals.reduce((s,d)=>s+(d.production||0),0)
  const activeDeals = filtered.filter(d=>['Offer Accapted','Under Shtar','Under Contract'].includes(d.stage))
  const pendingGCI  = activeDeals.reduce((s,d)=>s+(d.gci||0),0)

  const COLS = [
    {id:'addr',w:'220px',label:'Address'},{id:'agent',w:'90px',label:'Agent'},{id:'prod',w:'90px',label:'Prod $'},
    {id:'gci',w:'85px',label:'GCI $'},{id:'stage',w:'120px',label:'Stage'},{id:'side',w:'95px',label:'Side'},
    {id:'ctc',w:'125px',label:'CTC'},{id:'cmd',w:'115px',label:'Command'},{id:'sign',w:'105px',label:'Sign'},
    {id:'comm_r',w:'85px',label:'Comm R'},{id:'comm_s',w:'85px',label:'Comm S'},
    {id:'type',w:'90px',label:'Type'},{id:'ao',w:'95px',label:'A/O Date'},{id:'close',w:'95px',label:'Close'},
    {id:'src',w:'110px',label:'Source'},{id:'client',w:'110px',label:'Client'},
  ]
  const COLS_TMPL = COLS.map(c=>c.w).join(' ')

  if (loading) return <div style={{ padding:'40px', textAlign:'center', color:'var(--muted)' }}>⏳ Loading...</div>

  return (
    <div style={{ fontFamily:'Inter,system-ui,sans-serif' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px', flexWrap:'wrap', gap:'8px' }}>
        <div style={{ fontSize:'18px', fontWeight:900 }}>📊 Production Board</div>
        <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', alignItems:'center' }}>
          <select value={filterYear} onChange={e=>setFilterYear(e.target.value)} style={sel}>
            {['2026','2025','2024','2023','2022',''].map(y=><option key={y} value={y}>{y||'All Years'}</option>)}
          </select>
          {isAdmin && (
            <select value={filterAgent} onChange={e=>setFilterAgent(e.target.value)} style={sel}>
              <option value="">All Agents</option>
              {agents.map(a=><option key={a.id} value={a.id}>{a.name.split(' ')[0]}</option>)}
            </select>
          )}
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..." style={{ ...sel, width:'130px' }}/>
          <button onClick={()=>setShowAdd(true)} style={btn}>+ Add Deal</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'8px', marginBottom:'12px' }}>
        {[
          ['Closed', closedDeals.length, '#225091'],
          ['Volume', fmt$(totalProd), '#16A34A'],
          ['Closed GCI', fmt$(totalGCI), '#CC2200'],
          ['Active', activeDeals.length, '#D97706'],
          ['Pending GCI', fmt$(pendingGCI), '#7C3AED'],
        ].map(([k,v,c])=>(
          <div key={k} style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'10px', padding:'11px 13px' }}>
            <div style={{ fontSize:'9px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.7px', marginBottom:'3px' }}>{k}</div>
            <div style={{ fontSize:'17px', fontWeight:900, color:c }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Board */}
      <div style={{ overflowX:'auto' }}>
        {GROUPS.map(grp => {
          const grpDeals = filtered.filter(d => grp.stages.includes(d.stage))
          const isOpen   = expanded[grp.id]
          const grpGCI   = grpDeals.reduce((s,d)=>s+(d.gci||0),0)
          return (
            <div key={grp.id} style={{ marginBottom:'10px', border:'1px solid var(--border)', borderRadius:'10px', overflow:'hidden' }}>
              <div onClick={()=>setExpanded(p=>({...p,[grp.id]:!p[grp.id]}))}
                style={{ display:'flex', alignItems:'center', gap:'10px', padding:'9px 14px', background:'var(--dim)', cursor:'pointer' }}>
                <span style={{ fontSize:'11px', color:'var(--muted)' }}>{isOpen?'▾':'▸'}</span>
                <span style={{ fontSize:'12px', fontWeight:800 }}>{grp.title}</span>
                <span style={{ fontSize:'11px', color:'var(--muted)', background:'var(--panel)', borderRadius:'99px', padding:'1px 9px' }}>{grpDeals.length}</span>
                {grpDeals.length>0 && <span style={{ fontSize:'11px', color:'var(--muted)' }}>GCI: <strong style={{ color:'#CC2200' }}>{fmt$(grpGCI)}</strong></span>}
              </div>
              {isOpen && (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:COLS_TMPL, background:'var(--dim)', borderBottom:'1px solid var(--border)', minWidth:'1600px' }}>
                    {COLS.map(c=>(
                      <div key={c.id} style={{ padding:'6px 8px', fontSize:'9px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.5px', borderRight:'1px solid var(--border)', whiteSpace:'nowrap' }}>{c.label}</div>
                    ))}
                  </div>
                  {grpDeals.length===0
                    ? <div style={{ padding:'14px', textAlign:'center', color:'var(--muted)', fontSize:'12px' }}>No deals</div>
                    : grpDeals.map((d,di)=>(
                      <div key={d.id} style={{ display:'grid', gridTemplateColumns:COLS_TMPL, borderBottom:'1px solid var(--border)', background:di%2?'rgba(0,0,0,.01)':'transparent', minWidth:'1600px' }}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'}
                        onMouseLeave={e=>e.currentTarget.style.background=di%2?'rgba(0,0,0,.01)':'transparent'}>
                        {/* Address */}
                        <div style={{ padding:'7px 8px', borderRight:'1px solid var(--border)', display:'flex', alignItems:'center', gap:'5px', minWidth:0 }}>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:'12px', fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.addr}</div>
                            {d.unit&&<div style={{ fontSize:'10px', color:'var(--muted)' }}>Unit {d.unit}</div>}
                          </div>
                          <button onClick={async()=>{if(!confirm('Delete?'))return;try{await remove(d.id);toast('Deleted')}catch(e){toast(e.message,'#DC2626')}}}
                            style={{ background:'none', border:'none', cursor:'pointer', color:'#DC2626', fontSize:'11px', opacity:.3, flexShrink:0 }}
                            onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.3'}>✕</button>
                        </div>
                        {/* Agent */}
                        <div style={{ padding:'5px 8px', borderRight:'1px solid var(--border)', display:'flex', alignItems:'center' }}>
                          <select value={d.agent_id||''} onChange={e=>updateField(d.id,'agent_id',e.target.value)}
                            style={{ background:'transparent', border:'none', color:'var(--text)', fontSize:'11px', fontFamily:'Inter,system-ui,sans-serif', cursor:'pointer', outline:'none', width:'100%' }}>
                            <option value="">—</option>
                            {agents.map(a=><option key={a.id} value={a.id}>{a.name.split(' ')[0]}</option>)}
                          </select>
                        </div>
                        {/* Production */}
                        <div style={{ padding:'5px 8px', borderRight:'1px solid var(--border)', display:'flex', alignItems:'center' }}>
                          <EditCell value={d.production} onChange={v=>updateField(d.id,'production',parseFloat(v)||0)} type="number" prefix="$"/>
                        </div>
                        {/* GCI */}
                        <div style={{ padding:'5px 8px', borderRight:'1px solid var(--border)', display:'flex', alignItems:'center' }}>
                          <EditCell value={d.gci} onChange={v=>updateField(d.id,'gci',parseFloat(v)||0)} type="number" prefix="$"/>
                        </div>
                        {/* Stage */}
                        <div style={{ padding:'5px 8px', borderRight:'1px solid var(--border)', display:'flex', alignItems:'center' }}>
                          <Pill value={d.stage} options={STAGES} onChange={v=>updateField(d.id,'stage',v)}/>
                        </div>
                        {/* Side */}
                        <div style={{ padding:'5px 8px', borderRight:'1px solid var(--border)', display:'flex', alignItems:'center' }}>
                          <Pill value={d.side} options={SIDES} onChange={v=>updateField(d.id,'side',v)}/>
                        </div>
                        {/* CTC */}
                        <div style={{ padding:'5px 8px', borderRight:'1px solid var(--border)', display:'flex', alignItems:'center' }}>
                          <Pill value={d.ctc} options={CTC_STAGES} onChange={v=>updateField(d.id,'ctc',v)}/>
                        </div>
                        {/* Command */}
                        <div style={{ padding:'5px 8px', borderRight:'1px solid var(--border)', display:'flex', alignItems:'center' }}>
                          <Pill value={d.command} options={CMD_STATUSES} onChange={v=>updateField(d.id,'command',v)}/>
                        </div>
                        {/* Sign */}
                        <div style={{ padding:'5px 8px', borderRight:'1px solid var(--border)', display:'flex', alignItems:'center' }}>
                          <Pill value={d.sign} options={SIGN_STATUSES} onChange={v=>updateField(d.id,'sign',v)}/>
                        </div>
                        {/* Comm Received */}
                        <div style={{ padding:'5px 8px', borderRight:'1px solid var(--border)', display:'flex', alignItems:'center' }}>
                          <Pill value={d.commission_received} options={COMMISSION_STATUSES} onChange={v=>updateField(d.id,'commission_received',v)}/>
                        </div>
                        {/* Comm Sent */}
                        <div style={{ padding:'5px 8px', borderRight:'1px solid var(--border)', display:'flex', alignItems:'center' }}>
                          <Pill value={d.agent_commission_sent} options={COMMISSION_STATUSES} onChange={v=>updateField(d.id,'agent_commission_sent',v)}/>
                        </div>
                        {/* Property Type */}
                        <div style={{ padding:'5px 8px', borderRight:'1px solid var(--border)', display:'flex', alignItems:'center' }}>
                          <select value={d.property_type||''} onChange={e=>updateField(d.id,'property_type',e.target.value)}
                            style={{ background:'transparent', border:'none', color:'var(--text)', fontSize:'11px', fontFamily:'Inter,system-ui,sans-serif', cursor:'pointer', outline:'none', width:'100%' }}>
                            <option value="">—</option>
                            {PROPERTY_TYPES.map(t=><option key={t}>{t}</option>)}
                          </select>
                        </div>
                        {/* AO Date */}
                        <div style={{ padding:'5px 8px', borderRight:'1px solid var(--border)', display:'flex', alignItems:'center' }}>
                          <input type="date" value={d.ao_date||''} onChange={e=>updateField(d.id,'ao_date',e.target.value)}
                            style={{ background:'transparent', border:'none', color:'var(--text)', fontSize:'11px', fontFamily:'Inter,system-ui,sans-serif', cursor:'pointer', outline:'none', width:'100%' }}/>
                        </div>
                        {/* Close Date */}
                        <div style={{ padding:'5px 8px', borderRight:'1px solid var(--border)', display:'flex', alignItems:'center' }}>
                          <input type="date" value={d.close_date||''} onChange={e=>updateField(d.id,'close_date',e.target.value)}
                            style={{ background:'transparent', border:'none', color:'var(--text)', fontSize:'11px', fontFamily:'Inter,system-ui,sans-serif', cursor:'pointer', outline:'none', width:'100%' }}/>
                        </div>
                        {/* Source */}
                        <div style={{ padding:'5px 8px', borderRight:'1px solid var(--border)', display:'flex', alignItems:'center' }}>
                          <select value={d.sales_source||''} onChange={e=>updateField(d.id,'sales_source',e.target.value)}
                            style={{ background:'transparent', border:'none', color:'var(--text)', fontSize:'11px', fontFamily:'Inter,system-ui,sans-serif', cursor:'pointer', outline:'none', width:'100%' }}>
                            <option value="">—</option>
                            {SOURCES.map(s=><option key={s}>{s}</option>)}
                          </select>
                        </div>
                        {/* Client */}
                        <div style={{ padding:'5px 8px', display:'flex', alignItems:'center' }}>
                          <EditCell value={d.client_name} onChange={v=>updateField(d.id,'client_name',v)} placeholder="Client name"/>
                        </div>
                      </div>
                    ))
                  }
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Add deal modal */}
      {showAdd && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999, padding:'16px' }}
          onClick={e=>{if(e.target===e.currentTarget)setShowAdd(false)}}>
          <div style={{ background:'var(--panel)', borderRadius:'16px', padding:'24px', width:'100%', maxWidth:'580px', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'18px' }}>
              <div style={{ fontSize:'16px', fontWeight:800 }}>Add Deal</div>
              <button onClick={()=>setShowAdd(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:'20px' }}>✕</button>
            </div>
            <F label="Address *" value={form.addr} onChange={v=>setForm(f=>({...f,addr:v}))} ph="47 Prairie Ave, Suffern NY"/>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px' }}>
              <div><label style={lbl}>Agent</label>
                <select value={form.agent_id} onChange={e=>setForm(f=>({...f,agent_id:e.target.value}))} style={{ ...sel, width:'100%' }}>
                  {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Stage</label>
                <select value={form.stage} onChange={e=>setForm(f=>({...f,stage:e.target.value}))} style={{ ...sel, width:'100%' }}>
                  {STAGES.map(s=><option key={s.label}>{s.label}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Side</label>
                <select value={form.side} onChange={e=>setForm(f=>({...f,side:e.target.value}))} style={{ ...sel, width:'100%' }}>
                  {SIDES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
              <F label="Production $" value={form.production} onChange={v=>setForm(f=>({...f,production:v}))} type="number" ph="599000"/>
              <F label="GCI $" value={form.gci} onChange={v=>setForm(f=>({...f,gci:v}))} type="number" ph="17970"/>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px' }}>
              <F label="A/O Date" value={form.ao_date} onChange={v=>setForm(f=>({...f,ao_date:v}))} type="date"/>
              <F label="Contract Date" value={form.contract_date} onChange={v=>setForm(f=>({...f,contract_date:v}))} type="date"/>
              <F label="Close Date" value={form.close_date} onChange={v=>setForm(f=>({...f,close_date:v}))} type="date"/>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
              <F label="Client Name" value={form.client_name} onChange={v=>setForm(f=>({...f,client_name:v}))} ph="John Smith"/>
              <F label="Client Phone" value={form.client_phone} onChange={v=>setForm(f=>({...f,client_phone:v}))} ph="(845) 555-1234"/>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
              <F label="Attorney" value={form.atty_name} onChange={v=>setForm(f=>({...f,atty_name:v}))} ph="Law office"/>
              <div><label style={lbl}>Source</label>
                <select value={form.sales_source} onChange={e=>setForm(f=>({...f,sales_source:e.target.value}))} style={{ ...sel, width:'100%' }}>
                  <option value="">Select...</option>
                  {SOURCES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display:'flex', gap:'8px', marginTop:'14px' }}>
              <button onClick={()=>setShowAdd(false)} style={{ flex:1, background:'var(--dim)', border:'1px solid var(--border)', borderRadius:'10px', color:'var(--text)', fontSize:'13px', fontWeight:600, padding:'12px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif' }}>Cancel</button>
              <button onClick={handleAdd} disabled={saving} style={{ flex:2, background:'#CC2200', border:'none', borderRadius:'10px', color:'#fff', fontSize:'13px', fontWeight:700, padding:'12px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif', opacity:saving?.7:1 }}>
                {saving?'Adding…':'Add Deal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function F({ label, value, onChange, ph='', type='text' }) {
  return (
    <div style={{ marginBottom:'10px' }}>
      {label && <label style={lbl}>{label}</label>}
      <input type={type} value={value||''} onChange={e=>onChange(e.target.value)} placeholder={ph}
        style={{ width:'100%', background:'var(--inp)', border:'1.5px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'12px', fontFamily:'Inter,system-ui,sans-serif', padding:'8px 10px', outline:'none', boxSizing:'border-box' }}/>
    </div>
  )
}
const sel = { background:'var(--inp)', border:'1.5px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'12px', fontFamily:'Inter,system-ui,sans-serif', padding:'8px 10px', outline:'none' }
const btn = { background:'#CC2200', border:'none', borderRadius:'8px', color:'#fff', fontSize:'12px', fontWeight:700, padding:'8px 14px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif' }
const lbl = { display:'block', fontSize:'9px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.7px', marginBottom:'4px' }
