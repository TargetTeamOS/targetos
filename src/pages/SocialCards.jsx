// TargetOS V2 — Social Card Generator
// Upload a card image → edit text overlays → auto-fill from listing → export HD JPEG/PNG/PDF
import React, { useState, useRef, useEffect } from 'react'
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

const TABS = [
  { id:'editor',    label:'🖼 Card Editor' },
  { id:'builder',   label:'🎨 Quick Builder' },
  { id:'ai',        label:'🤖 AI Generator' },
  { id:'templates', label:'📁 My Templates' },
  { id:'canva',     label:'Canva' },
  { id:'adobe',     label:'Adobe Express' },
]

function fmt$(n) { return n ? '$' + Number(n).toLocaleString() : '' }

// ── SHARED LABEL ────────────────────────────────────────────────
function Lbl({ c }) {
  return <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>{c}</div>
}
function inp(extra) {
  return Object.assign({ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, boxSizing:'border-box' }, extra)
}

// ── CANVAS-BASED CARD EDITOR ─────────────────────────────────────
// Renders a 1080×1080 canvas with uploaded image + editable text layers
// Exports as real PNG/JPEG/PDF at full resolution
function CardEditor({ listings }) {
  const { toast } = useApp()
  const { agent }  = useAuth()
  const canvasRef  = useRef(null)
  const fileRef    = useRef(null)

  const [bgImg,      setBgImg]      = useState(null)   // Image object
  const [bgSrc,      setBgSrc]      = useState(null)   // data URL
  const [listingId,  setListingId]  = useState('')
  const [agentName,  setAgentName]  = useState(agent ? agent.name : '')
  const [cardType,   setCardType]   = useState('coming')
  const [saving,     setSaving]     = useState(false)
  const [tplName,    setTplName]    = useState('')
  const [showSave,   setShowSave]   = useState(false)
  const [templates,  setTemplates]  = useState([])
  const [loadingTpl, setLoadingTpl] = useState(false)

  // Text layer state — each layer: { id, text, x, y, size, color, bold, align }
  const [layers, setLayers]  = useState([
    { id:'status',  text:'Coming Soon',          x:60,  y:80,  size:52, color:'#ffffff', bold:true,  shadow:true,  align:'left' },
    { id:'address', text:'Select a listing',     x:60,  y:820, size:34, color:'#ffffff', bold:true,  shadow:true,  align:'left' },
    { id:'price',   text:'',                     x:60,  y:870, size:42, color:'#ffffff', bold:true,  shadow:true,  align:'left' },
    { id:'details', text:'',                     x:60,  y:920, size:24, color:'rgba(255,255,255,0.85)', bold:false, shadow:true, align:'left' },
    { id:'agent',   text:'Target Team · KW Valley Realty', x:60, y:980, size:18, color:'rgba(255,255,255,0.7)', bold:false, shadow:false, align:'left' },
    { id:'phone',   text:'845.424.1014 · @thetargetteam', x:1020, y:980, size:18, color:'rgba(255,255,255,0.7)', bold:false, shadow:false, align:'right' },
  ])
  const [selectedLayer, setSelectedLayer] = useState('address')
  const [dragging, setDragging]  = useState(null)   // { id, ox, oy }
  const [scale, setScale]        = useState(1)       // canvas display scale

  const CANVAS_SIZE = 1080
  const DISPLAY_SIZE = 540  // show at 540px, export at 1080px

  useEffect(function() { if(agent) setAgentName(agent.name) }, [agent])

  // Auto-fill layers when listing or card type changes
  useEffect(function() {
    const listing = listings.find(function(l){ return l.id === listingId })
    const ct = CARD_TYPES.find(function(t){ return t.id === cardType }) || CARD_TYPES[0]
    setLayers(function(prev) {
      return prev.map(function(l) {
        if (l.id === 'status')  return Object.assign({}, l, { text: ct.label })
        if (l.id === 'address') return Object.assign({}, l, { text: listing ? (listing.addr || '') : 'Select a listing' })
        if (l.id === 'price')   return Object.assign({}, l, { text: listing ? fmt$(listing.list_price) : '' })
        if (l.id === 'details') {
          if (!listing) return Object.assign({}, l, { text: '' })
          const parts = []
          if (listing.beds)  parts.push(listing.beds  + ' bd')
          if (listing.baths) parts.push(listing.baths + ' ba')
          if (listing.sqft)  parts.push(listing.sqft  + ' sqft')
          return Object.assign({}, l, { text: parts.join('  ·  ') })
        }
        if (l.id === 'agent') return Object.assign({}, l, { text: (agentName || 'Target Team') + '  ·  KW Valley Realty' })
        return l
      })
    })
  }, [listingId, cardType, agentName, listings])

  // Draw canvas whenever layers or background change
  useEffect(function() {
    drawCanvas()
  }, [layers, bgImg, bgSrc])

  function drawCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    // Background
    if (bgImg) {
      // Cover-fit the image
      const iw = bgImg.naturalWidth, ih = bgImg.naturalHeight
      const scale = Math.max(CANVAS_SIZE / iw, CANVAS_SIZE / ih)
      const sw = iw * scale, sh = ih * scale
      const ox = (CANVAS_SIZE - sw) / 2, oy = (CANVAS_SIZE - sh) / 2
      ctx.drawImage(bgImg, ox, oy, sw, sh)
      // Dark gradient overlay for text readability
      const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_SIZE)
      grad.addColorStop(0,   'rgba(0,0,0,0.35)')
      grad.addColorStop(0.5, 'rgba(0,0,0,0.1)')
      grad.addColorStop(1,   'rgba(0,0,0,0.75)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    } else {
      // Branded gradient fallback
      const ct = CARD_TYPES.find(function(t){ return t.id === cardType }) || CARD_TYPES[0]
      const grad = ctx.createLinearGradient(0, 0, CANVAS_SIZE, CANVAS_SIZE)
      grad.addColorStop(0, ct.color)
      grad.addColorStop(1, '#0f1a2e')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    }

    // Draw text layers
    layers.forEach(function(layer) {
      if (!layer.text) return
      ctx.save()
      ctx.font = (layer.bold ? '800 ' : '500 ') + layer.size + 'px ' + ff
      ctx.fillStyle = layer.color
      ctx.textBaseline = 'top'
      if (layer.shadow) {
        ctx.shadowColor = 'rgba(0,0,0,0.6)'
        ctx.shadowBlur  = 8
        ctx.shadowOffsetX = 2
        ctx.shadowOffsetY = 2
      }
      if (layer.align === 'right') {
        ctx.textAlign = 'right'
        ctx.fillText(layer.text, layer.x, layer.y)
      } else {
        ctx.textAlign = 'left'
        ctx.fillText(layer.text, layer.x, layer.y)
      }
      ctx.restore()

      // Highlight selected layer
      if (layer.id === selectedLayer) {
        ctx.save()
        ctx.font = (layer.bold ? '800 ' : '500 ') + layer.size + 'px ' + ff
        const w = ctx.measureText(layer.text).width
        const h = layer.size * 1.3
        const rx = layer.align === 'right' ? layer.x - w - 6 : layer.x - 6
        ctx.strokeStyle = '#CC2200'
        ctx.lineWidth   = 2
        ctx.setLineDash([6, 3])
        ctx.strokeRect(rx, layer.y - 4, w + 12, h + 4)
        ctx.restore()
      }
    })
  }

  function handleImageUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 15 * 1024 * 1024) { toast('Image must be under 15MB', '#DC2626'); return }
    const reader = new FileReader()
    reader.onload = function(ev) {
      const src = ev.target.result
      setBgSrc(src)
      const img = new Image()
      img.onload = function() { setBgImg(img) }
      img.src = src
    }
    reader.readAsDataURL(file)
  }

  // Canvas click → select layer
  function onCanvasClick(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    const scl  = CANVAS_SIZE / rect.width
    const mx   = (e.clientX - rect.left) * scl
    const my   = (e.clientY - rect.top)  * scl
    const ctx  = canvasRef.current.getContext('2d')

    // Find topmost layer at click point (reverse order = topmost first)
    const hit = [...layers].reverse().find(function(layer) {
      if (!layer.text) return false
      ctx.font = (layer.bold ? '800 ' : '500 ') + layer.size + 'px ' + ff
      const w = ctx.measureText(layer.text).width
      const h = layer.size * 1.4
      const rx = layer.align === 'right' ? layer.x - w : layer.x
      return mx >= rx - 10 && mx <= rx + w + 10 && my >= layer.y - 4 && my <= layer.y + h + 4
    })
    if (hit) setSelectedLayer(hit.id)
  }

  // Canvas drag → move layer
  function onCanvasMouseDown(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    const scl  = CANVAS_SIZE / rect.width
    const mx   = (e.clientX - rect.left) * scl
    const my   = (e.clientY - rect.top)  * scl
    const ctx  = canvasRef.current.getContext('2d')

    const hit = [...layers].reverse().find(function(layer) {
      if (!layer.text) return false
      ctx.font = (layer.bold ? '800 ' : '500 ') + layer.size + 'px ' + ff
      const w = ctx.measureText(layer.text).width
      const h = layer.size * 1.4
      const rx = layer.align === 'right' ? layer.x - w : layer.x
      return mx >= rx - 10 && mx <= rx + w + 10 && my >= layer.y - 4 && my <= layer.y + h + 4
    })
    if (hit) {
      setSelectedLayer(hit.id)
      setDragging({ id: hit.id, ox: mx - hit.x, oy: my - hit.y })
    }
  }

  function onCanvasMouseMove(e) {
    if (!dragging) return
    const rect = canvasRef.current.getBoundingClientRect()
    const scl  = CANVAS_SIZE / rect.width
    const mx   = (e.clientX - rect.left) * scl
    const my   = (e.clientY - rect.top)  * scl
    updateLayer(dragging.id, { x: Math.round(mx - dragging.ox), y: Math.round(my - dragging.oy) })
  }

  function onCanvasMouseUp() { setDragging(null) }

  function updateLayer(id, changes) {
    setLayers(function(prev) {
      return prev.map(function(l) { return l.id === id ? Object.assign({}, l, changes) : l })
    })
  }

  function addLayer() {
    const id = 'layer_' + Date.now()
    setLayers(function(prev) {
      return prev.concat([{ id, text:'New text', x:100, y:400, size:32, color:'#ffffff', bold:false, shadow:true, align:'left' }])
    })
    setSelectedLayer(id)
  }

  function deleteLayer(id) {
    if (['status','address','price','details','agent','phone'].includes(id)) {
      toast('Cannot delete a built-in layer — clear the text instead', '#F5A623')
      return
    }
    setLayers(function(prev) { return prev.filter(function(l) { return l.id !== id }) })
    setSelectedLayer(null)
  }

  // Export at full 1080×1080
  function exportPNG() {
    const canvas = canvasRef.current
    if (!canvas) return
    // Temporarily deselect so highlight box is not in export
    setSelectedLayer(null)
    setTimeout(function() {
      drawCanvas()
      const url  = canvas.toDataURL('image/jpeg', 0.95)
      const link = document.createElement('a')
      link.href     = url
      link.download = 'TargetTeam_Card_1080.jpg'
      link.click()
      toast('✅ Card downloaded as JPEG (1080×1080)')
    }, 80)
  }

  function exportPDF() {
    const canvas = canvasRef.current
    if (!canvas) return
    setSelectedLayer(null)
    setTimeout(function() {
      drawCanvas()
      const url = canvas.toDataURL('image/jpeg', 0.95)
      const html = '<!DOCTYPE html><html><head><style>*{margin:0;padding:0}@page{size:8.5in 8.5in;margin:0}body{width:8.5in;height:8.5in;display:flex;align-items:center;justify-content:center}img{width:8.5in;height:8.5in;object-fit:contain}</style></head><body><img src="' + url + '" /></body></html>'
      const blob = new Blob([html], { type:'text/html' })
      const burl = URL.createObjectURL(blob)
      const win  = window.open(burl, '_blank')
      setTimeout(function() { win && win.print(); URL.revokeObjectURL(burl) }, 800)
      toast('📄 Print dialog opened — choose "Save as PDF"')
    }, 80)
  }

  async function saveTemplate() {
    if (!tplName.trim()) { toast('Enter a template name', '#F5A623'); return }
    setSaving(true)
    try {
      const canvas = canvasRef.current
      const thumb  = canvas ? canvas.toDataURL('image/jpeg', 0.4) : null
      await supabase.from('card_templates').insert({
        name:       tplName.trim(),
        card_type:  cardType,
        agent_name: agentName,
        bg_image:   bgSrc,
        layers:     JSON.stringify(layers),
        thumbnail:  thumb,
        created_by: agent ? agent.id : null,
        created_at: new Date().toISOString(),
      })
      toast('✅ Template "' + tplName + '" saved')
      setShowSave(false)
      setTplName('')
    } catch(e) { toast('Save failed — make sure the card_templates table exists in Supabase', '#DC2626') }
    finally { setSaving(false) }
  }

  const selLayer = layers.find(function(l) { return l.id === selectedLayer })

  return (
    <div style={{ display:'flex', gap:20, flexWrap:'wrap', alignItems:'flex-start' }}>

      {/* ── LEFT: Controls ── */}
      <div style={{ flex:'0 0 280px', display:'flex', flexDirection:'column', gap:12 }}>

        {/* Upload card */}
        <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:14 }}>
          <Lbl c="Upload Your Card Image" />
          <label style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'18px 14px',
            borderRadius:10, border:'2px dashed ' + (bgSrc ? '#10B981' : 'var(--border)'),
            cursor:'pointer', background:'var(--dim)', transition:'border-color .15s', textAlign:'center' }}
            onMouseEnter={function(e){if(!bgSrc)e.currentTarget.style.borderColor='#CC2200'}}
            onMouseLeave={function(e){if(!bgSrc)e.currentTarget.style.borderColor='var(--border)'}}>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display:'none' }} />
            <span style={{ fontSize:28 }}>{bgSrc ? '✅' : '📤'}</span>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{bgSrc ? 'Image loaded' : 'Click to upload card'}</div>
            <div style={{ fontSize:11, color:'var(--muted)' }}>JPG, PNG · up to 15MB</div>
          </label>
          {bgSrc && (
            <button onClick={function(){ setBgSrc(null); setBgImg(null); fileRef.current && (fileRef.current.value='') }}
              style={{ marginTop:8, width:'100%', padding:'6px', borderRadius:7, border:'1px solid #DC262444', background:'#FEF2F2', color:'#DC2626', fontSize:12, cursor:'pointer', fontFamily:ff }}>
              Remove image
            </button>
          )}
        </div>

        {/* Card type + listing */}
        <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:14 }}>
          <Lbl c="Card Type" />
          <select value={cardType} onChange={function(e){ setCardType(e.target.value) }}
            style={inp({ marginBottom:10 })}>
            {CARD_TYPES.map(function(ct){ return <option key={ct.id} value={ct.id}>{ct.emoji} {ct.label}</option> })}
          </select>
          <Lbl c="Pull from Listing" />
          <select value={listingId} onChange={function(e){ setListingId(e.target.value) }}
            style={inp({ marginBottom:6 })}>
            <option value="">— No listing / manual —</option>
            {listings.map(function(l){ return <option key={l.id} value={l.id}>{l.addr} · {fmt$(l.list_price)}</option> })}
          </select>
          {listingId && (function(){
            const l = listings.find(function(x){ return x.id === listingId })
            return l ? (
              <div style={{ padding:'8px 10px', background:'#EFF6FF', borderRadius:8, fontSize:11, color:'#1E40AF', lineHeight:1.5 }}>
                <strong>{l.addr}</strong><br/>
                {fmt$(l.list_price)}{l.beds ? '  ·  ' + l.beds + ' bd  ' + l.baths + ' ba' : ''}{l.sqft ? '  ·  ' + l.sqft + ' sqft' : ''}
              </div>
            ) : null
          })()}
        </div>

        {/* Selected layer editor */}
        <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:14 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <Lbl c="Edit Selected Layer" />
            <button onClick={addLayer}
              style={{ padding:'3px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--muted)', fontSize:11, cursor:'pointer', fontFamily:ff }}>
              + Add
            </button>
          </div>

          {/* Layer list */}
          <div style={{ display:'flex', flexDirection:'column', gap:3, marginBottom:10, maxHeight:140, overflowY:'auto' }}>
            {layers.map(function(l) {
              const active = selectedLayer === l.id
              return (
                <div key={l.id} onClick={function(){ setSelectedLayer(l.id) }}
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 8px', borderRadius:7, cursor:'pointer',
                    background: active ? 'rgba(204,34,0,.1)' : 'transparent',
                    border: '1px solid ' + (active ? '#CC2200' : 'transparent') }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background: l.color, flexShrink:0, border:'1px solid var(--border)' }} />
                  <span style={{ flex:1, fontSize:11, fontWeight: active ? 700 : 500, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {l.text || '(empty)'}
                  </span>
                  {!['status','address','price','details','agent','phone'].includes(l.id) && (
                    <button onClick={function(e){ e.stopPropagation(); deleteLayer(l.id) }}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'#DC2626', fontSize:14, padding:0 }}>×</button>
                  )}
                </div>
              )
            })}
          </div>

          {selLayer && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <div>
                <Lbl c="Text" />
                <textarea value={selLayer.text} rows={2}
                  onChange={function(e){ updateLayer(selLayer.id, { text: e.target.value }) }}
                  style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, resize:'none', boxSizing:'border-box' }} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <div>
                  <Lbl c="Size" />
                  <input type="number" min={10} max={200} value={selLayer.size}
                    onChange={function(e){ updateLayer(selLayer.id, { size: parseInt(e.target.value)||32 }) }}
                    style={inp()} />
                </div>
                <div>
                  <Lbl c="Color" />
                  <input type="color" value={selLayer.color.startsWith('rgba') ? '#ffffff' : selLayer.color}
                    onChange={function(e){ updateLayer(selLayer.id, { color: e.target.value }) }}
                    style={{ width:'100%', height:36, borderRadius:8, border:'1px solid var(--border)', cursor:'pointer', padding:2 }} />
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <div>
                  <Lbl c="X position" />
                  <input type="number" value={selLayer.x} onChange={function(e){ updateLayer(selLayer.id, { x: parseInt(e.target.value)||0 }) }} style={inp()} />
                </div>
                <div>
                  <Lbl c="Y position" />
                  <input type="number" value={selLayer.y} onChange={function(e){ updateLayer(selLayer.id, { y: parseInt(e.target.value)||0 }) }} style={inp()} />
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--text)', cursor:'pointer' }}>
                  <input type="checkbox" checked={!!selLayer.bold} onChange={function(e){ updateLayer(selLayer.id, { bold: e.target.checked }) }} />
                  Bold
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--text)', cursor:'pointer' }}>
                  <input type="checkbox" checked={!!selLayer.shadow} onChange={function(e){ updateLayer(selLayer.id, { shadow: e.target.checked }) }} />
                  Shadow
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--text)', cursor:'pointer' }}>
                  <input type="checkbox" checked={selLayer.align === 'right'} onChange={function(e){ updateLayer(selLayer.id, { align: e.target.checked ? 'right' : 'left' }) }} />
                  Right
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Agent name */}
        <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:14 }}>
          <Lbl c="Agent Name" />
          <input value={agentName} onChange={function(e){ setAgentName(e.target.value) }}
            placeholder="e.g. Mendy Jankovits" style={inp()} />
        </div>

        {/* Export + Save */}
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <button onClick={exportPNG}
              style={{ padding:'12px', borderRadius:9, background:'#CC2200', color:'#fff', border:'none', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:ff }}>
              ⬇ JPEG HD
            </button>
            <button onClick={exportPDF}
              style={{ padding:'12px', borderRadius:9, background:'#1B2B4B', color:'#fff', border:'none', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:ff }}>
              📄 PDF
            </button>
          </div>
          <button onClick={function(){ setShowSave(true) }}
            style={{ padding:'10px', borderRadius:9, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--text)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
            💾 Save as Template
          </button>
        </div>
      </div>

      {/* ── CENTER: Canvas ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:10, minWidth:0 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em' }}>
          Canvas — 1080 × 1080 · Drag text to reposition
        </div>
        <div style={{ position:'relative', boxShadow:'0 8px 40px rgba(0,0,0,.25)', borderRadius:12, overflow:'hidden' }}>
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            style={{ display:'block', width:DISPLAY_SIZE, height:DISPLAY_SIZE, cursor: dragging ? 'grabbing' : 'grab' }}
            onClick={onCanvasClick}
            onMouseDown={onCanvasMouseDown}
            onMouseMove={onCanvasMouseMove}
            onMouseUp={onCanvasMouseUp}
            onMouseLeave={onCanvasMouseUp}
          />
        </div>
        <div style={{ fontSize:11, color:'var(--muted)', textAlign:'center', lineHeight:1.5 }}>
          Click a text to select · Drag to move · Edit in the left panel · Export at full 1080px resolution
        </div>
      </div>

      {/* Save template modal */}
      {showSave && (
        <div onClick={function(e){ if(e.target===e.currentTarget) setShowSave(false) }}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20, fontFamily:ff }}>
          <div style={{ background:'var(--panel)', borderRadius:14, width:'100%', maxWidth:380, padding:24, boxShadow:'0 20px 50px rgba(0,0,0,.3)' }}>
            <div style={{ fontSize:16, fontWeight:800, color:'var(--text)', marginBottom:4 }}>Save as Template</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16, lineHeight:1.6 }}>
              Saves your card design including the background image and all text layers. Next time, load the template, pick a listing, and export instantly.
            </div>
            <Lbl c="Template Name" />
            <input value={tplName} onChange={function(e){ setTplName(e.target.value) }}
              placeholder="e.g. Coming Soon Dark Blue"
              onKeyDown={function(e){ if(e.key==='Enter') saveTemplate() }}
              autoFocus
              style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, boxSizing:'border-box', marginBottom:16 }} />
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={function(){ setShowSave(false) }}
                style={{ padding:'9px 16px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', cursor:'pointer', fontFamily:ff }}>Cancel</button>
              <button onClick={saveTemplate} disabled={saving}
                style={{ padding:'9px 20px', borderRadius:8, border:'none', background:'#CC2200', color:'#fff', cursor:'pointer', fontFamily:ff, fontWeight:700, opacity:saving?.7:1 }}>
                {saving ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── QUICK BUILDER (text-only preview, no canvas) ────────────────
function QuickBuilder({ listings }) {
  const { toast } = useApp()
  const { agent }  = useAuth()
  const canvasRef  = useRef(null)
  const [cardType,   setCardType]   = useState('coming')
  const [listingId,  setListingId]  = useState('')
  const [agentName,  setAgentName]  = useState(agent ? agent.name : '')
  const [ohDate,     setOhDate]     = useState('')
  const [ohTime,     setOhTime]     = useState('')
  const [customText, setCustomText] = useState('')
  const [bgFile,     setBgFile]     = useState(null)
  const [bgImg,      setBgImg]      = useState(null)

  useEffect(function(){ if(agent) setAgentName(agent.name) }, [agent])

  const listing = listings.find(function(l){ return l.id === listingId }) || null
  const ct      = CARD_TYPES.find(function(t){ return t.id === cardType }) || CARD_TYPES[0]

  function handleBg(e) {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = function(ev) {
      setBgFile(ev.target.result)
      const img = new Image(); img.onload = function(){ setBgImg(img) }; img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  }

  useEffect(function(){ drawQuick() }, [cardType, listing, agentName, ohDate, ohTime, customText, bgImg])

  function drawQuick() {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    const S = 1080
    ctx.clearRect(0,0,S,S)
    if (bgImg) {
      const sc = Math.max(S/bgImg.naturalWidth, S/bgImg.naturalHeight)
      const sw = bgImg.naturalWidth*sc, sh = bgImg.naturalHeight*sc
      ctx.drawImage(bgImg, (S-sw)/2, (S-sh)/2, sw, sh)
      const g = ctx.createLinearGradient(0,0,0,S); g.addColorStop(0,'rgba(0,0,0,.4)'); g.addColorStop(1,'rgba(0,0,0,.8)')
      ctx.fillStyle=g; ctx.fillRect(0,0,S,S)
    } else {
      const g = ctx.createLinearGradient(0,0,S,S); g.addColorStop(0,ct.color); g.addColorStop(1,'#0f1a2e')
      ctx.fillStyle=g; ctx.fillRect(0,0,S,S)
    }
    function text(t, x, y, size, bold, color, align) {
      ctx.save(); ctx.font=(bold?'800 ':'500 ')+size+'px '+ff; ctx.fillStyle=color; ctx.textBaseline='top'
      ctx.shadowColor='rgba(0,0,0,.6)'; ctx.shadowBlur=8; ctx.textAlign=align||'left'; ctx.fillText(t,x,y); ctx.restore()
    }
    text(ct.label, 60, 70, 56, true, '#fff')
    if (listing) {
      text(listing.addr, 60, 820, 36, true, '#fff')
      text(fmt$(listing.list_price), 60, 870, 46, true, '#fff')
      const det = [listing.beds&&listing.beds+' bd', listing.baths&&listing.baths+' ba', listing.sqft&&listing.sqft+' sqft'].filter(Boolean).join('  ·  ')
      if (det) text(det, 60, 924, 24, false, 'rgba(255,255,255,.8)')
    }
    if (cardType==='open_house'&&ohDate) text('Open House: '+ohDate+(ohTime?' at '+ohTime:''), 60, 960, 22, true, ct.color)
    if (customText) text(customText, 60, listing?950:820, 22, false, 'rgba(255,255,255,.85)')
    text((agentName||'Target Team')+'  ·  KW Valley Realty', 60, 1030, 18, false, 'rgba(255,255,255,.65)')
    text('845.424.1014  ·  @thetargetteam', 1020, 1030, 18, false, 'rgba(255,255,255,.65)', 'right')
  }

  function exportJPEG() {
    const url  = canvasRef.current.toDataURL('image/jpeg',0.95)
    const link = document.createElement('a'); link.href=url; link.download='TargetTeam_Card.jpg'; link.click()
    toast('✅ Downloaded!')
  }
  function exportPDF() {
    const url  = canvasRef.current.toDataURL('image/jpeg',0.95)
    const html = '<!DOCTYPE html><html><head><style>*{margin:0}@page{size:8.5in 8.5in;margin:0}body{width:8.5in;height:8.5in;display:flex;align-items:center;justify-content:center}img{width:8.5in;height:8.5in}</style></head><body><img src="'+url+'"/></body></html>'
    const b = new Blob([html],{type:'text/html'}), u=URL.createObjectURL(b), w=window.open(u,'_blank')
    setTimeout(function(){w&&w.print();URL.revokeObjectURL(u)},800)
    toast('📄 Print dialog opened')
  }

  return (
    <div style={{ display:'flex', gap:20, flexWrap:'wrap', alignItems:'flex-start' }}>
      <div style={{ flex:'0 0 280px', display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:14 }}>
          <Lbl c="Card Type" />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:12 }}>
            {CARD_TYPES.map(function(t){
              const a=cardType===t.id
              return <button key={t.id} onClick={function(){setCardType(t.id)}}
                style={{ padding:'8px 8px', borderRadius:8, border:'1.5px solid '+(a?t.color:'var(--border)'), background:a?t.color+'18':'transparent', color:a?t.color:'var(--text)', fontSize:11, fontWeight:a?800:500, cursor:'pointer', fontFamily:ff, display:'flex', alignItems:'center', gap:5 }}>
                <span>{t.emoji}</span>{t.label}
              </button>
            })}
          </div>
          <Lbl c="Select Listing" />
          <select value={listingId} onChange={function(e){setListingId(e.target.value)}} style={inp({ marginBottom:10 })}>
            <option value="">— No listing —</option>
            {listings.map(function(l){return <option key={l.id} value={l.id}>{l.addr} · {fmt$(l.list_price)}</option>})}
          </select>
          <Lbl c="Property Photo (optional)" />
          <label style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:8, border:'1.5px dashed var(--border)', cursor:'pointer', background:'var(--dim)', marginBottom:10 }}>
            <input type="file" accept="image/*" onChange={handleBg} style={{ display:'none' }} />
            <span style={{ fontSize:18 }}>{bgFile?'🖼':'📷'}</span>
            <span style={{ fontSize:12, color:'var(--muted)' }}>{bgFile?'Photo loaded ✓':'Upload photo'}</span>
          </label>
          <Lbl c="Agent Name" />
          <input value={agentName} onChange={function(e){setAgentName(e.target.value)}} style={inp({ marginBottom:10 })} />
          {cardType==='open_house' && <>
            <Lbl c="Open House Date" />
            <input type="date" value={ohDate} onChange={function(e){setOhDate(e.target.value)}} style={inp({ marginBottom:8 })} />
            <Lbl c="Time" />
            <input type="time" value={ohTime} onChange={function(e){setOhTime(e.target.value)}} style={inp({ marginBottom:10 })} />
          </>}
          <Lbl c="Custom Message" />
          <textarea value={customText} onChange={function(e){setCustomText(e.target.value)}} rows={2}
            style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, resize:'none', boxSizing:'border-box' }} />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <button onClick={exportJPEG} style={{ padding:'12px', borderRadius:9, background:'#CC2200', color:'#fff', border:'none', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:ff }}>⬇ JPEG HD</button>
          <button onClick={exportPDF}  style={{ padding:'12px', borderRadius:9, background:'#1B2B4B', color:'#fff', border:'none', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:ff }}>📄 PDF</button>
        </div>
      </div>
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em' }}>Preview · 1080×1080 export</div>
        <div style={{ boxShadow:'0 8px 40px rgba(0,0,0,.22)', borderRadius:12, overflow:'hidden' }}>
          <canvas ref={canvasRef} width={1080} height={1080} style={{ display:'block', width:500, height:500 }} />
        </div>
      </div>
    </div>
  )
}

