import React, { useState } from 'react'
import { Card, Btn } from '../components/UI'

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const EVENTS = {
  28:[{text:'84 Tennyson Closing',color:'#16A34A'}],
  22:[{text:'Open House — 12 Sherman',color:'#0EA5E9'},{text:'Open House — Tennyson',color:'#7C3AED'}],
  18:[{text:'Birthday — Sarah M.',color:'#CC2200'}],
  10:[{text:'135 Rt 306 A/O',color:'#D97706'}],
}

export function Calendar() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  const firstDay = new Date(year,month,1).getDay()
  const daysInMonth = new Date(year,month+1,0).getDate()

  const cells = []
  for(let i=0;i<firstDay;i++) cells.push(null)
  for(let d=1;d<=daysInMonth;d++) cells.push(d)

  function prevMonth(){if(month===0){setMonth(11);setYear(y=>y-1)}else setMonth(m=>m-1)}
  function nextMonth(){if(month===11){setMonth(0);setYear(y=>y+1)}else setMonth(m=>m+1)}

  return (
    <div>
      {/* Upcoming closings */}
      <Card style={{padding:'13px 16px',marginBottom:'14px'}}>
        <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'10px'}}>Upcoming Closings</div>
        <div style={{display:'flex',gap:'10px',overflowX:'auto'}}>
          {[{addr:'84 Tennyson Drive',date:'Jun 28',agent:'Isaac L.'},{addr:'135 Route 306',date:'Jul 10',agent:'Lazer F.'},{addr:'112 Washington Ave',date:'Jun 4',agent:'Avraham W.'}].map((t,i)=>(
            <div key={i} style={{background:'var(--dim)',borderRadius:'9px',padding:'10px',minWidth:'160px',flexShrink:0}}>
              <div style={{fontSize:'11px',fontWeight:700}}>{t.addr}</div>
              <div style={{fontSize:'14px',fontWeight:900,color:'#CC2200',margin:'3px 0'}}>{t.date}</div>
              <div style={{fontSize:'10px',color:'var(--muted)'}}>{t.agent}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        {/* Header */}
        <div style={{padding:'14px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={{fontSize:'17px',fontWeight:800}}>{MONTHS[month]} {year}</div>
          <div style={{display:'flex',gap:'8px'}}>
            <Btn size="sm" variant="ghost" onClick={prevMonth}>‹ Prev</Btn>
            <Btn size="sm" variant="ghost" onClick={nextMonth}>Next ›</Btn>
            <Btn size="sm" onClick={()=>alert('Add event form coming soon!')}>+ Add Event</Btn>
          </div>
        </div>
        <div style={{padding:'12px'}}>
          {/* Day headers */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'4px',marginBottom:'6px'}}>
            {DAYS.map(d=><div key={d} style={{textAlign:'center',fontSize:'11px',fontWeight:700,color:'var(--muted)',padding:'4px'}}>{d}</div>)}
          </div>
          {/* Day cells */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'4px'}}>
            {cells.map((d,i)=>d===null
              ? <div key={i}/>
              : (
                <div key={i} onClick={()=>alert('Add event for '+MONTHS[month]+' '+d)} style={{background:d===now.getDate()&&month===now.getMonth()&&year===now.getFullYear()?'rgba(204,34,0,.04)':'var(--panel)',border:'1px solid '+(d===now.getDate()&&month===now.getMonth()&&year===now.getFullYear()?'#CC2200':'var(--border)'),borderRadius:'8px',padding:'6px',minHeight:'70px',cursor:'pointer',transition:'border-color .15s'}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='#CC2200'} onMouseLeave={e=>e.currentTarget.style.borderColor=d===now.getDate()&&month===now.getMonth()?'#CC2200':'var(--border)'}>
                  <div style={{fontSize:'11px',fontWeight:d===now.getDate()&&month===now.getMonth()?900:600,color:d===now.getDate()&&month===now.getMonth()?'#CC2200':'var(--muted)',marginBottom:'3px'}}>{d}</div>
                  {(EVENTS[d]||[]).slice(0,2).map((ev,ei)=>(
                    <div key={ei} style={{fontSize:'9px',fontWeight:600,padding:'2px 5px',borderRadius:'4px',background:ev.color+'22',color:ev.color,marginBottom:'2px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{ev.text}</div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
