import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Card, CardHeader, Btn } from '../components/UI'
import { useConfirm } from '../components/ConfirmDialog'
import { AGENTS } from '../lib/constants'

const DEFAULT_CHECKLIST = [
  { id:'c1',  label:'Signed listing agreement',        done:false, category:'Legal'     },
  { id:'c2',  label:'MLS input form completed',         done:false, category:'Legal'     },
  { id:'c3',  label:'Seller disclosure completed',      done:false, category:'Legal'     },
  { id:'c4',  label:'Lead paint disclosure (pre-1978)', done:false, category:'Legal'     },
  { id:'c5',  label:'Professional photos scheduled',    done:false, category:'Marketing' },
  { id:'c6',  label:'Professional photos received',     done:false, category:'Marketing' },
  { id:'c7',  label:'Floor plan created',               done:false, category:'Marketing' },
  { id:'c8',  label:'Virtual tour created',             done:false, category:'Marketing' },
  { id:'c9',  label:'Brochure/flyer designed',          done:false, category:'Marketing' },
  { id:'c10', label:'Social media post created',        done:false, category:'Marketing' },
  { id:'c11', label:'Listed on MLS',                    done:false, category:'Listing'   },
  { id:'c12', label:'Listed on Zillow/Trulia/Realtor',  done:false, category:'Listing'   },
  { id:'c13', label:'Lock box installed',               done:false, category:'Listing'   },
  { id:'c14', label:'For Sale sign installed',          done:false, category:'Listing'   },
  { id:'c15', label:'Showing instructions set',         done:false, category:'Listing'   },
  { id:'c16', label:'Open house scheduled',             done:false, category:'Open House' },
  { id:'c17', label:'Open house advertised',            done:false, category:'Open House' },
  { id:'c18', label:'Seller briefed on process',        done:false, category:'Seller'    },
  { id:'c19', label:'Seller contact sheet on file',     done:false, category:'Seller'    },
  { id:'c20', label:'Attorney info collected',          done:false, category:'Seller'    },
]

const CATEGORIES = ['Legal','Marketing','Listing','Open House','Seller']
const CAT_COLORS = { Legal:'#CC2200', Marketing:'#0EA5E9', Listing:'#16A34A', 'Open House':'#D97706', Seller:'#7C3AED' }

