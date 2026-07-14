// ═══════════════════════════════════════════════════════════════
// Design Studio page — see src/lib/designStudio.js for the element
// model, templates, and style helpers. This file is the editor UI:
// toolbar, insert panel, canvas with drag/resize/snap, layers panel,
// properties panel, save/load, and PNG export.
// No template literals in this file (validator gotcha).
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import html2canvas from 'html2canvas'
import { supabase } from '../lib/supabase'
import { uploadFile } from '../lib/storage'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { Btn, Modal, ModalActions, Toggle } from '../components/UI'
import {
  PRESETS, FONTS, fontLabel, clone,
  newText, newShape, newImage, builtinTemplates,
  elementStyle, imageFilter, backgroundStyle,
} from '../lib/designStudio'

const inp = { padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, background: 'var(--bg)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }
const lbl = { fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 3, marginTop: 8 }
const panel = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, overflowY: 'auto' }

function Num({ value, onChange, min, max, step = 1, width = 64 }) {
  return <input type="number" style={{ ...inp, width }} value={value} min={min} max={max} step={step}
                onChange={e => onChange(Number(e.target.value))} />
}
function Color({ value, onChange }) {
  const isHex = /^#/.test(value || '')
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <input type="color" value={isHex ? value : '#000000'} onChange={e => onChange(e.target.value)}
             style={{ width: 34, height: 28, border: '1px solid var(--border)', borderRadius: 6, padding: 0, background: 'none', cursor: 'pointer' }} />
      <input style={{ ...inp, flex: 1 }} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  )
}
function Slider({ value, onChange, min, max, step = 1 }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input type="range" min={min} max={max} step={step} value={value} style={{ flex: 1 }}
             onChange={e => onChange(Number(e.target.value))} />
      <span style={{ fontSize: 11, color: 'var(--muted)', width: 34, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

const BLANK_DESIGN = () => ({
  id: null, name: 'Untitled design', width: 1080, height: 1080,
  background: { type: 'color', color: '#FFFFFF', color2: '#EEEEEE', angle: 135, url: '' },
  elements: [], is_template: false,
})

export function DesignStudio() {
  const { agent } = useAuth()
  const { toast, state } = useApp()
  const custom = state?.custom || {}
  const brand  = custom.brandColor  || '#CC2200'
  const brand2 = custom.brandColor2 || '#E8650A'

  const [design, setDesign]       = useState(BLANK_DESIGN())
  const [selectedId, setSelected] = useState(null)
  const [editingId, setEditing]   = useState(null)
  const [zoom, setZoom]           = useState(0.5)
  const [history, setHistory]     = useState([])
  const [hIndex, setHIndex]       = useState(-1)
  const [clipboard, setClipboard] = useState(null)
  const [snapV, setSnapV]         = useState(false)
  const [snapH, setSnapH]         = useState(false)
  const [saving, setSaving]       = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showOpen, setShowOpen]   = useState(false)
  const [showListings, setShowListings] = useState(false)
  const [savedList, setSavedList] = useState([])
  const [listings, setListings]   = useState([])
  const [customSize, setCustomSize] = useState({ w: 1080, h: 1080 })

  const canvasRef = useRef(null)
  const dragRef   = useRef(null)   // { mode:'move'|'resize', handle, startX, startY, orig }
  const fileRef   = useRef(null)
  const bgFileRef = useRef(null)

  const sel = design.elements.find(e => e.id === selectedId) || null
  const templates = useMemo(() => builtinTemplates(brand, brand2, custom.orgName, custom.logoUrl), [brand, brand2, custom?.orgName, custom?.logoUrl])

  // ── HISTORY ──────────────────────────────────────────────────────
  const commit = useCallback(next => {
    setDesign(next)
    setHistory(h => {
      const trimmed = h.slice(0, hIndex + 1)
      const out = [...trimmed, clone(next)].slice(-60)
      setHIndex(out.length - 1)
      return out
    })
  }, [hIndex])

  useEffect(() => { // seed history
    setHistory([clone(design)]); setHIndex(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function undo() { if (hIndex > 0) { const i = hIndex - 1; setHIndex(i); setDesign(clone(history[i])); setSelected(null) } }
  function redo() { if (hIndex < history.length - 1) { const i = hIndex + 1; setHIndex(i); setDesign(clone(history[i])); setSelected(null) } }

  // element updates: live (no history) vs committed
  const updateLive = (id, patch) => setDesign(d => ({ ...d, elements: d.elements.map(e => e.id === id ? { ...e, ...patch } : e) }))
  const updateEl   = (id, patch) => commit({ ...design, elements: design.elements.map(e => e.id === id ? { ...e, ...patch } : e) })
  const addEl      = el => { commit({ ...design, elements: [...design.elements, el] }); setSelected(el.id) }
  const removeEl   = id => { commit({ ...design, elements: design.elements.filter(e => e.id !== id) }); if (selectedId === id) setSelected(null) }

  // ── DRAG / RESIZE ────────────────────────────────────────────────
  function startDrag(e, el, mode, handle) {
    if (el.locked) return
    e.stopPropagation(); e.preventDefault()
    setSelected(el.id)
    dragRef.current = { mode, handle, startX: e.clientX, startY: e.clientY, orig: clone(el) }
  }

  useEffect(() => {
    function onMove(e) {
      const d = dragRef.current
      if (!d) return
      const dx = (e.clientX - d.startX) / zoom
      const dy = (e.clientY - d.startY) / zoom
      const o = d.orig
      if (d.mode === 'move') {
        let nx = o.x + dx, ny = o.y + dy
        // snap to canvas center
        const cx = design.width / 2, cy = design.height / 2
        const ecx = nx + o.w / 2, ecy = ny + o.h / 2
        if (Math.abs(ecx - cx) < 8 / zoom) { nx = cx - o.w / 2; setSnapV(true) } else setSnapV(false)
        if (Math.abs(ecy - cy) < 8 / zoom) { ny = cy - o.h / 2; setSnapH(true) } else setSnapH(false)
        updateLive(o.id, { x: Math.round(nx), y: Math.round(ny) })
      } else {
        let { x, y, w, h } = o
        const hnd = d.handle
        if (hnd.includes('e')) w = Math.max(10, o.w + dx)
        if (hnd.includes('s')) h = Math.max(10, o.h + dy)
        if (hnd.includes('w')) { w = Math.max(10, o.w - dx); x = o.x + (o.w - w) }
        if (hnd.includes('n')) { h = Math.max(10, o.h - dy); y = o.y + (o.h - h) }
        updateLive(o.id, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) })
      }
    }
    function onUp() {
      if (dragRef.current) {
        dragRef.current = null
        setSnapV(false); setSnapH(false)
        setDesign(d => { commit(d); return d })
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, design.width, design.height, hIndex])

  // ── KEYBOARD ─────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || editingId
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
      if (typing) return
      if (!sel) return
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeEl(sel.id); return }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateEl(sel); return }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { setClipboard(clone(sel)); return }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { if (clipboard) pasteEl(); return }
      const step = e.shiftKey ? 10 : 1
      if (e.key === 'ArrowLeft')  { e.preventDefault(); updateEl(sel.id, { x: sel.x - step }) }
      if (e.key === 'ArrowRight') { e.preventDefault(); updateEl(sel.id, { x: sel.x + step }) }
      if (e.key === 'ArrowUp')    { e.preventDefault(); updateEl(sel.id, { y: sel.y - step }) }
      if (e.key === 'ArrowDown')  { e.preventDefault(); updateEl(sel.id, { y: sel.y + step }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, clipboard, editingId, hIndex, history])

  function duplicateEl(el) {
    const c = { ...clone(el), id: 'el_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), x: el.x + 24, y: el.y + 24, name: el.name + ' copy' }
    addEl(c)
  }
  function pasteEl() {
    const c = { ...clone(clipboard), id: 'el_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), x: clipboard.x + 24, y: clipboard.y + 24 }
    addEl(c)
  }

  // ── Z-ORDER / ALIGN ─────────────────────────────────────────────
  function reorder(id, dir) {
    const idx = design.elements.findIndex(e => e.id === id)
    const j = idx + dir
    if (idx < 0 || j < 0 || j >= design.elements.length) return
    const els = [...design.elements]
    ;[els[idx], els[j]] = [els[j], els[idx]]
    commit({ ...design, elements: els })
  }
  function alignSel(where) {
    if (!sel) return
    const W = design.width, H = design.height
    const p = {}
    if (where === 'left')    p.x = 0
    if (where === 'centerH') p.x = Math.round((W - sel.w) / 2)
    if (where === 'right')   p.x = W - sel.w
    if (where === 'top')     p.y = 0
    if (where === 'centerV') p.y = Math.round((H - sel.h) / 2)
    if (where === 'bottom')  p.y = H - sel.h
    updateEl(sel.id, p)
  }

  // ── IMAGE UPLOAD ────────────────────────────────────────────────
  async function handleUpload(file, forBackground) {
    if (!file) return
    try {
      toast('Uploading image…')
      const up = await uploadFile(file, 'marketing_designs', design.id || 'drafts')
      if (forBackground) commit({ ...design, background: { ...design.background, type: 'image', url: up.url } })
      else addEl(newImage(up.url, { name: file.name.slice(0, 24) }))
      toast('Image added')
    } catch (e) { toast('Upload failed: ' + e.message, '#DC2626') }
  }

  // ── SAVE / OPEN ─────────────────────────────────────────────────
  async function save() {
    setSaving(true)
    try {
      const row = {
        name: design.name, width: design.width, height: design.height,
        background: design.background, elements: design.elements,
        is_template: !!design.is_template, updated_at: new Date().toISOString(),
      }
      if (design.id) {
        const { error } = await supabase.from('marketing_designs').update(row).eq('id', design.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('marketing_designs')
          .insert({ ...row, created_by: agent?.id || null, created_at: new Date().toISOString() })
          .select('id').single()
        if (error) throw error
        setDesign(d => ({ ...d, id: data.id }))
      }
      toast('Design saved')
    } catch (e) {
      const hint = /does not exist/.test(e.message || '') ? ' — run sql/marketing_design_studio.sql in Supabase' : ''
      toast('Save failed: ' + e.message + hint, '#DC2626')
    } finally { setSaving(false) }
  }

  async function openList() {
    setShowOpen(true)
    try {
      const { data } = await supabase.from('marketing_designs')
        .select('id, name, width, height, is_template, updated_at, created_by')
        .order('updated_at', { ascending: false, nullsFirst: false }).limit(60)
      setSavedList(data || [])
    } catch { setSavedList([]) }
  }
  async function loadDesign(id) {
    try {
      const { data, error } = await supabase.from('marketing_designs').select('*').eq('id', id).single()
      if (error) throw error
      const loaded = { id: data.id, name: data.name, width: data.width, height: data.height,
                       background: data.background || BLANK_DESIGN().background,
                       elements: data.elements || [], is_template: data.is_template }
      commit(loaded); setSelected(null); setShowOpen(false)
    } catch (e) { toast('Could not open: ' + e.message, '#DC2626') }
  }
  async function deleteDesign(id) {
    if (!window.confirm('Delete this design? This cannot be undone.')) return
    await supabase.from('marketing_designs').delete().eq('id', id)
    setSavedList(l => l.filter(d => d.id !== id))
  }

  function applyTemplate(t) {
    commit({ ...BLANK_DESIGN(), name: t.name.replace(/^\S+\s/, ''), width: t.width, height: t.height,
             background: clone(t.background), elements: clone(t.elements) })
    setSelected(null)
  }

  // ── LISTING DATA INSERT ─────────────────────────────────────────
  async function openListings() {
    setShowListings(true)
    const { data } = await supabase.from('listings')
      .select('id, addr, city, list_price, beds, baths, sqft')
      .eq('status', 'Active').order('created_at', { ascending: false }).limit(30)
    setListings(data || [])
  }
  function insertListing(l) {
    const price = l.list_price ? '$' + Number(l.list_price).toLocaleString() : ''
    const specs = [l.beds && l.beds + ' Beds', l.baths && l.baths + ' Baths', l.sqft && Number(l.sqft).toLocaleString() + ' SqFt'].filter(Boolean).join(' · ')
    const els = [
      newText({ x: 80, y: design.height - 360, w: design.width - 160, h: 70, text: [l.addr, l.city].filter(Boolean).join(', '), fontSize: 44, fontWeight: 700, color: '#111111', name: 'Address' }),
      ...(price ? [newText({ x: 80, y: design.height - 270, w: design.width - 160, h: 80, text: price, fontSize: 60, fontWeight: 800, color: brand, name: 'Price' })] : []),
      ...(specs ? [newText({ x: 80, y: design.height - 170, w: design.width - 160, h: 55, text: specs, fontSize: 34, fontWeight: 500, color: '#475569', name: 'Specs' })] : []),
    ]
    commit({ ...design, elements: [...design.elements, ...els] })
    setShowListings(false)
  }

  // ── EXPORT ──────────────────────────────────────────────────────
  async function exportPng(scale) {
    if (!canvasRef.current) return
    setExporting(true)
    const prevZoom = zoom
    setZoom(1); setSelected(null)
    await new Promise(r => setTimeout(r, 120))
    try {
      const canvas = await html2canvas(canvasRef.current, { scale, useCORS: true, backgroundColor: null, logging: false })
      const a = document.createElement('a')
      a.download = (design.name || 'design').replace(/[^a-z0-9_-]+/gi, '_') + '_' + design.width * scale + 'x' + design.height * scale + '.png'
      a.href = canvas.toDataURL('image/png')
      a.click()
      toast('Exported ' + a.download)
    } catch (e) { toast('Export failed: ' + e.message, '#DC2626') }
    setZoom(prevZoom)
    setExporting(false)
  }

  function setPreset(id) {
    const p = PRESETS.find(x => x.id === id)
    if (!p) return
    if (p.id === 'custom') { commit({ ...design, width: customSize.w, height: customSize.h }); return }
    commit({ ...design, width: p.w, height: p.h })
  }

  // fit-zoom on mount / size change
  useEffect(() => {
    const avail = Math.max(320, window.innerWidth - 640)
    const availH = Math.max(320, window.innerHeight - 260)
    setZoom(Math.min(1, avail / design.width, availH / design.height))
  }, [design.width, design.height])

  const bg = design.background

  // ── RENDER ──────────────────────────────────────────────────────
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr 280px', gap: 12, alignItems: 'start' }}>

      {/* ══ LEFT: INSERT / TEMPLATES / BRAND ══ */}
      <div style={{ ...panel, maxHeight: 'calc(100vh - 170px)' }}>
        <span style={lbl}>Add to canvas</span>
        <div style={{ display: 'grid', gap: 6 }}>
          <Btn variant="secondary" onClick={() => addEl(newText())}>🔤 Text</Btn>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <Btn variant="secondary" onClick={() => addEl(newShape('rect'))}>▭</Btn>
            <Btn variant="secondary" onClick={() => addEl(newShape('ellipse'))}>◯</Btn>
            <Btn variant="secondary" onClick={() => addEl(newShape('line'))}>—</Btn>
          </div>
          <Btn variant="secondary" onClick={() => fileRef.current?.click()}>🖼 Upload Image</Btn>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                 onChange={e => { handleUpload(e.target.files?.[0], false); e.target.value = '' }} />
          <Btn variant="secondary" onClick={() => { const u = window.prompt('Image URL:'); if (u) addEl(newImage(u)) }}>🔗 Image from URL</Btn>
          <Btn variant="secondary" onClick={openListings}>🏠 Insert Listing Info</Btn>
        </div>

        <span style={lbl}>Brand kit</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {[brand, brand2, '#0F172A', '#FFFFFF'].map(c => (
            <button key={c} title={'Add ' + c + ' square'}
              onClick={() => addEl(newShape('rect', { fill: c, w: 200, h: 200 }))}
              style={{ width: 26, height: 26, borderRadius: 6, background: c, border: '1px solid var(--border)', cursor: 'pointer' }} />
          ))}
          {custom.logoUrl && <Btn variant="secondary" onClick={() => addEl(newImage(custom.logoUrl, { w: 200, h: 200, fit: 'contain', name: 'Logo' }))}>Logo</Btn>}
        </div>

        <span style={lbl}>Templates</span>
        <div style={{ display: 'grid', gap: 6 }}>
          {templates.map(t => (
            <Btn key={t.name} variant="secondary" onClick={() => applyTemplate(t)}>{t.name}</Btn>
          ))}
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            Your saved templates appear in “My Designs” — turn on “Save as template” to share a design as a starting point for the whole team.
          </div>
        </div>

        <span style={lbl}>Canvas background</span>
        <select style={inp} value={bg.type} onChange={e => commit({ ...design, background: { ...bg, type: e.target.value } })}>
          <option value="color">Solid color</option>
          <option value="gradient">Gradient</option>
          <option value="image">Image</option>
        </select>
        {bg.type !== 'image' && <div style={{ marginTop: 6 }}><Color value={bg.color} onChange={v => commit({ ...design, background: { ...bg, color: v } })} /></div>}
        {bg.type === 'gradient' && (
          <>
            <div style={{ marginTop: 6 }}><Color value={bg.color2} onChange={v => commit({ ...design, background: { ...bg, color2: v } })} /></div>
            <span style={lbl}>Angle</span>
            <Slider min={0} max={360} value={bg.angle || 135} onChange={v => commit({ ...design, background: { ...bg, angle: v } })} />
          </>
        )}
        {bg.type === 'image' && (
          <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
            <Btn variant="secondary" onClick={() => bgFileRef.current?.click()}>Upload background</Btn>
            <input ref={bgFileRef} type="file" accept="image/*" style={{ display: 'none' }}
                   onChange={e => { handleUpload(e.target.files?.[0], true); e.target.value = '' }} />
          </div>
        )}
      </div>

      {/* ══ CENTER: TOOLBAR + CANVAS ══ */}
      <div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <input style={{ ...inp, width: 190, fontWeight: 700 }} value={design.name}
                 onChange={e => setDesign(d => ({ ...d, name: e.target.value }))} />
          <select style={{ ...inp, width: 210 }} value={(PRESETS.find(p => p.w === design.width && p.h === design.height) || { id: 'custom' }).id}
                  onChange={e => setPreset(e.target.value)}>
            {PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <Num width={72} value={design.width}  onChange={v => commit({ ...design, width:  Math.max(100, v) })} />
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>×</span>
          <Num width={72} value={design.height} onChange={v => commit({ ...design, height: Math.max(100, v) })} />
          <Btn variant="secondary" onClick={undo} disabled={hIndex <= 0}>↩︎</Btn>
          <Btn variant="secondary" onClick={redo} disabled={hIndex >= history.length - 1}>↪︎</Btn>
          <select style={{ ...inp, width: 84 }} value={String(zoom)} onChange={e => setZoom(Number(e.target.value))}>
            {[0.25, 0.35, 0.5, 0.75, 1].map(z => <option key={z} value={z}>{Math.round(z * 100)}%</option>)}
          </select>
          <div style={{ flex: 1 }} />
          <Btn variant="secondary" onClick={openList}>📂 My Designs</Btn>
          <Btn variant="secondary" onClick={() => { commit(BLANK_DESIGN()); setSelected(null) }}>＋ New</Btn>
          <Btn onClick={save} loading={saving}>💾 Save</Btn>
          <Btn variant="secondary" onClick={() => exportPng(1)} disabled={exporting}>⬇ PNG</Btn>
          <Btn variant="secondary" onClick={() => exportPng(2)} disabled={exporting}>2×</Btn>
          <Btn variant="secondary" onClick={() => exportPng(3)} disabled={exporting}>3×</Btn>
        </div>

        <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 12,
                      background: 'repeating-conic-gradient(#F1F5F9 0% 25%, #FFFFFF 0% 50%) 50% / 24px 24px',
                      padding: 24, maxHeight: 'calc(100vh - 230px)' }}
             onMouseDown={() => { setSelected(null); setEditing(null) }}>
          <div style={{ transform: 'scale(' + zoom + ')', transformOrigin: 'top left',
                        width: design.width * zoom, height: design.height * zoom }}>
            <div ref={canvasRef}
                 style={{ position: 'relative', width: design.width, height: design.height,
                          ...backgroundStyle(bg), boxShadow: '0 4px 30px rgba(0,0,0,.15)' }}>
              {design.elements.map(el => {
                const isSel = el.id === selectedId
                return (
                  <div key={el.id} style={elementStyle(el)}
                       onMouseDown={e => startDrag(e, el, 'move')}
                       onDoubleClick={e => { if (el.type === 'text' && !el.locked) { e.stopPropagation(); setEditing(el.id) } }}>
                    {el.type === 'text' && (
                      editingId === el.id ? (
                        <textarea autoFocus value={el.text}
                          onChange={e => updateLive(el.id, { text: e.target.value })}
                          onBlur={() => { setEditing(null); commit({ ...design }) }}
                          onMouseDown={e => e.stopPropagation()}
                          style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,.06)', border: '1px dashed #3B82F6',
                                   font: 'inherit', color: 'inherit', letterSpacing: 'inherit', lineHeight: 'inherit',
                                   textAlign: el.align, resize: 'none', outline: 'none', padding: 0 }} />
                      ) : (
                        <div style={{ width: '100%' }}>{el.text}</div>
                      )
                    )}
                    {el.type === 'image' && (
                      el.url
                        ? <img src={el.url} alt="" draggable={false} crossOrigin="anonymous"
                               style={{ width: '100%', height: '100%', objectFit: el.fit, filter: imageFilter(el), display: 'block', pointerEvents: 'none' }} />
                        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 22 }}>🖼 Drop photo here — select & use Properties → Image URL</div>
                    )}
                    {isSel && !el.locked && (
                      <>
                        <div style={{ position: 'absolute', inset: -2, border: '2px solid #3B82F6', pointerEvents: 'none' }} />
                        {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(hd => {
                          const pos = {
                            nw: { left: -7, top: -7 }, n: { left: '50%', top: -7, marginLeft: -6 }, ne: { right: -7, top: -7 },
                            e: { right: -7, top: '50%', marginTop: -6 }, se: { right: -7, bottom: -7 },
                            s: { left: '50%', bottom: -7, marginLeft: -6 }, sw: { left: -7, bottom: -7 },
                            w: { left: -7, top: '50%', marginTop: -6 },
                          }[hd]
                          const cursor = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' }[hd]
                          return <div key={hd} onMouseDown={e => startDrag(e, el, 'resize', hd)}
                                      style={{ position: 'absolute', width: 12, height: 12, background: '#3B82F6',
                                               border: '2px solid #fff', borderRadius: 3, cursor, ...pos }} />
                        })}
                      </>
                    )}
                  </div>
                )
              })}
              {snapV && <div style={{ position: 'absolute', left: design.width / 2, top: 0, bottom: 0, width: 1, background: '#F43F5E', pointerEvents: 'none' }} />}
              {snapH && <div style={{ position: 'absolute', top: design.height / 2, left: 0, right: 0, height: 1, background: '#F43F5E', pointerEvents: 'none' }} />}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
          Double-click text to edit · drag to move · handles to resize · arrows nudge (Shift = 10px) · Ctrl+Z/Y undo/redo · Ctrl+D duplicate · Del removes
        </div>
      </div>

      {/* ══ RIGHT: LAYERS + PROPERTIES ══ */}
      <div style={{ ...panel, maxHeight: 'calc(100vh - 170px)' }}>
        <span style={lbl}>Layers ({design.elements.length})</span>
        <div style={{ display: 'grid', gap: 3, marginBottom: 8, maxHeight: 190, overflowY: 'auto' }}>
          {[...design.elements].reverse().map(el => (
            <div key={el.id} onClick={() => setSelected(el.id)}
                 style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 6px', borderRadius: 6, cursor: 'pointer',
                          background: el.id === selectedId ? 'var(--dim)' : 'transparent', fontSize: 12 }}>
              <span>{el.type === 'text' ? '🔤' : el.type === 'image' ? '🖼' : '▰'}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
                {el.name || el.type}
              </span>
              <button title={el.hidden ? 'Show' : 'Hide'} onClick={e => { e.stopPropagation(); updateEl(el.id, { hidden: !el.hidden }) }}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', opacity: el.hidden ? 0.4 : 1 }}>👁</button>
              <button title={el.locked ? 'Unlock' : 'Lock'} onClick={e => { e.stopPropagation(); updateEl(el.id, { locked: !el.locked }) }}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', opacity: el.locked ? 1 : 0.35 }}>🔒</button>
            </div>
          ))}
          {!design.elements.length && <div style={{ fontSize: 11, color: 'var(--muted)' }}>Empty canvas — add something from the left.</div>}
        </div>

        {sel && (
          <>
            <span style={lbl}>Selected: {sel.name}</span>
            <input style={inp} value={sel.name} onChange={e => updateEl(sel.id, { name: e.target.value })} />
            <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
              <Btn variant="secondary" onClick={() => reorder(sel.id, 1)}>⬆ Fwd</Btn>
              <Btn variant="secondary" onClick={() => reorder(sel.id, -1)}>⬇ Back</Btn>
              <Btn variant="secondary" onClick={() => duplicateEl(sel)}>⧉</Btn>
              <Btn variant="danger" onClick={() => removeEl(sel.id)}>🗑</Btn>
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
              {[['left', '⇤'], ['centerH', '↔'], ['right', '⇥'], ['top', '⤒'], ['centerV', '↕'], ['bottom', '⤓']].map(([k, s]) => (
                <Btn key={k} variant="secondary" onClick={() => alignSel(k)}>{s}</Btn>
              ))}
            </div>

            <span style={lbl}>Position & size</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              <Num width="100%" value={sel.x} onChange={v => updateEl(sel.id, { x: v })} />
              <Num width="100%" value={sel.y} onChange={v => updateEl(sel.id, { y: v })} />
              <Num width="100%" value={sel.w} onChange={v => updateEl(sel.id, { w: Math.max(10, v) })} />
              <Num width="100%" value={sel.h} onChange={v => updateEl(sel.id, { h: Math.max(10, v) })} />
            </div>
            <span style={lbl}>Rotation</span>
            <Slider min={-180} max={180} value={sel.rotation || 0} onChange={v => updateEl(sel.id, { rotation: v })} />
            <span style={lbl}>Opacity</span>
            <Slider min={0} max={1} step={0.05} value={sel.opacity} onChange={v => updateEl(sel.id, { opacity: v })} />

            {sel.type === 'text' && (
              <>
                <span style={lbl}>Font</span>
                <select style={inp} value={sel.fontFamily} onChange={e => updateEl(sel.id, { fontFamily: e.target.value })}>
                  {FONTS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{fontLabel(f)}</option>)}
                </select>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 6 }}>
                  <Num width="100%" value={sel.fontSize} onChange={v => updateEl(sel.id, { fontSize: v })} />
                  <select style={inp} value={sel.fontWeight} onChange={e => updateEl(sel.id, { fontWeight: Number(e.target.value) })}>
                    {[300, 400, 500, 600, 700, 800, 900].map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                  {['left', 'center', 'right'].map(a => (
                    <Btn key={a} variant={sel.align === a ? 'primary' : 'secondary'} onClick={() => updateEl(sel.id, { align: a })}>
                      {a === 'left' ? '⯇' : a === 'center' ? '≡' : '⯈'}
                    </Btn>
                  ))}
                  <Btn variant={sel.fontStyle === 'italic' ? 'primary' : 'secondary'}
                       onClick={() => updateEl(sel.id, { fontStyle: sel.fontStyle === 'italic' ? 'normal' : 'italic' })}>I</Btn>
                </div>
                <span style={lbl}>Color</span>
                <Color value={sel.color} onChange={v => updateEl(sel.id, { color: v })} />
                <span style={lbl}>Letter spacing / line height</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  <Num width="100%" value={sel.letterSpacing} step={0.5} onChange={v => updateEl(sel.id, { letterSpacing: v })} />
                  <Num width="100%" value={sel.lineHeight} step={0.05} onChange={v => updateEl(sel.id, { lineHeight: v })} />
                </div>
                <span style={lbl}>Outline width / color</span>
                <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 4 }}>
                  <Num width="100%" value={sel.strokeWidth} onChange={v => updateEl(sel.id, { strokeWidth: v })} />
                  <Color value={sel.strokeColor} onChange={v => updateEl(sel.id, { strokeColor: v })} />
                </div>
              </>
            )}

            {(sel.type === 'rect' || sel.type === 'ellipse') && (
              <>
                <span style={lbl}>Fill</span>
                <Color value={sel.fill} onChange={v => updateEl(sel.id, { fill: v })} />
                <div style={{ marginTop: 6 }}>
                  <Toggle value={sel.gradientOn} onChange={v => updateEl(sel.id, { gradientOn: v })} label="Gradient" />
                </div>
                {sel.gradientOn && (
                  <>
                    <div style={{ marginTop: 6 }}><Color value={sel.fill2} onChange={v => updateEl(sel.id, { fill2: v })} /></div>
                    <Slider min={0} max={360} value={sel.gradientAngle} onChange={v => updateEl(sel.id, { gradientAngle: v })} />
                  </>
                )}
                {sel.type === 'rect' && (<><span style={lbl}>Corner radius</span>
                  <Slider min={0} max={200} value={sel.radius} onChange={v => updateEl(sel.id, { radius: v })} /></>)}
                <span style={lbl}>Border width / color</span>
                <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 4 }}>
                  <Num width="100%" value={sel.borderWidth} onChange={v => updateEl(sel.id, { borderWidth: v })} />
                  <Color value={sel.borderColor} onChange={v => updateEl(sel.id, { borderColor: v })} />
                </div>
              </>
            )}

            {sel.type === 'image' && (
              <>
                <span style={lbl}>Image URL</span>
                <input style={inp} value={sel.url} onChange={e => updateEl(sel.id, { url: e.target.value })} placeholder="Paste an image URL" />
                <span style={lbl}>Fit</span>
                <select style={inp} value={sel.fit} onChange={e => updateEl(sel.id, { fit: e.target.value })}>
                  <option value="cover">Cover (fill & crop)</option>
                  <option value="contain">Contain (fit inside)</option>
                  <option value="fill">Stretch</option>
                </select>
                <span style={lbl}>Corner radius</span>
                <Slider min={0} max={300} value={sel.radius} onChange={v => updateEl(sel.id, { radius: v })} />
                <span style={lbl}>Adjustments</span>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>Brightness</div>
                <Slider min={0} max={200} value={sel.brightness} onChange={v => updateEl(sel.id, { brightness: v })} />
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>Contrast</div>
                <Slider min={0} max={200} value={sel.contrast} onChange={v => updateEl(sel.id, { contrast: v })} />
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>Saturation</div>
                <Slider min={0} max={200} value={sel.saturate} onChange={v => updateEl(sel.id, { saturate: v })} />
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>Blur</div>
                <Slider min={0} max={20} value={sel.blur} onChange={v => updateEl(sel.id, { blur: v })} />
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>Grayscale</div>
                <Slider min={0} max={100} value={sel.grayscale} onChange={v => updateEl(sel.id, { grayscale: v })} />
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>Sepia</div>
                <Slider min={0} max={100} value={sel.sepia} onChange={v => updateEl(sel.id, { sepia: v })} />
              </>
            )}

            <span style={lbl}>Shadow</span>
            <Toggle value={sel.shadowOn} onChange={v => updateEl(sel.id, { shadowOn: v })} label="Drop shadow" />
            {sel.shadowOn && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginTop: 6 }}>
                <Num width="100%" value={sel.shadowX} onChange={v => updateEl(sel.id, { shadowX: v })} />
                <Num width="100%" value={sel.shadowY} onChange={v => updateEl(sel.id, { shadowY: v })} />
                <Num width="100%" value={sel.shadowBlur} onChange={v => updateEl(sel.id, { shadowBlur: v })} />
              </div>
            )}
          </>
        )}

        {!sel && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>Select an element on the canvas to edit its properties.</div>}

        <span style={lbl}>Save as team template</span>
        <Toggle value={!!design.is_template} onChange={v => setDesign(d => ({ ...d, is_template: v }))}
                label="Show in team templates" />
      </div>

      {/* ══ MODALS ══ */}
      <Modal open={showOpen} onClose={() => setShowOpen(false)} title="My Designs & Team Templates" width={620}>
        <div style={{ display: 'grid', gap: 6, maxHeight: 420, overflowY: 'auto' }}>
          {savedList.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8 }}>
              <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => loadDesign(d.id)}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                  {d.is_template ? '⭐ ' : ''}{d.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{d.width}×{d.height}{d.updated_at ? ' · ' + new Date(d.updated_at).toLocaleDateString() : ''}</div>
              </div>
              <Btn variant="secondary" onClick={() => loadDesign(d.id)}>Open</Btn>
              <Btn variant="secondary" onClick={() => deleteDesign(d.id)}>🗑</Btn>
            </div>
          ))}
          {!savedList.length && <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No saved designs yet.</div>}
        </div>
        <ModalActions><Btn variant="secondary" onClick={() => setShowOpen(false)}>Close</Btn></ModalActions>
      </Modal>

      <Modal open={showListings} onClose={() => setShowListings(false)} title="Insert Listing Info" width={560}>
        <div style={{ display: 'grid', gap: 6, maxHeight: 400, overflowY: 'auto' }}>
          {listings.map(l => (
            <div key={l.id} onClick={() => insertListing(l)}
                 style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{[l.addr, l.city].filter(Boolean).join(', ')}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                {l.list_price ? '$' + Number(l.list_price).toLocaleString() : ''} {l.beds ? '· ' + l.beds + ' bd' : ''} {l.baths ? '· ' + l.baths + ' ba' : ''}
              </div>
            </div>
          ))}
          {!listings.length && <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No active listings found.</div>}
        </div>
        <ModalActions><Btn variant="secondary" onClick={() => setShowListings(false)}>Close</Btn></ModalActions>
      </Modal>
    </div>
  )
}
