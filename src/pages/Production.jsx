import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useConfirm } from '../components/ConfirmDialog'
import { AGENTS } from '../lib/constants'

// ── CONSTANTS (from Monday.com board) ─────────────────────────
const STAGES = [
  { label:'Negotiations',     color:'#037f4c' },
  { label:'Offer Accapted',   color:'#00c875' },
  { label:'Under Shtar',      color:'#bb3354' },
  { label:'Under Contract',   color:'#757575' },
  { label:'Closed',           color:'#225091' },
  { label:'Deal Fell Through',color:'#ff007f' },
]

const CTC_STAGES = [
  { label:'Inspection scheduled', color:'#007eb5' },
  { label:'Mortgage process',     color:'#9d50dd' },
  { label:'Appraisal ordered',    color:'#579bfc' },
  { label:'Conditional Approval', color:'#cab641' },
  { label:'Clear to close',       color:'#00c875' },
  { label:'Closing scheduled',    color:'#ffcb00' },
  { label:'Issue',                color:'#fdab3d' },
  { label:'Canceled',             color:'#df2f4a' },
  { label:'Closed',               color:'#037f4c' },
]

const SIDES = [
  { label:'Buyer',       color:'#579bfc' },
  { label:'Listing',     color:'#fdab3d' },
  { label:'Dual',        color:'#00c875' },
  { label:'Dual  Buyer', color:'#cd9282' },
  { label:'Dual Listing',color:'#ffcb00' },
  { label:'Seller',      color:'#9d50dd' },
  { label:'Rental',      color:'#c4c4c4' },
  { label:'Flip',        color:'#cab641' },
]

const SALE_TYPES = ['On Market','Off Market','FSBO']

const PROPERTY_TYPES = ['Condo','Single Family','Multi Family','New Construction','Land','Co-Op','Summer Home','Commercial']

const SOURCES = ['Past Client Repeat','Past Client Referral','SOI','Referral','System Call','Social Media','Sign Call','Farm','Cold Calls','Sign','Zillow','Israel','Office Referral','Approached','Other']

const COMMISSION_STATUSES = [
  { label:'Working on it', color:'#fdab3d' },
  { label:'Done',          color:'#00c875' },
  { label:'Stuck',         color:'#df2f4a' },
]

const COMMAND_STATUSES = [
  { label:'Working on it',              color:'#fdab3d' },
  { label:'Done',                       color:'#00c875' },
  { label:'Stuck',                      color:'#df2f4a' },
  { label:'Waiting for approval',       color:'#007eb5' },
  { label:'No command',                 color:'#9d50dd' },
  { label:'Contact Info needed',        color:'#ff5ac4' },
  { label:'Reminder to sign 1',         color:'#7f5347' },
  { label:'Reminder to sign 2',         color:'#563e3e' },
  { label:'Sent - Waiting for lead',    color:'#ffcb00' },
  { label:"Doesn't Want To Sign",       color:'#ff007f' },
  { label:'Client has been notified',   color:'#784bd1' },
  { label:'Sent not signed',            color:'#ff6d3b' },
  { label:'Not Yet',                    color:'#cab641' },
]

const SIGN_STATUSES = [
  { label:'Under Contract Sent', color:'#007eb5' },
  { label:'Sold Sign Sent',      color:'#00c875' },
]

const GROUPS = [
  { id:'active',    title:'ACCEPTED OFFERS',      stages:['Offer Accapted'] },
  { id:'shtar',     title:'UNDER SHTAR',           stages:['Under Shtar'] },
  { id:'contract',  title:'UNDER CONTRACT',        stages:['Under Contract'] },
  { id:'sold26',    title:'Sold — 2026',            stages:['Closed'] },
  { id:'fell26',    title:'Deal Fell Through — 2026', stages:['Deal Fell Through'] },
]

const fmt$ = n => n ? '$' + Number(n||0).toLocaleString() : '—'
const fmtDate = d => d ? new Date(d+'T12:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'}) : '—'