// ── AI GENERATOR ─────────────────────────────────────────────────
function AITab({ listings }) {
  const { toast } = useApp()
  const { agent }  = useAuth()
  const canvasRef  = useRef(null)
  const [cardType,   setCardType]   = useState('coming')
  const [listingId,  setListingId]  = useState('')
  const [extraNote,  setExtraNote]  = useState('')
  const [generating, setGenerating] = useState(false)
  const [result,     setResult]     = useState(null)
  const [bgImg,      setBgImg]      = useState(null)
  const [agentName,  setAgentName]  = useState(agent ? agent.name : '')

  useEffect(function(){ if(agent) setAgentName(agent.name) }, [agent])

  const listing = listings.find(function(l){ return l.id === listingId }) || null
  const ct      = CARD_TYPES.find(function(t){ return t.id === cardType }) || CARD_TYPES[0]

  function handleBg(e) {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = function(ev) { const img=new Image(); img.onload=function(){setBgImg(img)}; img.src=ev.target.result }
    reader.readAsDataURL(file)
  }

  useEffect(function(){ drawAI() }, [cardType, listing, result, bgImg, agentName])

  function drawAI() {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'), S = 1080
    ctx.clearRect(0,0,S,S)
    if (bgImg) {
      const sc=Math.max(S/bgImg.naturalWidth,S/bgImg.naturalHeight), sw=bgImg.naturalWidth*sc, sh=bgImg.naturalHeight*sc
      ctx.drawImage(bgImg,(S-sw)/2,(S-sh)/2,sw,sh)
      const g=ctx.createLinearGradient(0,0,0,S); g.addColorStop(0,'rgba(0,0,0,.4)'); g.addColorStop(1,'rgba(0,0,0,.8)')
      ctx.fillStyle=g; ctx.fillRect(0,0,S,S)
    } else {
      const g=ctx.createLinearGradient(0,0,S,S); g.addColorStop(0,ct.color); g.addColorStop(1,'#0f1a2e')
      ctx.fillStyle=g; ctx.fillRect(0,0,S,S)
    }
    function t(txt, x, y, size, bold, color, align) {
      if (!txt) return
      ctx.save(); ctx.font=(bold?'800 ':'500 ')+size+'px '+ff; ctx.fillStyle=color; ctx.textBaseline='top'
      ctx.shadowColor='rgba(0,0,0,.5)'; ctx.shadowBlur=8; ctx.textAlign=align||'left'; ctx.fillText(txt,x,y); ctx.restore()
    }
    t(result ? result.headline : ct.label, 60, 70, result?48:56, true, '#fff')
    if (result && result.tagline) t(result.tagline, 60, 140, 28, false, 'rgba(255,255,255,.9)')
    if (listing) {
      t(listing.addr, 60, 820, 34, true, '#fff')
      t(fmt$(listing.list_price), 60, 870, 44, true, '#fff')
      const det=[listing.beds&&listing.beds+' bd',listing.baths&&listing.baths+' ba',listing.sqft&&listing.sqft+' sqft'].filter(Boolean).join('  ·  ')
      if (det) t(det, 60, 924, 22, false, 'rgba(255,255,255,.8)')
    }
    if (result && result.cta) t(result.cta, 60, listing?960:820, 26, true, ct.color)
    t((agentName||'Target Team')+'  ·  KW Valley Realty', 60, 1030, 18, false, 'rgba(255,255,255,.6)')
    t('845.424.1014  ·  @thetargetteam', 1020, 1030, 18, false, 'rgba(255,255,255,.6)', 'right')
  }

  async function generate() {
    setGenerating(true); setResult(null)
    try {
      const listCtx = listing
        ? listing.addr+', '+fmt$(listing.list_price)+', '+(listing.beds||'?')+' bed '+(listing.baths||'?')+' bath'+(listing.sqft?', '+listing.sqft+' sqft':'')+'. '+(listing.description||'')
        : 'Property in Rockland County NY'
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          model:'claude-sonnet-4-6', max_tokens:400,
          system:'You are a real estate social media copywriter for Target Team at KW Valley Realty in Rockland County, NY. Write punchy professional card copy. Respond ONLY with a raw JSON object (no markdown, no backticks): { "headline": "MAX 8 WORDS ALL CAPS", "tagline": "max 16 words", "cta": "max 5 words", "caption": "1-2 sentence post caption" }',
          messages:[{ role:'user', content:'Card type: '+ct.label+'\nListing: '+listCtx+(extraNote?'\nExtra: '+extraNote:'')+'\n\nWrite the card copy.' }]
        })
      })
      const data = await res.json()
      const txt  = (data.content||[]).map(function(c){return c.text||''}).join('').replace(/```json|```/g,'').trim()
      setResult(JSON.parse(txt))
      toast('✅ AI copy generated!')
    } catch(e) { toast('AI generation failed: '+e.message, '#DC2626') }
    finally { setGenerating(false) }
  }

  function exportJPEG() {
    const url=canvasRef.current.toDataURL('image/jpeg',0.95), a=document.createElement('a')
    a.href=url; a.download='AI_Card.jpg'; a.click(); toast('✅ Downloaded!')
  }
  function exportPDF() {
    const url=canvasRef.current.toDataURL('image/jpeg',0.95)
    const html='<!DOCTYPE html><html><head><style>*{margin:0}@page{size:8.5in 8.5in;margin:0}body{display:flex;align-items:center;justify-content:center;width:8.5in;height:8.5in}img{width:8.5in;height:8.5in}</style></head><body><img src="'+url+'"/></body></html>'
    const b=new Blob([html],{type:'text/html'}),u=URL.createObjectURL(b),w=window.open(u,'_blank')
    setTimeout(function(){w&&w.print();URL.revokeObjectURL(u)},800); toast('📄 Print dialog opened')
  }

  return (
    <div style={{ display:'flex', gap:20, flexWrap:'wrap', alignItems:'flex-start' }}>
      <div style={{ flex:'0 0 280px', display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:14 }}>
          <div style={{ fontSize:14, fontWeight:800, color:'var(--text)', marginBottom:12 }}>🤖 AI Card Copy</div>
          <Lbl c="Card Type" />
          <select value={cardType} onChange={function(e){setCardType(e.target.value)}} style={inp({ marginBottom:10 })}>
            {CARD_TYPES.map(function(t){return <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>})}
          </select>
          <Lbl c="Listing" />
          <select value={listingId} onChange={function(e){setListingId(e.target.value)}} style={inp({ marginBottom:10 })}>
            <option value="">— Select listing —</option>
            {listings.map(function(l){return <option key={l.id} value={l.id}>{l.addr} · {fmt$(l.list_price)}</option>})}
          </select>
          <Lbl c="Property Photo (optional)" />
          <label style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:8, border:'1.5px dashed var(--border)', cursor:'pointer', background:'var(--dim)', marginBottom:10 }}>
            <input type="file" accept="image/*" onChange={handleBg} style={{ display:'none' }} />
            <span style={{ fontSize:18 }}>{bgImg?'🖼':'📷'}</span>
            <span style={{ fontSize:12, color:'var(--muted)' }}>{bgImg?'Photo loaded ✓':'Upload property photo'}</span>
          </label>
          <Lbl c="Extra Notes (optional)" />
          <textarea value={extraNote} onChange={function(e){setExtraNote(e.target.value)}} rows={2}
            placeholder="e.g. Emphasize the large backyard and pool..."
            style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, resize:'none', boxSizing:'border-box', marginBottom:12 }} />
          <button onClick={generate} disabled={generating}
            style={{ width:'100%', padding:'12px', borderRadius:9, border:'none', background:generating?'#94A3B8':'linear-gradient(135deg,#CC2200,#8B5CF6)', color:'#fff', fontSize:14, fontWeight:800, cursor:generating?'default':'pointer', fontFamily:ff }}>
            {generating?'⏳ Generating...':'✨ Generate Copy'}
          </button>
        </div>
        {result && (
          <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid #10B981', padding:14 }}>
            <div style={{ fontSize:12, fontWeight:800, color:'#10B981', marginBottom:10 }}>✅ Generated</div>
            {[['Headline',result.headline],['Tagline',result.tagline],['CTA',result.cta],['Caption',result.caption]].filter(function(r){return r[1]}).map(function(r){
              return <div key={r[0]} style={{ marginBottom:8 }}>
                <div style={{ fontSize:9, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:2 }}>{r[0]}</div>
                <div style={{ fontSize:12, color:'var(--text)', padding:'5px 8px', background:'var(--dim)', borderRadius:6, lineHeight:1.4 }}>{r[1]}</div>
              </div>
            })}
            {result.caption && <button onClick={function(){navigator.clipboard.writeText(result.caption);toast('Copied!')}} style={{ width:'100%', padding:'6px', borderRadius:7, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', fontSize:11, cursor:'pointer', fontFamily:ff }}>📋 Copy caption</button>}
          </div>
        )}
        {result && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <button onClick={exportJPEG} style={{ padding:'12px', borderRadius:9, background:'#CC2200', color:'#fff', border:'none', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:ff }}>⬇ JPEG HD</button>
            <button onClick={exportPDF}  style={{ padding:'12px', borderRadius:9, background:'#1B2B4B', color:'#fff', border:'none', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:ff }}>📄 PDF</button>
          </div>
        )}
      </div>
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em' }}>Preview</div>
        <div style={{ boxShadow:'0 8px 40px rgba(0,0,0,.22)', borderRadius:12, overflow:'hidden' }}>
          <canvas ref={canvasRef} width={1080} height={1080} style={{ display:'block', width:500, height:500 }} />
        </div>
      </div>
    </div>
  )
}

// ── MY TEMPLATES ─────────────────────────────────────────────────
function TemplatesTab({ listings }) {
  const { toast }  = useApp()
  const canvasRef  = useRef(null)
  const [templates,  setTemplates]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [selected,   setSelected]   = useState(null)
  const [listingId,  setListingId]  = useState('')

  useEffect(function(){ load() }, [])

  async function load() {
    setLoading(true)
    try { const { data } = await supabase.from('card_templates').select('*').order('created_at',{ascending:false}); setTemplates(data||[]) }
    catch(e) { setTemplates([]) }
    finally { setLoading(false) }
  }

  async function del(id) {
    if (!window.confirm('Delete this template?')) return
    await supabase.from('card_templates').delete().eq('id',id).catch(function(){})
    setTemplates(function(p){return p.filter(function(t){return t.id!==id})})
    if(selected&&selected.id===id) setSelected(null)
    toast('Template deleted')
  }

  const listing = listings.find(function(l){return l.id===listingId}) || null

  useEffect(function(){ if(selected) drawTemplate() }, [selected, listing])

  function drawTemplate() {
    const canvas = canvasRef.current; if (!canvas || !selected) return
    const ctx = canvas.getContext('2d'), S = 1080
    ctx.clearRect(0,0,S,S)
    const layers = selected.layers ? JSON.parse(selected.layers) : []
    const ct = CARD_TYPES.find(function(t){return t.id===selected.card_type}) || CARD_TYPES[0]

    function drawBg(imgSrc) {
      if (imgSrc) {
        const img=new Image(); img.onload=function(){
          const sc=Math.max(S/img.naturalWidth,S/img.naturalHeight), sw=img.naturalWidth*sc, sh=img.naturalHeight*sc
          ctx.drawImage(img,(S-sw)/2,(S-sh)/2,sw,sh)
          const g=ctx.createLinearGradient(0,0,0,S); g.addColorStop(0,'rgba(0,0,0,.4)'); g.addColorStop(1,'rgba(0,0,0,.8)')
          ctx.fillStyle=g; ctx.fillRect(0,0,S,S)
          drawLayers()
        }; img.src=imgSrc
      } else {
        const g=ctx.createLinearGradient(0,0,S,S); g.addColorStop(0,ct.color); g.addColorStop(1,'#0f1a2e')
        ctx.fillStyle=g; ctx.fillRect(0,0,S,S)
        drawLayers()
      }
    }

    function drawLayers() {
      // Auto-fill from listing if selected
      const effectiveLayers = listing ? layers.map(function(l) {
        if (l.id==='status')  return Object.assign({},l,{text:ct.label})
        if (l.id==='address') return Object.assign({},l,{text:listing.addr||''})
        if (l.id==='price')   return Object.assign({},l,{text:fmt$(listing.list_price)})
        if (l.id==='details') {
          const p=[listing.beds&&listing.beds+' bd',listing.baths&&listing.baths+' ba',listing.sqft&&listing.sqft+' sqft'].filter(Boolean)
          return Object.assign({},l,{text:p.join('  ·  ')})
        }
        if (l.id==='agent')   return Object.assign({},l,{text:(selected.agent_name||'Target Team')+'  ·  KW Valley Realty'})
        return l
      }) : layers

      effectiveLayers.forEach(function(layer) {
        if (!layer.text) return
        ctx.save()
        ctx.font=(layer.bold?'800 ':'500 ')+layer.size+'px '+ff
        ctx.fillStyle=layer.color; ctx.textBaseline='top'
        if(layer.shadow){ctx.shadowColor='rgba(0,0,0,.6)';ctx.shadowBlur=8;ctx.shadowOffsetX=2;ctx.shadowOffsetY=2}
        ctx.textAlign=layer.align||'left'; ctx.fillText(layer.text,layer.x,layer.y); ctx.restore()
      })
    }

    drawBg(selected.bg_image)
  }

  function exportJPEG() {
    const url=canvasRef.current.toDataURL('image/jpeg',0.95), a=document.createElement('a')
    a.href=url; a.download='TargetTeam_Card.jpg'; a.click(); toast('✅ Downloaded!')
  }
  function exportPDF() {
    const url=canvasRef.current.toDataURL('image/jpeg',0.95)
    const html='<!DOCTYPE html><html><head><style>*{margin:0}@page{size:8.5in 8.5in;margin:0}body{display:flex;align-items:center;justify-content:center;width:8.5in;height:8.5in}img{width:8.5in;height:8.5in}</style></head><body><img src="'+url+'"/></body></html>'
    const b=new Blob([html],{type:'text/html'}),u=URL.createObjectURL(b),w=window.open(u,'_blank')
    setTimeout(function(){w&&w.print();URL.revokeObjectURL(u)},800); toast('📄 Print dialog opened')
  }

  return (
    <div style={{ display:'flex', gap:20, flexWrap:'wrap', alignItems:'flex-start' }}>
      <div style={{ flex:'0 0 260px' }}>
        <div style={{ fontSize:14, fontWeight:800, color:'var(--text)', marginBottom:12 }}>Saved Templates ({templates.length})</div>
        {loading ? (
          <div style={{ textAlign:'center', padding:32, color:'var(--muted)' }}>Loading...</div>
        ) : templates.length === 0 ? (
          <div style={{ textAlign:'center', padding:32, color:'var(--muted)', fontSize:13, lineHeight:1.7 }}>
            <div style={{ fontSize:32, marginBottom:8 }}>📁</div>
            No templates yet. Build a card in the Card Editor and save it as a template.
          </div>
        ) : templates.map(function(tpl) {
          const isActive = selected && selected.id === tpl.id
          const tct = CARD_TYPES.find(function(t){return t.id===tpl.card_type}) || CARD_TYPES[0]
          return (
            <div key={tpl.id} style={{ borderRadius:10, border:'1.5px solid '+(isActive?'#CC2200':'var(--border)'), background:isActive?'rgba(204,34,0,.04)':'var(--panel)', marginBottom:8, overflow:'hidden', transition:'all .15s' }}>
              <div onClick={function(){setSelected(tpl);setListingId('')}} style={{ padding:'12px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:10 }}>
                {tpl.thumbnail
                  ? <img src={tpl.thumbnail} alt="" style={{ width:44, height:44, borderRadius:8, objectFit:'cover', flexShrink:0 }} />
                  : <div style={{ width:44, height:44, borderRadius:8, background:tct.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>{tct.emoji}</div>
                }
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tpl.name}</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>{tct.emoji} {tct.label}</div>
                </div>
                <button onClick={function(e){e.stopPropagation();del(tpl.id)}} style={{ background:'none', border:'none', cursor:'pointer', color:'#DC2626', fontSize:18, padding:4 }}>×</button>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ flex:1, minWidth:0 }}>
        {selected ? (
          <div>
            <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:14, marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:800, color:'var(--text)', marginBottom:10 }}>Update with a Listing</div>
              <select value={listingId} onChange={function(e){setListingId(e.target.value)}} style={inp({ marginBottom:0 })}>
                <option value="">— Select listing to auto-fill —</option>
                {listings.map(function(l){return <option key={l.id} value={l.id}>{l.addr} · {fmt$(l.list_price)} · {l.status||''}</option>})}
              </select>
              {listing && (
                <div style={{ marginTop:8, padding:'8px 10px', background:'#EFF6FF', borderRadius:7, fontSize:11, color:'#1E40AF', lineHeight:1.5 }}>
                  <strong>{listing.addr}</strong>  ·  {fmt$(listing.list_price)}{listing.beds?'  ·  '+listing.beds+' bd '+listing.baths+' ba':''}
                </div>
              )}
            </div>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
              <div style={{ boxShadow:'0 8px 40px rgba(0,0,0,.22)', borderRadius:12, overflow:'hidden' }}>
                <canvas ref={canvasRef} width={1080} height={1080} style={{ display:'block', width:500, height:500 }} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, width:'100%', maxWidth:500 }}>
                <button onClick={exportJPEG} style={{ padding:'12px', borderRadius:9, background:'#CC2200', color:'#fff', border:'none', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:ff }}>⬇ JPEG HD</button>
                <button onClick={exportPDF}  style={{ padding:'12px', borderRadius:9, background:'#1B2B4B', color:'#fff', border:'none', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:ff }}>📄 PDF</button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:300, color:'var(--muted)', fontSize:13, textAlign:'center' }}>
            Select a template on the left to preview and export
          </div>
        )}
      </div>
    </div>
  )
}

// ── CANVA / ADOBE TABS ────────────────────────────────────────────
function CanvaTab({ listings }) {
  const [lid, setLid] = useState('')
  const l = listings.find(function(x){return x.id===lid}) || null
  const ITEMS = [
    {name:'Just Listed',url:'https://www.canva.com/create/instagram-posts/?q=just+listed+real+estate'},
    {name:'Coming Soon',url:'https://www.canva.com/create/instagram-posts/?q=coming+soon+real+estate'},
    {name:'Open House', url:'https://www.canva.com/create/instagram-posts/?q=open+house+real+estate'},
    {name:'Just Sold',  url:'https://www.canva.com/create/instagram-posts/?q=sold+real+estate'},
    {name:'Price Drop', url:'https://www.canva.com/create/instagram-posts/?q=price+reduced+real+estate'},
    {name:'Story',      url:'https://www.canva.com/create/instagram-stories/?q=real+estate'},
    {name:'Facebook',   url:'https://www.canva.com/create/facebook-posts/?q=real+estate'},
    {name:'Flyer',      url:'https://www.canva.com/create/flyers/?q=real+estate+flyer'},
  ]
  function go(url) {
    window.open(url,'_blank')
    if(l) navigator.clipboard.writeText(l.addr+' · '+fmt$(l.list_price)+(l.beds?' · '+l.beds+' bd '+l.baths+' ba':'')).catch(function(){})
  }
  return (
    <div>
      <div style={{background:'linear-gradient(135deg,#8B3DFF,#6320EE)',borderRadius:14,padding:'22px 26px',marginBottom:20,color:'#fff'}}>
        <div style={{fontSize:20,fontWeight:900,marginBottom:4}}>Canva</div>
        <div style={{fontSize:13,opacity:.85,marginBottom:14,lineHeight:1.5}}>Select a listing below, then open a template. Listing details auto-copy to your clipboard.</div>
        <a href="https://www.canva.com/real-estate/" target="_blank" rel="noopener noreferrer" style={{display:'inline-block',background:'#fff',color:'#8B3DFF',padding:'8px 18px',borderRadius:8,fontSize:13,fontWeight:800,textDecoration:'none'}}>Browse All Templates</a>
      </div>
      <div style={{background:'var(--panel)',borderRadius:10,border:'1px solid var(--border)',padding:12,marginBottom:14}}>
        <Lbl c="Auto-copy listing details" />
        <select value={lid} onChange={function(e){setLid(e.target.value)}} style={inp({marginBottom:0})}>
          <option value="">— No listing —</option>
          {listings.map(function(l){return <option key={l.id} value={l.id}>{l.addr} · {fmt$(l.list_price)}</option>})}
        </select>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:8}}>
        {ITEMS.map(function(t){
          return <button key={t.name} onClick={function(){go(t.url)}}
            style={{display:'flex',alignItems:'center',gap:10,padding:'13px 14px',background:'var(--panel)',borderRadius:10,border:'1px solid var(--border)',cursor:'pointer',fontFamily:ff,textAlign:'left',transition:'all .15s'}}
            onMouseEnter={function(e){e.currentTarget.style.borderColor='#8B3DFF';e.currentTarget.style.background='#8B3DFF08'}}
            onMouseLeave={function(e){e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.background='var(--panel)'}}>
            <div style={{width:30,height:30,borderRadius:7,background:'#8B3DFF',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:'#fff',fontWeight:800,fontSize:12}}>C</div>
            <span style={{fontSize:12,fontWeight:600,color:'var(--text)'}}>{t.name}</span>
          </button>
        })}
      </div>
    </div>
  )
}

function AdobeTab({ listings }) {
  const [lid, setLid] = useState('')
  const l = listings.find(function(x){return x.id===lid}) || null
  const ITEMS = [
    {name:'Instagram Post', url:'https://new.express.adobe.com/new?category=instagram'},
    {name:'Instagram Story',url:'https://new.express.adobe.com/new?category=instagram-story'},
    {name:'Facebook Post',  url:'https://new.express.adobe.com/new?category=facebook'},
    {name:'Listing Flyer',  url:'https://new.express.adobe.com/new?category=flyer'},
    {name:'Open House',     url:'https://new.express.adobe.com/new?category=flyer'},
    {name:'Social Ad',      url:'https://new.express.adobe.com/new?category=ads'},
  ]
  function go(url) {
    window.open(url,'_blank')
    if(l) navigator.clipboard.writeText(l.addr+' · '+fmt$(l.list_price)+(l.beds?' · '+l.beds+' bd '+l.baths+' ba':'')).catch(function(){})
  }
  return (
    <div>
      <div style={{background:'linear-gradient(135deg,#FF0000,#CC0000)',borderRadius:14,padding:'22px 26px',marginBottom:20,color:'#fff'}}>
        <div style={{fontSize:20,fontWeight:900,marginBottom:4}}>Adobe Express</div>
        <div style={{fontSize:13,opacity:.85,marginBottom:14,lineHeight:1.5}}>Select a listing then open Adobe Express. Details auto-copy to clipboard.</div>
        <a href="https://new.express.adobe.com/" target="_blank" rel="noopener noreferrer" style={{display:'inline-block',background:'#fff',color:'#FF0000',padding:'8px 18px',borderRadius:8,fontSize:13,fontWeight:800,textDecoration:'none'}}>Open Adobe Express</a>
      </div>
      <div style={{background:'var(--panel)',borderRadius:10,border:'1px solid var(--border)',padding:12,marginBottom:14}}>
        <Lbl c="Auto-copy listing details" />
        <select value={lid} onChange={function(e){setLid(e.target.value)}} style={inp({marginBottom:0})}>
          <option value="">— No listing —</option>
          {listings.map(function(l){return <option key={l.id} value={l.id}>{l.addr} · {fmt$(l.list_price)}</option>})}
        </select>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:8}}>
        {ITEMS.map(function(t){
          return <button key={t.name} onClick={function(){go(t.url)}}
            style={{display:'flex',alignItems:'center',gap:10,padding:'13px 14px',background:'var(--panel)',borderRadius:10,border:'1px solid var(--border)',cursor:'pointer',fontFamily:ff,textAlign:'left',transition:'all .15s'}}
            onMouseEnter={function(e){e.currentTarget.style.borderColor='#FF0000';e.currentTarget.style.background='#FF000008'}}
            onMouseLeave={function(e){e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.background='var(--panel)'}}>
            <div style={{width:30,height:30,borderRadius:7,background:'#FF0000',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:'#fff',fontWeight:900,fontSize:11}}>Ae</div>
            <span style={{fontSize:12,fontWeight:600,color:'var(--text)'}}>{t.name}</span>
          </button>
        })}
      </div>
    </div>
  )
}

