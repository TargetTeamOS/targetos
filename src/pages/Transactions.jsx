import React, { useState } from 'react'
import { Card, CardHeader, Badge, Btn, Modal, ModalTitle, Input, Select, Grid2, Grid3, Grid4, StatCard } from '../components/UI'
import { logChange } from '../lib/activityLog'
import { RecordActivityFeed } from '../components/RecordActivityFeed'
import { AGENTS, SOURCES, PROPERTY_TYPES, CTC_STAGES } from '../lib/constants'

const fmt$ = n => '$' + Number(n).toLocaleString()

const CTC_PCT = {'Inspection Scheduled':15,'Appraisal Ordered':30,'Mortgage Process':45,'Conditional Approval':62,'Clear to Close':82,'Closing Scheduled':92,'Closed':100}
const CTC_COLOR = {'Clear to Close':'#10B981','Conditional Approval':'#F59E0B','Mortgage Process':'#7C3AED','Inspection Scheduled':'#0EA5E9','Appraisal Ordered':'#E8650A','Closing Scheduled':'#0EA5E9','Closed':'#10B981','Issue':'#CC2200','Canceled':'#94A3B8'}

const INIT_TX = [
  {id:'t1',addr:'135 Route 306 Unit 111, Monsey',price:638000,type:'Condo',beds:'3',baths:'2',sqft:'1,215',tax:'$6,726/yr',agent:'Lazer F.',agentId:'a1',side:'Dual',ctc:'Conditional Approval',stage:'Offer Accepted',source:'On Market',saleType:'On Market',saleSide:'Home Owner',aoDate:'2026-06-12',contractDate:'',expectedClose:'2026-07-15',closeDate:'',clientName:'',clientPhone:'',clientEmail:'',atty:'',attyPhone:'',attyEmail:'',mtg:'',mtgContact:'',mtgPhone:'',gci:25520,production:638000,commRcvd:false,agentPaid:false,tasks:[{t:'Schedule inspection',done:false},{t:'Order appraisal',done:false},{t:'Get HOA documents',done:false}],docs:[],notes:''},
  {id:'t2',addr:'10 Sneden Court, Spring Valley',price:849000,type:'Condo',beds:'3',baths:'2',sqft:'',tax:'New Home',agent:'Lazer F.',agentId:'a1',side:'Dual',ctc:'Mortgage Process',stage:'Under Contract',source:'On Market',saleType:'On Market',saleSide:'Investor',aoDate:'2026-04-28',contractDate:'2026-05-05',expectedClose:'2026-07-08',closeDate:'',clientName:'',clientPhone:'',clientEmail:'',atty:'',attyPhone:'',attyEmail:'',mtg:'',mtgContact:'',mtgPhone:'',gci:33960,production:849000,commRcvd:false,agentPaid:false,tasks:[{t:'Submit loan package',done:true},{t:'Schedule inspection',done:true},{t:'Review title search',done:false},{t:'Submit conditions to bank',done:false}],docs:[],notes:''},
  {id:'t3',addr:'12 Sneden Ct, Spring Valley',price:875000,type:'Condo',beds:'',baths:'',sqft:'',tax:'New Home',agent:'Lazer F.',agentId:'a1',side:'Listing',ctc:'Conditional Approval',stage:'Under Contract',source:'On Market',saleType:'On Market',saleSide:'Investor',aoDate:'2026-04-21',contractDate:'2026-05-01',expectedClose:'2026-07-01',closeDate:'',clientName:'',clientPhone:'',clientEmail:'',atty:'',attyPhone:'',attyEmail:'',mtg:'',mtgContact:'',mtgPhone:'',gci:17500,production:875000,commRcvd:false,agentPaid:false,tasks:[{t:'Appraisal ordered',done:true},{t:'Review inspection',done:false},{t:'Get clear to close',done:false}],docs:[],notes:''},
  {id:'t4',addr:'105 Grove St #202, Monsey',price:1520000,type:'Condo',beds:'',baths:'',sqft:'',tax:'New Home',agent:'Eli H.',agentId:'a7',side:'Dual',ctc:'Mortgage Process',stage:'Under Contract',source:'FSBO',saleType:'FSBO',saleSide:'Home Owner',aoDate:'2026-02-19',contractDate:'2026-03-24',expectedClose:'2026-06-22',closeDate:'',clientName:'',clientPhone:'',clientEmail:'',atty:'',attyPhone:'',attyEmail:'',mtg:'',mtgContact:'',mtgPhone:'',gci:30400,production:1520000,commRcvd:false,agentPaid:false,tasks:[{t:'Submit full loan package',done:true},{t:'Schedule inspection',done:true},{t:'Get survey',done:false},{t:'Review title search',done:false}],docs:[],notes:'Dual deal'},
  {id:'t5',addr:'112 Washington Ave, Suffern',price:800000,type:'Multi Family',beds:'',baths:'',sqft:'',tax:'',agent:'Avraham W.',agentId:'a8',side:'Dual',ctc:'Clear to Close',stage:'Under Contract',source:'On Market',saleType:'On Market',saleSide:'Investor',aoDate:'2026-01-20',contractDate:'2026-01-26',expectedClose:'2026-06-04',closeDate:'',clientName:'',clientPhone:'',clientEmail:'',atty:'',attyPhone:'',attyEmail:'',mtg:'',mtgContact:'',mtgPhone:'',gci:24000,production:800000,commRcvd:false,agentPaid:false,tasks:[{t:'Order title insurance',done:true},{t:'Send wire instructions',done:false},{t:'Final walk-through',done:false}],docs:[],notes:''},
]

