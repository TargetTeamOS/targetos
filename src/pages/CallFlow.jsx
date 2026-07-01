// TargetOS V2 — Call Flow Builder
// Visual drag-and-drop IVR flow editor. 17 node types.

import React, { useState, useEffect, useRef } from 'react'
import { useApp }   from '../context/AppContext'
import { supabase } from '../lib/supabase'

const ff  = 'Inter, system-ui, -apple-system, sans-serif'
const NW  = 220   // node width
const NH  = 72    // node height
const PR  = 9     // port radius
const GAP = 32    // gap between nodes

const NODE_DEFS = [
  { type:'incoming',   label:'Incoming Call',   color:'#10B981', icon:'📞', cat:'trigger' },
  { type:'greeting',   label:'Play Greeting',   color:'#3B82F6', icon:'🔊', cat:'voice'   },
  { type:'menu',       label:'IVR Menu',        color:'#8B5CF6', icon:'🎛', cat:'voice'   },
  { type:'hold',       label:'Hold Music',      color:'#0EA5E9', icon:'🎵', cat:'voice'   },
  { type:'audio',      label:'Custom Audio',    color:'#6366F1', icon:'🔈', cat:'voice'   },
  { type:'language',   label:'Language Select', color:'#F97316', icon:'🌐', cat:'voice'   },
  { type:'condition',  label:'If / Condition',  color:'#F5A623', icon:'🔀', cat:'routing' },
  { type:'assigned',   label:'Assigned Agent',  color:'#10B981', icon:'🎯', cat:'routing' },
  { type:'dial',       label:'Dial Agent',      color:'#CC2200', icon:'📲', cat:'routing' },
  { type:'roundrobin', label:'Round Robin',     color:'#6366F1', icon:'🔄', cat:'routing' },
  { type:'ringall',    label:'Ring All',        color:'#EC4899', icon:'📣', cat:'routing' },
  { type:'voicemail',  label:'Voicemail',       color:'#F97316', icon:'📬', cat:'action'  },
  { type:'savelead',   label:'Save as Lead',    color:'#14B8A6', icon:'💾', cat:'action'  },
  { type:'sms',        label:'Send SMS',        color:'#84CC16', icon:'💬', cat:'action'  },
  { type:'hangup',     label:'Hang Up',         color:'#94A3B8', icon:'🔴', cat:'action'  },
  { type:'listings',   label:'CRM Listings',    color:'#8B5CF6', icon:'🏡', cat:'action'  },
  { type:'mlssearch',  label:'MLS Search',      color:'#0EA5E9', icon:'🔍', cat:'action'  },
]
const CATS = ['trigger','voice','routing','action'].map(id => ({ id, label: id.charAt(0).toUpperCase()+id.slice(1) }))
const PORT_COLORS = ['#3B82F6','#10B981','#F97316','#EC4899','#8B5CF6','#F5A623','#0EA5E9']
const TTS_VOICES = [
  {id:'Polly.Joanna', label:'Joanna (EN US) — F'},{id:'Polly.Matthew',label:'Matthew (EN US) — M'},
  {id:'Polly.Kendra', label:'Kendra (EN US) — F'},{id:'Polly.Joey',   label:'Joey (EN US) — M'},
  {id:'Polly.Salli',  label:'Salli (EN US) — F'}, {id:'Polly.Amy',    label:'Amy (EN GB) — F'},
  {id:'Polly.Lupe',   label:'Lupe (ES US) — F'},  {id:'Polly.Miguel', label:'Miguel (ES US) — M'},
  {id:'Polly.Penelope',label:'Penélope (ES US) — F'},
]
const HOLD_MUSIC = [{id:'classical',label:'Classical'},{id:'jazz',label:'Jazz'},{id:'pop',label:'Pop'},{id:'silence',label:'Silence'},{id:'custom',label:'Custom URL'}]

function nd(type) { return NODE_DEFS.find(n=>n.type===type)||{type:'unknown',label:'Unknown',color:'#94A3B8',icon:'?',cat:'action'} }

function defCfg(type) {
  if (type==='greeting')   return {text:'Thank you for calling Target Team.',voice:'Polly.Joanna'}
  if (type==='hold')       return {music:'classical',duration:30,say_first:'',voice:'Polly.Joanna'}
  if (type==='audio')      return {url:'',loop:1,say_first:''}
  if (type==='menu')       return {text:'Press 1 for sales. Press 2 for support.',timeout:10,voice:'Polly.Joanna',options:[{key:'1',label:'Sales',say:''},{key:'2',label:'Support',say:''}]}
  if (type==='language')   return {prompt:'For English press 1. Para Español oprima 2.',timeout:10,voice:'Polly.Joanna',options:[{key:'1',language:'en-US',voice:'Polly.Joanna',label:'English'},{key:'2',language:'es-US',voice:'Polly.Lupe',label:'Spanish'}]}
  if (type==='condition')  return {condition:'known_contact',yesLabel:'YES',noLabel:'NO'}
  if (type==='assigned')   return {timeout:30}
  if (type==='dial')       return {dial_type:'agent',agent_id:'',direct_number:'',sip_address:'',timeout:30}
  if (type==='roundrobin') return {agent_ids:[],timeout:30}
  if (type==='ringall')    return {agent_ids:[],timeout:30}
  if (type==='voicemail')  return {text:'Please leave your name and number after the tone.',voice:'Polly.Joanna',max_length:120,transcribe:true,notify_agent:true,pin_enabled:false,pin:'',pin_attempts:3}
  if (type==='savelead')   return {source:'Inbound Call'}
  if (type==='sms')        return {text:'Thanks for calling Target Team!',send_to:'caller'}
  if (type==='listings')   return {intro:'Welcome to our listings search.',voice:'Polly.Joanna',max_results:5}
  if (type==='mlssearch')  return {intro:'Welcome to our live MLS search.',voice:'Polly.Joanna',max_results:5,area:''}
  return {}
}

