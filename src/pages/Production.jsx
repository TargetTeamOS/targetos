import React, { useState } from 'react'
import { Card, CardHeader, Badge, Btn, StatCard, Grid4 } from '../components/UI'
import { AGENTS, SOURCES, PROPERTY_TYPES, DEAL_STAGES, SALE_TYPES } from '../lib/constants'

const fmt$ = n => '$' + Number(n).toLocaleString()

const DEALS = [
  {id:'d1',addr:'12 Nesher Ct #212, Monsey',agent:'Isaac L.',agentId:'a3',gci:27750,prod:925000,side:'Dual',stage:'Offer Accepted',source:'On Market',aoDate:'2026-05-29',contractDate:'',expectedClose:'',closeDate:'',type:'Condo',saleType:'On Market',saleSide:'Developer'},
  {id:'d2',addr:'15 Calvert Dr #112, Monsey',agent:'Isaac L.',agentId:'a3',gci:18340,prod:917000,side:'Dual',stage:'Offer Accepted',source:'On Market',aoDate:'2026-05-19',contractDate:'',expectedClose:'',closeDate:'',type:'Condo',saleType:'On Market',saleSide:'Home Owner'},
  {id:'d3',addr:'36 Gladys Drive, Spring Valley',agent:'Eli H.',agentId:'a7',gci:10335,prod:689000,side:'Buyer',stage:'Offer Accepted',source:'FSBO',aoDate:'2026-06-11',contractDate:'',expectedClose:'',closeDate:'',type:'Condo',saleType:'FSBO',saleSide:'Home Owner'},
  {id:'d4',addr:'135 Rt 306 Unit 111, Monsey',agent:'Lazer F.',agentId:'a1',gci:25520,prod:638000,side:'Dual',stage:'Offer Accepted',source:'On Market',aoDate:'2026-06-12',contractDate:'',expectedClose:'',closeDate:'',type:'Condo',saleType:'On Market',saleSide:'Home Owner'},
  {id:'d5',addr:'40 Route 9W, West Haverstraw',agent:'Mendy',agentId:'a2',gci:12500,prod:625000,side:'Buyer',stage:'Offer Accepted',source:'On Market',aoDate:'2025-09-04',contractDate:'',expectedClose:'',closeDate:'',type:'Single Family',saleType:'On Market',saleSide:'Home Owner'},
  {id:'d6',addr:'12 Cloverdale Lane, Monsey',agent:'Eli H.',agentId:'a7',gci:88000,prod:2450000,side:'Dual Buyer',stage:'Under Contract',source:'Off Market',aoDate:'2026-03-31',contractDate:'2026-04-10',expectedClose:'2026-07-01',closeDate:'',type:'Condo',saleType:'Off Market',saleSide:'Investor'},
  {id:'d7',addr:'12 Cloverdale Lane, Monsey',agent:'Joel R.',agentId:'a6',gci:88000,prod:2450000,side:'Dual Listing',stage:'Under Contract',source:'Off Market',aoDate:'2026-03-31',contractDate:'2026-04-10',expectedClose:'2026-07-01',closeDate:'',type:'Condo',saleType:'Off Market',saleSide:'Investor'},
  {id:'d8',addr:'12 Hilda Ln, Monsey',agent:'Joel R.',agentId:'a6',gci:39750,prod:2650000,side:'Dual Listing',stage:'Under Contract',source:'FSBO',aoDate:'2026-03-06',contractDate:'2026-03-15',expectedClose:'2026-06-30',closeDate:'',type:'Condo',saleType:'FSBO',saleSide:'Home Owner'},
  {id:'d9',addr:'12 Hilda Ln, Monsey',agent:'Isaac L.',agentId:'a3',gci:39750,prod:2650000,side:'Dual Buyer',stage:'Under Contract',source:'FSBO',aoDate:'2026-03-06',contractDate:'2026-03-15',expectedClose:'2026-06-30',closeDate:'',type:'Condo',saleType:'FSBO',saleSide:'Home Owner'},
  {id:'d10',addr:'41 Saddle River Rd, Monsey',agent:'Joel R.',agentId:'a6',gci:8925,prod:790000,side:'Listing',stage:'Under Contract',source:'FSBO',aoDate:'2026-03-11',contractDate:'2026-03-20',expectedClose:'2026-06-15',closeDate:'',type:'Condo',saleType:'FSBO',saleSide:'Home Owner'},
  {id:'d11',addr:'10 Sneden Ct, Spring Valley',agent:'Lazer F.',agentId:'a1',gci:33960,prod:849000,side:'Dual',stage:'Under Contract',source:'On Market',aoDate:'2026-04-28',contractDate:'2026-05-05',expectedClose:'2026-07-08',closeDate:'',type:'Condo',saleType:'On Market',saleSide:'Investor'},
  {id:'d12',addr:'105 Grove St #202, Monsey',agent:'Eli H.',agentId:'a7',gci:30400,prod:1520000,side:'Dual',stage:'Under Contract',source:'FSBO',aoDate:'2026-02-19',contractDate:'2026-03-24',expectedClose:'2026-06-22',closeDate:'',type:'Condo',saleType:'FSBO',saleSide:'Home Owner'},
  {id:'d13',addr:'11 Waldron Ave, Nyack',agent:'Avraham W.',agentId:'a8',gci:7900,prod:395000,side:'Listing',stage:'Under Contract',source:'On Market',aoDate:'2025-04-09',contractDate:'2025-04-20',expectedClose:'2026-06-15',closeDate:'',type:'Single Family',saleType:'On Market',saleSide:'Home Owner'},
  {id:'d14',addr:'112 Washington Ave, Suffern',agent:'Avraham W.',agentId:'a8',gci:24000,prod:800000,side:'Dual',stage:'Under Contract',source:'On Market',aoDate:'2026-01-20',contractDate:'2026-01-26',expectedClose:'2026-06-04',closeDate:'',type:'Multi Family',saleType:'On Market',saleSide:'Investor'},
  {id:'d15',addr:'116 Fairview Ave, Spring Valley',agent:'Mendy',agentId:'a2',gci:21500,prod:1675000,side:'Flip',stage:'Under Contract',source:'On Market',aoDate:'2026-05-29',contractDate:'',expectedClose:'',closeDate:'',type:'',saleType:'On Market',saleSide:'Investor'},
  {id:'d16',addr:'12 Greene Rd, Spring Valley',agent:'Mendy',agentId:'a2',gci:18000,prod:900000,side:'Buyer',stage:'Under Contract',source:'On Market',aoDate:'2025-11-14',contractDate:'2025-11-25',expectedClose:'2026-06-30',closeDate:'',type:'Single Family',saleType:'On Market',saleSide:'Home Owner'},
  {id:'d17',addr:'12 Sneden Ct, Spring Valley',agent:'Lazer F.',agentId:'a1',gci:17500,prod:875000,side:'Listing',stage:'Under Contract',source:'On Market',aoDate:'2026-04-21',contractDate:'2026-04-28',expectedClose:'2026-07-01',closeDate:'',type:'Condo',saleType:'On Market',saleSide:'Investor'},
  {id:'d18',addr:'121 Broadway, Haverstraw',agent:'Eli H.',agentId:'a7',gci:18000,prod:450000,side:'Dual',stage:'Under Contract',source:'On Market',aoDate:'2026-05-20',contractDate:'2026-05-28',expectedClose:'2026-07-15',closeDate:'',type:'Single Family',saleType:'On Market',saleSide:'Home Owner'},
]

