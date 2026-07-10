// TargetOS V2 — Weekly Ad Generator
// Select up to 9 active listings, auto-populates into the exact
// existing "Target Team" weekly flyer design. Design is intentionally
// hardcoded to match the original artwork pixel-for-pixel (colors,
// banner shapes, footer team roster, Yiddish header) -- only the
// listing data (address, price, beds/baths/sqft, photo, highlights)
// is dynamic, per explicit instruction that nothing about the design
// itself should change.
import React, { useEffect, useState, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { fmt$ } from '../lib/utils'
import { PageHeader, Btn, Loading, Empty } from '../components/UI'
import { usePageView, LastVisited } from '../components/PageViewTracking'
import html2canvas from 'html2canvas'

const ff = 'Inter, system-ui, -apple-system, sans-serif'
const NAVY = '#1B2B4B'
const RED  = '#CC2200'

// Static team roster for the footer — matches the original artwork.
// Update here if the roster changes; deliberately not pulled from the
// agents table since the artwork's exact wording (nicknames, order)
// is part of the fixed design, not the dynamic listing data.
const TEAM_ROSTER = [
  { name: 'Lazer', last: 'Farkas', nickname: 'Eliezer' },
  { name: 'Mendy', last: 'Jankovits', nickname: 'Menachem' },
  { name: 'Avraham', last: 'Weinberger', nickname: null },
  { name: 'Eli', last: 'Hoffman', nickname: null },
  { name: 'Joel', last: 'Rottenstein', nickname: null },
]

function splitHighlights(notes) {
  if (!notes?.trim()) return []
  return notes.split(/\n|,\s*(?=[A-Z])/).map(s => s.trim()).filter(Boolean).slice(0, 5)
}

function ListingCard({ listing, tag }) {
  const highlights = splitHighlights(listing.notes)
  const photo = (listing.photos || [])[0]
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
      {/* Banner */}
      <div style={{ position: 'relative', height: 42, background: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center',
        clipPath: 'polygon(0 0, 100% 0, 96% 100%, 4% 100%)' }}>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: 15, letterSpacing: '.03em', fontFamily: ff }}>
          {tag === 'coming_soon' ? 'COMING SOON' : 'FOR SALE'}
        </span>
      </div>

      {/* Photo */}
      <div style={{ position: 'relative', height: 210, background: '#e2e8f0', overflow: 'hidden' }}>
        {photo
          ? <img src={photo} alt={listing.addr} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13, fontFamily: ff }}>No photo</div>}
        {listing.is_new_listing && (
          <div style={{ position: 'absolute', top: 10, left: 10, background: RED, color: '#fff', padding: '4px 10px', fontSize: 11, fontWeight: 800, fontFamily: ff }}>NEW LISTING</div>
        )}
        {listing.open_house_text && (
          <div style={{ position: 'absolute', top: 10, right: 10, background: '#fff', border: '2px solid ' + RED, color: RED, padding: '4px 10px', fontSize: 10, fontWeight: 800, textAlign: 'center', fontFamily: ff }}>
            OPEN HOUSE<br/>{listing.open_house_text}
          </div>
        )}
      </div>

      {/* Details */}
      <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: NAVY, fontFamily: ff, lineHeight: 1.2 }}>{(listing.addr || '').toUpperCase()}</div>
            <div style={{ fontWeight: 700, fontSize: 11, color: '#64748b', fontFamily: ff }}>{(listing.city || '').toUpperCase()}, NY</div>
          </div>
          <div style={{ fontWeight: 800, fontSize: 15, color: NAVY, fontFamily: ff, whiteSpace: 'nowrap' }}>{fmt$(listing.list_price)}</div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 11, fontWeight: 700, color: NAVY, fontFamily: ff, marginBottom: 8 }}>
          <span>🏠 {listing.property_type || '—'}</span>
          <span>🛏 {listing.beds || '—'} Bedrooms</span>
          <span>📐 {listing.sqft || '—'} Sq Ft</span>
          <span>🛁 {listing.baths || '—'} Bathrooms</span>
        </div>

        {highlights.length > 0 && (
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 6, marginTop: 'auto' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: RED, fontFamily: ff, marginBottom: 3 }}>PROPERTY HIGHLIGHTS</div>
            <ul style={{ margin: 0, paddingLeft: 14, fontSize: 10, color: '#334155', fontFamily: ff, lineHeight: 1.5 }}>
              {highlights.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function FlyerContent({ selectedListings }) {
  if (selectedListings.length === 0) return null
  return (
    <div id="weekly-ad-flyer" style={{ background: '#f0f1f3', padding: 32, maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 30, fontWeight: 900, color: NAVY, fontFamily: ff, letterSpacing: '.02em' }}>
            T<span style={{ color: RED }}>A</span>RGET
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: RED, letterSpacing: '.15em', marginTop: -4 }}>TEAM</div>
          <div style={{ fontSize: 10, color: '#64748b', fontFamily: ff }}>Of Keller William Valley Realty</div>
        </div>
        <div style={{ textAlign: 'right', borderTop: '2px solid ' + RED, borderBottom: '2px solid ' + RED, padding: '4px 0' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: NAVY, direction: 'rtl', fontFamily: 'serif' }}>
            פאר אלע אייערע ריעל עסטעיט
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: NAVY, direction: 'rtl', fontFamily: 'serif' }}>
            מאנסי און די אומגעגנט!
          </div>
        </div>
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {selectedListings.map(l => <ListingCard key={l.id} listing={l} tag={l.tag} />)}
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 14, color: NAVY, fontFamily: ff, marginBottom: 14 }}>
        BUY, SELL, INVEST WITH THE BEST <span style={{ color: RED }}>- MANY MORE PROJECTS AVAILABLE!</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: NAVY, fontFamily: ff, lineHeight: 1.1 }}>
          YOUR<br/><span style={{ color: RED }}>DREAM</span><br/>TEAM
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {TEAM_ROSTER.map(m => (
            <div key={m.name} style={{ fontSize: 11, fontWeight: 700, color: NAVY, fontFamily: ff, textAlign: 'center' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#cbd5e1', margin: '0 auto 4px' }} />
              {m.name} {m.nickname && <span style={{ fontStyle: 'italic', fontWeight: 400 }}>"{m.nickname}"</span>}<br/>{m.last}
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'right', fontFamily: ff }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>CALL · TEXT · WHATSAPP</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: RED }}>845.424.1014</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>office@targetreteam.com</div>
        </div>
      </div>
    </div>
  )
}

export function WeeklyAd() {
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()
  usePageView('weekly-ad')

  const [loading, setLoading] = useState(true)
  const [listings, setListings] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [markers, setMarkers] = useState({}) // per-listing: { tag, is_new_listing, open_house_text }
  const [exporting, setExporting] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  useEffect(() => {
    supabase.from('listings').select('*, agents(id,name)').eq('status', 'Active')
      .order('created_at', { ascending: false }).limit(60)
      .then(({ data }) => { setListings(data || []); setLoading(false) })
  }, [])

  function toggle(id) {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= 9) { toast('Weekly ad fits 9 listings — remove one first', '#F5A623'); return prev }
      return [...prev, id]
    })
  }

  function setMarker(id, key, value) {
    setMarkers(prev => ({ ...prev, [id]: { ...prev[id], [key]: value } }))
  }

  const selectedListings = useMemo(() =>
    selectedIds.map(id => {
      const l = listings.find(x => x.id === id)
      return l ? { ...l, ...markers[id] } : null
    }).filter(Boolean),
  [selectedIds, listings, markers])

  function handlePrint() {
    window.print()
  }

  async function exportJPEG() {
    const el = document.getElementById('weekly-ad-flyer')
    if (!el) return
    setExporting(true)
    try {
      const canvas = await html2canvas(el, { scale: 3, backgroundColor: '#f0f1f3', useCORS: true })
      const url = canvas.toDataURL('image/jpeg', 0.95)
      const a = document.createElement('a')
      a.href = url
      a.download = 'weekly-ad-' + new Date().toISOString().slice(0,10) + '.jpg'
      a.click()
    } catch(e) {
      toast('Export failed: ' + e.message, '#DC2626')
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <Loading />

  return (
    <div style={{ fontFamily: ff }}>
      <div className="no-print">
        <PageHeader
          title="Weekly Ad"
          sub={selectedIds.length + ' of 9 listings selected'}
          actions={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <LastVisited page="weekly-ad" />
              <Btn variant="secondary" onClick={() => setPreviewOpen(true)} disabled={selectedListings.length === 0}>🔍 Full Preview</Btn>
              <Btn variant="secondary" onClick={exportJPEG} disabled={selectedListings.length === 0 || exporting}>{exporting ? 'Exporting…' : '⬇ Download HD JPEG'}</Btn>
              <Btn onClick={handlePrint} disabled={selectedListings.length === 0}>🖨 Print / Save as PDF</Btn>
            </div>
          }
        />

        {/* Listing picker */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 10, marginBottom: 24 }}>
          {listings.length === 0 && <Empty icon="🏡" title="No active listings" />}
          {listings.map(l => {
            const isSel = selectedIds.includes(l.id)
            return (
              <div key={l.id} onClick={() => toggle(l.id)}
                style={{ background: 'var(--panel)', border: '2px solid ' + (isSel ? RED : 'var(--border)'), borderRadius: 10, padding: 12, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{l.addr}</div>
                  {isSel && <span style={{ color: RED, fontWeight: 900 }}>✓</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{fmt$(l.list_price)} · {l.agents?.name || 'Unassigned'}</div>

                {isSel && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }} onClick={e => e.stopPropagation()}>
                    <select value={markers[l.id]?.tag || 'for_sale'} onChange={e => setMarker(l.id, 'tag', e.target.value)}
                      style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', fontFamily: ff }}>
                      <option value="for_sale">FOR SALE</option>
                      <option value="coming_soon">COMING SOON</option>
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                      <input type="checkbox" checked={!!markers[l.id]?.is_new_listing} onChange={e => setMarker(l.id, 'is_new_listing', e.target.checked)} />
                      New Listing tag
                    </label>
                    <input value={markers[l.id]?.open_house_text || ''} onChange={e => setMarker(l.id, 'open_house_text', e.target.value)}
                      placeholder="Open house time (optional) e.g. SUNDAY 1:00-2:00"
                      style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', fontFamily: ff }} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── THE ACTUAL FLYER (this is what prints) ── */}
      <FlyerContent selectedListings={selectedListings} />

      {previewOpen && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 1000, overflowY: 'auto', padding: '40px 20px' }}>
          <button onClick={() => setPreviewOpen(false)}
            style={{ position: 'fixed', top: 20, right: 20, width: 40, height: 40, borderRadius: '50%', border: 'none', background: '#fff', fontSize: 18, fontWeight: 700, cursor: 'pointer', zIndex: 1001 }}>
            ✕
          </button>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <FlyerContent selectedListings={selectedListings} />
          </div>
        </div>
      )}
    </div>
  )
}
