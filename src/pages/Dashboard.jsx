
// ════════════════════════════════════════════════════════════════
// MAIN DASHBOARD COMPONENT
// ════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// WIDGET CONFIG MODAL — filter/display options per widget
// ═══════════════════════════════════════════════════════════════
const WIDGET_CONFIG_OPTIONS = {
  gci_goal:      { label: 'My GCI Goal',           fields: [{ key:'year', label:'Year', type:'year' }] },
  team_goal:     { label: 'Team Goal',             fields: [{ key:'year', label:'Year', type:'year' }] },
  quick_stats:   { label: 'Quick Stats',           fields: [{ key:'year', label:'Year', type:'year' }, { key:'agentFilter', label:'Filter Agent', type:'agent' }] },
  pipeline:      { label: 'Pipeline by Stage',     fields: [{ key:'agentFilter', label:'Filter Agent', type:'agent' }, { key:'sideFilter', label:'Side', type:'select', options:['All','Buyer','Listing','Dual Buyer','Dual Listing','Flip'] }, { key:'limit', label:'Max items', type:'number', min:3, max:20, default:8 }] },
  todays_tasks:  { label: "Today's Tasks",         fields: [{ key:'agentFilter', label:'Filter Agent', type:'agent' }, { key:'priorityFilter', label:'Priority', type:'select', options:['All','urgent','high','normal','low'] }, { key:'limit', label:'Max items', type:'number', min:3, max:20, default:6 }] },
  hot_leads:     { label: 'Hot & Warm Leads',      fields: [{ key:'agentFilter', label:'Filter Agent', type:'agent' }, { key:'statusFilter', label:'Status', type:'select', options:['All','Hot','Warm','Cold','Active','New'] }, { key:'sourceFilter', label:'Source', type:'select', options:['All','SOI','Zillow','Referral','Farm - Open House','System Call','Past Client Repeat'] }, { key:'limit', label:'Max items', type:'number', min:3, max:20, default:6 }] },
  active_deals:  { label: 'Active Deals',          fields: [{ key:'agentFilter', label:'Filter Agent', type:'agent' }, { key:'stageFilter', label:'Stage', type:'select', options:['All','Negotiations','Offer Accapted','Under Shtar','Under Contract'] }, { key:'sideFilter', label:'Side', type:'select', options:['All','Buyer','Listing','Dual Buyer','Dual Listing'] }, { key:'limit', label:'Max items', type:'number', min:3, max:20, default:6 }] },
  upcoming_close:{ label: 'Upcoming Closings',     fields: [{ key:'agentFilter', label:'Filter Agent', type:'agent' }, { key:'daysAhead', label:'Days ahead', type:'number', min:7, max:90, default:30 }, { key:'limit', label:'Max items', type:'number', min:3, max:20, default:6 }] },
  active_listings:{ label: 'Active Listings',      fields: [{ key:'agentFilter', label:'Filter Agent', type:'agent' }, { key:'statusFilter', label:'Status', type:'select', options:['All','Active','Under Contract','Coming Soon'] }, { key:'limit', label:'Max items', type:'number', min:3, max:20, default:6 }] },
  leaderboard:   { label: 'Team Leaderboard',      fields: [{ key:'year', label:'Year', type:'year' }, { key:'metric', label:'Rank by', type:'select', options:['gci','production','deal_count'], default:'gci' }, { key:'limit', label:'Show top N', type:'number', min:2, max:8, default:5 }] },
  gci_chart:     { label: 'GCI by Month',          fields: [{ key:'year', label:'Year', type:'year' }, { key:'agentFilter', label:'Filter Agent', type:'agent' }, { key:'chartType', label:'Chart style', type:'select', options:['bar','line'], default:'bar' }] },
  open_houses:   { label: 'Open Houses This Week', fields: [{ key:'agentFilter', label:'Filter Agent', type:'agent' }, { key:'daysAhead', label:'Days ahead', type:'number', min:3, max:30, default:7 }] },
  overdue_alert: { label: 'Overdue Alert',         fields: [{ key:'agentFilter', label:'Filter Agent', type:'agent' }, { key:'limit', label:'Max items', type:'number', min:3, max:20, default:5 }] },
  announcements: { label: 'Announcements',         fields: [{ key:'priorityFilter', label:'Priority', type:'select', options:['All','urgent','high','normal','low'] }, { key:'limit', label:'Max items', type:'number', min:2, max:10, default:3 }] },
  gifts_pending:    { label: 'Gifts Pending',       fields: [{ key:'agentFilter', label:'Filter Agent', type:'agent' }, { key:'statusFilter', label:'Status', type:'select', options:['All','Pending','Ordered','Delivered'] }, { key:'limit', label:'Max items', type:'number', min:3, max:20, default:6 }] },
  production_stats: { label: 'Production Stats',   fields: [
    { key:'year',        label:'Year',          type:'year' },
    { key:'agentFilter', label:'Filter Agent',  type:'agent' },
    { key:'stageFilter', label:'Stage',         type:'select', options:['All','Offer Accapted','Under Shtar','Under Contract','Closed','Deal Fell Through'], default:'All' },
    { key:'sideFilter',  label:'Side',          type:'select', options:['All','Buyer','Listing','Dual Buyer','Dual Listing','Flip'], default:'All' },
    { key:'metric',      label:'Show',          type:'select', options:['GCI','Volume','Deal Count','Avg GCI'], default:'GCI' },
    { key:'display',     label:'Display as',    type:'select', options:['numbers','bar','breakdown'], default:'numbers' },
  ]},
}

