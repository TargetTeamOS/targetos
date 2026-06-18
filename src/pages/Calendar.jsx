import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Card, Btn, Input } from '../components/UI'
import { useConfirm } from '../components/ConfirmDialog'
import { AGENTS } from '../lib/constants'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const EVENT_TYPES = ['Showing','Open House','Closing','Meeting','Call','Appointment','Inspection','Other']
const EVENT_COLORS = { Showing:'#0EA5E9',  'Open House':'#F59E0B', Closing:'#16A34A', Meeting:'#7C3AED', Call:'#CC2200', Appointment:'#E8650A', Inspection:'#14B8A6', Other:'#94A3B8' }

export function Calendar({ setPage }) {
  const { state, toast } = useApp()
  const { confirm, ConfirmDialog } = useConfirm()
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth())
  const [year, setYear]   = useState(now.getFullYear())
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState(null)
  const [selectedDay, setSelectedDay] = useState(null)
  const [form, setForm] = useState({ title:'', type:'Showing', date:'', start_time:'', end_time:'', location:'', agent_name:'', description:'', all_day:false })

  useEffect(() => { loadEvents() }, [month, year])

  async function loadEvents() {
    setLoading(true)
    const start = `${year}-${String(month+1).padStart(2,'0')}-01`
    const end   = `${year}-${String(month+1).padStart(2,'0')}-31`
    try {
      const { data, error } = await supabase.from('calendar_events')
        .select('*').gte('start_date', start).lte('start_date', end).order('start_date').order('start_time')
      if(error) throw error
      setEvents(data || [])
    } catch(e) {
      // Table might not exist yet
      console.log('Calendar table not ready:', e.message)
      setEvents([])
    }
    setLoading(false)
  }

  async function saveEvent() {
    if(!form.title.trim() || !form.date) { toast('Title and date are required','#DC2626'); return }
    const payload = {
      title: form.title.trim(),
      type: form.type,
      start_date: form.date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      location: form.location || null,
      agent_name: form.agent_name || state.currentAgent?.name || '',
      agent_id: state.user?.id,
      description: form.description || null,
      all_day: form.all_day,
      color: EVENT_COLORS[form.type] || '#CC2200',
    }
    if(editing) {
      const { error } = await supabase.from('calendar_events').update(payload).eq('id', editing)
      if(error) { toast('Save failed: '+error.message,'#DC2626'); return }
      toast('Event updated!')
    } else {
      const { error } = await supabase.from('calendar_events').insert([payload])
      if(error) { toast('Save failed: '+error.message,'#DC2626'); return }
      toast('Event added!')
    }
    setShowAdd(false); setEditing(null)
    resetForm(); loadEvents()
  }

  async function deleteEvent(id) {
    const ev = events.find(e=>e.id===id)
    confirm({ title:'Delete Event?', message:`Delete "${ev?.title}"?`, confirmLabel:'Delete', onConfirm: async()=>{
      await supabase.from('calendar_events').delete().eq('id',id)
      toast('Event deleted'); loadEvents()
    }})
  }

  function openAdd(date='') {
    resetForm()
    if(date) setForm(f=>({...f,date}))
    setEditing(null); setShowAdd(true)
  }

  function openEdit(ev) {
    setForm({ title:ev.title, type:ev.type||'Other', date:ev.start_date, start_time:ev.start_time||'', end_time:ev.end_time||'', location:ev.location||'', agent_name:ev.agent_name||'', description:ev.description||'', all_day:ev.all_day||false })
    setEditing(ev.id); setShowAdd(true)
  }

  function resetForm() {
    setForm({ title:'', type:'Showing', date:'', start_time:'', end_time:'', location:'', agent_name:state.currentAgent?.name||'', description:'', all_day:false })
  }

  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month+1, 0).getDate()
  const cells = []
  for(let i=0;i<firstDay;i++) cells.push(null)
  for(let d=1;d<=daysInMonth;d++) cells.push(d)

  function eventsForDay(d) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    return events.filter(e=>e.start_date===dateStr)
  }

  // Upcoming events (next 7 days)
  const todayStr = now.toISOString().split('T')[0]
  const upcoming = events.filter(e=>e.start_date>=todayStr).slice(0,8)

  return (
    <div>
      <ConfirmDialog/>

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px',flexWrap:'wrap',gap:'8px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
          <button onClick={()=>{if(month===0){setMonth(11);setYear(y=>y-1)}else setMonth(m=>m-1)}} style={{background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'16px',width:36,height:36,cursor:'pointer'}}>←</button>
          <div style={{fontSize:'18px',fontWeight:800,minWidth:'180px',textAlign:'center'}}>{MONTHS[month]} {year}</div>
          <button onClick={()=>{if(month===11){setMonth(0);setYear(y=>y+1)}else setMonth(m=>m+1)}} style={{background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'16px',width:36,height:36,cursor:'pointer'}}>→</button>
          <button onClick={()=>{setMonth(now.getMonth());setYear(now.getFullYear())}} style={{background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'7px',color:'var(--muted)',fontSize:'11px',padding:'5px 12px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',fontWeight:600}}>Today</button>
        </div>
        <Btn size="sm" onClick={()=>openAdd()}>+ Add Event</Btn>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 240px',gap:'14px'}}>
        {/* Calendar grid */}
        <Card>
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',borderBottom:'1px solid var(--border)'}}>
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>(
              <div key={d} style={{padding:'8px 4px',textAlign:'center',fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px'}}>{d}</div>
            ))}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)'}}>
            {cells.map((d,i)=>{
              if(!d) return <div key={'empty-'+i} style={{minHeight:80,borderRight:'1px solid var(--border)',borderBottom:'1px solid var(--border)',background:'var(--dim)',opacity:.4}}/>
              const dayEvents = eventsForDay(d)
              const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
              const isToday = d===now.getDate()&&month===now.getMonth()&&year===now.getFullYear()
              return (
                <div key={d} onClick={()=>openAdd(dateStr)}
                  style={{minHeight:80,borderRight:'1px solid var(--border)',borderBottom:'1px solid var(--border)',padding:'5px 4px',cursor:'pointer',background:isToday?'rgba(204,34,0,.03)':'transparent',transition:'background .1s'}}
                  onMouseEnter={e=>e.currentTarget.style.background=isToday?'rgba(204,34,0,.05)':'var(--hov)'}
                  onMouseLeave={e=>e.currentTarget.style.background=isToday?'rgba(204,34,0,.03)':'transparent'}>
                  <div style={{fontSize:'12px',fontWeight:isToday?800:500,color:isToday?'#CC2200':'var(--text)',width:22,height:22,borderRadius:'50%',background:isToday?'rgba(204,34,0,.1)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:'3px'}}>
                    {d}
                  </div>
                  {dayEvents.slice(0,3).map(ev=>(
                    <div key={ev.id} onClick={e=>{e.stopPropagation();openEdit(ev)}}
                      style={{fontSize:'9px',fontWeight:600,background:ev.color+'20',color:ev.color,borderRadius:'3px',padding:'2px 4px',marginBottom:'2px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',cursor:'pointer'}}>
                      {ev.start_time?ev.start_time.slice(0,5)+' ':''}{ev.title}
                    </div>
                  ))}
                  {dayEvents.length>3&&<div style={{fontSize:'9px',color:'var(--muted)',fontWeight:600}}>+{dayEvents.length-3} more</div>}
                </div>
              )
            })}
          </div>
        </Card>

        {/* Upcoming */}
        <div>
          <Card>
            <div style={{padding:'12px 14px',borderBottom:'1px solid var(--border)',fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px'}}>Upcoming</div>
            {loading ? <div style={{padding:'20px',textAlign:'center',color:'var(--muted)',fontSize:'12px'}}>Loading...</div>
            : upcoming.length===0 ? <div style={{padding:'20px',textAlign:'center',color:'var(--muted)',fontSize:'12px'}}>No upcoming events</div>
            : upcoming.map(ev=>(
              <div key={ev.id} style={{padding:'10px 14px',borderBottom:'1px solid var(--border)',display:'flex',gap:'9px',alignItems:'flex-start'}}
                onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <div style={{width:3,borderRadius:'99px',alignSelf:'stretch',flexShrink:0,background:ev.color||'#CC2200'}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'12px',fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ev.title}</div>
                  <div style={{fontSize:'10px',color:'var(--muted)',marginTop:'2px'}}>
                    {new Date(ev.start_date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                    {ev.start_time?' · '+fmtTime(ev.start_time):''}
                  </div>
                  {ev.location&&<div style={{fontSize:'10px',color:'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>📍 {ev.location}</div>}
                </div>
                <div style={{display:'flex',gap:'3px',flexShrink:0}}>
                  <button onClick={()=>openEdit(ev)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'12px',padding:'2px'}}>✏</button>
                  <button onClick={()=>deleteEvent(ev.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#DC2626',fontSize:'12px',padding:'2px'}}>🗑</button>
                </div>
              </div>
            ))}
          </Card>

          {/* Legend */}
          <Card style={{marginTop:'10px',padding:'12px'}}>
            <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'8px'}}>Event Types</div>
            {EVENT_TYPES.map(t=>(
              <div key={t} style={{display:'flex',alignItems:'center',gap:'7px',marginBottom:'5px'}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:EVENT_COLORS[t],flexShrink:0}}/>
                <span style={{fontSize:'11px',color:'var(--muted)'}}>{t}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>

      {/* Add/Edit modal */}
      {showAdd&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,padding:'16px'}} onClick={e=>{if(e.target===e.currentTarget){setShowAdd(false);setEditing(null)}}}>
          <div style={{background:'var(--panel)',borderRadius:'16px',padding:'24px',width:'100%',maxWidth:'460px',maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'18px'}}>
              <div style={{fontSize:'16px',fontWeight:800}}>{editing?'Edit Event':'Add Event'}</div>
              <button onClick={()=>{setShowAdd(false);setEditing(null)}} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'20px',lineHeight:1}}>✕</button>
            </div>

            <FI label="Title" value={form.title} onChange={v=>set('title',v)} ph="e.g. Showing at 47 Prairie Ave"/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
              <div>
                <label style={lblStyle}>Type</label>
                <select value={form.type} onChange={e=>set('type',e.target.value)} style={selStyle}>
                  {EVENT_TYPES.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <FI label="Date" value={form.date} onChange={v=>set('date',v)} type="date"/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
              <FI label="Start Time" value={form.start_time} onChange={v=>set('start_time',v)} type="time"/>
              <FI label="End Time" value={form.end_time} onChange={v=>set('end_time',v)} type="time"/>
            </div>
            <FI label="Location / Address" value={form.location} onChange={v=>set('location',v)} ph="47 Prairie Ave, Suffern NY"/>
            <div>
              <label style={lblStyle}>Agent</label>
              <select value={form.agent_name} onChange={e=>set('agent_name',e.target.value)} style={selStyle}>
                <option value="">Select agent...</option>
                {AGENTS.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}
              </select>
            </div>
            <FI label="Notes" value={form.description} onChange={v=>set('description',v)} ph="Additional notes..." rows={2}/>
            <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'16px'}}>
              <input type="checkbox" checked={form.all_day} onChange={e=>set('all_day',e.target.checked)} id="allday"/>
              <label htmlFor="allday" style={{fontSize:'12px',color:'var(--muted)',cursor:'pointer'}}>All day event</label>
            </div>

            <div style={{display:'flex',gap:'8px'}}>
              <Btn variant="ghost" onClick={()=>{setShowAdd(false);setEditing(null)}} style={{flex:1}}>Cancel</Btn>
              {editing&&<Btn variant="danger" onClick={()=>{deleteEvent(editing);setShowAdd(false)}} style={{flex:1}}>Delete</Btn>}
              <Btn onClick={saveEvent} style={{flex:2}}>{editing?'Save Changes':'Add Event'}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FI({ label, value, onChange, ph='', type='text', rows }) {
  return (
    <div style={{marginBottom:'12px'}}>
      <label style={lblStyle}>{label}</label>
      {rows
        ? <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} rows={rows} style={{...inpStyle,resize:'vertical',lineHeight:1.6}}/>
        : <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} style={inpStyle}/>
      }
    </div>
  )
}

const lblStyle = { display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px' }
const inpStyle = { width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 11px',outline:'none',boxSizing:'border-box' }
const selStyle = { width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 11px',outline:'none',boxSizing:'border-box' }

function fmtTime(t) {
  if(!t) return ''
  const [h,m] = t.split(':').map(Number)
  return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`
}
