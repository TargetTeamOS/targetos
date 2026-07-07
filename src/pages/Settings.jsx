// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Settings Page
// Profile, appearance, notifications, preferences, filters,
// keyboard shortcuts, and browser phone setup.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react'
import { useAuth }  from '../context/AuthContext'
import { useApp }   from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { db }       from '../lib/db'
import { loadPrefs, savePrefs, PREF_DEFAULTS } from '../lib/userPrefs'
import { PageHeader, Field, Input, Btn, Avatar, SectionTitle, Toggle, Tabs } from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'
const S  = { width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }
const CARD = { background:'var(--panel)', borderRadius:'var(--radius)', border:'1px solid var(--border)', padding:24, marginBottom:16 }

const AGENT_COLORS = ['#CC2200','#0EA5E9','#10B981','#F5A623','#8B5CF6','#EC4899','#14B8A6','#E8650A','#6366F1','#84CC16']
const THEMES = [
  { id:'light', label:'Light', bg:'#F0F2F5', text:'#0F172A' },
  { id:'dark',  label:'Dark',  bg:'#0F1A2E', text:'#F1F5F9' },
  { id:'slate', label:'Slate', bg:'#1E1E2E', text:'#CDD6F4' },
]
const FONTS    = ['Inter','Roboto','Poppins','DM Sans','Nunito','System']
const ROW_HEIGHTS = [
  { id:'compact',  label:'Compact',  hint:'More rows, tighter spacing' },
  { id:'normal',   label:'Normal',   hint:'Balanced — default' },
  { id:'spacious', label:'Spacious', hint:'More padding, easier to read' },
]
const DATE_FORMATS = ['MM/DD/YYYY','DD/MM/YYYY','YYYY-MM-DD','MMM D, YYYY']
const NOTIF_GROUPS = [
  { key:'newLead',         label:'New lead assigned to me',      icon:'👤' },
  { key:'taskDue',         label:'Task due today',               icon:'✅' },
  { key:'taskOverdue',     label:'Task overdue',                 icon:'⚠️' },
  { key:'dealStageChange', label:'Deal stage changed',           icon:'🏠' },
  { key:'newAnnouncement', label:'New team announcement',        icon:'📢' },
  { key:'callMissed',      label:'Missed inbound call',          icon:'📞' },
  { key:'voicemail',       label:'New voicemail received',       icon:'📬' },
  { key:'dailyBriefing',   label:'Daily briefing ready',         icon:'☀️' },
  { key:'emailOnNewLead',  label:'Email me on new lead',         icon:'✉️' },
  { key:'emailOnTaskDue',  label:'Email me on task due',         icon:'✉️' },
]
const SHORTCUTS = [
  { keys: ['N'],         action: 'New contact',        scope: 'Contacts page' },
  { keys: ['Ctrl','F'],  action: 'Focus search',        scope: 'Anywhere' },
  { keys: ['Ctrl','K'],  action: 'Command palette',     scope: 'Anywhere (coming soon)' },
  { keys: ['Esc'],       action: 'Close panel / modal', scope: 'Anywhere' },
  { keys: ['Del'],       action: 'Delete selected node',scope: 'Call Flow editor' },
  { keys: ['Ctrl','S'],  action: 'Save',                scope: 'Call Flow editor' },
  { keys: ['Ctrl','F'],  action: 'Fullscreen',          scope: 'Call Flow editor' },
]

function PhoneSetup() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState(false)

  async function checkSetup() {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res  = await fetch('/api/twilio-setup', {
        headers: session?.access_token ? { 'Authorization': 'Bearer ' + session.access_token } : {}
      })
      const data = await res.json()
      setStatus(data); setChecked(true)
    } catch(e) { setStatus({ ok:false, message:'Could not reach setup: ' + e.message }) }
    finally { setLoading(false) }
  }

  return (
    <div>
      <div style={{ fontSize:13, color:'var(--muted)', marginBottom:12, lineHeight:1.6 }}>
        Browser calling uses Twilio WebRTC — call contacts directly from the CRM, no phone app needed.
        All calls are recorded and saved to contact timelines automatically.
      </div>
      <button onClick={checkSetup} disabled={loading}
        style={{ padding:'9px 20px', borderRadius:9, border:'none', background:'#CC2200', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:ff, marginBottom:status?14:0 }}>
        {loading?'⏳ Checking...':checked?'🔄 Recheck':' 🔧 Configure Browser Phone'}
      </button>
      {status && (
        <div style={{ padding:'12px 14px', borderRadius:10, background:status.ok?'rgba(16,185,129,.08)':'rgba(245,166,35,.08)', border:'1px solid '+(status.ok?'rgba(16,185,129,.3)':'rgba(245,166,35,.3)') }}>
          <div style={{ fontSize:14, fontWeight:800, color:status.ok?'#10B981':'#D97706', marginBottom:6 }}>{status.ok?'✅ ':'⚠️ '}{status.message}</div>
          {status.twimlAppSid && <code style={{ display:'block', fontSize:11, fontFamily:'monospace', background:'rgba(0,0,0,.06)', padding:'6px 10px', borderRadius:6, marginBottom:8 }}>TWILIO_TWIML_APP_SID = {status.twimlAppSid}</code>}
          {status.nextStep && <div style={{ fontSize:12, color:'var(--text)', marginBottom:4 }}><strong>Next:</strong> {status.nextStep}</div>}
        </div>
      )}
    </div>
  )
}

