import React, { useState } from 'react'
import { useApp } from '../context/AppContext'
import { Card, CardHeader, Btn, Modal, ModalTitle, Input, Select, Grid2, Grid3, StatCard, Grid4, Avatar } from '../components/UI'
import { useConfirm } from '../components/ConfirmDialog'
import { AGENTS } from '../lib/constants'

const fmt$ = n => '$' + Number(n).toLocaleString()

const AUTOMATIONS = [
  {id:'a1',name:'Deal Under Contract',trigger:'Status changes to Under Contract',action:'Generate UC card + start CTC checklist',active:true,lastFired:'Jun 10'},
  {id:'a2',name:'Closing in 7 days',trigger:'7 days before expected close date',action:'Send reminder to agent + secretary',active:true,lastFired:'Jun 21'},
  {id:'a3',name:'No contact in 5 days',trigger:'No activity for 5 days on contact',action:'Create follow-up task for agent',active:true,lastFired:'Jun 13'},
  {id:'a4',name:'New listing added',trigger:'New listing created',action:'Notify matching buyers via email',active:true,lastFired:'Jun 9'},
  {id:'a5',name:'Ad spend 80%+ of budget',trigger:'Ad spend reaches 80% of budget',action:'Notify admin + flag listing',active:true,lastFired:'Jun 12'},
  {id:'a6',name:'Deal closed',trigger:'CTC stage changes to Closed',action:'Generate Sold card + celebration + update leaderboard',active:true,lastFired:'Jun 10'},
  {id:'a7',name:'Missed call',trigger:'Inbound call not answered',action:'Send auto-SMS: Sorry we missed your call',active:false,lastFired:''},
  {id:'a8',name:'Birthday reminder',trigger:'3 days before contact birthday',action:'Remind assigned agent',active:true,lastFired:''},
  {id:'a9',name:'Accepted offer received',trigger:'Status changes to Offer Accepted',action:'Send celebration + notify team + start listing prep',active:true,lastFired:'Jun 12'},
]

