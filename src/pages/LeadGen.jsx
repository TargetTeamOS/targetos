import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader, Btn, Grid2, StatCard, Grid4 } from '../components/UI'
import { AGENTS } from '../lib/constants'

const ACTS = [
  {key:'calls',  label:'Calls Made',    color:'#0EA5E9', goal:25},
  {key:'doors',  label:'Doors Knocked', color:'#E8650A', goal:10},
  {key:'emails', label:'Emails Sent',   color:'#7C3AED', goal:30},
  {key:'texts',  label:'Texts Sent',    color:'#10B981', goal:25},
  {key:'leads',  label:'New Leads',     color:'#D97706', goal:5},
]

export function LeadGen() {
  const { toast } = useApp()
  const [activity, setActivity] = useState({calls:0,doors:0,emails:0,texts:0,leads:0})
  const [goals, setGoals] = useState({calls:25,doors:10,emails:30,texts:25,leads:5})
  const [editGoals, setEditGoals] = useState(false)
  const [tempGoals, setTempGoals] = useState({...goals})

  async function bump(key) {
    const newVal = (activity[key]||0) + 1
    setActivity(prev => ({...prev,[key]:newVal}))
    toast('+1 ' + key)
    try {
      await supabase.from('lead_gen').upsert({
        activity_date: new Date().toISOString().split('T')[0],
        [key+'_made']: newVal
      },{onConflict:'activity_date'})
    } catch(e) {}
  }

  const totalPct = Math.round(ACTS.reduce((s,a)=>s+Math.min(activity[a.key]/goals[a.key]*100,100),0)/ACTS.length)

  return (
    <div>
      <Grid4 style={{marginBottom:'14px'}}>
        <StatCard label="Overall Progress" value={totalPct+'%'} sub="Today's goal" subColor="var(--green)"/>
        <StatCard label="Calls"  value={activity.calls}  sub={'of '+goals.calls}  subColor="#0EA5E9"/>
        <StatCard label="Leads"  value={activity.leads}  sub={'of '+goals.leads}  subColor="#D97706"/>
        <StatCard label="Texts"  value={activity.texts}  sub={'of '+goals.texts}  subColor="#10B981"/>
      </Grid4>

      {/* Activity rings */}
      <Card style={{marginBottom:'14px'}}>
        <CardHeader>
          My Activity — Today
          <div style={{display:'flex',gap:'7px'}}>
            <Btn size="xs" variant="ghost" onClick={()=>{setTempGoals({...goals});setEditGoals(true)}}>Edit Goals</Btn>
            <Btn size="xs" onClick={()=>{
              const keys = Object.keys(activity)
              const vals = prompt('Log all activity (calls,doors,emails,texts,leads):','')
              if(!vals) return
              const nums = vals.split(',').map(n=>parseInt(n.trim())||0)
              const updated = {}
              keys.forEach((k,i)=>{updated[k]=nums[i]||0})
              setActivity(updated); toast('Activity saved!')
            }}>Log All</Btn>
          </div>
        </CardHeader>
        <div style={{padding:'20px',display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'16px'}}>
          {ACTS.map(a => {
            const v = activity[a.key]||0
            const g = goals[a.key]||25
            const pct = Math.min(v/g*100,100)
            const circ = 2*Math.PI*28
            const dash = pct/100*circ
            return (
              <div key={a.key} style={{textAlign:'center'}}>
                <div style={{position:'relative',width:80,height:80,margin:'0 auto 10px'}}>
                  <svg width="80" height="80" viewBox="0 0 80 80" style={{transform:'rotate(-90deg)'}}>
                    <circle cx="40" cy="40" r="28" fill="none" stroke="var(--dim)" strokeWidth="7"/>
                    <circle cx="40" cy="40" r="28" fill="none" stroke={a.color} strokeWidth="7"
                      strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{transition:'stroke-dasharray .5s'}}/>
                  </svg>
                  <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <div style={{color:a.color,fontSize:'18px',fontWeight:900,lineHeight:1}}>{v}</div>
                  </div>
                </div>
                <div style={{fontSize:'12px',fontWeight:600,marginBottom:'2px'}}>{a.label}</div>
                <div style={{fontSize:'10px',color:'var(--muted)',marginBottom:'8px'}}>{Math.round(pct)}% of {g}</div>
                <button onClick={()=>bump(a.key)}
                  style={{background:a.color+'18',border:'1.5px solid '+a.color+'44',borderRadius:'8px',color:a.color,fontSize:'13px',fontWeight:700,padding:'5px 16px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',width:'100%'}}>
                  +1
                </button>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Team leaderboard */}
      <Card>
        <CardHeader>Team Today</CardHeader>
        {[['Lazer F.','LF','#CC2200',88],['Yanky L.','YL','#10B981',80],['Mendy','MJ','#0EA5E9',72],['Isaac L.','IL','#D97706',48],['Gitty F.','GF','#7C3AED',32],['Joel R.','JR','#E8650A',28],['Eli H.','EH','#14B8A6',22],['Avraham W.','AW','#8B5CF6',18]].map((a,i)=>(
          <div key={a[0]} style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 16px',borderBottom:'1px solid var(--border)'}}>
            <div style={{color:'var(--muted)',fontSize:'11px',fontWeight:700,width:'16px'}}>{i+1}</div>
            <div style={{width:28,height:28,borderRadius:'8px',background:a[2],display:'flex',alignItems:'center',justifyContent:'center',fontSize:'10px',fontWeight:800,color:'#fff',flexShrink:0}}>{a[1]}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:'12px',fontWeight:600,marginBottom:'4px'}}>{a[0]}</div>
              <div style={{background:'var(--dim)',borderRadius:'99px',height:5}}>
                <div style={{background:a[2],borderRadius:'99px',height:5,width:a[3]+'%',transition:'width .5s'}}/>
              </div>
            </div>
            <div style={{color:a[2],fontSize:'12px',fontWeight:700}}>{a[3]}%</div>
          </div>
        ))}
      </Card>

      {/* Edit goals modal */}
      {editGoals && (
        <div onClick={e=>{if(e.target===e.currentTarget)setEditGoals(false)}} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,backdropFilter:'blur(4px)'}}>
          <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'18px',padding:'26px',width:'100%',maxWidth:'380px'}}>
            <div style={{fontSize:'15px',fontWeight:800,marginBottom:'18px',display:'flex',justifyContent:'space-between'}}>
              Edit Daily Goals <button onClick={()=>setEditGoals(false)} style={{background:'none',border:'none',fontSize:'18px',cursor:'pointer',color:'var(--muted)'}}>✕</button>
            </div>
            {ACTS.map(a=>(
              <div key={a.key} style={{marginBottom:'12px'}}>
                <label style={{display:'block',fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'5px'}}>{a.label} Goal</label>
                <input type="number" value={tempGoals[a.key]} onChange={e=>setTempGoals(g=>({...g,[a.key]:parseInt(e.target.value)||0}))}
                  style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'10px 13px',outline:'none'}}/>
              </div>
            ))}
            <div style={{display:'flex',gap:'8px',justifyContent:'flex-end',marginTop:'8px'}}>
              <Btn variant="ghost" onClick={()=>setEditGoals(false)}>Cancel</Btn>
              <Btn onClick={()=>{setGoals({...tempGoals});setEditGoals(false);toast('Goals updated!')}}>Save Goals</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
