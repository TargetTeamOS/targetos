import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useListings } from '../lib/hooks'
import { useAgents } from '../lib/hooks'
import { useApp } from '../context/AppContext'
import { fmt$, fmtDate } from '../lib/utils'
import { updateListing } from '../lib/db'

const STATUSES = ['Active','Accepted offer','Under Contract','Off Market','Expired','Temporary off market','Seller not selling','Sold']
const STATUS_COLORS = { 'Active':'#16A34A','Accepted offer':'#784bd1','Under Contract':'#007eb5','Off Market':'#fdab3d','Expired':'#df2f4a','Sold':'#ffcb00','Temporary off market':'#579bfc','Seller not selling':'#333333' }
const PROPERTY_TYPES = ['New Construction','Land','Single Family','Condo','Commercial','Duplex','2 Family','3 Family','4 Family','High Ranch']

export function Listings() {
  const navigate = useNavigate()
  const { id: urlId } = useParams()
  const { agent, isAdmin } = useAuth()
  const { toast } = useApp()
  const { agents } = useAgents()
  const [search, setSearch]   = useState('')
  const [filterStatus, setFS] = useState('Active')
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState(null)
  const [saving, setSaving]   = useState(false)
  const [form, setForm]       = useState(defaultForm())

  const { listings, loading, add, update, remove } = useListings({
    agentId: isAdmin ? undefined : agent?.id,
    status: filterStatus || undefined,
    search: search.length > 1 ? search : undefined,
  })

  function defaultForm() {
    return { addr:'', city:'', state:'NY', zip:'', status:'Active', list_price:'', property_type:'',
      deal_type:'MLS', beds:'', baths:'', sqft:'', tax:'', door_lock:'', mls_link:'',
      buyers_agent_pct:'', seller_name:'', list_date:'', notes:'', agent_id: agent?.id || '' }
  }

  async function handleSave() {
    if (!form.addr.trim()) { toast('Address required','#DC2626'); return }
    setSaving(true)
    try {
      const payload = { ...form, agent_id: form.agent_id || agent?.id, list_price: parseFloat(form.list_price)||null, ad_budget:2000, spend:[], showings:[], interests:[] }
      if (selected) {
        await update(selected.id, payload)
        toast('✅ Listing updated!')
        setSelected(null)
      } else {
        await add(payload)
        toast('✅ Listing added!')
        setShowAdd(false)
      }
      setForm(defaultForm())
    } catch(e) { toast('Error: '+e.message,'#DC2626') }
    finally { setSaving(false) }
  }

  async function updateStatus(id, status) {
    try {
      await update(id, { status })
      toast(`Status → ${status}`)
    } catch(e) { toast('Error: '+e.message,'#DC2626') }
  }

  const set = (k,v) => setForm(f=>({...f,[k]:v}))
  const activeListings = listings.filter(l=>l.status==='Active').length
  const aoListings     = listings.filter(l=>l.status==='Accepted offer').length
  const ucListings     = listings.filter(l=>l.status==='Under Contract').length

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px', flexWrap:'wrap', gap:'8px' }}>
        <div>
          <div style={{ fontSize:'18px', fontWeight:900 }}>🏠 Listings</div>
          <div style={{ fontSize:'12px', color:'var(--muted)', marginTop:'2px' }}>
            {activeListings} active · {aoListings} AO · {ucListings} UC
          </div>
        </div>
        <div style={{ display:'flex', gap:'7px', flexWrap:'wrap' }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search address..."
            style={inp}/>
          <select value={filterStatus} onChange={e=>setFS(e.target.value)} style={sel}>
            <option value="">All Statuses</option>
            {STATUSES.map(s=><option key={s}>{s}</option>)}
          </select>
          <button onClick={()=>{setShowAdd(true);setSelected(null);setForm(defaultForm())}} style={btnRed}>
            + Add Listing
          </button>
        </div>
      </div>

      {/* Status filter pills */}
      <div style={{ display:'flex', gap:'6px', marginBottom:'12px', flexWrap:'wrap' }}>
        {['Active','Accepted offer','Under Contract'].map(s=>(
          <div key={s} onClick={()=>setFS(f=>f===s?'':s)}
            style={{ fontSize:'11px', fontWeight:700, padding:'5px 12px', borderRadius:'20px', cursor:'pointer',
              background:filterStatus===s?(STATUS_COLORS[s]+'20'):'var(--dim)',
              border:`1.5px solid ${filterStatus===s?STATUS_COLORS[s]:'var(--border)'}`,
              color:filterStatus===s?STATUS_COLORS[s]:'var(--muted)' }}>
            {s} ({listings.filter(l=>l.status===s).length})
          </div>
        ))}
      </div>

      {/* Listing cards */}
      {loading ? <div style={{ padding:'32px', textAlign:'center', color:'var(--muted)', fontSize:'13px' }}>Loading...</div>
      : listings.length === 0
      ? <div style={{ padding:'48px', textAlign:'center', color:'var(--muted)', background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'14px' }}>
          <div style={{ fontSize:'32px', marginBottom:'12px' }}>🏠</div>
          <div style={{ fontWeight:700, marginBottom:'6px' }}>No listings</div>
          <button onClick={()=>setShowAdd(true)} style={btnRed}>Add First Listing</button>
        </div>
      : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:'12px' }}>
          {listings.map(l=>(
            <div key={l.id} style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'14px', overflow:'hidden', cursor:'pointer' }}
              onClick={()=>{navigate('/listings/'+l.id);setSelected(l);setForm({...defaultForm(),...l,list_price:l.list_price||''});setShowAdd(false)}}>
              {/* Status bar */}
              <div style={{ height:4, background:STATUS_COLORS[l.status]||'#94A3B8' }}/>
              <div style={{ padding:'14px 16px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'6px' }}>
                  <div style={{ fontSize:'13px', fontWeight:800, flex:1, marginRight:'8px' }}>{l.addr}</div>
                  <span style={{ fontSize:'10px', fontWeight:700, padding:'2px 8px', borderRadius:'20px', background:(STATUS_COLORS[l.status]||'#94A3B8')+'18', color:STATUS_COLORS[l.status]||'#94A3B8', flexShrink:0, whiteSpace:'nowrap' }}>
                    {l.status}
                  </span>
                </div>
                <div style={{ fontSize:'11px', color:'var(--muted)', marginBottom:'8px' }}>
                  {l.city && <span>{l.city}, </span>}{l.state}
                  {l.property_type && <span> · {l.property_type}</span>}
                </div>
                <div style={{ fontSize:'20px', fontWeight:900, color:'#CC2200', marginBottom:'8px' }}>{fmt$(l.list_price)}</div>
                <div style={{ display:'flex', gap:'12px', fontSize:'12px', color:'var(--muted)', marginBottom:'10px' }}>
                  {l.beds  && <span>🛏 {l.beds} bed</span>}
                  {l.baths && <span>🚿 {l.baths} bath</span>}
                  {l.sqft  && <span>📐 {l.sqft} sqft</span>}
                </div>
                {/* Quick status change */}
                <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }} onClick={e=>e.stopPropagation()}>
                  {STATUSES.slice(0,4).map(s=>(
                    <button key={s} onClick={()=>updateStatus(l.id,s)}
                      style={{ fontSize:'9px', fontWeight:700, padding:'3px 8px', borderRadius:'20px', border:`1.5px solid ${l.status===s?(STATUS_COLORS[s]||'#CC2200'):'var(--border)'}`,
                        background:l.status===s?(STATUS_COLORS[s]||'#CC2200')+'15':'transparent',
                        color:l.status===s?(STATUS_COLORS[s]||'#CC2200'):'var(--muted)', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif' }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      {(showAdd || selected) && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999, padding:'16px' }}
          onClick={e=>{if(e.target===e.currentTarget){setShowAdd(false);setSelected(null)}}}>
          <div style={{ background:'var(--panel)', borderRadius:'16px', padding:'24px', width:'100%', maxWidth:'520px', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'18px' }}>
              <div style={{ fontSize:'16px', fontWeight:800 }}>{selected?'Edit Listing':'Add Listing'}</div>
              <button onClick={()=>{setShowAdd(false);setSelected(null)}} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:'20px' }}>✕</button>
            </div>
            <F label="Address *" value={form.addr} onChange={v=>set('addr',v)} ph="47 Prairie Ave"/>
            <div style={{ display:'grid', gridTemplateColumns:'2fr 60px 80px', gap:'8px' }}>
              <F label="City" value={form.city} onChange={v=>set('city',v)} ph="Suffern"/>
              <F label="State" value={form.state} onChange={v=>set('state',v)} ph="NY"/>
              <F label="Zip" value={form.zip} onChange={v=>set('zip',v)} ph="10901"/>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
              <div><label style={lblStyle}>Status</label>
                <select value={form.status} onChange={e=>set('status',e.target.value)} style={{ ...sel, width:'100%' }}>
                  {STATUSES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <F label="List Price $" value={form.list_price} onChange={v=>set('list_price',v)} type="number" ph="599000"/>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px' }}>
              <F label="Beds" value={form.beds} onChange={v=>set('beds',v)} ph="4"/>
              <F label="Baths" value={form.baths} onChange={v=>set('baths',v)} ph="2.5"/>
              <F label="Sqft" value={form.sqft} onChange={v=>set('sqft',v)} ph="1,568"/>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
              <F label="Tax" value={form.tax} onChange={v=>set('tax',v)} ph="$13,377/yr"/>
              <F label="Door Lock Code" value={form.door_lock} onChange={v=>set('door_lock',v)} ph="1234"/>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
              <div><label style={lblStyle}>Property Type</label>
                <select value={form.property_type} onChange={e=>set('property_type',e.target.value)} style={{ ...sel, width:'100%' }}>
                  <option value="">Select...</option>
                  {PROPERTY_TYPES.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div><label style={lblStyle}>Agent</label>
                <select value={form.agent_id} onChange={e=>set('agent_id',e.target.value)} style={{ ...sel, width:'100%' }}>
                  {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>
            <F label="Seller Name" value={form.seller_name} onChange={v=>set('seller_name',v)} ph="John Smith"/>
            <F label="MLS Link" value={form.mls_link} onChange={v=>set('mls_link',v)} ph="https://..."/>
            <F label="Buyers Agent %" value={form.buyers_agent_pct} onChange={v=>set('buyers_agent_pct',v)} ph="2.5%"/>
            <F label="Notes" value={form.notes} onChange={v=>set('notes',v)} rows={3} ph="Any notes..."/>
            <div style={{ display:'flex', gap:'8px', marginTop:'12px' }}>
              {selected && (
                <button onClick={async()=>{if(!confirm('Delete?'))return;try{await remove(selected.id);toast('Deleted');setSelected(null)}catch(e){toast(e.message,'#DC2626')}}}
                  style={{ flex:1, background:'rgba(220,38,38,.08)', border:'1px solid rgba(220,38,38,.2)', borderRadius:'10px', color:'#DC2626', fontSize:'12px', fontWeight:700, padding:'11px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif' }}>
                  Delete
                </button>
              )}
              <button onClick={handleSave} disabled={saving}
                style={{ flex:2, background:'#CC2200', border:'none', borderRadius:'10px', color:'#fff', fontSize:'13px', fontWeight:700, padding:'11px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif', opacity:saving?.7:1 }}>
                {saving?'Saving…':selected?'Save Changes':'Add Listing'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function F({ label, value, onChange, ph='', type='text', rows }) {
  return (
    <div style={{ marginBottom:'10px' }}>
      {label && <label style={lblStyle}>{label}</label>}
      {rows ? <textarea value={value||''} onChange={e=>onChange(e.target.value)} placeholder={ph} rows={rows} style={{ ...inp, resize:'vertical', lineHeight:1.6 }}/>
             : <input type={type} value={value||''} onChange={e=>onChange(e.target.value)} placeholder={ph} style={inp}/>}
    </div>
  )
}

const inp      = { width:'100%', background:'var(--inp)', border:'1.5px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'12px', fontFamily:'Inter,system-ui,sans-serif', padding:'8px 10px', outline:'none', boxSizing:'border-box' }
const sel      = { background:'var(--inp)', border:'1.5px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'12px', fontFamily:'Inter,system-ui,sans-serif', padding:'8px 10px', outline:'none' }
const btnRed   = { background:'#CC2200', border:'none', borderRadius:'9px', color:'#fff', fontSize:'12px', fontWeight:700, padding:'9px 15px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif' }
const lblStyle = { display:'block', fontSize:'9px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.7px', marginBottom:'4px' }
