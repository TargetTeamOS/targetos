// TargetOS V2 — Social Card Generator
// AI generation · upload template · auto-fill from listing · save templates · export HD JPEG / PDF
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useListings } from '../lib/hooks'
import { useApp }      from '../context/AppContext'
import { useAuth }     from '../context/AuthContext'
import { supabase }    from '../lib/supabase'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const CARD_TYPES = [
  { id:'coming',    label:'Coming Soon',    color:'#1B2B4B', emoji:'🔜' },
  { id:'active',    label:'Just Listed',    color:'#10B981', emoji:'✨' },
  { id:'contract',  label:'Under Contract', color:'#8B5CF6', emoji:'📝' },
  { id:'sold',      label:'Just Sold',      color:'#CC2200', emoji:'🏆' },
  { id:'price_drop',label:'Price Reduced',  color:'#F5A623', emoji:'📉' },
  { id:'open_house',label:'Open House',     color:'#0EA5E9', emoji:'🚪' },
]

function fmt$(n) { return n ? '$' + Number(n).toLocaleString() : '' }
function fmtAddr(addr) { return addr || '123 Main St, Spring Valley NY 10977' }

// ── TABS ─────────────────────────────────────────────────────────
const TABS = [
  { id:'builder',   label:'🎨 Card Builder' },
  { id:'ai',        label:'🤖 AI Generator' },
  { id:'templates', label:'📁 My Templates' },
  { id:'canva',     label:'Canva' },
  { id:'adobe',     label:'Adobe Express' },
]

// ── BUILT-IN CARD RENDERER (canvas-ready) ──────────────────────
function CardRenderer({ cardType, listing, ohDate, ohTime, agentName, bgImage, customText, style }) {
  const ct    = CARD_TYPES.find(t => t.id === cardType) || CARD_TYPES[0]
  const addr  = listing ? fmtAddr(listing.addr) : '123 Main St, Spring Valley NY'
  const price = listing ? fmt$(listing.list_price) : '$750,000'
  const beds  = listing ? listing.beds  : '4'
  const baths = listing ? listing.baths : '2'
  const sqft  = listing ? listing.sqft  : '2,000'
  const agent = agentName || 'Target Team'

  return (
    <div style={{ width:500, height:500, position:'relative', overflow:'hidden', borderRadius:16,
      boxShadow:'0 12px 48px rgba(0,0,0,.22)', fontFamily:ff, flexShrink:0, ...style }}>
      
      {/* Background image or gradient */}
      {bgImage ? (
        <img src={bgImage} alt="" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} />
      ) : (
        <div style={{ position:'absolute', inset:0, background: 'linear-gradient(160deg, ' + ct.color + ' 0%, ' + ct.color + 'cc 60%, #0f1a2e 100%)' }} />
      )}

      {/* Overlay for readability when bg image present */}
      {bgImage && (
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(to bottom, rgba(0,0,0,.45) 0%, rgba(0,0,0,.2) 40%, rgba(0,0,0,.75) 100%)' }} />
      )}

      {/* Status pill */}
      <div style={{ position:'absolute', top:24, left:24, display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'7px 16px', borderRadius:40,
          background: bgImage ? 'rgba(255,255,255,.15)' : 'rgba(255,255,255,.18)',
          backdropFilter:'blur(8px)', border:'1.5px solid rgba(255,255,255,.35)' }}>
          <span style={{ fontSize:16 }}>{ct.emoji}</span>
          <span style={{ fontSize:13, fontWeight:800, color:'#fff', letterSpacing:'.04em' }}>{ct.label}</span>
        </div>
      </div>

      {/* Brand badge — top right */}
      <div style={{ position:'absolute', top:24, right:24, textAlign:'right' }}>
        <div style={{ fontSize:11, fontWeight:800, color:'rgba(255,255,255,.8)', letterSpacing:'.08em' }}>TARGET TEAM</div>
        <div style={{ fontSize:9, color:'rgba(255,255,255,.55)', letterSpacing:'.06em' }}>KW VALLEY REALTY</div>
      </div>

      {/* Bottom content */}
      <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'24px 26px 22px' }}>
        {/* Address */}
        <div style={{ fontSize:bgImage ? 22 : 26, fontWeight:900, color:'#fff', lineHeight:1.2,
          marginBottom:10, textShadow: bgImage ? '0 2px 8px rgba(0,0,0,.5)' : 'none' }}>
          {addr}
        </div>

        {/* Price */}
        <div style={{ fontSize:bgImage ? 32 : 36, fontWeight:900, color:'#fff', marginBottom:12,
          textShadow: bgImage ? '0 2px 8px rgba(0,0,0,.4)' : 'none' }}>
          {price}
        </div>

        {/* Stats row */}
        <div style={{ display:'flex', gap:16, marginBottom:14, flexWrap:'wrap' }}>
          {beds  && <Stat val={beds}  unit="bd" />}
          {baths && <Stat val={baths} unit="ba" />}
          {sqft  && <Stat val={sqft}  unit="sqft" />}
        </div>

        {/* Open house date */}
        {cardType === 'open_house' && ohDate && (
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'7px 14px',
            borderRadius:8, background:'rgba(255,255,255,.18)', backdropFilter:'blur(6px)',
            border:'1px solid rgba(255,255,255,.3)', marginBottom:12 }}>
            <span style={{ fontSize:13 }}>🗓</span>
            <span style={{ fontSize:13, fontWeight:700, color:'#fff' }}>
              {ohDate}{ohTime ? ' at ' + ohTime : ''}
            </span>
          </div>
        )}

        {/* Custom text */}
        {customText && (
          <div style={{ fontSize:13, color:'rgba(255,255,255,.85)', marginBottom:10, fontStyle:'italic', lineHeight:1.4 }}>
            {customText}
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop:'1px solid rgba(255,255,255,.2)', paddingTop:12,
          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,.9)' }}>{agent}</span>
          <span style={{ fontSize:11, color:'rgba(255,255,255,.6)' }}>845.424.1014 · @thetargetteam</span>
        </div>
      </div>
    </div>
  )
}