const YEARS_LIST = []
for (let y = new Date().getFullYear(); y >= 2020; y--) YEARS_LIST.push(y.toString())

// ═══════════════════════════════════════════════════════════════
// FIELD CATALOG WIRING — Phase 4 of UNIVERSAL_FIELD_SYSTEM_PROPOSAL.md
//
// Which entity's custom fields (from src/lib/customFields.js, merged
// via src/lib/fieldCatalog.js) a given widget's config should offer,
// alongside its own hardcoded WIDGET_CONFIG_OPTIONS fields above.
// Only widgets that show rows from ONE clear entity are listed here —
// todays_tasks/announcements/gifts_pending etc. are left out on
// purpose: 'tasks' isn't one of customFields.js's supported entities
// ('contacts' | 'deals' | 'listings'), so there's nothing to merge in.
// ═══════════════════════════════════════════════════════════════
const WIDGET_ENTITY = {
  hot_leads:         'contacts',
  active_deals:      'deals',
  production_stats:  'deals',
  active_listings:   'listings',
}

// Generic custom-field filter check for Dashboard widgets -- the
// in-memory sibling of applySegmentCondition's `custom_data->>key`
// fallback in src/lib/segments.js. Widgets here filter already-
// fetched arrays client-side rather than building a Supabase query,
// so this can't share that function's code directly, but it follows
// the same idea: any wcfg key that ISN'T one of a widget's own
// hardcoded fields (passed in as `knownKeys`) is looked up in the
// entity's field catalog and, if it's a custom field, matched against
// that row's custom_data. Unknown/unset/'All' values are a no-op, so
// widgets with no custom fields configured behave exactly as before.
function matchesCustomFilters(row, wcfg, knownKeys, catalog) {
  for (const key of Object.keys(wcfg || {})) {
    if (knownKeys.includes(key)) continue
    const field = (catalog || []).find(f => f.key === key && f.custom)
    if (!field) continue
    const val = wcfg[key]
    if (val === undefined || val === '' || val === 'All') continue
    if (String(row?.custom_data?.[field.key] ?? '') !== String(val)) return false
  }
  return true
}