// ── MAIN PAGE ─────────────────────────────────────────────────────
export function SocialCards() {
  const [tab, setTab]  = useState('editor')
  const { listings }   = useListings()
  const safe           = listings || []

  return (
    <div style={{ fontFamily:ff }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:22, fontWeight:900, color:'var(--text)' }}>🎨 Card Generator</div>
        <div style={{ fontSize:13, color:'var(--muted)', marginTop:3 }}>Upload a card · edit text · auto-fill listing · export 1080px JPEG or PDF</div>
      </div>
      <div style={{ display:'flex', borderBottom:'2px solid var(--border)', marginBottom:24, gap:0, overflowX:'auto' }}>
        {TABS.map(function(t) {
          const a = tab === t.id
          return (
            <button key={t.id} onClick={function(){setTab(t.id)}}
              style={{ padding:'9px 18px', border:'none', background:'none', cursor:'pointer',
                borderBottom: a?'2px solid #CC2200':'2px solid transparent', marginBottom:'-2px',
                fontSize:13, fontWeight:a?700:500, color:a?'#CC2200':'var(--muted)', fontFamily:ff, whiteSpace:'nowrap' }}>
              {t.label}
            </button>
          )
        })}
      </div>
      {tab === 'editor'    && <CardEditor    listings={safe} />}
      {tab === 'builder'   && <QuickBuilder  listings={safe} />}
      {tab === 'ai'        && <AITab         listings={safe} />}
      {tab === 'templates' && <TemplatesTab  listings={safe} />}
      {tab === 'canva'     && <CanvaTab      listings={safe} />}
      {tab === 'adobe'     && <AdobeTab      listings={safe} />}
    </div>
  )
}