function Stat({ val, unit }) {
  return (
    <div style={{ display:'flex', alignItems:'baseline', gap:3 }}>
      <span style={{ fontSize:18, fontWeight:900, color:'#fff' }}>{val}</span>
      <span style={{ fontSize:11, color:'rgba(255,255,255,.65)', fontWeight:600 }}>{unit}</span>
    </div>
  )
}

// ── EXPORT HELPERS ────────────────────────────────────────────────
async function exportCardAsImage(cardRef, filename, format) {
  // Use html2canvas-like approach via canvas
  // Since we can't load html2canvas, we use a print/blob approach
  const el = cardRef.current
  if (!el) return

  // Create a blob URL for the card via SVG foreignObject trick
  const rect = el.getBoundingClientRect()
  const w = 1080, h = 1080

  // We'll open a new window with the card at 1080px and trigger print/save
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{width:' + w + 'px;height:' + h + 'px;overflow:hidden;display:flex;align-items:center;justify-content:center}#card{width:' + w + 'px;height:' + h + 'px;transform-origin:top left}</style></head><body><div id="card">' + el.outerHTML + '</div></body></html>'

  const blob = new Blob([html], { type: 'text/html' })
  const url  = URL.createObjectURL(blob)

  if (format === 'pdf') {
    const win = window.open(url, '_blank')
    setTimeout(function() { win && win.print(); URL.revokeObjectURL(url) }, 800)
  } else {
    // JPEG: open in new tab so user can right-click save or use browser's save
    const win = window.open(url, '_blank')
    setTimeout(function() { URL.revokeObjectURL(url) }, 5000)
  }
}

// ── CARD BUILDER TAB ──────────────────────────────────────────────
function BuilderTab({ listings }) {
  const { toast } = useApp()
  const { agent }  = useAuth()
  const cardRef    = useRef(null)

  const [cardType,   setCardType]   = useState('coming')
  const [listingId,  setListingId]  = useState('')
  const [agentName,  setAgentName]  = useState(agent ? agent.name : '')
  const [ohDate,     setOhDate]     = useState('')
  const [ohTime,     setOhTime]     = useState('')
  const [bgImage,    setBgImage]    = useState(null)
  const [customText, setCustomText] = useState('')
  const [saving,     setSaving]     = useState(false)
  const [tplName,    setTplName]    = useState('')
  const [showSave,   setShowSave]   = useState(false)
  const [exporting,  setExporting]  = useState(false)

  const listing = listings.find(function(l) { return l.id === listingId }) || null

  // Auto-fill agent name from agent
  useEffect(function() { if (agent && !agentName) setAgentName(agent.name) }, [agent])

  // When listing changes, auto-select card type based on status
  useEffect(function() {
    if (!listing) return
    const status = (listing.status || '').toLowerCase()
    if (status.includes('coming'))   setCardType('coming')
    else if (status.includes('contract')) setCardType('contract')
    else if (status.includes('sold'))     setCardType('sold')
    else if (status.includes('active') || status.includes('listed')) setCardType('active')
  }, [listingId])

  function handleImageUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { toast('Image must be under 10MB', '#DC2626'); return }
    const reader = new FileReader()
    reader.onload = function(ev) { setBgImage(ev.target.result) }
    reader.readAsDataURL(file)
  }

  async function saveTemplate() {
    if (!tplName.trim()) { toast('Enter a template name', '#F5A623'); return }
    setSaving(true)
    try {
      await supabase.from('card_templates').insert({
        name:        tplName.trim(),
        card_type:   cardType,
        agent_name:  agentName,
        custom_text: customText,
        bg_image:    bgImage,
        created_by:  agent ? agent.id : null,
        created_at:  new Date().toISOString(),
      })
      toast('✅ Template saved as "' + tplName + '"')
      setShowSave(false)
      setTplName('')
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  function doExport(format) {
    setExporting(true)
    const ct    = CARD_TYPES.find(function(t) { return t.id === cardType }) || CARD_TYPES[0]
    const addr  = listing ? listing.addr : 'card'
    const fname = ct.label.replace(/\s/g,'_') + '_' + addr.replace(/[^a-zA-Z0-9]/g,'_').slice(0,30) + '.' + (format === 'pdf' ? 'pdf' : 'jpg')
    exportCardAsImage(cardRef, fname, format).finally(function() { setExporting(false) })
    toast(format === 'pdf' ? '📄 Opening print dialog for PDF...' : '🖼 Opening card — right-click → Save image')
  }

  const Lbl = function({ c }) {
    return <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>{c}</div>
  }
  const inp = { width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, boxSizing:'border-box' }
  const sel = { width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }

  return (
    <div style={{ display:'flex', gap:24, flexWrap:'wrap', alignItems:'flex-start' }}>

      {/* ── LEFT CONTROLS ── */}
      <div style={{ flex:'0 0 300px', display:'flex', flexDirection:'column', gap:14 }}>

        {/* Card type */}
        <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:16 }}>
          <Lbl c="Card Type" />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
            {CARD_TYPES.map(function(ct) {
              const active = cardType === ct.id
              return (
                <button key={ct.id} onClick={function() { setCardType(ct.id) }}
                  style={{ padding:'9px 10px', borderRadius:8, border:'1.5px solid ' + (active ? ct.color : 'var(--border)'),
                    background: active ? ct.color + '18' : 'transparent',
                    color: active ? ct.color : 'var(--text)', fontSize:12, fontWeight: active ? 800 : 500,
                    cursor:'pointer', fontFamily:ff, textAlign:'left', display:'flex', alignItems:'center', gap:6 }}>
                  <span>{ct.emoji}</span>{ct.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Listing */}
        <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:16 }}>
          <Lbl c="Pull from Listing" />
          <select value={listingId} onChange={function(e) { setListingId(e.target.value) }} style={sel}>
            <option value="">— No listing / manual —</option>
            {listings.map(function(l) {
              return <option key={l.id} value={l.id}>{l.addr} · {fmt$(l.list_price)} · {l.status || ''}</option>
            })}
          </select>
          {listing && (
            <div style={{ marginTop:10, padding:'10px 12px', background:'var(--dim)', borderRadius:8, border:'1px solid var(--border)', fontSize:12 }}>
              <div style={{ fontWeight:700, color:'var(--text)', marginBottom:4 }}>{listing.addr}</div>
              <div style={{ color:'var(--muted)', display:'flex', gap:12, flexWrap:'wrap' }}>
                <span>{fmt$(listing.list_price)}</span>
                {listing.beds  && <span>{listing.beds} bd</span>}
                {listing.baths && <span>{listing.baths} ba</span>}
                {listing.sqft  && <span>{listing.sqft} sqft</span>}
              </div>
              {listing.status && <div style={{ marginTop:4, fontSize:11, color:'var(--muted)' }}>Status: {listing.status}</div>}
            </div>
          )}
        </div>

        {/* Background image */}
        <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:16 }}>
          <Lbl c="Property Photo" />
          <label style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:8,
            border:'1.5px dashed var(--border)', cursor:'pointer', background:'var(--dim)', transition:'all .15s' }}
            onMouseEnter={function(e) { e.currentTarget.style.borderColor = '#CC2200' }}
            onMouseLeave={function(e) { e.currentTarget.style.borderColor = 'var(--border)' }}>
            <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display:'none' }} />
            <span style={{ fontSize:22 }}>{bgImage ? '🖼' : '📷'}</span>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{bgImage ? 'Photo uploaded ✓' : 'Upload property photo'}</div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>JPG, PNG · max 10MB</div>
            </div>
          </label>
          {bgImage && (
            <button onClick={function() { setBgImage(null) }}
              style={{ marginTop:8, width:'100%', padding:'6px', borderRadius:7, border:'1px solid #DC262444',
                background:'#FEF2F2', color:'#DC2626', fontSize:12, cursor:'pointer', fontFamily:ff }}>
              Remove photo
            </button>
          )}
        </div>

        {/* Details */}
        <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:16 }}>
          <Lbl c="Agent Name" />
          <input value={agentName} onChange={function(e) { setAgentName(e.target.value) }} placeholder="e.g. Mendy Jankovits" style={Object.assign({},inp,{marginBottom:12})} />
          <Lbl c="Optional Message" />
          <textarea value={customText} onChange={function(e) { setCustomText(e.target.value) }}
            placeholder="e.g. Beautiful home in desirable neighborhood..." rows={2}
            style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, resize:'vertical', boxSizing:'border-box' }} />
          {cardType === 'open_house' && (
            <div style={{ marginTop:12 }}>
              <Lbl c="Open House Date & Time" />
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <input type="date" value={ohDate} onChange={function(e) { setOhDate(e.target.value) }} style={inp} />
                <input type="time" value={ohTime} onChange={function(e) { setOhTime(e.target.value) }} style={inp} />
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <button onClick={function() { doExport('jpeg') }} disabled={exporting}
              style={{ padding:'11px', borderRadius:9, background:'#CC2200', color:'#fff', border:'none',
                fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:ff, opacity: exporting ? .7 : 1 }}>
              ⬇ Save JPEG
            </button>
            <button onClick={function() { doExport('pdf') }} disabled={exporting}
              style={{ padding:'11px', borderRadius:9, background:'#1B2B4B', color:'#fff', border:'none',
                fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:ff, opacity: exporting ? .7 : 1 }}>
              📄 Save PDF
            </button>
          </div>
          <button onClick={function() { setShowSave(true) }}
            style={{ padding:'10px', borderRadius:9, border:'1px solid var(--border)', background:'var(--dim)',
              color:'var(--text)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
            💾 Save as Template
          </button>
        </div>
      </div>

      {/* ── CARD PREVIEW ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:14, minWidth:0 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em' }}>
          Preview · 1080 × 1080 px when exported
        </div>
        <div ref={cardRef} id="card-export-root">
          <CardRenderer
            cardType={cardType}
            listing={listing}
            ohDate={ohDate}
            ohTime={ohTime}
            agentName={agentName}
            bgImage={bgImage}
            customText={customText}
          />
        </div>
        <div style={{ fontSize:11, color:'var(--muted)', textAlign:'center', lineHeight:1.5 }}>
          Instagram · Facebook · LinkedIn ready
        </div>
      </div>

      {/* ── SAVE TEMPLATE MODAL ── */}
      {showSave && (
        <div onClick={function(e) { if(e.target===e.currentTarget) setShowSave(false) }}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000,
            display:'flex', alignItems:'center', justifyContent:'center', padding:20, fontFamily:ff }}>
          <div style={{ background:'var(--panel)', borderRadius:14, width:'100%', maxWidth:380, padding:24, boxShadow:'0 20px 50px rgba(0,0,0,.3)' }}>
            <div style={{ fontSize:16, fontWeight:800, color:'var(--text)', marginBottom:4 }}>Save as Template</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>
              Save this card design as a reusable template. Next time, just pick a listing and it auto-fills.
            </div>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>Template Name</div>
            <input value={tplName} onChange={function(e) { setTplName(e.target.value) }}
              placeholder={'e.g. ' + (CARD_TYPES.find(function(t){return t.id===cardType})||CARD_TYPES[0]).label + ' Card'}
              style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, boxSizing:'border-box', marginBottom:16 }}
              onKeyDown={function(e) { if(e.key==='Enter') saveTemplate() }}
              autoFocus
            />
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={function() { setShowSave(false) }}
                style={{ padding:'9px 16px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', cursor:'pointer', fontFamily:ff, fontSize:13 }}>
                Cancel
              </button>
              <button onClick={saveTemplate} disabled={saving}
                style={{ padding:'9px 20px', borderRadius:8, border:'none', background:'#CC2200', color:'#fff', cursor:'pointer', fontFamily:ff, fontSize:13, fontWeight:700, opacity:saving?.7:1 }}>
                {saving ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── AI GENERATOR TAB ──────────────────────────────────────────────
function AITab({ listings }) {
  const { toast } = useApp()
  const { agent }  = useAuth()
  const cardRef    = useRef(null)

  const [listingId,  setListingId]  = useState('')
  const [cardType,   setCardType]   = useState('coming')
  const [prompt,     setPrompt]     = useState('')
  const [generating, setGenerating] = useState(false)
  const [result,     setResult]     = useState(null)  // { headline, tagline, cta, customText }
  const [bgImage,    setBgImage]    = useState(null)
  const [agentName,  setAgentName]  = useState(agent ? agent.name : '')

  useEffect(function() { if(agent && !agentName) setAgentName(agent.name) }, [agent])

  const listing = listings.find(function(l){return l.id===listingId}) || null

  function handleImageUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = function(ev) { setBgImage(ev.target.result) }
    reader.readAsDataURL(file)
  }

  async function generate() {
    setGenerating(true)
    setResult(null)
    try {
      const ct = CARD_TYPES.find(function(t){return t.id===cardType}) || CARD_TYPES[0]
      const listingContext = listing
        ? listing.addr + ', ' + fmt$(listing.list_price) + ', ' + (listing.beds||'?') + ' bed ' + (listing.baths||'?') + ' bath, ' + (listing.sqft||'?') + ' sqft. Status: ' + (listing.status||'') + '. ' + (listing.description||'')
        : 'Property in Rockland County, NY'

      const systemPrompt = 'You are a real estate social media copywriter for Target Team at KW Valley Realty in Rockland County, NY. Write punchy, professional card copy. Respond ONLY with a JSON object with these keys: headline (max 8 words, all caps), tagline (max 18 words, title case), cta (max 6 words), caption (1-2 sentences for the post caption). No markdown, no backticks, just the JSON object.'

      const userPrompt = 'Card type: ' + ct.label + '\nListing: ' + listingContext + (prompt ? '\nExtra notes: ' + prompt : '') + '\n\nWrite card copy for this listing.'

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 400,
          system: systemPrompt,
          messages: [{ role:'user', content: userPrompt }],
        })
      })
      const data = await res.json()
      const text = (data.content || []).map(function(c){return c.text||''}).join('')
      const clean = text.replace(/```json|```/g,'').trim()
      const parsed = JSON.parse(clean)
      setResult(parsed)
      toast('✅ AI copy generated!')
    } catch(e) {
      toast('AI generation failed: ' + e.message, '#DC2626')
    } finally {
      setGenerating(false)
    }
  }

  function doExport(format) {
    exportCardAsImage(cardRef, 'ai_card.' + (format==='pdf'?'pdf':'jpg'), format)
    toast(format === 'pdf' ? '📄 Opening print dialog...' : '🖼 Opening card — right-click → Save image')
  }

  const sel = { width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }
  const Lbl = function({ c }) { return <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>{c}</div> }

  return (
    <div style={{ display:'flex', gap:24, flexWrap:'wrap', alignItems:'flex-start' }}>
      <div style={{ flex:'0 0 300px', display:'flex', flexDirection:'column', gap:14 }}>

        <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
            <span style={{ fontSize:22 }}>🤖</span>
            <div>
              <div style={{ fontSize:14, fontWeight:800, color:'var(--text)' }}>AI Card Copy</div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>Select a listing and generate professional copy</div>
            </div>
          </div>

          <Lbl c="Card Type" />
          <select value={cardType} onChange={function(e){setCardType(e.target.value)}} style={Object.assign({},sel,{marginBottom:12})}>
            {CARD_TYPES.map(function(ct){return <option key={ct.id} value={ct.id}>{ct.emoji} {ct.label}</option>})}
          </select>

          <Lbl c="Select Listing" />
          <select value={listingId} onChange={function(e){setListingId(e.target.value)}} style={Object.assign({},sel,{marginBottom:12})}>
            <option value="">— Choose a listing —</option>
            {listings.map(function(l){return <option key={l.id} value={l.id}>{l.addr} · {fmt$(l.list_price)}</option>})}
          </select>

          <Lbl c="Extra Instructions (optional)" />
          <textarea value={prompt} onChange={function(e){setPrompt(e.target.value)}}
            placeholder="e.g. Emphasize the large backyard and great school district..."
            rows={2} style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, resize:'vertical', boxSizing:'border-box', marginBottom:12 }} />

          <Lbl c="Property Photo (optional)" />
          <label style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:8,
            border:'1.5px dashed var(--border)', cursor:'pointer', background:'var(--dim)', marginBottom:12 }}>
            <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display:'none' }} />
            <span style={{ fontSize:18 }}>{bgImage ? '🖼' : '📷'}</span>
            <span style={{ fontSize:12, color:'var(--muted)' }}>{bgImage ? 'Photo uploaded ✓' : 'Upload property photo'}</span>
          </label>

          <button onClick={generate} disabled={generating}
            style={{ width:'100%', padding:'12px', borderRadius:9, border:'none',
              background: generating ? '#94A3B8' : 'linear-gradient(135deg, #CC2200, #8B5CF6)',
              color:'#fff', fontSize:14, fontWeight:800, cursor: generating ? 'default' : 'pointer', fontFamily:ff }}>
            {generating ? '⏳ Generating...' : '✨ Generate Card Copy'}
          </button>
        </div>

        {result && (
          <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid #10B981', padding:16 }}>
            <div style={{ fontSize:12, fontWeight:800, color:'#10B981', marginBottom:10 }}>✅ AI Generated Copy</div>
            {[
              { label:'Headline',  val: result.headline },
              { label:'Tagline',   val: result.tagline  },
              { label:'CTA',       val: result.cta      },
              { label:'Caption',   val: result.caption  },
            ].filter(function(r){return r.val}).map(function(r) {
              return (
                <div key={r.label} style={{ marginBottom:10 }}>
                  <div style={{ fontSize:9, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:2 }}>{r.label}</div>
                  <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.4, padding:'6px 8px', background:'var(--dim)', borderRadius:6 }}>{r.val}</div>
                </div>
              )
            })}
            {result.caption && (
              <button onClick={function() { navigator.clipboard.writeText(result.caption); toast('Caption copied!') }}
                style={{ width:'100%', padding:'7px', borderRadius:7, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', fontSize:11, cursor:'pointer', fontFamily:ff, marginTop:4 }}>
                📋 Copy post caption
              </button>
            )}
          </div>
        )}

        {result && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <button onClick={function(){doExport('jpeg')}}
              style={{ padding:'11px', borderRadius:9, background:'#CC2200', color:'#fff', border:'none', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:ff }}>
              ⬇ Save JPEG
            </button>
            <button onClick={function(){doExport('pdf')}}
              style={{ padding:'11px', borderRadius:9, background:'#1B2B4B', color:'#fff', border:'none', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:ff }}>
              📄 Save PDF
            </button>
          </div>
        )}
      </div>

      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:14, minWidth:0 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em' }}>Preview</div>
        <div ref={cardRef}>
          <CardRenderer
            cardType={cardType}
            listing={listing}
            agentName={agentName}
            bgImage={bgImage}
            customText={result ? result.tagline : ''}
          />
        </div>
        {!result && (
          <div style={{ padding:'14px 20px', background:'var(--dim)', borderRadius:10, border:'1px solid var(--border)', fontSize:12, color:'var(--muted)', textAlign:'center', maxWidth:400 }}>
            Select a listing and click Generate to have AI write the card copy, then the preview updates instantly.
          </div>
        )}
      </div>
    </div>
  )
}

