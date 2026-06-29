// TargetOS V2 — Public Website
// Rendered at /public/* routes — no auth required
// Pulls live MLS data from OneKey via SimplyRETS
// All content editable from CRM Website Builder
import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AddressAutocomplete } from '../components/AddressAutocomplete'

const MLS_USER = import.meta.env.VITE_SIMPLYRETS_USER || 'simplyrets'
const MLS_PASS = import.meta.env.VITE_SIMPLYRETS_PASS || 'simplyrets'
const GKEY     = import.meta.env.VITE_GOOGLE_MAPS_KEY || 'AIzaSyAgxix5MkxxNo1F5DPdrab3JMce2aSMe6c'

function fmt$(n) { return n ? '$' + Number(n).toLocaleString() : '' }

const DEFAULT_CONTENT = {
  settings: {
    primaryColor:   '#CC2200',
    secondaryColor: '#1B2B4B',
    fontFamily:     'Inter, system-ui, sans-serif',
    phone:          '845.424.1014',
    email:          'info@targetreteam.com',
    address:        'Monsey, NY',
    facebook:       'thetargetteam',
    instagram:      'thetargetteam',
    logoText:       'TARGET TEAM',
    tagline:        'Of Keller Williams Valley Realty',
  },
  hero: {
    headline:    'Find Your Dream Home in Rockland County',
    subheadline: 'The Target Team specializes in Monsey, Spring Valley, New City, Nanuet, and surrounding areas. Trusted by hundreds of families.',
    ctaText:     'Search Homes',
    ctaUrl:      '/public/listings',
    bgType:      'gradient',
    bgImage:     '',
    showSearch:  true,
  },
  about: {
    title:       'About Target Team',
    body:        'Target Team at Keller Williams Valley Realty is Rockland County\'s premier real estate team. With years of experience and deep local knowledge, we help buyers and sellers achieve their real estate goals.\n\nWe specialize in residential properties across Monsey, Spring Valley, New City, Nanuet, Suffern, and surrounding communities.',
    stats: [
      { number: '500+', label: 'Homes Sold' },
      { number: '$250M+', label: 'In Sales Volume' },
      { number: '10+', label: 'Years Experience' },
      { number: '5★', label: 'Average Rating' },
    ],
    image: '',
  },
  testimonials: [
    { name: 'Chani R.', text: 'Target Team made our home search effortless. They found us the perfect house in Monsey within two weeks!', stars: 5 },
    { name: 'Moshe K.', text: 'Professional, knowledgeable, and always responsive. Highly recommend for anyone buying or selling in Rockland County.', stars: 5 },
    { name: 'Rachel B.', text: 'Sold our house above asking price in just 4 days. Amazing team!', stars: 5 },
  ],
  contact: {
    title:    'Get In Touch',
    subtitle: 'Ready to buy or sell? We\'re here to help.',
    mapEmbed: '',
  },
  navbar: {
    links: [
      { label: 'Home',      url: '/public/home' },
      { label: 'Listings',  url: '/public/listings' },
      { label: 'Sold',      url: '/public/sold' },
      { label: 'About',     url: '/public/about' },
      { label: 'Contact',   url: '/public/contact' },
    ],
  },
}

// ── CONTENT HOOK ──────────────────────────────────────────────────
function useWebContent() {
  const [content, setContent] = useState(DEFAULT_CONTENT)
  useEffect(() => {
    supabase.from('website_content').select('section,content')
      .then(({ data }) => {
        if (!data?.length) return
        const merged = { ...DEFAULT_CONTENT }
        data.forEach(row => {
          merged[row.section] = { ...DEFAULT_CONTENT[row.section], ...row.content }
        })
        setContent(merged)
      }).catch(() => {})
  }, [])
  return content
}

// ── MLS HOOK ─────────────────────────────────────────────────────
function useMLSListings({ status = 'Active', limit = 9, city = '', minPrice = '', maxPrice = '', minBeds = '', type = '', query = '' } = {}) {
  const [listings, setListings] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [total,    setTotal]    = useState(0)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ limit, status })
    if (city)     params.set('cities', city)
    if (minPrice) params.set('minprice', String(minPrice).replace(/\D/g,''))
    if (maxPrice) params.set('maxprice', String(maxPrice).replace(/\D/g,''))
    if (minBeds)  params.set('minbeds', minBeds)
    if (type)     params.set('type', type)
    if (query)    params.set('q', query)

    fetch('https://api.simplyrets.com/properties?' + params, {
      headers: { 'Authorization': 'Basic ' + btoa(MLS_USER + ':' + MLS_PASS) }
    }).then(r => {
      setTotal(parseInt(r.headers.get('X-Total-Count') || '0'))
      return r.json()
    }).then(data => {
      setListings(Array.isArray(data) ? data : [])
    }).catch(() => setListings(DEMO_LISTINGS.filter(l => status === 'Active' ? l.mls?.status !== 'Closed' : true).slice(0, limit)))
    .finally(() => setLoading(false))
  }, [status, limit, city, minPrice, maxPrice, minBeds, type, query])

  return { listings, loading, total }
}

