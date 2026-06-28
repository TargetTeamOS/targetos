// TargetOS V2 — Social Media Card Generator
// Tabs: Design (in-app card builder) | Canva | Adobe Express
// No external dependencies beyond what's already in the app

import React, { useState, useRef, useEffect } from 'react'
import { useListings } from '../lib/hooks'
import { Tabs, Btn, PageHeader } from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const CARD_TYPES = [
  { id: 'coming',   label: 'Coming Soon',      color: '#1B2B4B' },
  { id: 'active',   label: 'Just Listed',       color: '#10B981' },
  { id: 'contract', label: 'Under Contract',    color: '#8B5CF6' },
  { id: 'sold',     label: 'Sold',              color: '#CC2200' },
  { id: 'price_drop',label: 'Price Reduced',   color: '#F5A623' },
  { id: 'open_house',label: 'Open House',       color: '#0EA5E9' },
]

const TEMPLATES = [
  { id: 'bold',    label: 'Bold',    desc: 'Dark header, clean layout' },
  { id: 'minimal', label: 'Minimal', desc: 'White background, elegant' },
  { id: 'branded', label: 'Branded', desc: 'Full Target Team branding' },
]

function fmt$(n) { return '$' + Number(n || 0).toLocaleString() }

// ── CARD PREVIEW ─────────────────────────────────────────────
function CardPreview({ cardType, template, listing, ohDate, ohTime, agent }) {
  const ct = CARD_TYPES.find(t => t.id === cardType) || CARD_TYPES[0]
  const addr = listing ? listing.addr : '123 Main St, Spring Valley NY 10977'
  const price = listing ? fmt$(listing.list_price) : '$750,000'
  const beds  = listing ? listing.beds  : '4'
  const baths = listing ? listing.baths : '2'
  const sqft  = listing ? listing.sqft  : '2,000'
  const agentName = agent || 'Target Team'

  if (template === 'minimal') {
    return (
      <div style={{ width: 420, height: 420, background: '#fff', borderRadius: 16,
        boxShadow: '0 8px 40px rgba(0,0,0,.12)', overflow: 'hidden', position: 'relative',
        fontFamily: ff, flexShrink: 0 }}>
        <div style={{ background: ct.color, padding: '18px 24px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,.7)',
            textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 4 }}>
            Target Team · KW Valley Realty
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1.2 }}>
            {ct.label}
          </div>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#1E293B', marginBottom: 6, lineHeight: 1.3 }}>
            {addr}
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: ct.color, marginBottom: 14 }}>
            {price}
          </div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            {beds  && <div style={{ fontSize: 13, color: '#64748B' }}><strong style={{ color:'#1E293B' }}>{beds}</strong> bd</div>}
            {baths && <div style={{ fontSize: 13, color: '#64748B' }}><strong style={{ color:'#1E293B' }}>{baths}</strong> ba</div>}
            {sqft  && <div style={{ fontSize: 13, color: '#64748B' }}><strong style={{ color:'#1E293B' }}>{sqft}</strong> sf</div>}
          </div>
          {cardType === 'open_house' && ohDate && (
            <div style={{ background: ct.color + '18', border: '1px solid ' + ct.color + '44',
              borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13,
              fontWeight: 700, color: ct.color }}>
              Open House: {ohDate}{ohTime ? ' at ' + ohTime : ''}
            </div>
          )}
          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 12, fontSize: 12,
            color: '#94A3B8', display: 'flex', justifyContent: 'space-between' }}>
            <span>{agentName}</span>
            <span>845.424.1014 · @thetargetteam</span>
          </div>
        </div>
      </div>
    )
  }

  if (template === 'branded') {
    return (
      <div style={{ width: 420, height: 420, background: '#1B2B4B', borderRadius: 16,
        boxShadow: '0 8px 40px rgba(0,0,0,.25)', overflow: 'hidden', position: 'relative',
        fontFamily: ff, flexShrink: 0 }}>
        <div style={{ background: ct.color, padding: '16px 24px' }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>{ct.label}</div>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 4, lineHeight: 1.3 }}>
            {addr}
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: ct.color, marginBottom: 12 }}>
            {price}
          </div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            {beds  && <div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)' }}><strong style={{color:'#fff'}}>{beds}</strong> bd</div>}
            {baths && <div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)' }}><strong style={{color:'#fff'}}>{baths}</strong> ba</div>}
            {sqft  && <div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)' }}><strong style={{color:'#fff'}}>{sqft}</strong> sf</div>}
          </div>
          {cardType === 'open_house' && ohDate && (
            <div style={{ background: ct.color, borderRadius: 8, padding: '8px 12px',
              marginBottom: 12, fontSize: 13, fontWeight: 700, color: '#fff' }}>
              Open House: {ohDate}{ohTime ? ' at ' + ohTime : ''}
            </div>
          )}
          <div style={{ position: 'absolute', bottom: 20, left: 24, right: 24 }}>
            <div style={{ borderTop: '1px solid rgba(255,255,255,.15)', paddingTop: 12,
              fontSize: 11, color: 'rgba(255,255,255,.5)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>Target Team</div>
                <div>KW Valley Realty · {agentName}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div>845.424.1014</div>
                <div>@thetargetteam</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Bold template (default)
  return (
    <div style={{ width: 420, height: 420, background: '#fff', borderRadius: 16,
      boxShadow: '0 8px 40px rgba(0,0,0,.12)', overflow: 'hidden',
      fontFamily: ff, flexShrink: 0 }}>
      <div style={{ background: ct.color, padding: '28px 28px 22px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.6)',
          textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>
          Target Team · KW Valley Realty
        </div>
        <div style={{ fontSize: 32, fontWeight: 900, color: '#fff', lineHeight: 1.1, marginBottom: 4 }}>
          {ct.label}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.8)' }}>
          {addr}
        </div>
      </div>
      <div style={{ padding: '22px 28px' }}>
        <div style={{ fontSize: 36, fontWeight: 900, color: ct.color, marginBottom: 12 }}>
          {price}
        </div>
        <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
          {beds  && <div style={{ fontSize: 14, color: '#64748B' }}><strong style={{color:'#1E293B',fontSize:18}}>{beds}</strong> bd</div>}
          {baths && <div style={{ fontSize: 14, color: '#64748B' }}><strong style={{color:'#1E293B',fontSize:18}}>{baths}</strong> ba</div>}
          {sqft  && <div style={{ fontSize: 14, color: '#64748B' }}><strong style={{color:'#1E293B',fontSize:18}}>{sqft}</strong> sqft</div>}
        </div>
        {cardType === 'open_house' && ohDate && (
          <div style={{ background: ct.color + '15', border: '2px solid ' + ct.color + '44',
            borderRadius: 10, padding: '10px 14px', marginBottom: 12,
            fontSize: 14, fontWeight: 800, color: ct.color }}>
            Open House: {ohDate}{ohTime ? ' at ' + ohTime : ''}
          </div>
        )}
        <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 12,
          fontSize: 11, color: '#94A3B8', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700 }}>{agentName}</span>
          <span>845.424.1014 · @thetargetteam</span>
        </div>
      </div>
    </div>
  )
}