function WidgetConfigModal({ widget, agents, customFields, onSave, onClose }) {
  const def = WIDGET_CONFIG_OPTIONS[widget?.id]
  const [cfg, setCfg] = useState(() => ({ ...(widget?.config || {}) }))
  const set = (key, val) => setCfg(prev => ({ ...prev, [key]: val }))
  // Built-in fields for this widget + any custom fields the admin has
  // added on this widget's entity (contacts/deals/listings) via the
  // Custom Fields page -- see WIDGET_ENTITY above. Additive only: a
  // widget with no custom fields configured renders exactly as before.
  const fields = [...(def?.fields || []), ...(customFields || [])]

  if (!def) return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', fontFamily:ff }}>
      <div style={{ background:'var(--panel)', borderRadius:'14px', padding:'28px', textAlign:'center' }}>
        <div style={{ fontSize:'13px', color:'var(--muted)', marginBottom:'14px' }}>No configuration options for this widget.</div>
        <Btn variant="secondary" onClick={onClose}>Close</Btn>
      </div>
    </div>
  )

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', fontFamily:ff }}>
      <div style={{ background:'var(--panel)', borderRadius:'14px', width:'100%', maxWidth:'440px', boxShadow:'0 20px 50px rgba(0,0,0,.3)', overflow:'hidden' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:'10px' }}>
          <span style={{ fontSize:'18px' }}>{WIDGET_DEFS[widget.id]?.icon || '⚙️'}</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:'14px', fontWeight:800, color:'var(--text)' }}>Configure — {def.label}</div>
            <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:'1px' }}>Customize what this widget shows</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'18px', cursor:'pointer', color:'var(--muted)' }}>✕</button>
        </div>
        <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:'14px' }}>
          {fields.map(field => (
            <div key={field.key}>
              <div style={{ fontSize:'11px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'6px' }}>{field.label}{field.custom && <span style={{ fontWeight:400, textTransform:'none', letterSpacing:'normal' }}> (custom field)</span>}</div>
              {field.type === 'year' && (
                <select value={cfg[field.key] || new Date().getFullYear().toString()} onChange={e => set(field.key, e.target.value)}
                  style={{ width:'100%', padding:'8px 10px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff }}>
                  <option value="">All Years</option>
                  {YEARS_LIST.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              )}
              {field.type === 'agent' && (
                <select value={cfg[field.key] || ''} onChange={e => set(field.key, e.target.value)}
                  style={{ width:'100%', padding:'8px 10px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff }}>
                  <option value="">All Agents</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
              {field.type === 'select' && (
                <select value={cfg[field.key] || field.default || (field.custom ? '' : field.options[0])} onChange={e => set(field.key, e.target.value)}
                  style={{ width:'100%', padding:'8px 10px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff }}>
                  {/* Built-in fields' options are plain strings; custom-field
                      options (src/lib/customFields.js) may be plain strings OR
                      {label,value,color} objects -- same defensive lookup
                      Segments.jsx already uses for this exact ambiguity. */}
                  {field.custom && <option value="">All</option>}
                  {(field.options||[]).map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
                </select>
              )}
              {field.type === 'bool' && (
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:'13px', color:'var(--text)', cursor:'pointer' }}>
                  <input type="checkbox" checked={cfg[field.key] === 'true'}
                    onChange={e => set(field.key, e.target.checked ? 'true' : '')} />
                  Only show when set
                </label>
              )}
              {field.type === 'text' && (
                <input value={cfg[field.key] || ''} onChange={e => set(field.key, e.target.value)}
                  placeholder={'Filter by ' + field.label.toLowerCase() + '...'}
                  style={{ width:'100%', padding:'8px 10px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff, boxSizing:'border-box' }} />
              )}
              {field.type === 'number' && (
                <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                  <input type="range" min={field.min||1} max={field.max||20}
                    value={parseInt(cfg[field.key])||field.default||field.min||5}
                    onChange={e => set(field.key, parseInt(e.target.value))}
                    style={{ flex:1, accentColor:'#CC2200' }} />
                  <div style={{ width:40, height:32, borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', fontWeight:800, color:'var(--text)', flexShrink:0 }}>
                    {parseInt(cfg[field.key])||field.default||field.min||5}
                  </div>
                </div>
              )}
            </div>
          ))}
          <button onClick={() => setCfg({})}
            style={{ fontSize:'11px', color:'var(--muted)', background:'none', border:'none', cursor:'pointer', textAlign:'left', padding:0, fontFamily:ff, textDecoration:'underline', marginTop:'-4px' }}>
            Reset to defaults
          </button>
        </div>
        <div style={{ padding:'12px 18px', borderTop:'1px solid var(--border)', display:'flex', gap:'8px', justifyContent:'flex-end' }}>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={() => { onSave({ ...widget, config: cfg }); onClose() }}>✅ Apply</Btn>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// WIDGET MANAGER — add/remove/reorder widgets from a central panel
// ═══════════════════════════════════════════════════════════════
function WidgetManager({ widgets, role, onSave, onClose, onAddCustom }) {
  const [wids, setWids] = useState(() => {
    // Ensure all known widget IDs are represented
    const existing = new Set(widgets.map(w => w.id))
    const allBuiltIn = Object.entries(WIDGET_DEFS)
      .filter(([id, d]) => id !== 'custom' && d.roles.includes(role))
      .map(([id, d]) => widgets.find(w => w.id === id) || { id, visible: false, size: 'md', color: '#CC2200' })
    // Include custom widgets too
    const customs = widgets.filter(w => w.id.startsWith('custom_'))
    return [...allBuiltIn, ...customs]
  })

  const visible = wids.filter(w => w.visible !== false)
  const hidden  = wids.filter(w => w.visible === false)

  function toggle(id) {
    setWids(prev => prev.map(w => w.id === id ? { ...w, visible: !w.visible } : w))
  }

  function setSize(id, size) {
    setWids(prev => prev.map(w => w.id === id ? { ...w, size } : w))
  }

  function setColor(id, color) {
    setWids(prev => prev.map(w => w.id === id ? { ...w, color } : w))
  }

  function removeCustom(id) {
    setWids(prev => prev.filter(w => w.id !== id))
  }

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', fontFamily:ff }}>
      <div style={{ background:'var(--panel)', borderRadius:'14px', width:'100%', maxWidth:'640px', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 50px rgba(0,0,0,.3)', overflow:'hidden' }}>
        {/* Header */}
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:'10px' }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:'15px', fontWeight:800, color:'var(--text)' }}>📐 Widget Manager</div>
            <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:'1px' }}>{visible.length} visible · {hidden.length} hidden</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'18px', cursor:'pointer', color:'var(--muted)' }}>✕</button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'16px 18px' }}>
          {/* Active widgets */}
          <div style={{ fontSize:'11px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'10px' }}>
            Active Widgets — {visible.length}
          </div>
          {visible.map(w => {
            const isCustom = w.id.startsWith('custom_') || w.id === 'custom'
            const def = isCustom ? { label: w.customConfig?.label || 'Custom', icon: w.customConfig?.icon || '🔲' } : WIDGET_DEFS[w.id]
            if (!def) return null
            return (
              <div key={w.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', background:'var(--dim)', borderRadius:'9px', border:'1px solid var(--border)', marginBottom:'6px' }}>
                <span style={{ fontSize:'18px', flexShrink:0 }}>{def.icon}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'13px', fontWeight:700, color:'var(--text)' }}>{def.label}</div>
                  {isCustom && w.customConfig?.statuses?.length > 0 && (
                    <div style={{ fontSize:'10px', color:'var(--muted)' }}>Filter: {w.customConfig.statuses.join(', ')}</div>
                  )}
                </div>
                {/* Size toggle */}
                <div style={{ display:'flex', background:'var(--panel)', borderRadius:'6px', padding:'2px', gap:'2px' }}>
                  {[['md','½'],['lg','▭']].map(([sz, lbl]) => (
                    <button key={sz} onClick={() => setSize(w.id, sz)}
                      style={{ padding:'3px 8px', borderRadius:'5px', border:'none', background: w.size===sz ? '#CC2200' : 'transparent', color: w.size===sz ? '#fff' : 'var(--muted)', fontSize:'11px', fontWeight:700, cursor:'pointer', fontFamily:ff }}>
                      {lbl}
                    </button>
                  ))}
                </div>
                {/* Color swatches */}
                <div style={{ display:'flex', gap:'3px' }}>
                  {['#CC2200','#10B981','#3B82F6','#F5A623','#8B5CF6','#EC4899'].map(c => (
                    <div key={c} onClick={() => setColor(w.id, c)}
                      style={{ width:14, height:14, borderRadius:'50%', background:c, cursor:'pointer', border:(w.color||'#CC2200')===c ? '2px solid var(--text)' : '1px solid transparent' }} />
                  ))}
                </div>
                {/* Hide button */}
                <button onClick={() => toggle(w.id)}
                  style={{ padding:'4px 8px', borderRadius:'6px', border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', fontSize:'11px', cursor:'pointer', fontFamily:ff, flexShrink:0 }}>
                  Hide
                </button>
                {isCustom && (
                  <button onClick={() => removeCustom(w.id)}
                    style={{ padding:'4px 8px', borderRadius:'6px', border:'1px solid #DC262644', background:'#FEF2F2', color:'#DC2626', fontSize:'11px', cursor:'pointer', fontFamily:ff, flexShrink:0 }}>
                    Delete
                  </button>
                )}
              </div>
            )
          })}

          {/* Hidden widgets */}
          {hidden.length > 0 && (
            <div style={{ marginTop:'16px' }}>
              <div style={{ fontSize:'11px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'10px' }}>
                Hidden — click to show
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' }}>
                {hidden.map(w => {
                  const isCustom = w.id.startsWith('custom_') || w.id === 'custom'
                  const def = isCustom ? { label: w.customConfig?.label || 'Custom', icon: w.customConfig?.icon || '🔲' } : WIDGET_DEFS[w.id]
                  if (!def) return null
                  return (
                    <button key={w.id} onClick={() => toggle(w.id)}
                      style={{ display:'flex', alignItems:'center', gap:'8px', padding:'9px 12px', borderRadius:'9px', border:'1px dashed var(--border)', background:'transparent', color:'var(--muted)', fontSize:'12px', fontWeight:600, cursor:'pointer', fontFamily:ff, textAlign:'left' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#CC2200'; e.currentTarget.style.color = '#CC2200' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}>
                      <span style={{ fontSize:'16px' }}>{def.icon}</span>
                      + {def.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 18px', borderTop:'1px solid var(--border)', display:'flex', gap:'8px', alignItems:'center' }}>
          <button onClick={onAddCustom}
            style={{ display:'flex', alignItems:'center', gap:'6px', padding:'7px 14px', borderRadius:'8px', border:'2px dashed #CC2200', background:'rgba(204,34,0,.04)', color:'#CC2200', fontSize:'12px', fontWeight:700, cursor:'pointer', fontFamily:ff }}>
            🔲 + Custom Widget
          </button>
          <div style={{ flex:1 }} />
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={() => { onSave(wids); onClose() }} style={{ background:'#10B981', border:'none' }}>
            💾 Save Changes
          </Btn>
        </div>
      </div>
    </div>
  )
}
