// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Import / Export Component
// Drop-in component for any board page.
// Export: downloads the current filtered dataset as CSV.
// Import: uploads a CSV, previews the rows, then upserts to Supabase.
// Usage: <ImportExport table="deals" data={filtered} columns={COLS} onImport={handleImport} />
// ═══════════════════════════════════════════════════════════════

import React, { useState, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// ── CSV HELPERS ───────────────────────────────────────────────────
function toCSV(rows, columns) {
  const header = columns.map(c => `"${c.label}"`).join(',')
  const lines  = rows.map(row =>
    columns.map(c => {
      const val = row[c.key]
      if (val === null || val === undefined) return ''
      const str = String(val).replace(/"/g, '""')
      return `"${str}"`
    }).join(',')
  )
  return [header, ...lines].join('\r\n')
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return { headers: [], rows: [] }
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim())
  const rows = lines.slice(1).map(line => {
    // Handle quoted fields with commas inside
    const vals = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"' && !inQ) { inQ = true; continue }
      if (ch === '"' && inQ && line[i+1] === '"') { cur += '"'; i++; continue }
      if (ch === '"' && inQ) { inQ = false; continue }
      if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; continue }
      cur += ch
    }
    vals.push(cur.trim())
    const obj = {}
    headers.forEach((h, i) => { obj[h] = vals[i] || '' })
    return obj
  })
  return { headers, rows }
}

