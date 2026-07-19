import { useState, useEffect } from 'react'

// /tv?token=... — full-screen office display board. Dark, huge type,
// auto-refreshes every 60s. Point any smart TV / Fire Stick browser
// (or ScreenCloud, if ever wanted) at this URL. No login; the token
// gates the data. No client names shown — lobby-safe.

const ff = "'Inter', -apple-system, sans-serif"

function money(n) {
  const v = Number(n) || 0
  if (v >= 1000000) return '$' + (v / 1000000).toFixed(1) + 'M'
  if (v >= 1000) return '$' + Math.round(v / 1000) + 'K'
  return '$' + v
}

function niceDate(d) {
  if (!d) return ''
  const dt = new Date(d + 'T12:00:00')
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const STAGE_HEX = {
  'Negotiations': '#037f4c', 'Offer Accapted': '#00c875', 'Under Shtar': '#bb3354',
  'Under Contract': '#757575', 'Closed': '#225091',
}

export function TVBoard() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [clock, setClock] = useState(new Date())

  const qs = window.location.href.split('?')[1] || ''
  const token = new URLSearchParams(qs).get('token') || ''

  async function load() {
    try {
      const r = await fetch('/api/tv-data?token=' + encodeURIComponent(token))
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'load failed')
      setData(j); setErr('')
    } catch (e) { setErr(e.message) }
  }

  useEffect(() => {
    load()
    const dataTimer = setInterval(load, 60000)
    const clockTimer = setInterval(() => setClock(new Date()), 1000)
    return () => { clearInterval(dataTimer); clearInterval(clockTimer) }
  }, [])

  const wrap = { minHeight: '100vh', background: '#0B1220', color: '#E2E8F0', fontFamily: ff, padding: '3vh 3vw', boxSizing: 'border-box' }

  if (err) return (
    <div style={Object.assign({}, wrap, { display: 'flex', alignItems: 'center', justifyContent: 'center' })}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '28px', fontWeight: 700 }}>Target Team Board</div>
        <div style={{ fontSize: '16px', color: '#94A3B8', marginTop: '10px' }}>{err === 'bad token' ? 'Invalid or missing token — get the TV link from Admin → Connectors' : err}</div>
      </div>
    </div>
  )
  if (!data) return <div style={Object.assign({}, wrap, { display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' })}>Loading…</div>

  const s = data.stats
  const card = { background: '#111C33', borderRadius: '18px', padding: '2.2vh 1.6vw' }
  const label = { fontSize: '1.6vh', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748B', fontWeight: 700 }
  const big = { fontSize: '5.5vh', fontWeight: 800, lineHeight: 1.1, marginTop: '0.6vh' }
  const sub = { fontSize: '2vh', color: '#7DD3FC', fontWeight: 600 }

  return (
    <div style={wrap}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2.5vh' }}>
        <div style={{ fontSize: '3.2vh', fontWeight: 800 }}>🎯 TARGET TEAM <span style={{ color: '#38BDF8' }}>LIVE BOARD</span></div>
        <div style={{ fontSize: '2.6vh', fontWeight: 600, color: '#94A3B8' }}>
          {clock.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · {clock.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </div>
      </div>

      {/* stat row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.4vw', marginBottom: '2.5vh' }}>
        <div style={card}>
          <div style={label}>Offers Accepted — This Month</div>
          <div style={Object.assign({}, big, { color: '#00c875' })}>{s.accepted_mtd}</div>
          <div style={sub}>{money(s.accepted_mtd_volume)} volume</div>
        </div>
        <div style={card}>
          <div style={label}>Active Pipeline</div>
          <div style={Object.assign({}, big, { color: '#38BDF8' })}>{s.pipeline_count}</div>
          <div style={sub}>{money(s.pipeline_volume)} in play</div>
        </div>
        <div style={card}>
          <div style={label}>Closed — Year to Date</div>
          <div style={Object.assign({}, big, { color: '#FACC15' })}>{s.closed_ytd}</div>
          <div style={sub}>{money(s.closed_ytd_volume)} closed volume</div>
        </div>
      </div>

      {/* three columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.1fr 1fr', gap: '1.4vw' }}>
        <div style={card}>
          <div style={Object.assign({}, label, { marginBottom: '1.4vh' })}>🎉 Recently Accepted</div>
          {(data.recent_accepted || []).map((d, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '1.1vh 0', borderBottom: '1px solid #1E293B', fontSize: '2vh' }}>
              <div style={{ fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', paddingRight: '0.8vw' }}>{d.addr}</div>
              <div style={{ color: '#94A3B8', whiteSpace: 'nowrap' }}>{d.agent && d.agent.split(' ')[0]} · {niceDate(d.ao_date)}</div>
            </div>
          ))}
          {!(data.recent_accepted || []).length && <div style={{ color: '#475569', fontSize: '2vh' }}>Nothing yet — go get one.</div>}
        </div>

        <div style={card}>
          <div style={Object.assign({}, label, { marginBottom: '1.4vh' })}>📅 Closing Soon (30 days)</div>
          {(data.closing_soon || []).map((d, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.1vh 0', borderBottom: '1px solid #1E293B', fontSize: '2vh' }}>
              <div style={{ fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', paddingRight: '0.8vw' }}>{d.addr}</div>
              <div style={{ display: 'flex', gap: '0.7vw', alignItems: 'center', whiteSpace: 'nowrap' }}>
                <span style={{ background: STAGE_HEX[d.stage] || '#334155', borderRadius: '999px', padding: '0.3vh 0.8vw', fontSize: '1.5vh', fontWeight: 700 }}>{d.stage}</span>
                <span style={{ color: '#FACC15', fontWeight: 700 }}>{niceDate(d.close_date)}</span>
              </div>
            </div>
          ))}
          {!(data.closing_soon || []).length && <div style={{ color: '#475569', fontSize: '2vh' }}>No closings scheduled in the next 30 days.</div>}
        </div>

        <div style={card}>
          <div style={Object.assign({}, label, { marginBottom: '1.4vh' })}>🏆 Agent Leaderboard — YTD</div>
          {(data.leaderboard || []).map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.8vw', padding: '1.1vh 0', borderBottom: '1px solid #1E293B', fontSize: '2.1vh' }}>
              <div style={{ fontSize: '2.4vh', width: '2.2vw' }}>{['🥇', '🥈', '🥉'][i] || (i + 1) + '.'}</div>
              <div style={{ flex: 1, fontWeight: 700, color: a.color || '#E2E8F0' }}>{a.name}</div>
              <div style={{ color: '#94A3B8' }}>{a.deals} deals</div>
              <div style={{ fontWeight: 800, color: '#00c875' }}>{money(a.volume)}</div>
            </div>
          ))}
          {!(data.leaderboard || []).length && <div style={{ color: '#475569', fontSize: '2vh' }}>Leaderboard fills as deals close this year.</div>}
        </div>
      </div>

      <div style={{ marginTop: '2vh', fontSize: '1.5vh', color: '#334155', textAlign: 'right' }}>
        Auto-refreshes every minute · TargetOS
      </div>
    </div>
  )
}
