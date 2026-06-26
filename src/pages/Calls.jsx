// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Phone System
// Full Twilio-ready phone management:
//   • Call log — inbound/outbound, recordings, voicemails
//   • Extension manager — assign agents to extensions
//   • IVR builder — configure menu tree
//   • Routing rules — round robin, contact matching
//   • Voicemail inbox — playback + transcripts
//   • Twilio webhook endpoints pre-wired at /api/twilio-*
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { fmtDate, fmtPhone } from '../lib/utils'
import { Btn, Loading, Empty, Confirm, Avatar } from '../components/UI'
import { FilterBar } from '../components/FilterBar'
import { useAgents } from '../lib/hooks'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// ── CONSTANTS ──────────────────────────────────────────────────
const DIRECTIONS = ['Inbound','Outbound']
const OUTCOMES   = ['Connected','No Answer','Voicemail','Callback Requested','Hot Lead','Appointment Set','Not Interested','Wrong Number']
const RULE_TYPES = [
  { id: 'round_robin',    label: 'Round Robin',      icon: '🔄', desc: 'Distribute calls evenly across all available agents' },
  { id: 'contact_match',  label: 'Contact Match',     icon: '👤', desc: 'Route to the assigned agent if caller is a known contact' },
  { id: 'schedule',       label: 'Schedule-Based',    icon: '🕐', desc: 'Different routing during business hours vs after hours' },
  { id: 'direct',         label: 'Direct Extension',  icon: '📱', desc: 'Always route to a specific extension' },
]

const TABS_MAIN = [
  { id: 'log',       label: '📋 Call Log' },
  { id: 'voicemail', label: '📬 Voicemail' },
  { id: 'extensions',label: '📞 Extensions' },
  { id: 'ivr',       label: '🎛 IVR Menu' },
  { id: 'flow',      label: '🔀 Call Flows' },
  { id: 'routing',   label: '⚙️ Routing Rules' },
  { id: 'settings',  label: '🔌 Twilio Setup' },
]

// ── HELPERS ────────────────────────────────────────────────────
function fmtDuration(sec) {
  if (!sec) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function outcomeColor(o) {
  if (['Hot Lead','Appointment Set','Connected'].includes(o)) return '#10B981'
  if (['No Answer','Not Interested','Wrong Number'].includes(o)) return '#DC2626'
  if (o === 'Voicemail') return '#F5A623'
  return '#94A3B8'
}

function directionColor(d) {
  return d === 'Inbound' ? '#3B82F6' : '#8B5CF6'
}

function Badge({ label, color }) {
  return (
    <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:'20px', background:color+'22', color, fontSize:'10px', fontWeight:700, border:`1px solid ${color}33`, whiteSpace:'nowrap' }}>
      {label}
    </span>
  )
}

// ── RECORDING PLAYER ──────────────────────────────────────────
function RecordingPlayer({ url }) {
  const [playing, setPlaying] = useState(false)
  const audio = useRef(null)
  if (!url) return null
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 10px', background:'var(--dim)', borderRadius:'8px', border:'1px solid var(--border)', marginTop:'8px' }}>
      <button onClick={() => {
        if (!audio.current) audio.current = new Audio(url)
        if (playing) { audio.current.pause(); setPlaying(false) }
        else { audio.current.play(); setPlaying(true); audio.current.onended = () => setPlaying(false) }
      }}
        style={{ width:28, height:28, borderRadius:'50%', border:'none', background:'#CC2200', color:'#fff', cursor:'pointer', fontSize:'12px', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        {playing ? '⏸' : '▶'}
      </button>
      <span style={{ fontSize:'12px', color:'var(--muted)', flex:1 }}>Recording</span>
      <a href={url} download target="_blank" rel="noopener noreferrer"
        style={{ fontSize:'11px', color:'var(--brand)', textDecoration:'none' }}>⬇ Download</a>
    </div>
  )
}

// ── CALL DETAIL DRAWER ────────────────────────────────────────
function CallDrawer({ call, agents, onSave, onClose, onDelete, saving }) {
  const [form, setForm] = useState({ ...call })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const agent = agents.find(a => a.id === call.agent_id)

  const Lbl = ({ c }) => (
    <div style={{ fontSize:'10px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'4px' }}>{c}</div>
  )
  const Inp = ({ k, type='text', placeholder }) => (
    <input type={type} value={form[k] || ''} onChange={e => set(k, e.target.value)} placeholder={placeholder}
      style={{ width:'100%', padding:'7px 9px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff, boxSizing:'border-box' }} />
  )
  const Sel = ({ k, options }) => (
    <select value={form[k] || ''} onChange={e => set(k, e.target.value)}
      style={{ width:'100%', padding:'7px 9px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff }}>
      <option value="">—</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )

  return (
    <div onClick={e => e.target===e.currentTarget && onClose()}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', zIndex:1000, display:'flex', fontFamily:ff }}>
      <div style={{ marginLeft:'auto', width:'520px', maxWidth:'92vw', height:'100vh', background:'var(--panel)', borderLeft:'1px solid var(--border)', display:'flex', flexDirection:'column', boxShadow:'-8px 0 40px rgba(0,0,0,.2)' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:'10px' }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:'15px', fontWeight:800, color:'var(--text)' }}>{call.contact_name || call.from_number || 'Unknown Caller'}</div>
            <div style={{ display:'flex', gap:'6px', marginTop:'4px' }}>
              <Badge label={call.direction || 'Inbound'} color={directionColor(call.direction)} />
              {call.outcome && <Badge label={call.outcome} color={outcomeColor(call.outcome)} />}
              {call.is_voicemail && <Badge label="Voicemail" color="#F5A623" />}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'18px', cursor:'pointer', color:'var(--muted)' }}>✕</button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'16px 18px', display:'flex', flexDirection:'column', gap:'12px' }}>
          {/* Twilio metadata */}
          {call.twilio_call_sid && (
            <div style={{ padding:'8px 12px', background:'var(--dim)', borderRadius:'8px', border:'1px solid var(--border)', fontSize:'11px', color:'var(--muted)' }}>
              <span style={{ fontWeight:700 }}>Call SID:</span> {call.twilio_call_sid}
              {call.from_number && <> &nbsp;·&nbsp; <span style={{ fontWeight:700 }}>From:</span> {call.from_number}</>}
              {call.to_number   && <> &nbsp;·&nbsp; <span style={{ fontWeight:700 }}>To:</span> {call.to_number}</>}
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
            <div><Lbl c="Contact Name" /><Inp k="contact_name" placeholder="John Smith" /></div>
            <div><Lbl c="Phone" /><Inp k="from_number" type="tel" placeholder="(845) 555-1234" /></div>
            <div><Lbl c="Direction" /><Sel k="direction" options={DIRECTIONS} /></div>
            <div><Lbl c="Outcome" /><Sel k="outcome" options={OUTCOMES} /></div>
            <div><Lbl c="Extension" /><Inp k="extension" placeholder="101" /></div>
            <div><Lbl c="Duration" /><Inp k="duration_sec" type="number" placeholder="0" /></div>
          </div>

          <div>
            <Lbl c="Assigned Agent" />
            <select value={form.agent_id||''} onChange={e => set('agent_id', e.target.value)}
              style={{ width:'100%', padding:'7px 9px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff }}>
              <option value="">— Unassigned —</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <div>
            <Lbl c="Notes" />
            <textarea value={form.notes||''} onChange={e => set('notes', e.target.value)} placeholder="What was discussed?" rows={3}
              style={{ width:'100%', padding:'8px 10px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff, resize:'vertical', boxSizing:'border-box' }} />
          </div>

          {/* Recording */}
          {call.recording_url && (
            <div>
              <Lbl c="Call Recording" />
              <RecordingPlayer url={call.recording_url} />
            </div>
          )}

          {/* Voicemail */}
          {call.is_voicemail && (
            <div style={{ padding:'12px', background:'#FFF7ED', borderRadius:'9px', border:'1px solid #F5A623' }}>
              <div style={{ fontSize:'12px', fontWeight:700, color:'#F5A623', marginBottom:'6px' }}>📬 Voicemail</div>
              {call.voicemail_transcript && (
                <div style={{ fontSize:'13px', color:'#92400E', lineHeight:1.5, marginBottom:'8px' }}>"{call.voicemail_transcript}"</div>
              )}
              <RecordingPlayer url={call.voicemail_url} />
            </div>
          )}
        </div>

        <div style={{ padding:'12px 18px', borderTop:'1px solid var(--border)', display:'flex', gap:'8px' }}>
          <button onClick={onDelete} style={{ padding:'8px 12px', borderRadius:'8px', border:'1px solid #DC262644', background:'#FEF2F2', color:'#DC2626', fontSize:'12px', fontWeight:700, cursor:'pointer', fontFamily:ff }}>Delete</button>
          <div style={{ flex:1 }} />
          <button onClick={onClose} style={{ padding:'8px 14px', borderRadius:'8px', border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', cursor:'pointer', fontFamily:ff, fontSize:'13px' }}>Cancel</button>
          <Btn onClick={() => onSave(form)} loading={saving}>Save</Btn>
        </div>
      </div>
    </div>
  )
}

// ── EXTENSION MANAGER ─────────────────────────────────────────
function ExtensionManager({ agents }) {
  const { toast } = useApp()
  const [extensions, setExtensions] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [editExt,    setEditExt]    = useState(null) // null=closed, {}=new, {...}=edit
  const [saving,     setSaving]     = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('phone_extensions').select('*, agents(id,name,color)').order('order_index')
    setExtensions(data || [])
    setLoading(false)
  }

  async function save(form) {
    setSaving(true)
    try {
      if (form.id) {
        await supabase.from('phone_extensions').update(form).eq('id', form.id)
      } else {
        await supabase.from('phone_extensions').insert(form)
      }
      await load()
      setEditExt(null)
      toast('✅ Extension saved')
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  async function toggleActive(ext) {
    await supabase.from('phone_extensions').update({ active: !ext.active }).eq('id', ext.id)
    setExtensions(prev => prev.map(e => e.id === ext.id ? { ...e, active: !e.active } : e))
  }

  async function remove(id) {
    await supabase.from('phone_extensions').delete().eq('id', id)
    setExtensions(prev => prev.filter(e => e.id !== id))
    toast('Extension deleted')
  }

  const BLANK_EXT = { number:'', label:'', agent_id:'', forward_to:'', active:true, voicemail_greeting:'', order_index:extensions.length }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'16px' }}>
        <div>
          <div style={{ fontSize:'15px', fontWeight:800, color:'var(--text)' }}>Extension Directory</div>
          <div style={{ fontSize:'12px', color:'var(--muted)' }}>Each extension forwards to an agent's cell. Callers dial the extension to reach them directly.</div>
        </div>
        <Btn style={{ marginLeft:'auto' }} onClick={() => setEditExt({ ...BLANK_EXT })}>+ Add Extension</Btn>
      </div>

      {loading ? <Loading /> : extensions.length === 0 ? (
        <Empty icon="📞" title="No extensions yet" sub="Add your first extension to start routing calls."
          action={<Btn onClick={() => setEditExt({ ...BLANK_EXT })}>+ Add Extension</Btn>} />
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {extensions.map(ext => {
            const agent = agents.find(a => a.id === ext.agent_id) || ext.agents
            return (
              <div key={ext.id} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 16px', background:'var(--panel)', borderRadius:'10px', border:`1px solid var(--border)`, opacity: ext.active ? 1 : 0.5 }}>
                {/* Extension number */}
                <div style={{ width:44, height:44, borderRadius:'10px', background: ext.active ? '#CC2200' : 'var(--dim)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', fontWeight:900, color: ext.active ? '#fff' : 'var(--muted)', flexShrink:0 }}>
                  {ext.number}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'14px', fontWeight:700, color:'var(--text)' }}>{ext.label}</div>
                  <div style={{ fontSize:'12px', color:'var(--muted)', marginTop:'2px' }}>
                    {agent && <span style={{ marginRight:'8px' }}>👤 {agent.name}</span>}
                    {ext.forward_to && <span>→ {fmtPhone(ext.forward_to)}</span>}
                  </div>
                  {ext.voicemail_greeting && (
                    <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:'2px', fontStyle:'italic', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      🔊 "{ext.voicemail_greeting.slice(0,60)}..."
                    </div>
                  )}
                </div>
                <div style={{ display:'flex', gap:'6px', alignItems:'center', flexShrink:0 }}>
                  <button onClick={() => toggleActive(ext)}
                    style={{ padding:'4px 10px', borderRadius:'6px', border:`1px solid ${ext.active ? '#10B981' : 'var(--border)'}`, background: ext.active ? '#10B98118' : 'transparent', color: ext.active ? '#10B981' : 'var(--muted)', fontSize:'11px', fontWeight:700, cursor:'pointer', fontFamily:ff }}>
                    {ext.active ? 'Active' : 'Inactive'}
                  </button>
                  <button onClick={() => setEditExt(ext)}
                    style={{ padding:'5px 10px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--dim)', color:'var(--muted)', fontSize:'12px', cursor:'pointer', fontFamily:ff }}>
                    ✏️ Edit
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Extension Edit Modal */}
      {editExt !== null && (
        <div onClick={e => e.target===e.currentTarget && setEditExt(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', fontFamily:ff }}>
          <div style={{ background:'var(--panel)', borderRadius:'14px', width:'100%', maxWidth:'460px', boxShadow:'0 20px 50px rgba(0,0,0,.3)' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontSize:'15px', fontWeight:800, color:'var(--text)' }}>
              {editExt.id ? 'Edit Extension' : 'New Extension'}
            </div>
            <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:'12px' }}>
              <ExtForm ext={editExt} agents={agents} onChange={setEditExt} />
            </div>
            <div style={{ padding:'12px 18px', borderTop:'1px solid var(--border)', display:'flex', gap:'8px', justifyContent:'flex-end' }}>
              <button onClick={() => setEditExt(null)} style={{ padding:'8px 14px', borderRadius:'8px', border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', cursor:'pointer', fontFamily:ff }}>Cancel</button>
              <Btn onClick={() => save(editExt)} loading={saving}>Save Extension</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ExtForm({ ext, agents, onChange }) {
  const set = (k, v) => onChange(prev => ({ ...prev, [k]: v }))
  const Lbl = ({ c }) => <div style={{ fontSize:'10px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'4px' }}>{c}</div>
  const Inp = ({ k, type='text', placeholder }) => (
    <input type={type} value={ext[k]||''} onChange={e => set(k, e.target.value)} placeholder={placeholder}
      style={{ width:'100%', padding:'7px 9px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff, boxSizing:'border-box' }} />
  )
  return (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
        <div><Lbl c="Extension #" /><Inp k="number" placeholder="101" /></div>
        <div><Lbl c="Label" /><Inp k="label" placeholder="Sales Desk" /></div>
      </div>
      <div>
        <Lbl c="Assigned Agent" />
        <select value={ext.agent_id||''} onChange={e => set('agent_id', e.target.value)}
          style={{ width:'100%', padding:'7px 9px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff }}>
          <option value="">— No agent —</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div>
        <Lbl c="Forward to Cell #" />
        <Inp k="forward_to" type="tel" placeholder="+18455551234" />
      </div>
      <div>
        <Lbl c="Voicemail / No-Answer Greeting (spoken by TTS)" />
        <textarea value={ext.voicemail_greeting||''} onChange={e => set('voicemail_greeting', e.target.value)}
          placeholder="Hi, you've reached Lazer Farkas at Target Team. Please leave a message and I'll call you back shortly."
          rows={3} style={{ width:'100%', padding:'8px 10px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff, resize:'vertical', boxSizing:'border-box' }} />
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
        <input type="checkbox" checked={!!ext.active} onChange={e => set('active', e.target.checked)} id="ext-active" />
        <label htmlFor="ext-active" style={{ fontSize:'13px', color:'var(--text)', cursor:'pointer' }}>Extension is active</label>
      </div>
    </>
  )
}

// ── IVR BUILDER ───────────────────────────────────────────────
function IVRBuilder({ agents }) {
  const { toast } = useApp()
  const [ivr,     setIvr]    = useState(null)
  const [loading, setLoad]   = useState(true)
  const [saving,  setSaving] = useState(false)
  const [exts,    setExts]   = useState([])

  useEffect(() => {
    Promise.all([
      supabase.from('phone_ivr').select('*').order('created_at').limit(1).maybeSingle(),
      supabase.from('phone_extensions').select('*').order('order_index'),
    ]).then(([ivrRes, extRes]) => {
      setIvr(ivrRes.data || { name:'Main Menu', is_active:true, greeting_text:'', menu_options:[], voicemail_extension:'9', after_hours_text:'' })
      setExts(extRes.data || [])
      setLoad(false)
    })
  }, [])

  const set = (k, v) => setIvr(prev => ({ ...prev, [k]: v }))

  function setOption(i, k, v) {
    const opts = [...(ivr.menu_options || [])]
    opts[i] = { ...opts[i], [k]: v }
    set('menu_options', opts)
  }

  function addOption() {
    const opts = [...(ivr.menu_options || [])]
    const nextKey = String(opts.length + 1)
    opts.push({ key: nextKey, label: '', action: 'extension', value: '' })
    set('menu_options', opts)
  }

  function removeOption(i) {
    const opts = [...(ivr.menu_options || [])]
    opts.splice(i, 1)
    set('menu_options', opts)
  }

  async function saveIVR() {
    setSaving(true)
    try {
      if (ivr.id) {
        await supabase.from('phone_ivr').update({ ...ivr, updated_at: new Date().toISOString() }).eq('id', ivr.id)
      } else {
        const { data } = await supabase.from('phone_ivr').insert(ivr).select().single()
        setIvr(data)
      }
      toast('✅ IVR menu saved')
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  if (loading) return <Loading />
  if (!ivr) return null

  const Lbl = ({ c }) => <div style={{ fontSize:'10px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'4px' }}>{c}</div>
  const Inp = ({ k, placeholder, type='text' }) => (
    <input type={type} value={ivr[k]||''} onChange={e => set(k, e.target.value)} placeholder={placeholder}
      style={{ width:'100%', padding:'8px 10px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff, boxSizing:'border-box' }} />
  )

  return (
    <div style={{ maxWidth:'700px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px' }}>
        <div>
          <div style={{ fontSize:'15px', fontWeight:800, color:'var(--text)' }}>IVR Menu Builder</div>
          <div style={{ fontSize:'12px', color:'var(--muted)' }}>Configure what callers hear and the options they can press.</div>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:'8px', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background: ivr.is_active ? '#10B981' : '#DC2626' }} />
            <span style={{ fontSize:'12px', color:'var(--muted)' }}>{ivr.is_active ? 'Active' : 'Inactive'}</span>
          </div>
          <button onClick={() => set('is_active', !ivr.is_active)}
            style={{ padding:'5px 10px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--dim)', cursor:'pointer', fontSize:'12px', fontFamily:ff, color:'var(--muted)' }}>
            {ivr.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>

      {/* Greeting */}
      <div style={{ background:'var(--panel)', borderRadius:'12px', border:'1px solid var(--border)', padding:'16px', marginBottom:'12px' }}>
        <div style={{ fontSize:'13px', fontWeight:700, color:'var(--text)', marginBottom:'10px' }}>📢 Greeting Message</div>
        <Lbl c="Spoken when caller picks up (Text-to-Speech)" />
        <textarea value={ivr.greeting_text||''} onChange={e => set('greeting_text', e.target.value)}
          placeholder="Thank you for calling Target Team. For Sales, press 1. For Lazer Farkas, press 2. For Mendy Jankovits, press 3. To speak with any available agent, press 0. For the property listing directory, press 8. To leave a voicemail, press 9."
          rows={4} style={{ width:'100%', padding:'8px 10px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff, resize:'vertical', boxSizing:'border-box' }} />
        <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:'4px' }}>Tip: mention each option number in order so callers know what to press.</div>
      </div>

      {/* Menu options */}
      <div style={{ background:'var(--panel)', borderRadius:'12px', border:'1px solid var(--border)', padding:'16px', marginBottom:'12px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
          <div style={{ fontSize:'13px', fontWeight:700, color:'var(--text)' }}>📱 Keypad Options</div>
          <button onClick={addOption}
            style={{ padding:'5px 12px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--dim)', color:'var(--muted)', fontSize:'12px', cursor:'pointer', fontFamily:ff }}>
            + Add Option
          </button>
        </div>
        {(!ivr.menu_options || ivr.menu_options.length === 0) && (
          <div style={{ textAlign:'center', padding:'16px', color:'var(--muted)', fontSize:'12px', fontStyle:'italic' }}>
            No options yet — click "Add Option" to add the first one
          </div>
        )}
        {(ivr.menu_options || []).map((opt, i) => (
          <div key={i} style={{ display:'grid', gridTemplateColumns:'56px 1fr 140px 1fr 32px', gap:'8px', marginBottom:'8px', alignItems:'center' }}>
            {/* Key */}
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:'10px', color:'var(--muted)', marginBottom:'2px', fontWeight:700 }}>PRESS</div>
              <input value={opt.key||''} onChange={e => setOption(i,'key',e.target.value)}
                style={{ width:'100%', padding:'6px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'16px', fontWeight:900, textAlign:'center', fontFamily:ff }} />
            </div>
            {/* Label */}
            <input value={opt.label||''} onChange={e => setOption(i,'label',e.target.value)}
              placeholder="Option label (e.g. Sales, Lazer Direct)"
              style={{ padding:'8px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'12px', fontFamily:ff }} />
            {/* Action */}
            <select value={opt.action||'extension'} onChange={e => setOption(i,'action',e.target.value)}
              style={{ padding:'8px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'12px', fontFamily:ff }}>
              <option value="extension">Extension</option>
              <option value="round_robin">Round Robin</option>
              <option value="voicemail">Voicemail</option>
              <option value="listing_search">Listing Search</option>
              <option value="repeat">Repeat Menu</option>
            </select>
            {/* Value */}
            {opt.action === 'extension' ? (
              <select value={opt.value||''} onChange={e => setOption(i,'value',e.target.value)}
                style={{ padding:'8px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'12px', fontFamily:ff }}>
                <option value="">— Select extension —</option>
                {exts.map(e => <option key={e.id} value={e.number}>Ext {e.number} — {e.label}</option>)}
              </select>
            ) : opt.action === 'round_robin' ? (
              <input value={opt.value||''} onChange={e => setOption(i,'value',e.target.value)}
                placeholder="Group name (e.g. all_agents)"
                style={{ padding:'8px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'12px', fontFamily:ff }} />
            ) : (
              <div style={{ padding:'8px', fontSize:'12px', color:'var(--muted)', fontStyle:'italic' }}>{opt.action}</div>
            )}
            {/* Remove */}
            <button onClick={() => removeOption(i)}
              style={{ width:28, height:28, borderRadius:'6px', border:'1px solid #DC262644', background:'#FEF2F2', color:'#DC2626', fontSize:'14px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* After hours */}
      <div style={{ background:'var(--panel)', borderRadius:'12px', border:'1px solid var(--border)', padding:'16px', marginBottom:'16px' }}>
        <div style={{ fontSize:'13px', fontWeight:700, color:'var(--text)', marginBottom:'10px' }}>🌙 After-Hours Message</div>
        <textarea value={ivr.after_hours_text||''} onChange={e => set('after_hours_text', e.target.value)}
          placeholder="Thank you for calling Target Team. Our office is currently closed. Please leave a voicemail and we will call you back on the next business day."
          rows={3} style={{ width:'100%', padding:'8px 10px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff, resize:'vertical', boxSizing:'border-box' }} />
        <div style={{ marginTop:'10px', display:'flex', alignItems:'center', gap:'10px' }}>
          <div style={{ fontSize:'12px', color:'var(--muted)', fontWeight:700 }}>Voicemail extension key:</div>
          <input value={ivr.voicemail_extension||'9'} onChange={e => set('voicemail_extension', e.target.value)}
            style={{ width:48, padding:'5px 8px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'14px', fontWeight:700, textAlign:'center', fontFamily:ff }} />
        </div>
      </div>

      <Btn onClick={saveIVR} loading={saving}>💾 Save IVR Menu</Btn>
    </div>
  )
}

// ── ROUTING RULES ─────────────────────────────────────────────
function RoutingRules({ agents }) {
  const { toast } = useApp()
  const [rules,   setRules]  = useState([])
  const [loading, setLoad]   = useState(true)
  const [editRule,setEdit]   = useState(null)
  const [saving,  setSaving] = useState(false)
  const [exts,    setExts]   = useState([])

  useEffect(() => {
    Promise.all([
      supabase.from('phone_routing').select('*').order('priority'),
      supabase.from('phone_extensions').select('*').order('order_index'),
    ]).then(([rr, er]) => {
      setRules(rr.data || [])
      setExts(er.data || [])
      setLoad(false)
    })
  }, [])

  async function save(form) {
    setSaving(true)
    try {
      if (form.id) {
        await supabase.from('phone_routing').update(form).eq('id', form.id)
      } else {
        await supabase.from('phone_routing').insert(form)
      }
      const { data } = await supabase.from('phone_routing').select('*').order('priority')
      setRules(data || [])
      setEdit(null)
      toast('✅ Routing rule saved')
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  async function toggle(rule) {
    await supabase.from('phone_routing').update({ is_active: !rule.is_active }).eq('id', rule.id)
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r))
  }

  async function remove(id) {
    await supabase.from('phone_routing').delete().eq('id', id)
    setRules(prev => prev.filter(r => r.id !== id))
    toast('Rule deleted')
  }

  const BLANK_RULE = { name:'', rule_type:'contact_match', is_active:true, priority: rules.length, config:{} }

  if (loading) return <Loading />

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'16px' }}>
        <div>
          <div style={{ fontSize:'15px', fontWeight:800, color:'var(--text)' }}>Routing Rules</div>
          <div style={{ fontSize:'12px', color:'var(--muted)' }}>Rules are evaluated in priority order (top first). First matching rule wins.</div>
        </div>
        <Btn style={{ marginLeft:'auto' }} onClick={() => setEdit({ ...BLANK_RULE })}>+ Add Rule</Btn>
      </div>

      {/* How routing works diagram */}
      <div style={{ background:'var(--dim)', borderRadius:'10px', border:'1px solid var(--border)', padding:'14px 16px', marginBottom:'16px', display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
        {['Inbound call','→ Check contact DB','→ Match found? → Agent','→ No match → IVR Menu','→ Agent selects / Round Robin'].map((step, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:'6px' }}>
            <div style={{ padding:'5px 10px', background: i===0?'#CC2200':i===4?'#10B981':'var(--panel)', color:i===0||i===4?'#fff':'var(--text)', borderRadius:'6px', fontSize:'11px', fontWeight:700, border:'1px solid var(--border)', whiteSpace:'nowrap' }}>{step}</div>
            {i < 4 && <span style={{ color:'var(--muted)' }}>→</span>}
          </div>
        ))}
      </div>

      {rules.length === 0 ? (
        <Empty icon="🔀" title="No routing rules" sub="Add rules to control how inbound calls are distributed."
          action={<Btn onClick={() => setEdit({ ...BLANK_RULE })}>+ Add Rule</Btn>} />
      ) : rules.map(rule => {
        const typeDef = RULE_TYPES.find(t => t.id === rule.rule_type)
        return (
          <div key={rule.id} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 16px', background:'var(--panel)', borderRadius:'10px', border:'1px solid var(--border)', marginBottom:'8px', opacity: rule.is_active ? 1 : 0.5 }}>
            <div style={{ width:36, height:36, borderRadius:'8px', background:'var(--dim)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', flexShrink:0 }}>
              {typeDef?.icon || '🔀'}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:'13px', fontWeight:700, color:'var(--text)' }}>{rule.name}</div>
              <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:'1px' }}>{typeDef?.desc}</div>
            </div>
            <Badge label={typeDef?.label || rule.rule_type} color="#3B82F6" />
            <button onClick={() => toggle(rule)}
              style={{ padding:'4px 10px', borderRadius:'6px', border:`1px solid ${rule.is_active ? '#10B981' : 'var(--border)'}`, background: rule.is_active ? '#10B98118' : 'transparent', color: rule.is_active ? '#10B981' : 'var(--muted)', fontSize:'11px', fontWeight:700, cursor:'pointer', fontFamily:ff }}>
              {rule.is_active ? 'Active' : 'Off'}
            </button>
            <button onClick={() => setEdit(rule)}
              style={{ padding:'5px 10px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--dim)', color:'var(--muted)', fontSize:'12px', cursor:'pointer', fontFamily:ff }}>
              ✏️
            </button>
          </div>
        )
      })}

      {/* Rule Edit Modal */}
      {editRule !== null && (
        <div onClick={e => e.target===e.currentTarget && setEdit(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', fontFamily:ff }}>
          <div style={{ background:'var(--panel)', borderRadius:'14px', width:'100%', maxWidth:'500px', boxShadow:'0 20px 50px rgba(0,0,0,.3)' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontSize:'15px', fontWeight:800, color:'var(--text)' }}>
              {editRule.id ? 'Edit Rule' : 'New Routing Rule'}
            </div>
            <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:'12px' }}>
              <div>
                <div style={{ fontSize:'10px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'4px' }}>Rule Name</div>
                <input value={editRule.name||''} onChange={e => setEdit(r => ({ ...r, name: e.target.value }))}
                  placeholder="e.g. Contact Match, After Hours, Main Round Robin"
                  style={{ width:'100%', padding:'8px 10px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff, boxSizing:'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize:'10px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'8px' }}>Rule Type</div>
                <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                  {RULE_TYPES.map(rt => (
                    <div key={rt.id} onClick={() => setEdit(r => ({ ...r, rule_type: rt.id }))}
                      style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', borderRadius:'8px', border:`1px solid ${editRule.rule_type===rt.id ? '#CC2200' : 'var(--border)'}`, background: editRule.rule_type===rt.id ? 'rgba(204,34,0,.05)' : 'var(--dim)', cursor:'pointer' }}>
                      <span style={{ fontSize:'18px' }}>{rt.icon}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:'13px', fontWeight:700, color: editRule.rule_type===rt.id ? '#CC2200' : 'var(--text)' }}>{rt.label}</div>
                        <div style={{ fontSize:'11px', color:'var(--muted)' }}>{rt.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {editRule.rule_type === 'round_robin' && (
                <div>
                  <div style={{ fontSize:'10px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'4px' }}>Agents in rotation</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
                    {agents.map(a => {
                      const cfg = editRule.config || {}
                      const agentIds = cfg.agent_ids || []
                      const on = agentIds.includes(a.id)
                      return (
                        <button key={a.id} onClick={() => {
                          const ids = on ? agentIds.filter(x=>x!==a.id) : [...agentIds, a.id]
                          setEdit(r => ({ ...r, config: { ...r.config, agent_ids: ids } }))
                        }}
                          style={{ display:'flex', alignItems:'center', gap:'6px', padding:'5px 10px', borderRadius:'20px', border:`1px solid ${on?'#CC2200':'var(--border)'}`, background: on?'rgba(204,34,0,.1)':'var(--dim)', cursor:'pointer', fontFamily:ff, fontSize:'12px', fontWeight:600, color: on?'#CC2200':'var(--muted)' }}>
                          {on && '✓'} {a.name.split(' ')[0]}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <input type="number" value={editRule.priority||0} onChange={e => setEdit(r => ({ ...r, priority: parseInt(e.target.value)||0 }))}
                  style={{ width:64, padding:'6px 8px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff }} />
                <span style={{ fontSize:'12px', color:'var(--muted)' }}>Priority (lower = checked first)</span>
              </div>
            </div>
            <div style={{ padding:'12px 18px', borderTop:'1px solid var(--border)', display:'flex', gap:'8px', justifyContent:'flex-end' }}>
              <button onClick={() => setEdit(null)} style={{ padding:'8px 14px', borderRadius:'8px', border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', cursor:'pointer', fontFamily:ff }}>Cancel</button>
              <Btn onClick={() => save(editRule)} loading={saving}>Save Rule</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── VOICEMAIL INBOX ───────────────────────────────────────────
function VoicemailInbox({ agents }) {
  const { toast } = useApp()
  const [vms,    setVms]   = useState([])
  const [loading,setLoad]  = useState(true)

  useEffect(() => {
    supabase.from('voicemails').select('*, agents(id,name,color)').order('created_at', { ascending: false })
      .then(({ data }) => { setVms(data || []); setLoad(false) })
  }, [])

  async function markRead(id) {
    await supabase.from('voicemails').update({ is_read: true }).eq('id', id)
    setVms(prev => prev.map(v => v.id === id ? { ...v, is_read: true } : v))
  }

  async function deleteVM(id) {
    await supabase.from('voicemails').delete().eq('id', id)
    setVms(prev => prev.filter(v => v.id !== id))
    toast('Voicemail deleted')
  }

  const unread = vms.filter(v => !v.is_read).length

  if (loading) return <Loading />

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'16px' }}>
        <div>
          <div style={{ fontSize:'15px', fontWeight:800, color:'var(--text)' }}>
            Voicemail Inbox
            {unread > 0 && <span style={{ marginLeft:'8px', padding:'2px 8px', borderRadius:'12px', background:'#CC2200', color:'#fff', fontSize:'11px', fontWeight:800 }}>{unread}</span>}
          </div>
          <div style={{ fontSize:'12px', color:'var(--muted)' }}>{vms.length} total voicemails · {unread} unread</div>
        </div>
      </div>

      {vms.length === 0 ? (
        <Empty icon="📬" title="No voicemails" sub="Voicemails from Twilio will appear here automatically." />
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {vms.map(vm => (
            <div key={vm.id} style={{ background:'var(--panel)', borderRadius:'10px', border:`1px solid ${vm.is_read ? 'var(--border)' : '#3B82F6'}`, padding:'14px 16px', opacity: vm.is_read ? 0.8 : 1 }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:'10px' }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background: vm.is_read ? 'var(--dim)' : '#3B82F6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', flexShrink:0 }}>
                  📬
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'3px' }}>
                    <span style={{ fontSize:'13px', fontWeight:700, color:'var(--text)' }}>{vm.contact_name || vm.from_number || 'Unknown'}</span>
                    {!vm.is_read && <span style={{ fontSize:'10px', padding:'1px 6px', borderRadius:'10px', background:'#3B82F6', color:'#fff', fontWeight:700 }}>NEW</span>}
                    <span style={{ fontSize:'11px', color:'var(--muted)', marginLeft:'auto' }}>{fmtDate(vm.created_at)}</span>
                  </div>
                  {vm.from_number && <div style={{ fontSize:'11px', color:'var(--muted)', marginBottom:'4px' }}>{fmtPhone(vm.from_number)} · {fmtDuration(vm.duration_sec)}</div>}
                  {vm.transcript && (
                    <div style={{ fontSize:'12px', color:'var(--text)', background:'var(--dim)', padding:'8px 10px', borderRadius:'7px', border:'1px solid var(--border)', fontStyle:'italic', marginBottom:'8px', lineHeight:1.5 }}>
                      "{vm.transcript}"
                    </div>
                  )}
                  <RecordingPlayer url={vm.recording_url} />
                </div>
              </div>
              <div style={{ display:'flex', gap:'6px', marginTop:'10px', justifyContent:'flex-end' }}>
                {!vm.is_read && (
                  <button onClick={() => markRead(vm.id)}
                    style={{ padding:'5px 10px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--dim)', color:'var(--muted)', fontSize:'12px', cursor:'pointer', fontFamily:ff }}>
                    ✓ Mark read
                  </button>
                )}
                {vm.from_number && (
                  <a href={`tel:${vm.from_number.replace(/\D/g,'')}`}
                    style={{ padding:'5px 10px', borderRadius:'7px', border:'1px solid #10B98144', background:'#10B98118', color:'#10B981', fontSize:'12px', fontWeight:700, textDecoration:'none', fontFamily:ff }}>
                    📞 Call back
                  </a>
                )}
                <button onClick={() => deleteVM(vm.id)}
                  style={{ padding:'5px 10px', borderRadius:'7px', border:'1px solid #DC262644', background:'#FEF2F2', color:'#DC2626', fontSize:'12px', cursor:'pointer', fontFamily:ff }}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── CALL FLOW EMBED ──────────────────────────────────────────
// Inline version of the visual call flow builder inside the Phone System
function CallFlowEmbed({ agents }) {
  const { toast } = useApp()
  const navigate  = useNavigate()
  const [flows,   setFlows]   = useState([])
  const [loading, setLoading] = useState(true)
  const [active,  setActive]  = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('phone_ivr').select('*').order('created_at', { ascending: false })
    setFlows(data || [])
    setActive(data?.find(f => f.is_active)?.id || null)
    setLoading(false)
  }

  async function toggleActive(flow) {
    // Deactivate all, then activate this one
    await supabase.from('phone_ivr').update({ is_active: false }).neq('id', '00000000-0000-0000-0000-000000000000')
    if (!flow.is_active) {
      await supabase.from('phone_ivr').update({ is_active: true }).eq('id', flow.id)
      setActive(flow.id)
      toast('✅ Flow activated — now handling inbound calls')
    } else {
      setActive(null)
      toast('Flow deactivated')
    }
    load()
  }

  async function deleteFlow(id) {
    if (!window.confirm('Delete this flow?')) return
    await supabase.from('phone_ivr').delete().eq('id', id)
    load()
    toast('Flow deleted')
  }

  const FLOW_STEPS = [
    { icon: '📞', label: 'Inbound call received', color: '#10B981' },
    { icon: '👤', label: 'Check if caller is a known contact', color: '#3B82F6' },
    { icon: '✅', label: 'Match → route to their agent', color: '#10B981' },
    { icon: '🎛', label: 'No match → play IVR menu', color: '#8B5CF6' },
    { icon: '📱', label: 'Caller presses key → dial extension', color: '#CC2200' },
    { icon: '📬', label: 'No answer → voicemail', color: '#F5A623' },
  ]

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:15, fontWeight:800, color:'var(--text)' }}>Call Flow Manager</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>Design how inbound calls are handled step by step</div>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button onClick={() => navigate('/call-flow')}
            style={{ padding:'8px 14px', borderRadius:8, border:'none', background:'#CC2200', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
            🔀 Open Visual Builder
          </button>
        </div>
      </div>

      {/* Current flow diagram */}
      <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:16, marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:12 }}>Current Call Flow Logic</div>
        <div style={{ display:'flex', alignItems:'center', gap:0, flexWrap:'wrap', rowGap:8 }}>
          {FLOW_STEPS.map((step, i) => (
            <React.Fragment key={i}>
              <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 12px', borderRadius:8, background:step.color+'15', border:`1px solid ${step.color}44` }}>
                <span style={{ fontSize:16 }}>{step.icon}</span>
                <span style={{ fontSize:11, fontWeight:700, color:step.color, whiteSpace:'nowrap' }}>{step.label}</span>
              </div>
              {i < FLOW_STEPS.length - 1 && (
                <div style={{ padding:'0 4px', color:'var(--muted)', fontSize:14, fontWeight:700 }}>→</div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Saved flows */}
      <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:10 }}>Saved Flows</div>
      {loading ? <Loading /> : flows.length === 0 ? (
        <Empty icon="🔀" title="No flows saved yet"
          sub="Open the Visual Builder to create your first call flow"
          action={<button onClick={() => navigate('/call-flow')} style={{ padding:'8px 14px', borderRadius:8, border:'none', background:'#CC2200', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff }}>Open Builder</button>} />
      ) : (
        flows.map(flow => (
          <div key={flow.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'var(--panel)', borderRadius:10, border:`1px solid ${flow.is_active ? '#10B981' : 'var(--border)'}`, marginBottom:8 }}>
            <div style={{ width:10, height:10, borderRadius:'50%', background: flow.is_active ? '#10B981' : 'var(--dim)', border:`2px solid ${flow.is_active ? '#10B981' : 'var(--border)'}`, flexShrink:0 }} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>{flow.name || 'Unnamed Flow'}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
                {flow.menu_options?.length || 0} menu options · {flow.flow_nodes?.length || 0} nodes
                {flow.is_active && <span style={{ marginLeft:8, color:'#10B981', fontWeight:700 }}>● ACTIVE</span>}
              </div>
            </div>
            <button onClick={() => toggleActive(flow)}
              style={{ padding:'5px 12px', borderRadius:7, border:`1px solid ${flow.is_active ? '#10B981' : 'var(--border)'}`, background: flow.is_active ? '#10B98118' : 'transparent', color: flow.is_active ? '#10B981' : 'var(--muted)', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
              {flow.is_active ? '✅ Active' : 'Activate'}
            </button>
            <button onClick={() => navigate('/call-flow')}
              style={{ padding:'5px 10px', borderRadius:7, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:ff }}>
              ✏️ Edit
            </button>
            <button onClick={() => deleteFlow(flow.id)}
              style={{ padding:'5px 10px', borderRadius:7, border:'1px solid #DC262444', background:'#FEF2F2', color:'#DC2626', fontSize:12, cursor:'pointer', fontFamily:ff }}>
              🗑
            </button>
          </div>
        ))
      )}
    </div>
  )
}

// ── TWILIO SETTINGS ───────────────────────────────────────────
function TwilioSettings() {
  const { toast } = useApp()
  const [cfg, setCfg] = useState({ account_sid:'', auth_token:'', phone_number:'', webhook_base: window.location.origin })
  const [saved, setSaved] = useState(false)

  function copyWebhook(path) {
    navigator.clipboard.writeText(cfg.webhook_base + path)
    toast('✅ Copied to clipboard')
  }

  const WEBHOOKS = [
    { path:'/api/twilio-inbound',   label:'Inbound Call Webhook',    desc:'Set as the "A call comes in" webhook on your Twilio phone number' },
    { path:'/api/twilio-status',    label:'Call Status Callback',     desc:'Set as the "Call status changes" callback on your Twilio number' },
    { path:'/api/twilio-recording', label:'Recording Status Callback',desc:'Set in your Twilio Recording settings' },
    { path:'/api/twilio-voicemail', label:'Voicemail Transcription',  desc:'Automatically called when a voicemail transcription is ready' },
  ]

  return (
    <div style={{ maxWidth:'640px' }}>
      <div style={{ fontSize:'15px', fontWeight:800, color:'var(--text)', marginBottom:'4px' }}>Twilio Connection</div>
      <div style={{ fontSize:'12px', color:'var(--muted)', marginBottom:'20px' }}>
        Connect your Twilio account to activate inbound call routing, call recording, and voicemail. Everything above is already built and ready — just plug in your credentials.
      </div>

      {/* Connection status */}
      <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'12px 16px', background:'var(--dim)', borderRadius:'10px', border:'1px solid var(--border)', marginBottom:'20px' }}>
        <div style={{ width:10, height:10, borderRadius:'50%', background:'#F5A623', flexShrink:0 }} />
        <div>
          <div style={{ fontSize:'13px', fontWeight:700, color:'var(--text)' }}>Not connected</div>
          <div style={{ fontSize:'11px', color:'var(--muted)' }}>Add your Twilio credentials in Vercel environment variables to activate</div>
        </div>
      </div>

      {/* Environment variables guide */}
      <div style={{ background:'var(--panel)', borderRadius:'12px', border:'1px solid var(--border)', padding:'16px', marginBottom:'16px' }}>
        <div style={{ fontSize:'13px', fontWeight:700, color:'var(--text)', marginBottom:'10px' }}>Step 1 — Add to Vercel Environment Variables</div>
        {[
          { key:'TWILIO_ACCOUNT_SID',   desc:'Your Twilio Account SID (starts with AC...)' },
          { key:'TWILIO_AUTH_TOKEN',     desc:'Your Twilio Auth Token' },
          { key:'TWILIO_PHONE_NUMBER',   desc:'Your Twilio phone number in E.164 format (e.g. +18455551234)' },
        ].map(v => (
          <div key={v.key} style={{ padding:'8px 12px', background:'var(--dim)', borderRadius:'8px', border:'1px solid var(--border)', marginBottom:'6px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:'10px' }}>
            <div>
              <div style={{ fontSize:'12px', fontWeight:800, color:'#CC2200', fontFamily:'monospace' }}>{v.key}</div>
              <div style={{ fontSize:'11px', color:'var(--muted)' }}>{v.desc}</div>
            </div>
            <button onClick={() => { navigator.clipboard.writeText(v.key); toast('Copied') }}
              style={{ padding:'3px 8px', borderRadius:'5px', border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', fontSize:'11px', cursor:'pointer', fontFamily:ff }}>
              Copy
            </button>
          </div>
        ))}
      </div>

      {/* Webhook URLs */}
      <div style={{ background:'var(--panel)', borderRadius:'12px', border:'1px solid var(--border)', padding:'16px', marginBottom:'16px' }}>
        <div style={{ fontSize:'13px', fontWeight:700, color:'var(--text)', marginBottom:'4px' }}>Step 2 — Configure Twilio Webhooks</div>
        <div style={{ fontSize:'12px', color:'var(--muted)', marginBottom:'12px' }}>Go to your Twilio Console → Phone Numbers → your number → set these URLs</div>
        {WEBHOOKS.map(w => (
          <div key={w.path} style={{ padding:'10px 12px', background:'var(--dim)', borderRadius:'8px', border:'1px solid var(--border)', marginBottom:'6px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'3px' }}>
              <span style={{ fontSize:'12px', fontWeight:700, color:'var(--text)' }}>{w.label}</span>
              <button onClick={() => copyWebhook(w.path)}
                style={{ padding:'3px 8px', borderRadius:'5px', border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', fontSize:'11px', cursor:'pointer', fontFamily:ff }}>
                Copy URL
              </button>
            </div>
            <div style={{ fontSize:'11px', fontFamily:'monospace', color:'#CC2200', marginBottom:'2px', wordBreak:'break-all' }}>
              {cfg.webhook_base}{w.path}
            </div>
            <div style={{ fontSize:'11px', color:'var(--muted)' }}>{w.desc}</div>
          </div>
        ))}
      </div>

      {/* What's pre-built */}
      <div style={{ background:'var(--dim)', borderRadius:'12px', border:'1px solid var(--border)', padding:'16px' }}>
        <div style={{ fontSize:'13px', fontWeight:700, color:'var(--text)', marginBottom:'10px' }}>✅ What's Already Built and Ready</div>
        {[
          'Inbound call received → match to contact → route to assigned agent',
          'No contact match → play IVR menu → caller presses key → route to extension',
          'Round-robin distribution across agents when no match',
          'All calls logged automatically with duration, direction, outcome',
          'Call recordings saved and playable in the Call Log',
          'Voicemails saved with transcript (when Twilio transcription is on)',
          'Contact match: if caller number is known, route to their assigned agent directly',
        ].map((item, i) => (
          <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:'8px', marginBottom:'6px' }}>
            <span style={{ color:'#10B981', flexShrink:0, marginTop:'1px' }}>✓</span>
            <span style={{ fontSize:'12px', color:'var(--muted)' }}>{item}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════
export function Calls() {
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()
  const { agents } = useAgents()

  const [tab,        setTab]       = useState('log')
  const [calls,      setCalls]     = useState([])
  const [loading,    setLoading]   = useState(true)
  const [search,     setSearch]    = useState('')
  const [dirFilter,  setDirFilter] = useState('')
  const [outFilter,  setOutFilter] = useState('')
  const [selected,   setSelected]  = useState(null)
  const [saving,     setSaving]    = useState(false)
  const [confirmDel, setConfirmDel]= useState(false)
  const [showAdd,    setShowAdd]   = useState(false)
  const [form,       setForm]      = useState({})
  const [vmUnread,   setVmUnread]  = useState(0)

  useEffect(() => { loadCalls() }, [])

  useEffect(() => {
    supabase.from('voicemails').select('id').eq('is_read', false)
      .then(({ data }) => setVmUnread(data?.length || 0))
  }, [tab])

  async function loadCalls() {
    setLoading(true)
    let q = supabase.from('calls').select('*, agents(id,name,color)').order('called_at', { ascending: false }).limit(200)
    if (!isAdmin && !canManage) q = q.eq('agent_id', agent?.id)
    const { data } = await q
    setCalls(data || [])
    setLoading(false)
  }

  async function saveCall(form) {
    setSaving(true)
    try {
      if (form.id) {
        const { data } = await supabase.from('calls').update({ ...form, updated_at: new Date().toISOString() }).eq('id', form.id).select('*, agents(id,name,color)').single()
        setCalls(prev => prev.map(c => c.id === form.id ? data : c))
        setSelected(data)
        toast('✅ Call saved')
      } else {
        const { data } = await supabase.from('calls').insert({ ...form, agent_id: form.agent_id || agent?.id, called_at: new Date().toISOString() }).select('*, agents(id,name,color)').single()
        setCalls(prev => [data, ...prev])
        setShowAdd(false)
        toast('✅ Call logged')
      }
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  async function deleteCall() {
    if (!selected) return
    await supabase.from('calls').delete().eq('id', selected.id)
    setCalls(prev => prev.filter(c => c.id !== selected.id))
    setSelected(null)
    setConfirmDel(false)
    toast('Call deleted')
  }

  const filtered = calls.filter(c => {
    if (search && !c.contact_name?.toLowerCase().includes(search.toLowerCase()) && !c.from_number?.includes(search) && !c.notes?.toLowerCase().includes(search.toLowerCase())) return false
    if (dirFilter && c.direction !== dirFilter) return false
    if (outFilter && c.outcome !== outFilter)   return false
    return true
  })

  // Stats
  const todayCalls   = calls.filter(c => c.called_at?.slice(0,10) === new Date().toISOString().slice(0,10))
  const connected    = calls.filter(c => c.outcome === 'Connected').length
  const hotLeads     = calls.filter(c => c.outcome === 'Hot Lead').length
  const voicemails   = calls.filter(c => c.is_voicemail).length

  return (
    <div style={{ fontFamily:ff }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'16px', flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:'22px', fontWeight:800, color:'var(--text)' }}>📞 Phone System</div>
          <div style={{ fontSize:'12px', color:'var(--muted)', marginTop:'2px' }}>
            {calls.length} calls · {connected} connected · {hotLeads} hot leads · {voicemails} voicemails
          </div>
        </div>
        {tab === 'log' && <Btn style={{ marginLeft:'auto' }} onClick={() => { setForm({ direction:'Outbound', agent_id: agent?.id }); setShowAdd(true) }}>+ Log Call</Btn>}
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', borderBottom:'2px solid var(--border)', marginBottom:'20px', overflowX:'auto', gap:'0' }}>
        {TABS_MAIN.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding:'9px 16px', border:'none', background:'none', cursor:'pointer', borderBottom: tab===t.id ? '2px solid #CC2200' : '2px solid transparent', marginBottom:'-2px', fontSize:'13px', fontWeight: tab===t.id ? 700 : 500, color: tab===t.id ? '#CC2200' : 'var(--muted)', fontFamily:ff, whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:'6px' }}>
            {t.label}
            {t.id === 'voicemail' && vmUnread > 0 && (
              <span style={{ width:16, height:16, borderRadius:'50%', background:'#CC2200', color:'#fff', fontSize:'9px', fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center' }}>{vmUnread}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── CALL LOG TAB ── */}
      {tab === 'log' && (
        <div>
          {/* Stats row */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'8px', marginBottom:'16px' }}>
            {[
              { label:'Today',      value: todayCalls.length, color:'#3B82F6' },
              { label:'Connected',  value: connected,          color:'#10B981' },
              { label:'Hot Leads',  value: hotLeads,           color:'#CC2200' },
              { label:'Voicemails', value: voicemails,         color:'#F5A623' },
            ].map(s => (
              <div key={s.label} style={{ background:'var(--panel)', borderRadius:'9px', border:'1px solid var(--border)', padding:'10px 12px', borderLeft:`3px solid ${s.color}` }}>
                <div style={{ fontSize:'22px', fontWeight:900, color:'var(--text)' }}>{s.value}</div>
                <div style={{ fontSize:'10px', color:'var(--muted)', marginTop:'1px', fontWeight:600 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div style={{ display:'flex', gap:'8px', marginBottom:'14px', flexWrap:'wrap' }}>
            <FilterBar
              values={{ search, dirFilter, outFilter }}
              onChange={(k,v) => { if(k==='search') setSearch(v); if(k==='dirFilter') setDirFilter(v); if(k==='outFilter') setOutFilter(v) }}
              total={calls.length} filtered={filtered.length}
              extraLeft={<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Name, phone, notes..."
                style={{ padding:'4px 8px', borderRadius:6, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:11, fontFamily:ff, height:28, minWidth:160 }}/>}
              filters={[
                { key:'dirFilter', label:'Direction', type:'select', options:DIRECTIONS.map(d=>({value:d,label:d})), placeholder:'Direction', primary:true },
                { key:'outFilter', label:'Outcome',   type:'select', options:OUTCOMES.map(o=>({value:o,label:o})),   placeholder:'Outcome',   primary:true },
              ]}
            />
          </div>

          {loading ? <Loading /> : filtered.length === 0 ? (
            <Empty icon="📞" title="No calls logged" sub="Calls from Twilio will appear here automatically. You can also log calls manually." />
          ) : (
            <div style={{ background:'var(--panel)', borderRadius:'12px', border:'1px solid var(--border)', overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'var(--dim)', borderBottom:'2px solid var(--border)' }}>
                    {['Contact','Phone','Dir.','Outcome','Ext.','Duration','Agent','Recording','Date'].map(h => (
                      <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:'10px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => {
                    const callAgent = agents.find(a => a.id === c.agent_id) || c.agents
                    return (
                      <tr key={c.id} onClick={() => setSelected(c)}
                        style={{ borderBottom:'1px solid var(--border)', cursor:'pointer', transition:'background .1s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--hov)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}>
                        <td style={{ padding:'10px 12px', fontWeight:700, fontSize:'13px', color:'var(--text)', whiteSpace:'nowrap' }}>
                          {c.contact_name || '—'}
                          {c.is_voicemail && <span style={{ marginLeft:'6px', fontSize:'10px', color:'#F5A623' }}>📬</span>}
                        </td>
                        <td style={{ padding:'10px 12px', fontSize:'12px', color:'var(--muted)' }}>{c.from_number ? fmtPhone(c.from_number) : '—'}</td>
                        <td style={{ padding:'10px 12px' }}>{c.direction ? <Badge label={c.direction} color={directionColor(c.direction)} /> : '—'}</td>
                        <td style={{ padding:'10px 12px' }}>{c.outcome ? <Badge label={c.outcome} color={outcomeColor(c.outcome)} /> : '—'}</td>
                        <td style={{ padding:'10px 12px', fontSize:'12px', color:'var(--muted)', fontFamily:'monospace' }}>{c.extension || '—'}</td>
                        <td style={{ padding:'10px 12px', fontSize:'12px', color:'var(--muted)', whiteSpace:'nowrap' }}>{fmtDuration(c.duration_sec)}</td>
                        <td style={{ padding:'10px 12px' }}>
                          {callAgent ? (
                            <div style={{ display:'flex', alignItems:'center', gap:'5px' }}>
                              <div style={{ width:20, height:20, borderRadius:'50%', background:callAgent.color||'#CC2200', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'8px', fontWeight:800, color:'#fff' }}>
                                {callAgent.name?.split(' ').map(n=>n[0]).join('').slice(0,2)}
                              </div>
                              <span style={{ fontSize:'11px', color:'var(--muted)' }}>{callAgent.name?.split(' ')[0]}</span>
                            </div>
                          ) : '—'}
                        </td>
                        <td style={{ padding:'10px 12px' }}>
                          {c.recording_url ? <span style={{ fontSize:'11px', color:'#3B82F6', fontWeight:700 }}>🎙 Play</span> : '—'}
                        </td>
                        <td style={{ padding:'10px 12px', fontSize:'11px', color:'var(--muted)', whiteSpace:'nowrap' }}>{fmtDate(c.called_at)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'voicemail'  && <VoicemailInbox agents={agents} />}
      {tab === 'extensions' && <ExtensionManager agents={agents} />}
      {tab === 'ivr'        && <IVRBuilder agents={agents} />}
      {tab === 'routing'    && <RoutingRules agents={agents} />}
      {tab === 'flow'       && <CallFlowEmbed agents={agents} />}
      {tab === 'settings'   && <TwilioSettings />}

      {/* Call Detail Drawer */}
      {selected && (
        <CallDrawer
          call={selected}
          agents={agents}
          saving={saving}
          onSave={saveCall}
          onClose={() => setSelected(null)}
          onDelete={() => setConfirmDel(true)}
        />
      )}

      {/* Quick Log Call Modal */}
      {showAdd && (
        <div onClick={e => e.target===e.currentTarget && setShowAdd(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', fontFamily:ff }}>
          <div style={{ background:'var(--panel)', borderRadius:'14px', width:'100%', maxWidth:'440px', boxShadow:'0 20px 50px rgba(0,0,0,.3)' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontSize:'15px', fontWeight:800, color:'var(--text)' }}>Log Call</div>
            <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:'10px' }}>
              {[
                { k:'contact_name', label:'Contact Name', placeholder:'John Smith' },
                { k:'from_number',  label:'Phone',        placeholder:'(845) 555-1234', type:'tel' },
              ].map(f => (
                <div key={f.k}>
                  <div style={{ fontSize:'10px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'4px' }}>{f.label}</div>
                  <input type={f.type||'text'} value={form[f.k]||''} onChange={e => setForm(x => ({ ...x, [f.k]: e.target.value }))} placeholder={f.placeholder}
                    style={{ width:'100%', padding:'8px 10px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff, boxSizing:'border-box' }} />
                </div>
              ))}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                {['direction','outcome'].map(k => (
                  <div key={k}>
                    <div style={{ fontSize:'10px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'4px' }}>{k.charAt(0).toUpperCase()+k.slice(1)}</div>
                    <select value={form[k]||''} onChange={e => setForm(x => ({ ...x, [k]: e.target.value }))}
                      style={{ width:'100%', padding:'8px 10px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff }}>
                      <option value="">—</option>
                      {(k==='direction'?DIRECTIONS:OUTCOMES).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize:'10px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'4px' }}>Notes</div>
                <textarea value={form.notes||''} onChange={e => setForm(x => ({ ...x, notes: e.target.value }))} placeholder="What was discussed?" rows={2}
                  style={{ width:'100%', padding:'8px 10px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff, resize:'vertical', boxSizing:'border-box' }} />
              </div>
            </div>
            <div style={{ padding:'12px 18px', borderTop:'1px solid var(--border)', display:'flex', gap:'8px', justifyContent:'flex-end' }}>
              <button onClick={() => setShowAdd(false)} style={{ padding:'8px 14px', borderRadius:'8px', border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', cursor:'pointer', fontFamily:ff }}>Cancel</button>
              <Btn onClick={() => saveCall(form)} loading={saving}>Log Call</Btn>
            </div>
          </div>
        </div>
      )}

      <Confirm open={confirmDel} message="Delete this call log?" onConfirm={deleteCall} onCancel={() => setConfirmDel(false)} />
    </div>
  )
}
