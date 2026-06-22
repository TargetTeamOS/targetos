import React, { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTransactions } from '../lib/hooks/useTransactions'
import { useAgents } from '../lib/hooks/useAgents'
import { useApp } from '../context/AppContext'
import { fmt$, fmtDate } from '../lib/utils/format'

const CTC_STAGES  = ['Offer Accapted','Under Shtar','Under Contract','Inspection scheduled','Mortgage process','Appraisal ordered','Conditional Approval','Clear to close','Closing scheduled','Closed']
const CTC_COLORS  = {'Offer Accapted':'#D97706','Under Shtar':'#bb3354','Under Contract':'#2563EB','Inspection scheduled':'#0EA5E9','Mortgage process':'#7C3AED','Appraisal ordered':'#8B5CF6','Conditional Approval':'#F59E0B','Clear to close':'#10B981','Closing scheduled':'#16A34A','Closed':'#059669'}
const EMPTY = { addr:'', agent_id:'', side:'Buyer', price:'', gci:'', ctc:'Offer Accapted', ao_date:'', close_date:'', client_name:'', atty:'', mtg:'', title_co:'', notes:'' }

export function Transactions() {
  const { agent, isAdmin } = useAuth()
  const { toast } = useApp()
  const { agents } = useAgents()
  const { transactions: all, loading, add, update, remove } = useTransactions()
  const [filter, setFilter] = useState('Active')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm]     = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const transactions = filter === 'All' ? all : all.filter(t => filter==='Active' ? t.status!=='Closed' : t.status==='Closed')
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  async function handleAdd() {
    if(!form.addr.trim()) { toast('Address required','#DC2626'); return }
    setSaving(true)
    try {
      await add({ ...form, agent_id: form.agent_id||agent?.id, price: parseFloat(form.price)||0, gci: parseFloat(form.gci)||0, status:'Active' })
      toast('✅ Transaction added!'); setShowAdd(false); setForm(EMPTY)
    } catch(e) { toast('Error: '+e.message,'#DC2626') }
    finally { setSaving(false) }
  }

  async function updateCTC(id, ctc) {
    try { await update(id, { ctc }); toast(`→ ${ctc}`) }
    catch(e) { toast('Error: '+e.message,'#DC2626') }
  }

  async function markClosed(id) {
    try { await update(id, { ctc:'Closed', status:'Closed' }); toast('🎉 Closed!') }
    catch(e) { toast('Error: '+e.message,'#DC2626') }
  }

  return (
    <div>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px',flexWrap:'wrap',gap:'8px' }}>
        <div style={{ fontSize:'18px',fontWeight:900 }}>📋 Transactions</div>
        <div style={{ display:'flex',gap:'7px' }}>
          <div style={{ display:'flex',background:'var(--dim)',borderRadius:'8px',padding:'3px',gap:'2px' }}>
            {['Active','Closed','All'].map(f=>(
              <button key={f} onClick={()=>setFilter(f)} style={{ padding:'6px 12px',borderRadius:'6px',border:'none',cursor:'pointer',fontSize:'11px',fontWeight:600,fontFamily:'Inter,system-ui,sans-serif',background:filter===f?'var(--panel)':'transparent',color:filter===f?'var(--text)':'var(--muted)' }}>{f}</button>
            ))}
          </div>
          <button onClick={()=>setShowAdd(true)} style={btnStyle}>+ Add Transaction</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'8px',marginBottom:'14px' }}>
        {[['Active',all.filter(t=>t.status!=='Closed').length,'#CC2200'],['Under Contract',all.filter(t=>t.ctc==='Under Contract').length,'#2563EB'],['Clear to Close',all.filter(t=>t.ctc==='Clear to close').length,'#10B981'],['GCI',fmt$(all.reduce((s,t)=>s+(t.gci||0),0)),'#D97706']].map(([k,v,c])=>(
          <div key={k} style={{ background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'10px',padding:'12px' }}>
            <div style={{ fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px' }}>{k}</div>
            <div style={{ fontSize:'18px',fontWeight:900,color:c }}>{v}</div>
          </div>
        ))}
      </div>

      {loading ? <div style={{ padding:'28px',textAlign:'center',color:'var(--muted)' }}>Loading...</div>
      : transactions.length===0 ? <div style={{ padding:'48px',textAlign:'center',color:'var(--muted)',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px' }}>No transactions</div>
      : transactions.map(t=>(
        <div key={t.id} style={{ background:'var(--panel)',border:`1px solid var(--border)`,borderLeft:`4px solid ${CTC_COLORS[t.ctc]||'#CC2200'}`,borderRadius:'14px',padding:'16px',marginBottom:'10px' }}>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'8px',marginBottom:'12px' }}>
            <div>
              <div style={{ fontSize:'15px',fontWeight:800 }}>{t.addr}</div>
              <div style={{ fontSize:'12px',color:'var(--muted)',marginTop:'2px' }}>
                {agents.find(a=>a.id===t.agent_id)?.name||'—'} · {t.side}
                {t.close_date&&<span style={{ color:'#16A34A',fontWeight:600 }}> · Close: {fmtDate(t.close_date)}</span>}
              </div>
            </div>
            <div style={{ display:'flex',gap:'8px',alignItems:'center' }}>
              {t.price&&<span style={{ fontSize:'13px',fontWeight:800,color:'#D97706' }}>{fmt$(t.price)}</span>}
              {t.gci&&<span style={{ fontSize:'12px',color:'#16A34A',fontWeight:700 }}>GCI: {fmt$(t.gci)}</span>}
            </div>
          </div>
          {/* CTC Pills */}
          <div style={{ display:'flex',gap:'5px',flexWrap:'wrap',marginBottom:'12px' }}>
            {CTC_STAGES.map(stage=>(
              <button key={stage} onClick={()=>updateCTC(t.id,stage)}
                style={{ padding:'4px 10px',borderRadius:'20px',border:`1.5px solid ${t.ctc===stage?(CTC_COLORS[stage]||'#CC2200'):'var(--border)'}`,background:t.ctc===stage?(CTC_COLORS[stage]||'#CC2200')+'15':'transparent',color:t.ctc===stage?(CTC_COLORS[stage]||'#CC2200'):'var(--muted)',fontSize:'10px',fontWeight:700,cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }}>
                {stage}
              </button>
            ))}
          </div>
          {/* Contacts */}
          <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'8px',marginBottom:'10px' }}>
            {[['Attorney',t.atty],['Mortgage',t.mtg],['Title Co.',t.title_co]].map(([k,v])=>(
              <div key={k} style={{ background:'var(--dim)',borderRadius:'8px',padding:'7px 10px' }}>
                <div style={{ fontSize:'9px',color:'var(--muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',marginBottom:'2px' }}>{k}</div>
                <div style={{ fontSize:'12px',fontWeight:600 }}>{v||'—'}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'flex',gap:'6px',justifyContent:'flex-end' }}>
            {t.status!=='Closed'&&<button onClick={()=>markClosed(t.id)} style={{ background:'rgba(22,163,74,.1)',border:'1px solid rgba(22,163,74,.3)',borderRadius:'7px',color:'#16A34A',fontSize:'11px',fontWeight:700,padding:'5px 12px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }}>🎉 Mark Closed</button>}
            <button onClick={async()=>{if(!confirm('Delete?'))return;try{await remove(t.id);toast('Deleted')}catch(e){toast(e.message,'#DC2626')}}}
              style={{ background:'none',border:'1px solid var(--border)',borderRadius:'7px',color:'#DC2626',fontSize:'11px',padding:'5px 10px',cursor:'pointer' }}>🗑</button>
          </div>
        </div>
      ))}

      {showAdd&&(
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,padding:'16px' }} onClick={e=>{if(e.target===e.currentTarget)setShowAdd(false)}}>
          <div style={{ background:'var(--panel)',borderRadius:'16px',padding:'24px',width:'100%',maxWidth:'520px',maxHeight:'90vh',overflowY:'auto' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'18px' }}>
              <div style={{ fontSize:'16px',fontWeight:800 }}>Add Transaction</div>
              <button onClick={()=>setShowAdd(false)} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'20px' }}>✕</button>
            </div>
            <F label="Address *" value={form.addr} onChange={v=>set('addr',v)} ph="47 Prairie Ave"/>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px' }}>
              <div><label style={lbl}>Agent</label><select value={form.agent_id} onChange={e=>set('agent_id',e.target.value)} style={{ ...inp,display:'block' }}><option value="">Select...</option>{agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
              <div><label style={lbl}>Side</label><select value={form.side} onChange={e=>set('side',e.target.value)} style={{ ...inp,display:'block' }}>{['Buyer','Listing','Dual','Rental'].map(s=><option key={s}>{s}</option>)}</select></div>
              <div><label style={lbl}>CTC Stage</label><select value={form.ctc} onChange={e=>set('ctc',e.target.value)} style={{ ...inp,display:'block' }}>{CTC_STAGES.map(s=><option key={s}>{s}</option>)}</select></div>
            </div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px' }}>
              <F label="Sale Price" value={form.price} onChange={v=>set('price',v)} type="number" ph="599000"/>
              <F label="GCI" value={form.gci} onChange={v=>set('gci',v)} type="number" ph="17970"/>
            </div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px' }}>
              <F label="A/O Date" value={form.ao_date} onChange={v=>set('ao_date',v)} type="date"/>
              <F label="Close Date" value={form.close_date} onChange={v=>set('close_date',v)} type="date"/>
            </div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px' }}>
              <F label="Attorney" value={form.atty} onChange={v=>set('atty',v)} ph="Law office"/>
              <F label="Mortgage" value={form.mtg} onChange={v=>set('mtg',v)} ph="Lender"/>
              <F label="Title Co." value={form.title_co} onChange={v=>set('title_co',v)} ph="Title co"/>
            </div>
            <div style={{ display:'flex',gap:'8px',marginTop:'14px' }}>
              <button onClick={()=>setShowAdd(false)} style={{ flex:1,background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'10px',color:'var(--text)',fontSize:'12px',fontWeight:600,padding:'11px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }}>Cancel</button>
              <button onClick={handleAdd} disabled={saving} style={{ flex:2,...btnObj,opacity:saving?.7:1 }}>{saving?'Adding…':'Add Transaction'}</button>
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
      {label&&<label style={lbl}>{label}</label>}
      <input type={type} value={value||''} onChange={e=>onChange(e.target.value)} placeholder={ph} style={inp}/>
    </div>
  )
}

const inp      = { width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'8px 10px',outline:'none',boxSizing:'border-box' }
const lbl      = { display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px' }
const btnStyle = { background:'#CC2200',border:'none',borderRadius:'9px',color:'#fff',fontSize:'12px',fontWeight:700,padding:'9px 15px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }
const btnObj   = { background:'#CC2200',border:'none',borderRadius:'10px',color:'#fff',fontSize:'13px',fontWeight:700,padding:'11px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }
