// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Design Studio
// A Canva-style graphic editor inside the Marketing board:
//   • Canvas presets (IG post/story, FB, flyer, business card, custom)
//   • Text with full typography control (font, size, weight, color,
//     align, spacing, line height, shadow, outline)
//   • Shapes (rectangle, ellipse, line) with solid/gradient fills,
//     borders, corner radius, shadows, opacity
//   • Images (upload to Supabase storage or paste URL) with fit
//     modes, rounding, borders, and Photoshop-style adjustments
//     (brightness, contrast, saturation, blur, grayscale, sepia)
//   • Layers panel (reorder, lock, hide, rename, duplicate, delete)
//   • Drag, resize handles, rotation, align-to-canvas, center snap
//   • Undo/redo, copy/paste/duplicate, arrow-key nudging
//   • Brand kit (org colors + logo one click away)
//   • Built-in listing templates + save-your-own templates
//   • Insert live listing data (address, price, beds/baths)
//   • Export PNG at 1x / 2x / 3x via html2canvas
// Designs persist in marketing_designs (run
// sql/marketing_design_studio.sql first).
//
// NOTE: no template literals anywhere in this file on purpose —
// scripts/validate.js flags them in JSX files (known repo gotcha).
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { supabase } from '../lib/supabase'
import { uploadFile } from '../lib/storage'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { Btn, Modal, ModalActions, Toggle } from '../components/UI'

// ── CANVAS PRESETS ─────────────────────────────────────────────────
const PRESETS = [
  { id: 'ig_post',  label: 'Instagram Post 1080×1080', w: 1080, h: 1080 },
  { id: 'ig_story', label: 'Instagram Story 1080×1920', w: 1080, h: 1920 },
  { id: 'fb_post',  label: 'Facebook Post 1200×630',   w: 1200, h: 630  },
  { id: 'flyer',    label: 'Flyer 8.5×11" (2550×3300)', w: 2550, h: 3300 },
  { id: 'card',     label: 'Business Card (1050×600)',  w: 1050, h: 600  },
  { id: 'custom',   label: 'Custom size…',              w: 0,    h: 0    },
]

const FONTS = [
  'Inter, system-ui, sans-serif',
  'Georgia, serif',
  '"Times New Roman", Times, serif',
  'Arial, Helvetica, sans-serif',
  '"Trebuchet MS", sans-serif',
  'Verdana, Geneva, sans-serif',
  '"Palatino Linotype", Palatino, serif',
  'Garamond, serif',
  'Impact, Haettenschweiler, sans-serif',
  '"Courier New", Courier, monospace',
  '"Brush Script MT", cursive',
  '"Comic Sans MS", cursive',
]
const fontLabel = f => f.split(',')[0].replace(/"/g, '')

let _idc = 0
const uid = () => 'el_' + Date.now().toString(36) + '_' + (++_idc)

// ── ELEMENT FACTORIES ──────────────────────────────────────────────
export function newText(over = {}) {
  return {
    id: uid(), type: 'text', name: 'Text',
    x: 80, y: 80, w: 500, h: 90, rotation: 0, opacity: 1, locked: false, hidden: false,
    text: 'Your text here', fontFamily: FONTS[0], fontSize: 48, fontWeight: 700,
    fontStyle: 'normal', color: '#111111', align: 'left', letterSpacing: 0, lineHeight: 1.2,
    shadowOn: false, shadowX: 0, shadowY: 4, shadowBlur: 12, shadowColor: 'rgba(0,0,0,.35)',
    strokeWidth: 0, strokeColor: '#000000',
    ...over,
  }
}
export function newShape(kind, over = {}) {
  return {
    id: uid(), type: kind, name: kind === 'rect' ? 'Rectangle' : (kind === 'ellipse' ? 'Ellipse' : 'Shape'),
    x: 120, y: 120, w: 320, h: kind === 'line' ? 6 : 220, rotation: 0, opacity: 1, locked: false, hidden: false,
    fill: '#CC2200', gradientOn: false, fill2: '#E8650A', gradientAngle: 135,
    borderWidth: 0, borderColor: '#000000', radius: kind === 'ellipse' ? 999 : 0,
    shadowOn: false, shadowX: 0, shadowY: 8, shadowBlur: 24, shadowColor: 'rgba(0,0,0,.30)',
    ...over,
    ...(kind === 'line' ? { type: 'rect', name: 'Line' } : {}),
  }
}
export function newImage(url, over = {}) {
  return {
    id: uid(), type: 'image', name: 'Image',
    x: 140, y: 140, w: 480, h: 320, rotation: 0, opacity: 1, locked: false, hidden: false,
    url: url || '', fit: 'cover', radius: 0, borderWidth: 0, borderColor: '#000000',
    brightness: 100, contrast: 100, saturate: 100, blur: 0, grayscale: 0, sepia: 0,
    shadowOn: false, shadowX: 0, shadowY: 8, shadowBlur: 24, shadowColor: 'rgba(0,0,0,.30)',
    ...over,
  }
}

// ── BUILT-IN TEMPLATES ────────────────────────────────────────────
// Built from the org's brand colors so they always match the team's
// look, and fully editable once inserted.
export function builtinTemplates(brand, brand2, orgName, logoUrl) {
  const money = { fontFamily: FONTS[1] }
  const t = []

  t.push({ name: '🏠 Coming Soon', width: 1080, height: 1080,
    background: { type: 'gradient', color: '#0F172A', color2: '#1E293B', angle: 160 },
    elements: [
      newShape('rect', { x: 0, y: 780, w: 1080, h: 300, fill: brand, gradientOn: true, fill2: brand2, gradientAngle: 90, name: 'Brand band' }),
      newText({ x: 90, y: 120, w: 900, h: 130, text: 'COMING SOON', fontSize: 110, fontWeight: 900, color: '#FFFFFF', letterSpacing: 6, name: 'Headline' }),
      newText({ x: 90, y: 280, w: 900, h: 70, text: '123 Main Street, Monsey NY', fontSize: 44, fontWeight: 600, color: '#E2E8F0', name: 'Address' }),
      newText({ x: 90, y: 380, w: 900, h: 80, text: '$1,250,000', fontSize: 64, fontWeight: 800, color: brand2, name: 'Price', ...money }),
      newText({ x: 90, y: 500, w: 900, h: 60, text: '5 Beds · 3 Baths · 3,200 SqFt', fontSize: 36, fontWeight: 500, color: '#CBD5E1', name: 'Specs' }),
      newText({ x: 90, y: 830, w: 900, h: 60, text: orgName || 'Target Team — Keller Williams', fontSize: 40, fontWeight: 800, color: '#FFFFFF', name: 'Team' }),
      newText({ x: 90, y: 905, w: 900, h: 50, text: 'Call today for a private showing', fontSize: 30, fontWeight: 500, color: 'rgba(255,255,255,.9)', name: 'CTA' }),
      ...(logoUrl ? [newImage(logoUrl, { x: 860, y: 830, w: 150, h: 150, fit: 'contain', name: 'Logo' })] : []),
    ] })

  t.push({ name: '🔑 For Sale', width: 1080, height: 1080,
    background: { type: 'color', color: '#FFFFFF' },
    elements: [
      newImage('', { x: 0, y: 0, w: 1080, h: 640, fit: 'cover', name: 'Property photo' }),
      newShape('rect', { x: 0, y: 640, w: 1080, h: 440, fill: '#FFFFFF', name: 'Lower panel' }),
      newShape('rect', { x: 60, y: 600, w: 320, h: 90, fill: brand, radius: 12, shadowOn: true, name: 'Price tag' }),
      newText({ x: 60, y: 618, w: 320, h: 60, text: '$899,000', fontSize: 44, fontWeight: 800, color: '#FFFFFF', align: 'center', name: 'Price' }),
      newText({ x: 60, y: 730, w: 960, h: 70, text: 'FOR SALE', fontSize: 60, fontWeight: 900, color: '#0F172A', letterSpacing: 4, name: 'Headline' }),
      newText({ x: 60, y: 820, w: 960, h: 55, text: '123 Main Street, Monsey NY', fontSize: 38, fontWeight: 600, color: '#334155', name: 'Address' }),
      newText({ x: 60, y: 890, w: 960, h: 50, text: '5 Beds · 3 Baths · 3,200 SqFt', fontSize: 30, fontWeight: 500, color: '#64748B', name: 'Specs' }),
      newText({ x: 60, y: 970, w: 960, h: 50, text: orgName || 'Target Team — Keller Williams', fontSize: 30, fontWeight: 800, color: brand, name: 'Team' }),
    ] })

  t.push({ name: '🎉 Just Sold', width: 1080, height: 1080,
    background: { type: 'gradient', color: brand, color2: brand2, angle: 135 },
    elements: [
      newShape('rect', { x: 70, y: 70, w: 940, h: 940, fill: 'rgba(255,255,255,0)', borderWidth: 4, borderColor: 'rgba(255,255,255,.85)', radius: 8, name: 'Frame' }),
      newText({ x: 120, y: 200, w: 840, h: 140, text: 'JUST SOLD', fontSize: 120, fontWeight: 900, color: '#FFFFFF', align: 'center', letterSpacing: 8, shadowOn: true, name: 'Headline' }),
      newText({ x: 120, y: 400, w: 840, h: 60, text: '123 Main Street, Monsey NY', fontSize: 42, fontWeight: 600, color: 'rgba(255,255,255,.95)', align: 'center', name: 'Address' }),
      newText({ x: 120, y: 520, w: 840, h: 60, text: 'Another happy family home', fontSize: 34, fontWeight: 500, fontStyle: 'italic', color: 'rgba(255,255,255,.85)', align: 'center', name: 'Sub' }),
      newText({ x: 120, y: 800, w: 840, h: 60, text: orgName || 'Target Team — Keller Williams', fontSize: 38, fontWeight: 800, color: '#FFFFFF', align: 'center', name: 'Team' }),
    ] })

  t.push({ name: '🚪 Open House', width: 1080, height: 1920,
    background: { type: 'color', color: '#0F172A' },
    elements: [
      newImage('', { x: 0, y: 0, w: 1080, h: 900, fit: 'cover', name: 'Property photo' }),
      newShape('rect', { x: 0, y: 840, w: 1080, h: 200, fill: brand, name: 'Band' }),
      newText({ x: 60, y: 880, w: 960, h: 120, text: 'OPEN HOUSE', fontSize: 92, fontWeight: 900, color: '#FFFFFF', align: 'center', letterSpacing: 6, name: 'Headline' }),
      newText({ x: 60, y: 1120, w: 960, h: 70, text: 'Sunday · 1:00 – 3:00 PM', fontSize: 52, fontWeight: 700, color: brand2, align: 'center', name: 'When' }),
      newText({ x: 60, y: 1230, w: 960, h: 60, text: '123 Main Street, Monsey NY', fontSize: 40, fontWeight: 600, color: '#E2E8F0', align: 'center', name: 'Address' }),
      newText({ x: 60, y: 1330, w: 960, h: 55, text: '$1,250,000 · 5 Beds · 3 Baths', fontSize: 36, fontWeight: 500, color: '#CBD5E1', align: 'center', name: 'Specs' }),
      newText({ x: 60, y: 1680, w: 960, h: 55, text: orgName || 'Target Team — Keller Williams', fontSize: 38, fontWeight: 800, color: '#FFFFFF', align: 'center', name: 'Team' }),
    ] })

  return t
}

// ── SMALL HELPERS ─────────────────────────────────────────────────
export const clone = o => JSON.parse(JSON.stringify(o))

export function elementStyle(el) {
  const base = {
    position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h,
    transform: 'rotate(' + (el.rotation || 0) + 'deg)',
    opacity: el.hidden ? 0 : el.opacity,
    pointerEvents: el.hidden ? 'none' : undefined,
  }
  const shadow = el.shadowOn ? (el.shadowX + 'px ' + el.shadowY + 'px ' + el.shadowBlur + 'px ' + el.shadowColor) : 'none'

  if (el.type === 'text') {
    return { ...base, display: 'flex', alignItems: 'flex-start',
      fontFamily: el.fontFamily, fontSize: el.fontSize, fontWeight: el.fontWeight,
      fontStyle: el.fontStyle, color: el.color, textAlign: el.align,
      letterSpacing: el.letterSpacing + 'px', lineHeight: el.lineHeight,
      textShadow: el.shadowOn ? shadow : 'none',
      WebkitTextStroke: el.strokeWidth > 0 ? (el.strokeWidth + 'px ' + el.strokeColor) : undefined,
      whiteSpace: 'pre-wrap', wordBreak: 'break-word', userSelect: 'none' }
  }
  if (el.type === 'rect' || el.type === 'ellipse') {
    return { ...base,
      background: el.gradientOn
        ? 'linear-gradient(' + el.gradientAngle + 'deg, ' + el.fill + ', ' + el.fill2 + ')'
        : el.fill,
      borderRadius: el.type === 'ellipse' ? '50%' : el.radius,
      border: el.borderWidth > 0 ? (el.borderWidth + 'px solid ' + el.borderColor) : 'none',
      boxShadow: shadow }
  }
  if (el.type === 'image') {
    return { ...base, borderRadius: el.radius, overflow: 'hidden',
      border: el.borderWidth > 0 ? (el.borderWidth + 'px solid ' + el.borderColor) : 'none',
      boxShadow: shadow, background: el.url ? 'transparent' : '#E2E8F0' }
  }
  return base
}

export function imageFilter(el) {
  return 'brightness(' + el.brightness + '%) contrast(' + el.contrast + '%) saturate(' + el.saturate + '%) blur(' + el.blur + 'px) grayscale(' + el.grayscale + '%) sepia(' + el.sepia + '%)'
}

export function backgroundStyle(bg) {
  if (!bg) return { background: '#FFFFFF' }
  if (bg.type === 'gradient') return { background: 'linear-gradient(' + (bg.angle || 135) + 'deg, ' + bg.color + ', ' + bg.color2 + ')' }
  if (bg.type === 'image' && bg.url) return { backgroundImage: 'url(' + bg.url + ')', backgroundSize: 'cover', backgroundPosition: 'center' }
  return { background: bg.color || '#FFFFFF' }
}

export { PRESETS, FONTS, fontLabel }