// ── PUBLIC NAV ────────────────────────────────────────────────────
function PublicNav({ s, active }) {
  const [open, setOpen] = useState(false)
  const bg     = s?.settings?.secondaryColor || '#1B2B4B'
  const accent = s?.settings?.primaryColor   || '#CC2200'
  const links  = s?.navbar?.links || DEFAULT_CONTENT.navbar.links

  return (
    <nav style={{ background: bg, position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 12px rgba(0,0,0,.2)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px', display: 'flex', alignItems: 'center', height: 64 }}>
        {/* Logo */}
        <Link to="/public/home" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', marginRight: 40 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-.5px', lineHeight: 1 }}>
            {(s?.settings?.logoText || 'TARGET TEAM').split('').map((ch, i) => (
              <span key={i} style={{ color: ['A','E'].includes(ch) ? accent : '#fff' }}>{ch}</span>
            ))}
          </div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', letterSpacing: '.15em', textTransform: 'uppercase', marginTop: 1 }}>
            {s?.settings?.tagline || 'Of KW Valley Realty'}
          </div>
        </Link>

        {/* Desktop links */}
        <div style={{ display: 'flex', gap: 4, flex: 1, '@media(max-width:640px)': { display: 'none' } }}>
          {links.map(l => (
            <Link key={l.url} to={l.url}
              style={{ padding: '6px 14px', borderRadius: 7, textDecoration: 'none', fontSize: 13, fontWeight: active === l.url ? 700 : 500,
                color: active === l.url ? '#fff' : 'rgba(255,255,255,.65)',
                background: active === l.url ? 'rgba(255,255,255,.12)' : 'transparent' }}>
              {l.label}
            </Link>
          ))}
        </div>

        {/* CTA */}
        <a href={`tel:${(s?.settings?.phone || '8454241014').replace(/\D/g,'')}`}
          style={{ marginLeft: 'auto', padding: '8px 18px', borderRadius: 8, background: accent, color: '#fff', fontSize: 13, fontWeight: 800, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          📞 {s?.settings?.phone || '845.424.1014'}
        </a>
      </div>
    </nav>
  )
}

// ── FOOTER ────────────────────────────────────────────────────────
function PublicFooter({ s }) {
  const bg     = s?.settings?.secondaryColor || '#1B2B4B'
  const accent = s?.settings?.primaryColor   || '#CC2200'
  return (
    <footer style={{ background: bg, color: 'rgba(255,255,255,.6)', padding: '40px 20px 24px', marginTop: 60 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 32, marginBottom: 32 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 6 }}>
              {(s?.settings?.logoText || 'TARGET TEAM').split('').map((ch, i) => (
                <span key={i} style={{ color: ['A','E'].includes(ch) ? accent : '#fff' }}>{ch}</span>
              ))}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.7 }}>{s?.settings?.tagline || 'Of Keller Williams Valley Realty'}</div>
            <div style={{ marginTop: 12, fontSize: 13, color: '#fff' }}>{s?.settings?.phone}</div>
            <div style={{ fontSize: 12 }}>{s?.settings?.email}</div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>Quick Links</div>
            {(s?.navbar?.links || DEFAULT_CONTENT.navbar.links).map(l => (
              <Link key={l.url} to={l.url} style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,.55)', textDecoration: 'none', marginBottom: 6, ':hover': { color: '#fff' } }}>{l.label}</Link>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>Areas We Serve</div>
            {['Monsey', 'Spring Valley', 'New City', 'Nanuet', 'Suffern', 'Wesley Hills', 'Pomona'].map(a => (
              <div key={a} style={{ fontSize: 13, color: 'rgba(255,255,255,.55)', marginBottom: 4 }}>{a}</div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>Follow Us</div>
            {s?.settings?.facebook && <a href={`https://facebook.com/${s.settings.facebook}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(255,255,255,.55)', textDecoration: 'none', marginBottom: 8 }}>📘 Facebook</a>}
            {s?.settings?.instagram && <a href={`https://instagram.com/${s.settings.instagram}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(255,255,255,.55)', textDecoration: 'none', marginBottom: 8 }}>📸 Instagram</a>}
            <Link to="/public/contact" style={{ display: 'inline-block', marginTop: 12, padding: '8px 18px', borderRadius: 8, background: accent, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Contact Us</Link>
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,.1)', paddingTop: 16, fontSize: 11, textAlign: 'center', color: 'rgba(255,255,255,.3)' }}>
          © {new Date().getFullYear()} Target Team at Keller Williams Valley Realty. All rights reserved. | Equal Housing Opportunity
        </div>
      </div>
    </footer>
  )
}

// ── LISTING CARD ──────────────────────────────────────────────────
function ListingCard({ listing, accent }) {
  const addr  = listing.address || {}
  const street = [addr.streetNumber, addr.streetName, addr.unit ? '#'+addr.unit : null].filter(Boolean).join(' ')
  const city  = addr.city || ''
  const photo = (listing.photos || [])[0]
  const beds  = listing.property?.bedrooms
  const baths = listing.property?.bathsFull
  const sqft  = listing.property?.area
  const status = listing.mls?.status || 'Active'
  const sc    = status === 'Active' ? '#10B981' : status === 'Pending' ? '#F5A623' : accent

  return (
    <Link to={`/public/listing/${listing.mlsId}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,.08)', transition: 'transform .2s, box-shadow .2s' }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,.14)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,.08)' }}>
        {/* Photo */}
        <div style={{ height: 200, background: '#F1F5F9', position: 'relative', overflow: 'hidden' }}>
          {photo
            ? <img src={photo} alt={street} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, color: '#CBD5E1' }}>🏡</div>
          }
          <div style={{ position: 'absolute', top: 10, left: 10, padding: '3px 10px', borderRadius: 20, background: sc, color: '#fff', fontSize: 11, fontWeight: 800 }}>
            {status}
          </div>
          {(listing.photos||[]).length > 1 && (
            <div style={{ position: 'absolute', bottom: 8, right: 10, padding: '2px 8px', borderRadius: 8, background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 11 }}>
              📷 {listing.photos.length}
            </div>
          )}
        </div>
        {/* Info */}
        <div style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: accent, marginBottom: 3 }}>{fmt$(listing.listPrice)}</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B', marginBottom: 2 }}>{street}</div>
          <div style={{ fontSize: 12, color: '#64748B', marginBottom: 10 }}>{city}{addr.state ? ', ' + addr.state : ''} {addr.postalCode}</div>
          <div style={{ display: 'flex', gap: 14, fontSize: 13, color: '#475569' }}>
            {beds  && <span><strong style={{ color: '#1E293B' }}>{beds}</strong> bd</span>}
            {baths && <span><strong style={{ color: '#1E293B' }}>{baths}</strong> ba</span>}
            {sqft  && <span><strong style={{ color: '#1E293B' }}>{Number(sqft).toLocaleString()}</strong> sqft</span>}
          </div>
          {listing.mlsId && <div style={{ marginTop: 8, fontSize: 11, color: '#94A3B8' }}>MLS# {listing.mlsId}</div>}
        </div>
      </div>
    </Link>
  )
}

// ── HOME PAGE ─────────────────────────────────────────────────────
export function PublicHome() {
  const s = useWebContent()
  const hero = s.hero || {}
  const about = s.about || {}
  const testimonials = s.testimonials || []
  const settings = s.settings || {}
  const accent = settings.primaryColor || '#CC2200'
  const navy   = settings.secondaryColor || '#1B2B4B'

  const { listings: featured, loading } = useMLSListings({ limit: 6 })
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  return (
    <div style={{ fontFamily: settings.fontFamily || 'Inter, system-ui, sans-serif', background: '#F8FAFC', minHeight: '100vh' }}>
      <PublicNav s={s} active="/public/home" />

      {/* HERO */}
      <div style={{
        background: hero.bgImage ? `url(${hero.bgImage}) center/cover no-repeat` : `linear-gradient(135deg, ${navy} 0%, ${accent} 100%)`,
        padding: '80px 20px 60px', textAlign: 'center', position: 'relative', overflow: 'hidden',
      }}>
        {/* Overlay if bg image */}
        {hero.bgImage && <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,26,46,.72)' }} />}
        <div style={{ position: 'relative', maxWidth: 700, margin: '0 auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 14 }}>
            Rockland County Real Estate
          </div>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 900, color: '#fff', lineHeight: 1.15, marginBottom: 18, margin: '0 0 18px' }}>
            {hero.headline || DEFAULT_CONTENT.hero.headline}
          </h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,.75)', lineHeight: 1.7, marginBottom: 36, maxWidth: 560, margin: '0 auto 36px' }}>
            {hero.subheadline || DEFAULT_CONTENT.hero.subheadline}
          </p>

          {/* Search bar */}
          {hero.showSearch !== false && (
            <div style={{ background: '#fff', borderRadius: 14, padding: '12px 16px', display: 'flex', gap: 10, maxWidth: 560, margin: '0 auto 24px', boxShadow: '0 4px 20px rgba(0,0,0,.2)' }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && navigate(`/public/listings?q=${encodeURIComponent(search)}`)}
                placeholder="City, address, or MLS#..."
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, fontFamily: 'inherit', background: 'transparent', color: '#1E293B' }}
              />
              <button
                onClick={() => navigate(`/public/listings?q=${encodeURIComponent(search)}`)}
                style={{ padding: '10px 22px', borderRadius: 9, border: 'none', background: accent, color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                🔍 Search
              </button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/public/listings" style={{ padding: '12px 28px', borderRadius: 10, background: accent, color: '#fff', fontSize: 14, fontWeight: 800, textDecoration: 'none' }}>
              {hero.ctaText || 'Browse All Listings'}
            </Link>
            <Link to="/public/contact" style={{ padding: '12px 28px', borderRadius: 10, background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none', backdropFilter: 'blur(4px)' }}>
              Contact Us
            </Link>
          </div>
        </div>
      </div>

      {/* STATS */}
      <div style={{ background: '#fff', padding: '28px 20px', boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 0 }}>
          {(about.stats || DEFAULT_CONTENT.about.stats).map((stat, i) => (
            <div key={i} style={{ textAlign: 'center', padding: '12px 16px', borderRight: i < 3 ? '1px solid #E2E8F0' : 'none' }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: accent }}>{stat.number}</div>
              <div style={{ fontSize: 12, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 3 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* FEATURED LISTINGS */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '52px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>Currently Available</div>
          <h2 style={{ fontSize: 32, fontWeight: 900, color: '#1E293B', margin: 0 }}>Featured Listings</h2>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>Loading listings...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
            {(featured.length > 0 ? featured : DEMO_LISTINGS.slice(0,6)).map((l, i) => (
              <ListingCard key={l.mlsId || i} listing={l} accent={accent} />
            ))}
          </div>
        )}
        <div style={{ textAlign: 'center', marginTop: 36 }}>
          <Link to="/public/listings" style={{ padding: '13px 32px', borderRadius: 10, background: accent, color: '#fff', fontSize: 15, fontWeight: 800, textDecoration: 'none' }}>
            View All Listings →
          </Link>
        </div>
      </div>

      {/* ABOUT SECTION */}
      <div style={{ background: '#fff', padding: '60px 20px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: about.image ? '1fr 1fr' : '1fr', gap: 48, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 10 }}>Who We Are</div>
            <h2 style={{ fontSize: 32, fontWeight: 900, color: '#1E293B', marginBottom: 20, lineHeight: 1.2 }}>
              {about.title || DEFAULT_CONTENT.about.title}
            </h2>
            {(about.body || DEFAULT_CONTENT.about.body).split('\n\n').map((para, i) => (
              <p key={i} style={{ fontSize: 15, color: '#475569', lineHeight: 1.8, marginBottom: 16 }}>{para}</p>
            ))}
            <Link to="/public/contact" style={{ display: 'inline-block', marginTop: 8, padding: '12px 28px', borderRadius: 10, background: navy, color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
              Work With Us →
            </Link>
          </div>
          {about.image && (
            <div>
              <img src={about.image} alt="Target Team" style={{ width: '100%', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,.12)' }} />
            </div>
          )}
        </div>
      </div>

      {/* TESTIMONIALS */}
      {testimonials.length > 0 && (
        <div style={{ background: `linear-gradient(135deg, ${navy}, ${navy}EE)`, padding: '60px 20px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>What Our Clients Say</div>
              <h2 style={{ fontSize: 32, fontWeight: 900, color: '#fff', margin: 0 }}>Client Reviews</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
              {testimonials.map((t, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,.08)', borderRadius: 14, padding: '24px', border: '1px solid rgba(255,255,255,.1)', backdropFilter: 'blur(4px)' }}>
                  <div style={{ fontSize: 20, color: accent, marginBottom: 10 }}>{'★'.repeat(t.stars || 5)}</div>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,.8)', lineHeight: 1.7, marginBottom: 14 }}>"{t.text}"</p>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>— {t.name}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CTA BAND */}
      <div style={{ background: accent, padding: '44px 20px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: '#fff', marginBottom: 8 }}>Ready to Find Your Dream Home?</h2>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,.8)', marginBottom: 24 }}>Contact us today for a free consultation.</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href={`tel:${(settings.phone||'').replace(/\D/g,'')}`}
            style={{ padding: '12px 28px', borderRadius: 10, background: '#fff', color: accent, fontSize: 14, fontWeight: 800, textDecoration: 'none' }}>
            📞 Call Now
          </a>
          <Link to="/public/contact"
            style={{ padding: '12px 28px', borderRadius: 10, background: 'rgba(255,255,255,.2)', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
            Send a Message
          </Link>
        </div>
      </div>

      <PublicFooter s={s} />
    </div>
  )
}

// ── LISTINGS PAGE ─────────────────────────────────────────────────
export function PublicListings() {
  const s = useWebContent()
  const settings = s.settings || {}
  const accent   = settings.primaryColor || '#CC2200'
  const navy     = settings.secondaryColor || '#1B2B4B'

  const navigate = useNavigate()
  const urlParams = new URLSearchParams(window.location.search)

  const [query,    setQuery]    = useState(urlParams.get('q') || '')
  const [city,     setCity]     = useState('')
  const [minBeds,  setMinBeds]  = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [propType, setPropType] = useState('')
  const [status,   setStatus]   = useState('Active')
  const [page,     setPage]     = useState(0)

  const { listings, loading, total } = useMLSListings({ query, city, minBeds, minPrice, maxPrice, type: propType, status, limit: 12 })

  const CITIES = ['Monsey','Spring Valley','New City','Nanuet','Suffern','Airmont','Pomona','Wesley Hills','Chestnut Ridge','Garnerville']

  const inp = { padding: '9px 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 13, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', color: '#1E293B' }

  return (
    <div style={{ fontFamily: settings.fontFamily || 'Inter, system-ui, sans-serif', background: '#F8FAFC', minHeight: '100vh' }}>
      <PublicNav s={s} active="/public/listings" />

      {/* Page header */}
      <div style={{ background: navy, padding: '36px 20px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <h1 style={{ fontSize: 32, fontWeight: 900, color: '#fff', marginBottom: 6 }}>
            {status === 'Active' ? '🏡 Available Listings' : '🏆 Sold Properties'}
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,.55)', marginBottom: 0 }}>
            {total > 0 ? `${total.toLocaleString()} ${status.toLowerCase()} properties` : 'Search the OneKey MLS'}
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>
        {/* Status toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {[['Active','🟢 For Sale'],['Closed','🏆 Sold']].map(([v,l]) => (
            <button key={v} onClick={() => setStatus(v)}
              style={{ padding: '8px 18px', borderRadius: 20, border: '1px solid ' + (status===v?accent:'#E2E8F0'), background: status===v?accent:'#fff', color: status===v?'#fff':'#64748B', fontSize: 13, fontWeight: status===v?700:400, cursor: 'pointer', fontFamily: 'inherit' }}>
              {l}
            </button>
          ))}
        </div>

        {/* Search filters */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', padding: '16px', marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr repeat(auto-fill, minmax(130px, 1fr)) auto', gap: 10, alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Search</div>
              <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && setPage(0)} placeholder="Address, city, MLS#..." style={inp} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>City</div>
              <select value={city} onChange={e => setCity(e.target.value)} style={inp}>
                <option value="">All areas</option>
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Min Beds</div>
              <select value={minBeds} onChange={e => setMinBeds(e.target.value)} style={inp}>
                <option value="">Any</option>
                {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}+</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Min Price</div>
              <input value={minPrice} onChange={e => setMinPrice(e.target.value)} placeholder="$300k" style={inp} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Max Price</div>
              <input value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="$2M" style={inp} />
            </div>
            <button onClick={() => setPage(0)}
              style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'end', whiteSpace: 'nowrap' }}>
              🔍 Search
            </button>
          </div>
        </div>

        {/* Results */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94A3B8' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            Loading listings from OneKey MLS...
          </div>
        ) : listings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94A3B8' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🏡</div>
            No listings found. Try adjusting your filters.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 14, color: '#64748B' }}>
                <strong style={{ color: '#1E293B' }}>{total > 0 ? total.toLocaleString() : listings.length}</strong> listings found
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
              {listings.map((l, i) => <ListingCard key={l.mlsId || i} listing={l} accent={accent} />)}
            </div>
          </>
        )}
      </div>

      <PublicFooter s={s} />
    </div>
  )
}

// ── LISTING DETAIL ────────────────────────────────────────────────
export function PublicListingDetail() {
  const { id } = useParams()
  const s = useWebContent()
  const settings = s.settings || {}
  const accent = settings.primaryColor || '#CC2200'
  const navy   = settings.secondaryColor || '#1B2B4B'

  const [listing,  setListing]  = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [photoIdx, setPhotoIdx] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [form,     setForm]     = useState({ name: '', email: '', phone: '', message: '' })
  const [sent,     setSent]     = useState(false)

  useEffect(() => {
    if (!id) return
    fetch(`https://api.simplyrets.com/properties/${id}`, {
      headers: { 'Authorization': 'Basic ' + btoa(MLS_USER + ':' + MLS_PASS) }
    }).then(r => r.json())
      .then(data => setListing(data))
      .catch(() => setListing(DEMO_LISTINGS.find(l => l.mlsId === id) || DEMO_LISTINGS[0]))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', minHeight: '100vh', background: '#F8FAFC' }}>
      <PublicNav s={s} />
      <div style={{ textAlign: 'center', padding: 80, color: '#94A3B8' }}>Loading property details...</div>
    </div>
  )

  if (!listing) return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', minHeight: '100vh', background: '#F8FAFC' }}>
      <PublicNav s={s} />
      <div style={{ textAlign: 'center', padding: 80, color: '#94A3B8' }}>Property not found.</div>
    </div>
  )

  const addr   = listing.address || {}
  const street = [addr.streetNumber, addr.streetName, addr.unit ? '#'+addr.unit : null].filter(Boolean).join(' ')
  const photos = listing.photos || []
  const prop   = listing.property || {}
  const agent  = listing.agent || {}

  const details = [
    ['Bedrooms',     prop.bedrooms],
    ['Bathrooms',    prop.bathsFull],
    ['Half Baths',   prop.bathsHalf],
    ['Sq Footage',   prop.area ? Number(prop.area).toLocaleString() + ' sqft' : null],
    ['Lot Size',     prop.lotSize ? Number(prop.lotSize).toLocaleString() + ' sqft' : null],
    ['Year Built',   prop.yearBuilt],
    ['Garage',       prop.garageSpaces ? prop.garageSpaces + ' car' : null],
    ['Basement',     prop.basement],
    ['Pool',         prop.pool ? 'Yes' : null],
    ['Property Type',prop.type],
    ['County',       addr.county],
    ['School Dist.', listing.school?.district],
    ['MLS#',         listing.mlsId],
    ['List Date',    listing.listDate ? new Date(listing.listDate).toLocaleDateString('en-US') : null],
  ].filter(([,v]) => v)

  async function submitInquiry() {
    setSent(true)
    // Save to Supabase contacts
    await supabase.from('contacts').insert({
      first_name: form.name.split(' ')[0] || '',
      last_name:  form.name.split(' ').slice(1).join(' ') || '',
      email:      form.email,
      phone:      form.phone,
      source:     'Website Inquiry',
      status:     'New',
      notes:      `Inquiry about ${street}: ${form.message}`,
      created_at: new Date().toISOString(),
    }).catch(() => {})
  }

  return (
    <div style={{ fontFamily: settings.fontFamily || 'Inter, system-ui, sans-serif', background: '#F8FAFC', minHeight: '100vh' }}>
      <PublicNav s={s} />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
        {/* Breadcrumb */}
        <div style={{ fontSize: 13, color: '#94A3B8', marginBottom: 16 }}>
          <Link to="/public/listings" style={{ color: accent, textDecoration: 'none' }}>← Back to Listings</Link>
        </div>

        {/* Photo gallery */}
        <div style={{ display: 'grid', gridTemplateColumns: photos.length > 1 ? '2fr 1fr' : '1fr', gap: 8, borderRadius: 14, overflow: 'hidden', marginBottom: 24, height: 420 }}>
          <div style={{ background: '#E2E8F0', overflow: 'hidden' }}>
            {photos[photoIdx]
              ? <img src={photos[photoIdx]} alt={street} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 60, color: '#CBD5E1' }}>🏡</div>
            }
          </div>
          {photos.length > 1 && (
            <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 8 }}>
              {photos.slice(1, 3).map((ph, i) => (
                <div key={i} style={{ background: '#E2E8F0', overflow: 'hidden', cursor: 'pointer' }} onClick={() => setPhotoIdx(i+1)}>
                  <img src={ph} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
            </div>
          )}
        </div>
        {photos.length > 3 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 24, overflowX: 'auto' }}>
            {photos.map((ph, i) => (
              <img key={i} src={ph} alt="" onClick={() => setPhotoIdx(i)}
                style={{ width: 72, height: 54, objectFit: 'cover', borderRadius: 6, cursor: 'pointer', border: photoIdx===i?`2px solid ${accent}`:'2px solid transparent', flexShrink: 0 }} />
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 28, alignItems: 'start' }}>
          {/* LEFT */}
          <div>
            <div style={{ fontSize: 36, fontWeight: 900, color: accent, marginBottom: 4 }}>{fmt$(listing.listPrice)}</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1E293B', marginBottom: 6 }}>{street}</h1>
            <div style={{ fontSize: 15, color: '#64748B', marginBottom: 16 }}>{addr.city}, {addr.state} {addr.postalCode}</div>

            {/* Quick stats */}
            <div style={{ display: 'flex', gap: 20, padding: '16px 0', borderTop: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0', marginBottom: 24 }}>
              {[
                [prop.bedrooms, 'Beds', '🛏'],
                [prop.bathsFull, 'Baths', '🚿'],
                [prop.area ? Number(prop.area).toLocaleString() : null, 'Sq Ft', '📐'],
                [prop.garageSpaces, 'Garage', '🚗'],
              ].filter(([v]) => v).map(([v,l,icon]) => (
                <div key={l} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22 }}>{icon}</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#1E293B' }}>{v}</div>
                  <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.06em' }}>{l}</div>
                </div>
              ))}
            </div>

            {/* Description */}
            {listing.remarks && (
              <div style={{ marginBottom: 28 }}>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: '#1E293B', marginBottom: 10 }}>About this property</h3>
                <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.8, whiteSpace: 'pre-line' }}>{listing.remarks}</p>
              </div>
            )}

            {/* Property details grid */}
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: '#1E293B', marginBottom: 14 }}>Property Details</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: '#E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
                {details.map(([k, v]) => (
                  <div key={k} style={{ padding: '10px 14px', background: '#fff', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, color: '#94A3B8' }}>{k}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Map */}
            {listing.geo?.lat && (
              <div style={{ marginTop: 28 }}>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: '#1E293B', marginBottom: 12 }}>Location</h3>
                <div style={{ borderRadius: 12, overflow: 'hidden', height: 300 }}>
                  <iframe
                    title="map"
                    src={`https://www.google.com/maps/embed/v1/place?key=${GKEY}&q=${listing.geo.lat},${listing.geo.lng}&zoom=15`}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Contact card */}
          <div style={{ position: 'sticky', top: 80 }}>
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', padding: 20, boxShadow: '0 4px 20px rgba(0,0,0,.08)', marginBottom: 16 }}>
              <div style={{ textAlign: 'center', padding: '16px 0', borderBottom: '1px solid #E2E8F0', marginBottom: 16 }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: accent }}>{fmt$(listing.listPrice)}</div>
                <div style={{ fontSize: 13, color: '#94A3B8' }}>MLS# {listing.mlsId}</div>
              </div>

              {!sent ? (
                <>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#1E293B', marginBottom: 14 }}>Schedule a Showing</div>
                  {[
                    ['name', 'Full Name', 'text'],
                    ['email', 'Email Address', 'email'],
                    ['phone', 'Phone Number', 'tel'],
                  ].map(([k, pl, type]) => (
                    <input key={k} value={form[k]} onChange={e => setForm(f => ({...f, [k]: e.target.value}))}
                      placeholder={pl} type={type}
                      style={{ display: 'block', width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, fontFamily: 'inherit', marginBottom: 8, boxSizing: 'border-box', color: '#1E293B', outline: 'none' }} />
                  ))}
                  <textarea value={form.message} onChange={e => setForm(f => ({...f, message: e.target.value}))}
                    placeholder={`I'm interested in ${street}...`} rows={3}
                    style={{ display: 'block', width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, fontFamily: 'inherit', resize: 'none', marginBottom: 12, boxSizing: 'border-box', color: '#1E293B', outline: 'none' }} />
                  <button onClick={submitInquiry}
                    style={{ width: '100%', padding: 13, borderRadius: 9, border: 'none', background: accent, color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Send Message
                  </button>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1E293B', marginBottom: 6 }}>Message Sent!</div>
                  <div style={{ fontSize: 13, color: '#64748B' }}>We'll be in touch shortly.</div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                <a href={`tel:${(settings.phone||'').replace(/\D/g,'')}`}
                  style={{ padding: '10px', borderRadius: 8, border: `1px solid ${accent}`, color: accent, fontSize: 13, fontWeight: 700, textDecoration: 'none', textAlign: 'center' }}>
                  📞 Call
                </a>
                <a href={`https://wa.me/${(settings.phone||'').replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer"
                  style={{ padding: '10px', borderRadius: 8, border: '1px solid #25D366', color: '#25D366', fontSize: 13, fontWeight: 700, textDecoration: 'none', textAlign: 'center' }}>
                  💬 WhatsApp
                </a>
              </div>
            </div>

            {/* Agent info */}
            {(agent.firstName || settings.logoText) && (
              <div style={{ background: navy, borderRadius: 14, padding: 16, textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: accent, margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 900, color: '#fff' }}>TT</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{agent.firstName ? `${agent.firstName} ${agent.lastName}` : 'Target Team'}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', marginTop: 3 }}>KW Valley Realty</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <PublicFooter s={s} />
    </div>
  )
}

// ── ABOUT PAGE ────────────────────────────────────────────────────
export function PublicAbout() {
  const s = useWebContent()
  const settings = s.settings || {}
  const about    = s.about || {}
  const accent   = settings.primaryColor   || '#CC2200'
  const navy     = settings.secondaryColor || '#1B2B4B'

  const [agents, setAgents] = useState([])
  useEffect(() => {
    supabase.from('agents').select('*').eq('active', true).order('name').then(r => setAgents(r.data || []))
  }, [])

  return (
    <div style={{ fontFamily: settings.fontFamily || 'Inter, system-ui, sans-serif', background: '#F8FAFC', minHeight: '100vh' }}>
      <PublicNav s={s} active="/public/about" />

      <div style={{ background: navy, padding: '48px 20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 40, fontWeight: 900, color: '#fff', marginBottom: 12 }}>About Target Team</h1>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,.6)', maxWidth: 600, margin: '0 auto' }}>
          {settings.tagline || 'Of Keller Williams Valley Realty'}
        </p>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '52px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: about.image ? '1fr 1fr' : '1fr', gap: 48, alignItems: 'center', marginBottom: 52 }}>
          <div>
            {(about.body || DEFAULT_CONTENT.about.body).split('\n\n').map((para, i) => (
              <p key={i} style={{ fontSize: 16, color: '#475569', lineHeight: 1.8, marginBottom: 20 }}>{para}</p>
            ))}
          </div>
          {about.image && <img src={about.image} alt="Team" style={{ width: '100%', borderRadius: 14 }} />}
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 52 }}>
          {(about.stats || DEFAULT_CONTENT.about.stats).map((stat, i) => (
            <div key={i} style={{ textAlign: 'center', padding: 24, background: '#fff', borderRadius: 14, boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
              <div style={{ fontSize: 36, fontWeight: 900, color: accent }}>{stat.number}</div>
              <div style={{ fontSize: 13, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 6 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Team members */}
        {agents.length > 0 && (
          <div>
            <h2 style={{ fontSize: 28, fontWeight: 900, color: '#1E293B', marginBottom: 24, textAlign: 'center' }}>Meet the Team</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
              {agents.map(ag => (
                <div key={ag.id} style={{ background: '#fff', borderRadius: 14, padding: 20, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
                  <div style={{ width: 72, height: 72, borderRadius: '50%', background: ag.color || accent, margin: '0 auto 12px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {ag.photo_url
                      ? <img src={ag.photo_url} alt={ag.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 26, fontWeight: 900, color: '#fff' }}>{(ag.name||'').split(' ').map(n=>n[0]).join('').slice(0,2)}</span>
                    }
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#1E293B' }}>{ag.name}</div>
                  <div style={{ fontSize: 12, color: '#94A3B8', textTransform: 'capitalize', marginTop: 3 }}>{ag.role}</div>
                  {ag.phone && <div style={{ fontSize: 12, color: accent, marginTop: 6 }}>{ag.phone}</div>}
                  {ag.languages && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 3 }}>🌐 {ag.languages}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <PublicFooter s={s} />
    </div>
  )
}

// ── CONTACT PAGE ──────────────────────────────────────────────────
export function PublicContact() {
  const s = useWebContent()
  const settings = s.settings || {}
  const contact  = s.contact  || {}
  const accent   = settings.primaryColor   || '#CC2200'
  const navy     = settings.secondaryColor || '#1B2B4B'

  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '', type: 'Buying' })
  const [sent, setSent] = useState(false)

  async function submit() {
    await supabase.from('contacts').insert({
      first_name: form.name.split(' ')[0] || '',
      last_name:  form.name.split(' ').slice(1).join(' ') || '',
      email:      form.email,
      phone:      form.phone,
      source:     'Website Contact Form',
      status:     'New',
      notes:      `Looking to: ${form.type}\n\n${form.message}`,
      created_at: new Date().toISOString(),
    }).catch(() => {})
    setSent(true)
  }

  const inp = { display: 'block', width: '100%', padding: '11px 14px', borderRadius: 9, border: '1px solid #E2E8F0', fontSize: 14, fontFamily: 'inherit', marginBottom: 12, boxSizing: 'border-box', color: '#1E293B', outline: 'none' }

  return (
    <div style={{ fontFamily: settings.fontFamily || 'Inter, system-ui, sans-serif', background: '#F8FAFC', minHeight: '100vh' }}>
      <PublicNav s={s} active="/public/contact" />

      <div style={{ background: navy, padding: '48px 20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 40, fontWeight: 900, color: '#fff', marginBottom: 12 }}>{contact.title || 'Get In Touch'}</h1>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,.6)', maxWidth: 500, margin: '0 auto' }}>
          {contact.subtitle || DEFAULT_CONTENT.contact.subtitle}
        </p>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '52px 20px', display: 'grid', gridTemplateColumns: '1fr 400px', gap: 40, alignItems: 'start' }}>
        {/* Info */}
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#1E293B', marginBottom: 24 }}>Contact Information</h2>
          {[
            ['📞', 'Phone', settings.phone, `tel:${(settings.phone||'').replace(/\D/g,'')}`],
            ['📧', 'Email', settings.email, `mailto:${settings.email}`],
            ['📍', 'Location', settings.address, null],
          ].filter(([,,v]) => v).map(([icon, label, value, href]) => (
            <div key={label} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 20 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: accent + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{icon}</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>{label}</div>
                {href
                  ? <a href={href} style={{ fontSize: 15, fontWeight: 600, color: '#1E293B', textDecoration: 'none' }}>{value}</a>
                  : <div style={{ fontSize: 15, fontWeight: 600, color: '#1E293B' }}>{value}</div>
                }
              </div>
            </div>
          ))}

          {/* Social */}
          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            {settings.facebook && (
              <a href={`https://facebook.com/${settings.facebook}`} target="_blank" rel="noopener noreferrer"
                style={{ padding: '10px 18px', borderRadius: 9, background: '#1877F2', color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                📘 Facebook
              </a>
            )}
            {settings.instagram && (
              <a href={`https://instagram.com/${settings.instagram}`} target="_blank" rel="noopener noreferrer"
                style={{ padding: '10px 18px', borderRadius: 9, background: 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)', color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                📸 Instagram
              </a>
            )}
          </div>
        </div>

        {/* Form */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 28, boxShadow: '0 4px 20px rgba(0,0,0,.08)' }}>
          {!sent ? (
            <>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#1E293B', marginBottom: 20 }}>Send us a message</h3>
              <input value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} placeholder="Your full name" style={inp} />
              <input value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))} placeholder="Email address" type="email" style={inp} />
              <input value={form.phone} onChange={e => setForm(f=>({...f,phone:e.target.value}))} placeholder="Phone number" type="tel" style={inp} />
              <select value={form.type} onChange={e => setForm(f=>({...f,type:e.target.value}))} style={inp}>
                <option>Buying</option>
                <option>Selling</option>
                <option>Both</option>
                <option>General Inquiry</option>
              </select>
              <textarea value={form.message} onChange={e => setForm(f=>({...f,message:e.target.value}))} placeholder="How can we help you?" rows={4}
                style={{ ...inp, resize: 'vertical' }} />
              <button onClick={submit}
                style={{ width: '100%', padding: 14, borderRadius: 10, border: 'none', background: accent, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                Send Message →
              </button>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: 44, marginBottom: 14 }}>✅</div>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: '#1E293B', marginBottom: 8 }}>Message Received!</h3>
              <p style={{ fontSize: 14, color: '#64748B', lineHeight: 1.7 }}>Thank you for reaching out. A member of our team will be in touch with you shortly.</p>
              <button onClick={() => setSent(false)} style={{ marginTop: 20, padding: '10px 24px', borderRadius: 9, border: '1px solid #E2E8F0', background: 'transparent', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: '#64748B' }}>Send another message</button>
            </div>
          )}
        </div>
      </div>

      <PublicFooter s={s} />
    </div>
  )
}

