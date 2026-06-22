import React, { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCalendar } from '../lib/hooks/useCalendar'
import { useApp } from '../context/AppContext'
import { fmtTime } from '../lib/utils/format'

const EVENT_TYPES = ['appointment','showing','open house','closing','inspection','meeting','personal','other']
const TYPE_COLORS = { appointment:'#CC2200',showing:'#0EA5E9','open house':'#D97706',closing:'#16A34A',inspection:'#7C3AED',meeting:'#E8650A',personal:'#14B8A6',other:'#94A3B8' }
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const EMPTY = { title:'', type:'appointment', start_date:'', start_time:'', end_time:'', all_day:false, location:'', description:'', color:'#CC2200' }

export function Calendar() {
  const { agent } = useAuth()
  const { toast } = useApp()
  const [today]         = useState(new Date())
  const [viewDate, setViewDate] = useState(new Date())
  const [selected, setSelected] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(EMPTY)
  const [saving, setSaving]     = useState(false)

  const year  = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const startDate = `${year}-${String(month+1).padStart(2,'0')}-01`
  const endDate   = `${year}-${String(month+1).padStart(2,'0')}-${String(daysInMonth).padStart(2,'0')}`

  const { events, loading, add, update, remove } = useCalendar({ agentId: agent?.id, startDate, endDate })

  const set = (k,v) => setForm(f=>({...f,[k]:v, ...(k==='type'?{color:TYPE_COLORS[v]||'#CC2200'}:{})}))

  function getEventsForDay(day) {
    const d = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    return events.filter(e => e.start_date === d)
  }

  function openDay(day) {
    const d = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    setForm({ ...EMPTY, start_date: d })
    setSelected(null)
    setShowForm(true)
  }

  function openEvent(e) {
    setForm({ ...EMPTY, ...e })
    setSelected(e)
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.title.trim() || !form.start_date) { toast('Title and date required','#DC2626'); return }
    setSaving(true)
    try {
      if (selected) { await update(selected.id, { ...form, agent_id: agent?.id }); toast('✅ Event updated!') }
      else          { await add({ ...form, agent_id: agent?.id }); toast('✅ Event added!') }
      setShowForm(false); setSelected(null); setForm(EMPTY)
    } catch(e) { toast('Error: '+e.message,'#DC2626') }
    finally { setSaving(false) }
  }

  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`

  const upcoming = events.filter(e => e.start_date >= todayStr).sort((a,b)=>a.start_date.localeCompare(b.start_date)).slice(0,8)

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 260px', gap:'14px' }}>
      {/* Calendar grid */}
      <div>
        {/* Month nav */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px' }}>
          <button onClick={()=>setViewDate(new Date(year,month-1,1))} style={navBtn}>←</button>
          <div style={{ fontSize:'18px', fontWeight:900 }}>{MONTHS[month]} {year}</div>
          <button onClick={()=>setViewDate(new Date(year,month+1,1))} style={navBtn}>→</button>
        </div>

        {/* Day headers */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'2px', marginBottom:'4px' }}>
          {DAYS.map(d=><div key={d} style={{ fontSize:'10px', fontWeight:700, color:'var(--muted)', textAlign:'center', padding:'4px' }}>{d}</div>)}
        </div>

        {/* Calendar cells */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'2px' }}>
          {Array(firstDay).fill(null).map((_,i)=><div key={'e'+i}/>)}
          {Array(daysInMonth).fill(null).map((_,i)=>{
            const day = i+1
            const dayStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
            const dayEvents = getEventsForDay(day)
            const isToday = dayStr === todayStr
            return (
              <div key={day} onClick={()=>openDay(day)}
                style={{ minHeight:'80px', background:'var(--panel)', border:`1.5px solid ${isToday?'#CC2200':'var(--border)'}`, borderRadius:'8px', padding:'6px', cursor:'pointer', transition:'background .1s' }}
                onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'}
                onMouseLeave={e=>e.currentTarget.style.background='var(--panel)'}>
                <div style={{ fontSize:'12px', fontWeight:isToday?900:500, color:isToday?'#CC2200':'var(--text)', marginBottom:'4px' }}>{day}</div>
                {dayEvents.slice(0,3).map(ev=>(
                  <div key={ev.id} onClick={e=>{e.stopPropagation();openEvent(ev)}}
                    style={{ fontSize:'10px', fontWeight:600, padding:'2px 5px', borderRadius:'4px', marginBottom:'2px', background:(ev.color||'#CC2200')+'18', color:ev.color||'#CC2200', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {ev.start_time&&<span>{fmtTime(ev.start_time)} </span>}{ev.title}
                  </div>
                ))}
                {dayEvents.length>3&&<div style={{ fontSize:'9px', color:'var(--muted)', fontWeight:600 }}>+{dayEvents.length-3} more</div>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Upcoming sidebar */}
      <div>
        <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'14px', overflow:'hidden' }}>
          <div style={{ padding:'13px 16px', borderBottom:'1px solid var(--border)', fontSize:'13px', fontWeight:700 }}>📅 Upcoming</div>
          {loading && <div style={{ padding:'20px', textAlign:'center', color:'var(--muted)', fontSize:'12px' }}>Loading...</div>}
          {!loading && upcoming.length===0 && <div style={{ padding:'20px', textAlign:'center', color:'var(--muted)', fontSize:'12px' }}>No upcoming events</div>}
          {upcoming.map(ev=>(
            <div key={ev.id} onClick={()=>openEvent(ev)} style={{ padding:'11px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer', borderLeft:`3px solid ${ev.color||'#CC2200'}` }}
              onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div style={{ fontSize:'12px', fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ev.title}</div>
              <div style={{ fontSize:'10px', color:'var(--muted)', marginTop:'2px' }}>
                {ev.start_date} {ev.start_time&&fmtTime(ev.start_time)}
              </div>
            </div>
          ))}
          <div style={{ padding:'12px 16px' }}>
            <button onClick={()=>{setForm({...EMPTY,start_date:todayStr});setSelected(null);setShowForm(true)}} style={{ width:'100%', background:'#CC2200', border:'none', borderRadius:'9px', color:'#fff', fontSize:'12px', fontWeight:700, padding:'9px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif' }}>
              + Add Event
            </button>
          </div>
        </div>
      </div>

      {/* Event form modal */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999, padding:'16px' }}
          onClick={e=>{if(e.target===e.currentTarget){setShowForm(false);setSelected(null)}}}>
          <div style={{ background:'var(--panel)', borderRadius:'16px', padding:'24px', width:'100%', maxWidth:'440px', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'18px' }}>
              <div style={{ fontSize:'16px', fontWeight:800 }}>{selected?'Edit Event':'Add Event'}</div>
              <button onClick={()=>{setShowForm(false);setSelected(null)}} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:'20px' }}>✕</button>
            </div>
            <F label="Title *" value={form.title} onChange={v=>set('title',v)} ph="Showing at 47 Prairie Ave"/>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
              <div><label style={lbl}>Type</label>
                <select value={form.type} onChange={e=>set('type',e.target.value)} style={{ ...inp, display:'block' }}>
                  {EVENT_TYPES.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                </select>
              </div>
              <F label="Date *" value={form.start_date} onChange={v=>set('start_date',v)} type="date"/>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
              <F label="Start Time" value={form.start_time} onChange={v=>set('start_time',v)} type="time"/>
              <F label="End Time"   value={form.end_time}   onChange={v=>set('end_time',v)}   type="time"/>
            </div>
            <F label="Location" value={form.location} onChange={v=>set('location',v)} ph="47 Prairie Ave, Suffern NY"/>
            <F label="Notes"    value={form.description} onChange={v=>set('description',v)} rows={2} ph="Any notes..."/>
            <div style={{ display:'flex', gap:'8px', marginTop:'12px' }}>
              {selected&&<button onClick={async()=>{try{await remove(selected.id);toast('Deleted');setShowForm(false);setSelected(null)}catch(e){toast(e.message,'#DC2626')}}}
                style={{ flex:1, background:'rgba(220,38,38,.08)', border:'1px solid rgba(220,38,38,.2)', borderRadius:'10px', color:'#DC2626', fontSize:'12px', fontWeight:700, padding:'11px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif' }}>Delete</button>}
              <button onClick={handleSave} disabled={saving}
                style={{ flex:2, background:'#CC2200', border:'none', borderRadius:'10px', color:'#fff', fontSize:'13px', fontWeight:700, padding:'11px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif', opacity:saving?.7:1 }}>
                {saving?'Saving…':selected?'Save Changes':'Add Event'}
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
      {label&&<label style={lbl}>{label}</label>}
      {rows ? <textarea value={value||''} onChange={e=>onChange(e.target.value)} placeholder={ph} rows={rows} style={{ ...inp, resize:'vertical', lineHeight:1.6 }}/>
             : <input type={type} value={value||''} onChange={e=>onChange(e.target.value)} placeholder={ph} style={inp}/>}
    </div>
  )
}

const navBtn = { background:'var(--dim)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'14px', padding:'7px 14px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif' }
const inp    = { width:'100%', background:'var(--inp)', border:'1.5px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'12px', fontFamily:'Inter,system-ui,sans-serif', padding:'8px 10px', outline:'none', boxSizing:'border-box' }
const lbl    = { display:'block', fontSize:'9px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.7px', marginBottom:'4px' }
