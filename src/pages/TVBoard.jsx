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
  const [popup, setPopup] = useState(null)          // announcement currently shown
  const [confettiOn, setConfettiOn] = useState(false)
  const [slideIndex, setSlideIndex] = useState(0)   // image rotator
  const [rotatePane, setRotatePane] = useState(0)   // mixed-mode pane cycler

  const qs = window.location.href.split('?')[1] || ''
  const token = new URLSearchParams(qs).get('token') || ''

  async function load() {
    try {
      const r = await fetch('/api/tv-data?token=' + encodeURIComponent(token))
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'load failed')
      setData(j); setErr('')
      // Announcement popup: every refresh cycle (60s), surface the
      // newest active TV announcement for popup_seconds. Celebrations
      // fire the confetti cannon.
      const anns = j.announcements || []
      if (anns.length) {
        const a = anns[0]
        setPopup(a)
        if (a.celebrate) { setConfettiOn(true) }
        const holdMs = ((j.display && j.display.popup_seconds) || 15) * 1000
        setTimeout(() => { setPopup(null); setConfettiOn(false) }, holdMs)
      }
    } catch (e) { setErr(e.message) }
  }

  useEffect(() => {
    load()
    const dataTimer = setInterval(load, 60000)
    const clockTimer = setInterval(() => setClock(new Date()), 1000)
    return () => { clearInterval(dataTimer); clearInterval(clockTimer) }
  }, [])

  // image + pane rotation
  useEffect(() => {
    const secs = (data && data.display && data.display.rotate_seconds) || 45
    const t = setInterval(() => {
      setSlideIndex(i => i + 1)
      setRotatePane(p => p + 1)
    }, secs * 1000)
    return () => clearInterval(t)
  }, [data && data.display && data.display.rotate_seconds])

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

  const display = data.display || { mode: 'dashboard' }
  const images = display.images || []

  const dashboardPane = (
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

  const slidesPane = display.slides_url ? (
    <iframe
      title="Office Slides"
      src={display.slides_url}
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', border: 'none', background: '#000' }}
      allowFullScreen
    />
  ) : dashboardPane

  const imagesPane = images.length ? (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      <img
        src={images[slideIndex % images.length]}
        alt=""
        style={{ width: '100vw', height: '100vh', objectFit: 'contain' }}
      />
    </div>
  ) : dashboardPane

  // rotate mode cycles through whichever panes are configured
  const rotationPanes = [dashboardPane]
  if (display.slides_url) rotationPanes.push(slidesPane)
  if (images.length) rotationPanes.push(imagesPane)

  let content = dashboardPane
  if (display.mode === 'slides') content = slidesPane
  else if (display.mode === 'images') content = imagesPane
  else if (display.mode === 'rotate') content = rotationPanes[rotatePane % rotationPanes.length]

  const typeColors = { info: '#38BDF8', alert: '#F59E0B', success: '#00c875', deal: '#A78BFA' }

  return (
    <div>
      {content}

      {/* ── ANNOUNCEMENT POPUP ── */}
      {popup && (
        <div style={{
          position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(2,6,18,0.72)', zIndex: 50, animation: 'tvFadeIn .4s ease',
        }}>
          <div style={{
            background: '#0F1B33', border: '2px solid ' + (popup.celebrate ? '#FACC15' : (typeColors[popup.type] || '#38BDF8')),
            borderRadius: '26px', padding: '5vh 5vw', maxWidth: '78vw', textAlign: 'center',
            boxShadow: '0 0 90px ' + (popup.celebrate ? 'rgba(250,204,21,0.35)' : 'rgba(56,189,248,0.25)'),
            animation: 'tvPopIn .5s cubic-bezier(.2,1.4,.4,1)',
          }}>
            <div style={{ fontSize: '7vh', marginBottom: '1.5vh' }}>
              {popup.celebrate ? '🎉' : ({ info: 'ℹ️', alert: '⚠️', success: '✅', deal: '🏠' }[popup.type] || '📣')}
            </div>
            <div style={{ fontSize: '5.4vh', fontWeight: 800, color: '#F8FAFC', fontFamily: ff, lineHeight: 1.15 }}>{popup.title}</div>
            {popup.body && <div style={{ fontSize: '2.8vh', color: '#94A3B8', fontFamily: ff, marginTop: '2vh', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{popup.body}</div>}
          </div>
        </div>
      )}

      {confettiOn && <Confetti />}

      <style>{'@keyframes tvFadeIn { from { opacity: 0 } to { opacity: 1 } } @keyframes tvPopIn { from { transform: scale(.6); opacity: 0 } to { transform: scale(1); opacity: 1 } }'}</style>
    </div>
  )
}

// ── Full-screen confetti cannon (no libraries) ────────────────────
function Confetti() {
  useEffect(() => {
    const canvas = document.getElementById('tv-confetti')
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    const colors = ['#FACC15', '#00c875', '#38BDF8', '#F472B6', '#A78BFA', '#FB923C', '#F8FAFC']
    const N = 220
    const parts = []
    for (let i = 0; i < N; i++) {
      parts.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * canvas.height * 0.5,
        w: 8 + Math.random() * 8,
        h: 12 + Math.random() * 10,
        vy: 2.2 + Math.random() * 3.5,
        vx: -1.5 + Math.random() * 3,
        rot: Math.random() * Math.PI,
        vr: -0.12 + Math.random() * 0.24,
        color: colors[i % colors.length],
      })
    }
    let running = true
    function frame() {
      if (!running) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const p of parts) {
        p.y += p.vy; p.x += p.vx + Math.sin(p.y / 40); p.rot += p.vr
        if (p.y > canvas.height + 30) { p.y = -20; p.x = Math.random() * canvas.width }
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
      }
      requestAnimationFrame(frame)
    }
    frame()
    return () => { running = false }
  }, [])
  return <canvas id="tv-confetti" style={{ position: 'fixed', inset: 0, zIndex: 60, pointerEvents: 'none' }} />
}

