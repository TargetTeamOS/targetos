import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Card, CardHeader, Btn } from '../components/UI'
import { useConfirm } from '../components/ConfirmDialog'
import { AGENTS } from '../lib/constants'

const CTC_STAGES = ['Offer Accapted','Under Shtar','Under Contract','Inspection scheduled','Mortgage process','Appraisal ordered','Conditional Approval','Clear to close','Closing scheduled','Closed']
const CTC_COLORS = {'Offer Accapted':'#D97706','Under Shtar':'#bb3354','Under Contract':'#2563EB','Inspection scheduled':'#0EA5E9','Mortgage process':'#7C3AED','Appraisal ordered':'#8B5CF6','Conditional Approval':'#F59E0B','Clear to close':'#10B981','Closing scheduled':'#16A34A','Closed':'#059669'}
const fmt$ = n => '$' + Number(n||0).toLocaleString()

export function Transactions() {
  const { state, toast } = useApp()
  const { confirm, ConfirmDialog } = useConfirm()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState(null)
  const [filter, setFilter] = useState('Active')
  const [form, setForm] = useState({ addr:'', agent_name:'', side:'Buyer', price:'', gci:'', ctc:'Offer Accapted', close_date:'', client_name:'', atty:'', mtg:'', title_co:'', notes:'' })

  useEffect(() => { loadTransactions() }, [])

  async function loadTransactions() {
    setLoading(true)
    const { data } = await supabase.from('transactions').select('*').order('created_at', { ascending: false })
    setTransactions(data || [])
    setLoading(false)
  }

  async function saveTransaction() {
    if(!form.addr.trim()) { toast('Address required', '#DC2626'); return }
    const payload = {
      addr: form.addr.trim(),
      agent_name: form.agent_name || state.currentAgent?.name,
      side: form.side,
      price: parseFloat(String(form.price).replace(/[^0-9.]/g,'')) || 0,
      gci: parseFloat(String(form.gci).replace(/[^0-9.]/g,'')) || 0,
      ctc: form.ctc,
      close_date: form.close_date || null,
      client_name: form.client_name,
      atty: form.atty,
      mtg: form.mtg,
      title_co: form.title_co,
      notes: form.notes,
      status: 'Active',
      punch_list: [],
    }
    if(editing) {
      await supabase.from('transactions').update({...payload, updated_at: new Date().toISOString()}).eq('id', editing)
      toast('Transaction updated!')
    } else {
      await supabase.from('transactions').insert([payload])
      toast('✅ Transaction added!')
    }
    setShowAdd(false); setEditing(null); resetForm(); loadTransactions()
  }

  async function updateCTC(id, ctc) {
    await supabase.from('transactions').update({ ctc, updated_at: new Date().toISOString() }).eq('id', id)
    setTransactions(prev => prev.map(t => t.id===id ? {...t,ctc} : t))
    toast(`Updated to: ${ctc}`)
    if(ctc === 'Closed') toast('🎉 Congratulations on the closing!')
  }

  async function markClosed(id) {
    await supabase.from('transactions').update({ ctc:'Closed', status:'Closed', updated_at: new Date().toISOString() }).eq('id', id)
    setTransactions(prev => prev.map(t => t.id===id ? {...t,ctc:'Closed',status:'Closed'} : t))
    toast('🎉 Deal closed!')
  }

  async function deleteTransaction(id) {
    const t = transactions.find(x=>x.id===id)
    confirm({ title:'Delete Transaction?', message:`Delete "${t?.addr}"?`, confirmLabel:'Delete', onConfirm: async () => {
      await supabase.from('transactions').delete().eq('id', id)
      toast('Deleted'); loadTransactions()
    }})
  }

  function openEdit(t) {
    setForm({ addr:t.addr, agent_name:t.agent_name||'', side:t.side||'Buyer', price:t.price||'', gci:t.gci||'', ctc:t.ctc||'Offer Accapted', close_date:t.close_date||'', client_name:t.client_name||'', atty:t.atty||'', mtg:t.mtg||'', title_co:t.title_co||'', notes:t.notes||'' })
    setEditing(t.id); setShowAdd(true)
  }

  function resetForm() {
    setForm({ addr:'', agent_name:state.currentAgent?.name||'', side:'Buyer', price:'', gci:'', ctc:'Offer Accapted', close_date:'', client_name:'', atty:'', mtg:'', title_co:'', notes:'' })
  }

  const set = (k,v) => setForm(f=>({...f,[k]:v}))
  const filtered = filter === 'All' ? transactions : transactions.filter(t => filter === 'Active' ? t.status !== 'Closed' : t.status === 'Closed')

  return (
    <div>
      <ConfirmDialog/>

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px',flexWrap:'wrap',gap:'8px'}}>
        <div>
          <div style={{fontSize:'20px',fontWeight:900}}>📋 Transactions</div>
          <div style={{fontSize:'12px',color:'var(--muted)',marginTop:'2px'}}>{transactions.filter(t=>t.status!=='Closed').length} active · {transactions.filter(t=>t.status==='Closed').length} closed</div>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          <div style={{display:'flex',background:'var(--dim)',borderRadius:'8px',padding:'3px',gap:'2px'}}>
            {['Active','Closed','All'].map(f=>(
              <button key={f} onClick={()=>setFilter(f)} style={{padding:'6px 12px',borderRadius:'6px',border:'none',cursor:'pointer',fontSize:'11px',fontWeight:600,fontFamily:'Inter,system-ui,sans-serif',background:filter===f?'var(--panel)':'transparent',color:filter===f?'var(--text)':'var(--muted)'}}>
                {f}
              </button>
            ))}
          </div>
          <Btn size="sm" onClick={()=>{resetForm();setShowAdd(true)}}>+ Add Transaction</Btn>
        </div>
      </div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'16px'}}>
        {[
          ['Active', transactions.filter(t=>t.status!=='Closed').length, '#CC2200'],
          ['Under Contract', transactions.filter(t=>t.ctc==='Under Contract').length, '#2563EB'],
          ['Clear to Close', transactions.filter(t=>t.ctc==='Clear to close').length, '#10B981'],
          ['Total GCI', fmt$(transactions.reduce((s,t)=>s+(t.gci||0),0)), '#D97706'],
        ].map(([k,v,c])=>(
          <div key={k} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',padding:'14px'}}>
            <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'5px'}}>{k}</div>
            <div style={{fontSize:'20px',fontWeight:900,color:c}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Transaction cards */}
      {loading ? <div style={{padding:'32px',textAlign:'center',color:'var(--muted)'}}>Loading...</div>
      : filtered.length === 0
      ? <div style={{padding:'40px',textAlign:'center',color:'var(--muted)',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px'}}>
          <div style={{fontSize:'28px',marginBottom:'10px'}}>📋</div>
          <div style={{fontSize:'14px',fontWeight:700,marginBottom:'6px'}}>No transactions yet</div>
          <Btn size="sm" onClick={()=>{resetForm();setShowAdd(true)}}>Add First Transaction</Btn>
        </div>
      : filtered.map(t => (
        <div key={t.id} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',padding:'16px',marginBottom:'10px',borderLeft:'4px solid '+(CTC_COLORS[t.ctc]||'#CC2200')}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'8px',marginBottom:'12px'}}>
            <div>
              <div style={{fontSize:'15px',fontWeight:800}}>{t.addr}</div>
              <div style={{fontSize:'12px',color:'var(--muted)',marginTop:'2px'}}>
                {t.agent_name} · {t.side} · {t.client_name||'No client'}
                {t.close_date && <span style={{color:'#16A34A',fontWeight:600}}> · Close: {t.close_date}</span>}
              </div>
            </div>
            <div style={{display:'flex',gap:'7px',alignItems:'center',flexWrap:'wrap'}}>
              {t.price && <span style={{fontSize:'13px',fontWeight:800,color:'#D97706'}}>{fmt$(t.price)}</span>}
              {t.gci && <span style={{fontSize:'12px',color:'#16A34A',fontWeight:700}}>GCI: {fmt$(t.gci)}</span>}
            </div>
          </div>

          {/* CTC Stage selector */}
          <div style={{marginBottom:'12px'}}>
            <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'6px'}}>Contract to Close Stage</div>
            <div style={{display:'flex',gap:'5px',flexWrap:'wrap'}}>
              {CTC_STAGES.map(stage => (
                <button key={stage} onClick={()=>updateCTC(t.id, stage)}
                  style={{padding:'5px 10px',borderRadius:'20px',border:'1.5px solid '+(t.ctc===stage?(CTC_COLORS[stage]||'#CC2200'):'var(--border)'),background:t.ctc===stage?(CTC_COLORS[stage]||'#CC2200')+'15':'transparent',color:t.ctc===stage?(CTC_COLORS[stage]||'#CC2200'):'var(--muted)',fontSize:'10px',fontWeight:700,cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',transition:'all .12s'}}>
                  {stage}
                </button>
              ))}
            </div>
          </div>

          {/* Contact info */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'8px',marginBottom:'12px'}}>
            {[['Attorney',t.atty],['Mortgage',t.mtg],['Title Co.',t.title_co]].map(([k,v])=>(
              <div key={k} style={{background:'var(--dim)',borderRadius:'8px',padding:'8px 10px'}}>
                <div style={{fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:'2px'}}>{k}</div>
                <div style={{fontSize:'12px',fontWeight:600}}>{v||'—'}</div>
              </div>
            ))}
          </div>

          {t.notes && <div style={{fontSize:'12px',color:'var(--muted)',fontStyle:'italic',marginBottom:'10px',padding:'8px 10px',background:'var(--dim)',borderRadius:'7px'}}>{t.notes}</div>}

          <div style={{display:'flex',gap:'6px',justifyContent:'flex-end'}}>
            {t.status !== 'Closed' && <Btn size="xs" onClick={()=>markClosed(t.id)} style={{background:'rgba(22,163,74,.1)',color:'#16A34A'}}>🎉 Mark Closed</Btn>}
            <Btn size="xs" variant="ghost" onClick={()=>openEdit(t)}>✏ Edit</Btn>
            <Btn size="xs" variant="danger" onClick={()=>deleteTransaction(t.id)}>🗑</Btn>
          </div>
        </div>
      ))}

      {/* Add/Edit modal */}
      {showAdd && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,padding:'16px'}} onClick={e=>{if(e.target===e.currentTarget){setShowAdd(false);setEditing(null)}}}>
          <div style={{background:'var(--panel)',borderRadius:'16px',padding:'24px',width:'100%',maxWidth:'520px',maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'18px'}}>
              <div style={{fontSize:'16px',fontWeight:800}}>{editing?'Edit Transaction':'Add Transaction'}</div>
              <button onClick={()=>{setShowAdd(false);setEditing(null)}} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'20px'}}>✕</button>
            </div>
            <FI label="Property Address *" value={form.addr} onChange={v=>set('addr',v)} ph="47 Prairie Ave, Suffern NY"/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
              <div><label style={lbl}>Agent</label><select value={form.agent_name} onChange={e=>set('agent_name',e.target.value)} style={sel}><option value="">Select...</option>{AGENTS.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}</select></div>
              <div><label style={lbl}>Side</label><select value={form.side} onChange={e=>set('side',e.target.value)} style={sel}>{['Buyer','Seller','Dual','Rental'].map(s=><option key={s}>{s}</option>)}</select></div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
              <FI label="Sale Price" value={form.price} onChange={v=>set('price',v)} type="number" ph="599000"/>
              <FI label="GCI" value={form.gci} onChange={v=>set('gci',v)} type="number" ph="17970"/>
            </div>
            <div><label style={lbl}>CTC Stage</label><select value={form.ctc} onChange={e=>set('ctc',e.target.value)} style={sel}>{CTC_STAGES.map(s=><option key={s}>{s}</option>)}</select></div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
              <FI label="Client Name" value={form.client_name} onChange={v=>set('client_name',v)} ph="John Smith"/>
              <FI label="Close Date" value={form.close_date} onChange={v=>set('close_date',v)} type="date"/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px'}}>
              <FI label="Attorney" value={form.atty} onChange={v=>set('atty',v)} ph="Law office"/>
              <FI label="Mortgage Co." value={form.mtg} onChange={v=>set('mtg',v)} ph="Lender name"/>
              <FI label="Title Co." value={form.title_co} onChange={v=>set('title_co',v)} ph="Title company"/>
            </div>
            <FI label="Notes" value={form.notes} onChange={v=>set('notes',v)} ph="Any notes..." rows={2}/>
            <div style={{display:'flex',gap:'8px',marginTop:'8px'}}>
              <Btn variant="ghost" onClick={()=>{setShowAdd(false);setEditing(null)}} style={{flex:1}}>Cancel</Btn>
              <Btn onClick={saveTransaction} style={{flex:2}}>{editing?'Save Changes':'Add Transaction'}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FI({ label, value, onChange, ph='', type='text', rows }) {
  return (
    <div style={{marginBottom:'10px'}}>
      <label style={lbl}>{label}</label>
      {rows ? <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} rows={rows} style={{...sel,resize:'vertical',lineHeight:1.6}}/> : <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} style={sel}/>}
    </div>
  )
}
const lbl = { display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px' }
const sel = { width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 11px',outline:'none',boxSizing:'border-box' }