export function Settings() {
  const { agent, refreshAgent } = useAuth()
  const { state, setTheme, setCustom, toast } = useApp()

  const [tab, setTab] = useState('profile')
  const [prefs, setPrefs] = useState(null)
  const [savingPrefs, setSavingPrefs] = useState(false)

  // Profile
  const [name,     setName]     = useState(agent?.name || '')
  const [phone,    setPhone]    = useState(agent?.phone || '')
  const [license,  setLicense]  = useState(agent?.license || '')
  const [langs,    setLangs]    = useState(agent?.languages || '')
  const [color,    setColor]    = useState(agent?.color || '#CC2200')
  const [photoUrl, setPhotoUrl] = useState(agent?.photo_url || '')
  const [uploading, setUploading] = useState(false)
  const [savingP,   setSavingP]   = useState(false)
  const photoRef = React.useRef(null)

  // Password
  const [newPwd, setNewPwd] = useState('')
  const [confPwd, setConfPwd] = useState('')
  const [savingPwd, setSavingPwd] = useState(false)

  const custom = state?.custom || {}

  useEffect(() => {
    if (agent?.id) {
      loadPrefs(agent.id).then(p => setPrefs(p))
    }
  }, [agent?.id])

  function setPref(path, value) {
    setPrefs(prev => {
      const parts = path.split('.')
      const updated = { ...prev }
      let obj = updated
      for (let i = 0; i < parts.length - 1; i++) {
        obj[parts[i]] = { ...obj[parts[i]] }
        obj = obj[parts[i]]
      }
      obj[parts[parts.length - 1]] = value
      return updated
    })
  }

  async function handleSavePrefs() {
    if (!prefs) return
    setSavingPrefs(true)
    try {
      await savePrefs(agent.id, prefs)
      toast('✅ Preferences saved')
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
    finally { setSavingPrefs(false) }
  }

  async function uploadPhoto(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast('Photo must be under 5MB', '#F5A623'); return }
    setUploading(true)
    try {
      const ext  = file.name.split('.').pop()
      const path = 'headshots/' + agent.id + '.' + ext
      const { error } = await supabase.storage.from('agent-photos').upload(path, file, { upsert:true })
      if (error) throw error
      const { data } = supabase.storage.from('agent-photos').getPublicUrl(path)
      setPhotoUrl(data.publicUrl + '?t=' + Date.now())
      toast('✅ Photo uploaded — save profile to apply')
    } catch(e) { toast('Upload failed: ' + e.message, '#DC2626') }
    finally { setUploading(false) }
  }

  async function saveProfile() {
    setSavingP(true)
    try {
      await db.agents.update(agent.id, { name, phone, color, license, languages:langs, photo_url:photoUrl||null }, agent.id)
      await refreshAgent()
      toast('✅ Profile saved')
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
    finally { setSavingP(false) }
  }

  async function changePassword() {
    if (!newPwd) { toast('Enter a new password', '#DC2626'); return }
    if (newPwd.length < 8) { toast('Password must be at least 8 characters', '#DC2626'); return }
    if (newPwd !== confPwd) { toast('Passwords do not match', '#DC2626'); return }
    setSavingPwd(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPwd })
      if (error) throw error
      toast('✅ Password updated')
      setNewPwd(''); setConfPwd('')
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
    finally { setSavingPwd(false) }
  }

  const TABS = [
    { id:'profile',       label:'Profile'         },
    { id:'appearance',    label:'Appearance'       },
    { id:'notifications', label:'Notifications'    },
    { id:'preferences',   label:'Preferences'      },
    { id:'shortcuts',     label:'Shortcuts'        },
    { id:'phone',         label:'Browser Phone'    },
  ]

  return (
    <div style={{ fontFamily:ff, maxWidth:660 }}>
      <PageHeader title="Settings" sub="Profile, preferences, and system configuration" />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {/* ── PROFILE ── */}
      {tab === 'profile' && (
        <>
          <div style={CARD}>
            <SectionTitle>Profile</SectionTitle>
            <div style={{ display:'flex', alignItems:'flex-start', gap:16, marginBottom:20 }}>
              <div style={{ position:'relative', flexShrink:0 }}>
                <Avatar agent={{ name, color, photo_url:photoUrl }} size={72} showHover={false} />
                <label style={{ position:'absolute', bottom:0, right:0, width:24, height:24, borderRadius:'50%', background:'#CC2200', border:'2px solid var(--panel)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:12 }}>
                  <input ref={photoRef} type="file" accept="image/*" onChange={uploadPhoto} style={{ display:'none' }} />
                  {uploading ? '⏳' : '📷'}
                </label>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, color:'var(--text)', fontSize:15, marginBottom:2 }}>{agent?.name}</div>
                <div style={{ fontSize:12, color:'var(--muted)', marginBottom:2 }}>{agent?.email}</div>
                <div style={{ fontSize:11, color:'var(--muted)', textTransform:'capitalize', background:'var(--dim)', display:'inline-block', padding:'2px 8px', borderRadius:99 }}>{agent?.role}</div>
              </div>
            </div>
            <Field label="Display Name"><Input value={name} onChange={setName} placeholder="Your full name" /></Field>
            <Field label="Phone" hint="Used for bridge calls — Twilio will ring this number"><Input value={phone} onChange={setPhone} placeholder="(845) 555-1234" type="tel" /></Field>
            <Field label="License Number"><Input value={license} onChange={setLicense} placeholder="10401234567" /></Field>
            <Field label="Languages Spoken"><Input value={langs} onChange={setLangs} placeholder="English, Spanish, Yiddish" /></Field>
            <Field label="Avatar Color">
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', paddingTop:4 }}>
                {AGENT_COLORS.map(c => (
                  <div key={c} onClick={() => setColor(c)}
                    style={{ width:30, height:30, borderRadius:'50%', background:c, cursor:'pointer', border:color===c?'3px solid var(--text)':'2px solid transparent', transition:'border .15s' }} />
                ))}
              </div>
            </Field>
            <Btn onClick={saveProfile} loading={savingP}>Save Profile</Btn>
          </div>

          <div style={CARD}>
            <SectionTitle>Change Password</SectionTitle>
            <Field label="New Password"><Input value={newPwd} onChange={setNewPwd} type="password" placeholder="At least 8 characters" /></Field>
            <Field label="Confirm Password"><Input value={confPwd} onChange={setConfPwd} type="password" placeholder="Repeat new password" /></Field>
            <Btn onClick={changePassword} loading={savingPwd}>Update Password</Btn>
          </div>
        </>
      )}

      {/* ── APPEARANCE ── */}
      {tab === 'appearance' && (
        <>
          <div style={CARD}>
            <SectionTitle>Theme</SectionTitle>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:8 }}>
              {THEMES.map(t => (
                <div key={t.id} onClick={() => setTheme(t.id)}
                  style={{ cursor:'pointer', borderRadius:10, border:'2px solid '+(state.theme===t.id?'var(--brand)':'var(--border)'), overflow:'hidden', width:110, flexShrink:0 }}>
                  <div style={{ background:t.bg, padding:'14px 10px 10px', textAlign:'center' }}>
                    <div style={{ display:'flex', justifyContent:'center', gap:4, marginBottom:8 }}>
                      {['#DC2626','#F5A623','#10B981'].map(c => <div key={c} style={{ width:8, height:8, borderRadius:'50%', background:c }} />)}
                    </div>
                    <div style={{ height:4, background:t.text, borderRadius:2, marginBottom:3, opacity:.6 }} />
                    <div style={{ height:3, background:t.text, borderRadius:2, width:'70%', margin:'0 auto', opacity:.3 }} />
                  </div>
                  <div style={{ background:'rgba(0,0,0,.15)', padding:'6px', fontSize:11, fontWeight:700, color:t.text, textAlign:'center' }}>
                    {t.label}{state.theme===t.id?' ✓':''}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={CARD}>
            <SectionTitle>Typography</SectionTitle>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Font Family</div>
                <select value={custom.fontFamily||'Inter'} onChange={e => setCustom({ fontFamily:e.target.value })} style={S}>
                  {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Base Font Size: {custom.fontSize||13}px</div>
                <input type="range" min={11} max={16} value={parseInt(custom.fontSize)||13} onChange={e => setCustom({ fontSize:e.target.value })} style={{ width:'100%', accentColor:'var(--brand)' }} />
              </div>
            </div>
          </div>

          <div style={CARD}>
            <SectionTitle>Layout</SectionTitle>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Border Radius: {custom.borderRadius||12}px</div>
                <input type="range" min={0} max={20} value={parseInt(custom.borderRadius)||12} onChange={e => setCustom({ borderRadius:e.target.value })} style={{ width:'100%', accentColor:'var(--brand)', marginBottom:8 }} />
                <div style={{ display:'flex', gap:6 }}>
                  {[0,6,12,18].map(r => (
                    <div key={r} onClick={() => setCustom({ borderRadius:String(r) })}
                      style={{ width:32, height:24, border:'2px solid '+(parseInt(custom.borderRadius)===r?'var(--brand)':'var(--border)'), borderRadius:r+'px', cursor:'pointer', background:'var(--dim)' }} />
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Sidebar Width: {custom.sidebarWidth||220}px</div>
                <input type="range" min={180} max={280} step={10} value={parseInt(custom.sidebarWidth)||220} onChange={e => setCustom({ sidebarWidth:e.target.value })} style={{ width:'100%', accentColor:'var(--brand)' }} />
              </div>
            </div>
            <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', marginBottom:10 }}>
              <input type="checkbox" checked={!!custom.compactMode} onChange={e => setCustom({ compactMode:e.target.checked })} style={{ width:16, height:16, accentColor:'var(--brand)' }} />
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>Compact Mode</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>Reduce padding and spacing throughout the app</div>
              </div>
            </label>
          </div>

          {prefs && (
            <div style={CARD}>
              <SectionTitle>Per-Page Layout Preferences</SectionTitle>
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {[
                  { key:'layout.tableRowHeight', label:'Table row height', options:ROW_HEIGHTS.map(r => ({ value:r.id, label:r.label+' — '+r.hint })) },
                  { key:'layout.dateFormat',     label:'Date format',      options:DATE_FORMATS.map(f => ({ value:f, label:f })) },
                  { key:'layout.timeFormat',     label:'Time format',      options:[{ value:'12h', label:'12-hour (2:30 PM)' },{ value:'24h', label:'24-hour (14:30)' }] },
                  { key:'layout.contactsView',   label:'Contacts default view', options:[{ value:'table', label:'Table' },{ value:'cards', label:'Cards' }] },
                  { key:'layout.listingsView',   label:'Listings default view',  options:[{ value:'grid', label:'Grid' },{ value:'table', label:'Table' }] },
                  { key:'layout.tasksView',      label:'Tasks default view',      options:[{ value:'list', label:'List' },{ value:'kanban', label:'Kanban' },{ value:'calendar', label:'Calendar' }] },
                ].map(item => {
                  const parts = item.key.split('.')
                  const val = parts.reduce((o,k) => o?.[k], prefs)
                  return (
                    <div key={item.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                      <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{item.label}</div>
                      <select value={val||''} onChange={e => setPref(item.key, e.target.value)}
                        style={{ ...S, width:'auto', minWidth:160 }}>
                        {item.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  )
                })}
              </div>
              <div style={{ marginTop:16 }}>
                <Btn onClick={handleSavePrefs} loading={savingPrefs}>Save Preferences</Btn>
              </div>
            </div>
          )}

          <div style={CARD}>
            <SectionTitle>Preview</SectionTitle>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
              <div style={{ padding:'8px 16px', borderRadius:'var(--radius)', background:'var(--brand)', color:'#fff', fontSize:13, fontWeight:700 }}>Primary Button</div>
              <div style={{ padding:'8px 16px', borderRadius:'var(--radius)', background:'var(--dim)', color:'var(--text)', fontSize:13, fontWeight:600, border:'1px solid var(--border)' }}>Secondary</div>
              <div style={{ padding:'3px 10px', borderRadius:99, background:'rgba(204,34,0,.12)', color:'var(--brand)', fontSize:11, fontWeight:700 }}>Badge</div>
              <div style={{ width:36, height:36, borderRadius:'var(--radius)', background:'var(--sidebar)' }} />
            </div>
          </div>
        </>
      )}

      {/* ── NOTIFICATIONS ── */}
      {tab === 'notifications' && prefs && (
        <div style={CARD}>
          <SectionTitle>Notification Preferences</SectionTitle>
          <div style={{ fontSize:12, color:'var(--muted)', marginBottom:14, lineHeight:1.6 }}>
            Choose what triggers a notification in the bell menu (top right) and optionally email.
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
            {NOTIF_GROUPS.map(n => {
              const val = prefs.notifications?.[n.key] ?? true
              return (
                <div key={n.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:18 }}>{n.icon}</span>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{n.label}</div>
                  </div>
                  <label style={{ position:'relative', display:'inline-block', width:42, height:24, cursor:'pointer' }}>
                    <input type="checkbox" checked={val} onChange={e => setPref('notifications.'+n.key, e.target.checked)} style={{ opacity:0, width:0, height:0 }} />
                    <div style={{ position:'absolute', inset:0, borderRadius:12, background:val?'var(--brand)':'var(--border)', transition:'background .2s' }}>
                      <div style={{ position:'absolute', top:3, left:val?'21px':'3px', width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left .2s', boxShadow:'0 1px 4px rgba(0,0,0,.2)' }} />
                    </div>
                  </label>
                </div>
              )
            })}
          </div>
          <div style={{ marginTop:16 }}>
            <Btn onClick={handleSavePrefs} loading={savingPrefs}>Save Notification Settings</Btn>
          </div>
        </div>
      )}

      {/* ── PREFERENCES ── */}
      {tab === 'preferences' && prefs && (
        <>
          <div style={CARD}>
            <SectionTitle>Default Sorts</SectionTitle>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:14 }}>
              Choose the default sort order for each page when you first open it.
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {[
                { page:'contacts',   label:'Contacts',    opts:[{v:'created_at',l:'Date Added'},{v:'first_name',l:'Name'},{v:'status',l:'Status'},{v:'last_activity',l:'Last Activity'}] },
                { page:'listings',   label:'Listings',    opts:[{v:'created_at',l:'Date Added'},{v:'list_price',l:'Price'},{v:'status',l:'Status'},{v:'addr',l:'Address'}] },
                { page:'tasks',      label:'Tasks',       opts:[{v:'due_date',l:'Due Date'},{v:'priority',l:'Priority'},{v:'created_at',l:'Date Created'},{v:'status',l:'Status'}] },
                { page:'production', label:'Production',  opts:[{v:'ao_date',l:'A/O Date'},{v:'close_date',l:'Close Date'},{v:'production',l:'Price'},{v:'gci',l:'GCI'}] },
                { page:'calls',      label:'Calls',       opts:[{v:'called_at',l:'Date'},{v:'duration_sec',l:'Duration'},{v:'direction',l:'Direction'}] },
              ].map(({ page, label, opts }) => {
                const sort = prefs.sorts?.[page] || {}
                return (
                  <div key={page} style={{ display:'grid', gridTemplateColumns:'120px 1fr 100px', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</div>
                    <select value={sort.key||opts[0].v} onChange={e => setPref('sorts.'+page+'.key', e.target.value)} style={S}>
                      {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                    <select value={sort.dir||'desc'} onChange={e => setPref('sorts.'+page+'.dir', e.target.value)} style={S}>
                      <option value="asc">Ascending ↑</option>
                      <option value="desc">Descending ↓</option>
                    </select>
                  </div>
                )
              })}
            </div>
          </div>

          <div style={CARD}>
            <SectionTitle>Column Visibility</SectionTitle>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:14 }}>
              Choose which columns are visible by default on each page. You can also toggle columns in real-time using the Columns button on each page.
            </div>
            {[
              { page:'contacts',   label:'Contacts',   cols:[{k:'phone',l:'Phone'},{k:'email',l:'Email'},{k:'source',l:'Source'},{k:'status',l:'Status'},{k:'agent',l:'Agent'},{k:'stage',l:'Stage'},{k:'created',l:'Date Added'},{k:'city',l:'City'}] },
              { page:'listings',   label:'Listings',   cols:[{k:'addr',l:'Address'},{k:'price',l:'Price'},{k:'status',l:'Status'},{k:'agent',l:'Agent'},{k:'city',l:'City'},{k:'type',l:'Type'},{k:'beds',l:'Beds'},{k:'baths',l:'Baths'},{k:'dom',l:'Days on Market'}] },
              { page:'tasks',      label:'Tasks',      cols:[{k:'title',l:'Title'},{k:'priority',l:'Priority'},{k:'status',l:'Status'},{k:'due',l:'Due Date'},{k:'agent',l:'Agent'},{k:'contact',l:'Contact'},{k:'notes',l:'Notes'}] },
              { page:'production', label:'Production', cols:[{k:'addr',l:'Address'},{k:'agent',l:'Agent'},{k:'side',l:'Side'},{k:'stage',l:'Stage'},{k:'production',l:'Production $'},{k:'gci',l:'GCI $'},{k:'ao_date',l:'A/O Date'},{k:'close_date',l:'Close Date'},{k:'client',l:'Client'}] },
            ].map(({ page, label, cols }) => (
              <div key={page} style={{ marginBottom:16 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'var(--text)', marginBottom:8, textTransform:'uppercase', letterSpacing:'.05em' }}>{label}</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {cols.map(col => {
                    const visible = prefs.columns?.[page]?.[col.k] !== false
                    return (
                      <button key={col.k} onClick={() => setPref('columns.'+page+'.'+col.k, !visible)}
                        style={{ padding:'5px 12px', borderRadius:99, border:'1px solid '+(visible?'var(--brand)':'var(--border)'), background:visible?'rgba(204,34,0,.08)':'transparent', color:visible?'var(--brand)':'var(--muted)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:ff }}>
                        {visible?'✓ ':''}{col.l}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            <Btn onClick={handleSavePrefs} loading={savingPrefs}>Save Column Preferences</Btn>
          </div>
        </>
      )}

      {/* ── SHORTCUTS ── */}
      {tab === 'shortcuts' && (
        <div style={CARD}>
          <SectionTitle>Keyboard Shortcuts</SectionTitle>
          <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16, lineHeight:1.6 }}>
            These shortcuts work throughout the CRM. Custom shortcut binding coming in a future update.
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:'2px solid var(--border)' }}>
                <th style={{ textAlign:'left', padding:'8px 12px 8px 0', fontSize:10, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em' }}>Keys</th>
                <th style={{ textAlign:'left', padding:'8px 12px 8px 0', fontSize:10, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em' }}>Action</th>
                <th style={{ textAlign:'left', padding:'8px 0 8px 0',   fontSize:10, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em' }}>Available In</th>
              </tr>
            </thead>
            <tbody>
              {SHORTCUTS.map((s,i) => (
                <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}>
                  <td style={{ padding:'10px 12px 10px 0' }}>
                    <div style={{ display:'flex', gap:4 }}>
                      {s.keys.map(k => (
                        <kbd key={k} style={{ padding:'2px 7px', borderRadius:5, background:'var(--dim)', border:'1px solid var(--border)', fontSize:11, fontFamily:'monospace', fontWeight:700, color:'var(--text)' }}>{k}</kbd>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding:'10px 12px 10px 0', fontWeight:600, color:'var(--text)' }}>{s.action}</td>
                  <td style={{ padding:'10px 0', fontSize:11, color:'var(--muted)' }}>{s.scope}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── PHONE SETUP ── */}
      {tab === 'phone' && (
        <div style={CARD}>
          <SectionTitle>Browser Phone Configuration</SectionTitle>
          <PhoneSetup />
        </div>
      )}
    </div>
  )
}
