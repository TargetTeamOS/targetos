import React, { useState } from 'react'
import { Card, CardHeader, Btn, StatCard, Grid4 } from '../components/UI'

const INIT = [
  {id:'lp1',listing:'47 Prairie Ave, Suffern',agent:'Avraham Weinberger',status:'Active',tasks:[{t:'Schedule photography',done:true},{t:'Order floor plans',done:true},{t:'Create Mix Ad',done:true},{t:'Submit to MLS',done:true},{t:'Order sign',done:true},{t:'Order lockbox',done:true},{t:'Create brochure',done:false},{t:'Prepare showing instructions',done:false}]},
  {id:'lp2',listing:'12 Sherman Drive #202, Spring Valley',agent:'Joel Rottenstein',status:'Active',tasks:[{t:'Schedule photography',done:true},{t:'Order floor plans',done:true},{t:'Create Mix Ad',done:true},{t:'Submit to MLS',done:true},{t:'Order sign',done:true},{t:'Order lockbox',done:true},{t:'Create brochure',done:true},{t:'Prepare showing instructions',done:true}]},
  {id:'lp3',listing:'17 Union Rd #208, Spring Valley',agent:'Eli Hoffman',status:'Active',tasks:[{t:'Schedule photography',done:true},{t:'Order floor plans',done:false},{t:'Create Mix Ad',done:false},{t:'Submit to MLS',done:true},{t:'Order sign',done:false},{t:'Order lockbox',done:false},{t:'Create brochure',done:false},{t:'Prepare showing instructions',done:false}]},
]

export function ListingPrep() {
  const [preps, setPreps] = useState(INIT)

  function toggle(pid,ti) {
    setPreps(prev=>prev.map(p=>p.id!==pid?p:{...p,tasks:p.tasks.map((t,i)=>i===ti?{...t,done:!t.done}:t)}))
  }
  function addTask(pid,text) {
    if(!text) return
    setPreps(prev=>prev.map(p=>p.id!==pid?p:{...p,tasks:[...p.tasks,{t:text,done:false}]}))
  }

  const allDone = preps.reduce((s,p)=>s+p.tasks.filter(t=>t.done).length,0)
  const allTotal = preps.reduce((s,p)=>s+p.tasks.length,0)

  return (
    <div>
      <Grid4 style={{marginBottom:'14px'}}>
        <StatCard label="Active Listings" value={preps.length}    sub="In prep"     subColor="var(--teal)"/>
        <StatCard label="Tasks Done"      value={allDone}         sub="Completed"   subColor="var(--green)"/>
        <StatCard label="Tasks Remaining" value={allTotal-allDone} sub="To do"      subColor="#D97706"/>
        <StatCard label="Completion"      value={allTotal?Math.round(allDone/allTotal*100)+'%':'—'} sub="Overall" subColor="var(--purple)"/>
      </Grid4>

      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'14px'}}>
        <span style={{color:'var(--muted)',fontSize:'12px'}}>Secretary checklist — triggered when seller signs</span>
        <Btn size="sm" onClick={()=>alert('New listing prep form coming soon!')}>+ New Listing Prep</Btn>
      </div>

      {preps.map(p=>{
        const done=p.tasks.filter(t=>t.done).length, total=p.tasks.length
        const pct=Math.round(done/total*100)
        return (
          <Card key={p.id} style={{marginBottom:'13px'}}>
            <div style={{padding:'16px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
                <div>
                  <div style={{fontSize:'14px',fontWeight:800}}>{p.listing}</div>
                  <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>{p.agent} · {p.status}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:'22px',fontWeight:900,color:pct===100?'#16A34A':'var(--red)'}}>{pct}%</div>
                  <div style={{fontSize:'10px',color:'var(--muted)'}}>{done}/{total} done</div>
                </div>
              </div>
              <div style={{background:'var(--dim)',borderRadius:'99px',height:7,marginBottom:'14px',overflow:'hidden'}}>
                <div style={{background:pct===100?'#16A34A':'#CC2200',borderRadius:'99px',height:7,width:pct+'%',transition:'width .5s'}}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px'}}>
                {p.tasks.map((task,i)=>(
                  <div key={i} onClick={()=>toggle(p.id,i)} style={{display:'flex',alignItems:'center',gap:'8px',padding:'8px 10px',background:'var(--dim)',borderRadius:'8px',cursor:'pointer'}}>
                    <div style={{width:16,height:16,borderRadius:'4px',border:'2px solid '+(task.done?'#16A34A':'var(--border)'),background:task.done?'#16A34A':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:'#fff',fontSize:'9px'}}>
                      {task.done&&'✓'}
                    </div>
                    <span style={{fontSize:'11px',textDecoration:task.done?'line-through':'none',opacity:task.done?.5:1}}>{task.t}</span>
                  </div>
                ))}
              </div>
              <div style={{marginTop:'10px'}}>
                <AddTaskRow onAdd={text=>addTask(p.id,text)}/>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function AddTaskRow({onAdd}) {
  const [val,setVal]=useState('')
  return (
    <div style={{display:'flex',gap:'7px'}}>
      <input value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==='Enter'&&val.trim()&&(onAdd(val),setVal(''))}
        placeholder="Add task..." style={{flex:1,background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'7px',color:'var(--text)',fontSize:'12px',padding:'7px 10px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}/>
      <button onClick={()=>val.trim()&&(onAdd(val),setVal(''))} style={{background:'#CC2200',border:'none',borderRadius:'7px',color:'#fff',fontSize:'12px',padding:'7px 12px',cursor:'pointer'}}>Add</button>
    </div>
  )
}
