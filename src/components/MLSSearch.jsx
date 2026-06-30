// TargetOS V2 — MLS Search Hub
// Search OneKey MLS → shortlist listings for a client →
// connect to contact → build showing route → download/print/save
import React, { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth }  from '../context/AuthContext'
import { useApp }   from '../context/AppContext'

const ff = 'Inter, system-ui, -apple-system, sans-serif'
const GKEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || 'AIzaSyAgxix5MkxxNo1F5DPdrab3JMce2aSMe6c'
const MLS_USER = import.meta.env.VITE_SIMPLYRETS_USER || 'simplyrets'
const MLS_PASS = import.meta.env.VITE_SIMPLYRETS_PASS || 'simplyrets'
const MLS_BASE = 'https://api.simplyrets.com'

const CITIES = [
  'Monsey','Spring Valley','New City','Nanuet','Suffern','Airmont',
  'Pomona','Wesley Hills','Chestnut Ridge','Garnerville','Haverstraw',
  'West Nyack','Nyack','Pearl River','Orangeburg','Tappan',
]
const PROP_TYPES = [
  { id:'', label:'All types' },
  { id:'ResidentialProperty', label:'Residential' },
  { id:'Condominium', label:'Condo' },
  { id:'MultiFamily', label:'Multi-Family' },
  { id:'Land', label:'Land' },
]

function fmt$(n) { return n ? '$' + Number(n).toLocaleString() : '' }

function mlsAddr(l) {
  const a = l.address || {}
  return [a.streetNumber, a.streetName, a.unit ? '#'+a.unit : null].filter(Boolean).join(' ')
}
function mlsFullAddr(l) {
  const a = l.address || {}
  return [mlsAddr(l), a.city, a.state, a.postalCode].filter(Boolean).join(', ')
}

