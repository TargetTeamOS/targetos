// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Bulk Edit Bar
// Appears when multiple records are selected. Allows changing
// a single field across all selected records at once.
// Props:
//   selectedIds  — array of selected record IDs
//   table        — 'contacts' | 'deals' | 'listings' | 'tasks'
//   fields       — array of { key, label, type, options }
//   onDone       — called after successful bulk edit with count
//   onClear      — called to clear selection
// ═══════════════════════════════════════════════════════════════
import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

export function BulkEditBar({ selectedIds = [], table, fields = [], onDone, onClear, agents = [], allIds = null, onSelectAll = null }) {
  const { toast } = useApp()
  const [editField, setEditField] = useState('')
  const [editValue, setEditValue] = useState('')
  const [applying,  setApplying]  = useState(false)

  if (!selectedIds.length && !(allIds && allIds.length)) return null
  if (!selectedIds.length && allIds && onSelectAll) return null  // bar shows only once something is selected; select-all lives in the bar below

  const field = fields.find(f => f.key === editField)

  async function applyBulkEdit() {
    if (!editField || editValue === '') { toast('Choose a field and value', '#F5A623'); return }
    if (!window.confirm('Update "' + (field?.label||editField) + '" for ' + selectedIds.length + ' records?')) return

    setApplying(true)
    try {
      // Batch in groups of 100 to stay within URL limits
      const BATCH = 100
      let updated = 0
      for (let i = 0; i < selectedIds.length; i += BATCH) {
        const chunk = selectedIds.slice(i, i+BATCH)
        const { error } = await supabase.from(table).update({
          [editField]: editValue || null,
          updated_at: new Date().toISOString(),
        }).in('id', chunk)
        if (error) throw error
        updated += chunk.length
      }
      toast('✅ Updated ' + updated + ' records')
      setEditField(''); setEditValue('')
      if (onDone) onDone(updated)
    } catch(e) { toast('Bulk edit failed: ' + e.message, '#DC2626') }
    finally { setApplying(false) }
  }

  const S = { padding:'6px 10px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff }

  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:'#1B2B4B', borderRadius:10, marginBottom:12, flexWrap:'wrap', fontFamily:ff }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
        <div style={{ width:24, height:24, borderRadius:'50%', background:'#CC2200', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800 }}>{selectedIds.length}</div>
        <span style={{ fontSize:12, fontWeight:700, color:'#fff' }}>selected</span>
      </div>

      <div style={{ width:1, height:24, background:'rgba(255,255,255,.15)', flexShrink:0 }} />

      <span style={{ fontSize:11, color:'rgba(255,255,255,.5)', flexShrink:0 }}>Change:</span>
      <select value={editField} onChange={e => { setEditField(e.target.value); setEditValue('') }} style={{ ...S, background:'rgba(255,255,255,.1)', color:'#fff', border:'1px solid rgba(255,255,255,.2)' }}>
        <option value="">— Select field —</option>
        {fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>

      {editField && field && (
        field.type === 'select' ? (
          <select value={editValue} onChange={e => setEditValue(e.target.value)} style={{ ...S, background:'rgba(255,255,255,.1)', color:'#fff', border:'1px solid rgba(255,255,255,.2)' }}>
            <option value="">— Select value —</option>
            {(field.options||[]).map(o => <option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
          </select>
        ) : field.type === 'agent' ? (
          <select value={editValue} onChange={e => setEditValue(e.target.value)} style={{ ...S, background:'rgba(255,255,255,.1)', color:'#fff', border:'1px solid rgba(255,255,255,.2)' }}>
            <option value="">— Select agent —</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        ) : (
          <input value={editValue} onChange={e => setEditValue(e.target.value)} placeholder="New value"
            style={{ ...S, background:'rgba(255,255,255,.1)', color:'#fff', border:'1px solid rgba(255,255,255,.2)', width:140 }} />
        )
      )}

      {editField && (
        <button onClick={applyBulkEdit} disabled={applying||!editValue}
          style={{ padding:'6px 14px', borderRadius:7, border:'none', background:'#CC2200', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff, opacity:editValue&&!applying?1:.5, flexShrink:0 }}>
          {applying ? 'Updating...' : 'Apply to all'}
        </button>
      )}

      <div style={{ flex:1 }} />

      {allIds && onSelectAll && selectedIds.length < allIds.length && (
          <button onClick={() => onSelectAll(allIds)}
            style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', fontSize:12, fontWeight:700, cursor:'pointer' }}>
            Select all {allIds.length}
          </button>
        )}
        <button onClick={onClear}
        style={{ padding:'5px 12px', borderRadius:7, border:'1px solid rgba(255,255,255,.2)', background:'transparent', color:'rgba(255,255,255,.5)', fontSize:11, cursor:'pointer', fontFamily:ff, flexShrink:0 }}>
        Clear selection
      </button>
    </div>
  )
}