// ── DEMO LISTINGS (fallback when no SimplyRETS credentials) ───────
const DEMO_LISTINGS = [
  { mlsId:'800001', listPrice:749000, listDate:'2026-06-01T00:00:00Z', remarks:'Beautiful single family home in desirable Monsey location. Renovated kitchen, 2-car garage.', photos:[], mls:{status:'Active'}, address:{streetNumber:'15',streetName:'Oak Lane',city:'Monsey',state:'NY',postalCode:'10952',county:'Rockland'}, property:{bedrooms:4,bathsFull:2,area:2100,type:'Single Family',yearBuilt:1985,garageSpaces:2}, agent:{firstName:'Mendy',lastName:'Jankovits'}, geo:{lat:41.12,lng:-74.07} },
  { mlsId:'800002', listPrice:1299000, listDate:'2026-05-15T00:00:00Z', remarks:'Stunning new construction condo. 8 beds, 6.5 baths.', photos:[], mls:{status:'Active'}, address:{streetNumber:'40',streetName:'Singer Ave',unit:'205',city:'Spring Valley',state:'NY',postalCode:'10977'}, property:{bedrooms:8,bathsFull:6,area:4200,type:'Condominium',yearBuilt:2026}, agent:{firstName:'Eli',lastName:'Hoffman'} },
  { mlsId:'800003', listPrice:549000, listDate:'2026-06-10T00:00:00Z', remarks:'Charming cape cod on quiet street.', photos:[], mls:{status:'Active'}, address:{streetNumber:'84',streetName:'Tennyson Dr',city:'Nanuet',state:'NY',postalCode:'10954'}, property:{bedrooms:3,bathsFull:2,area:1650,type:'Single Family',yearBuilt:1965}, agent:{firstName:'Avraham',lastName:'Weinberger'} },
  { mlsId:'800004', listPrice:899000, listDate:'2026-06-05T00:00:00Z', remarks:'Gorgeous colonial in prime New City location.', photos:[], mls:{status:'Active'}, address:{streetNumber:'22',streetName:'Birchwood Ct',city:'New City',state:'NY',postalCode:'10956'}, property:{bedrooms:5,bathsFull:3,area:3200,type:'Single Family',yearBuilt:1992,garageSpaces:2}, agent:{firstName:'Joel',lastName:'Rottenstein'} },
  { mlsId:'800005', listPrice:425000, listDate:'2026-06-12T00:00:00Z', remarks:'Move-in ready ranch. Fully updated.', photos:[], mls:{status:'Active'}, address:{streetNumber:'47',streetName:'Prairie Ave',city:'Suffern',state:'NY',postalCode:'10901'}, property:{bedrooms:3,bathsFull:1,area:1200,type:'Single Family',yearBuilt:1958}, agent:{firstName:'Avraham',lastName:'Weinberger'} },
  { mlsId:'800006', listPrice:1599000, listDate:'2026-04-20T00:00:00Z', remarks:'Luxurious new construction condo.', photos:[], mls:{status:'Active'}, address:{streetNumber:'5',streetName:'Mirror Lake Rd',unit:'201',city:'Spring Valley',state:'NY',postalCode:'10977'}, property:{bedrooms:9,bathsFull:7,area:4777,type:'Condominium',yearBuilt:2026}, agent:{firstName:'Joel',lastName:'Rottenstein'} },
]
