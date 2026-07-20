import { useState, useEffect, useCallback, useRef } from 'react'
import GridLayout from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { BOARD_OPTIONS } from '../lib/boardOptions'
import { loadDashPrefs, saveDashPrefs } from '../lib/dashboardPrefs'
import { WidgetContent } from '../components/SmartWidget'

// Smart dashboard: a grid of query-driven widgets. Every widget filters
// any board on any field(s), displays as number/chart/list/table, and is
// freely dragged + resized. Layout persists per user. Professional, dense,
// no emoji. This is the "calculator" board — add anything from the CRM.

const ff = 'Inter, system-ui, -apple-system, sans-serif'
const COLS = 12
const ROW_H = 70
const COLORS = ['#2563EB','#059669','#D97706','#DC2626','#7C3AED','#0891B2','#DB2777','#475569']

const TIMEFRAMES = [
  { id:'all', label:'All time' }, { id:'today', label:'Today' }, { id:'week', label:'7 days' },
  { id:'month', label:'30 days' }, { id:'quarter', label:'90 days' }, { id:'ytd', label:'Year to date' },
]
const DISPLAYS = [
  { id:'number', label:'Number' }, { id:'bar', label:'Bar chart' }, { id:'donut', label:'Donut' },
  { id:'list', label:'List' }, { id:'table', label:'Table' },
]

// Starter widgets so a fresh board already shows where you stand.
function starterWidgets() {
  return [
    { i:'w_gci', title:'Closed GCI (YTD)', board:'deals', statuses:['Closed'], dateRange:'ytd', display:'number', metric:'gci', agentScope:'all', color:'#059669', x:0, y:0, w:3, h:2 },
    { i:'w_pipe', title:'Pipeline by Stage', board:'deals', statuses:[], dateRange:'all', display:'bar', groupBy:'stage', agentScope:'all', color:'#2563EB', x:3, y:0, w:5, h:3 },
    { i:'w_active', title:'Active Deals', board:'deals', statuses:['Negotiations','Offer Accapted','Under Shtar','Under Contract'], dateRange:'all', display:'number', agentScope:'all', color:'#2563EB', x:8, y:0, w:2, h:2 },
    { i:'w_hot', title:'Hot Leads', board:'contacts', statuses:['Hot'], dateRange:'all', display:'number', agentScope:'all', color:'#D97706', x:10, y:0, w:2, h:2 },
    { i:'w_tasks', title:'Open Tasks', board:'tasks', statuses:['pending','in_progress'], dateRange:'all', display:'number', agentScope:'mine', color:'#DC2626', x:0, y:2, w:3, h:2 },
    { i:'w_listings', title:'Active Listings', board:'listings', statuses:['Active'], dateRange:'all', display:'number', agentScope:'all', color:'#0891B2', x:8, y:2, w:4, h:2 },
    { i:'w_recent', title:'Recent Contacts', board:'contacts', statuses:[], dateRange:'month', display:'list', agentScope:'all', color:'#7C3AED', x:0, y:4, w:5, h:4 },
    { i:'w_dealtable', title:'Deals — Detail', board:'deals', statuses:[], dateRange:'all', display:'table', columns:['addr','stage','gci','ao_date'], agentScope:'all', color:'#2563EB', x:5, y:4, w:7, h:4 },
  ]
}