// ── DESIGN TAB ────────────────────────────────────────────────
function DesignTab({ listings, agents }) {
  const [cardType,  setCardType]  = useState('coming')
  const [template,  setTemplate]  = useState('bold')
  const [listingId, setListingId] = useState('')
  const [agentName, setAgentName] = useState('')
  const [ohDate,    setOhDate]    = useState('')
  const [ohTime,    setOhTime]    = useState('')
  const { toast } = React.useContext(React.createContext({}))

  const listing = listings.find(l => l.id === listingId) || null

  function copyToClipboard() {
    const lines = [
      CARD_TYPES.find(t => t.id === cardType)?.label || '',
      listing ? listing.addr : '',
      listing ? fmt$(listing.list_price) : '',
      cardType === 'open_house' && ohDate ? 'Open House: ' + ohDate + (ohTime ? ' at ' + ohTime : '') : '',
      '',
      'Target Team · KW Valley Realty',
      '845.424.1014 · @thetargetteam',
    ].filter(Boolean)
    navigator.clipboard.writeText(lines.join('\n')).catch(() => {})
    alert('Card text copied to clipboard!')
  }

  function openCanvaWithData() {
    const params = new URLSearchParams({
      design_type: 'SocialMedia',
      text: (CARD_TYPES.find(t => t.id === cardType)?.label || '') + ' — ' + (listing ? listing.addr : ''),
    })
    window.open('https://www.canva.com/create/instagram-posts/?' + params.toString(), '_blank')
  }

  function openAdobeWithData() {
    window.open('https://new.express.adobe.com/new?category=instagram', '_blank')
  }

  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 280px', minWidth: 280 }}>
        <div style={{ background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--border)', padding: 18, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Card Type</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {CARD_TYPES.map(ct => (
              <button key={ct.id} onClick={() => setCardType(ct.id)}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1.5px solid ' + (cardType === ct.id ? ct.color : 'var(--border)'),
                  background: cardType === ct.id ? ct.color + '12' : 'transparent',
                  color: cardType === ct.id ? ct.color : 'var(--text)',
                  fontSize: 12, fontWeight: cardType === ct.id ? 800 : 500,
                  cursor: 'pointer', fontFamily: ff, textAlign: 'left' }}>
                {ct.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--border)', padding: 18, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Template</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {TEMPLATES.map(t => (
              <button key={t.id} onClick={() => setTemplate(t.id)}
                style={{ padding: '9px 12px', borderRadius: 8, border: '1.5px solid ' + (template === t.id ? '#CC2200' : 'var(--border)'),
                  background: template === t.id ? 'rgba(204,34,0,.07)' : 'transparent',
                  color: 'var(--text)', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: ff, textAlign: 'left',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: template === t.id ? 800 : 600, color: template === t.id ? '#CC2200' : 'var(--text)' }}>{t.label}</span>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>{t.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--border)', padding: 18, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Listing (optional)</div>
          <select value={listingId} onChange={e => setListingId(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: 13, fontFamily: ff, marginBottom: 8 }}>
            <option value="">Manual / No listing</option>
            {listings.slice(0,30).map(l => (
              <option key={l.id} value={l.id}>{l.addr} — {fmt$(l.list_price)}</option>
            ))}
          </select>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6, marginTop: 10 }}>Agent Name</div>
          <input value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="e.g. Mendy Jankovits"
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: 13, fontFamily: ff, boxSizing: 'border-box' }} />
          {cardType === 'open_house' && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Open House Date &amp; Time</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input type="date" value={ohDate} onChange={e => setOhDate(e.target.value)}
                  style={{ padding: '7px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: 12, fontFamily: ff }} />
                <input type="time" value={ohTime} onChange={e => setOhTime(e.target.value)}
                  style={{ padding: '7px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: 12, fontFamily: ff }} />
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={copyToClipboard}
            style={{ padding: '11px', borderRadius: 9, background: '#CC2200', color: '#fff', border: 'none', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: ff }}>
            Copy Card Text
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button onClick={openCanvaWithData}
              style={{ padding: '10px', borderRadius: 9, background: '#8B3DFF', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>
              Open in Canva
            </button>
            <button onClick={openAdobeWithData}
              style={{ padding: '10px', borderRadius: 9, background: '#FF0000', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>
              Open in Adobe
            </button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.4 }}>
            Copy the card text first, then paste it into Canva or Adobe Express to finish your design
          </div>
        </div>
      </div>

      <div style={{ flex: '1 1 420px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Preview</div>
        <CardPreview
          cardType={cardType}
          template={template}
          listing={listing}
          ohDate={ohDate}
          ohTime={ohTime}
          agent={agentName || 'Target Team'}
        />
        <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
          1080 x 1080 px when exported · Instagram / Facebook ready
        </div>
      </div>
    </div>
  )
}

// ── CANVA TAB ─────────────────────────────────────────────────
function CanvaTab() {
  const CANVA_TEMPLATES = [
    { name: 'Just Listed Post',      url: 'https://www.canva.com/create/instagram-posts/', tag: 'just listed real estate' },
    { name: 'Open House Post',       url: 'https://www.canva.com/create/instagram-posts/', tag: 'open house' },
    { name: 'Sold Post',             url: 'https://www.canva.com/create/instagram-posts/', tag: 'sold real estate' },
    { name: 'Coming Soon Post',      url: 'https://www.canva.com/create/instagram-posts/', tag: 'coming soon real estate' },
    { name: 'Real Estate Story',     url: 'https://www.canva.com/create/instagram-stories/', tag: 'real estate story' },
    { name: 'Facebook Post',         url: 'https://www.canva.com/create/facebook-posts/', tag: 'real estate facebook' },
    { name: 'Flyer',                 url: 'https://www.canva.com/create/flyers/', tag: 'real estate flyer' },
    { name: 'Email Header',          url: 'https://www.canva.com/create/email-headers/', tag: 'real estate email' },
  ]

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #8B3DFF 0%, #6320EE 100%)', borderRadius: 14, padding: '24px 28px', marginBottom: 20, color: '#fff' }}>
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>Canva</div>
        <div style={{ fontSize: 13, opacity: .85, marginBottom: 16, lineHeight: 1.5 }}>
          Create stunning real estate social media posts, flyers, and stories with Canva's free templates. Click any template below to open Canva directly.
        </div>
        <a href="https://www.canva.com/real-estate/" target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-block', background: '#fff', color: '#8B3DFF', padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 800, textDecoration: 'none' }}>
          Browse All Real Estate Templates
        </a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
        {CANVA_TEMPLATES.map(t => (
          <a key={t.name} href={t.url + '?q=' + encodeURIComponent(t.tag)} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
              background: 'var(--panel)', borderRadius: 10, border: '1px solid var(--border)',
              textDecoration: 'none', transition: 'all .15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#8B3DFF'; e.currentTarget.style.background = '#8B3DFF08' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--panel)' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#8B3DFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>C</div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t.name}</span>
          </a>
        ))}
      </div>

      <div style={{ marginTop: 20, padding: '14px 16px', background: 'var(--dim)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
        Tip: Use the Design tab to generate your listing details, copy the card text, then paste it into your Canva design. Canva is free to use — sign up at canva.com if you don't have an account.
      </div>
    </div>
  )
}

// ── ADOBE TAB ─────────────────────────────────────────────────
function AdobeTab() {
  const ADOBE_TEMPLATES = [
    { name: 'Instagram Post',    url: 'https://new.express.adobe.com/new?category=instagram', color: '#FF0000' },
    { name: 'Instagram Story',   url: 'https://new.express.adobe.com/new?category=instagram-story', color: '#FF0000' },
    { name: 'Facebook Post',     url: 'https://new.express.adobe.com/new?category=facebook', color: '#FF0000' },
    { name: 'Real Estate Flyer', url: 'https://new.express.adobe.com/new?category=flyer', color: '#FF0000' },
    { name: 'Open House Flyer',  url: 'https://new.express.adobe.com/new?category=flyer', color: '#FF0000' },
    { name: 'Social Ad',         url: 'https://new.express.adobe.com/new?category=ads', color: '#FF0000' },
  ]

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #FF0000 0%, #CC0000 100%)', borderRadius: 14, padding: '24px 28px', marginBottom: 20, color: '#fff' }}>
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>Adobe Express</div>
        <div style={{ fontSize: 13, opacity: .85, marginBottom: 16, lineHeight: 1.5 }}>
          Create professional real estate marketing materials with Adobe Express. Free templates for social media, flyers, and more.
        </div>
        <a href="https://new.express.adobe.com/" target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-block', background: '#fff', color: '#FF0000', padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 800, textDecoration: 'none' }}>
          Open Adobe Express
        </a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
        {ADOBE_TEMPLATES.map(t => (
          <a key={t.name} href={t.url} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
              background: 'var(--panel)', borderRadius: 10, border: '1px solid var(--border)',
              textDecoration: 'none', transition: 'all .15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#FF0000'; e.currentTarget.style.background = '#FF000008' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--panel)' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FF0000', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14, color: '#fff', fontWeight: 900 }}>Ae</div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t.name}</span>
          </a>
        ))}
      </div>

      <div style={{ marginTop: 20, padding: '14px 16px', background: 'var(--dim)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
        Tip: Use the Design tab first to preview your card and copy the listing text. Then paste it into Adobe Express to finish your design. Adobe Express is free — sign in with your Adobe or Google account.
      </div>
    </div>
  )
}

// ── MAIN PAGE ─────────────────────────────────────────────────
export function SocialCards() {
  const [tab, setTab] = useState('design')
  const { listings } = useListings()
  const safeListings = listings || []

  return (
    <div style={{ fontFamily: ff }}>
      <PageHeader
        title="Social Cards"
        sub="Design listing cards for Instagram, Facebook, and more"
      />
      <Tabs
        tabs={[
          { id: 'design', label: 'Design' },
          { id: 'canva',  label: 'Canva' },
          { id: 'adobe',  label: 'Adobe Express' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'design' && <DesignTab listings={safeListings} />}
      {tab === 'canva'  && <CanvaTab />}
      {tab === 'adobe'  && <AdobeTab />}
    </div>
  )
}