export function Transactions() {
  const [txs, setTxs] = useState(INIT_TX)
  const [showAdd, setShowAdd] = useState(false)
  const [txActivity, setTxActivity] = useState({}) // {txId: [entries]}

  function addTxActivity(txId, action, fieldName, oldVal, newVal) {
    setTxActivity(prev => ({...prev, [txId]: [{ action, field_name:fieldName, old_value:oldVal?String(oldVal):null, new_value:newVal?String(newVal):null, agent_name:'Admin', created_at:new Date().toISOString() }, ...(prev[txId]||[])] }))
  }
  const [expanded, setExpanded] = useState(null)

  const totalGCI = txs.reduce((s,t) => s+t.gci, 0)
  const totalProd = txs.reduce((s,t) => s+t.production, 0)
  const ctcPending = txs.filter(t => !['Closed','Canceled'].includes(t.ctc)).length

  function updateTx(id, changes) {
    setTxs(prev => prev.map(t => t.id===id ? {...t,...changes} : t))
  }
  function toggleTask(txId, taskIdx) {
    const tx = txs.find(t=>t.id===txId)
    const task = tx?.tasks[taskIdx]
    setTxs(prev => prev.map(t => {
      if(t.id !== txId) return t
      const tasks = t.tasks.map((tk,i) => i===taskIdx ? {...tk,done:!tk.done} : tk)
      return {...t, tasks}
    }))
    if(task) {
      const newDone = !task.done
      addTxActivity(txId, newDone?'Task Completed':'Task Reopened', 'Punch List', task.t, newDone?'Done':'Pending')
      logChange({recordType:'transaction',recordId:txId,recordName:tx?.addr||'',action:newDone?'Task Completed':'Task Reopened',field:'task',oldValue:task.t,newValue:newDone?'Done':'Pending',agentName:'Admin'})
    }
  }
  function addTask(txId, text) {
    if(!text.trim()) return
    setTxs(prev => prev.map(t => t.id!==txId ? t : {...t, tasks:[...t.tasks,{t:text,done:false}]}))
  }

  return (
    <div>
      <Grid4 style={{marginBottom:'14px'}}>
        <StatCard label="Active"      value={txs.length}      sub="Transactions"    subColor="var(--teal)"/>
        <StatCard label="CTC Pending" value={ctcPending}      sub="In process"      subColor="#D97706"/>
        <StatCard label="Total GCI"   value={fmt$(totalGCI)}  sub="Expected"        subColor="var(--green)"/>
        <StatCard label="Volume"      value={fmt$(totalProd)} sub="In escrow"       subColor="var(--purple)"/>
      </Grid4>

      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'14px'}}>
        <span style={{color:'var(--muted)',fontSize:'12px'}}>{txs.length} active transactions · Contract-to-Close</span>
        <Btn size="sm" onClick={()=>setShowAdd(true)}>+ New Transaction</Btn>
      </div>

      {txs.map(tx => {
        const pct = CTC_PCT[tx.ctc] || 50
        const color = CTC_COLOR[tx.ctc] || '#64748B'
        const isOpen = expanded === tx.id
        const doneTasks = tx.tasks.filter(t=>t.done).length

        return (
          <Card key={tx.id} style={{marginBottom:'13px',overflow:'visible'}}>
            {/* Header row */}
            <div style={{padding:'16px',cursor:'pointer'}} onClick={()=>setExpanded(isOpen?null:tx.id)}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'10px'}}>
                <div>
                  <div style={{fontSize:'14px',fontWeight:800}}>{tx.addr}</div>
                  <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'3px'}}>
                    {tx.agent} · {fmt$(tx.price)} · {tx.type||'Property'} · {tx.side} side
                  </div>
                </div>
                <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                  <select value={tx.ctc} onChange={e=>{e.stopPropagation();updateTx(tx.id,{ctc:e.target.value})}}
                    onClick={e=>e.stopPropagation()}
                    style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:color,fontSize:'11px',fontWeight:700,padding:'6px 10px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}>
                    {CTC_STAGES.map(s=><option key={s} style={{color:'var(--text)'}}>{s}</option>)}
                  </select>
                  <span style={{color:'var(--muted)',fontSize:'16px'}}>{isOpen?'▲':'▼'}</span>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{background:'var(--dim)',borderRadius:'99px',height:7,marginBottom:'8px',overflow:'hidden'}}>
                <div style={{background:color,borderRadius:'99px',height:7,width:pct+'%',transition:'width .5s'}}/>
              </div>

              {/* Key info row */}
              <div style={{display:'flex',gap:'16px',flexWrap:'wrap'}}>
                {[['A/O',tx.aoDate||'—'],['Contract',tx.contractDate||'—'],['Exp. Close',tx.expectedClose||'—'],['GCI',fmt$(tx.gci)],['Tasks',doneTasks+'/'+tx.tasks.length+' done']].map(([k,v])=>(
                  <div key={k}>
                    <span style={{fontSize:'10px',color:'var(--muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px'}}>{k}: </span>
                    <span style={{fontSize:'11px',fontWeight:700}}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Expanded detail */}
            {isOpen && (
              <div style={{borderTop:'1px solid var(--border)',padding:'16px'}}>
                <Grid3 gap={8} style={{marginBottom:'14px'}}>
                  {[['Beds',tx.beds||'—'],['Baths',tx.baths||'—'],['Sqft',tx.sqft||'—'],['Tax',tx.tax||'—'],['Side',tx.side],['Source',tx.source],['Sale Type',tx.saleType||'—'],['Buyer/Seller',tx.saleSide||'—'],['Expected Close',tx.expectedClose||'—']].map(([k,v])=>(
                    <div key={k} style={{background:'var(--dim)',borderRadius:'9px',padding:'9px'}}>
                      <div style={{color:'var(--muted)',fontSize:'9px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',marginBottom:'2px'}}>{k}</div>
                      <div style={{fontSize:'12px',fontWeight:700}}>{v}</div>
                    </div>
                  ))}
                </Grid3>

                {/* Contacts */}
                <Grid3 gap={8} style={{marginBottom:'14px'}}>
                  {[['Client',tx.clientName||'Not set',tx.clientPhone,tx.clientEmail],['Attorney',tx.atty||'Not set',tx.attyPhone,tx.attyEmail],['Mortgage',tx.mtg||'Not set',tx.mtgPhone,tx.mtgContact]].map(([label,name,phone,email])=>(
                    <div key={label} style={{background:'var(--dim)',borderRadius:'9px',padding:'10px'}}>
                      <div style={{color:'var(--muted)',fontSize:'9px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',marginBottom:'4px'}}>{label}</div>
                      <div style={{fontSize:'11px',fontWeight:700,marginBottom:'2px'}}>{name}</div>
                      {phone && <div style={{fontSize:'10px',color:'var(--muted)'}}>{phone}</div>}
                      <div style={{display:'flex',gap:'5px',marginTop:'6px'}}>
                        {phone && <button onClick={()=>window.location.href='tel:'+phone.replace(/\D/g,'')} style={{background:'none',border:'1px solid var(--border)',borderRadius:'6px',color:'var(--text)',fontSize:'10px',padding:'3px 8px',cursor:'pointer'}}>📞 Call</button>}
                        {email && <button onClick={()=>window.location.href='mailto:'+email} style={{background:'none',border:'1px solid var(--border)',borderRadius:'6px',color:'var(--text)',fontSize:'10px',padding:'3px 8px',cursor:'pointer'}}>✉ Email</button>}
                      </div>
                    </div>
                  ))}
                </Grid3>

                {/* Commission tracker */}
                <div style={{display:'flex',gap:'8px',marginBottom:'14px'}}>
                  <div onClick={()=>updateTx(tx.id,{commRcvd:!tx.commRcvd})} style={{flex:1,background:tx.commRcvd?'rgba(22,163,74,.08)':'var(--dim)',border:'1.5px solid '+(tx.commRcvd?'#16A34A':'var(--border)'),borderRadius:'9px',padding:'12px',cursor:'pointer',transition:'all .15s'}}>
                    <div style={{fontSize:'10px',color:'var(--muted)',fontWeight:700,textTransform:'uppercase',marginBottom:'4px'}}>Commission Received</div>
                    <div style={{fontSize:'13px',fontWeight:700,color:tx.commRcvd?'#16A34A':'#DC2626'}}>{tx.commRcvd?'✓ Yes':'Pending'}</div>
                  </div>
                  <div onClick={()=>updateTx(tx.id,{agentPaid:!tx.agentPaid})} style={{flex:1,background:tx.agentPaid?'rgba(22,163,74,.08)':'var(--dim)',border:'1.5px solid '+(tx.agentPaid?'#16A34A':'var(--border)'),borderRadius:'9px',padding:'12px',cursor:'pointer',transition:'all .15s'}}>
                    <div style={{fontSize:'10px',color:'var(--muted)',fontWeight:700,textTransform:'uppercase',marginBottom:'4px'}}>Agent Paid</div>
                    <div style={{fontSize:'13px',fontWeight:700,color:tx.agentPaid?'#16A34A':'#DC2626'}}>{tx.agentPaid?'✓ Yes':'Pending'}</div>
                  </div>
                  <div style={{flex:1,background:'var(--dim)',borderRadius:'9px',padding:'12px'}}>
                    <div style={{fontSize:'10px',color:'var(--muted)',fontWeight:700,textTransform:'uppercase',marginBottom:'4px'}}>GCI Expected</div>
                    <div style={{fontSize:'18px',fontWeight:900,color:'#D97706'}}>{fmt$(tx.gci)}</div>
                  </div>
                </div>

                {/* Punch list */}
                <div style={{background:'var(--dim)',borderRadius:'10px',padding:'13px',marginBottom:'13px'}}>
                  <div style={{fontSize:'12px',fontWeight:700,marginBottom:'10px'}}>CTC Punch List
                    <span style={{color:'var(--muted)',fontSize:'10px',fontWeight:400,marginLeft:'8px'}}>{doneTasks}/{tx.tasks.length} complete</span>
                  </div>
                  {tx.tasks.map((task,i)=>(
                    <div key={i} style={{display:'flex',alignItems:'center',gap:'9px',marginBottom:'8px'}}>
                      <div onClick={()=>toggleTask(tx.id,i)} style={{width:18,height:18,borderRadius:'5px',border:'2px solid '+(task.done?'#16A34A':'var(--border)'),background:task.done?'#16A34A':'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0,color:'#fff',fontSize:'10px'}}>
                        {task.done&&'✓'}
                      </div>
                      <div style={{fontSize:'12px',textDecoration:task.done?'line-through':'none',opacity:task.done?.5:1}}>{task.t}</div>
                    </div>
                  ))}
                  <AddTaskInline onAdd={text=>addTask(tx.id,text)}/>
                </div>

                {/* Notes */}
                {tx.notes && <div style={{background:'var(--dim)',borderRadius:'9px',padding:'11px',marginBottom:'13px',fontSize:'12px'}}>{tx.notes}</div>}

                {/* Activity Log */}
                <div style={{marginBottom:'14px'}}>
                  <div style={{fontSize:'12px',fontWeight:700,marginBottom:'10px',display:'flex',alignItems:'center',gap:'7px'}}>
                    <span>Activity Log</span>
                    <span style={{fontSize:'10px',color:'var(--muted)',fontWeight:400}}>Every change tracked</span>
                  </div>
                  <RecordActivityFeed recordType="transaction" recordId={tx.id} localEntries={txActivity[tx.id]||[]} compact/>
                </div>

                {/* Actions */}
                <div style={{display:'flex',gap:'7px',flexWrap:'wrap'}}>
                  {tx.attyPhone && <Btn size="sm" onClick={()=>window.location.href='tel:'+tx.attyPhone.replace(/\D/g,'')}>Call Attorney</Btn>}
                  {tx.mtgPhone  && <Btn size="sm" variant="secondary" onClick={()=>window.location.href='tel:'+tx.mtgPhone.replace(/\D/g,'')}>Call Mortgage</Btn>}
                  {tx.clientEmail && <Btn size="sm" variant="purple" onClick={()=>window.location.href='mailto:'+tx.clientEmail}>Email Client</Btn>}
                  <Btn size="sm" variant="green" onClick={()=>{updateTx(tx.id,{ctc:'Closed',closeDate:new Date().toLocaleDateString()});alert('Deal closed! '+tx.addr)}}>Mark Closed</Btn>
                  <Btn size="sm" variant="ghost" onClick={()=>updateTx(tx.id,{commRcvd:true,agentPaid:true})}>Mark Paid</Btn>
                </div>
              </div>
            )}
          </Card>
        )
      })}

      {showAdd && <AddTxModal onClose={()=>setShowAdd(false)} onSaved={tx=>{setTxs(prev=>[tx,...prev]);setShowAdd(false)}}/>}
    </div>
  )
}

