// TargetOS V2 — Social Card Generator
// Template-based: upload your exact card design, define photo zone,
// select listing → photo + address auto-inject. Export HD JPEG/PDF.
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useListings, useDeals } from '../lib/hooks'
import { useApp }   from '../context/AppContext'
import { useAuth }  from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const ff = 'Inter, system-ui, -apple-system, sans-serif'
const CS = 1080  // canvas size
const DS = 520   // display size

// ── CARD TYPES matching your actual cards ────────────────────────
const CARD_TYPES = [
  {
    id:'for_sale', label:'For Sale', sub:'',
    color:'#10B981', bgColor:'#FFFFFF',
    bannerText:'FOR\nSALE',
    defaultLayers:[
      { id:'address', text:'', x:540, y:862, size:36, color:'#1B2B4B', bold:true, align:'center', shadow:false },
    ]
  },
  {
    id:'uc_listing', label:'Under Contract', sub:'Listing side',
    color:'#CC2200', bgColor:'#FFFFFF',
    bannerText:'LISTING\nUNDER CONTRACT',
    defaultLayers:[
      { id:'address', text:'', x:540, y:862, size:36, color:'#1B2B4B', bold:true, align:'center', shadow:false },
    ]
  },
  {
    id:'uc_buyer', label:'Under Contract', sub:'Buyer side',
    color:'#CC2200', bgColor:'#FFFFFF',
    bannerText:'UNDER\nCONTRACT',
    defaultLayers:[
      { id:'address', text:'', x:540, y:862, size:36, color:'#1B2B4B', bold:true, align:'center', shadow:false },
    ]
  },
  {
    id:'sold_listing', label:'Just Sold', sub:'Listing side',
    color:'#1B2B4B', bgColor:'#FFFFFF',
    bannerText:'LISTING\nSOLD',
    defaultLayers:[
      { id:'address', text:'', x:540, y:862, size:36, color:'#1B2B4B', bold:true, align:'center', shadow:false },
    ]
  },
  {
    id:'sold_buyer', label:'Just Sold', sub:'Buyer side',
    color:'#1B2B4B', bgColor:'#FFFFFF',
    bannerText:'SOLD',
    defaultLayers:[
      { id:'address', text:'', x:540, y:862, size:36, color:'#1B2B4B', bold:true, align:'center', shadow:false },
    ]
  },
  {
    id:'coming',    label:'Coming Soon',  sub:'',
    color:'#1B2B4B', bgColor:'#FFFFFF',
    bannerText:'COMING\nSOON',
    defaultLayers:[
      { id:'address', text:'', x:540, y:862, size:36, color:'#1B2B4B', bold:true, align:'center', shadow:false },
    ]
  },
  {
    id:'active',    label:'Just Listed',  sub:'',
    color:'#10B981', bgColor:'#FFFFFF',
    bannerText:'JUST\nLISTED',
    defaultLayers:[
      { id:'address', text:'', x:540, y:862, size:36, color:'#1B2B4B', bold:true, align:'center', shadow:false },
    ]
  },
  {
    id:'open_house', label:'Open House',  sub:'',
    color:'#0EA5E9', bgColor:'#FFFFFF',
    bannerText:'OPEN\nHOUSE',
    defaultLayers:[
      { id:'address', text:'', x:540, y:862, size:36, color:'#1B2B4B', bold:true, align:'center', shadow:false },
    ]
  },
]

function fmt$(n) { return n ? '$' + Number(n).toLocaleString() : '' }

const TABS = [
  { id:'smart',     label:'⚡ Smart Cards' },
  { id:'editor',    label:'🖼 Custom Editor' },
  { id:'templates', label:'📁 Templates' },
  { id:'canva',     label:'Canva' },
  { id:'adobe',     label:'Adobe Express' },
]