function getPorts(node) {
  const cfg=node.config||{}, opts=cfg.options||[]
  if (node.type==='condition') return [
    {id:'yes',label:cfg.yesLabel||'YES',color:'#10B981',y:NH*.33},
    {id:'no', label:cfg.noLabel ||'NO', color:'#DC2626',y:NH*.67},
  ]
  if (node.type==='assigned') return [{id:'notfound',label:'No Agent / Unavailable',color:'#DC2626',y:NH*.5}]
  if (node.type==='menu'||node.type==='language') return opts.map((o,i)=>({
    id:'key_'+o.key, label:node.type==='language'?(o.label||o.key):'Press '+o.key, color:PORT_COLORS[i%PORT_COLORS.length], y:(NH/(opts.length+1))*(i+1)
  }))
  if (['dial','roundrobin','ringall'].includes(node.type)) return [{id:'noanswer',label:'No Answer / Busy',color:'#DC2626',y:NH*.5}]
  if (node.type==='hangup') return []
  return [{id:'out',label:'',color:nd(node.type).color,y:NH*.5}]
}

function edgePath(fn,portId,tn) {
  if (!fn||!tn) return ''
  const p=getPorts(fn).find(p=>p.id===portId), sy=p?p.y:NH/2
  const x1=fn.x+NW, y1=fn.y+sy, x2=tn.x, y2=tn.y+NH/2
  const cx=x1+Math.max(50,(x2-x1)*.5)
  return 'M'+x1+' '+y1+' C'+cx+' '+y1+','+cx+' '+y2+','+x2+' '+y2
}