// ── MY TEMPLATES TAB ──────────────────────────────────────────────
function TemplatesTab({ listings }) {
  const { toast } = useApp()
  const cardRef   = useRef(null)
  const [templates, setTemplates]  = useState([])
  const [loading,   setLoading]    = useState(true)
  const [selected,  setSelected]   = useState(null)
  const [listingId, setListingId]  = useState('')
  const [deleting,  setDeleting]   = useState(null)

  useEffect(function() { loadTemplates() }, [])

  async function loadTemplates() {
    setLoading(true)
    try {
      const { data } = await supabase.from('card_templates').select('*').order('created_at', { ascending:false })
      setTemplates(data || [])
    } catch(e) { setTemplates([]) }
    finally { setLoading(false) }
  }

  async function deleteTemplate(id) {
    setDeleting(id)
    try {
      await supabase.from('card_templates').delete().eq('id', id)
      setTemplates(function(p){return p.filter(function(t){return t.id!==id})})
      if (selected && selected.id === id) setSelected(null)
      toast('Template deleted')
    } catch(e) { toast('Delete failed', '#DC2626') }
    finally { setDeleting(null) }
  }

  function doExport(format) {
    exportCardAsImage(cardRef, 'card.' + (format==='pdf'?'pdf':'jpg'), format)
    toast(format==='pdf' ? '📄 Opening print dialog...' : '🖼 Opening card — right-click → Save image')
  }

  const listing = listings.find(function(l){return l.id===listingId}) || null
  const ct      = selected ? (CARD_TYPES.find(function(t){return t.id===selected.card_type}) || CARD_TYPES[0]) : null

  return (
    <div style={{ display:'flex', gap:24, flexWrap:'wrap', alignItems:'flex-start' }}>
      {/* Template list */}
      <div style={{ flex:'0 0 300px' }}>
        <div style={{ fontSize:14, fontWeight:800, color:'var(--text)', marginBottom:14 }}>
          Saved Templates ({templates.length})
        </div>

        {loading ? (
          <div style={{ textAlign:'center', padding:32, color:'var(--muted)', fontSize:13 }}>Loading...</div>
        ) : templates.length === 0 ? (
          <div style={{ textAlign:'center', padding:32, color:'var(--muted)', fontSize:13, lineHeight:1.6 }}>
            <div style={{ fontSize:32, marginBottom:8 }}>📁</div>
            No templates yet. Build a card in the Card Builder tab and save it as a template.
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {templates.map(function(tpl) {
              const tct = CARD_TYPES.find(function(t){return t.id===tpl.card_type}) || CARD_TYPES[0]
              const isSelected = selected && selected.id === tpl.id
              return (
                <div key={tpl.id} style={{ borderRadius:10, border:'1.5px solid ' + (isSelected ? '#CC2200' : 'var(--border)'),
                  background: isSelected ? 'rgba(204,34,0,.05)' : 'var(--panel)', overflow:'hidden', transition:'all .15s' }}>
                  <div onClick={function(){setSelected(tpl); setListingId('')}}
                    style={{ padding:'12px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:10 }}>
                    {/* Color swatch / preview */}
                    <div style={{ width:40, height:40, borderRadius:8, background:tct.color,
                      display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                      {tpl.bg_image
                        ? <img src={tpl.bg_image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:8 }} />
                        : tct.emoji}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tpl.name}</div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>{tct.emoji} {tct.label}</div>
                    </div>
                    <button onClick={function(e){e.stopPropagation(); if(window.confirm('Delete "'+tpl.name+'"?')) deleteTemplate(tpl.id)}}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'#DC2626', fontSize:16, padding:4, opacity: deleting===tpl.id?.5:1 }}>
                      ×
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Right: listing picker + preview */}
      <div style={{ flex:1, minWidth:0 }}>
        {selected ? (
          <div>
            <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:16, marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:800, color:'var(--text)', marginBottom:10 }}>
                Update with a Listing
              </div>
              <select value={listingId} onChange={function(e){setListingId(e.target.value)}}
                style={{ width:'100%', padding:'9px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, marginBottom: listing ? 8 : 0 }}>
                <option value="">— Select listing to populate card —</option>
                {listings.map(function(l){return <option key={l.id} value={l.id}>{l.addr} · {fmt$(l.list_price)} · {l.status||''}</option>})}
              </select>
              {listing && (
                <div style={{ padding:'10px 12px', background:'var(--dim)', borderRadius:8, border:'1px solid var(--border)', fontSize:12 }}>
                  <div style={{ fontWeight:700, color:'var(--text)' }}>{listing.addr}</div>
                  <div style={{ color:'var(--muted)', display:'flex', gap:12, marginTop:3, flexWrap:'wrap' }}>
                    <span>{fmt$(listing.list_price)}</span>
                    {listing.beds  && <span>{listing.beds} bd</span>}
                    {listing.baths && <span>{listing.baths} ba</span>}
                    {listing.sqft  && <span>{listing.sqft} sqft</span>}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:14 }}>
              <div ref={cardRef}>
                <CardRenderer
                  cardType={selected.card_type}
                  listing={listing}
                  agentName={selected.agent_name}
                  bgImage={listing ? null : selected.bg_image}
                  customText={selected.custom_text}
                />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, width:'100%', maxWidth:500 }}>
                <button onClick={function(){doExport('jpeg')}}
                  style={{ padding:'12px', borderRadius:9, background:'#CC2200', color:'#fff', border:'none', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:ff }}>
                  ⬇ Save JPEG
                </button>
                <button onClick={function(){doExport('pdf')}}
                  style={{ padding:'12px', borderRadius:9, background:'#1B2B4B', color:'#fff', border:'none', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:ff }}>
                  📄 Save PDF
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:300, color:'var(--muted)', fontSize:13 }}>
            Select a template on the left to preview and export it
          </div>
        )}
      </div>
    </div>
  )
}

// ── CANVA TAB ─────────────────────────────────────────────────────
function CanvaTab({ listings }) {
  const [listingId, setListingId] = useState('')
  const listing = listings.find(function(l){return l.id===listingId}) || null

  const TEMPLATES = [
    { name:'Just Listed',      tag:'just listed real estate', url:'https://www.canva.com/create/instagram-posts/' },
    { name:'Coming Soon',      tag:'coming soon real estate', url:'https://www.canva.com/create/instagram-posts/' },
    { name:'Open House',       tag:'open house real estate',  url:'https://www.canva.com/create/instagram-posts/' },
    { name:'Just Sold',        tag:'sold real estate',        url:'https://www.canva.com/create/instagram-posts/' },
    { name:'Price Reduced',    tag:'price reduced real estate',url:'https://www.canva.com/create/instagram-posts/' },
    { name:'Instagram Story',  tag:'real estate story',       url:'https://www.canva.com/create/instagram-stories/' },
    { name:'Facebook Post',    tag:'real estate facebook',    url:'https://www.canva.com/create/facebook-posts/' },
    { name:'Listing Flyer',    tag:'real estate flyer',       url:'https://www.canva.com/create/flyers/' },
  ]

  function openCanva(t) {
    const details = listing ? listing.addr + ' · ' + fmt$(listing.list_price) + (listing.beds ? ' · ' + listing.beds + ' bd ' + listing.baths + ' ba' : '') : ''
    const q = encodeURIComponent(t.tag)
    window.open(t.url + '?q=' + q, '_blank')
    if (details) {
      navigator.clipboard.writeText(details).catch(function(){})
    }
  }

  return (
    <div>
      <div style={{ background:'linear-gradient(135deg, #8B3DFF, #6320EE)', borderRadius:14, padding:'22px 26px', marginBottom:20, color:'#fff' }}>
        <div style={{ fontSize:20, fontWeight:900, marginBottom:4 }}>Canva</div>
        <div style={{ fontSize:13, opacity:.85, marginBottom:14, lineHeight:1.5 }}>
          Select a listing below, then open a Canva template. Listing details are automatically copied to your clipboard so you can paste them in.
        </div>
        <a href="https://www.canva.com/real-estate/" target="_blank" rel="noopener noreferrer"
          style={{ display:'inline-block', background:'#fff', color:'#8B3DFF', padding:'8px 18px', borderRadius:8, fontSize:13, fontWeight:800, textDecoration:'none' }}>
          Browse All Real Estate Templates
        </a>
      </div>

      <div style={{ background:'var(--panel)', borderRadius:10, border:'1px solid var(--border)', padding:14, marginBottom:16 }}>
        <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Auto-copy listing details when opening Canva</div>
        <select value={listingId} onChange={function(e){setListingId(e.target.value)}}
          style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }}>
          <option value="">— No listing —</option>
          {listings.map(function(l){return <option key={l.id} value={l.id}>{l.addr} · {fmt$(l.list_price)}</option>})}
        </select>
        {listing && (
          <div style={{ marginTop:8, padding:'8px 10px', background:'#EFF6FF', borderRadius:7, fontSize:12, color:'#1E40AF' }}>
            Listing details will be copied to clipboard when you click a template below.
          </div>
        )}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(190px,1fr))', gap:10 }}>
        {TEMPLATES.map(function(t) {
          return (
            <button key={t.name} onClick={function(){openCanva(t)}}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 16px',
                background:'var(--panel)', borderRadius:10, border:'1px solid var(--border)',
                cursor:'pointer', fontFamily:ff, textAlign:'left', transition:'all .15s' }}
              onMouseEnter={function(e){e.currentTarget.style.borderColor='#8B3DFF'; e.currentTarget.style.background='#8B3DFF08'}}
              onMouseLeave={function(e){e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.background='var(--panel)'}}>
              <div style={{ width:32, height:32, borderRadius:8, background:'#8B3DFF', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, color:'#fff', fontWeight:800, fontSize:13 }}>C</div>
              <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{t.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── ADOBE TAB ─────────────────────────────────────────────────────
function AdobeTab({ listings }) {
  const [listingId, setListingId] = useState('')
  const listing = listings.find(function(l){return l.id===listingId}) || null

  const TEMPLATES = [
    { name:'Instagram Post',    url:'https://new.express.adobe.com/new?category=instagram' },
    { name:'Instagram Story',   url:'https://new.express.adobe.com/new?category=instagram-story' },
    { name:'Facebook Post',     url:'https://new.express.adobe.com/new?category=facebook' },
    { name:'Listing Flyer',     url:'https://new.express.adobe.com/new?category=flyer' },
    { name:'Open House Flyer',  url:'https://new.express.adobe.com/new?category=flyer' },
    { name:'Social Ad',         url:'https://new.express.adobe.com/new?category=ads' },
  ]

  function openAdobe(t) {
    window.open(t.url, '_blank')
    if (listing) {
      const details = listing.addr + ' · ' + fmt$(listing.list_price) + (listing.beds ? ' · ' + listing.beds + ' bd ' + listing.baths + ' ba · ' + (listing.sqft||'') + ' sqft' : '')
      navigator.clipboard.writeText(details).catch(function(){})
    }
  }

  return (
    <div>
      <div style={{ background:'linear-gradient(135deg, #FF0000, #CC0000)', borderRadius:14, padding:'22px 26px', marginBottom:20, color:'#fff' }}>
        <div style={{ fontSize:20, fontWeight:900, marginBottom:4 }}>Adobe Express</div>
        <div style={{ fontSize:13, opacity:.85, marginBottom:14, lineHeight:1.5 }}>
          Select a listing below, then open Adobe Express. Details are auto-copied to your clipboard.
        </div>
        <a href="https://new.express.adobe.com/" target="_blank" rel="noopener noreferrer"
          style={{ display:'inline-block', background:'#fff', color:'#FF0000', padding:'8px 18px', borderRadius:8, fontSize:13, fontWeight:800, textDecoration:'none' }}>
          Open Adobe Express
        </a>
      </div>

      <div style={{ background:'var(--panel)', borderRadius:10, border:'1px solid var(--border)', padding:14, marginBottom:16 }}>
        <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Auto-copy listing details</div>
        <select value={listingId} onChange={function(e){setListingId(e.target.value)}}
          style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }}>
          <option value="">— No listing —</option>
          {listings.map(function(l){return <option key={l.id} value={l.id}>{l.addr} · {fmt$(l.list_price)}</option>})}
        </select>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(190px,1fr))', gap:10 }}>
        {TEMPLATES.map(function(t) {
          return (
            <button key={t.name} onClick={function(){openAdobe(t)}}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 16px',
                background:'var(--panel)', borderRadius:10, border:'1px solid var(--border)',
                cursor:'pointer', fontFamily:ff, textAlign:'left', transition:'all .15s' }}
              onMouseEnter={function(e){e.currentTarget.style.borderColor='#FF0000'; e.currentTarget.style.background='#FF000008'}}
              onMouseLeave={function(e){e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.background='var(--panel)'}}>
              <div style={{ width:32, height:32, borderRadius:8, background:'#FF0000', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, color:'#fff', fontWeight:900, fontSize:12 }}>Ae</div>
              <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{t.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── MAIN ─────────────────────────────────────────────────────────
export function SocialCards() {
  const [tab, setTab]    = useState('builder')
  const { listings }     = useListings()
  const safeListings     = listings || []

  return (
    <div style={{ fontFamily:ff }}>
      {/* Header */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:22, fontWeight:900, color:'var(--text)' }}>🎨 Card Generator</div>
        <div style={{ fontSize:13, color:'var(--muted)', marginTop:3 }}>
          Build listing cards · AI copy · save templates · export HD JPEG or PDF
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', borderBottom:'2px solid var(--border)', marginBottom:24, gap:0, overflowX:'auto' }}>
        {TABS.map(function(t) {
          const active = tab === t.id
          return (
            <button key={t.id} onClick={function(){setTab(t.id)}}
              style={{ padding:'9px 18px', border:'none', background:'none', cursor:'pointer',
                borderBottom: active ? '2px solid #CC2200' : '2px solid transparent', marginBottom:'-2px',
                fontSize:13, fontWeight: active ? 700 : 500, color: active ? '#CC2200' : 'var(--muted)',
                fontFamily:ff, whiteSpace:'nowrap' }}>
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'builder'   && <BuilderTab   listings={safeListings} />}
      {tab === 'ai'        && <AITab        listings={safeListings} />}
      {tab === 'templates' && <TemplatesTab listings={safeListings} />}
      {tab === 'canva'     && <CanvaTab     listings={safeListings} />}
      {tab === 'adobe'     && <AdobeTab     listings={safeListings} />}
    </div>
  )
}
