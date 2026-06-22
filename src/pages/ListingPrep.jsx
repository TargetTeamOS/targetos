import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useAgents } from '../lib/hooks/useAgents'
import { getListingPreps, createListingPrep, updateListingPrep, deleteListingPrep } from '../lib/db/listingprep'

const DEFAULT_CHECKLIST = [
  {id:'c1',label:'Signed listing agreement',done:false,category:'Legal'},
  {id:'c2',label:'Seller disclosure completed',done:false,category:'Legal'},
  {id:'c3',label:'Lead paint disclosure (pre-1978)',done:false,category:'Legal'},
  {id:'c4',label:'Professional photos scheduled',done:false,category:'Marketing'},
  {id:'c5',label:'Professional photos received',done:false,category:'Marketing'},
  {id:'c6',label:'Floor plan created',done:false,category:'Marketing'},
  {id:'c7',label:'Brochure/flyer designed',done:false,category:'Marketing'},
  {id:'c8',label:'Social media post created',done:false,category:'Marketing'},
  {id:'c9',label:'Listed on MLS',done:false,category:'Listing'},
  {id:'c10',label:'Lock box installed',done:false,category:'Listing'},
  {id:'c11',label:'For Sale sign installed',done:false,category:'Listing'},
  {id:'c12',label:'Showing instructions set',done:false,category:'Listing'},
  {id:'c13',label:'Open house scheduled',done:false,category:'Open House'},
  {id:'c14',label:'Open house advertised',done:false,category:'Open House'},
  {id:'c15',label:'Seller briefed on process',done:false,category:'Seller'},
  {id:'c16',label:'Attorney info collected',done:false,category:'Seller'},
]
const CATEGORIES = ['Legal','Marketing','Listing','Open House','Seller']
const CAT_COLORS = { Legal:'#CC2200',Marketing:'#0EA5E9',Listing:'#16A34A','Open House':'#D97706',Seller:'#7C3AED' }

