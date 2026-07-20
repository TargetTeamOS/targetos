import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { BOARD_OPTIONS } from '../lib/boardOptions'

// One renderer for every smart-board widget. A widget is a saved query:
//   { board, statuses[], groupBy, dateRange, agentScope, display, metric, columns[], color, title }
// display: 'number' | 'bar' | 'donut' | 'list' | 'table'
// Professional, no emoji, dense. Clicking drills into the records.

const ff = 'Inter, system-ui, -apple-system, sans-serif'
const parseNum = v => { const n = parseFloat(String(v ?? '').replace(/[^0-9.-]/g,'')); return isNaN(n)?0:n }
const fmtMoney = n => { const v=parseNum(n); if(v>=1e6) return '$'+(v/1e6).toFixed(2)+'M'; if(v>=1e3) return '$'+Math.round(v/1e3)+'K'; return '$'+Math.round(v) }
const fmtVal = (v, field) => {
  if (v == null || v === '') return '—'
  if (/gci|price|production|volume|commission|amount|value/i.test(field||'')) return fmtMoney(v)
  if (/date/i.test(field||'') && String(v).length >= 8) return new Date(v).toLocaleDateString()
  return String(v)
}

export function BOARD_DATE_FIELD(board) {
  return { deals:'ao_date', calls:'called_at', offers:'offer_date', open_houses:'date', listings:'list_date', gifts:'sent_date' }[board] || 'created_at'
}

export function dateRangeToBounds(id) {
  if (!id || id === 'all') return null
  const now = new Date(), today = now.toISOString().slice(0,10)
  if (id==='today') return { from:today, to:today }
  if (id==='week')  { const d=new Date(now); d.setDate(d.getDate()-7); return { from:d.toISOString().slice(0,10), to:today } }
  if (id==='month') { const d=new Date(now); d.setMonth(d.getMonth()-1); return { from:d.toISOString().slice(0,10), to:today } }
  if (id==='quarter'){ const d=new Date(now); d.setMonth(d.getMonth()-3); return { from:d.toISOString().slice(0,10), to:today } }
  if (id==='ytd')   return { from: now.getFullYear()+'-01-01', to: today }
  if (/^\d{4}$/.test(id)) return { from:id+'-01-01', to:id+'-12-31' }
  if (String(id).startsWith('custom:')) { const [,f,t]=id.split(':'); return f&&t?{from:f,to:t}:null }
  return null
}

// Exact detail route for one record, so a drill-down row opens THAT item.
function detailRoute(board, id) {
  return {
    contacts: '/contacts/' + id + '/detail',
    deals:    '/production/' + id,
    listings: '/listings/' + id,
    tasks:    '/tasks/' + id,
    offers:   '/offers/' + id,
    gifts:    '/gifts/' + id,
  }[board] || null
}