const STAGE_COLOR = (s) => STAGES.find(x=>x.label===s)?.color || '#c4c4c4'
const SIDE_COLOR  = (s) => SIDES.find(x=>x.label===s)?.color || '#c4c4c4'
const CTC_COLOR   = (s) => CTC_STAGES.find(x=>x.label===s)?.color || '#c4c4c4'
const CMD_COLOR   = (s) => COMMAND_STATUSES.find(x=>x.label===s)?.color || '#c4c4c4'
const COM_COLOR   = (s) => COMMISSION_STATUSES.find(x=>x.label===s)?.color || '#c4c4c4'

// ── STATUS PILL ────────────────────────────────────────────────
function Pill({ value, options, onChange, small }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  const opt = options.find ? options.find(o=>(o.label||o)===value) : null
  const color = opt?.color || '#c4c4c4'
  useEffect(() => {
    const h = e => { if(ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  if(!onChange) return (
    <span style={{display:'inline-block',background:value?color+'20':'#f1f5f9',border:'1px solid '+(value?color+'40':'#e2e8f0'),borderRadius:'4px',padding:small?'2px 6px':'3px 9px',fontSize:small?'10px':'11px',fontWeight:600,color:value?color:'#94a3b8',whiteSpace:'nowrap'}}>
      {value||'—'}
    </span>
  )
  return (
    <div ref={ref} style={{position:'relative',display:'inline-block'}}>
      <div onClick={()=>setOpen(o=>!o)} style={{cursor:'pointer',background:value?color+'20':'#f1f5f9',border:'1px solid '+(value?color+'40':'#e2e8f0'),borderRadius:'4px',padding:small?'2px 6px':'3px 9px',fontSize:small?'10px':'11px',fontWeight:600,color:value?color:'#94a3b8',whiteSpace:'nowrap',userSelect:'none'}}>
        {value||'—'}
      </div>
      {open && (
        <div style={{position:'absolute',top:'100%',left:0,zIndex:100,background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'8px',boxShadow:'0 8px 24px rgba(0,0,0,.15)',minWidth:'160px',maxHeight:'240px',overflowY:'auto',marginTop:'2px'}}>
          {options.map(o => {
            const lbl = o.label||o; const clr = o.color||'#94a3b8'
            return (
              <div key={lbl} onClick={()=>{onChange(lbl);setOpen(false)}}
                style={{padding:'7px 12px',cursor:'pointer',display:'flex',alignItems:'center',gap:'8px',fontSize:'12px',fontWeight:600}}
                onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <div style={{width:10,height:10,borderRadius:'2px',background:clr,flexShrink:0}}/>
                {lbl}
              </div>
            )
          })}
          <div onClick={()=>{onChange('');setOpen(false)}} style={{padding:'7px 12px',cursor:'pointer',fontSize:'11px',color:'var(--muted)',borderTop:'1px solid var(--border)'}}
            onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            Clear
          </div>
        </div>
      )}
    </div>
  )
}

// ── EDITABLE CELL ──────────────────────────────────────────────
function EditCell({ value, onChange, type='text', prefix='', placeholder='—' }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value||'')
  const ref = useRef()
  useEffect(() => { if(editing) ref.current?.focus() }, [editing])
  if(!editing) return (
    <div onClick={()=>{setVal(value||'');setEditing(true)}} style={{cursor:'text',fontSize:'12px',color:value?'var(--text)':'var(--muted)',minWidth:'60px',padding:'1px 3px',borderRadius:'4px'}}
      onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
      {value ? (prefix + (type==='number' ? Number(value).toLocaleString() : value)) : placeholder}
    </div>
  )
  return (
    <input ref={ref} type={type} value={val} onChange={e=>setVal(e.target.value)}
      onBlur={()=>{onChange(val);setEditing(false)}}
      onKeyDown={e=>{if(e.key==='Enter'){onChange(val);setEditing(false)}if(e.key==='Escape')setEditing(false)}}
      style={{width:'100%',background:'var(--inp)',border:'1.5px solid #CC2200',borderRadius:'4px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'2px 6px',outline:'none'}}/>
  )
}

// ── MAIN COMPONENT ─────────────────────────────────────────────
export function Production() {
  const { state, toast } = useApp()
  const { confirm, ConfirmDialog } = useConfirm()
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [filterAgent, setFilterAgent] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [filterYear, setFilterYear] = useState('2026')
  const [expandedGroups, setExpandedGroups] = useState({ active:true, shtar:true, contract:true, sold26:true, fell26:false })
  const [colWidths] = useState({})
  const [form, setForm] = useState(defaultForm())

  useEffect(() => { loadDeals() }, [])

  function defaultForm() {
    return {
      addr:'', agent_name:'', side:'Buyer', stage:'Offer Accapted', prod:'', gci:'',
      ao_date:'', contract_date:'', close_date:'', property_type:'', sale_type:'On Market',
      source:'', client_name:'', client_phone:'', client_email:'', atty_name:'', atty_email:'',
      unit:'', ctc:'', command:'', sign:'', commission_received:'', agent_commission_sent:'',
      notes:'', referral_agent:''
    }
  }

  async function loadDeals() {
    setLoading(true)
    const { data } = await supabase.from('deals').select('*').order('ao_date', { ascending: false })
    if(data?.length) setDeals(data)
    else setDeals([])
    setLoading(false)
  }

  async function saveDeal(deal) {
    if(deal.id) {
      await supabase.from('deals').update({...deal, updated_at:new Date().toISOString()}).eq('id', deal.id)
    } else {
      const { data } = await supabase.from('deals').insert([deal]).select()
      return data?.[0]
    }
  }

  async function updateField(id, field, value) {
    setDeals(prev => prev.map(d => d.id===id ? {...d,[field]:value} : d))
    await supabase.from('deals').update({ [field]:value, updated_at:new Date().toISOString() }).eq('id', id)
  }

  async function addDeal() {
    if(!form.addr.trim()) { toast('Address required','#DC2626'); return }
    const payload = {
      addr: form.addr.trim(),
      agent_name: form.agent_name,
      side: form.side,
      stage: form.stage,
      prod: parseFloat(String(form.prod).replace(/[^0-9.]/g,''))||0,
      gci:  parseFloat(String(form.gci).replace(/[^0-9.]/g,''))||0,
      ao_date: form.ao_date||null,
      contract_date: form.contract_date||null,
      close_date: form.close_date||null,
      property_type: form.property_type,
      sale_type: form.sale_type,
      source: form.source,
      client_name: form.client_name,
      client_phone: form.client_phone,
      client_email: form.client_email,
      atty_name: form.atty_name,
      atty_email: form.atty_email,
      unit: form.unit,
      ctc: form.ctc,
      command: form.command,
      sign: form.sign,
      commission_received: form.commission_received,
      agent_commission_sent: form.agent_commission_sent,
      notes: form.notes,
      referral_agent: form.referral_agent,
    }
    const saved = await saveDeal(payload)
    toast('✅ Deal added!')
    setShowAdd(false)
    setForm(defaultForm())
    loadDeals()
  }

  async function deleteDeal(id) {
    const d = deals.find(x=>x.id===id)
    confirm({ title:'Delete Deal?', message:`Delete "${d?.addr}"?`, confirmLabel:'Delete', onConfirm:async()=>{
      await supabase.from('deals').delete().eq('id',id)
      setDeals(prev=>prev.filter(x=>x.id!==id))
      toast('Deleted')
    }})
  }

  // Filter deals
  const filtered = deals.filter(d => {
    if(search && !d.addr?.toLowerCase().includes(search.toLowerCase()) && !(d.agent_name||'').toLowerCase().includes(search.toLowerCase()) && !(d.client_name||'').toLowerCase().includes(search.toLowerCase())) return false
    if(filterAgent && d.agent_name !== filterAgent) return false
    if(filterStage && d.stage !== filterStage) return false
    if(filterYear && d.ao_date && !d.ao_date.startsWith(filterYear) && !d.close_date?.startsWith(filterYear)) return false
    return true
  })

  // Group deals
  const groupedDeals = {
    active:   filtered.filter(d=>d.stage==='Offer Accapted'),
    shtar:    filtered.filter(d=>d.stage==='Under Shtar'),
    contract: filtered.filter(d=>d.stage==='Under Contract'),
    sold26:   filtered.filter(d=>d.stage==='Closed' && (d.close_date||d.ao_date||'').startsWith(filterYear)),
    fell26:   filtered.filter(d=>d.stage==='Deal Fell Through'),
  }

  // Stats
  const totalGCI    = filtered.filter(d=>d.stage==='Closed').reduce((s,d)=>s+(d.gci||0),0)
  const totalProd   = filtered.filter(d=>d.stage==='Closed').reduce((s,d)=>s+(d.prod||0),0)
  const totalDeals  = filtered.filter(d=>d.stage==='Closed').length
  const activeDeals = filtered.filter(d=>['Offer Accapted','Under Shtar','Under Contract'].includes(d.stage)).length
  const pendingGCI  = filtered.filter(d=>['Offer Accapted','Under Shtar','Under Contract'].includes(d.stage)).reduce((s,d)=>s+(d.gci||0),0)

  const agentStats = AGENTS.map(a => {
    const agentDeals = filtered.filter(d=>(d.agent_name||'').includes(a.name.split(' ')[0]) && d.stage==='Closed')
    return { ...a, gci: agentDeals.reduce((s,d)=>s+(d.gci||0),0), count: agentDeals.length }
  }).filter(a=>a.count>0).sort((a,b)=>b.gci-a.gci)

  if(loading) return (
    <div style={{padding:'40px',textAlign:'center',color:'var(--muted)',fontSize:'13px'}}>
      <div style={{fontSize:'32px',marginBottom:'12px'}}>⏳</div>Loading production board...
    </div>
  )

  return (
    <div style={{fontFamily:'Inter,system-ui,sans-serif'}}>
      <ConfirmDialog/>

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px',flexWrap:'wrap',gap:'8px'}}>
        <div>
          <div style={{fontSize:'18px',fontWeight:900}}>📊 Production Board</div>
          <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>{filtered.length} deals · {activeDeals} active</div>
        </div>
        <div style={{display:'flex',gap:'7px',flexWrap:'wrap',alignItems:'center'}}>
          {/* Year filter */}
          <select value={filterYear} onChange={e=>setFilterYear(e.target.value)} style={selStyle}>
            {['2026','2025','2024','2023','2022','All'].map(y=><option key={y} value={y==='All'?'':y}>{y}</option>)}
          </select>
          {/* Agent filter */}
          <select value={filterAgent} onChange={e=>setFilterAgent(e.target.value)} style={selStyle}>
            <option value="">All Agents</option>
            {AGENTS.map(a=><option key={a.id} value={a.name}>{a.name.split(' ')[0]}</option>)}
          </select>
          {/* Stage filter */}
          <select value={filterStage} onChange={e=>setFilterStage(e.target.value)} style={selStyle}>
            <option value="">All Stages</option>
            {STAGES.map(s=><option key={s.label} value={s.label}>{s.label}</option>)}
          </select>
          {/* Search */}
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search deals..."
            style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'7px 11px',outline:'none',width:'160px'}}/>
          <button onClick={()=>setShowAdd(true)}
            style={{background:'#CC2200',border:'none',borderRadius:'8px',color:'#fff',fontSize:'12px',fontWeight:700,padding:'8px 16px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>
            + Add Deal
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'8px',marginBottom:'14px'}}>
        {[
          ['Closed Deals', totalDeals, '#225091'],
          ['Total Volume', fmt$(totalProd), '#16A34A'],
          ['Closed GCI', fmt$(totalGCI), '#CC2200'],
          ['Active Pipeline', activeDeals, '#D97706'],
          ['Pending GCI', fmt$(pendingGCI), '#7C3AED'],
        ].map(([k,v,c])=>(
          <div key={k} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'10px',padding:'12px 14px'}}>
            <div style={{fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px'}}>{k}</div>
            <div style={{fontSize:'18px',fontWeight:900,color:c}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Agent leaderboard */}
      {agentStats.length > 0 && (
        <div style={{display:'flex',gap:'6px',marginBottom:'14px',flexWrap:'wrap'}}>
          {agentStats.map((a,i)=>(
            <div key={a.id} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'8px',padding:'7px 12px',display:'flex',alignItems:'center',gap:'7px'}}>
              <div style={{width:6,height:6,borderRadius:'50%',background:a.color,flexShrink:0}}/>
              <span style={{fontSize:'11px',fontWeight:700}}>{a.name.split(' ')[0]}</span>
              <span style={{fontSize:'11px',color:'#CC2200',fontWeight:700}}>{fmt$(a.gci)}</span>
              <span style={{fontSize:'10px',color:'var(--muted)'}}>({a.count})</span>
            </div>
          ))}
        </div>
      )}

      {/* Board — groups */}
      {Object.entries(groupedDeals).map(([groupId, groupDeals]) => {
        const group = GROUPS.find(g=>g.id===groupId) || { title:groupId }
        const isOpen = expandedGroups[groupId]
        const groupGCI  = groupDeals.reduce((s,d)=>s+(d.gci||0),0)
        const groupProd = groupDeals.reduce((s,d)=>s+(d.prod||0),0)
        return (
          <div key={groupId} style={{marginBottom:'10px',borderRadius:'10px',overflow:'hidden',border:'1px solid var(--border)'}}>
            {/* Group header */}
            <div onClick={()=>setExpandedGroups(p=>({...p,[groupId]:!p[groupId]}))}
              style={{display:'flex',alignItems:'center',gap:'10px',padding:'9px 14px',background:'var(--dim)',cursor:'pointer',borderBottom:isOpen?'1px solid var(--border)':'none'}}>
              <span style={{fontSize:'11px',color:'var(--muted)'}}>{isOpen?'▾':'▸'}</span>
              <span style={{fontSize:'12px',fontWeight:800}}>{group.title}</span>
              <span style={{fontSize:'11px',color:'var(--muted)',background:'var(--panel)',borderRadius:'99px',padding:'1px 9px'}}>{groupDeals.length}</span>
              {groupDeals.length > 0 && (
                <>
                  <span style={{fontSize:'11px',color:'var(--muted)',marginLeft:'4px'}}>Vol: <strong style={{color:'var(--text)'}}>{fmt$(groupProd)}</strong></span>
                  <span style={{fontSize:'11px',color:'var(--muted)'}}>GCI: <strong style={{color:'#CC2200'}}>{fmt$(groupGCI)}</strong></span>
                </>
              )}
            </div>

            {/* Column headers */}
            {isOpen && (
              <>
                <div style={{display:'grid',gridTemplateColumns:COLS_TEMPLATE,background:'var(--dim)',borderBottom:'1px solid var(--border)'}}>
                  {COLUMNS.map(col=>(
                    <div key={col.id} style={{padding:'7px 8px',fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px',borderRight:'1px solid var(--border)',whiteSpace:'nowrap',overflow:'hidden'}}>
                      {col.label}
                    </div>
                  ))}
                </div>

                {/* Rows */}
                {groupDeals.length === 0 && (
                  <div style={{padding:'16px',textAlign:'center',color:'var(--muted)',fontSize:'12px'}}>No deals in this group</div>
                )}
                {groupDeals.map((deal,di) => (
                  <div key={deal.id} style={{display:'grid',gridTemplateColumns:COLS_TEMPLATE,borderBottom:'1px solid var(--border)',background:di%2===0?'transparent':'rgba(0,0,0,.01)'}}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'}
                    onMouseLeave={e=>e.currentTarget.style.background=di%2===0?'transparent':'rgba(0,0,0,.01)'}>

                    {/* Address */}
                    <div style={{padding:'7px 8px',borderRight:'1px solid var(--border)',display:'flex',alignItems:'center',gap:'6px',minWidth:0}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:'12px',fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{deal.addr}</div>
                        {deal.unit && <div style={{fontSize:'10px',color:'var(--muted)'}}>Unit: {deal.unit}</div>}
                      </div>
                      <button onClick={()=>deleteDeal(deal.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#DC2626',fontSize:'12px',opacity:.4,flexShrink:0,padding:'0 2px'}}
                        onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.4'}>✕</button>
                    </div>

                    {/* Agent */}
                    <div style={{padding:'5px 8px',borderRight:'1px solid var(--border)',display:'flex',alignItems:'center'}}>
                      <select value={deal.agent_name||''} onChange={e=>updateField(deal.id,'agent_name',e.target.value)}
                        style={{background:'transparent',border:'none',color:'var(--text)',fontSize:'11px',fontFamily:'Inter,system-ui,sans-serif',cursor:'pointer',outline:'none',width:'100%'}}>
                        <option value="">—</option>
                        {AGENTS.map(a=><option key={a.id} value={a.name}>{a.name.split(' ')[0]}</option>)}
                      </select>
                    </div>

                    {/* Production $ */}
                    <div style={{padding:'5px 8px',borderRight:'1px solid var(--border)',display:'flex',alignItems:'center'}}>
                      <EditCell value={deal.prod} onChange={v=>updateField(deal.id,'prod',parseFloat(v)||0)} type="number" prefix="$" placeholder="$0"/>
                    </div>

                    {/* GCI $ */}
                    <div style={{padding:'5px 8px',borderRight:'1px solid var(--border)',display:'flex',alignItems:'center'}}>
                      <EditCell value={deal.gci} onChange={v=>updateField(deal.id,'gci',parseFloat(v)||0)} type="number" prefix="$" placeholder="$0"/>
                    </div>

                    {/* Stage */}
                    <div style={{padding:'5px 8px',borderRight:'1px solid var(--border)',display:'flex',alignItems:'center'}}>
                      <Pill value={deal.stage} options={STAGES} onChange={v=>updateField(deal.id,'stage',v)} small/>
                    </div>

                    {/* Side */}
                    <div style={{padding:'5px 8px',borderRight:'1px solid var(--border)',display:'flex',alignItems:'center'}}>
                      <Pill value={deal.side} options={SIDES} onChange={v=>updateField(deal.id,'side',v)} small/>
                    </div>

                    {/* CTC */}
                    <div style={{padding:'5px 8px',borderRight:'1px solid var(--border)',display:'flex',alignItems:'center'}}>
                      <Pill value={deal.ctc} options={CTC_STAGES} onChange={v=>updateField(deal.id,'ctc',v)} small/>
                    </div>

                    {/* Command */}
                    <div style={{padding:'5px 8px',borderRight:'1px solid var(--border)',display:'flex',alignItems:'center'}}>
                      <Pill value={deal.command} options={COMMAND_STATUSES} onChange={v=>updateField(deal.id,'command',v)} small/>
                    </div>

                    {/* Sign */}
                    <div style={{padding:'5px 8px',borderRight:'1px solid var(--border)',display:'flex',alignItems:'center'}}>
                      <Pill value={deal.sign} options={SIGN_STATUSES} onChange={v=>updateField(deal.id,'sign',v)} small/>
                    </div>

                    {/* Commission Received */}
                    <div style={{padding:'5px 8px',borderRight:'1px solid var(--border)',display:'flex',alignItems:'center'}}>
                      <Pill value={deal.commission_received} options={COMMISSION_STATUSES} onChange={v=>updateField(deal.id,'commission_received',v)} small/>
                    </div>

                    {/* Commission Sent */}
                    <div style={{padding:'5px 8px',borderRight:'1px solid var(--border)',display:'flex',alignItems:'center'}}>
                      <Pill value={deal.agent_commission_sent} options={COMMISSION_STATUSES} onChange={v=>updateField(deal.id,'agent_commission_sent',v)} small/>
                    </div>

                    {/* Sale Type */}
                    <div style={{padding:'5px 8px',borderRight:'1px solid var(--border)',display:'flex',alignItems:'center'}}>
                      <select value={deal.sale_type||''} onChange={e=>updateField(deal.id,'sale_type',e.target.value)}
                        style={{background:'transparent',border:'none',color:'var(--text)',fontSize:'11px',fontFamily:'Inter,system-ui,sans-serif',cursor:'pointer',outline:'none',width:'100%'}}>
                        <option value="">—</option>
                        {SALE_TYPES.map(s=><option key={s}>{s}</option>)}
                      </select>
                    </div>

                    {/* Property Type */}
                    <div style={{padding:'5px 8px',borderRight:'1px solid var(--border)',display:'flex',alignItems:'center'}}>
                      <select value={deal.property_type||''} onChange={e=>updateField(deal.id,'property_type',e.target.value)}
                        style={{background:'transparent',border:'none',color:'var(--text)',fontSize:'11px',fontFamily:'Inter,system-ui,sans-serif',cursor:'pointer',outline:'none',width:'100%'}}>
                        <option value="">—</option>
                        {PROPERTY_TYPES.map(s=><option key={s}>{s}</option>)}
                      </select>
                    </div>

                    {/* AO Date */}
                    <div style={{padding:'5px 8px',borderRight:'1px solid var(--border)',display:'flex',alignItems:'center'}}>
                      <input type="date" value={deal.ao_date||''} onChange={e=>updateField(deal.id,'ao_date',e.target.value)}
                        style={{background:'transparent',border:'none',color:'var(--text)',fontSize:'11px',fontFamily:'Inter,system-ui,sans-serif',cursor:'pointer',outline:'none',width:'100%'}}/>
                    </div>

                    {/* Close Date */}
                    <div style={{padding:'5px 8px',borderRight:'1px solid var(--border)',display:'flex',alignItems:'center'}}>
                      <input type="date" value={deal.close_date||''} onChange={e=>updateField(deal.id,'close_date',e.target.value)}
                        style={{background:'transparent',border:'none',color:'var(--text)',fontSize:'11px',fontFamily:'Inter,system-ui,sans-serif',cursor:'pointer',outline:'none',width:'100%'}}/>
                    </div>

                    {/* Source */}
                    <div style={{padding:'5px 8px',borderRight:'1px solid var(--border)',display:'flex',alignItems:'center'}}>
                      <select value={deal.source||''} onChange={e=>updateField(deal.id,'source',e.target.value)}
                        style={{background:'transparent',border:'none',color:'var(--text)',fontSize:'11px',fontFamily:'Inter,system-ui,sans-serif',cursor:'pointer',outline:'none',width:'100%'}}>
                        <option value="">—</option>
                        {SOURCES.map(s=><option key={s}>{s}</option>)}
                      </select>
                    </div>

                    {/* Client */}
                    <div style={{padding:'5px 8px',display:'flex',alignItems:'center'}}>
                      <EditCell value={deal.client_name} onChange={v=>updateField(deal.id,'client_name',v)} placeholder="Client name"/>
                    </div>

                  </div>
                ))}
              </>
            )}
          </div>
        )
      })}

      {/* ADD DEAL MODAL */}
      {showAdd && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,padding:'16px'}}
          onClick={e=>{if(e.target===e.currentTarget)setShowAdd(false)}}>
          <div style={{background:'var(--panel)',borderRadius:'16px',padding:'24px',width:'100%',maxWidth:'640px',maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'18px'}}>
              <div style={{fontSize:'16px',fontWeight:800}}>Add Deal</div>
              <button onClick={()=>setShowAdd(false)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'20px'}}>✕</button>
            </div>

            <FI label="Property Address *" value={form.addr} onChange={v=>setForm(f=>({...f,addr:v}))} ph="47 Prairie Ave, Suffern NY 10901"/>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px'}}>
              <div><label style={lbl}>Agent</label>
                <select value={form.agent_name} onChange={e=>setForm(f=>({...f,agent_name:e.target.value}))} style={{...selStyle,width:'100%'}}>
                  <option value="">Select...</option>
                  {AGENTS.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Stage</label>
                <select value={form.stage} onChange={e=>setForm(f=>({...f,stage:e.target.value}))} style={{...selStyle,width:'100%'}}>
                  {STAGES.map(s=><option key={s.label}>{s.label}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Side</label>
                <select value={form.side} onChange={e=>setForm(f=>({...f,side:e.target.value}))} style={{...selStyle,width:'100%'}}>
                  {SIDES.map(s=><option key={s.label}>{s.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
              <FI label="Production $" value={form.prod} onChange={v=>setForm(f=>({...f,prod:v}))} type="number" ph="599000"/>
              <FI label="GCI $" value={form.gci} onChange={v=>setForm(f=>({...f,gci:v}))} type="number" ph="11980"/>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px'}}>
              <FI label="A/O Date" value={form.ao_date} onChange={v=>setForm(f=>({...f,ao_date:v}))} type="date"/>
              <FI label="Contract Date" value={form.contract_date} onChange={v=>setForm(f=>({...f,contract_date:v}))} type="date"/>
              <FI label="Close Date" value={form.close_date} onChange={v=>setForm(f=>({...f,close_date:v}))} type="date"/>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px'}}>
              <div><label style={lbl}>Property Type</label>
                <select value={form.property_type} onChange={e=>setForm(f=>({...f,property_type:e.target.value}))} style={{...selStyle,width:'100%'}}>
                  <option value="">Select...</option>
                  {PROPERTY_TYPES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Sale Type</label>
                <select value={form.sale_type} onChange={e=>setForm(f=>({...f,sale_type:e.target.value}))} style={{...selStyle,width:'100%'}}>
                  {SALE_TYPES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Source</label>
                <select value={form.source} onChange={e=>setForm(f=>({...f,source:e.target.value}))} style={{...selStyle,width:'100%'}}>
                  <option value="">Select...</option>
                  {SOURCES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px'}}>
              <FI label="Client Name" value={form.client_name} onChange={v=>setForm(f=>({...f,client_name:v}))} ph="John Smith"/>
              <FI label="Client Phone" value={form.client_phone} onChange={v=>setForm(f=>({...f,client_phone:v}))} ph="(845) 555-1234"/>
              <FI label="Client Email" value={form.client_email} onChange={v=>setForm(f=>({...f,client_email:v}))} ph="client@email.com"/>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
              <FI label="Attorney Name" value={form.atty_name} onChange={v=>setForm(f=>({...f,atty_name:v}))} ph="Law office"/>
              <FI label="Attorney Email" value={form.atty_email} onChange={v=>setForm(f=>({...f,atty_email:v}))} ph="atty@law.com"/>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px'}}>
              <div><label style={lbl}>CTC Stage</label>
                <select value={form.ctc} onChange={e=>setForm(f=>({...f,ctc:e.target.value}))} style={{...selStyle,width:'100%'}}>
                  <option value="">—</option>
                  {CTC_STAGES.map(s=><option key={s.label}>{s.label}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Sign</label>
                <select value={form.sign} onChange={e=>setForm(f=>({...f,sign:e.target.value}))} style={{...selStyle,width:'100%'}}>
                  <option value="">—</option>
                  {SIGN_STATUSES.map(s=><option key={s.label}>{s.label}</option>)}
                </select>
              </div>
              <FI label="Unit" value={form.unit} onChange={v=>setForm(f=>({...f,unit:v}))} ph="Unit #"/>
            </div>

            <div style={{display:'flex',gap:'8px',marginTop:'16px'}}>
              <button onClick={()=>setShowAdd(false)} style={{flex:1,background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'10px',color:'var(--text)',fontSize:'13px',fontWeight:600,padding:'12px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>Cancel</button>
              <button onClick={addDeal} style={{flex:2,background:'#CC2200',border:'none',borderRadius:'10px',color:'#fff',fontSize:'13px',fontWeight:700,padding:'12px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>Add Deal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Column definitions
const COLUMNS = [
  { id:'addr',                  label:'Address',          width:'220px' },
  { id:'agent_name',            label:'Agent',            width:'90px'  },
  { id:'prod',                  label:'Production $',     width:'95px'  },
  { id:'gci',                   label:'GCI $',            width:'85px'  },
  { id:'stage',                 label:'Stage',            width:'120px' },
  { id:'side',                  label:'Side',             width:'100px' },
  { id:'ctc',                   label:'CTC',              width:'130px' },
  { id:'command',               label:'Command',          width:'120px' },
  { id:'sign',                  label:'Sign',             width:'110px' },
  { id:'commission_received',   label:'Comm. Recv',       width:'90px'  },
  { id:'agent_commission_sent', label:'Comm. Sent',       width:'90px'  },
  { id:'sale_type',             label:'Sale Type',        width:'90px'  },
  { id:'property_type',         label:'Prop. Type',       width:'100px' },
  { id:'ao_date',               label:'A/O Date',         width:'100px' },
  { id:'close_date',            label:'Close Date',       width:'100px' },
  { id:'source',                label:'Source',           width:'120px' },
  { id:'client_name',           label:'Client',           width:'120px' },
]

const COLS_TEMPLATE = COLUMNS.map(c=>c.width).join(' ')

function FI({ label, value, onChange, ph='', type='text' }) {
  return (
    <div style={{marginBottom:'10px'}}>
      {label && <label style={lbl}>{label}</label>}
      <input type={type} value={value||''} onChange={e=>onChange(e.target.value)} placeholder={ph}
        style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'8px 10px',outline:'none',boxSizing:'border-box'}}/>
    </div>
  )
}

const lbl = { display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px' }
const selStyle = { background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'8px 10px',outline:'none' }