function downloadFile(content, filename, type = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── MAIN COMPONENT ────────────────────────────────────────────────
export function ImportExport({ table, data = [], columns = [], onImport, label = 'Records' }) {
  const { toast } = useApp()
  const [open,        setOpen]        = useState(false)
  const [mode,        setMode]        = useState('export') // 'export' | 'import'
  const [preview,     setPreview]     = useState(null)    // { headers, rows }
  const [mapping,     setMapping]     = useState({})      // csvHeader → dbColumn
  const [dupMode,     setDupMode]     = useState('skip')  // 'skip' | 'update'
  const [importing,   setImporting]   = useState(false)
  const [importDone,  setImportDone]  = useState(null)    // { inserted, skipped, updated, errors }
  const fileRef = useRef(null)

  // ── EXPORT ─────────────────────────────────────────────────────
  function doExport() {
    if (!data.length) { toast('No data to export', '#F5A623'); return }
    const csv  = toCSV(data, columns)
    const name = `${table}_export_${new Date().toISOString().slice(0,10)}.csv`
    downloadFile(csv, name)
    toast(`✅ Exported ${data.length} ${label.toLowerCase()}`)
    setOpen(false)
  }

  function doExportTemplate() {
    const header = columns.map(c => `"${c.label}"`).join(',')
    const sample = columns.map(c => `"${c.example || ''}"` ).join(',')
    const csv    = [header, sample].join('\r\n')
    downloadFile(csv, `${table}_import_template.csv`)
    toast('✅ Template downloaded')
  }

  // ── IMPORT: file pick ─────────────────────────────────────────
  function onFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const { headers, rows } = parseCSV(ev.target.result)
      if (!rows.length) { toast('CSV is empty or invalid', '#DC2626'); return }
      // Auto-map CSV headers to column keys
      const autoMap = {}
      headers.forEach(h => {
        const col = columns.find(c => c.label.toLowerCase() === h.toLowerCase() || c.key.toLowerCase() === h.toLowerCase())
        if (col) autoMap[h] = col.key
      })
      setMapping(autoMap)
      setPreview({ headers, rows: rows.slice(0, 5), allRows: rows })
      setImportDone(null)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // ── IMPORT: execute ───────────────────────────────────────────
  async function doImport() {
    if (!preview) return
    setImporting(true)
    const { allRows } = preview
    let inserted = 0, updated = 0, skipped = 0, errors = []

    for (const row of allRows) {
      // Build record from mapping
      const record = {}
      Object.entries(mapping).forEach(([csvH, dbKey]) => {
        if (dbKey && row[csvH] !== undefined) {
          const col = columns.find(c => c.key === dbKey)
          let val = row[csvH]
          if (col?.type === 'number') val = parseFloat(val) || null
          if (col?.type === 'date' && val) val = val.slice(0, 10)
          if (val === '') val = null
          record[dbKey] = val
        }
      })

      if (!record.addr && !record.name && !record.title) { errors.push('Skipped row — no identifier'); continue }

      try {
        // Check if exists by address/name
        const idField = record.addr ? 'addr' : record.name ? 'name' : 'title'
        if (!record[idField]) { errors.push('Skipped row — no identifier field'); continue }
        const { data: existing } = await supabase.from(table).select('id').eq(idField, record[idField]).maybeSingle()
        if (existing?.id) {
          if (dupMode === 'skip') {
            skipped++
          } else {
            await supabase.from(table).update({ ...record, updated_at: new Date().toISOString() }).eq('id', existing.id)
            updated++
          }
        } else {
          await supabase.from(table).insert({ ...record, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          inserted++
        }
      } catch(e) {
        errors.push(e.message)
      }
    }

    setImportDone({ inserted, updated, skipped, errors })
    setImporting(false)
    if (onImport) onImport()
    toast(`✅ Import complete: ${inserted} added, ${skipped} skipped, ${updated} updated${errors.length ? `, ${errors.length} errors` : ''}`)
  }

  if (!open) {
    return (
      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          onClick={() => { setOpen(true); setMode('export'); setPreview(null); setImportDone(null) }}
          style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: ff }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--brand)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
          ⬇ Export
        </button>
        <button
          onClick={() => { setOpen(true); setMode('import'); setPreview(null); setImportDone(null) }}
          style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: ff }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--brand)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
          ⬆ Import
        </button>
      </div>
    )
  }

  return (
    <div onClick={e => e.target === e.currentTarget && setOpen(false)}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: ff }}>
      <div style={{ background: 'var(--panel)', borderRadius: '14px', width: '100%', maxWidth: '640px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,.3)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', background: 'var(--dim)', borderRadius: '8px', padding: '3px', gap: '2px' }}>
            {[['export','⬇ Export'],['import','⬆ Import']].map(([m,l]) => (
              <button key={m} onClick={() => { setMode(m); setPreview(null); setImportDone(null) }}
                style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', background: mode === m ? 'var(--panel)' : 'transparent', color: mode === m ? 'var(--text)' : 'var(--muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: ff, boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,.12)' : 'none' }}>
                {l}
              </button>
            ))}
          </div>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--muted)' }}>{label}</span>
          <button onClick={() => setOpen(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>

          {/* ── EXPORT MODE ── */}
          {mode === 'export' && (
            <div>
              <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px', lineHeight: 1.5 }}>
                Export <strong style={{ color: 'var(--text)' }}>{data.length} {label.toLowerCase()}</strong> as a CSV file. The file will include all visible columns and can be opened in Excel or Google Sheets.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                {columns.map(c => (
                  <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 10px', background: 'var(--dim)', borderRadius: '7px', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--muted)' }}>
                    <span>✓</span> {c.label}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={doExport}
                  style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: '#CC2200', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>
                  ⬇ Download CSV ({data.length} rows)
                </button>
              </div>
            </div>
          )}

          {/* ── IMPORT MODE ── */}
          {mode === 'import' && !preview && (
            <div>
              <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px', lineHeight: 1.5 }}>
                Upload a CSV file to import {label.toLowerCase()} in bulk. New records will be created; existing records (matched by address/name) will be updated.
              </div>

              {/* Drop zone */}
              <div
                onClick={() => fileRef.current?.click()}
                style={{ border: '2px dashed var(--border)', borderRadius: '10px', padding: '32px', textAlign: 'center', cursor: 'pointer', marginBottom: '14px', transition: 'border-color .15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#CC2200'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📂</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>Click to select a CSV file</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>or drag and drop here</div>
              </div>
              <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={onFileChange} />

              {/* Download template */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'var(--dim)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '14px' }}>📋</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>Download import template</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Get a CSV with the correct column headers and an example row</div>
                </div>
                <button onClick={doExportTemplate}
                  style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: ff }}>
                  ⬇ Template
                </button>
              </div>
            </div>
          )}

          {/* ── IMPORT PREVIEW + MAPPING ── */}
          {mode === 'import' && preview && !importDone && (
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
                Map CSV columns → {label} fields
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '14px' }}>
                {preview.allRows.length} rows detected. Map each CSV column to a {label.slice(0,-1).toLowerCase()} field.
              </div>

              {/* Duplicate handling */}
              <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 12px', background:'var(--dim)', borderRadius:'8px', border:'1px solid var(--border)', marginBottom:'14px' }}>
                <span style={{ fontSize:'14px' }}>🔁</span>
                <span style={{ fontSize:'12px', fontWeight:700, color:'var(--text)', flex:1 }}>If a record already exists (same address/name):</span>
                <div style={{ display:'flex', background:'var(--panel)', borderRadius:'7px', padding:'2px', gap:'2px' }}>
                  {[['skip','⏭ Skip it'],['update','✏️ Update it']].map(([m,l]) => (
                    <button key={m} onClick={() => setDupMode(m)}
                      style={{ padding:'4px 10px', borderRadius:'5px', border:'none', background: dupMode===m ? '#CC2200' : 'transparent', color: dupMode===m ? '#fff' : 'var(--muted)', fontSize:'11px', fontWeight:700, cursor:'pointer', fontFamily:ff }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mapping rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                {preview.headers.map(h => (
                  <div key={h} style={{ display: 'grid', gridTemplateColumns: '1fr 24px 1fr', alignItems: 'center', gap: '8px' }}>
                    <div style={{ padding: '6px 10px', background: 'var(--dim)', borderRadius: '7px', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {h}
                    </div>
                    <span style={{ textAlign: 'center', color: 'var(--muted)' }}>→</span>
                    <select value={mapping[h] || ''} onChange={e => setMapping(m => ({ ...m, [h]: e.target.value }))}
                      style={{ padding: '6px 8px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '12px', fontFamily: ff }}>
                      <option value="">— Skip —</option>
                      {columns.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {/* Preview table */}
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', marginBottom: '6px', textTransform: 'uppercase' }}>Preview (first 5 rows)</div>
              <div style={{ overflowX: 'auto', marginBottom: '14px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {preview.headers.map(h => <th key={h} style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        {preview.headers.map(h => <td key={h} style={{ padding: '4px 8px', color: 'var(--text)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row[h] || '—'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setPreview(null)}
                  style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: '13px', cursor: 'pointer', fontFamily: ff }}>
                  ← Back
                </button>
                <button onClick={doImport} disabled={importing}
                  style={{ flex: 1, padding: '9px', borderRadius: '8px', border: 'none', background: importing ? '#94A3B8' : '#CC2200', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: importing ? 'wait' : 'pointer', fontFamily: ff }}>
                  {importing ? `⏳ Importing ${preview.allRows.length} rows...` : `⬆ Import ${preview.allRows.length} rows`}
                </button>
              </div>
            </div>
          )}

          {/* ── IMPORT RESULT ── */}
          {mode === 'import' && importDone && (
            <div>
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)', marginBottom: '6px' }}>Import complete!</div>
                <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginBottom: '16px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: '#10B981' }}>{importDone.inserted}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>New records</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: '#F5A623' }}>{importDone.skipped}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Skipped</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: '#3B82F6' }}>{importDone.updated}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Updated</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: '#DC2626' }}>{importDone.errors.length}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Errors</div>
                  </div>
                </div>
                {importDone.errors.length > 0 && (
                  <div style={{ textAlign: 'left', background: '#FEF2F2', borderRadius: '8px', padding: '10px 12px', maxHeight: '120px', overflowY: 'auto' }}>
                    {importDone.errors.slice(0,10).map((e, i) => <div key={i} style={{ fontSize: '11px', color: '#DC2626', marginBottom: '2px' }}>{e}</div>)}
                  </div>
                )}
              </div>
              <button onClick={() => { setOpen(false); setPreview(null); setImportDone(null) }}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: 'none', background: '#CC2200', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