// ── CONFIG PANEL ──────────────────────────────────────────────────
function ConfigPanel({node,agents,onSave,onClose}) {
  const def = nd(node.type)
  const [cfg, setCfg] = useState(()=>({...node.config||{}}))
  const sa = agents||[]
  function set(k,v) { setCfg(p=>({...p,[k]:v})) }
  function close()  { onSave(node.id,cfg); onClose() }

  const S={width:'100%',padding:'7px 10px',borderRadius:8,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:13,fontFamily:ff}
  const L={fontSize:10,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.06em',display:'block',marginBottom:5}
  const R={marginBottom:14}
  const INFO={padding:'9px 12px',background:'var(--dim)',borderRadius:8,border:'1px solid var(--border)',fontSize:11,color:'var(--muted)',lineHeight:1.6,marginBottom:10}
  const VP=({k})=>(<div style={R}><label style={L}>Voice</label><select value={cfg[k]||'Polly.Joanna'} onChange={e=>set(k,e.target.value)} style={S}>{TTS_VOICES.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select></div>)

  return (
    <div style={{width:320,borderLeft:'1px solid var(--border)',background:'var(--panel)',display:'flex',flexDirection:'column',flexShrink:0,fontFamily:ff,overflow:'hidden'}}>
      <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10,background:def.color,flexShrink:0}}>
        <span style={{fontSize:20}}>{def.icon}</span>
        <div style={{flex:1,fontSize:14,fontWeight:800,color:'#fff'}}>{def.label}</div>
        <button onClick={close} style={{background:'rgba(255,255,255,.2)',border:'none',cursor:'pointer',color:'#fff',fontSize:18,borderRadius:6,width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:16}}>

        {node.type==='incoming'&&<div style={INFO}>📞 Every call starts here. Connect to your first step.</div>}
        {node.type==='hangup'  &&<div style={INFO}>🔴 Ends the call cleanly. No configuration needed.</div>}

        {node.type==='greeting'&&<>
          <div style={R}><label style={L}>Message</label><textarea value={cfg.text||''} onChange={e=>set('text',e.target.value)} rows={3} style={{...S,resize:'vertical'}} /></div>
          <VP k="voice"/>
        </>}

        {node.type==='hold'&&<>
          <div style={R}><label style={L}>Say before hold (optional)</label><input value={cfg.say_first||''} onChange={e=>set('say_first',e.target.value)} style={S} /></div>
          <div style={R}><label style={L}>Music</label><select value={cfg.music||'classical'} onChange={e=>set('music',e.target.value)} style={S}>{HOLD_MUSIC.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select></div>
          {cfg.music==='custom'&&<div style={R}><label style={L}>Custom URL (.mp3)</label><input value={cfg.custom_url||''} onChange={e=>set('custom_url',e.target.value)} style={S} placeholder="https://..." /></div>}
          <div style={R}><label style={L}>Duration (seconds)</label><input type="number" value={cfg.duration||30} onChange={e=>set('duration',parseInt(e.target.value)||30)} style={S} /></div>
        </>}

        {node.type==='audio'&&<>
          <div style={R}><label style={L}>Audio file URL (.mp3)</label><input value={cfg.url||''} onChange={e=>set('url',e.target.value)} style={S} placeholder="https://..." /></div>
          <div style={R}><label style={L}>Loop count</label><input type="number" min={1} max={10} value={cfg.loop||1} onChange={e=>set('loop',parseInt(e.target.value)||1)} style={S} /></div>
          <div style={R}><label style={L}>Say before playing (optional)</label><input value={cfg.say_first||''} onChange={e=>set('say_first',e.target.value)} style={S} /></div>
        </>}

        {node.type==='menu'&&<>
          <div style={R}><label style={L}>Prompt</label><textarea value={cfg.text||''} onChange={e=>set('text',e.target.value)} rows={3} style={{...S,resize:'vertical'}} /></div>
          <VP k="voice"/>
          <div style={R}><label style={L}>Timeout (seconds)</label><input type="number" value={cfg.timeout||10} onChange={e=>set('timeout',parseInt(e.target.value)||10)} style={S} /></div>
          <div style={R}>
            <label style={L}>Options — each becomes a connector port on the right</label>
            {(cfg.options||[]).map((o,i)=>(
              <div key={i} style={{display:'flex',gap:6,marginBottom:6,alignItems:'center'}}>
                <div style={{width:28,height:28,borderRadius:'50%',background:PORT_COLORS[i%PORT_COLORS.length],display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:800,fontSize:12,flexShrink:0}}>{o.key}</div>
                <input value={o.label||''} onChange={e=>{const opts=[...(cfg.options||[])];opts[i]={...opts[i],label:e.target.value};set('options',opts)}} style={{...S,flex:1}} placeholder="Label" />
                <input value={o.say||''} onChange={e=>{const opts=[...(cfg.options||[])];opts[i]={...opts[i],say:e.target.value};set('options',opts)}} style={{...S,flex:1}} placeholder="Say when pressed" />
                <button onClick={()=>{const opts=[...(cfg.options||[])];opts.splice(i,1);set('options',opts)}} style={{background:'none',border:'none',cursor:'pointer',color:'#DC2626',fontSize:16,flexShrink:0}}>×</button>
              </div>
            ))}
            <button onClick={()=>{const opts=[...(cfg.options||[])];opts.push({key:String(opts.length+1),label:'',say:''});set('options',opts)}} style={{marginTop:4,padding:'5px 12px',borderRadius:8,border:'1px dashed var(--border)',background:'transparent',color:'var(--muted)',fontSize:12,cursor:'pointer',fontFamily:ff}}>+ Add option</button>
          </div>
        </>}

        {node.type==='language'&&<>
          <div style={R}><label style={L}>Prompt</label><textarea value={cfg.prompt||''} onChange={e=>set('prompt',e.target.value)} rows={2} style={{...S,resize:'vertical'}} /></div>
          <VP k="voice"/>
          <div style={R}>
            <label style={L}>Languages</label>
            {(cfg.options||[]).map((o,i)=>(
              <div key={i} style={{display:'flex',gap:6,marginBottom:6,alignItems:'center'}}>
                <div style={{width:28,height:28,borderRadius:'50%',background:PORT_COLORS[i%PORT_COLORS.length],display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:800,fontSize:12,flexShrink:0}}>{o.key}</div>
                <input value={o.label||''} onChange={e=>{const opts=[...(cfg.options||[])];opts[i]={...opts[i],label:e.target.value};set('options',opts)}} style={{...S,flex:1}} placeholder="English" />
                <select value={o.voice||'Polly.Joanna'} onChange={e=>{const opts=[...(cfg.options||[])];opts[i]={...opts[i],voice:e.target.value};set('options',opts)}} style={{...S,flex:1}}>{TTS_VOICES.map(v=><option key={v.id} value={v.id}>{v.label.split('—')[0].trim()}</option>)}</select>
              </div>
            ))}
          </div>
        </>}

        {node.type==='condition'&&<>
          <div style={R}><label style={L}>Condition</label>
            <select value={cfg.condition||'known_contact'} onChange={e=>set('condition',e.target.value)} style={S}>
              <option value="known_contact">Caller is a known contact</option>
              <option value="has_agent">Caller has an assigned agent</option>
              <option value="repeat_caller">Caller has called before</option>
              <option value="business_hours">It is business hours (9am–6pm ET)</option>
              <option value="after_hours">It is after hours</option>
            </select>
          </div>
          <div style={{display:'flex',gap:8}}>
            <div style={{flex:1}}><label style={L}>YES label</label><input value={cfg.yesLabel||'YES'} onChange={e=>set('yesLabel',e.target.value)} style={S} /></div>
            <div style={{flex:1}}><label style={L}>NO label</label><input value={cfg.noLabel||'NO'} onChange={e=>set('noLabel',e.target.value)} style={S} /></div>
          </div>
        </>}

        {node.type==='assigned'&&<>
          <div style={INFO}>🎯 Looks up the caller in your CRM, dials their assigned agent directly. The <strong style={{color:'var(--text)'}}>No Agent / Unavailable</strong> port fires if nobody answers or the caller has no assigned agent.</div>
          <div style={R}><label style={L}>Ring timeout (seconds)</label><input type="number" value={cfg.timeout||30} onChange={e=>set('timeout',parseInt(e.target.value)||30)} style={S} /></div>
        </>}

        {node.type==='dial'&&<>
          <div style={R}><label style={L}>Dial type</label>
            <select value={cfg.dial_type||'agent'} onChange={e=>set('dial_type',e.target.value)} style={S}>
              <option value="agent">Agent from CRM</option>
              <option value="number">Direct phone number</option>
              <option value="sip">SIP / Office phone</option>
            </select>
          </div>
          {(!cfg.dial_type||cfg.dial_type==='agent')&&<div style={R}><label style={L}>Agent</label><select value={cfg.agent_id||''} onChange={e=>set('agent_id',e.target.value)} style={S}><option value="">— Select agent —</option>{sa.map(a=><option key={a.id} value={a.id}>{a.name}{a.phone?' · '+a.phone:''}</option>)}</select></div>}
          {cfg.dial_type==='number'&&<div style={R}><label style={L}>Phone number</label><input value={cfg.direct_number||''} onChange={e=>set('direct_number',e.target.value)} placeholder="+18455550100" style={S} /></div>}
          {cfg.dial_type==='sip'&&<div style={R}><label style={L}>SIP address</label><input value={cfg.sip_address||''} onChange={e=>set('sip_address',e.target.value)} placeholder="sip:101@pbx.example.com" style={S} /></div>}
          <div style={R}><label style={L}>Ring timeout (seconds)</label><input type="number" value={cfg.timeout||30} onChange={e=>set('timeout',parseInt(e.target.value)||30)} style={S} /></div>
          <div style={INFO}>When answered, the call connects — no further flow runs. <strong style={{color:'var(--text)'}}>No Answer / Busy</strong> fires on timeout — connect to voicemail or another step.</div>
        </>}

        {(node.type==='roundrobin'||node.type==='ringall')&&<>
          <div style={R}><label style={L}>{node.type==='ringall'?'Ring all simultaneously':'Round Robin (least-calls first)'}</label>
            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
              {sa.map(a=>{const ids=cfg.agent_ids||[],on=ids.includes(a.id);return(
                <button key={a.id} onClick={()=>set('agent_ids',on?ids.filter(x=>x!==a.id):[...ids,a.id])} style={{padding:'5px 12px',borderRadius:20,border:'1px solid '+(on?'#CC2200':'var(--border)'),background:on?'rgba(204,34,0,.1)':'transparent',color:on?'#CC2200':'var(--muted)',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:ff}}>
                  {on?'✓ ':''}{a.name.split(' ')[0]}
                </button>
              )})}
            </div>
          </div>
          <div style={R}><label style={L}>Timeout (seconds)</label><input type="number" value={cfg.timeout||30} onChange={e=>set('timeout',parseInt(e.target.value)||30)} style={S} /></div>
          <div style={INFO}>When any agent answers, the call connects. <strong style={{color:'var(--text)'}}>No Answer / Busy</strong> fires if nobody picks up.</div>
        </>}

        {node.type==='voicemail'&&<>
          <div style={R}><label style={L}>Greeting before the beep</label><textarea value={cfg.text||''} onChange={e=>set('text',e.target.value)} rows={3} style={{...S,resize:'vertical'}} /></div>
          <VP k="voice"/>
          <div style={R}><label style={L}>Max length (seconds)</label><input type="number" value={cfg.max_length||120} onChange={e=>set('max_length',parseInt(e.target.value)||120)} style={S} /></div>
          <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,cursor:'pointer',fontSize:13,color:'var(--text)'}}><input type="checkbox" checked={!!cfg.transcribe} onChange={e=>set('transcribe',e.target.checked)} /> Transcribe to text</label>
          <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:14,cursor:'pointer',fontSize:13,color:'var(--text)'}}><input type="checkbox" checked={!!cfg.notify_agent} onChange={e=>set('notify_agent',e.target.checked)} /> Notify agent by email</label>
          <div style={{borderTop:'1px solid var(--border)',paddingTop:14}}>
            <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,cursor:'pointer',fontSize:13,color:'var(--text)'}}><input type="checkbox" checked={!!cfg.pin_enabled} onChange={e=>set('pin_enabled',e.target.checked)} /> 🔒 Require PIN to access voicemail</label>
            {cfg.pin_enabled&&<>
              <div style={R}><label style={L}>PIN (4–8 digits)</label><input type="password" value={cfg.pin||''} onChange={e=>set('pin',e.target.value.replace(/[^0-9]/g,'').slice(0,8))} maxLength={8} style={S} /></div>
              <div style={R}><label style={L}>Max attempts</label><select value={cfg.pin_attempts||3} onChange={e=>set('pin_attempts',parseInt(e.target.value))} style={S}><option value={2}>2</option><option value={3}>3</option><option value={5}>5</option></select></div>
            </>}
          </div>
        </>}

        {node.type==='savelead'&&<>
          <div style={R}><label style={L}>Source label</label><input value={cfg.source||'Inbound Call'} onChange={e=>set('source',e.target.value)} style={S} /></div>
          <div style={INFO}>Creates a new CRM contact if the caller is not already in the system.</div>
        </>}

        {node.type==='sms'&&<>
          <div style={R}><label style={L}>Message</label><textarea value={cfg.text||''} onChange={e=>set('text',e.target.value)} rows={3} style={{...S,resize:'vertical'}} /></div>
          <div style={R}><label style={L}>Send to</label><select value={cfg.send_to||'caller'} onChange={e=>set('send_to',e.target.value)} style={S}><option value="caller">Caller</option><option value="both">Caller + Agent</option></select></div>
        </>}

        {node.type==='listings'&&<>
          <div style={R}><label style={L}>Opening message</label><textarea value={cfg.intro||''} onChange={e=>set('intro',e.target.value)} rows={2} style={{...S,resize:'vertical'}} /></div>
          <VP k="voice"/>
          <div style={R}><label style={L}>Max results to read (1–10)</label><input type="number" min={1} max={10} value={cfg.max_results||5} onChange={e=>set('max_results',parseInt(e.target.value)||5)} style={S} /></div>
          <div style={{...INFO, background:'rgba(139,92,246,.08)', borderColor:'rgba(139,92,246,.25)'}}>
            <strong style={{color:'var(--text)'}}>Filter flow callers can use:</strong><br/>
            1. 🏷 Price range (6 brackets from under $500k to $2M+, or any price)<br/>
            2. 🛏 Bedrooms (1–5+, or any)<br/>
            3. 🛁 Bathrooms (1, 2, 3+, or any)<br/>
            4. 🏠 Property type (Single Family, Condo, Townhouse, Multi Family, or all)<br/><br/>
            Searches Active listings in your CRM that have the 📞 IVR toggle enabled on the Listings board.
          </div>
        </>}

        {node.type==='mlssearch'&&<>
          <div style={R}><label style={L}>Opening message</label><textarea value={cfg.intro||''} onChange={e=>set('intro',e.target.value)} rows={2} style={{...S,resize:'vertical'}} /></div>
          <VP k="voice"/>
          <div style={R}><label style={L}>Area filter (optional)</label><input value={cfg.area||''} onChange={e=>set('area',e.target.value)} style={S} placeholder="e.g. Spring Valley" /></div>
          <div style={R}><label style={L}>Max listings (1–10)</label><input type="number" min={1} max={10} value={cfg.max_results||5} onChange={e=>set('max_results',parseInt(e.target.value)||5)} style={S} /></div>
          <div style={INFO}>Searches the live OneKey MLS feed. Requires SimplyRETS credentials in Vercel env vars.</div>
        </>}

      </div>
      <div style={{padding:12,borderTop:'1px solid var(--border)',flexShrink:0}}>
        <button onClick={close} style={{width:'100%',padding:'9px',borderRadius:9,border:'none',background:'var(--brand)',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:ff}}>✓ Save &amp; Close</button>
      </div>
    </div>
  )
}