function AddTaskInline({ onAdd }) {
  const [val, setVal] = useState('')
  return (
    <div style={{display:'flex',gap:'7px',marginTop:'8px'}}>
      <input value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&val.trim()){onAdd(val);setVal('')}}}
        placeholder="Add task..." style={{flex:1,background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'7px',color:'var(--text)',fontSize:'12px',padding:'7px 10px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}/>
      <button onClick={()=>{if(val.trim()){onAdd(val);setVal('')}}} style={{background:'var(--red)',border:'none',borderRadius:'7px',color:'#fff',fontSize:'12px',padding:'7px 12px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>Add</button>
    </div>
  )
}

function AddTxModal({ onClose, onSaved }) {
  const [form, setForm] = useState({addr:'',price:'',type:'Condo',agent:'',side:'Buyer',ctc:'Inspection Scheduled',source:'',aoDate:'',expectedClose:'',clientName:'',clientPhone:'',atty:'',attyPhone:'',mtg:'',mtgPhone:'',gci:''})
  const set = (k,v) => setForm(f=>({...f,[k]:v}))
  function save() {
    if(!form.addr) return
    onSaved({...form,id:'tx'+Date.now(),price:parseFloat(form.price)||0,gci:parseFloat(form.gci)||0,production:parseFloat(form.price)||0,beds:'',baths:'',sqft:'',tax:'',agentId:'',stage:'Offer Accepted',saleType:'On Market',saleSide:'Home Owner',contractDate:'',closeDate:'',clientEmail:'',attyEmail:'',mtgContact:'',mtgEmail:'',commRcvd:false,agentPaid:false,tasks:[{t:'Schedule inspection',done:false},{t:'Order appraisal',done:false}],docs:[],notes:''})
  }
  return (
    <Modal onClose={onClose} maxWidth={540}>
      <ModalTitle onClose={onClose}>New Transaction</ModalTitle>
      <Input label="Property Address *" value={form.addr} onChange={e=>set('addr',e.target.value)} placeholder="84 Tennyson Drive, Nanuet NY"/>
      <Grid2 gap={10}>
        <Input label="Sale Price ($)" value={form.price} onChange={e=>set('price',e.target.value)} type="number" placeholder="949000"/>
        <Input label="GCI Expected ($)" value={form.gci} onChange={e=>set('gci',e.target.value)} type="number" placeholder="28470"/>
      </Grid2>
      <Grid3 gap={10}>
        <Select label="Agent" value={form.agent} onChange={e=>set('agent',e.target.value)} options={[{value:'',label:'Select...'},...AGENTS.map(a=>({value:a.name,label:a.name}))]}/>
        <Select label="Side" value={form.side} onChange={e=>set('side',e.target.value)} options={['Buyer','Listing','Dual']}/>
        <Select label="CTC Stage" value={form.ctc} onChange={e=>set('ctc',e.target.value)} options={CTC_STAGES}/>
      </Grid3>
      <Grid2 gap={10}>
        <Input label="A/O Date" value={form.aoDate} onChange={e=>set('aoDate',e.target.value)} type="date"/>
        <Input label="Expected Close" value={form.expectedClose} onChange={e=>set('expectedClose',e.target.value)} type="date"/>
      </Grid2>
      <Grid2 gap={10}>
        <Input label="Client Name" value={form.clientName} onChange={e=>set('clientName',e.target.value)} placeholder="John & Jane Smith"/>
        <Input label="Client Phone" value={form.clientPhone} onChange={e=>set('clientPhone',e.target.value)} type="tel"/>
      </Grid2>
      <Grid2 gap={10}>
        <Input label="Attorney" value={form.atty} onChange={e=>set('atty',e.target.value)} placeholder="David Cohen Esq."/>
        <Input label="Attorney Phone" value={form.attyPhone} onChange={e=>set('attyPhone',e.target.value)} type="tel"/>
      </Grid2>
      <Grid2 gap={10}>
        <Input label="Mortgage Company" value={form.mtg} onChange={e=>set('mtg',e.target.value)} placeholder="Chase Bank"/>
        <Input label="Mortgage Phone" value={form.mtgPhone} onChange={e=>set('mtgPhone',e.target.value)} type="tel"/>
      </Grid2>
      <div style={{display:'flex',gap:'8px',justifyContent:'flex-end',marginTop:'8px'}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save}>Create Transaction</Btn>
      </div>
    </Modal>
  )
}