export function Admin() {
  const { state } = useApp()
  const { confirm, ConfirmDialog } = useConfirm()
  const [agents, setAgents] = useState(AGENTS.map(a=>({...a,photo:null})))
  const [autos, setAutos] = useState(AUTOMATIONS)
  const [tab, setTab] = useState('agents')
  const [showAddAgent, setShowAddAgent] = useState(false)
  const [editAgent, setEditAgent] = useState(null)
  const [newAgent, setNewAgent] = useState({name:'',email:'',ext:'',role:'agent',color:'#CC2200'})

  function toggleAuto(id) {
    setAutos(prev => prev.map(a => a.id===id ? {...a,active:!a.active} : a))
  }
  function saveAgent() {
    if(!newAgent.name) return
    if(editAgent) {
      setAgents(prev => prev.map(a => a.id===editAgent.id ? {...a,...newAgent,ini:newAgent.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()} : a))
    } else {
      setAgents(prev => [...prev, {...newAgent, id:'a'+Date.now(), ini:newAgent.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase(), active:true}])
    }
    setShowAddAgent(false); setEditAgent(null); setNewAgent({name:'',email:'',ext:'',role:'agent',color:'#CC2200'})
  }

  return (
    <div>
      <ConfirmDialog/>
      {/* Tab bar */}
      <div style={{display:'flex',gap:'2px',background:'var(--dim)',borderRadius:'12px',padding:'4px',marginBottom:'18px'}}>
        {[['agents','Agent Management'],['perms','Permissions'],['autos','Automations'],['commission','Commission']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:'9px 12px',borderRadius:'9px',border:'none',cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:'Inter,system-ui,sans-serif',background:tab===k?'var(--panel)':'transparent',color:tab===k?'var(--text)':'var(--muted)',boxShadow:tab===k?'0 1px 3px rgba(0,0,0,.08)':'none'}}>
            {l}
          </button>
        ))}
      </div>

      {tab==='agents' && (
        <Card>
          <CardHeader>
            Agent Management ({agents.length})
            <Btn size="sm" onClick={()=>{setEditAgent(null);setNewAgent({name:'',email:'',ext:'',role:'agent',color:'#CC2200'});setShowAddAgent(true)}}>+ Add Agent</Btn>
          </CardHeader>
          {agents.map((a,i) => (
            <div key={a.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'12px 16px',borderBottom:'1px solid var(--border)'}}
              onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div style={{position:'relative',flexShrink:0}}>
                {a.photo
                  ? <img src={a.photo} alt={a.name} style={{width:36,height:36,borderRadius:'10px',objectFit:'cover'}}/>
                  : <Avatar name={a.name} color={a.color} size={36}/>
                }
                <label title="Upload photo" style={{position:'absolute',bottom:-4,right:-4,width:16,height:16,borderRadius:'50%',background:'var(--red)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:'9px',color:'#fff'}}>
                  +
                  <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{
                    const file=e.target.files[0]; if(!file) return
                    const reader=new FileReader()
                    reader.onload=ev=>setAgents(prev=>prev.map(ag=>ag.id===a.id?{...ag,photo:ev.target.result}:ag))
                    reader.readAsDataURL(file)
                  }}/>
                </label>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:'12px',fontWeight:700}}>{a.name}</div>
                <div style={{fontSize:'11px',color:'var(--muted)'}}>{a.email} · Ext {a.ext}</div>
              </div>
              <span style={{fontSize:'10px',background:'var(--dim)',padding:'3px 9px',borderRadius:'20px',color:'var(--muted)',textTransform:'capitalize'}}>{a.role}</span>
              <button onClick={()=>{setEditAgent(a);setNewAgent({name:a.name,email:a.email,ext:a.ext,role:a.role,color:a.color});setShowAddAgent(true)}} style={{background:'none',border:'none',fontSize:'14px',cursor:'pointer',color:'var(--muted)',padding:'4px'}}>✏️</button>
            </div>
          ))}
        </Card>
      )}

      {tab==='perms' && (
        <Card>
          <CardHeader>Role Permissions</CardHeader>
          <div style={{padding:'16px'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr repeat(3,auto)',gap:'0',borderRadius:'10px',overflow:'hidden',border:'1px solid var(--border)'}}>
              {/* Header */}
              <div style={{padding:'10px 14px',background:'var(--dim)',fontSize:'11px',fontWeight:700,borderBottom:'1px solid var(--border)'}}>Feature</div>
              {['Agent','Secretary','Admin'].map(r=><div key={r} style={{padding:'10px 14px',background:'var(--dim)',fontSize:'11px',fontWeight:700,borderBottom:'1px solid var(--border)',textAlign:'center',borderLeft:'1px solid var(--border)'}}>{r}</div>)}
              {/* Rows */}
              {[['Contacts — Own','✓','✓','✓'],['Contacts — All Agents','✗','✓','✓'],['Listings','✓','✓','✓'],['Ad Spend (internal)','✗','✓','✓'],['Transactions — Own','✓','✓','✓'],['Transactions — All','✗','✓','✓'],['Commission Tracker','✗','✓','✓'],['Activity Log','✗','✓','✓'],['Admin Panel','✗','✗','✓'],['Agent Management','✗','✗','✓'],['Automations','✗','✗','✓'],['Sign Tracker','✗','✓','✓'],['Offers Board','✗','✓','✓'],].map(([feature,...vals])=>(
                <React.Fragment key={feature}>
                  <div style={{padding:'9px 14px',borderBottom:'1px solid var(--border)',fontSize:'12px'}}>{feature}</div>
                  {vals.map((v,i)=>(
                    <div key={i} style={{padding:'9px 14px',borderBottom:'1px solid var(--border)',borderLeft:'1px solid var(--border)',textAlign:'center',fontSize:'14px',color:v==='✓'?'#16A34A':'#DC2626'}}>{v}</div>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>
        </Card>
      )}

      {tab==='autos' && (
        <Card>
          <CardHeader>Automations ({autos.filter(a=>a.active).length} active)</CardHeader>
          {autos.map(a=>(
            <div key={a.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'13px 16px',borderBottom:'1px solid var(--border)'}}>
              {/* Toggle */}
              <div onClick={()=>toggleAuto(a.id)} style={{width:40,height:22,borderRadius:'99px',background:a.active?'var(--green)':'var(--border)',position:'relative',cursor:'pointer',flexShrink:0,transition:'background .2s'}}>
                <div style={{width:18,height:18,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left:a.active?20:2,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:'12px',fontWeight:700}}>{a.name}</div>
                <div style={{fontSize:'10px',color:'var(--muted)',marginTop:'2px'}}><span style={{color:'var(--teal)'}}>When:</span> {a.trigger}</div>
                <div style={{fontSize:'10px',color:'var(--muted)'}}><span style={{color:'var(--orange)'}}>Then:</span> {a.action}</div>
                {a.lastFired && <div style={{fontSize:'10px',color:'var(--muted)',marginTop:'2px'}}>Last fired: {a.lastFired}</div>}
              </div>
              <button style={{background:'none',border:'1px solid var(--border)',borderRadius:'7px',color:'var(--text)',fontSize:'10px',padding:'5px 10px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>Edit</button>
            </div>
          ))}
          <div style={{padding:'14px 16px'}}>
            <Btn style={{width:'100%'}} onClick={()=>alert('Automation builder — full editor coming soon!')}>+ Create Automation</Btn>
          </div>
        </Card>
      )}

      {tab==='commission' && (
        <Card>
          <CardHeader>Commission Tracker</CardHeader>
          {[{addr:'135 Route 306, Monsey',agent:'Lazer F.',gci:25520,commRcvd:false,agentPaid:false},{addr:'10 Sneden Ct, Spring Valley',agent:'Lazer F.',gci:33960,commRcvd:false,agentPaid:false},{addr:'105 Grove St #202, Monsey',agent:'Eli H.',gci:30400,commRcvd:true,agentPaid:false},{addr:'112 Washington Ave, Suffern',agent:'Avraham W.',gci:24000,commRcvd:true,agentPaid:true}].map((tx,i)=>(
            <div key={i} style={{padding:'12px 16px',borderBottom:'1px solid var(--border)'}}>
              <div style={{fontSize:'12px',fontWeight:700,marginBottom:'8px'}}>{tx.addr} <span style={{color:'var(--muted)',fontWeight:400}}>· {tx.agent}</span></div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'7px'}}>
                <div style={{background:'var(--dim)',borderRadius:'8px',padding:'9px'}}>
                  <div style={{fontSize:'9px',color:'var(--muted)',fontWeight:700,textTransform:'uppercase',marginBottom:'3px'}}>GCI</div>
                  <div style={{fontSize:'13px',fontWeight:800,color:'#D97706'}}>{fmt$(tx.gci)}</div>
                </div>
                <div style={{background:tx.commRcvd?'rgba(22,163,74,.08)':'var(--dim)',borderRadius:'8px',padding:'9px',cursor:'pointer',border:tx.commRcvd?'1px solid #86EFAC':'1px solid transparent'}}>
                  <div style={{fontSize:'9px',color:'var(--muted)',fontWeight:700,textTransform:'uppercase',marginBottom:'3px'}}>Commission Received</div>
                  <div style={{fontSize:'13px',fontWeight:700,color:tx.commRcvd?'#16A34A':'#DC2626'}}>{tx.commRcvd?'✓ Yes':'Pending'}</div>
                </div>
                <div style={{background:tx.agentPaid?'rgba(22,163,74,.08)':'var(--dim)',borderRadius:'8px',padding:'9px',cursor:'pointer',border:tx.agentPaid?'1px solid #86EFAC':'1px solid transparent'}}>
                  <div style={{fontSize:'9px',color:'var(--muted)',fontWeight:700,textTransform:'uppercase',marginBottom:'3px'}}>Agent Paid</div>
                  <div style={{fontSize:'13px',fontWeight:700,color:tx.agentPaid?'#16A34A':'#DC2626'}}>{tx.agentPaid?'✓ Yes':'Pending'}</div>
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}

      {showAddAgent && (
        <Modal onClose={()=>{setShowAddAgent(false);setEditAgent(null)}} maxWidth={420}>
          <ModalTitle onClose={()=>{setShowAddAgent(false);setEditAgent(null)}}>{editAgent?'Edit Agent':'Add Agent'}</ModalTitle>
          <Input label="Full Name *" value={newAgent.name} onChange={e=>setNewAgent(a=>({...a,name:e.target.value}))} placeholder="John Smith"/>
          <Input label="Email" value={newAgent.email} onChange={e=>setNewAgent(a=>({...a,email:e.target.value}))} type="email" placeholder="john@targetreteam.com"/>
          <Grid2 gap={10}>
            <Input label="Extension" value={newAgent.ext} onChange={e=>setNewAgent(a=>({...a,ext:e.target.value}))} placeholder="109"/>
            <Select label="Role" value={newAgent.role} onChange={e=>setNewAgent(a=>({...a,role:e.target.value}))} options={['agent','admin','secretary']}/>
          </Grid2>
          <div style={{marginBottom:'16px'}}>
            <label style={{display:'block',fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'5px'}}>Color</label>
            <input type="color" value={newAgent.color} onChange={e=>setNewAgent(a=>({...a,color:e.target.value}))} style={{width:48,height:40,border:'none',borderRadius:'8px',cursor:'pointer',padding:'2px'}}/>
          </div>
          <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
            <Btn variant="ghost" onClick={()=>{setShowAddAgent(false);setEditAgent(null)}}>Cancel</Btn>
            <Btn onClick={saveAgent}>{editAgent?'Save Changes':'Add Agent'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