export function ListingPrep() {
  const { agent } = useAuth()
  const { toast } = useApp()
  const { agents } = useAgents()
  const [preps, setPreps]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [selected, setSelected]   = useState(null)
  const [showAdd, setShowAdd]     = useState(false)
  const [newItem, setNewItem]     = useState('')
  const [newCat, setNewCat]       = useState('Marketing')
  const [form, setForm]           = useState({ listing_addr:'', agent_id:'', notes:'' })
  const [saving, setSaving]       = useState(false)

  useEffect(() => {
    getListingPreps({ agentId: agent?.id }).then(setPreps).catch(e=>toast(e.message,'#DC2626')).finally(()=>setLoading(false))
  }, [])

  async function createPrep() {
    if(!form.listing_addr.trim()) { toast('Address required','#DC2626'); return }
    setSaving(true)
    try {
      const d = await createListingPrep({ ...form, agent_id: form.agent_id||agent?.id, status:'Active', checklist: DEFAULT_CHECKLIST.map(i=>({...i})) })
      setPreps(p=>[d,...p]); setShowAdd(false); setForm({ listing_addr:'', agent_id:'', notes:'' })
      setSelected(d); toast('✅ Listing prep created!')
    } catch(e) { toast('Error: '+e.message,'#DC2626') }
    finally { setSaving(false) }
  }

  async function toggleItem(itemId) {
    if(!selected) return
    const updated = selected.checklist.map(i=>i.id===itemId?{...i,done:!i.done}:i)
    const d = await updateListingPrep(selected.id, { checklist: updated })
    setSelected(d); setPreps(p=>p.map(x=>x.id===selected.id?d:x))
  }

  async function addCustomItem() {
    if(!newItem.trim()||!selected) return
    const updated = [...selected.checklist, { id:'c_'+Date.now(), label:newItem.trim(), done:false, category:newCat }]
    const d = await updateListingPrep(selected.id, { checklist: updated })
    setSelected(d); setPreps(p=>p.map(x=>x.id===selected.id?d:x))
    setNewItem(''); toast('Item added!')
  }

  const pct = selected ? Math.round(selected.checklist.filter(i=>i.done).length/Math.max(selected.checklist.length,1)*100) : 0

  return (
    <div style={{ display:'grid',gridTemplateColumns:'260px 1fr',gap:'14px' }}>
      {/* Left */}
      <div>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px' }}>
          <div style={{ fontSize:'16px',fontWeight:900 }}>📋 Listing Prep</div>
          <button onClick={()=>setShowAdd(true)} style={btnStyle}>+</button>
        </div>
        {loading && <div style={{ padding:'20px',textAlign:'center',color:'var(--muted)',fontSize:'12px' }}>Loading...</div>}
        {preps.map(p=>{
          const done=p.checklist?.filter(i=>i.done).length||0
          const total=p.checklist?.length||0
          const pct=Math.round(done/Math.max(total,1)*100)
          return (
            <div key={p.id} onClick={()=>setSelected(p)}
              style={{ background:'var(--panel)',border:`2px solid ${selected?.id===p.id?'#CC2200':'var(--border)'}`,borderRadius:'12px',padding:'12px',marginBottom:'7px',cursor:'pointer' }}>
              <div style={{ fontSize:'12px',fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:'3px' }}>{p.listing_addr}</div>
              <div style={{ background:'var(--dim)',borderRadius:'99px',height:4,overflow:'hidden',marginBottom:'3px' }}>
                <div style={{ background:pct===100?'#16A34A':'#CC2200',borderRadius:'99px',height:4,width:pct+'%',transition:'width .3s' }}/>
              </div>
              <div style={{ fontSize:'10px',color:'var(--muted)',fontWeight:600 }}>{done}/{total} · {pct}%</div>
            </div>
          )
        })}
        {!loading&&preps.length===0&&<div style={{ padding:'24px',textAlign:'center',color:'var(--muted)',fontSize:'12px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px' }}>No preps yet</div>}
      </div>

      {/* Right - checklist */}
      {selected ? (
        <div>
          <div style={{ background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',padding:'16px',marginBottom:'12px' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px' }}>
              <div style={{ fontSize:'16px',fontWeight:800 }}>{selected.listing_addr}</div>
              <div style={{ fontSize:'24px',fontWeight:900,color:pct===100?'#16A34A':'#CC2200' }}>{pct}%</div>
            </div>
            <div style={{ background:'var(--dim)',borderRadius:'99px',height:8,overflow:'hidden' }}>
              <div style={{ background:pct===100?'#16A34A':'linear-gradient(90deg,#CC2200,#E8650A)',borderRadius:'99px',height:8,width:pct+'%',transition:'width .4s' }}/>
            </div>
          </div>

          {CATEGORIES.map(cat=>{
            const items = selected.checklist.filter(i=>i.category===cat)
            if(!items.length) return null
            const doneCat = items.filter(i=>i.done).length
            return (
              <div key={cat} style={{ marginBottom:'10px' }}>
                <div style={{ display:'flex',alignItems:'center',gap:'7px',marginBottom:'5px' }}>
                  <div style={{ width:7,height:7,borderRadius:'50%',background:CAT_COLORS[cat] }}/>
                  <span style={{ fontSize:'11px',fontWeight:700,color:CAT_COLORS[cat],textTransform:'uppercase',letterSpacing:'.7px' }}>{cat}</span>
                  <span style={{ fontSize:'10px',color:'var(--muted)' }}>({doneCat}/{items.length})</span>
                </div>
                <div style={{ background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'10px',overflow:'hidden' }}>
                  {items.map(item=>(
                    <div key={item.id} style={{ display:'flex',alignItems:'center',gap:'10px',padding:'10px 14px',borderBottom:'1px solid var(--border)' }}>
                      <div onClick={()=>toggleItem(item.id)}
                        style={{ width:20,height:20,borderRadius:'5px',border:`2px solid ${item.done?'#16A34A':CAT_COLORS[cat]}`,background:item.done?'#16A34A':'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0,transition:'all .15s' }}>
                        {item.done&&<span style={{ color:'#fff',fontSize:'12px',fontWeight:800 }}>✓</span>}
                      </div>
                      <span style={{ flex:1,fontSize:'13px',fontWeight:item.done?400:500,color:item.done?'var(--muted)':'var(--text)',textDecoration:item.done?'line-through':'none' }}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          <div style={{ display:'flex',gap:'8px',marginTop:'8px' }}>
            <input value={newItem} onChange={e=>setNewItem(e.target.value)} placeholder="Add custom item..." onKeyDown={e=>e.key==='Enter'&&addCustomItem()}
              style={{ flex:1,background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 12px',outline:'none' }}/>
            <select value={newCat} onChange={e=>setNewCat(e.target.value)}
              style={{ background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 10px',outline:'none' }}>
              {CATEGORIES.map(c=><option key={c}>{c}</option>)}
            </select>
            <button onClick={addCustomItem} style={btnStyle}>Add</button>
          </div>
        </div>
      ) : (
        <div style={{ padding:'48px',textAlign:'center',color:'var(--muted)',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px' }}>
          <div style={{ fontSize:'28px',marginBottom:'10px' }}>📋</div>
          Select a listing prep to view checklist
        </div>
      )}

      {showAdd&&(
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,padding:'16px' }} onClick={e=>{if(e.target===e.currentTarget)setShowAdd(false)}}>
          <div style={{ background:'var(--panel)',borderRadius:'16px',padding:'24px',width:'100%',maxWidth:'400px' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'18px' }}>
              <div style={{ fontSize:'16px',fontWeight:800 }}>New Listing Prep</div>
              <button onClick={()=>setShowAdd(false)} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'20px' }}>✕</button>
            </div>
            {[['Listing Address *','listing_addr','47 Prairie Ave, Suffern NY']].map(([l,k,p])=>(
              <div key={k} style={{ marginBottom:'10px' }}>
                <label style={lbl}>{l}</label>
                <input value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} placeholder={p} style={{ width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 11px',outline:'none',boxSizing:'border-box' }}/>
              </div>
            ))}
            <div style={{ marginBottom:'12px' }}>
              <label style={lbl}>Agent</label>
              <select value={form.agent_id} onChange={e=>setForm(f=>({...f,agent_id:e.target.value}))} style={{ width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 11px',outline:'none' }}>
                <option value="">Select agent...</option>
                {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div style={{ background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'9px',padding:'10px 12px',marginBottom:'14px',fontSize:'11px',color:'var(--muted)' }}>
              ✅ {DEFAULT_CHECKLIST.length} standard items added automatically
            </div>
            <div style={{ display:'flex',gap:'8px' }}>
              <button onClick={()=>setShowAdd(false)} style={{ flex:1,background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'10px',color:'var(--text)',fontSize:'12px',fontWeight:600,padding:'11px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }}>Cancel</button>
              <button onClick={createPrep} disabled={saving} style={{ flex:2,...btnObj,opacity:saving?.7:1 }}>{saving?'Creating…':'Create Prep'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const lbl    = { display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px' }
const btnStyle = { background:'#CC2200',border:'none',borderRadius:'9px',color:'#fff',fontSize:'12px',fontWeight:700,padding:'9px 15px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }
const btnObj   = { background:'#CC2200',border:'none',borderRadius:'10px',color:'#fff',fontSize:'13px',fontWeight:700,padding:'11px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }
