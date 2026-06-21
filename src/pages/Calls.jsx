import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useCalls } from '../lib/hooks/useCalls'
import { useApp } from '../context/AppContext'
import { fmtDate } from '../lib/utils/format'

const OUTCOMES = ['Answered','Voicemail','No Answer','Wrong Number','Callback Scheduled']
const DIRECTIONS = ['Outbound','Inbound']
const EMPTY = { contact_name:'', phone:'', direction:'Outbound', outcome:'Answered', duration:'', notes:'', called_at: new Date().toISOString().split('T')[0] }

export function Calls() {
  const { agent } = useAuth()
  const { toast } = useApp()
  const { calls, loading, add, remove } = useCalls({ agentId: agent?.id })
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm]       = useState(EMPTY)
  const [saving, setSaving]   = useState(false)

  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  async function handleAdd() {
    if(!form.phone.trim()&&!form.contact_name.trim()) { toast('Name or phone required','#DC2626'); return }
    setSaving(true)
    try {
      await add({ ...form, agent_id: agent?.id, called_at: new Date().toISOString() })
      toast('✅ Call logged!'); setShowAdd(false); setForm(EMPTY)
    } catch(e) { toast('Error: '+e.message,'#DC2626') }
    finally { setSaving(false) }
  }

  const outcomeColors = { Answered:'#16A34A', Voicemail:'#0EA5E9', 'No Answer':'#94A3B8', 'Wrong Number':'#DC2626', 'Callback Scheduled':'#D97706' }

  const today = calls.filter(c=>c.called_at?.split('T')[0]===new Date().toISOString().split('T')[0]).length

  return (
    <div>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px',flexWrap:'wrap',gap:'8px' }}>
        <div>
          <div style={{ fontSize:'18px',fontWeight:900 }}>📞 Calls</div>
          <div style={{ fontSize:'12px',color:'var(--muted)',marginTop:'2px' }}>{today} today · {calls.length} total</div>
        </div>
        <button onClick={()=>setShowAdd(s=>!s)} style={btnStyle}>+ Log Call</button>
      </div>

      {/* Stats */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'8px',marginBottom:'14px' }}>
        {[['Today',today,'#CC2200'],['Answered',calls.filter(c=>c.outcome==='Answered').length,'#16A34A'],['Voicemail',calls.filter(c=>c.outcome==='Voicemail').length,'#0EA5E9'],['Callbacks',calls.filter(c=>c.outcome==='Callback Scheduled').length,'#D97706']].map(([k,v,c])=>(
          <div key={k} style={{ background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'10px',padding:'11px' }}>
            <div style={{ fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px' }}>{k}</div>
            <div style={{ fontSize:'18px',fontWeight:900,color:c }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Quick log form */}
      {showAdd&&(
        <div style={{ background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',padding:'16px',marginBottom:'14px' }}>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'8px',marginBottom:'8px' }}>
            <input value={form.contact_name} onChange={e=>set('contact_name',e.target.value)} placeholder="Contact name"
              style={inp}/>
            <input value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="(845) 555-1234"
              style={inp}/>
            <select value={form.direction} onChange={e=>set('direction',e.target.value)} style={inp}>
              {DIRECTIONS.map(d=><option key={d}>{d}</option>)}
            </select>
            <select value={form.outcome} onChange={e=>set('outcome',e.target.value)} style={inp}>
              {OUTCOMES.map(o=><option key={o}>{o}</option>)}
            </select>
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:'8px' }}>
            <input value={form.duration} onChange={e=>set('duration',e.target.value)} placeholder="Duration (e.g. 4m 30s)" style={inp}/>
            <input value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Notes..." style={inp}/>
            <button onClick={handleAdd} disabled={saving} style={{ ...btnStyle,opacity:saving?.7:1 }}>{saving?'Logging…':'Log Call'}</button>
          </div>
        </div>
      )}

      {loading && <div style={{ padding:'24px',textAlign:'center',color:'var(--muted)' }}>Loading...</div>}

      <div style={{ background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',overflow:'hidden' }}>
        {calls.length===0&&!loading&&<div style={{ padding:'32px',textAlign:'center',color:'var(--muted)',fontSize:'13px' }}><div style={{ fontSize:'28px',marginBottom:'8px' }}>📞</div>No calls logged yet</div>}
        {calls.map(c=>(
          <div key={c.id} style={{ display:'flex',alignItems:'center',gap:'12px',padding:'11px 16px',borderBottom:'1px solid var(--border)' }}>
            <div style={{ width:36,height:36,borderRadius:'50%',background:(outcomeColors[c.outcome]||'#94A3B8')+'15',border:`2px solid ${outcomeColors[c.outcome]||'#94A3B8'}40`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px',flexShrink:0 }}>
              {c.direction==='Inbound'?'📲':'📞'}
            </div>
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ fontSize:'13px',fontWeight:700 }}>{c.contact_name||c.phone}</div>
              <div style={{ fontSize:'11px',color:'var(--muted)',marginTop:'2px' }}>
                {c.phone&&c.contact_name&&<span>{c.phone} · </span>}
                <span style={{ color:outcomeColors[c.outcome]||'#94A3B8',fontWeight:600 }}>{c.outcome}</span>
                {c.duration&&<span> · {c.duration}</span>}
                {c.notes&&<span> · {c.notes}</span>}
              </div>
            </div>
            <div style={{ fontSize:'10px',color:'var(--muted)',flexShrink:0,whiteSpace:'nowrap' }}>{fmtDate(c.called_at)}</div>
            <button onClick={async()=>{try{await remove(c.id);toast('Deleted')}catch(e){toast(e.message,'#DC2626')}}}
              style={{ background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'13px',opacity:.4 }}
              onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.4'}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

const inp      = { width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'8px 10px',outline:'none',boxSizing:'border-box' }
const btnStyle = { background:'#CC2200',border:'none',borderRadius:'9px',color:'#fff',fontSize:'12px',fontWeight:700,padding:'9px 15px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }
