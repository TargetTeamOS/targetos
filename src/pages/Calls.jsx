// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Phone System
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { CallJourney as CallSelectionsTimeline } from '../components/CallJourney'
import { fmtDate, fmtPhone } from '../lib/utils'
import { Btn, Loading, Empty, Confirm, Avatar } from '../components/UI'
import { usePageView, LastVisited } from '../components/PageViewTracking'
import { FilterBar } from '../components/FilterBar'
import { useAgents } from '../lib/hooks'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const DIRECTIONS = ['Inbound','Outbound']
const OUTCOMES   = ['Connected','No Answer','Voicemail','Callback Requested','Hot Lead','Appointment Set','Not Interested','Wrong Number']
const RULE_TYPES = [
  { id: 'round_robin',   label: 'Round Robin',     icon: '🔄', desc: 'Distribute calls evenly across all available agents' },
  { id: 'contact_match', label: 'Contact Match',    icon: '👤', desc: 'Route to the assigned agent if caller is a known contact' },
  { id: 'schedule',      label: 'Schedule-Based',   icon: '🕐', desc: 'Different routing during business hours vs after hours' },
  { id: 'direct',        label: 'Direct Extension', icon: '📱', desc: 'Always route to a specific extension' },
]

const TABS_MAIN = [
  { id: 'log',        label: '📋 Call Log' },
  { id: 'voicemail',  label: '📬 Voicemail' },
  { id: 'extensions', label: '📞 Extensions' },
  { id: 'ivr',        label: '🎛 IVR Menu' },
  { id: 'flow',       label: '🔀 Call Flows' },
  { id: 'listings',   label: '🏡 Listings Search' },
  { id: 'routing',    label: '⚙️ Routing Rules' },
  { id: 'settings',   label: '🔌 Twilio Setup' },
]

// ── HELPERS ──────────────────────────────────────────────────
function fmtDuration(sec) {
  if (!sec) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? (m + 'm ' + s + 's') : (s + 's')
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
    <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:'20px', background:color+'22', color, fontSize:'10px', fontWeight:700, border:'1px solid ' + color + '33', whiteSpace:'nowrap' }}>
      {label}
    </span>
  )
}

// ── RECORDING PLAYER ─────────────────────────────────────────
function RecordingPlayer({ callId, voicemailId }) {
  const [state,   setState]   = useState('idle') // idle | loading | ready | error
  const [playing, setPlaying] = useState(false)
  const audio    = useRef(null)
  const blobUrl  = useRef(null)

  if (!callId && !voicemailId) return null

  const proxyUrl = '/api/twilio-recording-proxy?' + (callId ? 'callId=' + callId : 'voicemailId=' + voicemailId)

  async function fetchRecording() {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(proxyUrl, {
      headers: session?.access_token ? { Authorization: 'Bearer ' + session.access_token } : {},
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || 'Failed to load recording')
    }
    return URL.createObjectURL(await res.blob())
  }

  async function togglePlay() {
    if (state === 'ready' && audio.current) {
      if (playing) { audio.current.pause(); setPlaying(false) }
      else { audio.current.play(); setPlaying(true) }
      return
    }
    setState('loading')
    try {
      const url = await fetchRecording()
      blobUrl.current = url
      audio.current = new Audio(url)
      audio.current.onended = () => setPlaying(false)
      await audio.current.play()
      setPlaying(true)
      setState('ready')
    } catch(e) {
      setState('error')
    }
  }

  async function download() {
    try {
      const url = await fetchRecording()
      const a = document.createElement('a')
      a.href = url; a.download = 'recording.mp3'; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch(e) { /* silent */ }
  }

  return (
    <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 10px', background:'var(--dim)', borderRadius:'8px', border:'1px solid var(--border)', marginTop:'8px' }}>
      <button onClick={togglePlay} disabled={state === 'loading'}
        style={{ width:28, height:28, borderRadius:'50%', border:'none', background:'#CC2200', color:'#fff', cursor: state === 'loading' ? 'wait' : 'pointer', fontSize:'12px', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        {state === 'loading' ? '⏳' : playing ? '⏸' : '▶'}
      </button>
      <span style={{ fontSize:'12px', color: state === 'error' ? '#DC2626' : 'var(--muted)', flex:1 }}>
        {state === 'error' ? 'Could not load recording' : 'Recording'}
      </span>
      <button onClick={download}
        style={{ fontSize:'11px', color:'var(--brand)', background:'none', border:'none', cursor:'pointer', fontFamily:ff, padding:0 }}>⬇ Download</button>
    </div>
  )
}

// ── CALL DETAIL DRAWER ───────────────────────────────────────
// Shows exactly what happened during a call -- every menu choice,
// search selection, and routing decision the phone system made,
// in plain English. This is what actually answers "what did the
// caller select, and why did it route where it did" without needing
// to ask a developer or check server logs.



function CallDrawer({ call, agents, onSave, onClose, onDelete, saving }) {
  const [form, setForm] = useState({ ...call })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const Lbl = ({ c }) => (
    <div style={{ fontSize:'10px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'4px' }}>{c}</div>
  )
  const Inp = ({ k, type='text', placeholder }) => (
    <input type={type} value={form[k]??''} onChange={e => set(k, e.target.value)} placeholder={placeholder}
      style={{ width:'100%', padding:'7px 9px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff, boxSizing:'border-box' }} />
  )
  const Sel = ({ k, options }) => (
    <select value={form[k]??''} onChange={e => set(k, e.target.value)}
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
          {call.twilio_call_sid && (
            <div style={{ padding:'8px 12px', background:'var(--dim)', borderRadius:'8px', border:'1px solid var(--border)', fontSize:'11px', color:'var(--muted)' }}>
              <span style={{ fontWeight:700 }}>Call SID:</span> {call.twilio_call_sid}
              {call.from_number && <span> · <span style={{ fontWeight:700 }}>From:</span> {call.from_number}</span>}
              {call.to_number   && <span> · <span style={{ fontWeight:700 }}>To:</span> {call.to_number}</span>}
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
            <div><Lbl c="Contact Name" /><Inp k="contact_name" placeholder="John Smith" /></div>
            <div><Lbl c="Phone" /><Inp k="from_number" type="tel" placeholder="(845) 555-1234" /></div>
            <div><Lbl c="Direction" /><Sel k="direction" options={DIRECTIONS} /></div>
            <div><Lbl c="Outcome" /><Sel k="outcome" options={OUTCOMES} /></div>
            <div><Lbl c="Extension" /><Inp k="extension" placeholder="101" /></div>
            <div><Lbl c="Duration (sec)" /><Inp k="duration_sec" type="number" placeholder="0" /></div>
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

          {call.recording_url && (
            <div>
              <Lbl c="Call Recording" />
              <RecordingPlayer callId={call.id} />
              {call.transcript && (
                <div style={{ marginTop:6, fontSize:12, color:'var(--text)', fontStyle:'italic', lineHeight:1.5, background:'var(--dim)', padding:'8px 10px', borderRadius:7 }}>
                  <strong>Transcript{call.transcript_language ? ' (' + call.transcript_language[0].toUpperCase() + call.transcript_language.slice(1) + ')' : ''}:</strong> {call.transcript}
                </div>
              )}
            </div>
          )}
          {!call.recording_url && call.has_recording && (
            <div style={{ padding:'10px 12px', background:'var(--dim)', borderRadius:'8px', border:'1px dashed var(--border)', display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:13 }}>🔒</span>
              <span style={{ fontSize:11, color:'var(--muted)' }}>Recording available — restricted to admin/approved users</span>
            </div>
          )}

          {call.is_voicemail && (
            <div style={{ padding:'12px', background:'#FFF7ED', borderRadius:'9px', border:'1px solid #F5A623' }}>
              <div style={{ fontSize:'12px', fontWeight:700, color:'#F5A623', marginBottom:'6px' }}>📬 Voicemail</div>
              {(call.transcript || call.voicemail_transcript) && (
                <div style={{ fontSize:'13px', color:'#92400E', lineHeight:1.5, marginBottom:'8px' }}>
                  {call.transcript_language && <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', marginBottom:2 }}>{call.transcript_language}</div>}
                  "{call.transcript || call.voicemail_transcript}"
                </div>
              )}
              <RecordingPlayer callId={call.id} />
            </div>
          )}

          <CallSelectionsTimeline callSid={call.twilio_call_sid} />
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

// ── EXTENSION MANAGER ────────────────────────────────────────
function ExtensionManager({ agents }) {
  const { toast } = useApp()
  const [extensions, setExtensions] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [editExt,    setEditExt]    = useState(null)
  const [saving,     setSaving]     = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const { data } = await supabase.from('phone_extensions').select('*, agents(id,name,color)').order('order_index')
      setExtensions(data || [])
    } catch(e) { console.warn('phone_extensions:', e.message); setExtensions([]) }
    finally { setLoading(false) }
  }

  async function save(form) {
    setSaving(true)
    try {
      if (form.id) {
        const { agents: _ea, ...cleanExt } = form
        const { error } = await supabase.from('phone_extensions').update(cleanExt).eq('id', form.id)
        if (error) throw error
      } else {
        const { id: _eid, agents: _ea2, ...cleanExtIns } = form
        const { error } = await supabase.from('phone_extensions').insert(cleanExtIns)
        if (error) throw error
      }
      await load()
      setEditExt(null)
      toast('✅ Extension saved')
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  async function toggleActive(ext) {
    try {
      const { error } = await supabase.from('phone_extensions').update({ active: !ext.active }).eq('id', ext.id)
      if (error) throw error
      setExtensions(prev => prev.map(e => e.id === ext.id ? { ...e, active: !e.active } : e))
    } catch(e) { toast('Failed to update: ' + e.message, '#DC2626') }
  }

  async function remove(id) {
    try {
      const { error } = await supabase.from('phone_extensions').delete().eq('id', id)
      if (error) throw error
      setExtensions(prev => prev.filter(e => e.id !== id))
      toast('Extension deleted')
    } catch(e) { toast('Failed to delete: ' + e.message, '#DC2626') }
  }

  const BLANK_EXT = { number:'', label:'', agent_id:'', forward_to:'', active:true, voicemail_greeting:'', order_index: extensions.length }

  const Lbl = ({ c }) => <div style={{ fontSize:'10px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'4px' }}>{c}</div>

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'16px' }}>
        <div>
          <div style={{ fontSize:'15px', fontWeight:800, color:'var(--text)' }}>Extension Directory</div>
          <div style={{ fontSize:'12px', color:'var(--muted)' }}>Each extension forwards to an agent's cell.</div>
        </div>
        <Btn style={{ marginLeft:'auto' }} onClick={() => setEditExt({ ...BLANK_EXT })}>+ Add Extension</Btn>
      </div>

      {loading ? <Loading /> : extensions.length === 0 ? (
        <Empty icon="📞" title="No extensions yet" sub="Add your first extension to start routing calls."
          action={<Btn onClick={() => setEditExt({ ...BLANK_EXT })}>+ Add Extension</Btn>} />
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {extensions.map(ext => {
            const ag = agents.find(a => a.id === ext.agent_id) || ext.agents
            const activeColor = ext.active ? '#10B981' : 'var(--border)'
            const activeBg    = ext.active ? '#10B98118' : 'transparent'
            const activeText  = ext.active ? '#10B981' : 'var(--muted)'
            return (
              <div key={ext.id} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 16px', background:'var(--panel)', borderRadius:'10px', border:'1px solid var(--border)', opacity: ext.active ? 1 : 0.5 }}>
                <div style={{ width:44, height:44, borderRadius:'10px', background: ext.active ? '#CC2200' : 'var(--dim)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', fontWeight:900, color: ext.active ? '#fff' : 'var(--muted)', flexShrink:0 }}>
                  {ext.number}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'14px', fontWeight:700, color:'var(--text)' }}>{ext.label}</div>
                  <div style={{ fontSize:'12px', color:'var(--muted)', marginTop:'2px' }}>
                    {ag && <span style={{ marginRight:'8px' }}>👤 {ag.name}</span>}
                    {ext.forward_to && <span>→ {fmtPhone(ext.forward_to)}</span>}
                  </div>
                </div>
                <div style={{ display:'flex', gap:'6px', alignItems:'center', flexShrink:0 }}>
                  <button onClick={() => toggleActive(ext)}
                    style={{ padding:'4px 10px', borderRadius:'6px', border:'1px solid ' + activeColor, background: activeBg, color: activeText, fontSize:'11px', fontWeight:700, cursor:'pointer', fontFamily:ff }}>
                    {ext.active ? 'Active' : 'Inactive'}
                  </button>
                  <button onClick={() => setEditExt(ext)}
                    style={{ padding:'5px 10px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--dim)', color:'var(--muted)', fontSize:'12px', cursor:'pointer', fontFamily:ff }}>
                    ✏️ Edit
                  </button>
                  <button onClick={() => remove(ext.id)}
                    style={{ padding:'5px 10px', borderRadius:'7px', border:'1px solid #DC262444', background:'#FEF2F2', color:'#DC2626', fontSize:'12px', cursor:'pointer', fontFamily:ff }}>
                    🗑
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editExt !== null && (
        <div onClick={e => e.target===e.currentTarget && setEditExt(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', fontFamily:ff }}>
          <div style={{ background:'var(--panel)', borderRadius:'14px', width:'100%', maxWidth:'460px', boxShadow:'0 20px 50px rgba(0,0,0,.3)' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontSize:'15px', fontWeight:800, color:'var(--text)' }}>
              {editExt.id ? 'Edit Extension' : 'New Extension'}
            </div>
            <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:'12px' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                <div>
                  <Lbl c="Extension #" />
                  <input value={editExt.number||''} onChange={e => setEditExt(x => ({ ...x, number: e.target.value }))} placeholder="101"
                    style={{ width:'100%', padding:'7px 9px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff, boxSizing:'border-box' }} />
                </div>
                <div>
                  <Lbl c="Label" />
                  <input value={editExt.label||''} onChange={e => setEditExt(x => ({ ...x, label: e.target.value }))} placeholder="Sales Desk"
                    style={{ width:'100%', padding:'7px 9px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff, boxSizing:'border-box' }} />
                </div>
              </div>
              <div>
                <Lbl c="Assigned Agent" />
                <select value={editExt.agent_id||''} onChange={e => setEditExt(x => ({ ...x, agent_id: e.target.value }))}
                  style={{ width:'100%', padding:'7px 9px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff }}>
                  <option value="">— No agent —</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <Lbl c="Forward to Cell #" />
                <input type="tel" value={editExt.forward_to||''} onChange={e => setEditExt(x => ({ ...x, forward_to: e.target.value }))} placeholder="+18455551234"
                  style={{ width:'100%', padding:'7px 9px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff, boxSizing:'border-box' }} />
              </div>
              <div>
                <Lbl c="Voicemail Greeting (spoken by TTS)" />
                <textarea value={editExt.voicemail_greeting||''} onChange={e => setEditExt(x => ({ ...x, voicemail_greeting: e.target.value }))}
                  placeholder="Hi, you've reached Target Team. Please leave a message."
                  rows={3} style={{ width:'100%', padding:'8px 10px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff, resize:'vertical', boxSizing:'border-box' }} />
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <input type="checkbox" checked={!!editExt.active} onChange={e => setEditExt(x => ({ ...x, active: e.target.checked }))} id="ext-active" />
                <label htmlFor="ext-active" style={{ fontSize:'13px', color:'var(--text)', cursor:'pointer' }}>Extension is active</label>
              </div>
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

// ── IVR BUILDER ──────────────────────────────────────────────
// ── LISTINGS SEARCH SETTINGS ────────────────────────────────────
function ListingsSearchSettings() {
  const { toast } = useApp()
  const [settings, setSettings] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    supabase.from('listings_ivr_settings').select('*').eq('id', 1).maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          toast('Could not load settings: ' + error.message + ' — run listings_ivr_settings.sql in Supabase', '#DC2626')
          setSettings({ intro_text: '', price_ranges: [] })
        } else if (!data) {
          toast('Settings row not found — run listings_ivr_settings.sql in Supabase', '#F5A623')
          setSettings({ intro_text: '', price_ranges: [] })
        } else {
          setSettings(data)
        }
        setLoading(false)
      })
      .catch(e => {
        toast('Could not load settings: ' + e.message, '#DC2626')
        setSettings({ intro_text: '', price_ranges: [] })
        setLoading(false)
      })
  }, [])

  function setRange(i, key, value) {
    setSettings(s => ({ ...s, price_ranges: s.price_ranges.map((r, idx) => idx === i ? { ...r, [key]: value } : r) }))
  }
  function addRange() {
    setSettings(s => ({ ...s, price_ranges: [...(s.price_ranges||[]), { min:0, max:0, label:'' }] }))
  }
  function removeRange(i) {
    setSettings(s => ({ ...s, price_ranges: s.price_ranges.filter((_, idx) => idx !== i) }))
  }

  function setArea(i, value) {
    setSettings(s => ({ ...s, areas: s.areas.map((a, idx) => idx === i ? value : a) }))
  }
  function addArea() {
    setSettings(s => ({ ...s, areas: [...(s.areas||[]), ''] }))
  }
  function removeArea(i) {
    setSettings(s => ({ ...s, areas: s.areas.filter((_, idx) => idx !== i) }))
  }

  function setBedOption(i, key, value) {
    setSettings(s => ({ ...s, bed_options: s.bed_options.map((b, idx) => idx === i ? { ...b, [key]: value } : b) }))
  }
  function addBedOption() {
    setSettings(s => ({ ...s, bed_options: [...(s.bed_options||[]), { digit:'', label:'' }] }))
  }
  function removeBedOption(i) {
    setSettings(s => ({ ...s, bed_options: s.bed_options.filter((_, idx) => idx !== i) }))
  }

  async function save() {
    setSaving(true)
    try {
      const { error } = await supabase.from('listings_ivr_settings').upsert({ id: 1, ...settings, updated_at: new Date().toISOString() })
      if (error) throw error
      toast('✅ Listings search settings saved')
    } catch(e) {
      toast('Failed to save — run listings_ivr_settings.sql in Supabase first', '#DC2626')
    } finally { setSaving(false) }
  }

  if (loading) return <Loading />

  return (
    <div style={{ maxWidth: '700px' }}>
      <div style={{ background:'var(--panel)', borderRadius:'12px', border:'1px solid var(--border)', padding:'20px', marginBottom: 16 }}>
        <div style={{ fontSize:'13px', fontWeight:800, color:'var(--text)', marginBottom:'10px' }}>Intro Message</div>
        <div style={{ fontSize:'12px', color:'var(--muted)', marginBottom:'8px' }}>What callers hear right after pressing 5 for exclusive listings.</div>
        <textarea value={settings.intro_text || ''} onChange={e => setSettings(s => ({ ...s, intro_text: e.target.value }))}
          rows={3}
          style={{ width:'100%', padding:'10px 12px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:'inherit', resize:'vertical' }} />
      </div>

      <div style={{ background:'var(--panel)', borderRadius:'12px', border:'1px solid var(--border)', padding:'20px', marginBottom: 16 }}>
        <div style={{ fontSize:'13px', fontWeight:800, color:'var(--text)', marginBottom:'6px' }}>Price Ranges (Press 2 → Price Search)</div>
        <div style={{ fontSize:'12px', color:'var(--muted)', marginBottom:'12px' }}>What callers press for, and the $ range each searches. The label is exactly what gets spoken.</div>
        {(settings.price_ranges || []).map((r, i) => (
          <div key={i} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
            <span style={{ fontSize:12, fontWeight:700, color:'var(--muted)', width:16 }}>{i+1}</span>
            <input type="number" value={r.min} onChange={e => setRange(i, 'min', parseInt(e.target.value)||0)}
              placeholder="Min $" style={{ width:100, padding:'6px 8px', borderRadius:6, border:'1px solid var(--border)', fontSize:12 }} />
            <span style={{ color:'var(--muted)' }}>–</span>
            <input type="number" value={r.max} onChange={e => setRange(i, 'max', parseInt(e.target.value)||0)}
              placeholder="Max $" style={{ width:100, padding:'6px 8px', borderRadius:6, border:'1px solid var(--border)', fontSize:12 }} />
            <input value={r.label} onChange={e => setRange(i, 'label', e.target.value)}
              placeholder="Spoken label" style={{ flex:1, padding:'6px 8px', borderRadius:6, border:'1px solid var(--border)', fontSize:12 }} />
            <button onClick={() => removeRange(i)} style={{ color:'#DC2626', background:'none', border:'none', cursor:'pointer', fontSize:14 }}>✕</button>
          </div>
        ))}
        <button onClick={addRange} style={{ fontSize:12, color:'var(--brand)', background:'none', border:'none', cursor:'pointer', fontWeight:700, marginTop:4 }}>+ Add price range</button>
      </div>

      <div style={{ background:'var(--panel)', borderRadius:'12px', border:'1px solid var(--border)', padding:'20px', marginBottom: 16 }}>
        <div style={{ fontSize:'13px', fontWeight:800, color:'var(--text)', marginBottom:'6px' }}>Areas (Press 1 → Area Search)</div>
        <div style={{ fontSize:'12px', color:'var(--muted)', marginBottom:'12px' }}>Local area names to match against listing addresses. Only areas that actually have active listings get offered on a given call.</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {(settings.areas || []).map((a, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:4, background:'var(--dim)', borderRadius:6, padding:'4px 4px 4px 10px' }}>
              <input value={a} onChange={e => setArea(i, e.target.value)}
                style={{ width:110, padding:'4px 6px', borderRadius:4, border:'1px solid var(--border)', fontSize:12, background:'var(--panel)' }} />
              <button onClick={() => removeArea(i)} style={{ color:'#DC2626', background:'none', border:'none', cursor:'pointer', fontSize:13 }}>✕</button>
            </div>
          ))}
        </div>
        <button onClick={addArea} style={{ fontSize:12, color:'var(--brand)', background:'none', border:'none', cursor:'pointer', fontWeight:700, marginTop:10 }}>+ Add area</button>
      </div>

      <div style={{ background:'var(--panel)', borderRadius:'12px', border:'1px solid var(--border)', padding:'20px' }}>
        <div style={{ fontSize:'13px', fontWeight:800, color:'var(--text)', marginBottom:'6px' }}>Bedroom Options (Press 3 → Bedroom Search)</div>
        <div style={{ fontSize:'12px', color:'var(--muted)', marginBottom:'12px' }}>Which digit maps to which bedroom count/label.</div>
        {(settings.bed_options || []).map((b, i) => (
          <div key={i} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
            <input value={b.digit} onChange={e => setBedOption(i, 'digit', e.target.value)}
              placeholder="Digit" style={{ width:50, padding:'6px 8px', borderRadius:6, border:'1px solid var(--border)', fontSize:12 }} maxLength={1} />
            <span style={{ color:'var(--muted)' }}>→</span>
            <input value={b.label} onChange={e => setBedOption(i, 'label', e.target.value)}
              placeholder="Label (e.g. 5+)" style={{ flex:1, padding:'6px 8px', borderRadius:6, border:'1px solid var(--border)', fontSize:12 }} />
            <button onClick={() => removeBedOption(i)} style={{ color:'#DC2626', background:'none', border:'none', cursor:'pointer', fontSize:14 }}>✕</button>
          </div>
        ))}
        <button onClick={addBedOption} style={{ fontSize:12, color:'var(--brand)', background:'none', border:'none', cursor:'pointer', fontWeight:700, marginTop:4 }}>+ Add bedroom option</button>
      </div>

      <Btn onClick={save} disabled={saving} style={{ marginTop: 16 }}>{saving ? 'Saving…' : 'Save Settings'}</Btn>
    </div>
  )
}

function IVRBuilder() {
  const navigate = useNavigate()
  return (
    <div style={{ maxWidth:'700px' }}>
      <div style={{ background:'var(--panel)', borderRadius:'12px', border:'1px solid var(--border)', padding:'24px', textAlign:'center' }}>
        <div style={{ fontSize:'28px', marginBottom:'10px' }}>📞</div>
        <div style={{ fontSize:'15px', fontWeight:800, color:'var(--text)', marginBottom:'6px' }}>
          Phone menu setup moved to the Call Flow builder
        </div>
        <div style={{ fontSize:'13px', color:'var(--muted)', marginBottom:'16px', lineHeight:1.5 }}>
          This panel used to edit a greeting and keypad list that the phone
          system never actually read — changes made here looked saved but
          had no effect on real calls. Removed July 2026 to stop that
          confusion. Use the visual Call Flow builder below to configure
          what callers actually hear.
        </div>
        <Btn onClick={() => navigate('/call-flow')}>Open Call Flow Builder</Btn>
      </div>
    </div>
  )
}

// ── ROUTING RULES ────────────────────────────────────────────
function RoutingRules({ agents }) {
  const { toast } = useApp()
  const [rules,   setRules]  = useState([])
  const [loading, setLoad]   = useState(true)
  const [editRule,setEdit]   = useState(null)
  const [saving,  setSaving] = useState(false)

  useEffect(() => {
    // phone_routing may not exist yet — handle gracefully
    supabase.from('phone_extensions').select('*').order('order_index')
      .then(({ data }) => { setLoad(false) })
      .catch(() => { setLoad(false) })

    supabase.from('phone_routing').select('*').order('priority')
      .then(({ data }) => setRules(data || []))
      .catch(() => setRules([]))
  }, [])

  async function save(form) {
    setSaving(true)
    try {
      if (form.id) {
        const { ...cleanRoute } = form
        const { error } = await supabase.from('phone_routing').update(cleanRoute).eq('id', form.id)
        if (error) throw error
      } else {
        const { id: _rid, ...cleanRouteIns } = form
        const { error } = await supabase.from('phone_routing').insert(cleanRouteIns)
        if (error) throw error
      }
      const { data } = await supabase.from('phone_routing').select('*').order('priority')
      setRules(data || [])
      setEdit(null)
      toast('✅ Routing rule saved')
    } catch(e) { toast('Failed to save rule — phone_routing table may need to be created in Supabase.', '#DC2626') }
    finally { setSaving(false) }
  }

  async function toggle(rule) {
    try {
      const { error } = await supabase.from('phone_routing').update({ is_active: !rule.is_active }).eq('id', rule.id)
      if (error) throw error
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r))
    } catch(e) { toast('Failed to update: ' + e.message, '#DC2626') }
  }

  async function remove(id) {
    try {
      const { error } = await supabase.from('phone_routing').delete().eq('id', id)
      if (error) throw error
      setRules(prev => prev.filter(r => r.id !== id))
      toast('Rule deleted')
    } catch(e) { toast('Failed to delete: ' + e.message, '#DC2626') }
  }

  const BLANK_RULE = { name:'', rule_type:'contact_match', is_active:true, priority: rules.length, config:{} }

  if (loading) return <Loading />

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'16px' }}>
        <div>
          <div style={{ fontSize:'15px', fontWeight:800, color:'var(--text)' }}>Routing Rules</div>
          <div style={{ fontSize:'12px', color:'var(--muted)' }}>Rules are evaluated in priority order. First matching rule wins.</div>
        </div>
        <Btn style={{ marginLeft:'auto' }} onClick={() => setEdit({ ...BLANK_RULE })}>+ Add Rule</Btn>
      </div>

      <div style={{ background:'var(--dim)', borderRadius:'10px', border:'1px solid var(--border)', padding:'14px 16px', marginBottom:'16px', display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
        {['Inbound call','Check contact DB','Match → Agent','No match → IVR Menu','Round Robin'].map((step, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:'6px' }}>
            <div style={{ padding:'5px 10px', background: i===0 ? '#CC2200' : i===4 ? '#10B981' : 'var(--panel)', color: i===0||i===4 ? '#fff' : 'var(--text)', borderRadius:'6px', fontSize:'11px', fontWeight:700, border:'1px solid var(--border)', whiteSpace:'nowrap' }}>{step}</div>
            {i < 4 && <span style={{ color:'var(--muted)' }}>→</span>}
          </div>
        ))}
      </div>

      {rules.length === 0 ? (
        <Empty icon="🔀" title="No routing rules" sub="Add rules to control how inbound calls are distributed."
          action={<Btn onClick={() => setEdit({ ...BLANK_RULE })}>+ Add Rule</Btn>} />
      ) : rules.map(rule => {
        const typeDef = RULE_TYPES.find(t => t.id === rule.rule_type)
        const isOn = rule.is_active
        return (
          <div key={rule.id} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 16px', background:'var(--panel)', borderRadius:'10px', border:'1px solid var(--border)', marginBottom:'8px', opacity: isOn ? 1 : 0.5 }}>
            <div style={{ width:36, height:36, borderRadius:'8px', background:'var(--dim)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', flexShrink:0 }}>
              {typeDef?.icon || '🔀'}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:'13px', fontWeight:700, color:'var(--text)' }}>{rule.name}</div>
              <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:'1px' }}>{typeDef?.desc}</div>
            </div>
            <Badge label={typeDef?.label || rule.rule_type} color="#3B82F6" />
            <button onClick={() => toggle(rule)}
              style={{ padding:'4px 10px', borderRadius:'6px', border:'1px solid ' + (isOn ? '#10B981' : 'var(--border)'), background: isOn ? '#10B98118' : 'transparent', color: isOn ? '#10B981' : 'var(--muted)', fontSize:'11px', fontWeight:700, cursor:'pointer', fontFamily:ff }}>
              {isOn ? 'Active' : 'Off'}
            </button>
            <button onClick={() => setEdit(rule)}
              style={{ padding:'5px 10px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--dim)', color:'var(--muted)', fontSize:'12px', cursor:'pointer', fontFamily:ff }}>
              ✏️
            </button>
            <button onClick={() => remove(rule.id)}
              style={{ padding:'5px 10px', borderRadius:'7px', border:'1px solid #DC262444', background:'#FEF2F2', color:'#DC2626', fontSize:'12px', cursor:'pointer', fontFamily:ff }}>
              🗑
            </button>
          </div>
        )
      })}

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
                  placeholder="e.g. Contact Match, After Hours"
                  style={{ width:'100%', padding:'8px 10px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff, boxSizing:'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize:'10px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'8px' }}>Rule Type</div>
                <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                  {RULE_TYPES.map(rt => (
                    <div key={rt.id} onClick={() => setEdit(r => ({ ...r, rule_type: rt.id }))}
                      style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', borderRadius:'8px', border:'1px solid ' + (editRule.rule_type===rt.id ? '#CC2200' : 'var(--border)'), background: editRule.rule_type===rt.id ? 'rgba(204,34,0,.05)' : 'var(--dim)', cursor:'pointer' }}>
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
                      const agentIds = (editRule.config || {}).agent_ids || []
                      const on = agentIds.includes(a.id)
                      return (
                        <button key={a.id} onClick={() => {
                          const ids = on ? agentIds.filter(x=>x!==a.id) : [...agentIds, a.id]
                          setEdit(r => ({ ...r, config: { ...r.config, agent_ids: ids } }))
                        }}
                          style={{ display:'flex', alignItems:'center', gap:'6px', padding:'5px 10px', borderRadius:'20px', border:'1px solid ' + (on ? '#CC2200' : 'var(--border)'), background: on ? 'rgba(204,34,0,.1)' : 'var(--dim)', cursor:'pointer', fontFamily:ff, fontSize:'12px', fontWeight:600, color: on ? '#CC2200' : 'var(--muted)' }}>
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

// ── VOICEMAIL INBOX ──────────────────────────────────────────
function VoicemailInbox() {
  const { toast } = useApp()
  const [vms,    setVms]  = useState([])
  const [loading,setLoad] = useState(true)

  useEffect(() => {
    supabase.from('voicemails').select('*, agents(id,name,color)').order('created_at', { ascending: false })
      .then(({ data }) => { setVms(data || []); setLoad(false) })
      .catch(() => { setVms([]); setLoad(false) })
  }, [])

  async function markRead(id) {
    try {
      const { error } = await supabase.from('voicemails').update({ is_read: true }).eq('id', id)
      if (error) throw error
      setVms(prev => prev.map(v => v.id === id ? { ...v, is_read: true } : v))
    } catch(e) { console.warn('markRead failed:', e.message) }
  }

  async function deleteVM(id) {
    try {
      const { error } = await supabase.from('voicemails').delete().eq('id', id)
      if (error) throw error
      setVms(prev => prev.filter(v => v.id !== id))
      toast('Voicemail deleted')
    } catch(e) { toast('Failed to delete: ' + e.message, '#DC2626') }
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
          <div style={{ fontSize:'12px', color:'var(--muted)' }}>{vms.length} total · {unread} unread</div>
        </div>
      </div>

      {vms.length === 0 ? (
        <Empty icon="📬" title="No voicemails" sub="Voicemails from Twilio will appear here automatically." />
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {vms.map(vm => {
            const borderColor = vm.is_read ? 'var(--border)' : '#3B82F6'
            const iconBg      = vm.is_read ? 'var(--dim)' : '#3B82F6'
            const callbackHref = 'tel:' + (vm.from_number || '').replace(/\D/g,'')
            return (
              <div key={vm.id} style={{ background:'var(--panel)', borderRadius:'10px', border:'1px solid ' + borderColor, padding:'14px 16px', opacity: vm.is_read ? 0.8 : 1 }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:'10px' }}>
                  <div style={{ width:36, height:36, borderRadius:'50%', background: iconBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', flexShrink:0 }}>📬</div>
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
                    <RecordingPlayer voicemailId={vm.id} />
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
                    <a href={callbackHref}
                      style={{ padding:'5px 10px', borderRadius:'7px', border:'1px solid #10B98144', background:'#10B98118', color:'#10B981', fontSize:'12px', fontWeight:700, textDecoration:'none', fontFamily:ff }}>
                      📞 Call back
                    </a>
                  )}
                  <button onClick={() => deleteVM(vm.id)}
                    style={{ padding:'5px 10px', borderRadius:'7px', border:'1px solid #DC262444', background:'#FEF2F2', color:'#DC2626', fontSize:'12px', cursor:'pointer', fontFamily:ff }}>
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── CALL FLOW EMBED ──────────────────────────────────────────
function CallFlowEmbed() {
  const { toast }  = useApp()
  const navigate   = useNavigate()
  const [flows,    setFlows]   = useState([])
  const [loading,  setLoading] = useState(true)
  const [active,   setActive]  = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const { data } = await supabase.from('phone_ivr').select('*').order('created_at', { ascending: false })
      setFlows(data || [])
      setActive(data?.find(f => f.is_active)?.id || null)
    } catch(e) { setFlows([]) }
    finally { setLoading(false) }
  }

  async function toggleActive(flow) {
    try {
      const { error: e1 } = await supabase.from('phone_ivr').update({ is_active: false }).neq('id', '00000000-0000-0000-0000-000000000000')
      if (e1) throw e1
      if (!flow.is_active) {
        const { error: e2 } = await supabase.from('phone_ivr').update({ is_active: true }).eq('id', flow.id)
        if (e2) throw e2
        setActive(flow.id)
        toast('✅ Flow activated — now handling inbound calls')
      } else {
        setActive(null)
        toast('Flow deactivated')
      }
      load()
    } catch(e) { toast('Failed to update active flow — inbound calls may be misconfigured, please verify: ' + e.message, '#DC2626') }
  }

  async function deleteFlow(id) {
    if (!window.confirm('Delete this flow?')) return
    await supabase.from('phone_ivr').delete().eq('id', id)
    load()
    toast('Flow deleted')
  }

  const FLOW_STEPS = [
    { icon: '📞', label: 'Inbound call received',         color: '#10B981' },
    { icon: '👤', label: 'Check if caller is known',      color: '#3B82F6' },
    { icon: '✅', label: 'Match → route to their agent',  color: '#10B981' },
    { icon: '🎛', label: 'No match → play IVR menu',      color: '#8B5CF6' },
    { icon: '📱', label: 'Caller presses key → extension',color: '#CC2200' },
    { icon: '📬', label: 'No answer → voicemail',         color: '#F5A623' },
  ]

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:15, fontWeight:800, color:'var(--text)' }}>Call Flow Manager</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>Design how inbound calls are handled step by step</div>
        </div>
        <button onClick={() => navigate('/call-flow')} style={{ marginLeft:'auto', padding:'8px 14px', borderRadius:8, border:'none', background:'#CC2200', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
          🔀 Open Visual Builder
        </button>
      </div>

      <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:16, marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:12 }}>Current Call Flow Logic</div>
        <div style={{ display:'flex', alignItems:'center', gap:0, flexWrap:'wrap', rowGap:8 }}>
          {FLOW_STEPS.map((step, i) => (
            <React.Fragment key={i}>
              <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 12px', borderRadius:8, background:step.color+'15', border:'1px solid ' + step.color + '44' }}>
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

      <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:10 }}>Saved Flows</div>
      {loading ? <Loading /> : flows.length === 0 ? (
        <Empty icon="🔀" title="No flows saved yet" sub="Open the Visual Builder to create your first call flow"
          action={<button onClick={() => navigate('/call-flow')} style={{ padding:'8px 14px', borderRadius:8, border:'none', background:'#CC2200', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff }}>Open Builder</button>} />
      ) : (
        flows.map(flow => {
          const isOn = flow.is_active
          const dotBg = isOn ? '#10B981' : 'var(--dim)'
          const dotBorder = isOn ? '#10B981' : 'var(--border)'
          const cardBorder = isOn ? '#10B981' : 'var(--border)'
          const btnBorder = isOn ? '#10B981' : 'var(--border)'
          const btnBg = isOn ? '#10B98118' : 'transparent'
          const btnColor = isOn ? '#10B981' : 'var(--muted)'
          return (
            <div key={flow.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'var(--panel)', borderRadius:10, border:'1px solid ' + cardBorder, marginBottom:8 }}>
              <div style={{ width:10, height:10, borderRadius:'50%', background: dotBg, border:'2px solid ' + dotBorder, flexShrink:0 }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>{flow.name || 'Unnamed Flow'}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
                  {(flow.menu_options || []).length} menu options · {(flow.flow_nodes || []).length} nodes
                  {isOn && <span style={{ marginLeft:8, color:'#10B981', fontWeight:700 }}>● ACTIVE</span>}
                </div>
              </div>
              <button onClick={() => toggleActive(flow)}
                style={{ padding:'5px 12px', borderRadius:7, border:'1px solid ' + btnBorder, background: btnBg, color: btnColor, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
                {isOn ? '✅ Active' : 'Activate'}
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
          )
        })
      )}
    </div>
  )
}

// ── TWILIO SETTINGS ──────────────────────────────────────────
function TwilioSettings() {
  const { toast } = useApp()
  const webhookBase = window.location.origin

  function copyWebhook(path) {
    navigator.clipboard.writeText(webhookBase + path)
    toast('✅ Copied to clipboard')
  }

  const WEBHOOKS = [
    { path:'/api/twilio-inbound',   label:'Inbound Call Webhook',     desc:'Set as the "A call comes in" webhook on your Twilio phone number' },
    { path:'/api/twilio-status',    label:'Call Status Callback',      desc:'Set as the "Call status changes" callback on your Twilio number' },
    { path:'/api/twilio-voicemail', label:'Voicemail Transcription',   desc:'Automatically called when a voicemail transcription is ready' },
  ]

  return (
    <div style={{ maxWidth:'640px' }}>
      <div style={{ fontSize:'15px', fontWeight:800, color:'var(--text)', marginBottom:'4px' }}>Twilio Connection</div>
      <div style={{ fontSize:'12px', color:'var(--muted)', marginBottom:'20px' }}>
        Connect your Twilio account to activate inbound call routing, call recording, and voicemail.
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'12px 16px', background:'var(--dim)', borderRadius:'10px', border:'1px solid var(--border)', marginBottom:'20px' }}>
        <div style={{ width:10, height:10, borderRadius:'50%', background:'#F5A623', flexShrink:0 }} />
        <div>
          <div style={{ fontSize:'13px', fontWeight:700, color:'var(--text)' }}>Credentials in Vercel</div>
          <div style={{ fontSize:'11px', color:'var(--muted)' }}>Add your Twilio credentials in Vercel environment variables to activate</div>
        </div>
      </div>

      <div style={{ background:'var(--panel)', borderRadius:'12px', border:'1px solid var(--border)', padding:'16px', marginBottom:'16px' }}>
        <div style={{ fontSize:'13px', fontWeight:700, color:'var(--text)', marginBottom:'10px' }}>Step 1 — Add to Vercel Environment Variables</div>
        {[
          { key:'TWILIO_ACCOUNT_SID',  desc:'Your Twilio Account SID (starts with AC...)' },
          { key:'TWILIO_AUTH_TOKEN',   desc:'Your Twilio Auth Token' },
          { key:'TWILIO_PHONE_NUMBER', desc:'Your Twilio phone number in E.164 format (e.g. +18455551234)' },
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

      <div style={{ background:'var(--panel)', borderRadius:'12px', border:'1px solid var(--border)', padding:'16px', marginBottom:'16px' }}>
        <div style={{ fontSize:'13px', fontWeight:700, color:'var(--text)', marginBottom:'4px' }}>Step 2 — Configure Twilio Webhooks</div>
        <div style={{ fontSize:'12px', color:'var(--muted)', marginBottom:'12px' }}>Go to Twilio Console → Phone Numbers → your number → set these URLs</div>
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
              {webhookBase}{w.path}
            </div>
            <div style={{ fontSize:'11px', color:'var(--muted)' }}>{w.desc}</div>
          </div>
        ))}
      </div>

      <div style={{ background:'var(--dim)', borderRadius:'12px', border:'1px solid var(--border)', padding:'16px' }}>
        <div style={{ fontSize:'13px', fontWeight:700, color:'var(--text)', marginBottom:'10px' }}>✅ What's Already Built and Ready</div>
        {[
          'Inbound call received → match to contact → route to assigned agent',
          'No contact match → play IVR menu → caller presses key → route to extension',
          'Round-robin distribution across agents when no match',
          'All calls logged automatically with duration, direction, outcome',
          'Call recordings saved and playable in the Call Log',
          'Voicemails saved with transcript (when Twilio transcription is on)',
        ].map((item, i) => (
          <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:'8px', marginBottom:'6px' }}>
            <span style={{ color:'#10B981', flexShrink:0 }}>✓</span>
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
  usePageView('calls')
  const { toast } = useApp()
  const { agents } = useAgents()
  const location = useLocation()

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
  const [contactPrefill, setContactPrefill] = useState(null)
  const [form,       setForm]      = useState({})
  const [vmUnread,   setVmUnread]  = useState(0)

  // Auto-open Log Call if navigated from a contact
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const cid   = params.get('contact')
    const cname = params.get('name')
    if (cid && cname) {
      const decoded = decodeURIComponent(cname)
      setContactPrefill({ id: cid, name: decoded })
      setForm(f => ({ ...f, direction:'Outbound', agent_id: agent ? agent.id : '', contact_id: cid, contact_name: decoded }))
      setShowAdd(true)
      setTab('log')
    }
  }, [location.search])

  useEffect(() => { loadCalls() }, [])

  useEffect(() => {
    supabase.from('voicemails').select('id').eq('is_read', false)
      .then(({ data }) => setVmUnread(data?.length || 0))
      .catch(() => {})
  }, [tab])

  async function loadCalls() {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_calls_list', { p_limit: 200 })
      if (error) throw error
      // Reshape to match what the rest of this page expects (nested agents object)
      setCalls((data || []).map(c => ({ ...c, agents: c.agent_id ? { id: c.agent_id, name: c.agent_name, color: c.agent_color } : null })))
    } catch(e) { console.warn('calls load error:', e.message); setCalls([]) }
    finally { setLoading(false) }
  }

  async function saveCall(callForm) {
    setSaving(true)
    try {
      if (callForm.id) {
        const { agents: _ca, ...cleanCall } = callForm
        const { data, error } = await supabase.from('calls').update({ ...cleanCall, updated_at: new Date().toISOString() }).eq('id', callForm.id).select('*, agents(id,name,color)').single()
        if (error) throw error
        setCalls(prev => prev.map(c => c.id === callForm.id ? data : c))
        setSelected(data)
        toast('✅ Call saved')
      } else {
        const { agents: _ca2, id: _cid, ...cleanCallIns } = callForm
        const { data, error } = await supabase.from('calls').insert({ ...cleanCallIns, agent_id: callForm.agent_id || agent?.id, called_at: new Date().toISOString() }).select('*, agents(id,name,color)').single()
        if (error) throw error
        setCalls(prev => [data, ...prev])
        setShowAdd(false)
        setContactPrefill(null)
        setForm({})
        toast('✅ Call logged')
      }
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  async function deleteCall() {
    if (!selected) return
    try {
      const { error } = await supabase.from('calls').delete().eq('id', selected.id)
      if (error) throw error
      setCalls(prev => prev.filter(c => c.id !== selected.id))
      setSelected(null)
      setConfirmDel(false)
      toast('Call deleted')
    } catch(e) { toast('Failed to delete: ' + e.message, '#DC2626') }
  }

  const filtered = calls.filter(c => {
    const q = search.toLowerCase()
    if (search && !c.contact_name?.toLowerCase().includes(q) && !c.from_number?.includes(search) && !c.notes?.toLowerCase().includes(q)) return false
    if (dirFilter && c.direction !== dirFilter) return false
    if (outFilter && c.outcome  !== outFilter)  return false
    return true
  })

  const todayCalls = calls.filter(c => (c.called_at||'').slice(0,10) === new Date().toISOString().slice(0,10))
  const connected  = calls.filter(c => c.outcome === 'Connected').length
  const hotLeads   = calls.filter(c => c.outcome === 'Hot Lead').length
  const voicemails = calls.filter(c => c.is_voicemail).length

  return (
    <div style={{ fontFamily:ff }}>
      <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'16px', flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:'22px', fontWeight:800, color:'var(--text)' }}>📞 Phone System</div>
          <div style={{ fontSize:'12px', color:'var(--muted)', marginTop:'2px' }}>
            {calls.length} calls · {connected} connected · {hotLeads} hot leads · {voicemails} voicemails
          </div>
        </div>
        {tab === 'log' && (
          <Btn style={{ marginLeft:'auto' }} onClick={() => { setForm({ direction:'Outbound', agent_id: agent?.id }); setShowAdd(true) }}>+ Log Call</Btn>
        )}
        {tab === 'log' && (
          <LastVisited page="calls" />
        )}
        {tab === 'log' && (
          <button onClick={loadCalls} style={{ padding:'7px 12px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--dim)', color:'var(--muted)', fontSize:'12px', cursor:'pointer', fontFamily:ff }}>↻ Refresh</button>
        )}
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
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'8px', marginBottom:'16px' }}>
            {[
              { label:'Today',      value: todayCalls.length, color:'#3B82F6' },
              { label:'Connected',  value: connected,          color:'#10B981' },
              { label:'Hot Leads',  value: hotLeads,           color:'#CC2200' },
              { label:'Voicemails', value: voicemails,         color:'#F5A623' },
            ].map(s => (
              <div key={s.label} style={{ background:'var(--panel)', borderRadius:'9px', border:'1px solid var(--border)', padding:'10px 12px', borderLeft:'3px solid ' + s.color }}>
                <div style={{ fontSize:'22px', fontWeight:900, color:'var(--text)' }}>{s.value}</div>
                <div style={{ fontSize:'10px', color:'var(--muted)', marginTop:'1px', fontWeight:600 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display:'flex', gap:'8px', marginBottom:'14px', flexWrap:'wrap' }}>
            <FilterBar
              search={search} onSearch={setSearch} searchPlaceholder="🔍 Name, phone, notes..."
              values={{ dirFilter, outFilter }}
              onChange={(k,v) => { if(k==='dirFilter') setDirFilter(v); if(k==='outFilter') setOutFilter(v) }}
              total={calls.length} filtered={filtered.length}
              filters={[
                { key:'dirFilter', label:'Direction', type:'select', options:DIRECTIONS.map(d=>({value:d,label:d})), placeholder:'Direction' },
                { key:'outFilter', label:'Outcome',   type:'select', options:OUTCOMES.map(o=>({value:o,label:o})),   placeholder:'Outcome'   },
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
                    {['Contact','Phone','Dir.','Outcome','Ext.','Duration','Agent','Rec.','Date'].map(h => (
                      <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:'10px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => {
                    const callAgent = agents.find(a => a.id === c.agent_id) || c.agents
                    const initials  = (callAgent?.name || '').split(' ').map(n=>n[0]).join('').slice(0,2)
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
                        <td style={{ padding:'10px 12px' }}>{c.outcome   ? <Badge label={c.outcome}   color={outcomeColor(c.outcome)}     /> : '—'}</td>
                        <td style={{ padding:'10px 12px', fontSize:'12px', color:'var(--muted)', fontFamily:'monospace' }}>{c.extension || '—'}</td>
                        <td style={{ padding:'10px 12px', fontSize:'12px', color:'var(--muted)', whiteSpace:'nowrap' }}>{fmtDuration(c.duration_sec)}</td>
                        <td style={{ padding:'10px 12px' }}>
                          {callAgent ? (
                            <div style={{ display:'flex', alignItems:'center', gap:'5px' }}>
                              <div style={{ width:20, height:20, borderRadius:'50%', background:callAgent.color||'#CC2200', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'8px', fontWeight:800, color:'#fff' }}>{initials}</div>
                              <span style={{ fontSize:'11px', color:'var(--muted)' }}>{(callAgent.name||'').split(' ')[0]}</span>
                            </div>
                          ) : '—'}
                        </td>
                        <td style={{ padding:'10px 12px' }}>
                          {c.recording_url
                            ? <span style={{ fontSize:'11px', color:'#3B82F6', fontWeight:700 }}>🎙 Play</span>
                            : c.has_recording
                              ? <span style={{ fontSize:'11px', color:'var(--muted)' }} title="Restricted to admin/approved users">🔒 Restricted</span>
                              : '—'}
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

      {tab === 'voicemail'  && <VoicemailInbox />}
      {tab === 'extensions' && <ExtensionManager agents={agents} />}
      {tab === 'ivr'        && <IVRBuilder agents={agents} />}
      {tab === 'routing'    && <RoutingRules agents={agents} />}
      {tab === 'flow'       && <CallFlowEmbed />}
      {tab === 'listings'   && <ListingsSearchSettings />}
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
              {contactPrefill && (
                <div style={{ padding:'8px 12px', background:'#EFF6FF', borderRadius:8, fontSize:12, color:'#1E40AF' }}>
                  Logging call for: <strong>{contactPrefill.name}</strong>
                </div>
              )}
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
                    <select value={form[k]??''} onChange={e => setForm(x => ({ ...x, [k]: e.target.value }))}
                      style={{ width:'100%', padding:'8px 10px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff }}>
                      <option value="">—</option>
                      {(k==='direction' ? DIRECTIONS : OUTCOMES).map(o => <option key={o} value={o}>{o}</option>)}
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
              <button onClick={() => { setShowAdd(false); setContactPrefill(null); setForm({}) }} style={{ padding:'8px 14px', borderRadius:'8px', border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', cursor:'pointer', fontFamily:ff }}>Cancel</button>
              <Btn onClick={() => saveCall(form)} loading={saving}>Log Call</Btn>
            </div>
          </div>
        </div>
      )}

      <Confirm open={confirmDel} message="Delete this call log?" onConfirm={deleteCall} onCancel={() => setConfirmDel(false)} />
    </div>
  )
}