export function DashboardSmart() {
  const { agent, isAdmin } = useAuth()
  const { toast } = useApp()
  const [widgets, setWidgets] = useState(null)
  const [edit, setEdit] = useState(false)
  const [builderFor, setBuilderFor] = useState(null)   // widget being edited, or 'new'
  const [width, setWidth] = useState(1200)
  const wrapRef = useRef(null)

  useEffect(() => {
    function onResize() { if (wrapRef.current) setWidth(wrapRef.current.offsetWidth) }
    onResize(); window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [widgets])

  useEffect(() => {
    if (!agent) return
    loadDashPrefs(agent.id).then(prefs => {
      const saved = prefs?.layout?.smart
      setWidgets(Array.isArray(saved) && saved.length ? saved : starterWidgets())
    }).catch(() => setWidgets(starterWidgets()))
  }, [agent])

  const persist = useCallback((next) => {
    setWidgets(next)
    if (agent) loadDashPrefs(agent.id).then(prefs => {
      const layout = { ...(prefs?.layout || {}), smart: next }
      saveDashPrefs(agent.id, prefs?.widgets || [], layout).catch(()=>{})
    })
  }, [agent])

  function onLayoutChange(layout) {
    if (!widgets) return
    const map = Object.fromEntries(layout.map(l => [l.i, l]))
    const next = widgets.map(w => map[w.i] ? { ...w, x:map[w.i].x, y:map[w.i].y, w:map[w.i].w, h:map[w.i].h } : w)
    persist(next)
  }

  function saveWidget(cfg) {
    if (cfg.i && widgets.some(w => w.i === cfg.i)) {
      persist(widgets.map(w => w.i === cfg.i ? cfg : w))
    } else {
      const ni = 'w_' + Date.now()
      persist([...widgets, { ...cfg, i:ni, x:0, y:Infinity, w:cfg.w||3, h:cfg.h||2 }])
    }
    setBuilderFor(null)
  }
  function removeWidget(i) { persist(widgets.filter(w => w.i !== i)) }

  if (!widgets) return <div style={{ padding:40, textAlign:'center', color:'var(--muted)', fontFamily:ff }}>Loading dashboard…</div>

  const layout = widgets.map(w => ({ i:w.i, x:w.x||0, y:w.y||0, w:w.w||3, h:w.h||2, minW:2, minH:2 }))
  const first = agent?.name?.split(' ')[0] || ''

  return (
    <div ref={wrapRef} style={{ fontFamily: ff }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:8 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800, color:'var(--text)' }}>Dashboard</div>
          <div style={{ fontSize:13, color:'var(--muted)' }}>{new Date().toLocaleDateString('en-US',{ weekday:'long', month:'long', day:'numeric' })}{first?' · '+first:''}</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {edit && <button onClick={() => setBuilderFor('new')} style={btn('#2563EB','#fff')}>+ Add widget</button>}
          <button onClick={() => setEdit(e=>!e)} style={btn(edit?'#059669':'var(--dim)', edit?'#fff':'var(--text)')}>{edit ? 'Done' : 'Edit layout'}</button>
        </div>
      </div>

      {edit && <div style={{ fontSize:12, color:'var(--muted)', marginBottom:10 }}>Drag to move · drag the bottom-right corner to resize · click a widget's gear to edit its data.</div>}

      <GridLayout className="layout" layout={layout} cols={COLS} rowHeight={ROW_H} width={width}
        isDraggable={edit} isResizable={edit} onLayoutChange={onLayoutChange} margin={[12,12]} draggableCancel=".no-drag">
        {widgets.map(w => (
          <div key={w.i} style={{ background:'var(--panel)', border:'1px solid var(--border)', borderLeft:'3px solid '+(w.color||'#2563EB'), borderRadius:12, padding:14, overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8, gap:6 }}>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.03em', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{w.title}</span>
              {edit && (
                <span className="no-drag" style={{ display:'flex', gap:4, flexShrink:0 }}>
                  <button onClick={() => setBuilderFor(w)} style={miniBtn}>Edit</button>
                  <button onClick={() => removeWidget(w.i)} style={{ ...miniBtn, color:'#DC2626' }}>✕</button>
                </span>
              )}
            </div>
            <div style={{ flex:1, minHeight:0 }} className={edit ? 'no-drag' : ''}>
              <WidgetContent config={w} agentId={agent?.id} isAdmin={isAdmin} />
            </div>
          </div>
        ))}
      </GridLayout>

      {builderFor && (
        <WidgetBuilder
          initial={builderFor === 'new' ? null : builderFor}
          agents={[]} isAdmin={isAdmin}
          onClose={() => setBuilderFor(null)} onSave={saveWidget} />
      )}
    </div>
  )
}

// ── Widget builder ─────────────────────────────────────────────
function WidgetBuilder({ initial, onClose, onSave, isAdmin }) {
  const [cfg, setCfg] = useState(initial || { board:'deals', statuses:[], dateRange:'all', display:'number', agentScope: isAdmin?'all':'mine', color:'#2563EB', title:'' })
  const boardDef = BOARD_OPTIONS.find(b => b.id === cfg.board)
  const set = (k,v) => setCfg(c => ({ ...c, [k]:v }))
  const toggleArr = (k,v) => setCfg(c => { const a=new Set(c[k]||[]); a.has(v)?a.delete(v):a.add(v); return { ...c, [k]:[...a] } })
  const isCustom = String(cfg.dateRange||'').startsWith('custom:')

  const L = { fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.04em', margin:'12px 0 6px' }
  const chip = (on) => ({ padding:'5px 11px', borderRadius:99, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:ff, border:'1px solid '+(on?'#2563EB':'var(--border)'), background:on?'rgba(37,99,235,.1)':'transparent', color:on?'#2563EB':'var(--muted)' })

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--panel)', borderRadius:16, padding:24, width:'100%', maxWidth:560, maxHeight:'90vh', overflowY:'auto', fontFamily:ff }}>
        <div style={{ fontSize:17, fontWeight:800, color:'var(--text)', marginBottom:4 }}>{initial ? 'Edit widget' : 'New widget'}</div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>Pull any data from the CRM and choose how to show it.</div>

        <div style={L}>Title</div>
        <input value={cfg.title} onChange={e=>set('title', e.target.value)} placeholder="e.g. My Hot Buyers"
          style={inp} />

        <div style={L}>Data source</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
          {BOARD_OPTIONS.map(b => <span key={b.id} onClick={()=>{ set('board', b.id); set('statuses', []); set('columns', []) }} style={chip(cfg.board===b.id)}>{b.label}</span>)}
        </div>

        {boardDef?.statusOptions?.length > 0 && (
          <>
            <div style={L}>Filter — {boardDef.statusField} (pick any; empty = all)</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {boardDef.statusOptions.map(s => <span key={s} onClick={()=>toggleArr('statuses', s)} style={chip(cfg.statuses?.includes(s))}>{s}</span>)}
            </div>
          </>
        )}

        <div style={L}>Timeframe</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
          {TIMEFRAMES.map(t => <span key={t.id} onClick={()=>set('dateRange', t.id)} style={chip(cfg.dateRange===t.id)}>{t.label}</span>)}
          <span onClick={()=>set('dateRange', isCustom?cfg.dateRange:'custom::')} style={chip(isCustom)}>Custom</span>
        </div>
        {isCustom && (
          <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:8 }}>
            <input type="date" value={cfg.dateRange.split(':')[1]||''} onChange={e=>{ const p=cfg.dateRange.split(':'); set('dateRange','custom:'+e.target.value+':'+(p[2]||'')) }} style={{ ...inp, width:'auto' }} />
            <span style={{ fontSize:12, color:'var(--muted)' }}>to</span>
            <input type="date" value={cfg.dateRange.split(':')[2]||''} onChange={e=>{ const p=cfg.dateRange.split(':'); set('dateRange','custom:'+(p[1]||'')+':'+e.target.value) }} style={{ ...inp, width:'auto' }} />
          </div>
        )}

        {isAdmin && (
          <>
            <div style={L}>Whose data</div>
            <div style={{ display:'flex', gap:6 }}>
              <span onClick={()=>set('agentScope','all')} style={chip(cfg.agentScope==='all')}>Whole team</span>
              <span onClick={()=>set('agentScope','mine')} style={chip(cfg.agentScope==='mine')}>Just me</span>
            </div>
          </>
        )}

        <div style={L}>Show as</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
          {DISPLAYS.map(d => <span key={d.id} onClick={()=>set('display', d.id)} style={chip(cfg.display===d.id)}>{d.label}</span>)}
        </div>

        {cfg.display === 'number' && boardDef?.numericFields?.length > 0 && (
          <>
            <div style={L}>Measure</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              <span onClick={()=>set('metric','count')} style={chip(!cfg.metric||cfg.metric==='count')}>Count</span>
              {boardDef.numericFields.map(n => <span key={n.field} onClick={()=>set('metric', n.field)} style={chip(cfg.metric===n.field)}>{n.label}</span>)}
            </div>
          </>
        )}
        {(cfg.display === 'bar' || cfg.display === 'donut') && (
          <>
            <div style={L}>Group by</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {(boardDef?.groupByOptions||[]).map(g => <span key={g} onClick={()=>set('groupBy', g)} style={chip(cfg.groupBy===g)}>{g}</span>)}
            </div>
          </>
        )}
        {cfg.display === 'table' && (
          <>
            <div style={L}>Columns (pick any)</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {(boardDef?.displayCols||[]).map(c => <span key={c.field} onClick={()=>toggleArr('columns', c.field)} style={chip(cfg.columns?.includes(c.field))}>{c.label}</span>)}
            </div>
          </>
        )}

        <div style={L}>Accent color</div>
        <div style={{ display:'flex', gap:6 }}>
          {COLORS.map(c => <span key={c} onClick={()=>set('color', c)} style={{ width:26, height:26, borderRadius:7, background:c, cursor:'pointer', border:cfg.color===c?'3px solid var(--text)':'3px solid transparent' }} />)}
        </div>

        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:20 }}>
          <button onClick={onClose} style={btn('var(--dim)','var(--text)')}>Cancel</button>
          <button onClick={()=>onSave({ ...cfg, title: cfg.title || (boardDef?.label || 'Widget') })} style={btn('#2563EB','#fff')}>{initial ? 'Save' : 'Add widget'}</button>
        </div>
      </div>
    </div>
  )
}

const inp = { width:'100%', padding:'8px 11px', borderRadius:8, border:'1px solid var(--border)', fontSize:13, background:'var(--bg)', color:'var(--text)', fontFamily:ff, boxSizing:'border-box' }
const btn = (bg,c) => ({ padding:'8px 16px', borderRadius:8, border:'none', background:bg, color:c, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:ff })
const miniBtn = { padding:'2px 7px', borderRadius:5, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--muted)', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:ff }
