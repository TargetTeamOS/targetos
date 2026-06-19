import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Card, Btn } from '../components/UI'
import { useConfirm } from '../components/ConfirmDialog'
import { AGENTS } from '../lib/constants'

const OUTCOMES = ['Answered','Voicemail','No Answer','Busy','Wrong Number','Callback Scheduled']
const OUTCOME_COLORS = { Answered:'#16A34A', Voicemail:'#D97706', 'No Answer':'#94A3B8', Busy:'#EF4444', 'Wrong Number':'#DC2626', 'Callback Scheduled':'#0EA5E9' }
const DIRECTIONS = ['Outbound','Inbound']

export function Calls() {
  const { state, toast } = useApp()
  const { confirm, ConfirmDialog } = useConfirm()
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ contact_name:'', phone:'', direction:'Outbound', outcome:'Answered', duration:'', agent_name:'', notes:'' })

  useEffect(() => { loadCalls() }, [])

  async function loadCalls() {
    setLoading(true)
    const { data } = await supabase.from('calls').select('*').order('called_at', { ascending: false }).limit(100)
    setCalls(data || [])
    setLoading(false)
  }

  async function logCall() {
    if(!form.contact_name.trim() && !form.phone.trim()) { toast('Name or phone required','#DC2626'); return }
    await supabase.from('calls').insert([{
      contact_name: form.contact_name.trim(),
      phone:        form.phone.trim(),
      direction:    form.direction,
      outcome:      form.outcome,
      duration:     form.duration,
      agent_name:   form.agent_name || state.currentAgent?.name,
      agent_id:     state.user?.id,
      called_at:    new Date().toISOString(),
    }])
    toast('✅ Call logged!')
    setForm({ contact_name:'', phone:'', direction:'Outbound', outcome:'Answered', duration:'', agent_name:'', notes:'' })
    setShowAdd(false)
    loadCalls()
  }

  async function deleteCall(id) {
    confirm({ title:'Delete Call?', message:'Remove this call record?', confirmLabel:'Delete', onConfirm: async () => {
      await supabase.from('calls').delete().eq('id', id)
      toast('Deleted'); loadCalls()
    }})
  }

  const filtered = calls.filter(c => !search || c.contact_name?.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search))
  const set = (k,v) => setForm(f=>({...f,[k]:v}))
  const today = new Date().toISOString().split('T')[0]
  const todayCalls = calls.filter(c => c.called_at?.startsWith(today))

  return (
    <div>
      <ConfirmDialog/>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'14px'}}>
        {[
          ['Today', todayCalls.length, '#CC2200'],
          ['Answered', calls.filter(c=>c.outcome==='Answered').length, '#16A34A'],
          ['Voicemail', calls.filter(c=>c.outcome==='Voicemail').length, '#D97706'],
          ['Total', calls.length, '#0EA5E9'],
        ].map(([k,v,c])=>(
          <div key={k} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',padding:'14px'}}>
            <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'5px'}}>{k}</div>
            <div style={{fontSize:'22px',fontWeight:900,color:c}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{display:'flex',gap:'8px',marginBottom:'12px',flexWrap:'wrap'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search calls..."
          style={{flex:1,minWidth:'200px',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 13px',outline:'none'}}/>
        <Btn size="sm" onClick={()=>setShowAdd(true)}>+ Log Call</Btn>
      </div>

      {/* Add form */}
      {showAdd && (
        <Card style={{padding:'16px',marginBottom:'12px'}}>
          <div style={{fontSize:'13px',fontWeight:700,marginBottom:'12px'}}>Log Call</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
            <FI label="Contact Name" value={form.contact_name} onChange={v=>set('contact_name',v)} ph="John Smith"/>
            <FI label="Phone" value={form.phone} onChange={v=>set('phone',v)} ph="(845) 555-1234" type="tel"/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'8px'}}>
            <div><label style={lbl}>Direction</label><select value={form.direction} onChange={e=>set('direction',e.target.value)} style={sel}>{DIRECTIONS.map(d=><option key={d}>{d}</option>)}</select></div>
            <div><label style={lbl}>Outcome</label><select value={form.outcome} onChange={e=>set('outcome',e.target.value)} style={sel}>{OUTCOMES.map(o=><option key={o}>{o}</option>)}</select></div>
            <FI label="Duration" value={form.duration} onChange={v=>set('duration',v)} ph="3:42"/>
            <div><label style={lbl}>Agent</label><select value={form.agent_name} onChange={e=>set('agent_name',e.target.value)} style={sel}><option value="">Select...</option>{AGENTS.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}</select></div>
          </div>
          <div style={{display:'flex',gap:'7px',justifyContent:'flex-end',marginTop:'8px'}}>
            <Btn variant="ghost" size="sm" onClick={()=>setShowAdd(false)}>Cancel</Btn>
            <Btn size="sm" onClick={logCall}>Log Call</Btn>
          </div>
        </Card>
      )}

      {/* Calls list */}
      <Card>
        {loading && <div style={{padding:'24px',textAlign:'center',color:'var(--muted)',fontSize:'12px'}}>Loading...</div>}
        {!loading && filtered.length===0 && <div style={{padding:'28px',textAlign:'center',color:'var(--muted)',fontSize:'13px'}}>No calls logged yet</div>}
        {filtered.map(call=>(
          <div key={call.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'12px 16px',borderBottom:'1px solid var(--border)'}}
            onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <div style={{width:36,height:36,borderRadius:'50%',background:(OUTCOME_COLORS[call.outcome]||'#94A3B8')+'15',border:'2px solid '+(OUTCOME_COLORS[call.outcome]||'#94A3B8'),display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px',flexShrink:0}}>
              {call.direction==='Inbound'?'📲':'📞'}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:'13px',fontWeight:700}}>{call.contact_name||'Unknown'}</div>
              <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>
                {call.phone&&<span>{call.phone} · </span>}
                {call.agent_name&&<span>{call.agent_name} · </span>}
                {call.duration&&<span>{call.duration} · </span>}
                <span style={{color:OUTCOME_COLORS[call.outcome]||'#94A3B8',fontWeight:600}}>{call.outcome}</span>
              </div>
            </div>
            <div style={{fontSize:'11px',color:'var(--muted)',flexShrink:0,textAlign:'right'}}>
              {call.called_at ? new Date(call.called_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : ''}
            </div>
            {call.phone && (
              <a href={'tel:'+call.phone.replace(/\D/g,'')} style={{textDecoration:'none'}}>
                <div style={{width:32,height:32,borderRadius:'50%',background:'rgba(16,185,129,.1)',border:'1px solid rgba(16,185,129,.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px',cursor:'pointer'}}>📞</div>
              </a>
            )}
            <button onClick={()=>deleteCall(call.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#DC2626',fontSize:'13px'}}>🗑</button>
          </div>
        ))}
      </Card>
    </div>
  )
}

function FI({ label, value, onChange, ph='', type='text' }) {
  return (
    <div style={{marginBottom:'8px'}}>
      <label style={lbl}>{label}</label>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} style={sel}/>
    </div>
  )
}
const lbl = { display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px' }
const sel = { width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 11px',outline:'none',boxSizing:'border-box' }
