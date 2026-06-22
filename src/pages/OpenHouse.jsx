import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { getOpenHouses, createOpenHouse, deleteOpenHouse, getVisitors, createVisitor, updateVisitor } from '../lib/db/openhouse'
import { fmtDate, fmtTime } from '../lib/utils/format'
import { sendEmail } from '../lib/emailService'

const INTEREST = ['Hot','Warm','Cold']
const INTEREST_COLORS = { Hot:'#DC2626', Warm:'#D97706', Cold:'#94A3B8' }
const EMPTY_OH = { listing_addr:'', date:'', start_time:'10:00', end_time:'13:00', notes:'' }
const EMPTY_V  = { first_name:'', last_name:'', phone:'', email:'', interest_level:'Warm', notes:'' }

export function OpenHouse() {
  const { agent } = useAuth()
  const { toast } = useApp()
  const [openHouses, setOH]     = useState([])
  const [selected, setSelected] = useState(null)
  const [visitors, setVisitors] = useState([])
  const [loading, setLoading]   = useState(true)
  const [showAddOH, setAddOH]   = useState(false)
  const [showAddV, setAddV]     = useState(false)
  const [ohForm, setOHForm]     = useState(EMPTY_OH)
  const [vForm, setVForm]       = useState(EMPTY_V)
  const [saving, setSaving]     = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try { setOH(await getOpenHouses()) }
    catch(e) { toast('Load error: '+e.message,'#DC2626') }
    finally { setLoading(false) }
  }

  async function selectOH(oh) {
    setSelected(oh)
    try { setVisitors(await getVisitors(oh.id)) }
    catch(e) { setVisitors([]) }
  }

  async function addOH() {
    if(!ohForm.listing_addr.trim()||!ohForm.date) { toast('Address and date required','#DC2626'); return }
    setSaving(true)
    try {
      const d = await createOpenHouse({ ...ohForm, agent_id: agent?.id, active:true })
      setOH(p=>[d,...p]); setAddOH(false); setOHForm(EMPTY_OH); toast('✅ Open house added!')
    } catch(e) { toast('Error: '+e.message,'#DC2626') }
    finally { setSaving(false) }
  }

  async function addVisitor() {
    if(!vForm.first_name.trim()||!selected) { toast('Name required','#DC2626'); return }
    setSaving(true)
    try {
      const v = await createVisitor({ ...vForm, open_house_id: selected.id, listing_addr: selected.listing_addr })
      setVisitors(p=>[...p,v]); setAddV(false); setVForm(EMPTY_V); toast('✅ Visitor added!')
    } catch(e) { toast('Error: '+e.message,'#DC2626') }
    finally { setSaving(false) }
  }

  async function sendFollowUp(visitor) {
    if(!visitor.email) { toast('No email for this visitor','#DC2626'); return }
    try {
      await sendEmail({
        to: visitor.email,
        subject: `Thank you for visiting ${selected.listing_addr}!`,
        html: `<div style="font-family:Arial;padding:24px;max-width:500px;margin:0 auto;"><h2 style="color:#1B2B4B;">Thank you for visiting!</h2><p>Hi ${visitor.first_name},</p><p>Thank you for stopping by <strong>${selected.listing_addr}</strong>. We hope you loved the property!</p><p>Please don't hesitate to reach out if you have any questions. We'd love to help you find your perfect home.</p><p style="margin-top:24px;">Best regards,<br/><strong>${agent?.name}</strong><br/>Target Team · KW Valley Realty</p></div>`
      })
      await updateVisitor(visitor.id, { follow_up_sent: true })
      setVisitors(p=>p.map(v=>v.id===visitor.id?{...v,follow_up_sent:true}:v))
      toast('✅ Follow-up sent!')
    } catch(e) { toast('Error: '+e.message,'#DC2626') }
  }

  async function removeOH(id) {
    if(!confirm('Delete this open house?')) return
    try { await deleteOpenHouse(id); setOH(p=>p.filter(o=>o.id!==id)); if(selected?.id===id){setSelected(null);setVisitors([])} }
    catch(e) { toast(e.message,'#DC2626') }
  }

  const set = (k,v) => setOHForm(f=>({...f,[k]:v}))
  const sv  = (k,v) => setVForm(f=>({...f,[k]:v}))

  return (
    <div style={{ display:'grid', gridTemplateColumns:'300px 1fr', gap:'14px' }}>
      {/* Left — OH list */}
      <div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
          <div style={{ fontSize:'16px', fontWeight:900 }}>🏠 Open Houses</div>
          <button onClick={()=>setAddOH(true)} style={btnStyle}>+</button>
        </div>
        {loading && <div style={{ padding:'20px', textAlign:'center', color:'var(--muted)', fontSize:'12px' }}>Loading...</div>}
        {openHouses.map(oh=>(
          <div key={oh.id} onClick={()=>selectOH(oh)}
            style={{ background:'var(--panel)', border:`2px solid ${selected?.id===oh.id?'#CC2200':'var(--border)'}`, borderRadius:'12px', padding:'13px', marginBottom:'7px', cursor:'pointer' }}>
            <div style={{ fontSize:'13px', fontWeight:700, marginBottom:'3px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{oh.listing_addr}</div>
            <div style={{ fontSize:'11px', color:'var(--muted)' }}>{fmtDate(oh.date)} · {fmtTime(oh.start_time)}–{fmtTime(oh.end_time)}</div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'6px' }}>
              <span style={{ fontSize:'10px', background:'rgba(204,34,0,.1)', color:'#CC2200', borderRadius:'20px', padding:'2px 8px', fontWeight:600 }}>
                {oh.visitor_count||0} visitors
              </span>
              <button onClick={e=>{e.stopPropagation();removeOH(oh.id)}} style={{ background:'none', border:'none', cursor:'pointer', color:'#DC2626', fontSize:'12px' }}>🗑</button>
            </div>
          </div>
        ))}
        {!loading&&openHouses.length===0&&<div style={{ padding:'24px', textAlign:'center', color:'var(--muted)', fontSize:'12px', background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'12px' }}>No open houses yet</div>}
      </div>

      {/* Right — visitors */}
      {selected ? (
        <div>
          <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'14px', padding:'16px', marginBottom:'12px' }}>
            <div style={{ fontSize:'16px', fontWeight:800, marginBottom:'4px' }}>{selected.listing_addr}</div>
            <div style={{ fontSize:'12px', color:'var(--muted)' }}>{fmtDate(selected.date)} · {fmtTime(selected.start_time)}–{fmtTime(selected.end_time)}</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px', marginTop:'12px' }}>
              {[['Total',visitors.length,'#CC2200'],['Hot',visitors.filter(v=>v.interest_level==='Hot').length,'#DC2626'],['Emails',visitors.filter(v=>v.email).length,'#0EA5E9']].map(([k,v,c])=>(
                <div key={k} style={{ background:'var(--dim)', borderRadius:'9px', padding:'10px', textAlign:'center' }}>
                  <div style={{ fontSize:'9px', color:'var(--muted)', fontWeight:700, textTransform:'uppercase' }}>{k}</div>
                  <div style={{ fontSize:'20px', fontWeight:900, color:c }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
            <div style={{ fontSize:'14px', fontWeight:800 }}>Visitors ({visitors.length})</div>
            <button onClick={()=>setAddV(true)} style={btnStyle}>+ Add Visitor</button>
          </div>

          {visitors.length===0 ? <div style={{ padding:'32px', textAlign:'center', color:'var(--muted)', background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'12px' }}>No visitors yet</div>
          : visitors.map(v=>(
            <div key={v.id} style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'12px', padding:'13px 16px', marginBottom:'7px', display:'flex', alignItems:'center', gap:'12px' }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background:(INTEREST_COLORS[v.interest_level]||'#94A3B8')+'18', border:`2px solid ${INTEREST_COLORS[v.interest_level]||'#94A3B8'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', fontWeight:800, color:INTEREST_COLORS[v.interest_level]||'#94A3B8', flexShrink:0 }}>
                {v.first_name?.[0]||'?'}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'13px', fontWeight:700 }}>{v.first_name} {v.last_name}</div>
                <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:'2px' }}>
                  {v.phone&&<span>{v.phone} · </span>}{v.email||'No email'}
                </div>
              </div>
              <div style={{ display:'flex', gap:'6px', alignItems:'center', flexShrink:0 }}>
                <select value={v.interest_level} onChange={async e=>{const il=e.target.value;try{await updateVisitor(v.id,{interest_level:il});setVisitors(p=>p.map(x=>x.id===v.id?{...x,interest_level:il}:x))}catch(e2){toast(e2.message,'#DC2626')}}}
                  style={{ background:(INTEREST_COLORS[v.interest_level]||'#94A3B8')+'15', border:`1.5px solid ${(INTEREST_COLORS[v.interest_level]||'#94A3B8')}40`, borderRadius:'7px', color:INTEREST_COLORS[v.interest_level]||'#94A3B8', fontSize:'11px', fontWeight:700, fontFamily:'Inter,system-ui,sans-serif', padding:'4px 7px', outline:'none', cursor:'pointer' }}>
                  {INTEREST.map(i=><option key={i}>{i}</option>)}
                </select>
                {v.email && (
                  <button onClick={()=>sendFollowUp(v)}
                    style={{ fontSize:'10px', fontWeight:700, padding:'4px 9px', borderRadius:'7px', border:'1px solid var(--border)', background:v.follow_up_sent?'rgba(22,163,74,.08)':'var(--dim)', color:v.follow_up_sent?'#16A34A':'var(--text)', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif' }}>
                    {v.follow_up_sent?'✓ Sent':'Send'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding:'48px', textAlign:'center', color:'var(--muted)', background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'14px' }}>
          <div style={{ fontSize:'28px', marginBottom:'10px' }}>🏠</div>
          <div style={{ fontSize:'13px', fontWeight:600 }}>Select an open house to see visitors</div>
        </div>
      )}

      {/* Add OH modal */}
      {showAddOH && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,padding:'16px' }} onClick={e=>{if(e.target===e.currentTarget)setAddOH(false)}}>
          <div style={{ background:'var(--panel)',borderRadius:'16px',padding:'24px',width:'100%',maxWidth:'400px' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'18px' }}>
              <div style={{ fontSize:'16px',fontWeight:800 }}>Add Open House</div>
              <button onClick={()=>setAddOH(false)} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'20px' }}>✕</button>
            </div>
            <F label="Listing Address *" value={ohForm.listing_addr} onChange={v=>set('listing_addr',v)} ph="47 Prairie Ave, Suffern NY"/>
            <F label="Date *" value={ohForm.date} onChange={v=>set('date',v)} type="date"/>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px' }}>
              <F label="Start Time" value={ohForm.start_time} onChange={v=>set('start_time',v)} type="time"/>
              <F label="End Time"   value={ohForm.end_time}   onChange={v=>set('end_time',v)}   type="time"/>
            </div>
            <div style={{ display:'flex',gap:'8px',marginTop:'12px' }}>
              <button onClick={()=>setAddOH(false)} style={{ flex:1,...cancelBtn }}>Cancel</button>
              <button onClick={addOH} disabled={saving} style={{ flex:2,...saveBtn,opacity:saving?.7:1 }}>{saving?'Adding…':'Add Open House'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add visitor modal */}
      {showAddV && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,padding:'16px' }} onClick={e=>{if(e.target===e.currentTarget)setAddV(false)}}>
          <div style={{ background:'var(--panel)',borderRadius:'16px',padding:'24px',width:'100%',maxWidth:'400px' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'18px' }}>
              <div style={{ fontSize:'16px',fontWeight:800 }}>Add Visitor</div>
              <button onClick={()=>setAddV(false)} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'20px' }}>✕</button>
            </div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px' }}>
              <F label="First Name *" value={vForm.first_name} onChange={v=>sv('first_name',v)} ph="John"/>
              <F label="Last Name"    value={vForm.last_name}  onChange={v=>sv('last_name',v)}  ph="Smith"/>
            </div>
            <F label="Phone" value={vForm.phone} onChange={v=>sv('phone',v)} ph="(845) 555-1234"/>
            <F label="Email" value={vForm.email} onChange={v=>sv('email',v)} ph="john@email.com"/>
            <div style={{ marginBottom:'10px' }}>
              <label style={lbl}>Interest Level</label>
              <select value={vForm.interest_level} onChange={e=>sv('interest_level',e.target.value)} style={{ ...inp,display:'block' }}>
                {INTEREST.map(i=><option key={i}>{i}</option>)}
              </select>
            </div>
            <F label="Notes" value={vForm.notes} onChange={v=>sv('notes',v)} rows={2} ph="Any notes..."/>
            <div style={{ display:'flex',gap:'8px',marginTop:'12px' }}>
              <button onClick={()=>setAddV(false)} style={{ flex:1,...cancelBtn }}>Cancel</button>
              <button onClick={addVisitor} disabled={saving} style={{ flex:2,...saveBtn,opacity:saving?.7:1 }}>{saving?'Adding…':'Add Visitor'}</button>
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
      {label&&<label style={lbl}>{label}</label>}
      {rows ? <textarea value={value||''} onChange={e=>onChange(e.target.value)} placeholder={ph} rows={rows} style={{ ...inp,resize:'vertical',lineHeight:1.6 }}/>
             : <input type={type} value={value||''} onChange={e=>onChange(e.target.value)} placeholder={ph} style={inp}/>}
    </div>
  )
}

const inp       = { width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'8px 10px',outline:'none',boxSizing:'border-box' }
const lbl       = { display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px' }
const btnStyle  = { background:'#CC2200',border:'none',borderRadius:'9px',color:'#fff',fontSize:'12px',fontWeight:700,padding:'9px 15px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }
const cancelBtn = { background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'10px',color:'var(--text)',fontSize:'12px',fontWeight:600,padding:'11px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }
const saveBtn   = { background:'#CC2200',border:'none',borderRadius:'10px',color:'#fff',fontSize:'13px',fontWeight:700,padding:'11px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }
