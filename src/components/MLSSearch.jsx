// TargetOS V2 — MLS Search Hub
// Agents can search the OneKey MLS, view full listing details,
// and import any listing directly into the CRM with one click.
// Uses SimplyRETS demo endpoint until production credentials are set.
import React, { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth }  from '../context/AuthContext'
import { useApp }   from '../context/AppContext'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// ── MLS CONFIG ────────────────────────────────────────────────────
// SimplyRETS API — swap demo credentials for production when ready
// Production: get credentials at simplyrets.com → supports OneKey MLS
const MLS_USER = import.meta.env.VITE_SIMPLYRETS_USER || 'simplyrets'
const MLS_PASS = import.meta.env.VITE_SIMPLYRETS_PASS || 'simplyrets'
const MLS_BASE = 'https://api.simplyrets.com'

// These are the real OneKey MLS areas your team works in
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
  { id:'Commercial', label:'Commercial' },
  { id:'Land', label:'Land' },
]

function fmt$(n) { return n ? '$' + Number(n).toLocaleString() : '' }

// ── MLS LISTING CARD ──────────────────────────────────────────────
function MLSCard({ listing, onImport, importing }) {
  const [expanded, setExpanded] = useState(false)
  const photos = listing.photos || []
  const addr   = listing.address

  const fullAddr = [
    addr?.streetNumber, addr?.streetName,
    addr?.unit ? '#' + addr.unit : null,
    addr?.city, addr?.state, addr?.postalCode,
  ].filter(Boolean).join(' ')

  const price   = fmt$(listing.listPrice)
  const beds    = listing.property?.bedrooms
  const baths   = listing.property?.bathsFull
  const sqft    = listing.property?.area
  const status  = listing.mls?.status || 'Active'
  const mlsNum  = listing.mlsId
  const agent   = listing.agent?.firstName + ' ' + (listing.agent?.lastName || '')
  const office  = listing.office?.name
  const listDate = listing.listDate ? new Date(listing.listDate).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : ''

  const statusColor = status === 'Active' ? '#10B981' : status === 'Pending' ? '#F5A623' : '#94A3B8'

  return (
    <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', overflow:'hidden', transition:'box-shadow .15s' }}
      onMouseEnter={e => e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,.1)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow='none'}>

      {/* Photo */}
      <div style={{ position:'relative', height:180, background:'var(--dim)', overflow:'hidden' }}>
        {photos[0]
          ? <img src={photos[0]} alt={fullAddr} style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e => { e.target.style.display='none' }} />
          : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:36, color:'var(--muted)' }}>🏡</div>
        }
        {/* Status badge */}
        <div style={{ position:'absolute', top:8, left:8, padding:'3px 10px', borderRadius:12, background:statusColor, color:'#fff', fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'.06em' }}>
          {status}
        </div>
        {/* Photo count */}
        {photos.length > 1 && (
          <div style={{ position:'absolute', bottom:8, right:8, padding:'2px 8px', borderRadius:10, background:'rgba(0,0,0,.6)', color:'#fff', fontSize:10 }}>
            📷 {photos.length}
          </div>
        )}
      </div>

      <div style={{ padding:'12px 14px' }}>
        {/* Price */}
        <div style={{ fontSize:20, fontWeight:900, color:'var(--text)', marginBottom:3 }}>{price}</div>

        {/* Address */}
        <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:2, lineHeight:1.4 }}>{fullAddr}</div>

        {/* Stats row */}
        <div style={{ display:'flex', gap:12, marginBottom:10, flexWrap:'wrap' }}>
          {beds  && <span style={{ fontSize:12, color:'var(--muted)' }}><strong style={{ color:'var(--text)' }}>{beds}</strong> bd</span>}
          {baths && <span style={{ fontSize:12, color:'var(--muted)' }}><strong style={{ color:'var(--text)' }}>{baths}</strong> ba</span>}
          {sqft  && <span style={{ fontSize:12, color:'var(--muted)' }}><strong style={{ color:'var(--text)' }}>{Number(sqft).toLocaleString()}</strong> sqft</span>}
          {mlsNum && <span style={{ fontSize:11, color:'var(--muted)' }}>MLS# {mlsNum}</span>}
        </div>

        {/* Expanded details */}
        {expanded && (
          <div style={{ borderTop:'1px solid var(--border)', paddingTop:10, marginBottom:10 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:8 }}>
              {[
                ['List Date', listDate],
                ['Property Type', listing.property?.type],
                ['Year Built', listing.property?.yearBuilt],
                ['Garage', listing.property?.garageSpaces ? listing.property.garageSpaces + ' spaces' : null],
                ['Basement', listing.property?.basement],
                ['Pool', listing.property?.pool ? 'Yes' : null],
                ['County', addr?.county],
                ['School District', listing.school?.district],
              ].filter(([,v]) => v).map(([k,v]) => (
                <div key={k}>
                  <div style={{ fontSize:9, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em' }}>{k}</div>
                  <div style={{ fontSize:12, color:'var(--text)' }}>{v}</div>
                </div>
              ))}
            </div>
            {listing.remarks && (
              <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.6, padding:'8px 10px', background:'var(--dim)', borderRadius:7, marginBottom:8 }}>
                {listing.remarks.slice(0,300)}{listing.remarks.length > 300 ? '...' : ''}
              </div>
            )}
            {agent && (
              <div style={{ fontSize:11, color:'var(--muted)' }}>
                Listed by: <strong style={{ color:'var(--text)' }}>{agent}</strong>
                {office ? ' · ' + office : ''}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={() => setExpanded(x => !x)}
            style={{ flex:1, padding:'7px', borderRadius:8, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:ff }}>
            {expanded ? '▲ Less' : '▼ Details'}
          </button>
          <button onClick={() => onImport(listing)}
            disabled={importing}
            style={{ flex:1, padding:'7px', borderRadius:8, border:'none', background:'#CC2200', color:'#fff', fontSize:12, fontWeight:700, cursor:importing?'default':'pointer', fontFamily:ff, opacity:importing?.7:1 }}>
            {importing ? '⏳ Importing...' : '⬇ Import to CRM'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── MAIN MLS SEARCH COMPONENT ─────────────────────────────────────
export function MLSSearch({ agents, onImported }) {
  const { agent }  = useAuth()
  const { toast }  = useApp()

  const [query,      setQuery]      = useState('')
  const [city,       setCity]       = useState('')
  const [propType,   setPropType]   = useState('')
  const [minPrice,   setMinPrice]   = useState('')
  const [maxPrice,   setMaxPrice]   = useState('')
  const [minBeds,    setMinBeds]    = useState('')
  const [mlsNum,     setMlsNum]     = useState('')
  const [results,    setResults]    = useState([])
  const [loading,    setLoading]    = useState(false)
  const [searched,   setSearched]   = useState(false)
  const [importing,  setImporting]  = useState(null)
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(0)
  const [isDemo,     setIsDemo]     = useState(MLS_USER === 'simplyrets')

  const PER_PAGE = 12

  async function search(pg = 0) {
    setLoading(true); setSearched(true)
    if (pg === 0) setResults([])
    try {
      const params = new URLSearchParams({
        limit:  PER_PAGE,
        offset: pg * PER_PAGE,
        status: 'Active',
      })
      if (city)     params.set('cities', city)
      if (propType) params.set('type', propType)
      if (minPrice) params.set('minprice', minPrice.replace(/[^0-9]/g,''))
      if (maxPrice) params.set('maxprice', maxPrice.replace(/[^0-9]/g,''))
      if (minBeds)  params.set('minbeds', minBeds)
      if (mlsNum)   params.set('q', mlsNum)
      else if (query) params.set('q', query)

      const auth = btoa(MLS_USER + ':' + MLS_PASS)
      const res  = await fetch(MLS_BASE + '/properties?' + params, {
        headers: { 'Authorization': 'Basic ' + auth, 'Accept': 'application/json' }
      })

      if (!res.ok) throw new Error('MLS API returned ' + res.status)

      const data = await res.json()
      const total = parseInt(res.headers.get('X-Total-Count') || data.length) || data.length
      setTotal(total)
      setPage(pg)
      if (pg === 0) setResults(data)
      else setResults(prev => [...prev, ...data])
    } catch(e) {
      toast('MLS search failed: ' + e.message + (isDemo ? ' (using demo data)' : ''), '#F5A623')
      // Show demo results so the UI is useful
      if (isDemo) setResults(DEMO_LISTINGS)
    } finally { setLoading(false) }
  }

  async function importListing(mlsListing) {
    setImporting(mlsListing.mlsId)
    try {
      const addr = mlsListing.address
      const streetAddr = [addr?.streetNumber, addr?.streetName, addr?.unit ? '#' + addr.unit : null].filter(Boolean).join(' ')
      const fullAddr   = streetAddr + ', ' + (addr?.city || '') + ', ' + (addr?.state || '') + ' ' + (addr?.postalCode || '')

      // Check if already exists
      const { data: existing } = await supabase
        .from('listings')
        .select('id')
        .eq('addr', streetAddr.trim())
        .maybeSingle()

      if (existing?.id) {
        toast('This listing already exists in the CRM', '#F5A623')
        setImporting(null)
        return
      }

      const row = {
        addr:          streetAddr.trim(),
        city:          addr?.city || '',
        state:         addr?.state || 'NY',
        zip:           addr?.postalCode || '',
        status:        'Active',
        list_price:    mlsListing.listPrice || null,
        property_type: mlsListing.property?.type || 'Single Family',
        deal_type:     'MLS',
        beds:          mlsListing.property?.bedrooms || null,
        baths:         mlsListing.property?.bathsFull || null,
        sqft:          mlsListing.property?.area || null,
        list_date:     mlsListing.listDate ? mlsListing.listDate.slice(0,10) : new Date().toISOString().slice(0,10),
        mls_number:    mlsListing.mlsId || '',
        mls_link:      mlsListing.listingUrl || '',
        notes:         mlsListing.remarks ? mlsListing.remarks.slice(0,500) : '',
        agent_id:      agent?.id || null,
        lat:           mlsListing.geo?.lat || null,
        lng:           mlsListing.geo?.lng || null,
        created_at:    new Date().toISOString(),
        updated_at:    new Date().toISOString(),
      }

      const { data, error } = await supabase.from('listings').insert(row).select().single()
      if (error) throw error

      toast('✅ ' + streetAddr + ' imported to Listings board')
      onImported && onImported(data)
    } catch(e) {
      toast('Import failed: ' + e.message, '#DC2626')
    } finally {
      setImporting(null)
    }
  }

  const inp = {
    padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)',
    background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff,
    boxSizing:'border-box', width:'100%',
  }

  return (
    <div style={{ fontFamily:ff }}>

      {/* Header */}
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:18, fontWeight:900, color:'var(--text)', marginBottom:3 }}>🔍 MLS Search</div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>
          Search the OneKey MLS and import listings directly into the CRM.
          {isDemo && <span style={{ color:'#F5A623', fontWeight:700 }}> · Running on demo data — add VITE_SIMPLYRETS_USER + VITE_SIMPLYRETS_PASS to Vercel for live MLS access.</span>}
        </div>
      </div>

      {/* Search form */}
      <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:16, marginBottom:16 }}>
        {/* Main search row */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, marginBottom:12 }}>
          <input value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="Search by address, MLS#, city, or neighborhood..."
            style={inp} />
          <button onClick={() => search()}
            style={{ padding:'8px 24px', borderRadius:8, border:'none', background:'#CC2200', color:'#fff', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:ff, whiteSpace:'nowrap' }}>
            🔍 Search
          </button>
        </div>

        {/* Filters */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:8 }}>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>City / Area</div>
            <select value={city} onChange={e => setCity(e.target.value)} style={inp}>
              <option value="">All areas</option>
              {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>Property Type</div>
            <select value={propType} onChange={e => setPropType(e.target.value)} style={inp}>
              {PROP_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>Min Price</div>
            <input value={minPrice} onChange={e => setMinPrice(e.target.value)} placeholder="$300,000" style={inp} />
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>Max Price</div>
            <input value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="$1,500,000" style={inp} />
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>Min Beds</div>
            <select value={minBeds} onChange={e => setMinBeds(e.target.value)} style={inp}>
              <option value="">Any</option>
              {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}+</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>MLS Number</div>
            <input value={mlsNum} onChange={e => setMlsNum(e.target.value)} placeholder="e.g. 801234" style={inp} />
          </div>
        </div>
      </div>

      {/* Results */}
      {loading && page === 0 && (
        <div style={{ textAlign:'center', padding:'48px 0', color:'var(--muted)', fontSize:13 }}>
          <div style={{ fontSize:28, marginBottom:10 }}>🔍</div>
          Searching MLS...
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <div style={{ textAlign:'center', padding:'48px 0', color:'var(--muted)', fontSize:13 }}>
          <div style={{ fontSize:28, marginBottom:10 }}>🏡</div>
          No listings found. Try adjusting your filters.
        </div>
      )}

      {results.length > 0 && (
        <>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div style={{ fontSize:13, color:'var(--muted)' }}>
              <strong style={{ color:'var(--text)' }}>{total.toLocaleString()}</strong> listings found
              {city ? ' in ' + city : ''}
            </div>
            <div style={{ fontSize:11, color:'var(--muted)' }}>Click "Import to CRM" to add any listing</div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:14 }}>
            {results.map((r, i) => (
              <MLSCard
                key={r.mlsId || i}
                listing={r}
                onImport={importListing}
                importing={importing === r.mlsId}
              />
            ))}
          </div>

          {results.length < total && (
            <div style={{ textAlign:'center', marginTop:20 }}>
              <button onClick={() => search(page + 1)} disabled={loading}
                style={{ padding:'10px 28px', borderRadius:9, border:'1px solid var(--border)', background:'var(--panel)', color:'var(--text)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
                {loading ? 'Loading...' : 'Load more listings'}
              </button>
            </div>
          )}
        </>
      )}

      {!searched && (
        <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--muted)' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🏡</div>
          <div style={{ fontSize:16, fontWeight:800, color:'var(--text)', marginBottom:6 }}>MLS Listing Search</div>
          <div style={{ fontSize:13, lineHeight:1.7, maxWidth:400, margin:'0 auto' }}>
            Search the OneKey MLS database and import any listing into your CRM with one click. Address, price, beds, baths, photos and all details auto-fill.
          </div>
          <div style={{ marginTop:20, display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap' }}>
            {CITIES.slice(0,6).map(c => (
              <button key={c} onClick={() => { setCity(c); setTimeout(() => search(), 100) }}
                style={{ padding:'6px 14px', borderRadius:20, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--text)', fontSize:12, cursor:'pointer', fontFamily:ff }}>
                {c}
              </button>
            ))}
          </div>
          <div style={{ marginTop:24, padding:'12px 16px', background:'var(--dim)', borderRadius:10, border:'1px solid var(--border)', maxWidth:480, margin:'24px auto 0', fontSize:12, color:'var(--muted)', lineHeight:1.7 }}>
            <strong style={{ color:'var(--text)' }}>To connect to the live OneKey MLS:</strong><br/>
            1. Sign up at <strong>simplyrets.com</strong> (SimplyRETS is an approved OneKey MLS vendor)<br/>
            2. Add your credentials to Vercel:<br/>
            <code style={{ fontFamily:'monospace', color:'#CC2200' }}>VITE_SIMPLYRETS_USER</code> and <code style={{ fontFamily:'monospace', color:'#CC2200' }}>VITE_SIMPLYRETS_PASS</code>
          </div>
        </div>
      )}
    </div>
  )
}

// ── DEMO DATA (shows when no credentials set) ─────────────────────
const DEMO_LISTINGS = [
  { mlsId:'800001', listPrice:749000, listDate:'2026-06-01T00:00:00Z', remarks:'Beautiful single family home in desirable Monsey location. Fully renovated kitchen, 2-car garage.', photos:[], mls:{status:'Active'}, address:{streetNumber:'15',streetName:'Oak Lane',city:'Monsey',state:'NY',postalCode:'10952',county:'Rockland'}, property:{bedrooms:4,bathsFull:2,area:2100,type:'ResidentialProperty',yearBuilt:1985,garageSpaces:2}, agent:{firstName:'Mendy',lastName:'Jankovits'}, office:{name:'KW Valley Realty'}, geo:{lat:41.12,lng:-74.07} },
  { mlsId:'800002', listPrice:1299000, listDate:'2026-05-15T00:00:00Z', remarks:'Stunning new construction condo. 8 beds, 6.5 baths. Top of the line finishes throughout.', photos:[], mls:{status:'Active'}, address:{streetNumber:'40',streetName:'Singer Ave',unit:'205',city:'Spring Valley',state:'NY',postalCode:'10977'}, property:{bedrooms:8,bathsFull:6,area:4200,type:'Condominium',yearBuilt:2026}, agent:{firstName:'Eli',lastName:'Hoffman'}, office:{name:'KW Valley Realty'} },
  { mlsId:'800003', listPrice:549000, listDate:'2026-06-10T00:00:00Z', remarks:'Charming cape cod on quiet street. Updated bathrooms, new roof 2024. Close to all.', photos:[], mls:{status:'Active'}, address:{streetNumber:'84',streetName:'Tennyson Dr',city:'Nanuet',state:'NY',postalCode:'10954'}, property:{bedrooms:3,bathsFull:2,area:1650,type:'ResidentialProperty',yearBuilt:1965}, agent:{firstName:'Avraham',lastName:'Weinberger'}, office:{name:'KW Valley Realty'} },
  { mlsId:'800004', listPrice:899000, listDate:'2026-06-05T00:00:00Z', remarks:'Gorgeous colonial in prime New City location. Cul-de-sac, large yard, finished basement.', photos:[], mls:{status:'Active'}, address:{streetNumber:'22',streetName:'Birchwood Ct',city:'New City',state:'NY',postalCode:'10956'}, property:{bedrooms:5,bathsFull:3,area:3200,type:'ResidentialProperty',yearBuilt:1992,garageSpaces:2,pool:false}, agent:{firstName:'Joel',lastName:'Rottenstein'}, office:{name:'KW Valley Realty'} },
  { mlsId:'800005', listPrice:425000, listDate:'2026-06-12T00:00:00Z', remarks:'Move-in ready ranch. Open floor plan, hardwood floors, updated kitchen. Minutes from highway.', photos:[], mls:{status:'Active'}, address:{streetNumber:'47',streetName:'Prairie Ave',city:'Suffern',state:'NY',postalCode:'10901'}, property:{bedrooms:3,bathsFull:1,area:1200,type:'ResidentialProperty',yearBuilt:1958}, agent:{firstName:'Avraham',lastName:'Weinberger'}, office:{name:'KW Valley Realty'} },
  { mlsId:'800006', listPrice:1599000, listDate:'2026-04-20T00:00:00Z', remarks:'Luxurious new construction condo. 9 beds, 7 baths. Premium location, magnificent views.', photos:[], mls:{status:'Active'}, address:{streetNumber:'5',streetName:'Mirror Lake Rd',unit:'201',city:'Spring Valley',state:'NY',postalCode:'10977'}, property:{bedrooms:9,bathsFull:7,area:4777,type:'Condominium',yearBuilt:2026}, agent:{firstName:'Joel',lastName:'Rottenstein'}, office:{name:'KW Valley Realty'} },
]