export function ListingPrep() {
  const { state, toast } = useApp()
  const { confirm, ConfirmDialog } = useConfirm()
  const [preps, setPreps]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState(null)
  const [showAdd, setShowAdd]       = useState(false)
  const [newItem, setNewItem]       = useState('')
  const [newCat, setNewCat]         = useState('Marketing')
  const [form, setForm]             = useState({ listing_addr:'', agent_name:'', notes:'' })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('listing_prep').select('*').order('created_at', { ascending: false })
    setPreps(data || [])
    if(data?.length && !selected) setSelected(data[0])
    setLoading(false)
  }

  async function createPrep() {
    if(!form.listing_addr.trim()) { toast('Address required','#DC2626'); return }
    const { data, error } = await supabase.from('listing_prep').insert([{
      listing_addr: form.listing_addr.trim(),
      agent_name:   form.agent_name || state.currentAgent?.name,
      notes:        form.notes,
      status:       'Active',
      checklist:    DEFAULT_CHECKLIST.map(item => ({...item})),
    }]).select()
    if(error) { toast('Failed: '+error.message,'#DC2626'); return }
    toast('✅ Listing prep created!')
    setShowAdd(false)
    setForm({ listing_addr:'', agent_name:'', notes:'' })
    await load()
    if(data?.[0]) setSelected(data[0])
  }

  async function toggleItem(itemId) {
    if(!selected) return
    const updated = selected.checklist.map(item =>
      item.id === itemId ? { ...item, done: !item.done } : item
    )
    const updatedPrep = { ...selected, checklist: updated }
    setSelected(updatedPrep)
    setPreps(prev => prev.map(p => p.id === selected.id ? updatedPrep : p))
    await supabase.from('listing_prep').update({
      checklist: updated,
      updated_at: new Date().toISOString()
    }).eq('id', selected.id)
  }

  async function addCustomItem() {
    if(!newItem.trim() || !selected) return
    const item = {
      id: 'c_' + Date.now(),
      label: newItem.trim(),
      done: false,
      category: newCat
    }
    const updated = [...selected.checklist, item]
    const updatedPrep = { ...selected, checklist: updated }
    setSelected(updatedPrep)
    setPreps(prev => prev.map(p => p.id === selected.id ? updatedPrep : p))
    await supabase.from('listing_prep').update({ checklist: updated }).eq('id', selected.id)
    setNewItem('')
    toast('Item added!')
  }

  async function deleteItem(itemId) {
    if(!selected) return
    const updated = selected.checklist.filter(i => i.id !== itemId)
    const updatedPrep = { ...selected, checklist: updated }
    setSelected(updatedPrep)
    setPreps(prev => prev.map(p => p.id === selected.id ? updatedPrep : p))
    await supabase.from('listing_prep').update({ checklist: updated }).eq('id', selected.id)
  }

  async function deletePrep(id) {
    const p = preps.find(x=>x.id===id)
    confirm({ title:'Delete Prep?', message:`Delete prep for "${p?.listing_addr}"?`, confirmLabel:'Delete', onConfirm: async () => {
      await supabase.from('listing_prep').delete().eq('id', id)
      if(selected?.id === id) setSelected(null)
      load(); toast('Deleted')
    }})
  }

  const pct = selected
    ? Math.round((selected.checklist.filter(i=>i.done).length / Math.max(selected.checklist.length,1)) * 100)
    : 0

  return (
    <div>
      <ConfirmDialog/>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px',flexWrap:'wrap',gap:'8px'}}>
        <div>
          <div style={{fontSize:'20px',fontWeight:900}}>📋 Listing Prep</div>
          <div style={{fontSize:'12px',color:'var(--muted)',marginTop:'2px'}}>{preps.length} listings in prep</div>
        </div>
        <Btn size="sm" onClick={()=>setShowAdd(true)}>+ New Listing Prep</Btn>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'260px 1fr',gap:'14px'}}>
        {/* Left — prep list */}
        <div>
          {loading && <div style={{padding:'20px',textAlign:'center',color:'var(--muted)',fontSize:'12px'}}>Loading...</div>}
          {!loading && preps.length===0 && (
            <Card style={{padding:'24px',textAlign:'center'}}>
              <div style={{fontSize:'28px',marginBottom:'10px'}}>📋</div>
              <div style={{fontSize:'13px',fontWeight:700,marginBottom:'8px'}}>No listing preps yet</div>
              <Btn size="sm" onClick={()=>setShowAdd(true)}>Create First Prep</Btn>
            </Card>
          )}
          {preps.map(p => {
            const done = p.checklist?.filter(i=>i.done).length || 0
            const total = p.checklist?.length || 0
            const pct = Math.round(done/Math.max(total,1)*100)
            const isSel = selected?.id === p.id
            return (
              <div key={p.id} onClick={()=>setSelected(p)}
                style={{background:'var(--panel)',border:'2px solid '+(isSel?'#CC2200':'var(--border)'),borderRadius:'12px',padding:'13px 15px',marginBottom:'8px',cursor:'pointer',transition:'border-color .15s'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'6px'}}>
                  <div style={{fontSize:'12px',fontWeight:700,flex:1,marginRight:'8px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.listing_addr}</div>
                  <button onClick={e=>{e.stopPropagation();deletePrep(p.id)}} style={{background:'none',border:'none',cursor:'pointer',color:'#DC2626',fontSize:'12px',flexShrink:0}}>🗑</button>
                </div>
                <div style={{fontSize:'11px',color:'var(--muted)',marginBottom:'7px'}}>{p.agent_name}</div>
                <div style={{background:'var(--dim)',borderRadius:'99px',height:5,overflow:'hidden',marginBottom:'3px'}}>
                  <div style={{background:pct===100?'#16A34A':'#CC2200',borderRadius:'99px',height:5,width:pct+'%',transition:'width .3s'}}/>
                </div>
                <div style={{fontSize:'10px',color:'var(--muted)',fontWeight:600}}>{done}/{total} complete · {pct}%</div>
              </div>
            )
          })}
        </div>

        {/* Right — checklist */}
        {selected ? (
          <div>
            {/* Header */}
            <Card style={{marginBottom:'12px',padding:'16px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'10px'}}>
                <div>
                  <div style={{fontSize:'16px',fontWeight:800}}>{selected.listing_addr}</div>
                  <div style={{fontSize:'12px',color:'var(--muted)',marginTop:'2px'}}>{selected.agent_name}</div>
                </div>
                <div style={{fontSize:'22px',fontWeight:900,color:pct===100?'#16A34A':'#CC2200'}}>{pct}%</div>
              </div>
              <div style={{background:'var(--dim)',borderRadius:'99px',height:8,overflow:'hidden'}}>
                <div style={{background:pct===100?'#16A34A':'linear-gradient(90deg,#CC2200,#E8650A)',borderRadius:'99px',height:8,width:pct+'%',transition:'width .4s'}}/>
              </div>
              <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'5px'}}>{selected.checklist.filter(i=>i.done).length} of {selected.checklist.length} items complete</div>
            </Card>

            {/* Checklist by category */}
            {CATEGORIES.map(cat => {
              const items = selected.checklist.filter(i=>i.category===cat)
              if(!items.length) return null
              const doneCat = items.filter(i=>i.done).length
              return (
                <div key={cat} style={{marginBottom:'10px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'6px'}}>
                    <div style={{width:8,height:8,borderRadius:'50%',background:CAT_COLORS[cat]}}/>
                    <span style={{fontSize:'11px',fontWeight:700,color:CAT_COLORS[cat],textTransform:'uppercase',letterSpacing:'.7px'}}>{cat}</span>
                    <span style={{fontSize:'10px',color:'var(--muted)'}}>({doneCat}/{items.length})</span>
                  </div>
                  <Card style={{padding:'4px 0'}}>
                    {items.map(item => (
                      <div key={item.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'9px 14px',borderBottom:'1px solid var(--border)'}}>
                        <div onClick={()=>toggleItem(item.id)}
                          style={{width:20,height:20,borderRadius:'5px',border:'2px solid '+(item.done?'#16A34A':CAT_COLORS[cat]),background:item.done?'#16A34A':'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0,transition:'all .15s'}}>
                          {item.done && <span style={{color:'#fff',fontSize:'12px',fontWeight:800}}>✓</span>}
                        </div>
                        <span style={{flex:1,fontSize:'13px',fontWeight:item.done?400:500,color:item.done?'var(--muted)':'var(--text)',textDecoration:item.done?'line-through':'none'}}>{item.label}</span>
                        <button onClick={()=>deleteItem(item.id)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'12px',opacity:.4}}
                          onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.4'}>✕</button>
                      </div>
                    ))}
                  </Card>
                </div>
              )
            })}

            {/* Custom items not in standard categories */}
            {(() => {
              const custom = selected.checklist.filter(i=>!CATEGORIES.includes(i.category))
              if(!custom.length) return null
              return (
                <div style={{marginBottom:'10px'}}>
                  <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'6px'}}>Custom Items</div>
                  <Card style={{padding:'4px 0'}}>
                    {custom.map(item => (
                      <div key={item.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'9px 14px',borderBottom:'1px solid var(--border)'}}>
                        <div onClick={()=>toggleItem(item.id)} style={{width:20,height:20,borderRadius:'5px',border:'2px solid #94A3B8',background:item.done?'#94A3B8':'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}>
                          {item.done && <span style={{color:'#fff',fontSize:'12px'}}>✓</span>}
                        </div>
                        <span style={{flex:1,fontSize:'13px',color:item.done?'var(--muted)':'var(--text)',textDecoration:item.done?'line-through':'none'}}>{item.label}</span>
                        <button onClick={()=>deleteItem(item.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#DC2626',fontSize:'12px'}}>✕</button>
                      </div>
                    ))}
                  </Card>
                </div>
              )
            })()}

            {/* Add custom item */}
            <div style={{display:'flex',gap:'8px',marginTop:'8px'}}>
              <input value={newItem} onChange={e=>setNewItem(e.target.value)} placeholder="Add custom checklist item..."
                onKeyDown={e=>e.key==='Enter'&&addCustomItem()}
                style={{flex:1,background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 12px',outline:'none'}}/>
              <select value={newCat} onChange={e=>setNewCat(e.target.value)}
                style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 10px',outline:'none'}}>
                {CATEGORIES.map(c=><option key={c}>{c}</option>)}
              </select>
              <Btn size="sm" onClick={addCustomItem}>Add</Btn>
            </div>
          </div>
        ) : (
          <Card style={{padding:'40px',textAlign:'center'}}>
            <div style={{fontSize:'32px',marginBottom:'12px'}}>📋</div>
            <div style={{fontSize:'14px',fontWeight:700,color:'var(--muted)'}}>Select a listing prep to view checklist</div>
          </Card>
        )}
      </div>

      {/* Add modal */}
      {showAdd && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,padding:'16px'}} onClick={e=>{if(e.target===e.currentTarget)setShowAdd(false)}}>
          <div style={{background:'var(--panel)',borderRadius:'16px',padding:'24px',width:'100%',maxWidth:'440px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'18px'}}>
              <div style={{fontSize:'16px',fontWeight:800}}>New Listing Prep</div>
              <button onClick={()=>setShowAdd(false)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'20px'}}>✕</button>
            </div>
            {[['Property Address *','listing_addr','47 Prairie Ave, Suffern NY'],['Notes','notes','Any special instructions...']].map(([label,key,ph])=>(
              <div key={key} style={{marginBottom:'12px'}}>
                <label style={{display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px'}}>{label}</label>
                <input value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} placeholder={ph}
                  style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 11px',outline:'none',boxSizing:'border-box'}}/>
              </div>
            ))}
            <div style={{marginBottom:'14px'}}>
              <label style={{display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px'}}>Agent</label>
              <select value={form.agent_name} onChange={e=>setForm(f=>({...f,agent_name:e.target.value}))}
                style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 11px',outline:'none'}}>
                <option value="">Select agent...</option>
                {AGENTS.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}
              </select>
            </div>
            <div style={{background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'9px',padding:'10px 12px',marginBottom:'14px',fontSize:'11px',color:'var(--muted)'}}>
              ✅ {DEFAULT_CHECKLIST.length} standard checklist items will be added automatically
            </div>
            <div style={{display:'flex',gap:'8px'}}>
              <Btn variant="ghost" onClick={()=>setShowAdd(false)} style={{flex:1}}>Cancel</Btn>
              <Btn onClick={createPrep} style={{flex:2}}>Create Prep</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
