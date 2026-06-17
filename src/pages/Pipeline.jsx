import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Badge, Avatar, Btn } from '../components/UI'

const STAGES = [
  {key:'New',      color:'#2563EB', label:'New'},
  {key:'Hot',      color:'#DC2626', label:'Hot'},
  {key:'Active',   color:'#16A34A', label:'Active'},
  {key:'Nurturing',color:'#D97706', label:'Nurturing'},
  {key:'Cold',     color:'#94A3B8', label:'Cold'},
]
const roleColor = r => ({buyer:'#0EA5E9',seller:'#10B981',investor:'#7C3AED',tenant:'#F59E0B'}[r]||'#64748B')
const fmt$ = n => '$'+Number(n).toLocaleString()

export function Pipeline() {
  const { toast } = useApp()
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [dragging, setDragging] = useState(null)
  const [search, setSearch] = useState('')
  const [filterAgent, setFilterAgent] = useState('')

  useEffect(()=>{ loadContacts() },[])
  async function loadContacts(){
    const {data} = await supabase.from('contacts').select('*').order('created_at',{ascending:false})
    setContacts(data||[]); setLoading(false)
  }
  async function moveStage(contactId, newStage){
    await supabase.from('contacts').update({status:newStage}).eq('id',contactId)
    setContacts(prev => prev.map(c => c.id===contactId ? {...c,status:newStage} : c))
    toast('Moved to '+newStage)
  }

  const filtered = contacts.filter(c => {
    if(search && !(c.first_name+' '+(c.last_name||'')+' '+(c.phone||'')).toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const totalBudget = contacts.filter(c=>c.status==='Hot'||c.status==='Active').reduce((s,c)=>s+(c.budget_max||0),0)

  return (
    <div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 110px)'}}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px',flexShrink:0}}>
        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search pipeline..."
            style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px 12px',outline:'none',width:'200px',fontFamily:'Inter,system-ui,sans-serif'}}/>
          <span style={{color:'var(--muted)',fontSize:'12px'}}>{contacts.length} total · {fmt$(totalBudget)} active budget</span>
        </div>
        <div style={{display:'flex',gap:'7px'}}>
          <span style={{fontSize:'12px',color:'var(--muted)',alignSelf:'center'}}>Drag cards between columns</span>
        </div>
      </div>

      {/* Kanban board */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'12px',flex:1,overflow:'hidden'}}>
        {STAGES.map(stage => {
          const stageContacts = filtered.filter(c => (c.status||'New') === stage.key)
          const stageTotal = stageContacts.reduce((s,c)=>s+(c.budget_max||0),0)
          return (
            <div key={stage.key}
              onDragOver={e=>e.preventDefault()}
              onDrop={e=>{e.preventDefault();if(dragging)moveStage(dragging,stage.key)}}
              style={{display:'flex',flexDirection:'column',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',overflow:'hidden'}}>
              {/* Column header */}
              <div style={{padding:'11px 13px',borderBottom:'1px solid var(--border)',flexShrink:0}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'7px'}}>
                    <div style={{width:8,height:8,borderRadius:'50%',background:stage.color}}/>
                    <span style={{fontSize:'12px',fontWeight:700}}>{stage.label}</span>
                  </div>
                  <span style={{background:stage.color+'18',color:stage.color,fontSize:'10px',fontWeight:700,padding:'2px 8px',borderRadius:'20px'}}>{stageContacts.length}</span>
                </div>
                {stageTotal > 0 && <div style={{fontSize:'10px',color:'var(--muted)',marginTop:'3px'}}>{fmt$(stageTotal)} total budget</div>}
              </div>

              {/* Cards */}
              <div style={{flex:1,overflowY:'auto',padding:'9px',display:'flex',flexDirection:'column',gap:'7px'}}>
                {loading ? (
                  <div style={{color:'var(--muted)',fontSize:'11px',textAlign:'center',padding:'16px'}}>Loading...</div>
                ) : stageContacts.length === 0 ? (
                  <div style={{color:'var(--muted)',fontSize:'11px',textAlign:'center',padding:'16px',border:'1px dashed var(--border)',borderRadius:'8px'}}>Empty</div>
                ) : stageContacts.map(c => (
                  <PipelineCard key={c.id} contact={c} onDragStart={()=>setDragging(c.id)} onDragEnd={()=>setDragging(null)} onMove={moveStage}/>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PipelineCard({ contact: c, onDragStart, onDragEnd, onMove }) {
  const [showActions, setShowActions] = useState(false)
  return (
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd}
      style={{background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'9px',padding:'11px',cursor:'grab',transition:'border-color .15s',position:'relative'}}
      onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--red)';setShowActions(true)}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';setShowActions(false)}}>
      <div style={{display:'flex',alignItems:'center',gap:'7px',marginBottom:'6px'}}>
        <Avatar name={c.first_name+' '+(c.last_name||'')} color={roleColor(c.role)} size={26}/>
        <div>
          <div style={{fontSize:'11px',fontWeight:700}}>{c.first_name} {c.last_name||''}</div>
          <div style={{fontSize:'9px',color:'var(--muted)',textTransform:'capitalize'}}>{c.role||'—'}</div>
        </div>
      </div>
      {c.source && <div style={{fontSize:'10px',color:'var(--muted)',marginBottom:'4px'}}>{c.source}</div>}
      {c.budget_max && <div style={{fontSize:'12px',fontWeight:700,color:'var(--text)'}}>${Number(c.budget_max).toLocaleString()}</div>}
      {c.phone && <div style={{fontSize:'10px',color:'var(--muted)',marginTop:'3px'}}>{c.phone}</div>}

      {/* Quick actions on hover */}
      {showActions && (
        <div style={{display:'flex',gap:'4px',marginTop:'8px'}}>
          {c.phone && <button onClick={()=>window.location.href='tel:'+c.phone.replace(/\D/g,'')} style={{flex:1,background:'var(--red)',border:'none',borderRadius:'6px',color:'#fff',fontSize:'9px',padding:'4px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>📞</button>}
          <button onClick={()=>onMove(c.id,'Hot')} style={{flex:1,background:'#FEF2F2',border:'none',borderRadius:'6px',color:'#DC2626',fontSize:'9px',padding:'4px',cursor:'pointer',fontWeight:700,fontFamily:'Inter,system-ui,sans-serif'}}>Hot</button>
          <button onClick={()=>onMove(c.id,'Active')} style={{flex:1,background:'#F0FDF4',border:'none',borderRadius:'6px',color:'#16A34A',fontSize:'9px',padding:'4px',cursor:'pointer',fontWeight:700,fontFamily:'Inter,system-ui,sans-serif'}}>Active</button>
          <button onClick={()=>onMove(c.id,'Nurturing')} style={{flex:1,background:'#FFFBEB',border:'none',borderRadius:'6px',color:'#D97706',fontSize:'9px',padding:'4px',cursor:'pointer',fontWeight:700,fontFamily:'Inter,system-ui,sans-serif'}}>Nurture</button>
        </div>
      )}
    </div>
  )
}