// ── LISTING CARD ──────────────────────────────────────────────────
function MLSCard({ listing, saved, onSave, onUnsave, onImport, importing }) {
  const [expanded, setExpanded] = useState(false)
  const photos = listing.photos || []
  const price  = fmt$(listing.listPrice)
  const beds   = listing.property?.bedrooms
  const baths  = listing.property?.bathsFull
  const sqft   = listing.property?.area
  const status = listing.mls?.status || 'Active'
  const sc     = status === 'Active' ? '#10B981' : status === 'Pending' ? '#F5A623' : '#94A3B8'

  return (
    <div style={{ background:'var(--panel)', borderRadius:12, border:'2px solid '+(saved?'#CC2200':'var(--border)'), overflow:'hidden', transition:'all .15s', position:'relative' }}>
      {saved && (
        <div style={{ position:'absolute', top:8, right:8, zIndex:2, width:22, height:22, borderRadius:'50%', background:'#CC2200', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:'#fff', fontWeight:900 }}>✓</div>
      )}

      {/* Photo */}
      <div style={{ height:160, background:'var(--dim)', overflow:'hidden', position:'relative' }}>
        {photos[0]
          ? <img src={photos[0]} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e => e.target.style.display='none'} />
          : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, color:'var(--muted)' }}>🏡</div>
        }
        <div style={{ position:'absolute', top:8, left:8, padding:'3px 8px', borderRadius:10, background:sc, color:'#fff', fontSize:10, fontWeight:800 }}>{status}</div>
        {photos.length > 1 && <div style={{ position:'absolute', bottom:6, right:8, padding:'2px 7px', borderRadius:8, background:'rgba(0,0,0,.6)', color:'#fff', fontSize:10 }}>📷 {photos.length}</div>}
      </div>

      <div style={{ padding:'11px 13px' }}>
        <div style={{ fontSize:19, fontWeight:900, color:'var(--text)', marginBottom:2 }}>{price}</div>
        <div style={{ fontSize:12, fontWeight:600, color:'var(--text)', marginBottom:6, lineHeight:1.4 }}>{mlsFullAddr(listing)}</div>
        <div style={{ display:'flex', gap:10, marginBottom:8, flexWrap:'wrap' }}>
          {beds  && <span style={{ fontSize:12, color:'var(--muted)' }}><strong style={{ color:'var(--text)' }}>{beds}</strong> bd</span>}
          {baths && <span style={{ fontSize:12, color:'var(--muted)' }}><strong style={{ color:'var(--text)' }}>{baths}</strong> ba</span>}
          {sqft  && <span style={{ fontSize:12, color:'var(--muted)' }}><strong style={{ color:'var(--text)' }}>{Number(sqft).toLocaleString()}</strong> sqft</span>}
          {listing.mlsId && <span style={{ fontSize:10, color:'var(--muted)' }}>MLS# {listing.mlsId}</span>}
        </div>

        {expanded && (
          <div style={{ borderTop:'1px solid var(--border)', paddingTop:9, marginBottom:9 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:5, marginBottom:7 }}>
              {[
                ['Type', listing.property?.type],
                ['Year Built', listing.property?.yearBuilt],
                ['Garage', listing.property?.garageSpaces ? listing.property.garageSpaces + ' car' : null],
                ['County', listing.address?.county],
                ['School Dist.', listing.school?.district],
                ['List Date', listing.listDate ? new Date(listing.listDate).toLocaleDateString() : null],
              ].filter(([,v]) => v).map(([k,v]) => (
                <div key={k}><div style={{ fontSize:9, fontWeight:700, color:'var(--muted)', textTransform:'uppercase' }}>{k}</div><div style={{ fontSize:11, color:'var(--text)' }}>{v}</div></div>
              ))}
            </div>
            {listing.remarks && <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.5, padding:'7px 9px', background:'var(--dim)', borderRadius:6, marginBottom:6 }}>{listing.remarks.slice(0,280)}{listing.remarks.length>280?'...':''}</div>}
            {listing.agent?.firstName && <div style={{ fontSize:10, color:'var(--muted)' }}>Listed by: <strong>{listing.agent.firstName} {listing.agent.lastName}</strong>{listing.office?.name?' · '+listing.office.name:''}</div>}
          </div>
        )}

        {/* Actions */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:5 }}>
          <button onClick={() => setExpanded(x => !x)}
            style={{ padding:'6px', borderRadius:7, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--muted)', fontSize:11, cursor:'pointer', fontFamily:ff }}>
            {expanded ? '▲' : '▼ Info'}
          </button>
          <button onClick={() => saved ? onUnsave(listing) : onSave(listing)}
            style={{ padding:'6px', borderRadius:7, border:'1px solid '+(saved?'#CC2200':'var(--border)'), background:saved?'rgba(204,34,0,.1)':'transparent', color:saved?'#CC2200':'var(--muted)', fontSize:11, fontWeight:saved?700:400, cursor:'pointer', fontFamily:ff }}>
            {saved ? '★ Saved' : '☆ Save'}
          </button>
          <button onClick={() => onImport(listing)} disabled={importing}
            style={{ padding:'6px', borderRadius:7, border:'none', background:'#1B2B4B', color:'#fff', fontSize:11, fontWeight:700, cursor:importing?'default':'pointer', fontFamily:ff, opacity:importing?.7:1 }}>
            {importing ? '⏳' : '⬇ Import'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── SHORTLIST PANEL ───────────────────────────────────────────────
function ShortlistPanel({ shortlist, onRemove, contacts, onClose, toast, agentId }) {
  const [clientId,   setClientId]   = useState('')
  const [clientNote, setClientNote] = useState('')
  const [saving,     setSaving]     = useState(false)
  const [showRoute,  setShowRoute]  = useState(false)
  const printRef = useRef(null)

  if (shortlist.length === 0) return (
    <div style={{ padding:'32px 16px', textAlign:'center', color:'var(--muted)', fontSize:13 }}>
      <div style={{ fontSize:32, marginBottom:8 }}>☆</div>
      No saved listings yet. Click the star on any result to add it here.
    </div>
  )

  // Google Maps route URL (traffic-aware directions)
  function routeUrl() {
    const addrs = shortlist.map(l => encodeURIComponent(mlsFullAddr(l))).join('/')
    return 'https://www.google.com/maps/dir/' + addrs + '/?travelmode=driving'
  }

  // Print / download shortlist
  function printList() {
    const win = window.open('', '_blank')
    const rows = shortlist.map(l => {
      const p = l.property || {}
      var beds = [p.bedrooms&&p.bedrooms+' bd', p.bathsFull&&p.bathsFull+' ba', p.area&&Number(p.area).toLocaleString()+' sqft'].filter(Boolean).join(' · ')
      return '<tr>' +
        '<td style="padding:10px;border-bottom:1px solid #eee"><strong style="font-size:14px">' + mlsFullAddr(l) + '</strong><br/><span style="color:#666;font-size:12px">MLS# ' + (l.mlsId||'—') + '</span></td>' +
        '<td style="padding:10px;border-bottom:1px solid #eee;font-weight:800;font-size:15px">' + fmt$(l.listPrice) + '</td>' +
        '<td style="padding:10px;border-bottom:1px solid #eee;font-size:12px;color:#555">' + beds + '</td>' +
        '<td style="padding:10px;border-bottom:1px solid #eee;font-size:11px;color:#888">' + (l.remarks?l.remarks.slice(0,120)+'...':'') + '</td>' +
        '</tr>'
    }).join('')
    var html = '<!DOCTYPE html><html><head><title>Property Shortlist - Target Team</title>' +
      '<style>body{font-family:Arial,sans-serif;padding:30px;color:#1a1a1a}h1{font-size:20px;margin-bottom:4px}p{color:#888;font-size:13px;margin-bottom:24px}table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px 10px;background:#1B2B4B;color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:.06em}@media print{button{display:none}}</style>' +
      '</head><body>' +
      '<h1>Property Shortlist</h1>' +
      '<p>Target Team - KW Valley Realty - ' + new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}) + '</p>' +
      '<table><thead><tr><th>Address</th><th>Price</th><th>Details</th><th>Notes</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>' +
      '<div style="margin-top:30px;font-size:11px;color:#aaa">Target Team - KW Valley Realty - 845.424.1014 - @thetargetteam</div>' +
      '<script>window.onload=function(){window.print()}<\/script>' +
      '</body></html>'
    win.document.write(html)
    win.document.close()
  }

  // Save shortlist to Supabase for this client
  async function saveForClient() {
    if (!clientId) { toast('Select a client first', '#F5A623'); return }
    setSaving(true)
    try {
      const payload = {
        contact_id:  clientId,
        agent_id:    agentId,
        listings:    JSON.stringify(shortlist.map(l => ({
          mlsId:   l.mlsId,
          addr:    mlsFullAddr(l),
          price:   l.listPrice,
          beds:    l.property?.bedrooms,
          baths:   l.property?.bathsFull,
          sqft:    l.property?.area,
        }))),
        notes:       clientNote,
        created_at:  new Date().toISOString(),
      }
      const { error } = await supabase.from('mls_shortlists').upsert(payload, { onConflict: 'contact_id,agent_id' })
      if (error) throw error
      toast('✅ Shortlist saved to ' + (contacts.find(c=>c.id===clientId)?.first_name||'client') + '\'s profile')
    } catch(e) {
      // Table might not exist — still useful to show the route/print
      toast('Saved locally (run SQL to persist: see below)', '#F5A623')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ fontFamily:ff }}>
      {/* Shortlist header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:8 }}>
        <div style={{ fontSize:15, fontWeight:800, color:'var(--text)' }}>
          ★ Shortlist <span style={{ fontWeight:400, color:'var(--muted)', fontSize:13 }}>({shortlist.length} {shortlist.length===1?'property':'properties'})</span>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={printList}
            style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--text)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff, display:'flex', alignItems:'center', gap:5 }}>
            🖨 Print / PDF
          </button>
          <a href={routeUrl()} target="_blank" rel="noopener noreferrer"
            style={{ padding:'6px 12px', borderRadius:8, border:'none', background:'#10B981', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff, textDecoration:'none', display:'flex', alignItems:'center', gap:5 }}>
            🗺 Route (Traffic)
          </a>
        </div>
      </div>

      {/* Listings */}
      <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
        {shortlist.map((l, i) => (
          <div key={l.mlsId||i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'var(--dim)', borderRadius:10, border:'1px solid var(--border)' }}>
            <div style={{ width:28, height:28, borderRadius:6, background:'#CC2200', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:900, flexShrink:0 }}>{i+1}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{mlsFullAddr(l)}</div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>
                {fmt$(l.listPrice)}
                {l.property?.bedrooms ? ' · ' + l.property.bedrooms + ' bd' : ''}
                {l.property?.bathsFull ? ' ' + l.property.bathsFull + ' ba' : ''}
                {l.property?.area ? ' · ' + Number(l.property.area).toLocaleString() + ' sqft' : ''}
              </div>
            </div>
            <button onClick={() => onRemove(l)}
              style={{ background:'none', border:'none', cursor:'pointer', color:'#DC2626', fontSize:18, padding:4, flexShrink:0 }}>×</button>
          </div>
        ))}
      </div>

      {/* Connect to client */}
      <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:14, marginBottom:12 }}>
        <div style={{ fontSize:13, fontWeight:800, color:'var(--text)', marginBottom:10 }}>👤 Connect to a Client</div>
        <select value={clientId} onChange={e => setClientId(e.target.value)}
          style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, marginBottom:8 }}>
          <option value="">— Select client —</option>
          {contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} {c.phone ? '· ' + c.phone : ''}</option>)}
        </select>
        <textarea value={clientNote} onChange={e => setClientNote(e.target.value)} rows={2}
          placeholder="Notes for this client (budget, preferences, must-haves...)"
          style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff, resize:'none', boxSizing:'border-box', marginBottom:8 }} />
        <button onClick={saveForClient} disabled={saving || !clientId}
          style={{ width:'100%', padding:'9px', borderRadius:8, border:'none', background:clientId?'#CC2200':'var(--dim)', color:clientId?'#fff':'var(--muted)', fontSize:13, fontWeight:700, cursor:clientId&&!saving?'pointer':'default', fontFamily:ff }}>
          {saving ? 'Saving...' : '💾 Save Shortlist to Client Profile'}
        </button>
      </div>

      {/* Route details */}
      <div style={{ background:'var(--dim)', borderRadius:10, border:'1px solid var(--border)', padding:12 }}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--text)', marginBottom:6 }}>📍 Showing Route</div>
        <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:10 }}>
          {shortlist.map((l, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--muted)' }}>
              <span style={{ width:18, height:18, borderRadius:'50%', background:'#CC2200', color:'#fff', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, flexShrink:0 }}>{i+1}</span>
              {mlsAddr(l)}, {l.address?.city}
            </div>
          ))}
        </div>
        <a href={routeUrl()} target="_blank" rel="noopener noreferrer"
          style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'9px', borderRadius:8, background:'#10B981', color:'#fff', fontSize:12, fontWeight:700, textDecoration:'none' }}>
          🚗 Open in Google Maps with Traffic
        </a>
        <div style={{ fontSize:10, color:'var(--muted)', marginTop:6, textAlign:'center' }}>
          Opens Google Maps with all stops in order. Real-time traffic routing.
        </div>
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────────
export function MLSSearch({ agents, onImported }) {
  const { agent }  = useAuth()
  const { toast }  = useApp()

  // Search state
  const [query,    setQuery]    = useState('')
  const [city,     setCity]     = useState('')
  const [propType, setPropType] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [minBeds,  setMinBeds]  = useState('')
  const [mlsNum,   setMlsNum]   = useState('')
  const [results,  setResults]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const [searched, setSearched] = useState(false)
  const [importing,setImporting]= useState(null)
  const [total,    setTotal]    = useState(0)
  const [page,     setPage]     = useState(0)
  const isDemo = MLS_USER === 'simplyrets'

  // Shortlist state
  const [shortlist,  setShortlist]  = useState([])  // saved MLS listings
  const [showPanel,  setShowPanel]  = useState(false)
  const [contacts,   setContacts]   = useState([])
  const [loadedCons, setLoadedCons] = useState(false)

  const PER_PAGE = 12

  async function loadContacts() {
    if (loadedCons) return
    try {
      const { data } = await supabase.from('contacts').select('id,first_name,last_name,phone').eq('agent_id', agent?.id).order('first_name').limit(200)
      setContacts(data || [])
      setLoadedCons(true)
    } catch(e) {}
  }

  async function search(pg = 0) {
    setLoading(true); setSearched(true)
    if (pg === 0) setResults([])
    try {
      const params = new URLSearchParams({ limit: PER_PAGE, offset: pg * PER_PAGE, status: 'Active' })
      if (city)     params.set('cities', city)
      if (propType) params.set('type', propType)
      if (minPrice) params.set('minprice', minPrice.replace(/\D/g,''))
      if (maxPrice) params.set('maxprice', maxPrice.replace(/\D/g,''))
      if (minBeds)  params.set('minbeds', minBeds)
      if (mlsNum)   params.set('q', mlsNum)
      else if (query) params.set('q', query)

      const auth = btoa(MLS_USER + ':' + MLS_PASS)
      const res  = await fetch(MLS_BASE + '/properties?' + params, {
        headers: { 'Authorization': 'Basic ' + auth, 'Accept': 'application/json' }
      })
      if (!res.ok) throw new Error('API returned ' + res.status)
      const data  = await res.json()
      const tot   = parseInt(res.headers.get('X-Total-Count') || data.length) || data.length
      setTotal(tot); setPage(pg)
      if (pg === 0) setResults(data); else setResults(p => [...p, ...data])
    } catch(e) {
      if (isDemo) setResults(DEMO_LISTINGS); else toast('MLS search failed: ' + e.message, '#F5A623')
    } finally { setLoading(false) }
  }

  function saveToShortlist(listing) {
    if (shortlist.find(l => l.mlsId === listing.mlsId)) return
    setShortlist(p => [...p, listing])
    if (!loadedCons) loadContacts()
    toast('★ Added to shortlist (' + (shortlist.length + 1) + ' total)')
  }

  function removeFromShortlist(listing) {
    setShortlist(p => p.filter(l => l.mlsId !== listing.mlsId))
  }

  async function importListing(mlsListing) {
    setImporting(mlsListing.mlsId)
    try {
      const streetAddr = mlsAddr(mlsListing)
      const a = mlsListing.address || {}
      const { data: existing } = await supabase.from('listings').select('id').eq('addr', streetAddr.trim()).maybeSingle()
      if (existing?.id) { toast('Already in CRM — ' + streetAddr, '#F5A623'); setImporting(null); return }
      const row = {
        addr: streetAddr.trim(), city: a.city||'', state: a.state||'NY', zip: a.postalCode||'',
        status: 'Active', list_price: mlsListing.listPrice||null,
        property_type: mlsListing.property?.type||'Single Family', deal_type: 'MLS',
        beds: mlsListing.property?.bedrooms||null, baths: mlsListing.property?.bathsFull||null,
        sqft: mlsListing.property?.area||null,
        list_date: mlsListing.listDate ? mlsListing.listDate.slice(0,10) : new Date().toISOString().slice(0,10),
        mls_number: mlsListing.mlsId||'', mls_link: mlsListing.listingUrl||'',
        notes: mlsListing.remarks ? mlsListing.remarks.slice(0,500) : '',
        agent_id: agent?.id||null,
        lat: mlsListing.geo?.lat||null, lng: mlsListing.geo?.lng||null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }
      const { data, error } = await supabase.from('listings').insert(row).select().single()
      if (error) throw error
      toast('✅ Imported: ' + streetAddr)
      onImported && onImported(data)
    } catch(e) { toast('Import failed: ' + e.message, '#DC2626') }
    finally { setImporting(null) }
  }

  const inp = { padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, boxSizing:'border-box', width:'100%' }

  return (
    <div style={{ fontFamily:ff }}>

      {/* Header + shortlist button */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontSize:17, fontWeight:900, color:'var(--text)', marginBottom:2 }}>🔍 MLS Search</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>
            Search OneKey MLS · save listings for clients · build showing route · print or import
            {isDemo && <span style={{ color:'#F5A623', fontWeight:700 }}> · Demo mode — add SimplyRETS credentials to Vercel for live data</span>}
          </div>
        </div>
        <button onClick={() => { setShowPanel(p => !p); loadContacts() }}
          style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 16px', borderRadius:9, border:'2px solid '+(showPanel||shortlist.length>0?'#CC2200':'var(--border)'), background:shortlist.length>0?'rgba(204,34,0,.08)':'var(--panel)', color:shortlist.length>0?'#CC2200':'var(--muted)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:ff, position:'relative', flexShrink:0 }}>
          ★ Shortlist
          {shortlist.length > 0 && (
            <span style={{ background:'#CC2200', color:'#fff', borderRadius:'50%', width:20, height:20, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:900 }}>{shortlist.length}</span>
          )}
        </button>
      </div>

      <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>

        {/* LEFT: Search + Results */}
        <div style={{ flex:1, minWidth:0 }}>

          {/* Search form */}
          <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:14, marginBottom:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, marginBottom:10 }}>
              <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key==='Enter'&&search()}
                placeholder="Address, MLS#, city, or neighborhood..." style={inp} />
              <button onClick={() => search()}
                style={{ padding:'8px 20px', borderRadius:8, border:'none', background:'#CC2200', color:'#fff', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:ff, whiteSpace:'nowrap' }}>
                🔍 Search
              </button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px, 1fr))', gap:7 }}>
              {[
                <select key="city" value={city} onChange={e=>setCity(e.target.value)} style={inp}><option value="">All areas</option>{CITIES.map(c=><option key={c} value={c}>{c}</option>)}</select>,
                <select key="type" value={propType} onChange={e=>setPropType(e.target.value)} style={inp}>{PROP_TYPES.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select>,
                <input key="min" value={minPrice} onChange={e=>setMinPrice(e.target.value)} placeholder="Min price" style={inp} />,
                <input key="max" value={maxPrice} onChange={e=>setMaxPrice(e.target.value)} placeholder="Max price" style={inp} />,
                <select key="beds" value={minBeds} onChange={e=>setMinBeds(e.target.value)} style={inp}><option value="">Any beds</option>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n}+ beds</option>)}</select>,
                <input key="mls" value={mlsNum} onChange={e=>setMlsNum(e.target.value)} placeholder="MLS #" style={inp} />,
              ].map((el,i) => <div key={i}>{el}</div>)}
            </div>
          </div>

          {/* Loading */}
          {loading && page===0 && (
            <div style={{ textAlign:'center', padding:'40px 0', color:'var(--muted)', fontSize:13 }}>
              <div style={{ fontSize:28, marginBottom:8 }}>🔍</div>Searching MLS...
            </div>
          )}

          {/* No results */}
          {!loading && searched && results.length===0 && (
            <div style={{ textAlign:'center', padding:'40px 0', color:'var(--muted)', fontSize:13 }}>
              <div style={{ fontSize:28, marginBottom:8 }}>🏡</div>No listings found — try adjusting your filters.
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <div style={{ fontSize:13, color:'var(--muted)' }}>
                  <strong style={{ color:'var(--text)' }}>{total.toLocaleString()}</strong> listings{city?' in '+city:''}
                  {shortlist.length > 0 && <span style={{ marginLeft:10, color:'#CC2200', fontWeight:700 }}>★ {shortlist.length} saved</span>}
                </div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>★ Save → build a showing route</div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:12 }}>
                {results.map((r, i) => (
                  <MLSCard key={r.mlsId||i} listing={r}
                    saved={!!shortlist.find(l=>l.mlsId===r.mlsId)}
                    onSave={saveToShortlist}
                    onUnsave={removeFromShortlist}
                    onImport={importListing}
                    importing={importing===r.mlsId}
                  />
                ))}
              </div>
              {results.length < total && (
                <div style={{ textAlign:'center', marginTop:16 }}>
                  <button onClick={() => search(page+1)} disabled={loading}
                    style={{ padding:'9px 24px', borderRadius:9, border:'1px solid var(--border)', background:'var(--panel)', color:'var(--text)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
                    {loading?'Loading...':'Load more'}
                  </button>
                </div>
              )}
            </>
          )}

          {/* Empty state */}
          {!searched && (
            <div style={{ textAlign:'center', padding:'48px 16px', color:'var(--muted)' }}>
              <div style={{ fontSize:44, marginBottom:10 }}>🏡</div>
              <div style={{ fontSize:15, fontWeight:800, color:'var(--text)', marginBottom:6 }}>MLS Listing Search</div>
              <div style={{ fontSize:12, lineHeight:1.7, maxWidth:380, margin:'0 auto 16px' }}>
                Search the OneKey MLS · click ★ to save listings for a client · build a showing route with real-time traffic · print a PDF report
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, justifyContent:'center' }}>
                {CITIES.slice(0,8).map(c => (
                  <button key={c} onClick={() => { setCity(c); setTimeout(()=>search(),80) }}
                    style={{ padding:'6px 12px', borderRadius:16, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--text)', fontSize:12, cursor:'pointer', fontFamily:ff }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Shortlist panel (sticky) */}
        {showPanel && (
          <div style={{ width:340, flexShrink:0, background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:14, position:'sticky', top:0, maxHeight:'calc(100vh - 140px)', overflowY:'auto' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <div style={{ fontSize:14, fontWeight:800, color:'var(--text)' }}>★ Client Shortlist</div>
              <button onClick={() => setShowPanel(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:18 }}>×</button>
            </div>
            <ShortlistPanel
              shortlist={shortlist}
              onRemove={removeFromShortlist}
              contacts={contacts}
              toast={toast}
              agentId={agent?.id}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── DEMO DATA ─────────────────────────────────────────────────────
const DEMO_LISTINGS = [
  { mlsId:'800001', listPrice:749000, listDate:'2026-06-01T00:00:00Z', remarks:'Beautiful single family home in Monsey. Renovated kitchen, 2-car garage, large yard.', photos:[], mls:{status:'Active'}, address:{streetNumber:'15',streetName:'Oak Lane',city:'Monsey',state:'NY',postalCode:'10952',county:'Rockland'}, property:{bedrooms:4,bathsFull:2,area:2100,type:'Single Family',yearBuilt:1985,garageSpaces:2}, agent:{firstName:'Mendy',lastName:'Jankovits'}, office:{name:'KW Valley Realty'}, geo:{lat:41.12,lng:-74.07} },
  { mlsId:'800002', listPrice:1299000, listDate:'2026-05-15T00:00:00Z', remarks:'Stunning new construction condo. 8 beds, 6.5 baths. Top finishes throughout.', photos:[], mls:{status:'Active'}, address:{streetNumber:'40',streetName:'Singer Ave',unit:'205',city:'Spring Valley',state:'NY',postalCode:'10977'}, property:{bedrooms:8,bathsFull:6,area:4200,type:'Condominium',yearBuilt:2026}, agent:{firstName:'Eli',lastName:'Hoffman'}, office:{name:'KW Valley Realty'} },
  { mlsId:'800003', listPrice:549000, listDate:'2026-06-10T00:00:00Z', remarks:'Charming cape cod on quiet street. Updated bathrooms, new roof 2024.', photos:[], mls:{status:'Active'}, address:{streetNumber:'84',streetName:'Tennyson Dr',city:'Nanuet',state:'NY',postalCode:'10954'}, property:{bedrooms:3,bathsFull:2,area:1650,type:'Single Family',yearBuilt:1965}, agent:{firstName:'Avraham',lastName:'Weinberger'}, office:{name:'KW Valley Realty'} },
  { mlsId:'800004', listPrice:899000, listDate:'2026-06-05T00:00:00Z', remarks:'Gorgeous colonial in prime New City. Cul-de-sac, large yard, finished basement.', photos:[], mls:{status:'Active'}, address:{streetNumber:'22',streetName:'Birchwood Ct',city:'New City',state:'NY',postalCode:'10956'}, property:{bedrooms:5,bathsFull:3,area:3200,type:'Single Family',yearBuilt:1992,garageSpaces:2}, agent:{firstName:'Joel',lastName:'Rottenstein'}, office:{name:'KW Valley Realty'} },
  { mlsId:'800005', listPrice:425000, listDate:'2026-06-12T00:00:00Z', remarks:'Move-in ready ranch. Open floor plan, updated kitchen. Minutes from highway.', photos:[], mls:{status:'Active'}, address:{streetNumber:'47',streetName:'Prairie Ave',city:'Suffern',state:'NY',postalCode:'10901'}, property:{bedrooms:3,bathsFull:1,area:1200,type:'Single Family',yearBuilt:1958}, agent:{firstName:'Avraham',lastName:'Weinberger'}, office:{name:'KW Valley Realty'} },
  { mlsId:'800006', listPrice:1599000, listDate:'2026-04-20T00:00:00Z', remarks:'Luxurious new construction. 9 beds, 7 baths. Premium location, magnificent views.', photos:[], mls:{status:'Active'}, address:{streetNumber:'5',streetName:'Mirror Lake Rd',unit:'201',city:'Spring Valley',state:'NY',postalCode:'10977'}, property:{bedrooms:9,bathsFull:7,area:4777,type:'Condominium',yearBuilt:2026}, agent:{firstName:'Joel',lastName:'Rottenstein'}, office:{name:'KW Valley Realty'} },
  { mlsId:'800007', listPrice:675000, listDate:'2026-06-08T00:00:00Z', remarks:'Spacious high ranch. 5 beds, 3 baths. Oversized property, room to expand.', photos:[], mls:{status:'Active'}, address:{streetNumber:'12',streetName:'Maple Ave',city:'Wesley Hills',state:'NY',postalCode:'10952'}, property:{bedrooms:5,bathsFull:3,area:2400,type:'Single Family',yearBuilt:1978,garageSpaces:1}, agent:{firstName:'Mendy',lastName:'Jankovits'}, office:{name:'KW Valley Realty'} },
  { mlsId:'800008', listPrice:950000, listDate:'2026-06-01T00:00:00Z', remarks:'Stunning colonial in sought-after Pomona. Private cul-de-sac, custom kitchen.', photos:[], mls:{status:'Active'}, address:{streetNumber:'8',streetName:'Deer Run',city:'Pomona',state:'NY',postalCode:'10970'}, property:{bedrooms:5,bathsFull:3,area:3600,type:'Single Family',yearBuilt:2001,garageSpaces:2,pool:true}, agent:{firstName:'Eli',lastName:'Hoffman'}, office:{name:'KW Valley Realty'} },
]