const STAGE_ORDER = ['Offer Accepted','Under Shtar','Under Contract','Closed','Deal Fell Through']
const STAGE_COLORS = {'Offer Accepted':'#D97706','Under Shtar':'#7C3AED','Under Contract':'#2563EB','Closed':'#16A34A','Deal Fell Through':'#DC2626'}

export function Production() {
  const [deals, setDeals] = useState(DEALS)
  const [filterAgent, setFilterAgent] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const filtered = deals.filter(d => {
    if(search && !d.addr.toLowerCase().includes(search.toLowerCase()) && !d.agent.toLowerCase().includes(search.toLowerCase())) return false
    if(filterAgent && d.agent !== filterAgent) return false
    if(filterStage && d.stage !== filterStage) return false
    return true
  })

  const totalGCI  = filtered.reduce((s,d) => s+d.gci, 0)
  const totalProd = filtered.reduce((s,d) => s+d.prod, 0)
  const closed    = filtered.filter(d => d.stage==='Closed')
  const pipeline  = filtered.filter(d => !['Closed','Deal Fell Through'].includes(d.stage))

  // Group by stage
  const groups = STAGE_ORDER.map(stage => ({
    stage,
    color: STAGE_COLORS[stage],
    deals: filtered.filter(d => d.stage === stage),
  })).filter(g => g.deals.length > 0)

  return (
    <div>
      {/* Stats */}
      <Grid4 style={{marginBottom:'14px'}}>
        <StatCard label="Total GCI"    value={fmt$(totalGCI)}  sub="All deals"     subColor="#D97706"/>
        <StatCard label="Total Volume" value={fmt$(totalProd)} sub="Production"    subColor="var(--purple)"/>
        <StatCard label="In Pipeline"  value={pipeline.length} sub="Active deals"  subColor="var(--teal)"/>
        <StatCard label="Closed"       value={closed.length}   sub="Deals closed"  subColor="var(--green)"/>
      </Grid4>

      {/* Filters */}
      <div style={{display:'flex',gap:'8px',marginBottom:'14px',flexWrap:'wrap',justifyContent:'space-between'}}>
        <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search address or agent..."
            style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px 12px',outline:'none',width:'220px',fontFamily:'Inter,system-ui,sans-serif'}}/>
          <select value={filterAgent} onChange={e=>setFilterAgent(e.target.value)} style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px 10px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}>
            <option value="">All Agents</option>
            {AGENTS.map(a=><option key={a.id} value={a.name.split(' ')[0]+' '+(a.name.split(' ')[1]?a.name.split(' ')[1][0]+'.':'')}>{a.name}</option>)}
          </select>
          <select value={filterStage} onChange={e=>setFilterStage(e.target.value)} style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px 10px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}>
            <option value="">All Stages</option>
            {STAGE_ORDER.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        <div style={{display:'flex',gap:'7px'}}>
          <Btn variant="ghost" size="sm" onClick={()=>exportProd(filtered)}>Export CSV</Btn>
          <Btn size="sm" onClick={()=>setShowAdd(true)}>+ Add Deal</Btn>
        </div>
      </div>

      {/* Grouped table */}
      {groups.map(g => {
        const groupGCI  = g.deals.reduce((s,d)=>s+d.gci,0)
        const groupProd = g.deals.reduce((s,d)=>s+d.prod,0)
        return (
          <div key={g.stage} style={{marginBottom:'18px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'8px'}}>
              <div style={{width:10,height:10,borderRadius:'50%',background:g.color}}/>
              <span style={{fontSize:'13px',fontWeight:800}}>{g.stage}</span>
              <span style={{background:g.color+'18',color:g.color,fontSize:'10px',fontWeight:700,padding:'2px 8px',borderRadius:'20px'}}>{g.deals.length}</span>
              <span style={{color:'var(--muted)',fontSize:'11px',marginLeft:'4px'}}>Production: {fmt$(groupProd)} · GCI: {fmt$(groupGCI)}</span>
            </div>
            <Card>
              <div style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'9px 16px',borderBottom:'1px solid var(--border)',color:'var(--muted)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.7px',minWidth:'700px'}}>
                <div>Property</div><div>Agent</div><div>Side</div><div>Type</div><div>Source</div><div>A/O Date</div><div>Production</div><div>GCI</div>
              </div>
              <div style={{overflowX:'auto'}}>
                {g.deals.map(d => (
                  <div key={d.id} style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'11px 16px',borderBottom:'1px solid var(--border)',alignItems:'center',cursor:'pointer',minWidth:'700px'}}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <div>
                      <div style={{fontSize:'12px',fontWeight:700}}>{d.addr}</div>
                      {d.closeDate && <div style={{fontSize:'10px',color:'#16A34A'}}>Closed {d.closeDate}</div>}
                    </div>
                    <div style={{fontSize:'11px',color:'var(--muted)'}}>{d.agent}</div>
                    <div><span style={{fontSize:'10px',background:'var(--dim)',padding:'2px 7px',borderRadius:'20px',color:'var(--muted)'}}>{d.side}</span></div>
                    <div style={{fontSize:'10px',color:'var(--muted)'}}>{d.type||'—'}</div>
                    <div style={{fontSize:'10px',color:'var(--muted)'}}>{d.source}</div>
                    <div style={{fontSize:'11px',color:'var(--muted)'}}>{d.aoDate||'—'}</div>
                    <div style={{fontSize:'11px',fontWeight:700}}>{fmt$(d.prod)}</div>
                    <div style={{fontSize:'11px',fontWeight:700,color:'#D97706'}}>{fmt$(d.gci)}</div>
                  </div>
                ))}
              </div>
              {/* Group totals */}
              <div style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'10px 16px',background:'var(--dim)',borderTop:'2px solid var(--border)',minWidth:'700px'}}>
                <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)'}}>TOTAL ({g.deals.length})</div>
                <div/><div/><div/><div/><div/>
                <div style={{fontSize:'12px',fontWeight:800}}>{fmt$(groupProd)}</div>
                <div style={{fontSize:'12px',fontWeight:800,color:'#D97706'}}>{fmt$(groupGCI)}</div>
              </div>
            </Card>
          </div>
        )
      })}

      {/* Add deal modal */}
      {showAdd && <AddDealModal onClose={()=>setShowAdd(false)} onSaved={d=>{setDeals(prev=>[d,...prev]);setShowAdd(false)}}/>}
    </div>
  )
}

