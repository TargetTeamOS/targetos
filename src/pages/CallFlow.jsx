// TargetOS V2 — Call Flow Builder
// Fixed: SVG coordinate scaling, enlarged hit zones, reliable drag-connect
// New: Hold Music node, Custom Audio node, Language node
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp }    from '../context/AppContext'
import { supabase }  from '../lib/supabase'
import { Btn }       from '../components/UI'
import { useAgents } from '../lib/hooks'

const ff  = 'Inter, system-ui, sans-serif'
const NW  = 220   // node width
const NH  = 76    // node height
const PR  = 10    // port circle radius
const PHZ = 34    // port hit zone — large for touch/mobile
const INR = 14    // input port hit zone radius (left side)

// ── NODE DEFINITIONS ─────────────────────────────────────────────
const NODE_DEFS = [
  { type:'incoming',   label:'Incoming Call',  color:'#10B981', icon:'📞', cat:'trigger' },
  { type:'greeting',   label:'Play Greeting',  color:'#3B82F6', icon:'🔊', cat:'voice'   },
  { type:'menu',       label:'IVR Menu',       color:'#8B5CF6', icon:'🎛', cat:'voice'   },
  { type:'hold',       label:'Hold Music',     color:'#0EA5E9', icon:'🎵', cat:'voice'   },
  { type:'audio',      label:'Custom Audio',   color:'#6366F1', icon:'🔈', cat:'voice'   },
  { type:'language',   label:'Language Select',color:'#F97316', icon:'🌐', cat:'voice'   },
  { type:'condition',  label:'If / Condition', color:'#F5A623', icon:'🔀', cat:'routing' },
  { type:'assigned',   label:'Assigned Agent',  color:'#10B981', icon:'🎯', cat:'routing' },
  { type:'dial',       label:'Dial Agent',     color:'#CC2200', icon:'📲', cat:'routing' },
  { type:'roundrobin', label:'Round Robin',    color:'#6366F1', icon:'🔄', cat:'routing' },
  { type:'ringall',    label:'Ring All',       color:'#EC4899', icon:'📣', cat:'routing' },
  { type:'voicemail',  label:'Voicemail',      color:'#F97316', icon:'📬', cat:'action'  },
  { type:'savelead',   label:'Save as Lead',   color:'#14B8A6', icon:'💾', cat:'action'  },
  { type:'sms',        label:'Send SMS',       color:'#84CC16', icon:'💬', cat:'action'  },
  { type:'hangup',     label:'Hang Up',        color:'#94A3B8', icon:'🔴', cat:'action'  },
  { type:'listings',   label:'Listing Search', color:'#8B5CF6', icon:'🏡', cat:'action'  },
]

const CATS = [
  { id:'trigger', label:'Trigger',  color:'#10B981' },
  { id:'voice',   label:'Voice',    color:'#3B82F6' },
  { id:'routing', label:'Routing',  color:'#CC2200' },
  { id:'action',  label:'Actions',  color:'#8B5CF6' },
]

const PORT_COLORS = ['#CC2200','#3B82F6','#10B981','#F5A623','#8B5CF6','#EC4899','#14B8A6','#6366F1']

// Hold music options — Twilio built-in + custom URL
const HOLD_MUSIC = [
  { id:'twilio',    label:'Twilio default hold music' },
  { id:'classical', label:'Classical (Mozart)' },
  { id:'jazz',      label:'Jazz' },
  { id:'pop',       label:'Pop / Upbeat' },
  { id:'silence',   label:'Silence' },
  { id:'custom',    label:'Custom URL / uploaded file' },
]

const TWILIO_HOLD_URLS = {
  twilio:    '',  // empty = Twilio default
  classical: 'https://demo.twilio.com/docs/classic.mp3',
  jazz:      'https://demo.twilio.com/docs/jazz.mp3',
  pop:       'http://com.twilio.sounds.music.s3.amazonaws.com/MARKOVICHAMP-Borghestral.mp3',
  silence:   'https://demo.twilio.com/docs/silence.mp3',
}

const TTS_VOICES = [
  { id:'Polly.Joanna',   label:'Joanna (English, US) — Female' },
  { id:'Polly.Matthew',  label:'Matthew (English, US) — Male' },
  { id:'Polly.Salli',    label:'Salli (English, US) — Female' },
  { id:'Polly.Joey',     label:'Joey (English, US) — Male' },
  { id:'Polly.Amy',      label:'Amy (English, UK) — Female' },
  { id:'Polly.Brian',    label:'Brian (English, UK) — Male' },
  { id:'Polly.Lea',      label:'Lea (French) — Female' },
  { id:'Polly.Mathieu',  label:'Mathieu (French) — Male' },
  { id:'Polly.Vicki',    label:'Vicki (German) — Female' },
  { id:'Polly.Lupe',     label:'Lupe (Spanish, US) — Female' },
  { id:'Polly.Miguel',   label:'Miguel (Spanish, US) — Male' },
  { id:'Polly.Penelope', label:'Penélope (Spanish, US) — Female' },
  { id:'Polly.Conchita', label:'Conchita (Spanish, ES) — Female' },
  { id:'Polly.Carla',    label:'Carla (Italian) — Female' },
  { id:'Polly.Giorgio',  label:'Giorgio (Italian) — Male' },
  { id:'Polly.Celine',   label:'Céline (French) — Female' },
  { id:'Polly.Zhiyu',    label:'Zhiyu (Chinese Mandarin)' },
  { id:'Polly.Takumi',   label:'Takumi (Japanese) — Male' },
  { id:'Polly.Mizuki',   label:'Mizuki (Japanese) — Female' },
  { id:'Polly.Seoyeon',  label:'Seoyeon (Korean) — Female' },
  { id:'Polly.Vitoria',  label:'Vitória (Portuguese, BR)' },
]

function nd(type) { return NODE_DEFS.find(n => n.type === type) || { type:'unknown', label:'Unknown', color:'#94A3B8', icon:'?', cat:'action' } }

function defCfg(type) {
  if (type === 'menu')      return { text:'For sales press 1. To leave a voicemail press 9.', timeout:10, voice:'Polly.Joanna', options:[{key:'1',label:'Sales',say:'Connecting to sales...'},{key:'9',label:'Voicemail',say:'Please leave your message.'}] }
  if (type === 'condition') return { condition:'known_contact', yesLabel:'Yes', noLabel:'No' }
  if (type === 'greeting')  return { text:'Thank you for calling Target Team. Please hold while we connect you.', voice:'Polly.Joanna' }
  if (type === 'dial')      return { agent_id:'', timeout:30 }
  if (type === 'roundrobin')return { agent_ids:[], timeout:30 }
  if (type === 'ringall')   return { agent_ids:[], timeout:30 }
  if (type === 'voicemail') return { text:'Please leave your name and number after the tone.', voice:'Polly.Joanna', transcribe:true, notify_agent:true, max_length:120, pin_enabled:false, pin:'1234', pin_attempts:3 }
  if (type === 'savelead')  return { source:'Inbound Call', assign:'round_robin' }
  if (type === 'sms')       return { text:'Thanks for calling Target Team! An agent will reach out shortly.', send_to:'caller' }
  if (type === 'listings')  return { intro:'Welcome to our available listings search.', voice:'Polly.Joanna', max_results:5 }
  if (type === 'hold')      return { music:'twilio', custom_url:'', duration:30, say_first:'', voice:'Polly.Joanna' }
  if (type === 'audio')     return { url:'', voice:'Polly.Joanna', say_first:'', loop:1 }
  if (type === 'language')  return { prompt:'For English press 1. Para Español oprima 2.', options:[{key:'1',language:'en-US',voice:'Polly.Joanna',label:'English'},{key:'2',language:'es-US',voice:'Polly.Lupe',label:'Spanish'}], timeout:10 }
  return {}
}

// ── OUTPUT PORTS ─────────────────────────────────────────────────
function getPorts(node) {
  const cfg  = node.config || {}
  const opts = cfg.options || []
  if (node.type === 'condition') return [
    { id:'yes', label: cfg.yesLabel || 'YES', color:'#10B981', y: NH * 0.33 },
    { id:'no',  label: cfg.noLabel  || 'NO',  color:'#DC2626', y: NH * 0.67 },
  ]
  if (node.type === 'assigned') return [
    { id:'found',    label:'Agent Found',  color:'#10B981', y: NH * 0.33 },
    { id:'notfound', label:'No Agent',     color:'#DC2626', y: NH * 0.67 },
  ]
  if (node.type === 'menu' || node.type === 'language') return opts.map(function(o, i) {
    return { id:'key_' + o.key, label: node.type === 'language' ? (o.label || o.key) : 'Press ' + o.key, color: PORT_COLORS[i % PORT_COLORS.length], y: (NH / (opts.length + 1)) * (i + 1) }
  })
  if (node.type === 'dial' || node.type === 'roundrobin' || node.type === 'ringall') return [
    { id:'answered', label:'Answered', color:'#10B981', y: NH * 0.33 },
    { id:'noanswer', label:'No Answer', color:'#DC2626', y: NH * 0.67 },
  ]
  if (node.type === 'hangup') return []
  // All others: single 'out' port
  return [{ id:'out', label:'', color: nd(node.type).color, y: NH * 0.5 }]
}

