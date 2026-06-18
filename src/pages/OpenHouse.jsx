import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Card, CardHeader, Btn } from '../components/UI'
import { useConfirm } from '../components/ConfirmDialog'
import { AGENTS } from '../lib/constants'
import { sendEmail } from '../lib/emailService'

const INTEREST = ['Hot','Warm','Cold','Just Looking','No Interest']

export function OpenHouse() {
  const { state, toast } = useApp()
  const { confirm, ConfirmDialog } = useConfirm()
  const [openHouses, setOpenHouses] = useState([])
  const [visitors, setVisitors] = useState([])
  const [selectedOH, setSelectedOH] = useState(null)
  const [showAddOH, setShowAddOH] = useState(false)
  const [showSignIn, setShowSignIn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [ohForm, setOhForm] = useState({ listing_addr:'', date:'', start_time:'', end_time:'', agent_name:'', notes:'' })
  const [visitorForm, setVisitorForm] = useState({ first_name:'', last_name:'', phone:'', email:'', interest_level:'Warm', notes:'' })
  const [sending, setSending] = useState(false)

  useEffect(() => { loadOpenHouses() }, [])
  useEffect(() => { if(selectedOH) loadVisitors(selectedOH.id) }, [selectedOH])

  async function loadOpenHouses() {
    setLoading(true)
    const { data } = await supabase.from('open_houses').select('*').order('date', { ascending: false })
    setOpenHouses(data || [])
    if(data?.length && !selectedOH) setSelectedOH(data[0])
    setLoading(false)
  }

  async function loadVisitors(ohId) {
    const { data } = await supabase.from('oh_visitors').select('*').eq('open_house_id', ohId).order('visited_at', { ascending: false })
    setVisitors(data || [])
  }

  async function saveOpenHouse() {
    if(!ohForm.listing_addr.trim() || !ohForm.date) { toast('Address and date required', '#DC2626'); return }
    const { data, error } = await supabase.from('open_houses').insert([{
      listing_addr: ohForm.listing_addr.trim(),
      date: ohForm.date,
      start_time: ohForm.start_time || null,
      end_time: ohForm.end_time || null,
      agent_name: ohForm.agent_name || state.currentAgent?.name,
      notes: ohForm.notes,
      active: true,
    }]).select()
    if(error) { toast('Failed: ' + error.message, '#DC2626'); return }
    toast('✅ Open house scheduled!')
    setShowAddOH(false)
    setOhForm({ listing_addr:'', date:'', start_time:'', end_time:'', agent_name:'', notes:'' })
    await loadOpenHouses()
    if(data?.[0]) setSelectedOH(data[0])
  }

  async function signInVisitor() {
    if(!visitorForm.first_name.trim()) { toast('First name required', '#DC2626'); return }
    const { error } = await supabase.from('oh_visitors').insert([{
      open_house_id: selectedOH?.id,
      listing_addr: selectedOH?.listing_addr,
      first_name: visitorForm.first_name.trim(),
      last_name: visitorForm.last_name.trim(),
      phone: visitorForm.phone,
      email: visitorForm.email,
      interest_level: visitorForm.interest_level,
      notes: visitorForm.notes,
      agent_id: state.user?.id,
    }])
    if(error) { toast('Failed: ' + error.message, '#DC2626'); return }

    // Auto-create follow-up task
    await supabase.from('tasks').insert([{
      title: `Follow up — ${visitorForm.first_name} ${visitorForm.last_name} (Open House: ${selectedOH?.listing_addr})`,
      priority: 'high',
      status: 'pending',
      due_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      assigned_to: state.user?.id,
      created_by: state.user?.id,
    }])

    toast(`✅ ${visitorForm.first_name} signed in! Follow-up task created.`)
    setShowSignIn(false)
    setVisitorForm({ first_name:'', last_name:'', phone:'', email:'', interest_level:'Warm', notes:'' })
    loadVisitors(selectedOH.id)
  }

  async function sendFollowUp(visitor) {
    if(!visitor.email) { toast('No email on file for this visitor', '#DC2626'); return }
    setSending(visitor.id)
    const result = await sendEmail({
      to: visitor.email,
      subject: `Thank you for visiting ${selectedOH?.listing_addr}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px;">
          <div style="background:#1B2B4B;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
            <div style="color:#fff;font-size:20px;font-weight:800;">Target<span style="color:#F5A623;">Team</span></div>
          </div>
          <div style="background:#fff;padding:28px;border:1px solid #E2E8F0;border-top:none;">
            <p style="font-size:15px;color:#1E293B;margin:0 0 16px;">Hi ${visitor.first_name}!</p>
            <p style="font-size:14px;color:#334155;line-height:1.7;margin:0 0 16px;">
              Thank you for visiting <strong>${selectedOH?.listing_addr}</strong> today. It was a pleasure meeting you!
            </p>
            <p style="font-size:14px;color:#334155;line-height:1.7;margin:0 0 20px;">
              If you have any questions about this property or would like to schedule a private showing, we'd love to hear from you.
            </p>
            <div style="text-align:center;">
              <a href="tel:8454241014" style="background:#CC2200;color:#fff;text-decoration:none;padding:13px 28px;border-radius:9px;font-size:14px;font-weight:700;display:inline-block;">Call Us: 845.424.1014</a>
            </div>
          </div>
          <div style="background:#F8FAFC;padding:16px 24px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;text-align:center;font-size:11px;color:#94A3B8;">
            Target Team · Keller Williams Valley Realty · 845.424.1014
          </div>
        </div>`
    })
    if(result.success) {
      await supabase.from('oh_visitors').update({ follow_up_sent: true }).eq('id', visitor.id)
      toast(`✅ Follow-up sent to ${visitor.email}!`)
      loadVisitors(selectedOH.id)
    } else {
      toast('Send failed: ' + result.error, '#DC2626')
    }
    setSending(null)
  }

  async function sendFollowUpAll() {
    const withEmail = visitors.filter(v => v.email && !v.follow_up_sent)
    if(!withEmail.length) { toast('No visitors with unsent emails', '#DC2626'); return }
    setSending('all')
    let sent = 0
    for(const v of withEmail) {
      await sendFollowUp(v)
      sent++
      await new Promise(r => setTimeout(r, 200))
    }
    setSending(null)
    toast(`✅ Follow-up sent to ${sent} visitors!`)
  }

  async function deleteOH(id) {
    confirm({ title:'Delete Open House?', message:'This will also delete all visitor records.', confirmLabel:'Delete', onConfirm: async () => {
      await supabase.from('oh_visitors').delete().eq('open_house_id', id)
      await supabase.from('open_houses').delete().eq('id', id)
      toast('Deleted')
      setSelectedOH(null)
      setVisitors([])
      loadOpenHouses()
    }})
  }

  const setV = (k,v) => setVisitorForm(f=>({...f,[k]:v}))
  const setO = (k,v) => setOhForm(f=>({...f,[k]:v}))

  return (
    <div>
      <ConfirmDialog/>

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px',flexWrap:'wrap',gap:'8px'}}>
        <div>
          <div style={{fontSize:'20px',fontWeight:900}}>🏡 Open Houses</div>
          <div style={{fontSize:'12px',color:'var(--muted)',marginTop:'2px'}}>{openHouses.length} scheduled · {visitors.length} visitors today</div>
        </div>
        <Btn size="sm" onClick={()=>setShowAddOH(true)}>+ Schedule Open House</Btn>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'280px 1fr',gap:'14px'}}>
        {/* Open House list */}
        <div>
          {loading ? <div style={{padding:'20px',textAlign:'center',color:'var(--muted)',fontSize:'12px'}}>Loading...</div>
          : openHouses.length === 0
          ? <Card style={{padding:'24px',textAlign:'center'}}>
              <div style={{fontSize:'28px',marginBottom:'10px'}}>🏡</div>
              <div style={{fontSize:'13px',fontWeight:700,marginBottom:'6px'}}>No open houses yet</div>
              <Btn size="sm" onClick={()=>setShowAddOH(true)}>Schedule First One</Btn>
            </Card>
          : openHouses.map(oh => (
            <div key={oh.id} onClick={()=>setSelectedOH(oh)}
              style={{background:'var(--panel)',border:'2px solid '+(selectedOH?.id===oh.id?'#CC2200':'var(--border)'),borderRadius:'12px',padding:'13px 15px',marginBottom:'8px',cursor:'pointer',transition:'border-color .15s'}}>
              <div style={{fontSize:'13px',fontWeight:700,marginBottom:'3px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{oh.listing_addr}</div>
              <div style={{fontSize:'11px',color:'var(--muted)'}}>
                {new Date(oh.date+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}
                {oh.start_time ? ' · ' + fmtTime(oh.start_time) : ''}
                {oh.end_time ? ' – ' + fmtTime(oh.end_time) : ''}
              </div>
              <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>{oh.agent_name}</div>
            </div>
          ))}
        </div>

        {/* Visitor panel */}
        <div>
          {selectedOH ? (
            <>
              <Card style={{marginBottom:'12px'}}>
                <div style={{padding:'16px',display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'8px'}}>
                  <div>
                    <div style={{fontSize:'16px',fontWeight:800}}>{selectedOH.listing_addr}</div>
                    <div style={{fontSize:'12px',color:'var(--muted)',marginTop:'3px'}}>
                      {new Date(selectedOH.date+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
                      {selectedOH.start_time ? ' · ' + fmtTime(selectedOH.start_time) : ''}
                      {selectedOH.end_time ? ' – ' + fmtTime(selectedOH.end_time) : ''}
                    </div>
                    <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>Agent: {selectedOH.agent_name}</div>
                  </div>
                  <div style={{display:'flex',gap:'7px',flexWrap:'wrap'}}>
                    <Btn size="sm" variant="ghost" onClick={()=>sendFollowUpAll()} disabled={sending==='all'}>
                      {sending==='all' ? 'Sending...' : `📧 Follow-up All (${visitors.filter(v=>v.email&&!v.follow_up_sent).length})`}
                    </Btn>
                    <Btn size="sm" onClick={()=>setShowSignIn(true)}>+ Sign In Visitor</Btn>
                    <button onClick={()=>deleteOH(selectedOH.id)} style={{background:'none',border:'1px solid var(--border)',borderRadius:'8px',color:'#DC2626',fontSize:'11px',padding:'6px 10px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>🗑</button>
                  </div>
                </div>

                {/* Stats */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'8px',padding:'0 16px 16px'}}>
                  {[
                    ['Total', visitors.length, '#CC2200'],
                    ['Hot', visitors.filter(v=>v.interest_level==='Hot').length, '#DC2626'],
                    ['Warm', visitors.filter(v=>v.interest_level==='Warm').length, '#D97706'],
                    ['Follow-up Sent', visitors.filter(v=>v.follow_up_sent).length, '#16A34A'],
                  ].map(([k,v,c])=>(
                    <div key={k} style={{background:'var(--dim)',borderRadius:'9px',padding:'11px',textAlign:'center'}}>
                      <div style={{fontSize:'20px',fontWeight:900,color:c}}>{v}</div>
                      <div style={{fontSize:'10px',color:'var(--muted)',fontWeight:600,marginTop:'2px'}}>{k}</div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Visitor list */}
              <Card>
                <div style={{padding:'10px 16px 0',fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px'}}>
                  Visitors ({visitors.length})
                </div>
                {visitors.length === 0
                  ? <div style={{padding:'30px',textAlign:'center',color:'var(--muted)',fontSize:'13px'}}>No visitors yet — click "+ Sign In Visitor"</div>
                  : visitors.map(v => (
                    <div key={v.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'12px 16px',borderBottom:'1px solid var(--border)'}}>
                      <div style={{width:36,height:36,borderRadius:'50%',background:interestColor(v.interest_level)+'18',border:'2px solid '+interestColor(v.interest_level),display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:800,color:interestColor(v.interest_level),flexShrink:0}}>
                        {v.first_name?.[0]||'?'}{v.last_name?.[0]||''}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:'13px',fontWeight:700}}>{v.first_name} {v.last_name}</div>
                        <div style={{fontSize:'11px',color:'var(--muted)'}}>
                          {v.phone && <span>{v.phone} · </span>}
                          {v.email && <span>{v.email} · </span>}
                          <span style={{color:interestColor(v.interest_level),fontWeight:600}}>{v.interest_level}</span>
                        </div>
                        {v.notes && <div style={{fontSize:'10px',color:'var(--muted)',marginTop:'2px',fontStyle:'italic'}}>{v.notes}</div>}
                      </div>
                      <div style={{display:'flex',gap:'5px',flexShrink:0}}>
                        {v.phone && <a href={'tel:'+v.phone.replace(/\D/g,'')} style={{textDecoration:'none'}}><div style={{width:30,height:30,borderRadius:'50%',background:'rgba(16,185,129,.1)',border:'1px solid rgba(16,185,129,.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px',cursor:'pointer'}}>📞</div></a>}
                        {v.email && <div onClick={()=>sendFollowUp(v)} style={{width:30,height:30,borderRadius:'50%',background:v.follow_up_sent?'rgba(22,163,74,.1)':'rgba(14,165,233,.1)',border:'1px solid '+(v.follow_up_sent?'rgba(22,163,74,.3)':'rgba(14,165,233,.3)'),display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px',cursor:'pointer'}} title={v.follow_up_sent?'Follow-up sent':'Send follow-up'}>
                          {sending===v.id?'⏳':v.follow_up_sent?'✅':'📧'}
                        </div>}
                      </div>
                    </div>
                  ))
                }
              </Card>
            </>
          ) : (
            <Card style={{padding:'40px',textAlign:'center'}}>
              <div style={{fontSize:'32px',marginBottom:'12px'}}>🏡</div>
              <div style={{fontSize:'14px',fontWeight:700,marginBottom:'6px',color:'var(--muted)'}}>Select an open house to manage visitors</div>
            </Card>
          )}
        </div>
      </div>

      {/* Schedule OH modal */}
      {showAddOH && (
        <Modal onClose={()=>setShowAddOH(false)} title="Schedule Open House">
          <FI label="Property Address" value={ohForm.listing_addr} onChange={v=>setO('listing_addr',v)} ph="47 Prairie Ave, Suffern NY 10901"/>
          <FI label="Date" value={ohForm.date} onChange={v=>setO('date',v)} type="date"/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
            <FI label="Start Time" value={ohForm.start_time} onChange={v=>setO('start_time',v)} type="time"/>
            <FI label="End Time" value={ohForm.end_time} onChange={v=>setO('end_time',v)} type="time"/>
          </div>
          <div style={{marginBottom:'12px'}}>
            <label style={lblStyle}>Agent</label>
            <select value={ohForm.agent_name} onChange={e=>setO('agent_name',e.target.value)} style={selStyle}>
              <option value="">Select agent...</option>
              {AGENTS.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          </div>
          <FI label="Notes" value={ohForm.notes} onChange={v=>setO('notes',v)} ph="Any special instructions..." rows={2}/>
          <div style={{display:'flex',gap:'8px',marginTop:'4px'}}>
            <Btn variant="ghost" onClick={()=>setShowAddOH(false)} style={{flex:1}}>Cancel</Btn>
            <Btn onClick={saveOpenHouse} style={{flex:2}}>Schedule</Btn>
          </div>
        </Modal>
      )}

      {/* Sign in visitor modal */}
      {showSignIn && (
        <Modal onClose={()=>setShowSignIn(false)} title={`Sign In — ${selectedOH?.listing_addr}`}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
            <FI label="First Name *" value={visitorForm.first_name} onChange={v=>setV('first_name',v)} ph="John"/>
            <FI label="Last Name" value={visitorForm.last_name} onChange={v=>setV('last_name',v)} ph="Smith"/>
          </div>
          <FI label="Phone" value={visitorForm.phone} onChange={v=>setV('phone',v)} ph="(845) 555-1234" type="tel"/>
          <FI label="Email" value={visitorForm.email} onChange={v=>setV('email',v)} ph="john@email.com" type="email"/>
          <div style={{marginBottom:'12px'}}>
            <label style={lblStyle}>Interest Level</label>
            <select value={visitorForm.interest_level} onChange={e=>setV('interest_level',e.target.value)} style={selStyle}>
              {INTEREST.map(i=><option key={i}>{i}</option>)}
            </select>
          </div>
          <FI label="Notes" value={visitorForm.notes} onChange={v=>setV('notes',v)} ph="Any observations..." rows={2}/>
          <div style={{background:'rgba(245,158,11,.07)',border:'1px solid rgba(245,158,11,.22)',borderRadius:'9px',padding:'9px 12px',marginBottom:'12px',fontSize:'11px',color:'#D97706'}}>
            ⏰ A follow-up task will be automatically created for tomorrow
          </div>
          <div style={{display:'flex',gap:'8px'}}>
            <Btn variant="ghost" onClick={()=>setShowSignIn(false)} style={{flex:1}}>Cancel</Btn>
            <Btn onClick={signInVisitor} style={{flex:2}}>✅ Sign In</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({ onClose, title, children }) {
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,padding:'16px'}} onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{background:'var(--panel)',borderRadius:'16px',padding:'24px',width:'100%',maxWidth:'460px',maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'18px'}}>
          <div style={{fontSize:'16px',fontWeight:800}}>{title}</div>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'20px',lineHeight:1}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FI({ label, value, onChange, ph='', type='text', rows }) {
  return (
    <div style={{marginBottom:'12px'}}>
      <label style={lblStyle}>{label}</label>
      {rows ? <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} rows={rows} style={{...selStyle,resize:'vertical',lineHeight:1.6}}/> : <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} style={selStyle}/>}
    </div>
  )
}

function fmtTime(t) { if(!t)return''; const [h,m]=t.split(':').map(Number); return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}` }
function interestColor(i) { return {Hot:'#DC2626',Warm:'#D97706','Just Looking':'#0EA5E9',Cold:'#94A3B8','No Interest':'#CBD5E1'}[i]||'#94A3B8' }
const lblStyle = { display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px' }
const selStyle = { width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 11px',outline:'none',boxSizing:'border-box' }