function AddDealModal({ onClose, onSaved }) {
  const [form, setForm] = useState({addr:'',agent:'',side:'Buyer',stage:'Offer Accepted',source:'',prod:'',gci:'',type:'Condo',aoDate:'',saleType:'On Market',saleSide:'Home Owner'})
  const set = (k,v) => setForm(f=>({...f,[k]:v}))
  function save() {
    if(!form.addr) return
    onSaved({...form, id:'d'+Date.now(), prod:parseFloat(form.prod)||0, gci:parseFloat(form.gci)||0, contractDate:'', expectedClose:'', closeDate:''})
  }
  return (
    <Modal onClose={onClose} maxWidth={520}>
      <ModalTitle onClose={onClose}>Add Deal</ModalTitle>
      <Input label="Property Address *" value={form.addr} onChange={e=>set('addr',e.target.value)} placeholder="84 Tennyson Drive, Nanuet NY"/>
      <Grid2 gap={10}>
        <Select label="Agent" value={form.agent} onChange={e=>set('agent',e.target.value)} options={[{value:'',label:'Select...'},...AGENTS.map(a=>({value:a.name,label:a.name}))]}/>
        <Select label="Side" value={form.side} onChange={e=>set('side',e.target.value)} options={['Buyer','Listing','Dual','Dual Buyer','Dual Listing','Flip']}/>
      </Grid2>
      <Grid2 gap={10}>
        <Select label="Stage" value={form.stage} onChange={e=>set('stage',e.target.value)} options={STAGE_ORDER}/>
        <Select label="Source" value={form.source} onChange={e=>set('source',e.target.value)} options={[{value:'',label:'Select...'},...SOURCES.map(s=>({value:s,label:s}))]}/>
      </Grid2>
      <Grid2 gap={10}>
        <Input label="Production ($)" value={form.prod} onChange={e=>set('prod',e.target.value)} type="number" placeholder="599000"/>
        <Input label="GCI ($)" value={form.gci} onChange={e=>set('gci',e.target.value)} type="number" placeholder="17970"/>
      </Grid2>
      <Grid2 gap={10}>
        <Select label="Property Type" value={form.type} onChange={e=>set('type',e.target.value)} options={[{value:'',label:'Select...'},...PROPERTY_TYPES.map(p=>({value:p,label:p}))]}/>
        <Input label="A/O Date" value={form.aoDate} onChange={e=>set('aoDate',e.target.value)} type="date"/>
      </Grid2>
      <div style={{display:'flex',gap:'8px',justifyContent:'flex-end',marginTop:'8px'}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save}>Add Deal</Btn>
      </div>
    </Modal>
  )
}

function exportProd(deals) {
  const h = 'Address,Agent,Side,Stage,Source,Production,GCI,A/O Date\n'
  const r = deals.map(d=>`"${d.addr}","${d.agent}","${d.side}","${d.stage}","${d.source}","${d.prod}","${d.gci}","${d.aoDate}"`)
  const b = new Blob([h+r.join('\n')],{type:'text/csv'})
  const a = document.createElement('a'); a.href=URL.createObjectURL(b); a.download='production.csv'; a.click()
}
