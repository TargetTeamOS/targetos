// ═══════════════════════════════════════════════════════════════
// PAGE VIEW TRACKING — hook + admin widget
// Drop usePageView('pagename') into any page to log a visit.
// Drop <LastVisited page="pagename" /> anywhere on that page to show
// admins who last visited and when.
// ═══════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { logPageView, getPageLastVisits } from '../lib/recordActivity'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

export function usePageView(pageName) {
  const { agent } = useAuth()
  useEffect(() => {
    if (agent?.id) logPageView(pageName, agent.id)
    // Only log once per mount — not on every re-render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent?.id, pageName])
}

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return mins + 'm ago'
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return hrs + 'h ago'
  const days = Math.floor(hrs / 24)
  if (days < 30) return days + 'd ago'
  return new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric' })
}

export function LastVisited({ page }) {
  const { isAdmin, canManage } = useAuth()
  const [visits, setVisits] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!isAdmin && !canManage) return
    getPageLastVisits(page).then(setVisits)
  }, [page, isAdmin, canManage])

  if (!isAdmin && !canManage) return null
  if (!visits) return null

  return (
    <div style={{ position: 'relative', fontFamily: ff }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--muted)', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:ff }}>
        👁 {visits.length} visitor{visits.length!==1?'s':''}
      </button>
      {open && (
        <div style={{ position:'absolute', top:'100%', right:0, marginTop:6, zIndex:200, background:'var(--panel)', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 12px 32px rgba(0,0,0,.2)', minWidth:220, maxHeight:300, overflowY:'auto', padding:10 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:8 }}>Last Visited</div>
          {visits.length === 0 && <div style={{ fontSize:12, color:'var(--muted)' }}>No visits recorded yet.</div>}
          {visits.map(v => (
            <div key={v.agent_id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'5px 0', fontSize:12 }}>
              <span style={{ color:'var(--text)', fontWeight:600 }}>{v.agents?.name || 'Unknown'}</span>
              <span style={{ color:'var(--muted)' }}>{timeAgo(v.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