// ── FLOW NODE ─────────────────────────────────────────────────────
function FlowNode({node,selected,agents,connectedPorts,activePort,onMouseDownNode,onMouseDownPort,onPortDrop,onDelete}) {
  const def=nd(node.type), cfg=node.config||{}, ports=getPorts(node)
  let sub=''
  if (node.type==='menu'||node.type==='language')       sub=(cfg.options||[]).length+' options'
  else if (node.type==='condition')                      sub=(cfg.condition||'').replace(/_/g,' ')
  else if (node.type==='dial')                           sub=cfg.agent_id&&agents?((agents.find(a=>a.id===cfg.agent_id)||{}).name||'select agent'):cfg.direct_number||cfg.sip_address||'configure'
  else if (node.type==='roundrobin'||node.type==='ringall') sub=(cfg.agent_ids||[]).length+' agents'
  else if (node.type==='greeting'||node.type==='voicemail') sub=(cfg.text||'').slice(0,30)
  else if (node.type==='hold')                           sub=(HOLD_MUSIC.find(m=>m.id===cfg.music)||{}).label||'classical'
  else if (node.type==='listings')                       sub='CRM listings · keypad'
  else if (node.type==='mlssearch')                      sub='live MLS · keypad'
  else if (node.type==='sms')                            sub=(cfg.text||'').slice(0,30)
  else sub=def.label.toLowerCase()

  const fill  =selected?def.color:'var(--panel)'
  const stroke=selected?def.color:'var(--border)'
  const tFill =selected?'#fff':'var(--text)'
  const sFill =selected?'rgba(255,255,255,.7)':'var(--muted)'

  return (
    <g transform={'translate('+node.x+','+node.y+')'}>
      <rect x={2} y={3} width={NW} height={NH} rx={11} fill="rgba(0,0,0,.08)" />
      <rect x={0} y={0} width={NW} height={NH} rx={11} fill={fill} stroke={stroke} strokeWidth={selected?2.5:1.5} style={{cursor:'grab'}} onMouseDown={e=>onMouseDownNode(e,node.id)} />
      <rect x={0} y={0} width={7} height={NH} rx={5} fill={def.color} />
      <text x={22} y={NH/2} fontSize={18} dominantBaseline="middle">{def.icon}</text>
      <text x={48} y={NH/2-7} fontSize={13} fontWeight={700} fill={tFill} fontFamily={ff} dominantBaseline="middle">{def.label}</text>
      <text x={48} y={NH/2+9} fontSize={10} fill={sFill} fontFamily={ff} dominantBaseline="middle">{sub.length>32?sub.slice(0,30)+'…':sub}</text>

      {node.type!=='incoming'&&(
        <g>
          <rect x={-22} y={0} width={NW/2} height={NH} fill="transparent" onMouseUp={e=>{e.stopPropagation();onPortDrop(node.id)}} />
          <circle cx={0} cy={NH/2} r={PR} fill="var(--panel)" stroke={def.color} strokeWidth={2.5} style={{pointerEvents:'none'}} />
        </g>
      )}

      {selected&&node.type!=='incoming'&&(
        <g style={{cursor:'pointer'}} onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onDelete(node.id)}}>
          <circle cx={NW-11} cy={11} r={10} fill="#DC2626" />
          <text x={NW-11} y={11} textAnchor="middle" dominantBaseline="middle" fontSize={15} fill="#fff" fontFamily={ff} fontWeight={700}>×</text>
        </g>
      )}

      {ports.map(p=>{
        const conn=connectedPorts&&connectedPorts.has(node.id+':'+p.id)
        const act =activePort&&activePort.fromId===node.id&&activePort.portId===p.id
        return (
          <g key={p.id}>
            <rect x={NW-12} y={p.y-22} width={40} height={44} fill="transparent" style={{cursor:'crosshair'}} onMouseDown={e=>{e.stopPropagation();e.preventDefault();onMouseDownPort(e,node.id,p.id)}} />
            <circle cx={NW} cy={p.y} r={PR} fill={conn||act?p.color:'var(--panel)'} stroke={p.color} strokeWidth={2} style={{pointerEvents:'none'}} />
            {p.label&&<text x={NW+PR+4} y={p.y} fontSize={9} fontWeight={700} fill={p.color} fontFamily={ff} dominantBaseline="middle">{p.label}</text>}
          </g>
        )
      })}
    </g>
  )
}