// ── SMART CARD ENGINE ────────────────────────────────────────────
// Upload your exact card template → define where photo goes →
// select listing → photo + address auto-inject → export
function SmartCards({ listings, deals }) {
  const { toast } = useApp()
  const canvasRef   = useRef(null)
  const tplFileRef  = useRef(null)
  const propFileRef = useRef(null)

  // Template state
  const [templates,   setTemplates]   = useState([])   // saved templates
  const [selTpl,      setSelTpl]      = useState(null)  // active template object
  const [tplImg,      setTplImg]      = useState(null)  // template Image object
  const [tplSrc,      setTplSrc]      = useState(null)  // template data URL
  const [tplName,     setTplName]     = useState('')
  const [cardType,    setCardType]    = useState('uc_listing')
  const [showSaveTpl, setShowSaveTpl] = useState(false)
  const [saving,      setSaving]      = useState(false)

  // Photo zone — a rectangle drawn over the template where the property photo goes
  // { x, y, w, h } in canvas coords (0-1080)
  const [photoZone,   setPhotoZone]   = useState({ x:40, y:280, w:1000, h:520 })
  const [definingZone,setDefiningZone]= useState(false)
  const [zoneStart,   setZoneStart]   = useState(null)

  // Address layer position
  const [addrLayer, setAddrLayer] = useState({ x:540, y:862, size:36, color:'#1B2B4B', bold:true, align:'center' })
  const [definingAddr, setDefiningAddr] = useState(false)
  const [pin,         setPin]         = useState(null)   // {x,y} canvas coords — unit pin for condos/developments
  const [pinLabel,    setPinLabel]    = useState('')
  const [definingPin, setDefiningPin] = useState(false)

  // For Sale cards: price + beds/baths text layers, click-positioned
  // like the address. 'enabled' lets a template opt out of either.
  const [priceLayer,   setPriceLayer]   = useState({ x:540, y:930, size:44, color:'#10B981', bold:true, align:'center', enabled:true })
  const [detailsLayer, setDetailsLayer] = useState({ x:540, y:985, size:26, color:'#1B2B4B', bold:false, align:'center', enabled:true })
  const [definingPrice,   setDefiningPrice]   = useState(false)
  const [definingDetails, setDefiningDetails] = useState(false)

  // Listing selection
  const [source,      setSource]      = useState('listing')  // 'listing' | 'deal'
  const [listingId,   setListingId]   = useState('')
  const [dealId,      setDealId]      = useState('')
  const [propImg,     setPropImg]      = useState(null)  // property Image object
  const [propSrc,     setPropSrc]      = useState(null)

  const listing = listings.find(l => l.id === listingId) || null
  const deal    = deals.find(d => d.id === dealId) || null
  const record  = listing || deal
  const address = record ? (record.addr || '') : ''
  const priceText   = record?.list_price ? '$' + Number(record.list_price).toLocaleString() : ''
  const detailsText = record ? [record.beds && record.beds + ' Bed', record.baths && record.baths + ' Bath', record.sqft && Number(record.sqft).toLocaleString() + ' SqFt'].filter(Boolean).join('  ·  ') : ''

  // Price/details default ON for For Sale cards, OFF otherwise
  // (loading a saved template overrides this right after)
  useEffect(function() {
    setPriceLayer(p => ({ ...p, enabled: cardType === 'for_sale' }))
    setDetailsLayer(p => ({ ...p, enabled: cardType === 'for_sale' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardType])

  // Load saved templates
  useEffect(function() {
    supabase.from('card_templates').select('*').order('created_at',{ascending:false})
      .then(function(r) { setTemplates(r.data || []) })
      .catch(function() {})
  }, [])

  // Redraw whenever anything changes
  useEffect(function() { draw() }, [tplImg, propImg, photoZone, addrLayer, priceLayer, detailsLayer, eraseZones, address, priceText, detailsText, cardType, pin, pinLabel])

  // AUTO-IMPORT: selecting a listing pulls its saved photo into the
  // photo zone automatically (manual upload still available and wins).
  useEffect(function() {
    const url = listing?.photo_url
    if (!url) return
    const img = new Image()
    img.crossOrigin = 'anonymous'   // keep canvas exportable
    img.onload  = function() { setPropImg(img); setPropSrc(url) }
    img.onerror = function() { /* keep whatever is there */ }
    img.src = url
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId])

  function draw() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, CS, CS)

    if (tplImg) {
      // Draw the full template card as-is
      ctx.drawImage(tplImg, 0, 0, CS, CS)

      // Composite the property photo into the photo zone
      if (propImg && photoZone) {
        const { x, y, w, h } = photoZone
        ctx.save()
        ctx.beginPath()
        ctx.rect(x, y, w, h)
        ctx.clip()
        // Cover-fit the property photo into the zone
        const iw = propImg.naturalWidth, ih = propImg.naturalHeight
        const scale = Math.max(w / iw, h / ih)
        const sw = iw * scale, sh = ih * scale
        const ox = x + (w - sw) / 2, oy = y + (h - sh) / 2
        ctx.drawImage(propImg, ox, oy, sw, sh)
        ctx.restore()
      }

      // Cover the ORIGINAL example text with sampled background color
      // (only once we have real data to draw instead)
      if (eraseZones.length && (address || priceText || detailsText)) {
        eraseZones.forEach(z => {
          ctx.save()
          ctx.fillStyle = z.color || '#FFFFFF'
          ctx.fillRect(z.x - 4, z.y - 4, z.w + 8, z.h + 8)
          ctx.restore()
        })
      }

      // Draw the address text
      if (address) {
        const al = addrLayer
        ctx.save()
        ctx.font = (al.bold ? '800 ' : '500 ') + al.size + 'px Georgia, serif'
        ctx.fillStyle = al.color
        ctx.textBaseline = 'middle'
        ctx.textAlign = al.align || 'center'
        ctx.fillText(address, al.x, al.y)
        ctx.restore()
      }
      // For Sale extras: price + beds/baths lines
      if (priceLayer.enabled && priceText) {
        ctx.save()
        ctx.font = (priceLayer.bold ? '900 ' : '500 ') + priceLayer.size + 'px Georgia, serif'
        ctx.fillStyle = priceLayer.color
        ctx.textBaseline = 'middle'
        ctx.textAlign = priceLayer.align || 'center'
        ctx.fillText(priceText, priceLayer.x, priceLayer.y)
        ctx.restore()
      }
      if (detailsLayer.enabled && detailsText) {
        ctx.save()
        ctx.font = (detailsLayer.bold ? '800 ' : '500 ') + detailsLayer.size + 'px Georgia, serif'
        ctx.fillStyle = detailsLayer.color
        ctx.textBaseline = 'middle'
        ctx.textAlign = detailsLayer.align || 'center'
        ctx.fillText(detailsText, detailsLayer.x, detailsLayer.y)
        ctx.restore()
      }

      // 📍 Unit pin (condos / developments) — exports with the card
      if (pin) {
        const px = pin.x, py = pin.y
        ctx.save()
        ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3
        ctx.fillStyle = '#E11D48'
        ctx.beginPath()
        ctx.arc(px, py - 34, 22, Math.PI, 0)
        ctx.bezierCurveTo(px + 22, py - 17, px + 8, py - 9, px, py)
        ctx.bezierCurveTo(px - 8, py - 9, px - 22, py - 17, px - 22, py - 34)
        ctx.fill()
        ctx.shadowColor = 'transparent'
        ctx.fillStyle = '#FFFFFF'
        ctx.beginPath(); ctx.arc(px, py - 34, 9, 0, Math.PI * 2); ctx.fill()
        if (pinLabel) {
          ctx.font = 'bold 26px ' + ff
          const tw = ctx.measureText(pinLabel).width
          const bx = px - tw / 2 - 12, by = py - 100
          ctx.fillStyle = '#0F2A47'
          if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx, by, tw + 24, 40, 9); ctx.fill() }
          else ctx.fillRect(bx, by, tw + 24, 40)
          ctx.fillStyle = '#FFFFFF'
          ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
          ctx.fillText(pinLabel, bx + 12, by + 28)
        }
        ctx.restore()
      }

      // Zone outlines in design mode
      if (definingZone || definingAddr) {
        // Photo zone outline
        ctx.save()
        ctx.strokeStyle = '#CC2200'
        ctx.lineWidth = 3
        ctx.setLineDash([10, 5])
        ctx.strokeRect(photoZone.x, photoZone.y, photoZone.w, photoZone.h)
        ctx.restore()
        // Address position marker
        ctx.save()
        ctx.strokeStyle = '#3B82F6'
        ctx.lineWidth = 2
        ctx.setLineDash([5, 3])
        ctx.strokeRect(addrLayer.x - 300, addrLayer.y - addrLayer.size/2 - 5, 600, addrLayer.size + 10)
        ctx.restore()
      }
    } else {
      // No template — show instructional placeholder
      const ct = CARD_TYPES.find(t => t.id === cardType) || CARD_TYPES[0]
      ctx.fillStyle = '#F8FAFC'
      ctx.fillRect(0, 0, CS, CS)
      ctx.fillStyle = '#E2E8F0'
      ctx.fillRect(0, 0, CS, 200)
      ctx.fillStyle = ct.color
      ctx.font = '900 72px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(ct.bannerText.split('\n')[0], 200, 100)
      // Photo zone placeholder
      ctx.fillStyle = '#E2E8F0'
      ctx.fillRect(40, 280, 1000, 520)
      ctx.fillStyle = '#94A3B8'
      ctx.font = '600 36px Arial'
      ctx.fillText('Property Photo Goes Here', CS/2, 540)
      // Address placeholder
      ctx.fillStyle = '#94A3B8'
      ctx.font = '800 36px Georgia'
      ctx.fillText('Property Address', CS/2, 862)
      // Footer
      ctx.fillStyle = '#1B2B4B'
      ctx.fillRect(0, 960, CS, 120)
      ctx.fillStyle = '#ffffff'
      ctx.font = '600 24px Arial'
      ctx.fillText('Upload your card template to get started', CS/2, 1020)
    }
  }

  function loadTemplateImage(src) {
    const img = new Image()
    img.onload = function() { setTplImg(img) }
    img.src = src
  }

  function handleTplUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 20 * 1024 * 1024) { toast('Image must be under 20MB', '#DC2626'); return }
    const reader = new FileReader()
    reader.onload = function(ev) {
      setTplSrc(ev.target.result)
      loadTemplateImage(ev.target.result)
      setSelTpl(null)
    }
    reader.readAsDataURL(file)
  }

  function handlePropUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = function(ev) {
      setPropSrc(ev.target.result)
      const img = new Image()
      img.onload = function() { setPropImg(img) }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  }

  // ── AI ZONE DETECTION (July 2026) ──────────────────────────────
  // Sends the uploaded draft to the AI proxy: it locates the property
  // photo and each text element (address / price / beds-baths), with
  // position, size, color, weight and alignment — then we replace them
  // in place. Old text is painted over with the sampled background
  // color before the new text draws (eraseZones).
  const [eraseZones, setEraseZones] = useState([])   // [{x,y,w,h,color}]
  const [detecting,  setDetecting]  = useState(false)

  function sampleBgColor(img, zone) {
    try {
      const c = document.createElement('canvas')
      c.width = CS; c.height = CS
      const cx = c.getContext('2d')
      cx.drawImage(img, 0, 0, CS, CS)
      const pts = [
        [zone.x + zone.w / 2, Math.max(2, zone.y - 8)],
        [Math.max(2, zone.x - 8), zone.y + zone.h / 2],
        [Math.min(CS - 2, zone.x + zone.w + 8), zone.y + zone.h / 2],
        [zone.x + zone.w / 2, Math.min(CS - 2, zone.y + zone.h + 8)],
      ]
      const cols = pts.map(([px, py]) => {
        const d = cx.getImageData(Math.round(px), Math.round(py), 1, 1).data
        return [d[0], d[1], d[2]]
      })
      // median per channel — robust to one sample landing on a border
      const med = i => cols.map(cl => cl[i]).sort((a, b) => a - b)[Math.floor(cols.length / 2)]
      return 'rgb(' + med(0) + ',' + med(1) + ',' + med(2) + ')'
    } catch(e) { return '#FFFFFF' }
  }

  async function autoDetectZones() {
    if (!tplImg || !tplSrc) { toast('Upload a template image first', '#F5A623'); return }
    setDetecting(true)
    try {
      // Downscale to the canvas size for a consistent coordinate space
      const c = document.createElement('canvas')
      c.width = CS; c.height = CS
      c.getContext('2d').drawImage(tplImg, 0, 0, CS, CS)
      const b64 = c.toDataURL('image/jpeg', 0.85).split(',')[1]

      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: 'Bearer ' + session.access_token } : {}) },
        body: JSON.stringify({
          max_tokens: 1500,
          system: 'You analyze real-estate marketing card designs. The image is exactly 1080x1080 pixels. Respond ONLY with JSON, no markdown fences, no commentary.',
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
              { type: 'text', text: 'Locate the elements that change per property on this card: (1) the property PHOTO region, (2) the street ADDRESS text, (3) the PRICE text if present, (4) the beds/baths/size DETAILS text if present. Return JSON exactly like: {"photo_zone":{"x":0,"y":0,"w":0,"h":0},"texts":[{"role":"address|price|details","bbox":{"x":0,"y":0,"w":0,"h":0},"align":"left|center|right","color":"#RRGGBB","bold":true}]}. Coordinates in 1080x1080 pixel space. bbox must tightly wrap each text line. color is the TEXT color. Omit texts that are not present. Do not include the brokerage name, logo, agent name, phone numbers, or banner words like SOLD/FOR SALE — only property-specific values.' }
            ]
          }]
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'AI request failed')
      const raw = (data.content || []).filter(x => x.type === 'text').map(x => x.text).join('')
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())

      let applied = []
      if (parsed.photo_zone?.w > 20) { setPhotoZone(parsed.photo_zone); applied.push('photo') }
      const zones = []
      ;(parsed.texts || []).forEach(t => {
        if (!t.bbox || t.bbox.w < 5) return
        const bg = sampleBgColor(tplImg, t.bbox)
        zones.push({ ...t.bbox, color: bg })
        const size = Math.max(14, Math.round(t.bbox.h * 0.78))
        const align = ['left','center','right'].includes(t.align) ? t.align : 'center'
        const x = align === 'left' ? t.bbox.x : align === 'right' ? t.bbox.x + t.bbox.w : t.bbox.x + t.bbox.w / 2
        const layer = { x: Math.round(x), y: Math.round(t.bbox.y + t.bbox.h / 2), size, color: t.color || '#1B2B4B', bold: t.bold !== false, align, enabled: true }
        if (t.role === 'address') { setAddrLayer(prev => ({ ...prev, ...layer, enabled: undefined })); applied.push('address') }
        if (t.role === 'price')   { setPriceLayer(layer);   applied.push('price') }
        if (t.role === 'details') { setDetailsLayer(layer); applied.push('beds/baths') }
      })
      setEraseZones(zones)
      toast(applied.length ? '✨ Detected: ' + applied.join(', ') + ' — select a listing to fill them in' : 'Nothing detected — set zones manually', applied.length ? '#10B981' : '#F5A623')
    } catch(e) {
      toast('Auto-detect failed: ' + e.message + ' — set zones manually', '#DC2626')
    } finally { setDetecting(false) }
  }

  // Persist the uploaded photo onto the selected listing so every
  // future card auto-imports it (requires sql/marketing_cards_upgrade.sql).
  const [savingPhoto, setSavingPhoto] = useState(false)
  async function savePhotoToListing() {
    if (!listing || !propSrc) return
    setSavingPhoto(true)
    try {
      const blob = await (await fetch(propSrc)).blob()
      const ext  = (blob.type.split('/')[1] || 'jpg').replace('jpeg','jpg')
      const path = 'listings/' + listing.id + '.' + ext
      // Public bucket so canvas export stays CORS-clean
      const { error: upErr } = await supabase.storage.from('agent-photos').upload(path, blob, { upsert: true, contentType: blob.type })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('agent-photos').getPublicUrl(path)
      const url = data.publicUrl + '?t=' + Date.now()
      const { error } = await supabase.from('listings').update({ photo_url: url }).eq('id', listing.id)
      if (error) throw error
      toast('✅ Photo saved to ' + (listing.addr || 'listing') + ' — future cards will auto-import it')
    } catch(e) {
      toast('Save to listing failed: ' + e.message, '#DC2626')
    } finally { setSavingPhoto(false) }
  }

  function loadSavedTemplate(tpl) {
    setSelTpl(tpl)
    setCardType(tpl.card_type || 'uc_listing')
    if (tpl.photo_zone) setPhotoZone(tpl.photo_zone)
    if (tpl.addr_layer) setAddrLayer(tpl.addr_layer)
    if (tpl.price_layer)   setPriceLayer(tpl.price_layer)
    if (tpl.details_layer) setDetailsLayer(tpl.details_layer)
    setEraseZones(Array.isArray(tpl.erase_zones) ? tpl.erase_zones : [])
    if (tpl.bg_image) {
      setTplSrc(tpl.bg_image)
      loadTemplateImage(tpl.bg_image)
    }
    toast('Template loaded')
  }

  // Canvas click for address positioning
  function onCanvasClick(e) {
    if (!definingAddr && !definingPrice && !definingDetails && !definingPin) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = Math.round((e.clientX - rect.left) * (CS / rect.width))
    const y = Math.round((e.clientY - rect.top) * (CS / rect.height))
    if (definingPin) { setPin({ x, y }); setDefiningPin(false); toast('📍 Unit pin placed — drag the label text below') ; return }
    if (definingAddr)    { setAddrLayer(prev => ({ ...prev, x, y }));    setDefiningAddr(false);    toast('Address position set ✓') }
    if (definingPrice)   { setPriceLayer(prev => ({ ...prev, x, y }));   setDefiningPrice(false);   toast('Price position set ✓') }
    if (definingDetails) { setDetailsLayer(prev => ({ ...prev, x, y })); setDefiningDetails(false); toast('Beds/baths position set ✓') }
  }

  // Canvas drag for photo zone
  function onCanvasMouseDown(e) {
    if (!definingZone) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = Math.round((e.clientX - rect.left) * (CS / rect.width))
    const y = Math.round((e.clientY - rect.top) * (CS / rect.height))
    setZoneStart({ x, y })
    setPhotoZone({ x, y, w: 10, h: 10 })
  }
  function onCanvasMouseMove(e) {
    if (!definingZone || !zoneStart) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = Math.round((e.clientX - rect.left) * (CS / rect.width))
    const y = Math.round((e.clientY - rect.top) * (CS / rect.height))
    setPhotoZone({
      x: Math.min(zoneStart.x, x),
      y: Math.min(zoneStart.y, y),
      w: Math.abs(x - zoneStart.x),
      h: Math.abs(y - zoneStart.y),
    })
  }
  function onCanvasMouseUp(e) {
    if (!definingZone || !zoneStart) return
    setZoneStart(null)
    setDefiningZone(false)
    toast('Photo zone set ✓ — now select a listing')
  }

  async function saveTemplate() {
    if (!tplName.trim()) { toast('Enter a template name', '#F5A623'); return }
    if (!tplSrc) { toast('Upload a template image first', '#F5A623'); return }
    setSaving(true)
    try {
      const row = {
        name:       tplName.trim(),
        card_type:  cardType,
        bg_image:   tplSrc,
        photo_zone: photoZone,
        addr_layer: addrLayer,
        price_layer:   priceLayer,
        details_layer: detailsLayer,
        erase_zones:   eraseZones,
        thumbnail:  canvasRef.current?.toDataURL('image/jpeg', 0.4) || null,
        created_at: new Date().toISOString(),
      }
      const exist = templates.find(t => t.name === tplName.trim())
      // If sql/marketing_cards_upgrade.sql hasn't run yet, the new
      // layer columns don't exist — retry without them so template
      // saving keeps working exactly as before the upgrade.
      async function withColumnFallback(op) {
        let r = await op(row)
        if (r.error && /price_layer|details_layer|erase_zones|column/i.test(r.error.message || '')) {
          const legacy = { ...row }; delete legacy.price_layer; delete legacy.details_layer; delete legacy.erase_zones
          r = await op(legacy)
        }
        return r
      }
      if (exist) {
        const { error } = await withColumnFallback(rw => supabase.from('card_templates').update(rw).eq('id', exist.id))
        if (error) throw error
        setTemplates(prev => prev.map(t => t.id === exist.id ? {...t,...row} : t))
      } else {
        const { data, error } = await withColumnFallback(rw => supabase.from('card_templates').insert(rw).select().single())
        if (error) throw error
        if (data) setTemplates(prev => [data, ...prev])
      }
      toast('✅ Template "' + tplName + '" saved')
      setShowSaveTpl(false)
      setTplName('')
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  function exportJPEG() {
    setDefiningZone(false); setDefiningAddr(false)
    setTimeout(function() {
      draw()
      const url = canvasRef.current.toDataURL('image/jpeg', 0.96)
      const a = document.createElement('a')
      const addrClean = (address || 'card').replace(/[^a-zA-Z0-9]/g,'_').slice(0,30)
      a.href = url; a.download = 'TargetTeam_' + addrClean + '.jpg'; a.click()
      toast('✅ Downloaded 1080×1080 JPEG')
    }, 80)
  }

  function exportPDF() {
    setDefiningZone(false); setDefiningAddr(false)
    setTimeout(function() {
      draw()
      const url = canvasRef.current.toDataURL('image/jpeg', 0.96)
      const html = '<!DOCTYPE html><html><head><style>*{margin:0}@page{size:8.5in 8.5in;margin:0}body{display:flex;align-items:center;justify-content:center;width:8.5in;height:8.5in}img{width:8.5in;height:8.5in;object-fit:contain}</style></head><body><img src="' + url + '"/></body></html>'
      const b = new Blob([html],{type:'text/html'}), u = URL.createObjectURL(b)
      const w = window.open(u,'_blank')
      setTimeout(function() { w && w.print(); URL.revokeObjectURL(u) }, 800)
      toast('📄 Print dialog — Save as PDF')
    }, 80)
  }

  const ct = CARD_TYPES.find(t => t.id === cardType) || CARD_TYPES[0]
  const hasTemplate = !!tplSrc

  return (
    <div style={{ display:'flex', gap:20, flexWrap:'wrap', alignItems:'flex-start' }}>

      {/* LEFT PANEL */}
      <div style={{ flex:'0 0 300px', display:'flex', flexDirection:'column', gap:12 }}>

        {/* STEP 1 — Template */}
        <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', overflow:'hidden' }}>
          <div style={{ padding:'10px 14px', background:ct.color, display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:22, height:22, borderRadius:'50%', background:'rgba(255,255,255,.25)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:900, color:'#fff' }}>1</div>
            <span style={{ fontSize:13, fontWeight:800, color:'#fff' }}>Load your card template</span>
          </div>
          <div style={{ padding:14 }}>
            {/* Card type */}
            <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Card type</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:5, marginBottom:12 }}>
              {CARD_TYPES.map(t => {
                const active = cardType === t.id
                return (
                  <button key={t.id} onClick={() => setCardType(t.id)}
                    style={{ padding:'6px 8px', borderRadius:7, border:'1.5px solid '+(active?t.color:'var(--border)'), background:active?t.color+'14':'transparent', color:active?t.color:'var(--text)', fontSize:11, fontWeight:active?800:500, cursor:'pointer', fontFamily:ff, textAlign:'left', lineHeight:1.3 }}>
                    <div style={{ fontWeight:800 }}>{t.label}</div>
                    {t.sub && <div style={{ fontSize:10, opacity:.8 }}>{t.sub}</div>}
                  </button>
                )
              })}
            </div>

            {/* Saved templates quick-load */}
            {templates.length > 0 && (
              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>Load saved template</div>
                <select onChange={e => { const t=templates.find(x=>x.id===e.target.value); if(t) loadSavedTemplate(t) }} defaultValue=""
                  style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff }}>
                  <option value="">— select saved template —</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}

            {/* Upload template */}
            <label style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:8,
              border:'2px dashed '+(tplSrc?'#10B981':'var(--border)'), cursor:'pointer', background:'var(--dim)', transition:'border-color .15s', marginBottom:6 }}>
              <input ref={tplFileRef} type="file" accept="image/*" onChange={handleTplUpload} style={{ display:'none' }} />
              <span style={{ fontSize:20 }}>{tplSrc ? '✅' : '📤'}</span>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>{tplSrc ? 'Template loaded' : 'Upload your card template'}</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>Your full designed card (JPG/PNG)</div>
              </div>
            </label>
            {tplSrc && (
              <button onClick={() => { setTplSrc(null); setTplImg(null); setSelTpl(null) }}
                style={{ width:'100%', padding:'5px', borderRadius:6, border:'1px solid #DC262444', background:'#FEF2F2', color:'#DC2626', fontSize:11, cursor:'pointer', fontFamily:ff }}>
                Remove template
              </button>
            )}
          </div>
        </div>

        {/* STEP 2 — Define zones (only show when template loaded) */}
        {hasTemplate && (
          <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', overflow:'hidden' }}>
            <div style={{ padding:'10px 14px', background:'#3B82F6', display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:22, height:22, borderRadius:'50%', background:'rgba(255,255,255,.25)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:900, color:'#fff' }}>2</div>
              <span style={{ fontSize:13, fontWeight:800, color:'#fff' }}>Define zones (one-time setup)</span>
            </div>
            <div style={{ padding:14, display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.5 }}>
                Tell the CRM where to place the property photo and the address on your card. Do this once per template.
              </div>

              {/* Photo zone */}
              <button onClick={() => { setDefiningZone(true); setDefiningAddr(false) }}
                style={{ padding:'10px 12px', borderRadius:9, border:'2px solid '+(definingZone?'#CC2200':'var(--border)'), background:definingZone?'rgba(204,34,0,.08)':'var(--dim)', color:definingZone?'#CC2200':'var(--text)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff, textAlign:'left' }}>
                {definingZone ? '🖱 Drag on canvas to set photo zone...' : '📷 Set photo zone — drag on the preview →'}
              </button>

              {/* Current photo zone values */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                {[['x',photoZone.x],['y',photoZone.y],['w',photoZone.w],['h',photoZone.h]].map(([k,v]) => (
                  <div key={k}>
                    <div style={{ fontSize:9, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', marginBottom:2 }}>{k === 'w' ? 'Width' : k === 'h' ? 'Height' : k.toUpperCase()}</div>
                    <input type="number" value={v} onChange={e => setPhotoZone(prev => ({...prev, [k]: parseInt(e.target.value)||0}))}
                      style={{ width:'100%', padding:'5px 7px', borderRadius:6, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff, boxSizing:'border-box' }} />
                  </div>
                ))}
              </div>

              {/* AI auto-detect */}
              <button onClick={autoDetectZones} disabled={detecting}
                style={{ padding:'10px 12px', borderRadius:9, border:'none', background: detecting ? 'var(--dim)' : 'linear-gradient(135deg,#8B5CF6,#6D28D9)', color: detecting ? 'var(--muted)' : '#fff', fontSize:12, fontWeight:800, cursor: detecting ? 'wait' : 'pointer', fontFamily:ff, textAlign:'left' }}>
                {detecting ? '⏳ Analyzing your design…' : '✨ Auto-detect photo & text zones (AI)'}
              </button>

              {/* Address position */}
              <button onClick={() => { setDefiningAddr(true); setDefiningZone(false) }}
                style={{ padding:'10px 12px', borderRadius:9, border:'2px solid '+(definingAddr?'#3B82F6':'var(--border)'), background:definingAddr?'rgba(59,130,246,.08)':'var(--dim)', color:definingAddr?'#3B82F6':'var(--text)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff, textAlign:'left' }}>
                {definingAddr ? '🖱 Click on canvas to set address position...' : '📍 Set address position — click on the preview →'}
              </button>

              {/* Unit pin — condos / developments */}
              <div style={{ border:'1px solid var(--border)', borderRadius:9, padding:'10px 12px', display:'flex', flexDirection:'column', gap:6 }}>
                <div style={{ fontSize:11, fontWeight:800, color:'var(--text)', textTransform:'uppercase', letterSpacing:'.04em' }}>📍 Unit pin (condo / development)</div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  <button onClick={() => { setDefiningPin(!definingPin); setDefiningZone(false); setDefiningAddr(false) }}
                    style={{ padding:'8px 12px', borderRadius:8, border:'none', background:definingPin?'#E11D48':'#2563EB', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
                    {definingPin ? '🖱 Click the preview on the unit… (cancel)' : (pin ? 'Move pin' : 'Place pin')}
                  </button>
                  {pin && (
                    <button onClick={() => { setPin(null); setPinLabel('') }}
                      style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--text)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
                      Remove
                    </button>
                  )}
                </div>
                {pin && (
                  <input value={pinLabel} onChange={e => setPinLabel(e.target.value.toUpperCase())} placeholder="Pin label — e.g. UNIT 14B"
                    style={{ padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff }} />
                )}
                <div style={{ fontSize:10, color:'var(--muted)', fontFamily:ff }}>
                  Tip: use the development's site map as the property photo, then pin the exact unit.
                </div>
              </div>

              {/* Address style */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                <div>
                  <div style={{ fontSize:9, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', marginBottom:2 }}>Font size</div>
                  <input type="number" value={addrLayer.size} onChange={e => setAddrLayer(prev => ({...prev, size:parseInt(e.target.value)||36}))}
                    style={{ width:'100%', padding:'5px 7px', borderRadius:6, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff, boxSizing:'border-box' }} />
                </div>
                <div>
                  <div style={{ fontSize:9, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', marginBottom:2 }}>Color</div>
                  <input type="color" value={addrLayer.color.startsWith('rgba')?'#1B2B4B':addrLayer.color} onChange={e => setAddrLayer(prev => ({...prev, color:e.target.value}))}
                    style={{ width:'100%', height:30, borderRadius:6, border:'1px solid var(--border)', cursor:'pointer', padding:2 }} />
                </div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                {['left','center','right'].map(a => (
                  <button key={a} onClick={() => setAddrLayer(prev => ({...prev, align:a}))}
                    style={{ flex:1, padding:'5px', borderRadius:6, border:'1px solid '+(addrLayer.align===a?'#3B82F6':'var(--border)'), background:addrLayer.align===a?'rgba(59,130,246,.1)':'transparent', color:addrLayer.align===a?'#3B82F6':'var(--muted)', fontSize:11, fontWeight:addrLayer.align===a?700:400, cursor:'pointer', fontFamily:ff }}>
                    {a === 'left' ? '⬅' : a === 'center' ? '⬛' : '➡'}
                  </button>
                ))}
              </div>

              {/* Price + beds/baths layers (For Sale cards) */}
              <div style={{ borderTop:'1px solid var(--border)', paddingTop:8, display:'flex', flexDirection:'column', gap:6 }}>
                <div style={{ fontSize:9, fontWeight:700, color:'var(--muted)', textTransform:'uppercase' }}>For Sale text (auto-filled from listing)</div>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text)', cursor:'pointer' }}>
                  <input type="checkbox" checked={!!priceLayer.enabled} onChange={e => setPriceLayer(p => ({...p, enabled:e.target.checked}))} />
                  Price {priceText ? '(' + priceText + ')' : ''}
                </label>
                {priceLayer.enabled && (
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={() => { setDefiningPrice(true); setDefiningAddr(false); setDefiningDetails(false); setDefiningZone(false) }}
                      style={{ flex:1, padding:'6px 8px', borderRadius:7, border:'2px solid '+(definingPrice?'#10B981':'var(--border)'), background:definingPrice?'rgba(16,185,129,.08)':'var(--dim)', color:definingPrice?'#10B981':'var(--text)', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
                      {definingPrice ? '🖱 Click canvas…' : '📍 Position'}
                    </button>
                    <input type="number" value={priceLayer.size} onChange={e => setPriceLayer(p => ({...p, size:parseInt(e.target.value)||44}))}
                      style={{ width:54, padding:'5px 7px', borderRadius:6, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff }} title="Font size" />
                    <input type="color" value={priceLayer.color} onChange={e => setPriceLayer(p => ({...p, color:e.target.value}))}
                      style={{ width:38, height:30, borderRadius:6, border:'1px solid var(--border)', cursor:'pointer', padding:2 }} title="Color" />
                  </div>
                )}
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text)', cursor:'pointer' }}>
                  <input type="checkbox" checked={!!detailsLayer.enabled} onChange={e => setDetailsLayer(p => ({...p, enabled:e.target.checked}))} />
                  Beds / Baths / SqFt {detailsText ? '(' + detailsText + ')' : ''}
                </label>
                {detailsLayer.enabled && (
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={() => { setDefiningDetails(true); setDefiningAddr(false); setDefiningPrice(false); setDefiningZone(false) }}
                      style={{ flex:1, padding:'6px 8px', borderRadius:7, border:'2px solid '+(definingDetails?'#10B981':'var(--border)'), background:definingDetails?'rgba(16,185,129,.08)':'var(--dim)', color:definingDetails?'#10B981':'var(--text)', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
                      {definingDetails ? '🖱 Click canvas…' : '📍 Position'}
                    </button>
                    <input type="number" value={detailsLayer.size} onChange={e => setDetailsLayer(p => ({...p, size:parseInt(e.target.value)||26}))}
                      style={{ width:54, padding:'5px 7px', borderRadius:6, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff }} title="Font size" />
                    <input type="color" value={detailsLayer.color} onChange={e => setDetailsLayer(p => ({...p, color:e.target.value}))}
                      style={{ width:38, height:30, borderRadius:6, border:'1px solid var(--border)', cursor:'pointer', padding:2 }} title="Color" />
                  </div>
                )}
              </div>

              {/* Save template button */}
              <button onClick={() => setShowSaveTpl(true)}
                style={{ padding:'9px', borderRadius:8, border:'none', background:'#10B981', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff, marginTop:4 }}>
                💾 Save as Template
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 — Select listing */}
        {hasTemplate && (
          <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', overflow:'hidden' }}>
            <div style={{ padding:'10px 14px', background:'#10B981', display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:22, height:22, borderRadius:'50%', background:'rgba(255,255,255,.25)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:900, color:'#fff' }}>3</div>
              <span style={{ fontSize:13, fontWeight:800, color:'#fff' }}>Select listing — auto-fills address</span>
            </div>
            <div style={{ padding:14 }}>
              <div style={{ display:'flex', gap:6, marginBottom:10 }}>
                {[['listing','Listing'],['deal','Deal']].map(([v,l]) => (
                  <button key={v} onClick={() => setSource(v)}
                    style={{ flex:1, padding:'6px', borderRadius:7, border:'1.5px solid '+(source===v?'#10B981':'var(--border)'), background:source===v?'rgba(16,185,129,.1)':'transparent', color:source===v?'#10B981':'var(--muted)', fontSize:12, fontWeight:source===v?700:400, cursor:'pointer', fontFamily:ff }}>
                    {l}
                  </button>
                ))}
              </div>

              {source === 'listing' ? (
                <select value={listingId} onChange={e => setListingId(e.target.value)}
                  style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }}>
                  <option value="">— Select a listing —</option>
                  {listings.map(l => <option key={l.id} value={l.id}>{l.addr} · {fmt$(l.list_price)} · {l.status||''}</option>)}
                </select>
              ) : (
                <select value={dealId} onChange={e => setDealId(e.target.value)}
                  style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }}>
                  <option value="">— Select a deal —</option>
                  {deals.map(d => <option key={d.id} value={d.id}>{d.addr} · {d.stage} · {d.side||''}</option>)}
                </select>
              )}

              {record && (
                <div style={{ marginTop:8, padding:'8px 10px', background:'#EFF6FF', borderRadius:7, fontSize:11, color:'#1E40AF', lineHeight:1.6 }}>
                  <strong>{record.addr}</strong>
                  {record.list_price && <span> · {fmt$(record.list_price)}</span>}
                  {record.stage && <span> · {record.stage}</span>}
                  {record.side && <span> · {record.side}</span>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 4 — Property photo */}
        {hasTemplate && (
          <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', overflow:'hidden' }}>
            <div style={{ padding:'10px 14px', background:'#8B5CF6', display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:22, height:22, borderRadius:'50%', background:'rgba(255,255,255,.25)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:900, color:'#fff' }}>4</div>
              <span style={{ fontSize:13, fontWeight:800, color:'#fff' }}>Upload property photo</span>
            </div>
            <div style={{ padding:14 }}>
              <label style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:8,
                border:'2px dashed '+(propSrc?'#10B981':'var(--border)'), cursor:'pointer', background:'var(--dim)' }}>
                <input ref={propFileRef} type="file" accept="image/*" onChange={handlePropUpload} style={{ display:'none' }} />
                <span style={{ fontSize:20 }}>{propSrc ? '🏠' : '📷'}</span>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>{propSrc ? 'Photo loaded ✓' : 'Upload property photo'}</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>Gets placed in your defined photo zone</div>
                </div>
              </label>
              {propSrc && (
                <>
                  {listing && (
                    <button onClick={savePhotoToListing} disabled={savingPhoto}
                      style={{ marginTop:6, width:'100%', padding:'8px', borderRadius:8, border:'1px solid #10B981', background:'rgba(16,185,129,.08)', color:'#10B981', fontSize:12, fontWeight:700, cursor: savingPhoto?'wait':'pointer', fontFamily:ff }}>
                      {savingPhoto ? '⏳ Saving…' : '💾 Save photo to this listing (auto-imports next time)'}
                    </button>
                  )}
                  <button onClick={() => { setPropSrc(null); setPropImg(null) }}
                    style={{ marginTop:6, width:'100%', padding:'5px', borderRadius:6, border:'1px solid #DC262444', background:'#FEF2F2', color:'#DC2626', fontSize:11, cursor:'pointer', fontFamily:ff }}>
                    Remove photo
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Export */}
        {hasTemplate && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <button onClick={exportJPEG}
              style={{ padding:'12px', borderRadius:9, background:'#CC2200', color:'#fff', border:'none', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:ff }}>
              ⬇ JPEG HD
            </button>
            <button onClick={exportPDF}
              style={{ padding:'12px', borderRadius:9, background:'#1B2B4B', color:'#fff', border:'none', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:ff }}>
              📄 PDF
            </button>
          </div>
        )}
      </div>

      {/* CANVAS PREVIEW */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:10, minWidth:0 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', textAlign:'center' }}>
          {definingZone ? '🟥 Drag to draw the photo zone' : definingAddr ? '🔵 Click to place the address' : 'Preview — 1080×1080 export'}
        </div>
        <div style={{ position:'relative', boxShadow:'0 8px 40px rgba(0,0,0,.22)', borderRadius:12, overflow:'hidden',
          cursor: definingZone ? 'crosshair' : (definingAddr || definingPin) ? 'cell' : 'default' }}>
          <canvas
            ref={canvasRef}
            width={CS} height={CS}
            style={{ display:'block', width:DS, height:DS }}
            onClick={onCanvasClick}
            onMouseDown={onCanvasMouseDown}
            onMouseMove={onCanvasMouseMove}
            onMouseUp={onCanvasMouseUp}
          />
        </div>
        {!hasTemplate && (
          <div style={{ maxWidth:DS, textAlign:'center', padding:'12px 16px', background:'var(--dim)', borderRadius:10, border:'1px solid var(--border)', fontSize:12, color:'var(--muted)', lineHeight:1.7 }}>
            <strong style={{ color:'var(--text)' }}>How it works:</strong><br/>
            1. Upload your designed card (the full card with logo, banner, footer)<br/>
            2. Draw a box where the property photo should appear<br/>
            3. Click where the address text goes<br/>
            4. Save as a template — use it for every listing in seconds
          </div>
        )}
      </div>

      {/* Save template modal */}
      {showSaveTpl && (
        <div onClick={e => e.target===e.currentTarget && setShowSaveTpl(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20, fontFamily:ff }}>
          <div style={{ background:'var(--panel)', borderRadius:14, width:'100%', maxWidth:380, padding:24, boxShadow:'0 20px 50px rgba(0,0,0,.3)' }}>
            <div style={{ fontSize:16, fontWeight:800, color:'var(--text)', marginBottom:4 }}>Save Card Template</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16, lineHeight:1.6 }}>
              Saves the card image + photo zone + address position. Load it anytime and just swap the listing.
            </div>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>Template Name</div>
            <input value={tplName} onChange={e => setTplName(e.target.value)} autoFocus
              onKeyDown={e => e.key === 'Enter' && saveTemplate()}
              placeholder={'e.g. UC Listing Card, Sold Buyer Side...'}
              style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, boxSizing:'border-box', marginBottom:16 }} />
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => setShowSaveTpl(false)} style={{ padding:'9px 16px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', cursor:'pointer', fontFamily:ff }}>Cancel</button>
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

// ── CUSTOM EDITOR ────────────────────────────────────────────────
function CustomEditor({ listings }) {
  const { toast } = useApp()
  const { agent } = useAuth()
  const canvasRef = useRef(null)
  const [bgImg, setBgImg] = useState(null)
  const [bgSrc, setBgSrc] = useState(null)
  const [listingId, setListingId] = useState('')
  const [agentName, setAgentName] = useState(agent ? agent.name : '')
  const [cardType, setCardType] = useState('uc_listing')
  const [layers, setLayers] = useState([
    { id:'address', text:'Select a listing', x:540, y:862, size:36, color:'#1B2B4B', bold:true, shadow:false, align:'center' },
    { id:'price',   text:'',                 x:540, y:912, size:28, color:'#CC2200', bold:true, shadow:false, align:'center' },
  ])
  const [selLayer, setSelLayer] = useState('address')
  const [dragging, setDragging] = useState(null)

  useEffect(function() { if (agent) setAgentName(agent.name) }, [agent])

  useEffect(function() {
    const l = listings.find(x => x.id === listingId)
    setLayers(prev => prev.map(layer => {
      if (layer.id === 'address') return {...layer, text: l ? (l.addr||'') : 'Select a listing'}
      if (layer.id === 'price')   return {...layer, text: l ? fmt$(l.list_price) : ''}
      return layer
    }))
  }, [listingId, listings])

  useEffect(function() { draw() }, [layers, bgImg, cardType])

  function draw() {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, CS, CS)
    const ct = CARD_TYPES.find(t => t.id === cardType) || CARD_TYPES[0]
    if (bgImg) {
      const s = Math.max(CS/bgImg.naturalWidth, CS/bgImg.naturalHeight)
      ctx.drawImage(bgImg, (CS-bgImg.naturalWidth*s)/2, (CS-bgImg.naturalHeight*s)/2, bgImg.naturalWidth*s, bgImg.naturalHeight*s)
    } else {
      const g = ctx.createLinearGradient(0,0,CS,CS); g.addColorStop(0,ct.color); g.addColorStop(1,'#0f1a2e')
      ctx.fillStyle=g; ctx.fillRect(0,0,CS,CS)
    }
    layers.forEach(l => {
      if (!l.text) return
      ctx.save()
      ctx.font = (l.bold?'800 ':'500 ') + l.size + 'px Georgia, serif'
      ctx.fillStyle = l.color; ctx.textBaseline = 'middle'
      if (l.shadow) { ctx.shadowColor='rgba(0,0,0,.6)'; ctx.shadowBlur=8 }
      ctx.textAlign = l.align || 'left'
      ctx.fillText(l.text, l.x, l.y)
      if (l.id === selLayer) {
        const w = ctx.measureText(l.text).width
        const rx = l.align==='center' ? l.x-w/2-8 : l.align==='right' ? l.x-w-8 : l.x-8
        ctx.strokeStyle='#CC2200'; ctx.lineWidth=2; ctx.setLineDash([6,3])
        ctx.strokeRect(rx, l.y-l.size/2-4, w+16, l.size+8)
      }
      ctx.restore()
    })
  }

  function onCanvasMouseDown(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    const mx = (e.clientX-rect.left)*(CS/rect.width), my = (e.clientY-rect.top)*(CS/rect.height)
    const ctx = canvasRef.current.getContext('2d')
    const hit = [...layers].reverse().find(l => {
      if (!l.text) return false
      ctx.font = (l.bold?'800 ':'500 ') + l.size + 'px Georgia, serif'
      const w = ctx.measureText(l.text).width
      const rx = l.align==='center'?l.x-w/2:l.align==='right'?l.x-w:l.x
      return mx >= rx-10 && mx <= rx+w+10 && my >= l.y-l.size/2-8 && my <= l.y+l.size/2+8
    })
    if (hit) { setSelLayer(hit.id); setDragging({id:hit.id, ox:mx-hit.x, oy:my-hit.y}) }
  }
  function onCanvasMouseMove(e) {
    if (!dragging) return
    const rect = canvasRef.current.getBoundingClientRect()
    const mx = (e.clientX-rect.left)*(CS/rect.width), my = (e.clientY-rect.top)*(CS/rect.height)
    setLayers(prev => prev.map(l => l.id===dragging.id ? {...l, x:Math.round(mx-dragging.ox), y:Math.round(my-dragging.oy)} : l))
  }
  function onCanvasMouseUp() { setDragging(null) }

  const sel = layers.find(l => l.id === selLayer)

  function exportJPEG() {
    setTimeout(() => {
      const url = canvasRef.current.toDataURL('image/jpeg',0.96)
      const a = document.createElement('a'); a.href=url; a.download='TargetTeam_Card.jpg'; a.click()
      toast('✅ Downloaded!')
    }, 60)
  }
  function exportPDF() {
    setTimeout(() => {
      const url = canvasRef.current.toDataURL('image/jpeg',0.96)
      const html='<!DOCTYPE html><html><head><style>*{margin:0}@page{size:8.5in 8.5in;margin:0}body{display:flex;align-items:center;justify-content:center;width:8.5in;height:8.5in}img{width:8.5in;height:8.5in}</style></head><body><img src="'+url+'"/></body></html>'
      const b=new Blob([html],{type:'text/html'}),u=URL.createObjectURL(b),w=window.open(u,'_blank')
      setTimeout(()=>{w&&w.print();URL.revokeObjectURL(u)},800)
      toast('📄 Print dialog opened')
    }, 60)
  }

  return (
    <div style={{ display:'flex', gap:20, flexWrap:'wrap', alignItems:'flex-start' }}>
      <div style={{ flex:'0 0 280px', display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:14 }}>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Background image</div>
          <label style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:8, border:'1.5px dashed '+(bgSrc?'#10B981':'var(--border)'), cursor:'pointer', background:'var(--dim)', marginBottom:8 }}>
            <input type="file" accept="image/*" onChange={e => { const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>{setBgSrc(ev.target.result);const i=new Image();i.onload=()=>setBgImg(i);i.src=ev.target.result};r.readAsDataURL(f) }} style={{ display:'none' }} />
            <span style={{ fontSize:18 }}>{bgSrc?'🖼':'📷'}</span>
            <span style={{ fontSize:12, color:'var(--muted)' }}>{bgSrc?'Image loaded ✓':'Upload property photo'}</span>
          </label>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Select listing</div>
          <select value={listingId} onChange={e => setListingId(e.target.value)}
            style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff, marginBottom:8 }}>
            <option value="">— Select listing —</option>
            {listings.map(l => <option key={l.id} value={l.id}>{l.addr} · {fmt$(l.list_price)}</option>)}
          </select>
        </div>

        {sel && (
          <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:14 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--text)', marginBottom:10 }}>Edit selected layer</div>
            <div style={{ marginBottom:8 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>Text</div>
              <textarea value={sel.text} rows={2} onChange={e => setLayers(p => p.map(l => l.id===selLayer?{...l,text:e.target.value}:l))}
                style={{ width:'100%', padding:'6px 8px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff, resize:'none', boxSizing:'border-box' }} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
              <div>
                <div style={{ fontSize:9, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', marginBottom:3 }}>Size</div>
                <input type="number" value={sel.size} onChange={e => setLayers(p => p.map(l => l.id===selLayer?{...l,size:parseInt(e.target.value)||36}:l))} style={{ width:'100%', padding:'6px', borderRadius:6, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff, boxSizing:'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize:9, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', marginBottom:3 }}>Color</div>
                <input type="color" value={sel.color.startsWith('rgba')?'#1B2B4B':sel.color} onChange={e => setLayers(p => p.map(l => l.id===selLayer?{...l,color:e.target.value}:l))} style={{ width:'100%', height:30, borderRadius:6, border:'1px solid var(--border)', cursor:'pointer', padding:2 }} />
              </div>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              {['left','center','right'].map(a => (
                <button key={a} onClick={() => setLayers(p => p.map(l => l.id===selLayer?{...l,align:a}:l))}
                  style={{ flex:1, padding:'4px', borderRadius:6, border:'1px solid '+(sel.align===a?'#CC2200':'var(--border)'), background:sel.align===a?'rgba(204,34,0,.1)':'transparent', color:sel.align===a?'#CC2200':'var(--muted)', fontSize:11, cursor:'pointer', fontFamily:ff }}>
                  {a === 'left' ? '⬅' : a === 'center' ? '⬛' : '➡'}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <button onClick={exportJPEG} style={{ padding:'11px', borderRadius:9, background:'#CC2200', color:'#fff', border:'none', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:ff }}>⬇ JPEG HD</button>
          <button onClick={exportPDF}  style={{ padding:'11px', borderRadius:9, background:'#1B2B4B', color:'#fff', border:'none', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:ff }}>📄 PDF</button>
        </div>
      </div>

      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em' }}>Preview — drag text to reposition</div>
        <div style={{ boxShadow:'0 8px 40px rgba(0,0,0,.22)', borderRadius:12, overflow:'hidden', cursor:dragging?'grabbing':'grab' }}>
          <canvas ref={canvasRef} width={CS} height={CS} style={{ display:'block', width:DS, height:DS }}
            onMouseDown={onCanvasMouseDown} onMouseMove={onCanvasMouseMove} onMouseUp={onCanvasMouseUp} onMouseLeave={onCanvasMouseUp} />
        </div>
      </div>
    </div>
  )
}

// ── TEMPLATES TAB ────────────────────────────────────────────────
function TemplatesTab({ listings, deals }) {
  const { toast }  = useApp()
  const canvasRef  = useRef(null)
  const [templates, setTemplates] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [sel,       setSel]       = useState(null)
  const [listingId, setListingId] = useState('')
  const [dealId,    setDealId]    = useState('')
  const [source,    setSource]    = useState('listing')
  const [propImg,   setPropImg]   = useState(null)
  const [propSrc,   setPropSrc]   = useState(null)
  const tplImgRef = useRef(null)

  useEffect(function() {
    setLoading(true)
    supabase.from('card_templates').select('*').order('created_at',{ascending:false})
      .then(r => { setTemplates(r.data||[]); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const listing = listings.find(l => l.id === listingId) || null
  const deal    = deals.find(d => d.id === dealId) || null
  const record  = listing || deal
  const address = record ? (record.addr||'') : ''

  useEffect(function() { if (sel) drawTemplate() }, [sel, propImg, address])

  function drawTemplate() {
    const canvas = canvasRef.current; if (!canvas || !sel) return
    const ctx = canvas.getContext('2d'), S = CS
    ctx.clearRect(0,0,S,S)
    const pz = sel.photo_zone || {x:40,y:280,w:1000,h:520}
    const al = sel.addr_layer || {x:540,y:862,size:36,color:'#1B2B4B',bold:true,align:'center'}
    function drawAll() {
      if (tplImgRef.current) ctx.drawImage(tplImgRef.current, 0, 0, S, S)
      if (propImg && pz) {
        ctx.save(); ctx.beginPath(); ctx.rect(pz.x,pz.y,pz.w,pz.h); ctx.clip()
        const sc=Math.max(pz.w/propImg.naturalWidth,pz.h/propImg.naturalHeight)
        const sw=propImg.naturalWidth*sc, sh=propImg.naturalHeight*sc
        ctx.drawImage(propImg, pz.x+(pz.w-sw)/2, pz.y+(pz.h-sh)/2, sw, sh)
        ctx.restore()
      }
      if (address) {
        ctx.save(); ctx.font=(al.bold?'800 ':'500 ')+al.size+'px Georgia, serif'
        ctx.fillStyle=al.color; ctx.textBaseline='middle'; ctx.textAlign=al.align||'center'
        ctx.fillText(address, al.x, al.y); ctx.restore()
      }
    }
    if (sel.bg_image && !tplImgRef.current) {
      const img = new Image(); img.onload=function(){tplImgRef.current=img;drawAll()}; img.src=sel.bg_image
    } else { drawAll() }
  }

  function handlePropUpload(e) {
    const file=e.target.files[0]; if(!file) return
    const r=new FileReader(); r.onload=function(ev){
      setPropSrc(ev.target.result)
      const img=new Image(); img.onload=function(){setPropImg(img)}; img.src=ev.target.result
    }; r.readAsDataURL(file)
  }

  function loadTemplate(tpl) {
    tplImgRef.current = null
    setSel(tpl)
    setListingId(''); setDealId('')
    setPropImg(null); setPropSrc(null)
  }

  function exportJPEG() {
    const url=canvasRef.current.toDataURL('image/jpeg',0.96)
    const a=document.createElement('a'); a.href=url; a.download='TargetTeam_Card.jpg'; a.click()
    toast('✅ Downloaded!')
  }
  function exportPDF() {
    const url=canvasRef.current.toDataURL('image/jpeg',0.96)
    const html='<!DOCTYPE html><html><head><style>*{margin:0}@page{size:8.5in 8.5in;margin:0}body{display:flex;align-items:center;justify-content:center;width:8.5in;height:8.5in}img{width:8.5in;height:8.5in}</style></head><body><img src="'+url+'"/></body></html>'
    const b=new Blob([html],{type:'text/html'}),u=URL.createObjectURL(b),w=window.open(u,'_blank')
    setTimeout(()=>{w&&w.print();URL.revokeObjectURL(u)},800); toast('📄 Print dialog')
  }
  async function delTpl(id) {
    if (!window.confirm('Delete this template?')) return
    await supabase.from('card_templates').delete().eq('id',id)
    setTemplates(p=>p.filter(t=>t.id!==id))
    if (sel?.id===id) { setSel(null); tplImgRef.current=null }
    toast('Deleted')
  }

  return (
    <div style={{ display:'flex', gap:20, flexWrap:'wrap', alignItems:'flex-start' }}>
      {/* Template list */}
      <div style={{ flex:'0 0 260px' }}>
        <div style={{ fontSize:14, fontWeight:800, color:'var(--text)', marginBottom:12 }}>Saved Templates ({templates.length})</div>
        {loading ? <div style={{ color:'var(--muted)', fontSize:13 }}>Loading...</div>
        : templates.length === 0 ? (
          <div style={{ textAlign:'center', padding:32, color:'var(--muted)', fontSize:12, lineHeight:1.7 }}>
            <div style={{ fontSize:32, marginBottom:8 }}>📁</div>
            No templates yet.<br/>Use the <strong>⚡ Smart Cards</strong> tab to upload your card and save it as a template.
          </div>
        ) : templates.map(tpl => {
          const isActive = sel?.id === tpl.id
          const ct = CARD_TYPES.find(t=>t.id===tpl.card_type) || CARD_TYPES[0]
          return (
            <div key={tpl.id} style={{ borderRadius:10, border:'1.5px solid '+(isActive?'#CC2200':'var(--border)'), background:isActive?'rgba(204,34,0,.04)':'var(--panel)', marginBottom:8, overflow:'hidden', transition:'all .15s' }}>
              <div onClick={() => loadTemplate(tpl)} style={{ padding:'10px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:10 }}>
                {tpl.thumbnail
                  ? <img src={tpl.thumbnail} alt="" style={{ width:44, height:44, borderRadius:6, objectFit:'cover', flexShrink:0 }} />
                  : <div style={{ width:44, height:44, borderRadius:6, background:ct.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:'#fff', flexShrink:0, textAlign:'center', lineHeight:1.2, padding:2 }}>{ct.label}</div>
                }
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tpl.name}</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>{ct.label}{ct.sub?' · '+ct.sub:''}</div>
                </div>
                <button onClick={e=>{e.stopPropagation();delTpl(tpl.id)}} style={{ background:'none',border:'none',cursor:'pointer',color:'#DC2626',fontSize:16,padding:4 }}>×</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Right: controls + canvas */}
      <div style={{ flex:1, minWidth:0 }}>
        {!sel ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:300, color:'var(--muted)', fontSize:13, textAlign:'center' }}>
            Select a template on the left to use it
          </div>
        ) : (
          <>
            <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:14, marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:800, color:'var(--text)', marginBottom:10 }}>Select listing — address auto-fills</div>
              <div style={{ display:'flex', gap:6, marginBottom:8 }}>
                {[['listing','Listing'],['deal','Deal']].map(([v,l]) => (
                  <button key={v} onClick={() => setSource(v)}
                    style={{ flex:1, padding:'5px', borderRadius:7, border:'1.5px solid '+(source===v?'#10B981':'var(--border)'), background:source===v?'rgba(16,185,129,.1)':'transparent', color:source===v?'#10B981':'var(--muted)', fontSize:12, fontWeight:source===v?700:400, cursor:'pointer', fontFamily:ff }}>
                    {l}
                  </button>
                ))}
              </div>
              {source==='listing' ? (
                <select value={listingId} onChange={e=>setListingId(e.target.value)} style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, marginBottom:8 }}>
                  <option value="">— Select listing —</option>
                  {listings.map(l => <option key={l.id} value={l.id}>{l.addr} · {fmt$(l.list_price)} · {l.status||''}</option>)}
                </select>
              ) : (
                <select value={dealId} onChange={e=>setDealId(e.target.value)} style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, marginBottom:8 }}>
                  <option value="">— Select deal —</option>
                  {deals.map(d => <option key={d.id} value={d.id}>{d.addr} · {d.stage} · {d.side||''}</option>)}
                </select>
              )}
              {record && <div style={{ padding:'7px 10px', background:'#EFF6FF', borderRadius:7, fontSize:11, color:'#1E40AF' }}><strong>{record.addr}</strong>{record.list_price?' · '+fmt$(record.list_price):''}{record.stage?' · '+record.stage:''}</div>}

              <div style={{ marginTop:10 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>Property photo</div>
                <label style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:8, border:'1.5px dashed '+(propSrc?'#10B981':'var(--border)'), cursor:'pointer', background:'var(--dim)' }}>
                  <input type="file" accept="image/*" onChange={handlePropUpload} style={{ display:'none' }} />
                  <span style={{ fontSize:18 }}>{propSrc?'🏠':'📷'}</span>
                  <span style={{ fontSize:12, color:'var(--muted)' }}>{propSrc?'Photo loaded ✓':'Upload property photo'}</span>
                </label>
              </div>
            </div>

            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
              <div style={{ boxShadow:'0 8px 40px rgba(0,0,0,.22)', borderRadius:12, overflow:'hidden' }}>
                <canvas ref={canvasRef} width={CS} height={CS} style={{ display:'block', width:DS, height:DS }} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, width:'100%', maxWidth:DS }}>
                <button onClick={exportJPEG} style={{ padding:'12px', borderRadius:9, background:'#CC2200', color:'#fff', border:'none', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:ff }}>⬇ JPEG HD</button>
                <button onClick={exportPDF}  style={{ padding:'12px', borderRadius:9, background:'#1B2B4B', color:'#fff', border:'none', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:ff }}>📄 PDF</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── CANVA / ADOBE ────────────────────────────────────────────────
function CanvaTab({ listings }) {
  const [lid, setLid] = useState('')
  const l = listings.find(x=>x.id===lid)||null
  const go = url => { window.open(url,'_blank'); if(l) navigator.clipboard.writeText(l.addr+' · '+fmt$(l.list_price)+(l.beds?' · '+l.beds+' bd '+l.baths+' ba':'')).catch(()=>{}) }
  const ITEMS = [{n:'Just Listed',u:'https://www.canva.com/create/instagram-posts/?q=just+listed+real+estate'},{n:'Under Contract',u:'https://www.canva.com/create/instagram-posts/?q=under+contract+real+estate'},{n:'Just Sold',u:'https://www.canva.com/create/instagram-posts/?q=sold+real+estate'},{n:'Open House',u:'https://www.canva.com/create/instagram-posts/?q=open+house+real+estate'},{n:'Story',u:'https://www.canva.com/create/instagram-stories/'},{n:'Flyer',u:'https://www.canva.com/create/flyers/?q=real+estate'}]
  return (
    <div>
      <div style={{background:'linear-gradient(135deg,#8B3DFF,#6320EE)',borderRadius:14,padding:'20px 24px',marginBottom:16,color:'#fff'}}>
        <div style={{fontSize:18,fontWeight:900,marginBottom:3}}>Canva</div>
        <div style={{fontSize:12,opacity:.85,marginBottom:12}}>Select a listing — address copies to clipboard when you open a template.</div>
        <a href="https://www.canva.com/real-estate/" target="_blank" rel="noopener noreferrer" style={{display:'inline-block',background:'#fff',color:'#8B3DFF',padding:'7px 16px',borderRadius:7,fontSize:12,fontWeight:800,textDecoration:'none'}}>Browse All</a>
      </div>
      <select value={lid} onChange={e=>setLid(e.target.value)} style={{width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:13,fontFamily:ff,marginBottom:12}}>
        <option value="">— Select listing —</option>
        {listings.map(l=><option key={l.id} value={l.id}>{l.addr} · {fmt$(l.list_price)}</option>)}
      </select>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:8}}>
        {ITEMS.map(t=>(
          <button key={t.n} onClick={()=>go(t.u)} style={{display:'flex',alignItems:'center',gap:8,padding:'12px 14px',background:'var(--panel)',borderRadius:9,border:'1px solid var(--border)',cursor:'pointer',fontFamily:ff}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='#8B3DFF'}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)'}}>
            <div style={{width:28,height:28,borderRadius:6,background:'#8B3DFF',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:900,fontSize:12,flexShrink:0}}>C</div>
            <span style={{fontSize:12,fontWeight:600,color:'var(--text)'}}>{t.n}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function AdobeTab({ listings }) {
  const [lid, setLid] = useState('')
  const l = listings.find(x=>x.id===lid)||null
  const go = url => { window.open(url,'_blank'); if(l) navigator.clipboard.writeText(l.addr+' · '+fmt$(l.list_price)+(l.beds?' · '+l.beds+' bd '+l.baths+' ba':'')).catch(()=>{}) }
  const ITEMS = [{n:'Instagram Post',u:'https://new.express.adobe.com/new?category=instagram'},{n:'Instagram Story',u:'https://new.express.adobe.com/new?category=instagram-story'},{n:'Facebook',u:'https://new.express.adobe.com/new?category=facebook'},{n:'Flyer',u:'https://new.express.adobe.com/new?category=flyer'}]
  return (
    <div>
      <div style={{background:'linear-gradient(135deg,#FF0000,#CC0000)',borderRadius:14,padding:'20px 24px',marginBottom:16,color:'#fff'}}>
        <div style={{fontSize:18,fontWeight:900,marginBottom:3}}>Adobe Express</div>
        <div style={{fontSize:12,opacity:.85,marginBottom:12}}>Select a listing — details copy to clipboard when you open a template.</div>
        <a href="https://new.express.adobe.com/" target="_blank" rel="noopener noreferrer" style={{display:'inline-block',background:'#fff',color:'#FF0000',padding:'7px 16px',borderRadius:7,fontSize:12,fontWeight:800,textDecoration:'none'}}>Open Adobe Express</a>
      </div>
      <select value={lid} onChange={e=>setLid(e.target.value)} style={{width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:13,fontFamily:ff,marginBottom:12}}>
        <option value="">— Select listing —</option>
        {listings.map(l=><option key={l.id} value={l.id}>{l.addr} · {fmt$(l.list_price)}</option>)}
      </select>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:8}}>
        {ITEMS.map(t=>(
          <button key={t.n} onClick={()=>go(t.u)} style={{display:'flex',alignItems:'center',gap:8,padding:'12px 14px',background:'var(--panel)',borderRadius:9,border:'1px solid var(--border)',cursor:'pointer',fontFamily:ff}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='#FF0000'}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)'}}>
            <div style={{width:28,height:28,borderRadius:6,background:'#FF0000',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:900,fontSize:11,flexShrink:0}}>Ae</div>
            <span style={{fontSize:12,fontWeight:600,color:'var(--text)'}}>{t.n}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── MAIN ─────────────────────────────────────────────────────────
export function SocialCards() {
  const [tab, setTab] = useState('smart')
  const { listings }  = useListings()
  const { deals }     = useDeals()
  const safeL = listings || []
  const safeD = deals    || []

  return (
    <div style={{ fontFamily:ff }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:22, fontWeight:900, color:'var(--text)' }}>🎨 Card Generator</div>
        <div style={{ fontSize:13, color:'var(--muted)', marginTop:3 }}>
          Upload your card template · define photo zone · select listing → auto-fills address + photo · export 1080px JPEG or PDF
        </div>
      </div>

      <div style={{ display:'flex', borderBottom:'2px solid var(--border)', marginBottom:24, gap:0, overflowX:'auto' }}>
        {TABS.map(t => {
          const a = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding:'9px 18px', border:'none', background:'none', cursor:'pointer',
                borderBottom:a?'2px solid #CC2200':'2px solid transparent', marginBottom:'-2px',
                fontSize:13, fontWeight:a?700:500, color:a?'#CC2200':'var(--muted)', fontFamily:ff, whiteSpace:'nowrap' }}>
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'smart'     && <SmartCards  listings={safeL} deals={safeD} />}
      {tab === 'editor'    && <CustomEditor listings={safeL} />}
      {tab === 'templates' && <TemplatesTab listings={safeL} deals={safeD} />}
      {tab === 'canva'     && <CanvaTab    listings={safeL} />}
      {tab === 'adobe'     && <AdobeTab    listings={safeL} />}
    </div>
  )
}