// ── SVG COORDINATE HELPER ─────────────────────────────────────────
// Converts mouse event coords to SVG canvas coords, accounting for scale
function svgCoords(e, svgEl) {
  const rect   = svgEl.getBoundingClientRect()
  const scaleX = rect.width  > 0 ? rect.width  / rect.width  : 1  // SVG fills container, no viewBox scaling
  const scaleY = rect.height > 0 ? rect.height / rect.height : 1
  return {
    x: (e.clientX - rect.left),
    y: (e.clientY - rect.top),
  }
}

// ── FLOW NODE SVG ─────────────────────────────────────────────────
function FlowNode({ node, selected, agents, connectedPorts, dragPort, onMouseDownNode, onMouseDownPort, onPortDrop, onClickNode }) {
  const def   = nd(node.type)
  const cfg   = node.config || {}
  const ports = getPorts(node)

  let sub = ''
  if (node.type === 'menu')        sub = (cfg.options || []).length + ' options'
  else if (node.type === 'language') sub = (cfg.options || []).length + ' languages'
  else if (node.type === 'condition') sub = (cfg.condition || '').replace(/_/g,' ')
  else if (node.type === 'dial')    sub = cfg.agent_id && agents ? ((agents.find(a => a.id === cfg.agent_id)||{}).name || 'select agent') : 'select agent'
  else if (node.type === 'assigned') sub = 'routes to caller\'s agent'
  else if (node.type === 'roundrobin'||node.type === 'ringall') sub = (cfg.agent_ids||[]).length + ' agents'
  else if (node.type === 'greeting'||node.type === 'voicemail') sub = (cfg.text||'').slice(0,28)
  else if (node.type === 'hold')    sub = HOLD_MUSIC.find(m=>m.id===cfg.music)?.label?.slice(0,28) || 'Twilio default'
  else if (node.type === 'audio')   sub = cfg.url ? 'Custom file' : 'no file set'
  else if (node.type === 'sms')     sub = (cfg.text||'').slice(0,28)
  else if (node.type === 'listings') sub = 'keypad price search'
  else sub = def.label.toLowerCase()

  const fill   = selected ? def.color : 'var(--panel)'
  const stroke = selected ? def.color : 'var(--border)'
  const tFill  = selected ? '#fff' : 'var(--text)'
  const sFill  = selected ? 'rgba(255,255,255,.7)' : 'var(--muted)'

  return (
    <g transform={'translate(' + node.x + ',' + node.y + ')'}>
      {/* Drop shadow */}
      <rect x={2} y={3} width={NW} height={NH} rx={12} fill="rgba(0,0,0,.1)" />
      {/* Body */}
      <rect x={0} y={0} width={NW} height={NH} rx={12} fill={fill} stroke={stroke} strokeWidth={selected?2.5:1.5}
        style={{cursor:'grab'}}
        onMouseDown={function(e){ onMouseDownNode(e, node.id) }}
        onClick={function(e){ e.stopPropagation(); onClickNode(node.id) }}
      />
      {/* Color sidebar */}
      <rect x={0} y={0} width={8} height={NH} rx={6} fill={def.color} />
      {/* Icon */}
      <text x={22} y={NH/2} fontSize={20} dominantBaseline="middle">{def.icon}</text>
      {/* Label */}
      <text x={50} y={NH/2 - 7} fontSize={13} fontWeight={700} fill={tFill} fontFamily={ff} dominantBaseline="middle">{def.label}</text>
      {/* Sub */}
      <text x={50} y={NH/2 + 10} fontSize={10} fill={sFill} fontFamily={ff} dominantBaseline="middle">
        {sub.length > 28 ? sub.slice(0,26)+'…' : sub}
      </text>

      {/* Input port — LEFT — enlarged hit zone so drops land reliably */}
      {node.type !== 'incoming' && (
        <g>
          {/* Large drop zone — entire left half of node accepts drops */}
          <rect x={-20} y={0} width={NW/2} height={NH} fill="transparent"
            onMouseUp={function(e){ e.stopPropagation(); onPortDrop(node.id) }}
          />
          <circle cx={0} cy={NH/2} r={PR} fill="var(--panel)" stroke={def.color} strokeWidth={2.5} style={{pointerEvents:'none'}} />
        </g>
      )}

      {/* Delete × when selected */}
      {selected && node.type !== 'incoming' && (
        <g style={{cursor:'pointer'}}
          onMouseDown={function(e){ e.stopPropagation() }}
          onClick={function(e){ e.stopPropagation(); onClickNode('__delete__' + node.id) }}>
          <circle cx={NW - 12} cy={12} r={10} fill="#DC2626" />
          <text x={NW - 12} y={12} textAnchor="middle" dominantBaseline="middle" fontSize={15} fill="#fff" fontFamily={ff} fontWeight={700}>×</text>
        </g>
      )}

      {/* Output ports — RIGHT */}
      {ports.map(function(p) {
        const connected = connectedPorts && connectedPorts.has(node.id + ':' + p.id)
        const active    = dragPort && dragPort.fromId === node.id && dragPort.portId === p.id
        return (
          <g key={p.id}>
            {/* Large invisible hit zone */}
            <circle cx={NW} cy={p.y} r={PHZ} fill="transparent" style={{cursor:'crosshair'}}
              onMouseDown={function(e){ e.stopPropagation(); e.preventDefault(); onMouseDownPort(e, node.id, p.id) }}
            />
            {/* Visual port */}
            <circle cx={NW} cy={p.y} r={active ? PR + 4 : PR}
              fill={connected ? p.color : 'var(--panel)'}
              stroke={p.color} strokeWidth={active ? 3 : 2}
              style={{cursor:'crosshair', transition:'r .1s', pointerEvents:'none'}}
            />
            {/* Label — inside node, left of port */}
            {p.label && (
              <text x={NW - PR - 6} y={p.y} textAnchor="end" dominantBaseline="middle"
                fontSize={9} fontWeight={700} fill={p.color} fontFamily={ff} style={{pointerEvents:'none', userSelect:'none'}}>
                {p.label}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}


// ── AUDIO FILE UPLOADER ───────────────────────────────────────────
// Uploads .mp3/.wav to Supabase Storage "phone-audio" bucket
// Returns a public URL that Twilio can fetch directly
function AudioUploader({ value, onChange, label }) {
  const [uploading, setUploading] = React.useState(false)
  const [progress,  setProgress]  = React.useState('')
  const ref = React.useRef(null)

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const ok = ['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/wave','audio/ogg','audio/aac','audio/mp4'].includes(file.type) || file.name.match(/\.(mp3|wav|ogg|aac|m4a)$/i)
    if (!ok) { alert('Please upload an MP3, WAV, OGG, or AAC audio file.'); return }
    if (file.size > 50 * 1024 * 1024) { alert('File must be under 50MB'); return }
    setUploading(true)
    setProgress('Uploading...')
    try {
      const ext  = file.name.split('.').pop().toLowerCase()
      const name = file.name.replace(/[^a-zA-Z0-9._-]/g,'_')
      const path = 'phone-audio/' + Date.now() + '_' + name
      const { error } = await supabase.storage.from('phone-audio').upload(path, file, { upsert: true, contentType: file.type })
      if (error) throw error
      const { data } = supabase.storage.from('phone-audio').getPublicUrl(path)
      onChange(data.publicUrl)
      setProgress('✅ Uploaded')
    } catch(e) {
      if (e.message && e.message.includes('bucket')) {
        alert('Storage bucket not found.\n\nCreate a bucket named "phone-audio" in Supabase Storage (set to Public) then try again.')
      } else {
        alert('Upload failed: ' + e.message)
      }
      setProgress('')
    } finally { setUploading(false) }
  }

  return (
    <div style={{ marginBottom: 12 }}>
      {label && <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>{label}</div>}

      {/* Upload zone */}
      <label style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:9,
        border: value ? '1.5px solid #10B981' : '2px dashed var(--border)',
        background: value ? 'rgba(16,185,129,.06)' : 'var(--dim)',
        cursor: uploading ? 'default' : 'pointer', transition:'all .15s' }}>
        <input ref={ref} type="file" accept="audio/*,.mp3,.wav,.ogg,.aac,.m4a" onChange={handleFile} style={{ display:'none' }} disabled={uploading} />
        <span style={{ fontSize:22, flexShrink:0 }}>{uploading ? '⏳' : value ? '🎵' : '📁'}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, fontWeight:700, color: value ? '#10B981' : 'var(--text)' }}>
            {uploading ? progress : value ? 'Audio file uploaded ✓' : 'Click to upload audio file'}
          </div>
          <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>
            {value ? value.split('/').pop().slice(0,40) : 'MP3, WAV, OGG, AAC up to 50MB'}
          </div>
        </div>
        {value && !uploading && (
          <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); onChange('') }}
            style={{ background:'rgba(220,38,38,.1)', border:'none', cursor:'pointer', color:'#DC2626', fontSize:14, borderRadius:6, padding:'3px 8px', fontWeight:700 }}>✕</button>
        )}
      </label>

      {/* Preview player if URL is set */}
      {value && !uploading && (
        <div style={{ marginTop:8, padding:'8px 10px', background:'var(--dim)', borderRadius:8, border:'1px solid var(--border)' }}>
          <audio controls preload="metadata" style={{ width:'100%', height:32, display:'block' }}>
            <source src={value} />
            Your browser does not support audio.
          </audio>
        </div>
      )}

      {/* Manual URL input as fallback */}
      <div style={{ marginTop:6, display:'flex', alignItems:'center', gap:6 }}>
        <div style={{ fontSize:10, color:'var(--muted)', flexShrink:0 }}>or paste URL:</div>
        <input type="text" value={value||''} onChange={e=>onChange(e.target.value)}
          placeholder="https://..."
          style={{ flex:1, padding:'5px 8px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:11, fontFamily:ff }} />
      </div>
    </div>
  )
}

// ── CONFIG PANEL ─────────────────────────────────────────────────
function ConfigPanel({ node, agents, onSave, onClose }) {
  const def = nd(node.type)
  const [cfg, setCfg] = useState(Object.assign({}, node.config || {}))
  const sa = agents || []

  const set = (k, v) => setCfg(p => Object.assign({}, p, {[k]: v}))

  function setOpt(i, k, v) { const o=[...(cfg.options||[])]; o[i]=Object.assign({},o[i],{[k]:v}); set('options',o) }
  function addOpt() { const o=[...(cfg.options||[])]; o.push(node.type==='language' ? {key:String(o.length+1),language:'en-US',voice:'Polly.Joanna',label:'English'} : {key:String(o.length+1),label:'',say:''}); set('options',o) }
  function delOpt(i) { const o=[...(cfg.options||[])]; o.splice(i,1); set('options',o) }

  const I = {width:'100%',padding:'7px 10px',borderRadius:8,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:13,fontFamily:ff,boxSizing:'border-box'}
  const TA= {width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:13,fontFamily:ff,resize:'vertical',boxSizing:'border-box'}
  const S = {width:'100%',padding:'7px 10px',borderRadius:8,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:13,fontFamily:ff}
  const L = {fontSize:10,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.06em',display:'block',marginBottom:5}
  const INFO={padding:'9px 12px',background:'var(--dim)',borderRadius:8,border:'1px solid var(--border)',fontSize:11,color:'var(--muted)',lineHeight:1.6}
  const R = {marginBottom:14}

  // Voice selector (shared)
  const VoicePicker = ({k}) => (
    <div style={R}>
      <label style={L}>Voice / Language</label>
      <select value={cfg[k]||'Polly.Joanna'} onChange={e=>set(k,e.target.value)} style={S}>
        {TTS_VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
      </select>
    </div>
  )

  return (
    <div style={{width:320,borderLeft:'1px solid var(--border)',background:'var(--panel)',display:'flex',flexDirection:'column',flexShrink:0,fontFamily:ff,overflow:'hidden'}}>
      <div style={{padding:'13px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10,background:def.color,flexShrink:0}}>
        <span style={{fontSize:20}}>{def.icon}</span>
        <div style={{flex:1,fontSize:14,fontWeight:800,color:'#fff'}}>{def.label}</div>
        <button onClick={()=>{onSave(node.id,cfg);onClose()}} title='Save & close' style={{background:'rgba(255,255,255,.2)',border:'none',cursor:'pointer',color:'#fff',fontSize:18,borderRadius:6,width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
      </div>

      <div style={{flex:1,overflowY:'auto',padding:16}}>

        {/* ── INCOMING ── */}
        {node.type === 'incoming' && <div style={INFO}>📞 Every call starts here. Drag the green port on the right to connect to your first step.</div>}
        {/* ── HANGUP ── */}
        {node.type === 'hangup'   && <div style={INFO}>🔴 Ends the call cleanly. No configuration needed.</div>}

        {/* ── GREETING ── */}
        {node.type === 'greeting' && (<>
          <div style={R}><label style={L}>Message (spoken via TTS)</label><textarea value={cfg.text||''} onChange={e=>set('text',e.target.value)} rows={4} style={TA} placeholder="Thank you for calling..." /></div>
          <VoicePicker k="voice" />
        </>)}

        {/* ── HOLD MUSIC ── */}
        {node.type === 'hold' && (<>
          <div style={R}>
            <label style={L}>Say first (optional)</label>
            <input value={cfg.say_first||''} onChange={e=>set('say_first',e.target.value)} placeholder="Please hold, connecting you now..." style={I} />
          </div>
          <VoicePicker k="voice" />
          <div style={R}>
            <label style={L}>Music selection</label>
            <select value={cfg.music||'twilio'} onChange={e=>set('music',e.target.value)} style={S}>
              {HOLD_MUSIC.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          {cfg.music === 'custom' && (
            <div style={R}>
              <AudioUploader
                label="Custom hold music file"
                value={cfg.custom_url||''}
                onChange={url=>set('custom_url',url)}
              />
            </div>
          )}
          <div style={R}>
            <label style={L}>Hold duration (seconds, 0 = unlimited)</label>
            <input type="number" min={0} max={600} value={cfg.duration||30} onChange={e=>set('duration',parseInt(e.target.value)||30)} style={I} />
          </div>
        </>)}

        {/* ── CUSTOM AUDIO ── */}
        {node.type === 'audio' && (<>
          <div style={R}>
            <label style={L}>Say first (optional, TTS before audio plays)</label>
            <input value={cfg.say_first||''} onChange={e=>set('say_first',e.target.value)} placeholder="Please listen to the following message..." style={I} />
          </div>
          <VoicePicker k="voice" />
          <div style={R}>
            <AudioUploader
              label="Audio file (greeting, message, announcement)"
              value={cfg.url||''}
              onChange={url=>set('url',url)}
            />
          </div>
          <div style={R}>
            <label style={L}>Loop count (1 = play once)</label>
            <input type="number" min={1} max={10} value={cfg.loop||1} onChange={e=>set('loop',parseInt(e.target.value)||1)} style={I} />
          </div>
        </>)}

        {/* ── LANGUAGE SELECT ── */}
        {node.type === 'language' && (<>
          <div style={R}>
            <label style={L}>Language menu prompt</label>
            <textarea value={cfg.prompt||''} onChange={e=>set('prompt',e.target.value)} rows={3} style={TA} placeholder="For English press 1. Para Español oprima 2." />
          </div>
          <div style={R}>
            <label style={L}>Input timeout (seconds)</label>
            <input type="number" value={cfg.timeout||10} onChange={e=>set('timeout',parseInt(e.target.value)||10)} style={I} />
          </div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <label style={{...L,marginBottom:0}}>Language options</label>
            <button onClick={addOpt} style={{padding:'3px 10px',borderRadius:6,border:'1px solid var(--border)',background:'var(--dim)',color:'var(--muted)',fontSize:11,cursor:'pointer',fontFamily:ff}}>+ Add</button>
          </div>
          {(cfg.options||[]).map((opt,i) => (
            <div key={i} style={{background:'var(--dim)',borderRadius:9,border:'2px solid '+PORT_COLORS[i%PORT_COLORS.length]+'44',padding:'10px 12px',marginBottom:8}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                <div style={{width:32,height:32,borderRadius:8,background:PORT_COLORS[i%PORT_COLORS.length],display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:'#fff',fontSize:14,fontWeight:900}}>{opt.key}</div>
                <input value={opt.label||''} onChange={e=>setOpt(i,'label',e.target.value)} placeholder="English"
                  style={{flex:1,padding:'5px 8px',borderRadius:6,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:12,fontFamily:ff}} />
                <button onClick={()=>delOpt(i)} style={{background:'none',border:'none',cursor:'pointer',color:'#DC2626',fontSize:18}}>×</button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:6}}>
                <div>
                  <label style={L}>Press key</label>
                  <input value={opt.key||''} onChange={e=>setOpt(i,'key',e.target.value)} style={{...I,fontSize:14,textAlign:'center',fontWeight:800}} />
                </div>
                <div>
                  <label style={L}>Voice</label>
                  <select value={opt.voice||'Polly.Joanna'} onChange={e=>setOpt(i,'voice',e.target.value)} style={{...S,fontSize:11}}>
                    {TTS_VOICES.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{fontSize:10,color:PORT_COLORS[i%PORT_COLORS.length],marginTop:2}}>→ Connect this port to the flow for {opt.label||'this language'}</div>
            </div>
          ))}
        </>)}

        {/* ── IVR MENU ── */}
        {node.type === 'menu' && (<>
          <div style={R}><label style={L}>Menu prompt (spoken to caller)</label><textarea value={cfg.text||''} onChange={e=>set('text',e.target.value)} rows={4} style={TA} placeholder="For sales press 1..." /></div>
          <VoicePicker k="voice" />
          <div style={R}><label style={L}>Input timeout (seconds)</label><input type="number" value={cfg.timeout||10} onChange={e=>set('timeout',parseInt(e.target.value)||10)} style={I} /></div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <label style={{...L,marginBottom:0}}>Keypress options</label>
            <button onClick={addOpt} style={{padding:'3px 10px',borderRadius:6,border:'1px solid var(--border)',background:'var(--dim)',color:'var(--muted)',fontSize:11,cursor:'pointer',fontFamily:ff}}>+ Add</button>
          </div>
          {(cfg.options||[]).map((opt,i) => {
            const c = PORT_COLORS[i%PORT_COLORS.length]
            return (
              <div key={i} style={{background:'var(--dim)',borderRadius:9,border:'2px solid '+c+'44',padding:'10px 12px',marginBottom:8}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                  <div style={{width:32,height:32,borderRadius:8,background:c,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <input value={opt.key||''} onChange={e=>setOpt(i,'key',e.target.value)} style={{width:24,textAlign:'center',background:'transparent',border:'none',color:'#fff',fontSize:16,fontWeight:900,fontFamily:ff,outline:'none'}} />
                  </div>
                  <input value={opt.label||''} onChange={e=>setOpt(i,'label',e.target.value)} placeholder="Label"
                    style={{flex:1,padding:'5px 8px',borderRadius:6,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:12,fontFamily:ff}} />
                  <button onClick={()=>delOpt(i)} style={{background:'none',border:'none',cursor:'pointer',color:'#DC2626',fontSize:18}}>×</button>
                </div>
                <label style={L}>Say when pressed</label>
                <input value={opt.say||''} onChange={e=>setOpt(i,'say',e.target.value)} placeholder={'Connecting to '+(opt.label||'agent')+'...'}
                  style={{...I,marginBottom:4}} />
                <div style={{fontSize:10,color:c,marginTop:2}}>→ Drag port "{opt.key}" to connect to next step</div>
              </div>
            )
          })}
        </>)}

        {/* ── CONDITION ── */}
        {node.type === 'condition' && (<>
          <div style={R}>
            <label style={L}>Check if...</label>
            <select value={cfg.condition||'known_contact'} onChange={e=>set('condition',e.target.value)} style={S}>
              <option value="known_contact">Caller is a known contact</option>
              <option value="has_agent">Contact has an assigned agent</option>
              <option value="business_hours">Currently business hours (9am–6pm ET)</option>
              <option value="after_hours">Currently after hours</option>
              <option value="repeat_caller">Caller has called before</option>
            </select>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
            <div><label style={{...L,color:'#10B981'}}>YES label</label><input value={cfg.yesLabel||'YES'} onChange={e=>set('yesLabel',e.target.value)} style={{...I,borderColor:'#10B98155',background:'#10B98108',color:'#10B981'}} /></div>
            <div><label style={{...L,color:'#DC2626'}}>NO label</label><input value={cfg.noLabel||'NO'} onChange={e=>set('noLabel',e.target.value)} style={{...I,borderColor:'#DC262655',background:'#DC262608',color:'#DC2626'}} /></div>
          </div>
          <div style={INFO}>Two ports: green YES and red NO. Connect each to the appropriate next step.</div>
        </>)}


        {/* ── ASSIGNED AGENT ── */}
        {node.type === 'assigned' && (<>
          <div style={INFO}>
            🎯 When a call comes in, this node looks up the caller's phone number in your CRM Contacts, finds their assigned agent, and automatically dials that agent's phone number.
          </div>
          <div style={R}>
            <label style={L}>Ring timeout (seconds)</label>
            <input type="number" value={cfg.timeout||30} onChange={e=>set('timeout',parseInt(e.target.value)||30)} style={I} />
          </div>
          <div style={R}>
            <label style={L}>If no agent assigned or agent doesn't answer</label>
            <select value={cfg.fallback||'roundrobin'} onChange={e=>set('fallback',e.target.value)} style={S}>
              <option value="roundrobin">Ring all available agents (round robin)</option>
              <option value="voicemail">Go to voicemail</option>
              <option value="next">Continue to next node</option>
            </select>
          </div>
          <div style={{...INFO, marginTop:8}}>
            <strong style={{color:'var(--text)'}}>Port: Agent Found</strong> — fires when the assigned agent answers.<br/>
            <strong style={{color:'var(--text)'}}>Port: No Agent</strong> — fires when caller has no assigned agent, or agent doesn't answer.
          </div>
        </>)}

        {/* ── DIAL AGENT ── */}
        {node.type === 'dial' && (<>
          <div style={R}>
            <label style={L}>Dial type</label>
            <select value={cfg.dial_type||'agent'} onChange={e=>set('dial_type',e.target.value)} style={S}>
              <option value="agent">Agent (from CRM)</option>
              <option value="number">Direct phone number</option>
              <option value="sip">SIP / Office phone</option>
            </select>
          </div>
          {(!cfg.dial_type||cfg.dial_type==='agent') && (
            <div style={R}>
              <label style={L}>Ring this agent</label>
              <select value={cfg.agent_id||''} onChange={e=>set('agent_id',e.target.value)} style={S}>
                <option value="">— Select agent —</option>
                {sa.map(a=><option key={a.id} value={a.id}>{a.name} {a.phone?'· '+a.phone:''}</option>)}
              </select>
              <div style={{fontSize:10,color:'var(--muted)',marginTop:3}}>Uses the agent's phone number from their profile in Settings.</div>
            </div>
          )}
          {cfg.dial_type==='number' && (
            <div style={R}>
              <label style={L}>Phone number</label>
              <input value={cfg.direct_number||''} onChange={e=>set('direct_number',e.target.value)} placeholder="+18455550100" style={I} />
              <div style={{fontSize:10,color:'var(--muted)',marginTop:3}}>Include country code. e.g. +18455550100</div>
            </div>
          )}
          {cfg.dial_type==='sip' && (
            <div style={R}>
              <label style={L}>SIP address / office phone extension</label>
              <input value={cfg.sip_address||''} onChange={e=>set('sip_address',e.target.value)} placeholder="sip:101@your-pbx.com or 101@domain" style={I} />
              <div style={{fontSize:10,color:'var(--muted)',marginTop:3}}>Enter your office PBX SIP URI or extension. Twilio will dial this directly.</div>
            </div>
          )}
          <div style={R}><label style={L}>Ring timeout (seconds)</label><input type="number" value={cfg.timeout||30} onChange={e=>set('timeout',parseInt(e.target.value)||30)} style={I} /></div>
          <div style={INFO}><strong style={{color:'#10B981'}}>Answered</strong> — call connected. <strong style={{color:'#DC2626'}}>No Answer</strong> — routes to voicemail or next step. You can leave "No Answer" unconnected to use default voicemail.</div>
        </>)}

        {/* ── ROUND ROBIN / RING ALL ── */}
        {(node.type === 'roundrobin'||node.type === 'ringall') && (<>
          <div style={R}>
            <label style={L}>{node.type==='ringall' ? 'Ring all simultaneously' : 'Rotation (least-calls-first)'}</label>
            <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
              {sa.map(a=>{const ids=cfg.agent_ids||[]; const on=ids.includes(a.id); return (
                <button key={a.id} onClick={()=>set('agent_ids',on?ids.filter(x=>x!==a.id):ids.concat([a.id]))}
                  style={{padding:'5px 12px',borderRadius:20,border:'1px solid '+(on?'#CC2200':'var(--border)'),background:on?'rgba(204,34,0,.1)':'transparent',color:on?'#CC2200':'var(--muted)',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:ff}}>
                  {on?'✓ ':''}{a.name.split(' ')[0]}
                </button>
              )})}
            </div>
          </div>
          <div style={R}><label style={L}>Timeout (seconds)</label><input type="number" value={cfg.timeout||30} onChange={e=>set('timeout',parseInt(e.target.value)||30)} style={I} /></div>
        </>)}

        {/* ── VOICEMAIL ── */}
        {node.type === 'voicemail' && (<>
          <div style={R}><label style={L}>Greeting before the beep</label><textarea value={cfg.text||''} onChange={e=>set('text',e.target.value)} rows={3} style={TA} placeholder="Please leave your name and number after the tone." /></div>
          <VoicePicker k="voice" />
          <div style={R}><label style={L}>Max length (seconds)</label><input type="number" value={cfg.max_length||120} onChange={e=>set('max_length',parseInt(e.target.value)||120)} style={I} /></div>
          <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,cursor:'pointer',fontSize:13,color:'var(--text)'}}>
            <input type="checkbox" checked={!!cfg.transcribe} onChange={e=>set('transcribe',e.target.checked)} /> Transcribe voicemail to text
          </label>
          <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13,color:'var(--text)'}}>
            <input type="checkbox" checked={!!cfg.notify_agent} onChange={e=>set('notify_agent',e.target.checked)} /> Notify assigned agent by email
          </label>
          <div style={{marginTop:16,paddingTop:14,borderTop:'1px solid var(--border)'}}>
            <div style={{fontSize:12,fontWeight:800,color:'var(--text)',marginBottom:10}}>🔒 Voicemail PIN Protection</div>
            <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13,color:'var(--text)',marginBottom:10}}>
              <input type="checkbox" checked={!!cfg.pin_enabled} onChange={e=>set('pin_enabled',e.target.checked)} />
              Require PIN to listen to voicemails
            </label>
            {cfg.pin_enabled && (<>
              <div style={R}>
                <label style={L}>PIN (4–8 digits)</label>
                <input type="password" value={cfg.pin||'1234'} onChange={e=>set('pin',e.target.value.replace(/[^0-9]/g,'').slice(0,8))}
                  placeholder="e.g. 1234" maxLength={8} style={I} />
                <div style={{fontSize:10,color:'var(--muted)',marginTop:3}}>Callers dialing into voicemail will be prompted to enter this PIN before hearing messages.</div>
              </div>
              <div style={R}>
                <label style={L}>Max PIN attempts</label>
                <select value={cfg.pin_attempts||3} onChange={e=>set('pin_attempts',parseInt(e.target.value))} style={S}>
                  <option value={2}>2 attempts</option>
                  <option value={3}>3 attempts</option>
                  <option value={5}>5 attempts</option>
                </select>
              </div>
            </>)}
          </div>
        </>)}

        {/* ── SAVE LEAD ── */}
        {node.type === 'savelead' && (<>
          <div style={R}><label style={L}>Source tag</label><input value={cfg.source||'Inbound Call'} onChange={e=>set('source',e.target.value)} style={I} /></div>
          <div style={R}>
            <label style={L}>Assign to</label>
            <select value={cfg.assign||'round_robin'} onChange={e=>set('assign',e.target.value)} style={S}>
              <option value="round_robin">Round robin</option>
              <option value="fewest_leads">Agent with fewest leads</option>
              <option value="specific">Specific agent</option>
            </select>
          </div>
          {cfg.assign==='specific' && <div style={R}><label style={L}>Agent</label><select value={cfg.agent_id||''} onChange={e=>set('agent_id',e.target.value)} style={S}><option value="">— Select —</option>{sa.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>}
          <div style={INFO}>Creates or updates a Contact from the caller's phone number.</div>
        </>)}

        {/* ── LISTINGS SEARCH ── */}
        {node.type === 'listings' && (<>
          <div style={R}>
            <label style={L}>Opening message</label>
            <textarea value={cfg.intro||''} onChange={e=>set('intro',e.target.value)} rows={2} style={TA}
              placeholder="Welcome to our available listings search. Use your keypad to enter a price range." />
          </div>
          <VoicePicker k="voice" />
          <div style={R}>
            <label style={L}>Max listings to read (1–10)</label>
            <input type="number" min={1} max={10} value={cfg.max_results||5} onChange={e=>set('max_results',parseInt(e.target.value)||5)} style={I} />
          </div>
          <div style={{...INFO}}>
            <strong style={{color:'var(--text)'}}>How it works:</strong><br/>
            Caller presses 1 for price range, then uses keypad to enter price (e.g. press 5 0 0 = $500k).<br/>
            System reads matching listings that have <strong>📞 IVR enabled</strong> on the Listings board.<br/>
            After each listing, caller presses 1 to hear next or 2 to connect with an agent.<br/><br/>
            <strong style={{color:'#8B5CF6'}}>Mark listings for phone:</strong> Go to Listings → click the 📞 icon on any listing card.
          </div>
        </>)}

        {/* ── SMS ── */}
        {node.type === 'sms' && (<>
          <div style={R}><label style={L}>SMS text</label><textarea value={cfg.text||''} onChange={e=>set('text',e.target.value)} rows={3} style={TA} /></div>
          <div style={R}>
            <label style={L}>Send to</label>
            <select value={cfg.send_to||'caller'} onChange={e=>set('send_to',e.target.value)} style={S}>
              <option value="caller">Caller</option>
              <option value="agent">Assigned agent</option>
              <option value="both">Both</option>
            </select>
          </div>
        </>)}

      </div>

      <div style={{padding:'12px 16px',borderTop:'1px solid var(--border)',flexShrink:0}}>
        <Btn onClick={()=>{onSave(node.id,cfg);onClose()}} style={{width:'100%'}}>✓ Save Changes</Btn>
      </div>
    </div>
  )
}

// ── EDGE HELPERS ─────────────────────────────────────────────────
function edgePath(fromNode, portId, toNode) {
  if (!fromNode || !toNode) return ''
  const ports = getPorts(fromNode)
  const port  = ports.find(p => p.id === portId)
  const sy    = port ? port.y : NH/2
  const x1 = fromNode.x + NW, y1 = fromNode.y + sy
  const x2 = toNode.x,        y2 = toNode.y + NH/2
  const cx = x1 + Math.max(60, (x2-x1)*0.5)
  return 'M'+x1+' '+y1+' C'+cx+' '+y1+','+cx+' '+y2+','+x2+' '+y2
}
function eColor(portId, fromNode) {
  if (portId==='yes'||portId==='answered') return '#10B981'
  if (portId==='no' ||portId==='noanswer') return '#DC2626'
  if (portId?.startsWith('key_')) {
    const opts=(fromNode?.config?.options)||[]
    const key=portId.slice(4), idx=opts.findIndex(o=>o.key===key)
    return PORT_COLORS[idx>=0?idx%PORT_COLORS.length:0]
  }
  return nd(fromNode?.type)?.color || '#94A3B8'
}
function eLabel(portId, fromNode) {
  if (!portId||portId==='out') return ''
  if (portId==='yes')       return 'YES'
  if (portId==='no')        return 'NO'
  if (portId==='answered')  return 'Answered'
  if (portId==='noanswer')  return 'No Answer'
  if (portId?.startsWith('key_')) {
    const key=portId.slice(4), opts=(fromNode?.config?.options)||[]
    const opt=opts.find(o=>o.key===key)
    return (fromNode?.type==='language' ? (opt?.label||key) : 'Press '+key+(opt?.label?' · '+opt.label:''))
  }
  return ''
}

// ── MAIN ─────────────────────────────────────────────────────────
export function CallFlow() {
  const { toast }  = useApp()
  const { agents } = useAgents()
  const navigate   = useNavigate()
  const svgRef     = useRef(null)
  const nextId     = useRef(200)

  const [nodes,     setNodes]     = useState([{id:'start',type:'incoming',x:80,y:200,config:{}}])
  const [edges,     setEdges]     = useState([])
  const [selected,  setSelected]  = useState(null)
  const [flowName,  setFlowName]  = useState('Main Call Flow')
  const [savedId,   setSavedId]   = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [dirty,     setDirty]     = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testing,   setTesting]   = useState(false)
  const [showTest,  setShowTest]  = useState(false)
  const [showHelp,  setShowHelp]  = useState(false)
  const [isDragging,setIsDragging]= useState(false) // for cursor style
  const [zoom,      setZoom]      = useState(1)      // canvas zoom level
  const [pan,       setPan]       = useState({x:0,y:0}) // canvas pan offset
  const panStart    = useRef(null) // {mx,my,ox,oy} — for space+drag panning
  const [isPanning, setIsPanning] = useState(false)

  const dragNode = useRef(null) // {id, ox, oy}
  const dragWire = useRef(null) // {fromId, portId}
  const [wirePos,setWirePos]    = useState(null)
  const [actPort,setActPort]    = useState(null)

  const [dbStatus, setDbStatus] = useState(null) // null | 'ok' | 'no_columns' | 'empty'

  // ── LOAD ─────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('phone_ivr').select('*').order('updated_at',{ascending:false}).limit(1).maybeSingle()
      .then(r => {
        const d = r.data
        if (!d) {
          setDbStatus('empty')
          return
        }
        // Check if flow_nodes column actually returned data
        if (!d.flow_nodes) {
          setDbStatus('no_columns')
          return
        }
        const fn = typeof d.flow_nodes === 'string' ? JSON.parse(d.flow_nodes) : d.flow_nodes
        const fe = d.flow_edges ? (typeof d.flow_edges === 'string' ? JSON.parse(d.flow_edges) : d.flow_edges) : []
        if (fn?.length) {
          setNodes(fn)
          setEdges(fe)
          setFlowName(d.name||'Main Call Flow')
          setSavedId(d.id)
          setDbStatus('ok')
        } else {
          setDbStatus('empty')
        }
      }).catch(e => { console.warn('load:',e.message); setDbStatus('no_columns') })
  },[])

  // ── SAVE ─────────────────────────────────────────────────────
  async function saveFlow() {
    setSaving(true)
    try {
      const mn = nodes.find(n=>n.type==='menu')
      const gn = nodes.find(n=>n.type==='greeting')
      const payload = {
        name:            flowName,
        flow_nodes:      nodes,
        flow_edges:      edges,
        greeting_text:   (gn?.config?.text)||(mn?.config?.text)||'',
        menu_options:    (mn?.config?.options||[]).map(o=>({key:o.key,label:o.label,say:o.say,action:'extension',value:''})),
        is_active:       true,
        updated_at:      new Date().toISOString(),
      }
      if (savedId) {
        const { error } = await supabase.from('phone_ivr').update(payload).eq('id', savedId)
        if (error) throw error
      } else {
        // Check if any row exists first
        const { data: existing } = await supabase.from('phone_ivr').select('id').limit(1).maybeSingle()
        if (existing?.id) {
          const { error } = await supabase.from('phone_ivr').update(payload).eq('id', existing.id)
          if (error) throw error
          setSavedId(existing.id)
        } else {
          const { data: inserted, error } = await supabase.from('phone_ivr')
            .insert({ ...payload, voicemail_extension:'9', created_at: new Date().toISOString() })
            .select().single()
          if (error) throw error
          if (inserted) setSavedId(inserted.id)
        }
      }
      toast('✅ Flow saved — ' + flowName)
      setDirty(false)
    } catch(e) {
      console.error('saveFlow:', e)
      toast('Save failed: ' + e.message, '#DC2626')
    } finally {
      setSaving(false)
    }
  }

  async function testCall() {
    if (!testPhone.trim()) { toast('Enter a phone number to call', '#F5A623'); return }
    if (!savedId) { toast('Save the flow first, then test it', '#F5A623'); return }
    setTesting(true)
    try {
      const res = await fetch('/api/twilio-test-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testPhone.replace(/[^+0-9]/g,''), flowId: savedId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Call failed')
      toast('📞 Calling ' + testPhone + ' — answer to hear your flow!')
      setShowTest(false)
    } catch(e) {
      toast('Call failed: ' + e.message, '#DC2626')
    } finally {
      setTesting(false)
    }
  }

  function addNode(type) {
    const id = 'n'+(++nextId.current)
    setNodes(p=>p.concat([{id,type,x:300+Math.random()*240,y:60+Math.random()*320,config:defCfg(type)}]))
    setDirty(true)
  }
  function deleteNode(id) {
    setNodes(p=>p.filter(n=>n.id!==id))
    setEdges(p=>p.filter(e=>e.from!==id&&e.to!==id))
    setSelected(null)
    setDirty(true)
  }
  function updateCfg(id, newCfg) {
    // Update nodes — use functional update to avoid stale closure
    setNodes(p => p.map(n => n.id === id ? {...n, config: newCfg} : n))
    // Clean up edges for menu/language nodes if options changed
    setEdges(prev => {
      const node = prev.length > 0 ? null : null  // don't use stale nodes here
      // We'll pass the node type through a ref instead
      const valid = (newCfg.options || []).map(o => 'key_' + o.key)
      return prev.filter(e => {
        if (e.from !== id) return true
        if (!e.port.startsWith('key_')) return true
        return valid.includes(e.port)
      })
    })
    setDirty(true)
  }

  // ── MOUSE HELPERS ─────────────────────────────────────────────
  function getXY(e) {
    const r = svgRef.current.getBoundingClientRect()
    // Account for zoom and pan transform
    const rawX = e.clientX - r.left
    const rawY = e.clientY - r.top
    return { x: (rawX - pan.x) / zoom, y: (rawY - pan.y) / zoom }
  }

  // Wire pos for live wire preview — in screen coords (before transform)
  function getScreenXY(e) {
    const r = svgRef.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function onMouseDownNode(e, id) {
    if (dragWire.current) return
    e.preventDefault(); e.stopPropagation()
    const node = nodes.find(n=>n.id===id)
    if (!node) return
    const {x,y} = getXY(e)
    dragNode.current = {id, ox:x-node.x, oy:y-node.y}
    setSelected(id)
    setIsDragging(true)
  }

  function onMouseDownPort(e, fromId, portId) {
    e.preventDefault(); e.stopPropagation()
    dragNode.current = null
    const {x,y} = getXY(e)
    dragWire.current = {fromId, portId}
    setActPort({fromId, portId})
    setWirePos({x,y})
    setIsDragging(true)
  }

  // Called when mouse is released on a node's input port area
  function onPortDrop(toNodeId) {
    if (!dragWire.current) return
    const {fromId, portId} = dragWire.current
    if (fromId === toNodeId) return  // no self-connections
    finishWire(toNodeId)
  }

  function onSvgMouseMove(e) {
    const {x,y}   = getXY(e)        // transformed coords (for node positions)
    const {x:sx, y:sy} = getScreenXY ? getScreenXY(e) : getXY(e) // screen coords (for wire preview)
    if (dragNode.current) {
      const {id,ox,oy} = dragNode.current
      setNodes(p=>p.map(n=>n.id===id?{...n,x:Math.max(0,x-ox),y:Math.max(0,y-oy)}:n))
    }
    if (dragWire.current) setWirePos({x,y})  // wire preview also in transformed coords
  }

  function finishWire(toId) {
    const {fromId, portId} = dragWire.current
    const eid = 'e_'+fromId+'_'+portId+'_'+toId
    setEdges(prev=>{
      const filtered = prev.filter(e=>!(e.from===fromId&&e.port===portId))
      return filtered.concat([{id:eid, from:fromId, port:portId, to:toId}])
    })
    setDirty(true)
    dragWire.current = null
    setWirePos(null)
    setActPort(null)
    setIsDragging(false)
  }

  function onSvgMouseUp(e) {
    if (dragWire.current) {
      const {x,y} = getXY(e)
      // Hit-test against node bodies (enlarged by 20px on all sides for easier drops)
      const hit = nodes.find(n =>
        n.id !== dragWire.current.fromId &&
        x >= n.x - 40 && x <= n.x + NW + 40 &&
        y >= n.y - 40 && y <= n.y + NH + 40
      )
      if (hit) finishWire(hit.id)
      else {
        dragWire.current = null
        setWirePos(null)
        setActPort(null)
      }
    }
    dragNode.current = null
    setIsDragging(false)
  }

  function onSvgClick(e) {
    if (e.target === svgRef.current) setSelected(null)
  }
  function onClickNode(id) {
    if (id.startsWith('__delete__')) { deleteNode(id.slice(10)); return }
    setSelected(p=>p===id?null:id)
  }
  function deleteEdge(id) { setEdges(p=>p.filter(e=>e.id!==id)) }

  const connectedPorts = new Set(edges.map(e=>e.from+':'+e.port))

  function livePath() {
    if (!dragWire.current||!wirePos) return ''
    const fn = nodes.find(n=>n.id===dragWire.current.fromId)
    if (!fn) return ''
    const ports = getPorts(fn)
    const port  = ports.find(p=>p.id===dragWire.current.portId)
    const sy = port ? port.y : NH/2
    const x1=fn.x+NW, y1=fn.y+sy, x2=wirePos.x, y2=wirePos.y
    const cx=x1+Math.max(40,(x2-x1)*0.5)
    return 'M'+x1+' '+y1+' C'+cx+' '+y1+','+cx+' '+y2+','+x2+' '+y2
  }

  // ── VALIDATE ─────────────────────────────────────────────────
  function validateFlow() {
    const issues = []
    const start = nodes.find(n=>n.type==='incoming')
    if (!start) { issues.push('No Incoming Call node.'); return issues }
    if (!edges.find(e=>e.from===start.id)) issues.push('Incoming Call has no connection.')
    const TERMINAL = {hangup:true, voicemail:true}
    const OPTIONAL  = {savelead:true, sms:true, greeting:true, hold:true, audio:true}
    nodes.forEach(node => {
      if (node.type==='incoming'||TERMINAL[node.type]) return
      getPorts(node).forEach(p=>{
        if (p.id==='out'&&OPTIONAL[node.type]) return
        if (!edges.some(e=>e.from===node.id&&e.port===p.id))
          issues.push(nd(node.type).label+': "'+( p.label||p.id)+'" not connected.')
      })
    })
    return issues
  }
  const flowIssues = validateFlow()
  const selectedNode = nodes.find(n=>n.id===selected)

  // Arrow markers for each color
  const MARKERS = [
    {id:'aG',color:'#10B981'},{id:'aR',color:'#DC2626'},{id:'aB',color:'#3B82F6'},
    {id:'aP',color:'#8B5CF6'},{id:'aO',color:'#F5A623'},{id:'aC',color:'#CC2200'},
    {id:'a0',color:PORT_COLORS[0]},{id:'a1',color:PORT_COLORS[1]},{id:'a2',color:PORT_COLORS[2]},
    {id:'a3',color:PORT_COLORS[3]},{id:'a4',color:PORT_COLORS[4]},{id:'a5',color:PORT_COLORS[5]},
  ]
  function markerFor(color) {
    const m = MARKERS.find(m=>m.color===color)
    return m ? 'url(#'+m.id+')' : 'url(#aG)'
  }

  return (
    <>
    <div style={{fontFamily:ff,height:'calc(100vh - 56px)',display:'flex',flexDirection:'column',overflow:'hidden',background:'var(--bg)'}}>

      {/* TOOLBAR */}
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'8px 14px',borderBottom:'1px solid var(--border)',flexShrink:0,background:'var(--panel)',flexWrap:'wrap'}}>
        <button onClick={()=>navigate('/calls')} style={{background:'none',border:'none',cursor:'pointer',fontSize:12,color:'var(--muted)',fontFamily:ff}}>← Phone System</button>
        <div style={{width:1,height:16,background:'var(--border)'}} />
        <div style={{fontSize:15,fontWeight:800,color:'var(--text)'}}>📞 Call Flow Builder</div>
        <input value={flowName} onChange={e=>setFlowName(e.target.value)}
          style={{padding:'5px 10px',borderRadius:7,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:13,fontFamily:ff,width:200}} />
        {flowIssues.length>0 && (
          <div style={{display:'flex',alignItems:'center',gap:6,padding:'4px 10px',borderRadius:20,background:'#FEF2F2',border:'1px solid #FECACA',fontSize:11,color:'#DC2626',fontWeight:700}}>
            ⚠ {flowIssues.length} issue{flowIssues.length>1?'s':''}
          </div>
        )}
        <div style={{flex:1}} />
        <button onClick={()=>setShowHelp(h=>!h)} style={{padding:'5px 10px',borderRadius:7,border:'1px solid var(--border)',background:'transparent',color:'var(--muted)',fontSize:12,cursor:'pointer',fontFamily:ff}}>
          {showHelp?'Hide help':'? Help'}
        </button>
        <button onClick={()=>{if(window.confirm('Clear canvas?')){setNodes([{id:'start',type:'incoming',x:80,y:200,config:{}}]);setEdges([]);setSelected(null)}}}
          style={{padding:'5px 10px',borderRadius:7,border:'1px solid var(--border)',background:'transparent',color:'var(--muted)',fontSize:12,cursor:'pointer',fontFamily:ff}}>
          Clear
        </button>
        <button onClick={() => setShowTest(true)}
          style={{ padding:'8px 14px', borderRadius:8, border:'1px solid #10B981', background:'rgba(16,185,129,.1)', color:'#10B981', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
          📞 Test Call
        </button>
        {dirty && (
          <div style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:7, background:'rgba(245,166,35,.15)', border:'1px solid rgba(245,166,35,.4)', fontSize:11, color:'#D97706', fontWeight:700 }}>
            ● Unsaved changes
          </div>
        )}
        <Btn onClick={saveFlow} loading={saving} style={{ background: dirty ? '#CC2200' : undefined }}>💾 Save Flow</Btn>
      </div>

      {/* HELP */}
      {showHelp && (
        <div style={{padding:'10px 16px',background:'#EFF6FF',borderBottom:'1px solid #BFDBFE',flexShrink:0}}>
          <div style={{display:'flex',gap:24,flexWrap:'wrap',fontSize:12,color:'#1E40AF'}}>
            <span><strong>1.</strong> Click palette nodes to add them</span>
            <span><strong>2.</strong> Click a node to configure it on the right</span>
            <span><strong>3.</strong> <strong>Drag from a colored dot</strong> on the right of a node → drop onto any other node to connect</span>
            <span><strong>4.</strong> The entire target node body is a drop zone — you don't have to be precise</span>
            <span><strong>5.</strong> Click a wire/arrow to delete it · Click × on selected node to delete node</span>
          </div>
          {flowIssues.length>0 && (
            <div style={{marginTop:8,padding:'6px 10px',background:'#FEF2F2',borderRadius:6,border:'1px solid #FECACA'}}>
              {flowIssues.map((i,idx)=><div key={idx} style={{fontSize:11,color:'#DC2626'}}>⚠ {i}</div>)}
            </div>
          )}
        </div>
      )}

      <div style={{flex:1,display:'flex',overflow:'hidden'}}>

        {/* SQL WARNING BANNER */}
        {dbStatus === 'no_columns' && (
          <div style={{ position:'absolute', top:0, left:0, right:0, zIndex:20, padding:'10px 16px', background:'#FEF3C7', borderBottom:'1px solid #FDE68A', fontSize:12, color:'#92400E', display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:16 }}>⚠️</span>
            <div style={{ flex:1 }}>
              <strong>Database columns missing.</strong> Run this SQL in Supabase, then save again:
              <code style={{ marginLeft:8, fontFamily:'monospace', background:'rgba(0,0,0,.08)', padding:'2px 6px', borderRadius:4 }}>
                alter table phone_ivr add column if not exists flow_nodes jsonb; alter table phone_ivr add column if not exists flow_edges jsonb; alter table phone_ivr add column if not exists is_active boolean default true;
              </code>
            </div>
            <button onClick={() => setDbStatus(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#92400E', fontSize:16 }}>×</button>
          </div>
        )}
        {/* PALETTE */}
        <div style={{width:162,borderRight:'1px solid var(--border)',background:'var(--dim)',overflowY:'auto',flexShrink:0,padding:'8px 6px'}}>
          {CATS.map(cat => {
            const catNodes = NODE_DEFS.filter(n=>n.cat===cat.id&&n.type!=='incoming')
            return (
              <div key={cat.id} style={{marginBottom:6}}>
                <div style={{fontSize:9,fontWeight:700,color:cat.color,textTransform:'uppercase',letterSpacing:'.08em',padding:'6px 8px 4px'}}>{cat.label}</div>
                {catNodes.map(t => (
                  <div key={t.type} onClick={()=>addNode(t.type)}
                    style={{display:'flex',alignItems:'center',gap:7,padding:'7px 9px',borderRadius:8,cursor:'pointer',marginBottom:2,border:'1px solid transparent',background:'var(--panel)',transition:'all .12s'}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=t.color;e.currentTarget.style.background=t.color+'14'}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor='transparent';e.currentTarget.style.background='var(--panel)'}}>
                    <span style={{fontSize:15}}>{t.icon}</span>
                    <span style={{fontSize:11,fontWeight:700,color:'var(--text)',lineHeight:1.3}}>{t.label}</span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>

        {/* CANVAS */}
        <div style={{flex:1,position:'relative',overflow:'hidden',cursor:isDragging?(dragWire.current?'crosshair':'grabbing'):'default'}}>

          {/* Grid bg */}
          <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:0}}>
            <defs>
              <pattern id="cfgrid" width={28} height={28} patternUnits="userSpaceOnUse">
                <path d="M 28 0 L 0 0 0 28" fill="none" stroke="var(--border)" strokeWidth={0.5} />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#cfgrid)" />
          </svg>

          {/* Zoom controls */}
          <div style={{position:'absolute',bottom:14,right:14,zIndex:20,display:'flex',flexDirection:'column',gap:4}}>
            {[['＋',0.15],['－',-0.15],['⊡',null]].map(([label,delta]) => (
              <button key={label} onClick={() => delta ? setZoom(z=>Math.max(0.3,Math.min(2,z+delta))) : (setZoom(1),setPan({x:0,y:0}))}
                style={{width:30,height:30,borderRadius:7,border:'1px solid var(--border)',background:'var(--panel)',color:'var(--text)',fontSize:16,cursor:'pointer',fontFamily:ff,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 2px 8px rgba(0,0,0,.12)'}}>
                {label}
              </button>
            ))}
            <div style={{textAlign:'center',fontSize:9,color:'var(--muted)',marginTop:2}}>{Math.round(zoom*100)}%</div>
          </div>

          {/* Zoom hint */}
          <div style={{position:'absolute',bottom:14,left:174,zIndex:10,fontSize:10,color:'var(--muted)',background:'var(--panel)',padding:'3px 8px',borderRadius:6,border:'1px solid var(--border)',pointerEvents:'none'}}>
            Scroll to zoom · Middle-drag to pan · +/- buttons
          </div>

          {/* Main SVG */}
          <svg ref={svgRef}
            style={{position:'absolute',inset:0,width:'100%',height:'100%',overflow:'visible',zIndex:1,userSelect:'none'}}
            onMouseMove={onSvgMouseMove}
            onMouseUp={onSvgMouseUp}
            onMouseLeave={onSvgMouseUp}
            onClick={onSvgClick}
            onWheel={e => {
              e.preventDefault()
              const delta = e.deltaY > 0 ? -0.08 : 0.08
              setZoom(z => Math.max(0.3, Math.min(2, z + delta)))
            }}>

            <defs>
              {MARKERS.map(m=>(
                <marker key={m.id} id={m.id} markerWidth={8} markerHeight={8} refX={7} refY={3} orient="auto">
                  <path d="M 0 0 L 7 3 L 0 6 z" fill={m.color} />
                </marker>
              ))}
            </defs>

            {/* All nodes/edges are inside a transform group for zoom+pan */}
            <g transform={'translate(' + pan.x + ',' + pan.y + ') scale(' + zoom + ')'}>

            {/* Edges */}
            {edges.map(edge => {
              const fn = nodes.find(n=>n.id===edge.from)
              const tn = nodes.find(n=>n.id===edge.to)
              const path = edgePath(fn, edge.port, tn)
              if (!path) return null
              const color = eColor(edge.port, fn)
              const label = eLabel(edge.port, fn)
              const mx = fn&&tn ? (fn.x+NW+tn.x)/2 : 0
              const my = fn&&tn ? (fn.y+tn.y)/2+NH/2 : 0
              return (
                <g key={edge.id}>
                  {/* Fat hit zone */}
                  <path d={path} fill="none" stroke="transparent" strokeWidth={20} style={{cursor:'pointer'}}
                    onClick={e=>{e.stopPropagation();deleteEdge(edge.id)}} />
                  {/* Visible wire */}
                  <path d={path} fill="none" stroke={color} strokeWidth={2.5} opacity={0.88} markerEnd={markerFor(color)} />
                  {/* Label */}
                  {label && (
                    <g>
                      <rect x={mx-38} y={my-10} width={76} height={20} rx={10} fill={color} opacity={0.92} />
                      <text x={mx} y={my+5} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff" fontFamily={ff}>{label}</text>
                    </g>
                  )}
                </g>
              )
            })}

            {/* Live wire */}
            {dragWire.current && wirePos && (
              <path d={livePath()} fill="none" stroke="#CC2200" strokeWidth={2.5} strokeDasharray="8 4" opacity={0.75} />
            )}

            {/* Nodes */}
            {nodes.map(node => (
              <g key={node.id}>
                <FlowNode
                  node={node}
                  selected={selected===node.id}
                  agents={agents||[]}
                  connectedPorts={connectedPorts}
                  dragPort={actPort}
                  onMouseDownNode={onMouseDownNode}
                  onMouseDownPort={onMouseDownPort}
                  onPortDrop={onPortDrop}
                  onClickNode={onClickNode}
                />
              </g>
            ))}
            </g>
          </svg>

          {/* Drop hint */}
          {dragWire.current && wirePos && (
            <div style={{position:'absolute',top:14,left:'50%',transform:'translateX(-50%)',padding:'7px 20px',borderRadius:20,background:'#CC2200',color:'#fff',fontSize:12,fontWeight:700,zIndex:10,pointerEvents:'none',boxShadow:'0 4px 16px rgba(0,0,0,.25)',whiteSpace:'nowrap'}}>
              Drop onto any node to connect
            </div>
          )}

          {/* Empty */}
          {nodes.length<=1 && (
            <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
              <div style={{textAlign:'center',padding:40,opacity:0.35}}>
                <div style={{fontSize:40,marginBottom:12}}>🔀</div>
                <div style={{fontSize:15,fontWeight:800,color:'var(--text)',marginBottom:6}}>Build your call flow</div>
                <div style={{fontSize:13,color:'var(--muted)'}}>Click nodes in the left panel to add them</div>
              </div>
            </div>
          )}
        </div>

        {/* CONFIG PANEL */}
        {selectedNode && (
          <ConfigPanel node={selectedNode} agents={agents||[]} onSave={updateCfg} onClose={()=>setSelected(null)} />
        )}
      </div>
    </div>

      {/* ── TEST CALL MODAL ── */}
      {showTest && (
        <div onClick={e=>e.target===e.currentTarget&&setShowTest(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:16, fontFamily:ff }}>
          <div style={{ background:'var(--panel)', borderRadius:14, width:'100%', maxWidth:440, padding:24, boxShadow:'0 20px 50px rgba(0,0,0,.3)' }}>
            <div style={{ fontSize:16, fontWeight:800, color:'var(--text)', marginBottom:4 }}>📞 Test Your Call Flow</div>
            <div style={{ fontSize:13, color:'var(--muted)', marginBottom:20, lineHeight:1.6 }}>
              Twilio will call the number below. Pick up and you'll hear exactly what your callers hear when they call <strong style={{ color:'var(--text)' }}>845-327-1778</strong>.
            </div>

            {!savedId && (
              <div style={{ padding:'10px 14px', background:'#FEF3C7', border:'1px solid #FDE68A', borderRadius:9, marginBottom:14, fontSize:12, color:'#92400E' }}>
                ⚠️ Save the flow first before testing — the test call uses the saved version.
              </div>
            )}

            <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>
              Phone number to call
            </div>
            <input
              value={testPhone}
              onChange={e => setTestPhone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && testCall()}
              placeholder="+1 (845) 555-0100"
              style={{ width:'100%', padding:'10px 12px', borderRadius:9, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:15, fontFamily:ff, boxSizing:'border-box', marginBottom:16 }}
            />

            <div style={{ padding:'10px 14px', background:'var(--dim)', borderRadius:9, border:'1px solid var(--border)', fontSize:11, color:'var(--muted)', lineHeight:1.7, marginBottom:16 }}>
              <strong style={{ color:'var(--text)' }}>Webhook must be configured:</strong><br/>
              In your <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer" style={{ color:'#3B82F6' }}>Twilio Console</a> → Phone Numbers → 845-327-1778 → Voice webhook:<br/>
              <code style={{ fontFamily:'monospace', color:'#CC2200', fontSize:11 }}>https://app.targetreteam.com/api/twilio-inbound</code><br/>
              Method: <strong>HTTP POST</strong>
            </div>

            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => setShowTest(false)}
                style={{ padding:'9px 16px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', cursor:'pointer', fontFamily:ff }}>
                Cancel
              </button>
              <button onClick={testCall} disabled={testing || !savedId}
                style={{ padding:'9px 20px', borderRadius:8, border:'none', background: savedId ? '#10B981' : 'var(--dim)', color: savedId ? '#fff' : 'var(--muted)', fontSize:13, fontWeight:700, cursor: savedId&&!testing ? 'pointer' : 'default', fontFamily:ff }}>
                {testing ? '⏳ Calling...' : '📞 Call Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}