// ── MAIN ──────────────────────────────────────────────────────────
export function CallFlow() {
  const {toast} = useApp()
  const [nodes,    setNodes]    = useState([{id:'start',type:'incoming',x:80,y:200,config:{}}])
  const [edges,    setEdges]    = useState([])
  const [selected, setSelected] = useState(null)
  const [agents,   setAgents]   = useState([])
  const [flowName, setFlowName] = useState('Main Call Flow')
  const [savedId,  setSavedId]  = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [dirty,    setDirty]    = useState(false)
  const [dbStatus, setDbStatus] = useState(null)
  const [zoom,     setZoom]     = useState(1)
  const [pan,      setPan]      = useState({x:0,y:0})
  const svgRef   = useRef(null)
  const nextId   = useRef(0)
  const dragNode = useRef(null)
  const dragWire = useRef(null)
  const [wirePos,  setWirePos]  = useState(null)
  const [actPort,  setActPort]  = useState(null)
  const [dragging, setDragging] = useState(false)

  const selectedNode = nodes.find(n=>n.id===selected)

  // Load
  useEffect(()=>{
    supabase.from('phone_ivr').select('*').order('updated_at',{ascending:false}).limit(1).maybeSingle().then(r=>{
      const d=r.data
      if (!d) { setDbStatus('empty'); return }
      if (!d.flow_nodes) { setDbStatus('no_columns'); return }
      const fn=typeof d.flow_nodes==='string'?JSON.parse(d.flow_nodes):d.flow_nodes
      const fe=d.flow_edges?(typeof d.flow_edges==='string'?JSON.parse(d.flow_edges):d.flow_edges):[]
      if (fn?.length) {
        setNodes(fn); setEdges(fe); setFlowName(d.name||'Main Call Flow'); setSavedId(d.id); setDbStatus('ok')
        fn.forEach(n=>{ const num=parseInt((n.id||'').replace(/\D/g,'')); if (!isNaN(num)&&num>nextId.current) nextId.current=num })
      } else setDbStatus('empty')
    }).catch(()=>setDbStatus('no_columns'))
  },[])

  useEffect(()=>{ supabase.from('agents').select('id,name,phone,color').eq('active',true).then(r=>setAgents(r.data||[])) },[])

  // Save
  async function saveFlow() {
    setSaving(true)
    try {
      const payload={name:flowName,flow_nodes:nodes,flow_edges:edges,is_active:true,updated_at:new Date().toISOString()}
      if (savedId) {
        const {error}=await supabase.from('phone_ivr').update(payload).eq('id',savedId)
        if (error) throw error
      } else {
        const {data:ex}=await supabase.from('phone_ivr').select('id').limit(1).maybeSingle()
        if (ex?.id) { await supabase.from('phone_ivr').update(payload).eq('id',ex.id); setSavedId(ex.id) }
        else { const {data:ins,error}=await supabase.from('phone_ivr').insert({...payload,voicemail_extension:'9',created_at:new Date().toISOString()}).select().single(); if (error) throw error; if (ins) setSavedId(ins.id) }
      }
      setDbStatus('ok'); setDirty(false); toast('✅ Flow saved — '+flowName)
    } catch(e) { toast('Save failed: '+e.message,'#DC2626') } finally { setSaving(false) }
  }

  // Node management
  function addNode(type) {
    const id='n'+(++nextId.current)
    function overlaps(x,y) { return nodes.some(n=>x<n.x+NW+GAP&&x+NW+GAP>n.x&&y<n.y+NH+GAP&&y+NH+GAP>n.y) }
    let nx=320,ny=60,placed=false
    for (let row=0;row<15&&!placed;row++) for (let col=0;col<8&&!placed;col++) { const tx=320+col*(NW+GAP),ty=60+row*(NH+GAP); if (!overlaps(tx,ty)){nx=tx;ny=ty;placed=true} }
    setNodes(p=>[...p,{id,type,x:nx,y:ny,config:defCfg(type)}])
    setSelected(id); setDirty(true)
  }

  function deleteNode(id) { setNodes(p=>p.filter(n=>n.id!==id)); setEdges(p=>p.filter(e=>e.from!==id&&e.to!==id)); setSelected(null); setDirty(true) }

  function updateCfg(id,cfg) {
    setNodes(p=>p.map(n=>n.id===id?{...n,config:cfg}:n))
    const node=nodes.find(n=>n.id===id)
    if (node&&(node.type==='menu'||node.type==='language')) {
      const vp=new Set((cfg.options||[]).map(o=>'key_'+o.key))
      setEdges(p=>p.filter(e=>e.from!==id||!e.port.startsWith('key_')||vp.has(e.port)))
    }
    setDirty(true)
  }

  function deleteEdge(id) { setEdges(p=>p.filter(e=>e.id!==id)); setDirty(true) }

  // Canvas coords
  function toCanvas(e) {
    const r=svgRef.current.getBoundingClientRect()
    return {x:(e.clientX-r.left-pan.x)/zoom, y:(e.clientY-r.top-pan.y)/zoom}
  }

  // Mouse handlers
  function onMouseDownNode(e,id) {
    if (dragWire.current) return
    e.preventDefault(); e.stopPropagation()
    const node=nodes.find(n=>n.id===id); if (!node) return
    const {x,y}=toCanvas(e)
    dragNode.current={id,ox:x-node.x,oy:y-node.y}
    setNodes(p=>{ if (p[p.length-1]?.id===id) return p; const n=p.find(x=>x.id===id); return n?[...p.filter(x=>x.id!==id),n]:p })
    setSelected(id); setDragging(true)
  }
  function onMouseDownPort(e,fromId,portId) {
    e.preventDefault(); e.stopPropagation()
    dragNode.current=null
    const {x,y}=toCanvas(e)
    dragWire.current={fromId,portId}; setActPort({fromId,portId}); setWirePos({x,y})
  }
  function onPortDrop(toId) { if (!dragWire.current||toId===dragWire.current.fromId) return; finishWire(toId) }
  function finishWire(toId) {
    const {fromId,portId}=dragWire.current
    setEdges(p=>[...p.filter(e=>!(e.from===fromId&&e.port===portId)),{id:'e_'+fromId+'_'+portId+'_'+toId,from:fromId,port:portId,to:toId}])
    setDirty(true); dragWire.current=null; setWirePos(null); setActPort(null); setDragging(false)
  }
  function onSvgMouseMove(e) {
    const {x,y}=toCanvas(e)
    if (dragNode.current) { const {id,ox,oy}=dragNode.current; setNodes(p=>p.map(n=>n.id===id?{...n,x:Math.max(0,x-ox),y:Math.max(0,y-oy)}:n)) }
    if (dragWire.current) setWirePos({x,y})
  }
  function onSvgMouseUp(e) {
    if (dragWire.current) {
      const {x,y}=toCanvas(e)
      const hit=nodes.find(n=>n.id!==dragWire.current.fromId&&x>=n.x-40&&x<=n.x+NW+40&&y>=n.y-40&&y<=n.y+NH+40)
      if (hit) finishWire(hit.id); else { dragWire.current=null; setWirePos(null); setActPort(null) }
    }
    dragNode.current=null; setDragging(false)
  }
  function onSvgClick(e) { if (e.target===svgRef.current) setSelected(null) }

  function livePath() {
    if (!dragWire.current||!wirePos) return ''
    const fn=nodes.find(n=>n.id===dragWire.current.fromId); if (!fn) return ''
    const p=getPorts(fn).find(p=>p.id===dragWire.current.portId), sy=p?p.y:NH/2
    const x1=fn.x+NW,y1=fn.y+sy,x2=wirePos.x,y2=wirePos.y,cx=x1+Math.max(40,(x2-x1)*.5)
    return 'M'+x1+' '+y1+' C'+cx+' '+y1+','+cx+' '+y2+','+x2+' '+y2
  }

  const connPorts=new Set(edges.map(e=>e.from+':'+e.port))
  const MARKER_COLORS=['#CC2200','#10B981','#DC2626','#3B82F6','#F5A623','#8B5CF6','#0EA5E9','#EC4899','#84CC16','#F97316','#6366F1','#14B8A6']

  const [paletteOpen, setPaletteOpen] = React.useState(true)
  const [fullscreen, setFullscreen] = React.useState(false)

  React.useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { if (selectedNode) setSelected(null); if (fullscreen) setFullscreen(false) }
      if (e.key === 'f' && (e.ctrlKey||e.metaKey)) { e.preventDefault(); setFullscreen(f=>!f) }
      if (e.key === 'Delete' && selected && selected !== 'start') deleteNode(selected)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, fullscreen])

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:'var(--bg)',fontFamily:ff,overflow:'hidden',position:fullscreen?'fixed':'relative',inset:fullscreen?0:'auto',zIndex:fullscreen?9999:'auto'}}>

      {/* TOOLBAR */}
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 14px',borderBottom:'1px solid var(--border)',flexShrink:0,background:'var(--panel)',flexWrap:'wrap'}}>
        <input value={flowName} onChange={e=>setFlowName(e.target.value)} style={{padding:'5px 10px',borderRadius:7,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:13,fontFamily:ff,width:200}} />
        {dirty&&<div style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:20,background:'rgba(245,166,35,.12)',border:'1px solid rgba(245,166,35,.35)',fontSize:11,color:'#D97706',fontWeight:700}}>● Unsaved</div>}
        {!dirty&&dbStatus==='ok'&&<div style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:20,background:'rgba(16,185,129,.1)',border:'1px solid rgba(16,185,129,.3)',fontSize:11,color:'#10B981',fontWeight:700}}>● Live</div>}
        {dbStatus==='no_columns'&&<div style={{fontSize:11,color:'#D97706',background:'rgba(245,166,35,.1)',padding:'4px 10px',borderRadius:8,border:'1px solid rgba(245,166,35,.3)'}}>⚠️ Run SQL to add flow_nodes / flow_edges columns — see Settings</div>}
        <div style={{flex:1}} />
        <button onClick={()=>{if(window.confirm('Clear canvas?')){setNodes([{id:'start',type:'incoming',x:80,y:200,config:{}}]);setEdges([]);setSelected(null);setDirty(true)}}} style={{padding:'5px 12px',borderRadius:7,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--muted)',fontSize:11,cursor:'pointer',fontFamily:ff}}>🗑 Clear</button>
        <button onClick={()=>setFullscreen(f=>!f)} title={fullscreen?'Exit fullscreen (Ctrl+F)':'Fullscreen (Ctrl+F)'} style={{padding:'5px 10px',borderRadius:7,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:14,cursor:'pointer',fontFamily:ff}}>{fullscreen?'⊡':'⛶'}</button>
        <button onClick={saveFlow} disabled={saving} style={{padding:'6px 16px',borderRadius:8,border:'none',background:dirty?'#CC2200':'#1B2B4B',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:ff,opacity:saving?.7:1}}>
          {saving?'⏳ Saving...':'💾 Save Flow'}
        </button>
      </div>

      {/* BODY */}
      <div style={{flex:1,display:'flex',overflow:'hidden'}}>

        {/* PALETTE — collapsible */}
        <div style={{display:'flex',flexDirection:'column',borderRight:'1px solid var(--border)',background:'var(--panel)',flexShrink:0,transition:'width .2s',width:paletteOpen?150:36,overflow:'hidden'}}>
          <button onClick={()=>setPaletteOpen(p=>!p)} title={paletteOpen?'Collapse palette':'Expand palette'} style={{padding:'8px',border:'none',background:'transparent',color:'var(--muted)',cursor:'pointer',fontSize:16,flexShrink:0,borderBottom:'1px solid var(--border)',textAlign:'center'}}>
            {paletteOpen?'◀':'▶'}
          </button>
          <div style={{width:150,overflowY:'auto',flex:1,opacity:paletteOpen?1:0,pointerEvents:paletteOpen?'auto':'none'}}>
          {CATS.map(cat=>{
            const cNodes=NODE_DEFS.filter(n=>n.cat===cat.id&&n.type!=='incoming')
            if (!cNodes.length) return null
            return (<div key={cat.id}>
              <div style={{padding:'8px 12px 4px',fontSize:9,fontWeight:800,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.08em'}}>{cat.label}</div>
              {cNodes.map(def=>(
                <button key={def.type} onClick={()=>addNode(def.type)} title={'Add '+def.label}
                  style={{display:'flex',alignItems:'center',gap:7,padding:'7px 12px',width:'100%',border:'none',background:'transparent',color:'var(--text)',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:ff,textAlign:'left',transition:'background .1s'}}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <span style={{fontSize:14,flexShrink:0}}>{def.icon}</span><span>{def.label}</span>
                </button>
              ))}
            </div>)
          })}
          </div>
        </div>

        {/* CANVAS */}
        <div style={{flex:1,position:'relative',overflow:'hidden',background:'var(--dim)',cursor:dragging?'grabbing':'default'}}>

          {/* Zoom */}
          <div style={{position:'absolute',bottom:14,right:14,zIndex:20,display:'flex',flexDirection:'column',gap:4}}>
            {[['＋',.15],['－',-.15],['⊡',null]].map(([l,d])=>(
              <button key={l} onClick={()=>d?setZoom(z=>Math.max(.25,Math.min(2.5,z+d))):(setZoom(1),setPan({x:0,y:0}))}
                style={{width:30,height:30,borderRadius:7,border:'1px solid var(--border)',background:'var(--panel)',color:'var(--text)',fontSize:16,cursor:'pointer',fontFamily:ff,display:'flex',alignItems:'center',justifyContent:'center'}}>{l}</button>
            ))}
            <div style={{textAlign:'center',fontSize:9,color:'var(--muted)'}}>{Math.round(zoom*100)}%</div>
          </div>

          {/* Empty state */}
          {nodes.length<=1&&(
            <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
              <div style={{textAlign:'center',opacity:.35}}>
                <div style={{fontSize:40,marginBottom:12}}>🔀</div>
                <div style={{fontSize:15,fontWeight:800,color:'var(--text)',marginBottom:6}}>Build your call flow</div>
                <div style={{fontSize:13,color:'var(--muted)'}}>Click a node type on the left to add it,<br/>drag the coloured dots to connect nodes.</div>
              </div>
            </div>
          )}

          {dragWire.current&&wirePos&&(
            <div style={{position:'absolute',top:14,left:'50%',transform:'translateX(-50%)',padding:'7px 20px',borderRadius:20,background:'#CC2200',color:'#fff',fontSize:12,fontWeight:700,zIndex:10,pointerEvents:'none',boxShadow:'0 4px 16px rgba(0,0,0,.25)',whiteSpace:'nowrap'}}>
              Drop onto any node to connect
            </div>
          )}

          <svg ref={svgRef}
            style={{position:'absolute',inset:0,width:'100%',height:'100%',overflow:'visible',userSelect:'none'}}
            onMouseMove={onSvgMouseMove} onMouseUp={onSvgMouseUp} onMouseLeave={onSvgMouseUp} onClick={onSvgClick}
            onWheel={e=>{e.preventDefault();setZoom(z=>Math.max(.25,Math.min(2.5,z+(e.deltaY>0?-.08:.08))))}}>

            <defs>
              {MARKER_COLORS.map(c=>(
                <marker key={c} id={'arr_'+c.slice(1)} markerWidth={8} markerHeight={8} refX={7} refY={3} orient="auto">
                  <path d="M 0 0 L 7 3 L 0 6 z" fill={c} />
                </marker>
              ))}
            </defs>

            <g transform={'translate('+pan.x+','+pan.y+') scale('+zoom+')'}>
              {/* Edges */}
              {edges.map(edge=>{
                const fn=nodes.find(n=>n.id===edge.from), tn=nodes.find(n=>n.id===edge.to)
                const path=edgePath(fn,edge.port,tn); if (!path) return null
                const color=(getPorts(fn||{type:'__'}).find(p=>p.id===edge.port)||{color:'#94A3B8'}).color
                const label=(getPorts(fn||{type:'__'}).find(p=>p.id===edge.port)||{label:''}).label
                const mx=fn&&tn?(fn.x+NW+tn.x)/2:0, my=fn&&tn?(fn.y+tn.y)/2+NH/2:0
                return (
                  <g key={edge.id}>
                    <path d={path} fill="none" stroke="transparent" strokeWidth={20} style={{cursor:'pointer'}} onClick={e=>{e.stopPropagation();deleteEdge(edge.id)}} />
                    <path d={path} fill="none" stroke={color} strokeWidth={2.5} opacity={0.88} markerEnd={'url(#arr_'+color.slice(1)+')'} />
                    {label&&<g><rect x={mx-36} y={my-9} width={72} height={18} rx={9} fill={color} opacity={.9} /><text x={mx} y={my+4} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff" fontFamily={ff}>{label}</text></g>}
                  </g>
                )
              })}

              {dragWire.current&&wirePos&&<path d={livePath()} fill="none" stroke="#CC2200" strokeWidth={2.5} strokeDasharray="8 4" opacity={.75} />}

              {/* Nodes */}
              {nodes.map(node=>(
                <g key={node.id}>
                  <FlowNode node={node} selected={selected===node.id} agents={agents} connectedPorts={connPorts} activePort={actPort}
                    onMouseDownNode={onMouseDownNode} onMouseDownPort={onMouseDownPort} onPortDrop={onPortDrop} onDelete={deleteNode} />
                </g>
              ))}
            </g>
          </svg>
        </div>

        {/* CONFIG PANEL — floating overlay so canvas stays full width */}
        {selectedNode&&(
          <div style={{position:'absolute',top:0,right:0,bottom:0,width:300,zIndex:50,boxShadow:'-4px 0 24px rgba(0,0,0,.25)'}}>
            <ConfigPanel key={selectedNode.id} node={selectedNode} agents={agents} onSave={updateCfg} onClose={()=>setSelected(null)} />
          </div>
        )}
      </div>
    </div>
  )
}