export function WidgetContent({ config, agentId, isAdmin }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [drill, setDrill] = useState(false)   // show the exact records behind the number
  const boardDef = BOARD_OPTIONS.find(b => b.id === config.board)

  useEffect(() => {
    if (!boardDef) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        let q = supabase.from(boardDef.table).select('*')
        const scope = config.agentScope || (isAdmin ? 'all' : 'mine')
        if (scope === 'mine' && agentId) q = q.eq('agent_id', agentId)
        else if (scope !== 'all' && scope !== 'mine') q = q.eq('agent_id', scope)
        if (config.statuses?.length && boardDef.statusField) q = q.in(boardDef.statusField, config.statuses)
        // extra multi-select filters: { field: [values] }
        if (config.filters) for (const [f, vals] of Object.entries(config.filters)) {
          if (Array.isArray(vals) && vals.length) q = q.in(f, vals)
        }
        const dr = dateRangeToBounds(config.dateRange)
        if (dr) { const df = BOARD_DATE_FIELD(config.board); q = q.gte(df, dr.from).lte(df, dr.to + 'T23:59:59') }
        q = q.order(config.sortBy || BOARD_DATE_FIELD(config.board), { ascending: false, nullsFirst: false }).limit(500)
        const { data } = await q
        if (cancelled) return
        setRows(data || []); setCount((data || []).length)
      } catch (e) { if (!cancelled) { setRows([]); setCount(0) } }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [JSON.stringify(config), agentId])

  if (!boardDef) return <Empty text="Pick a data source" />
  if (loading) return <div style={{ fontSize:12, color:'var(--muted)', fontFamily:ff, padding:8 }}>Loading…</div>

  const color = config.color || '#2563EB'
  // Clicking a widget opens the exact records behind it (not the whole board).
  const openDrill = () => setDrill(true)

  const drillModal = drill ? (
    <DrillPopup title={config.title} board={config.board} boardDef={boardDef} rows={rows}
      navigate={navigate} color={color} onClose={() => setDrill(false)} />
  ) : null

  // NUMBER — count or numeric aggregate
  if (!config.display || config.display === 'number') {
    let value = count, label = config.metric_label || 'records'
    if (config.metric && config.metric !== 'count') {
      const sum = rows.reduce((s,r)=>s+parseNum(r[config.metric]),0)
      value = fmtMoney(sum); label = (boardDef.numericFields.find(n=>n.field===config.metric)?.label) || config.metric
    }
    return (
      <>
        <div onClick={openDrill} style={{ height:'100%', display:'flex', flexDirection:'column', justifyContent:'center', cursor:'pointer' }}>
          <div style={{ fontSize:40, fontWeight:800, color, lineHeight:1, fontFamily:ff }}>{value}</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginTop:6, fontFamily:ff }}>{label} · <span style={{ color }}>view {count} →</span></div>
        </div>
        {drillModal}
      </>
    )
  }

  // GROUPED (bar / donut)
  if (config.display === 'bar' || config.display === 'donut') {
    const gb = config.groupBy || boardDef.statusField
    const groups = {}
    for (const r of rows) { const k = r[gb] ?? '—'; groups[k] = (groups[k]||0)+1 }
    const entries = Object.entries(groups).sort((a,b)=>b[1]-a[1])
    const max = Math.max(1, ...entries.map(e=>e[1]))
    const palette = ['#2563EB','#059669','#D97706','#DC2626','#7C3AED','#0891B2','#DB2777','#65A30D']
    if (config.display === 'bar') {
      return (
        <><div onClick={openDrill} style={{ display:'flex', flexDirection:'column', gap:6, fontFamily:ff, overflowY:'auto', height:'100%', cursor:'pointer' }}>
          {entries.map(([k,v],i) => (
            <div key={k} style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:11, color:'var(--muted)', width:90, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{k}</span>
              <div style={{ flex:1, background:'var(--dim)', borderRadius:4, height:16, overflow:'hidden' }}>
                <div style={{ width:(v/max*100)+'%', background:palette[i%palette.length], height:'100%' }} />
              </div>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--text)', width:28, textAlign:'right' }}>{v}</span>
            </div>
          ))}
          {!entries.length && <Empty text="No data" />}
        </div>{drillModal}</>
      )
    }
    // donut
    const total = entries.reduce((s,e)=>s+e[1],0) || 1
    let acc = 0
    const segs = entries.map(([k,v],i) => { const start=acc/total*360; acc+=v; return { k, v, start, end:acc/total*360, c:palette[i%palette.length] } })
    const grad = segs.map(s=>`${s.c} ${s.start}deg ${s.end}deg`).join(', ')
    return (
      <><div onClick={openDrill} style={{ display:'flex', alignItems:'center', gap:14, height:'100%', fontFamily:ff, cursor:'pointer' }}>
        <div style={{ width:96, height:96, borderRadius:'50%', flexShrink:0, background:`conic-gradient(${grad})`, position:'relative' }}>
          <div style={{ position:'absolute', inset:14, background:'var(--panel)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:800, color:'var(--text)' }}>{total}</div>
        </div>
        <div style={{ flex:1, overflowY:'auto', maxHeight:'100%' }}>
          {segs.map(s => (
            <div key={s.k} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, marginBottom:3 }}>
              <span style={{ width:8, height:8, borderRadius:2, background:s.c }} />
              <span style={{ color:'var(--muted)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.k}</span>
              <span style={{ fontWeight:700, color:'var(--text)' }}>{s.v}</span>
            </div>
          ))}
        </div>
      </div>{drillModal}</>
    )
  }

  // GOAL RING — measure vs a target you set
  if (config.display === 'goal') {
    const val = (config.metric && config.metric !== 'count')
      ? rows.reduce((s,r)=>s+parseNum(r[config.metric]),0) : count
    const target = parseNum(config.target) || 0
    const pct = target > 0 ? Math.min(100, Math.round(val/target*100)) : 0
    const deg = pct/100*360
    const disp = (config.metric && config.metric !== 'count') ? fmtMoney(val) : val
    const tdisp = (config.metric && config.metric !== 'count') ? fmtMoney(target) : target
    return (
      <>
        <div onClick={openDrill} style={{ display:'flex', alignItems:'center', gap:16, height:'100%', cursor:'pointer', fontFamily:ff }}>
          <div style={{ width:104, height:104, borderRadius:'50%', flexShrink:0, background:`conic-gradient(${color} ${deg}deg, var(--dim) ${deg}deg)`, position:'relative' }}>
            <div style={{ position:'absolute', inset:12, background:'var(--panel)', borderRadius:'50%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
              <div style={{ fontSize:22, fontWeight:800, color }}>{pct}%</div>
            </div>
          </div>
          <div>
            <div style={{ fontSize:22, fontWeight:800, color:'var(--text)' }}>{disp}</div>
            <div style={{ fontSize:12, color:'var(--muted)' }}>of {tdisp} goal</div>
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>view {count} →</div>
          </div>
        </div>
        {drillModal}
      </>
    )
  }

  // MONTHLY TREND — metric or count grouped by month
  if (config.display === 'trend') {
    const months = config.months || 6
    const df = BOARD_DATE_FIELD(config.board)
    const buckets = {}
    const now = new Date()
    for (let i = months - 1; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth()-i, 1); buckets[d.toISOString().slice(0,7)] = 0 }
    for (const r of rows) {
      const k = String(r[df] || '').slice(0,7)
      if (k in buckets) buckets[k] += (config.metric && config.metric !== 'count') ? parseNum(r[config.metric]) : 1
    }
    const entries = Object.entries(buckets)
    const max = Math.max(1, ...entries.map(e=>e[1]))
    const isMoney = config.metric && config.metric !== 'count'
    return (
      <>
        <div onClick={openDrill} style={{ display:'flex', alignItems:'flex-end', gap:6, height:'100%', cursor:'pointer', fontFamily:ff, paddingTop:8 }}>
          {entries.map(([k,v]) => (
            <div key={k} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-end', height:'100%', gap:4 }}>
              <span style={{ fontSize:9, fontWeight:700, color:'var(--muted)' }}>{isMoney ? (v>=1000?'$'+Math.round(v/1000)+'K':'$'+Math.round(v)) : v}</span>
              <div style={{ width:'70%', background:color, borderRadius:'3px 3px 0 0', height:Math.max(3, v/max*100)+'%', minHeight:3 }} />
              <span style={{ fontSize:9, color:'var(--muted)' }}>{new Date(k+'-02').toLocaleDateString('en-US',{month:'short'})}</span>
            </div>
          ))}
        </div>
        {drillModal}
      </>
    )
  }

  // LIST
  if (config.display === 'list') {
    return (
      <><div style={{ overflowY:'auto', height:'100%', fontFamily:ff }}>
        {rows.slice(0, config.limitRows || 50).map(r => (
          <div key={r.id} onClick={() => { const rt = detailRoute(config.board, r.id); rt ? navigate(rt) : setDrill(true) }} style={{ padding:'6px 0', borderBottom:'1px solid var(--border)', cursor:'pointer', display:'flex', justifyContent:'space-between', gap:8 }}>
            <span style={{ fontSize:12, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r[boardDef.nameField] || '—'}</span>
            <span style={{ fontSize:11, color:'var(--muted)', flexShrink:0 }}>{fmtVal(r[boardDef.statusField], boardDef.statusField)}</span>
          </div>
        ))}
        {!rows.length && <Empty text="No records" />}
      </div>{drillModal}</>
    )
  }

  // TABLE
  if (config.display === 'table') {
    const cols = (config.columns?.length ? config.columns : boardDef.displayCols.slice(0,4).map(c=>c.field))
    return (
      <><div style={{ overflow:'auto', height:'100%', fontFamily:ff }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead><tr>{cols.map(c => <th key={c} style={{ textAlign:'left', padding:'4px 8px', color:'var(--muted)', fontWeight:700, borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{boardDef.displayCols.find(dc=>dc.field===c)?.label || c}</th>)}</tr></thead>
          <tbody>
            {rows.slice(0, config.limitRows || 50).map(r => (
              <tr key={r.id} onClick={() => { const rt = detailRoute(config.board, r.id); rt ? navigate(rt) : setDrill(true) }} style={{ cursor:'pointer' }}>
                {cols.map(c => <td key={c} style={{ padding:'4px 8px', color:'var(--text)', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:160 }}>{fmtVal(r[c], c)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty text="No records" />}
      </div>{drillModal}</>
    )
  }
  return null
}

// Drill-down: the exact records that made the total. Each row opens
// that exact item; footer opens the whole filtered set on its board.
function DrillPopup({ title, board, boardDef, rows, navigate, color, onClose }) {
  const nameField = boardDef?.nameField || 'id'
  const subField = boardDef?.subField
  const statusField = boardDef?.statusField
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--panel)', borderRadius:16, width:'100%', maxWidth:560, maxHeight:'85vh', display:'flex', flexDirection:'column', fontFamily:ff, overflow:'hidden' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:'var(--text)' }}>{title}</div>
            <div style={{ fontSize:12, color:'var(--muted)' }}>{rows.length} record{rows.length===1?'':'s'} behind this total</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, color:'var(--muted)', cursor:'pointer' }}>×</button>
        </div>
        <div style={{ overflowY:'auto', padding:'6px 8px' }}>
          {rows.map(r => {
            const rt = detailRoute(board, r.id)
            return (
              <div key={r.id} onClick={() => rt && navigate(rt)}
                style={{ padding:'10px 12px', borderRadius:8, cursor: rt?'pointer':'default', display:'flex', justifyContent:'space-between', gap:10, alignItems:'center' }}
                onMouseEnter={e=>e.currentTarget.style.background='var(--dim)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fmtVal(r[nameField], nameField)}</div>
                  {subField && r[subField] != null && <div style={{ fontSize:11, color:'var(--muted)' }}>{fmtVal(r[subField], subField)}</div>}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                  {statusField && r[statusField] != null && <span style={{ fontSize:11, color:color, fontWeight:600 }}>{fmtVal(r[statusField], statusField)}</span>}
                  {rt && <span style={{ fontSize:13, color:'var(--muted)' }}>→</span>}
                </div>
              </div>
            )
          })}
          {!rows.length && <Empty text="No records" />}
        </div>
      </div>
    </div>
  )
}

function Empty({ text }) {
  return <div style={{ fontSize:12, color:'var(--muted)', fontFamily:ff, padding:8, textAlign:'center' }}>{text}</div>
}
