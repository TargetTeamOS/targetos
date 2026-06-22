import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useDeals } from '../lib/hooks'
import { useApp } from '../context/AppContext'
import { fmt$, initials } from '../lib/utils'

const PIPELINE_STAGES = [
  { key:'Negotiations',   label:'Negotiations',   color:'#037f4c' },
  { key:'Offer Accapted', label:'Offer Accepted',  color:'#00c875' },
  { key:'Under Shtar',    label:'Under Shtar',     color:'#bb3354' },
  { key:'Under Contract', label:'Under Contract',  color:'#757575' },
]

export function Pipeline() {
  const { agent, isAdmin } = useAuth()
  const { toast } = useApp()
  const { deals, loading, update } = useDeals()
  const [dragging, setDragging] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  async function moveStage(dealId, newStage) {
    try {
      await update(dealId, { stage: newStage })
      toast(`→ ${newStage}`)
    } catch(e) { toast('Error: '+e.message,'#DC2626') }
  }

  const activePipeline = deals.filter(d => PIPELINE_STAGES.map(s=>s.key).includes(d.stage))
  const totalPendingGCI = activePipeline.reduce((s,d)=>s+(d.gci||0),0)

  return (
    <div>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px' }}>
        <div>
          <div style={{ fontSize:'18px',fontWeight:900 }}>📈 Pipeline</div>
          <div style={{ fontSize:'12px',color:'var(--muted)',marginTop:'2px' }}>{activePipeline.length} active deals · {fmt$(totalPendingGCI)} pending GCI</div>
        </div>
      </div>

      {loading && <div style={{ padding:'28px',textAlign:'center',color:'var(--muted)' }}>Loading...</div>}

      <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',overflowX:'auto' }}>
        {PIPELINE_STAGES.map(stage=>{
          const stageDeals = activePipeline.filter(d=>d.stage===stage.key)
          const stageGCI   = stageDeals.reduce((s,d)=>s+(d.gci||0),0)
          return (
            <div key={stage.key}
              onDragOver={e=>{e.preventDefault();setDragOver(stage.key)}}
              onDragLeave={()=>setDragOver(null)}
              onDrop={e=>{e.preventDefault();if(dragging&&dragging!==stage.key){moveStage(e.dataTransfer.getData('dealId'),stage.key)};setDragOver(null)}}
              style={{ background:'var(--dim)',borderRadius:'12px',padding:'10px',minHeight:'200px',border:`2px solid ${dragOver===stage.key?stage.color:'transparent'}`,transition:'border-color .15s' }}>
              {/* Column header */}
              <div style={{ marginBottom:'10px',paddingBottom:'8px',borderBottom:'2px solid '+stage.color }}>
                <div style={{ fontSize:'11px',fontWeight:800,color:stage.color,textTransform:'uppercase',letterSpacing:'.5px' }}>{stage.label}</div>
                <div style={{ fontSize:'11px',color:'var(--muted)',marginTop:'2px' }}>{stageDeals.length} deals · {fmt$(stageGCI)}</div>
              </div>
              {/* Cards */}
              {stageDeals.map(deal=>(
                <div key={deal.id}
                  draggable
                  onDragStart={e=>{e.dataTransfer.setData('dealId',deal.id);setDragging(stage.key)}}
                  onDragEnd={()=>setDragging(null)}
                  style={{ background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'10px',padding:'11px',marginBottom:'8px',cursor:'grab',transition:'box-shadow .15s' }}
                  onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,.12)'}
                  onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}>
                  <div style={{ fontSize:'12px',fontWeight:700,marginBottom:'4px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{deal.addr}</div>
                  {deal.client_name&&<div style={{ fontSize:'11px',color:'var(--muted)',marginBottom:'5px' }}>{deal.client_name}</div>}
                  <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                    <span style={{ fontSize:'12px',fontWeight:700,color:'#CC2200' }}>{fmt$(deal.gci)}</span>
                    <span style={{ fontSize:'10px',color:'var(--muted)',background:'var(--dim)',borderRadius:'20px',padding:'2px 8px' }}>{deal.side||'Buyer'}</span>
                  </div>
                  {/* Move to next stage */}
                  <div style={{ display:'flex',gap:'4px',marginTop:'7px',flexWrap:'wrap' }}>
                    {PIPELINE_STAGES.filter(s=>s.key!==stage.key).map(s=>(
                      <button key={s.key} onClick={()=>moveStage(deal.id,s.key)}
                        style={{ fontSize:'9px',fontWeight:700,padding:'2px 7px',borderRadius:'20px',border:`1px solid ${s.color}40`,background:s.color+'10',color:s.color,cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }}>
                        → {s.label.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {stageDeals.length===0&&<div style={{ padding:'16px',textAlign:'center',color:'var(--muted)',fontSize:'11px',border:'1.5px dashed var(--border)',borderRadius:'9px' }}>Drop here</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
