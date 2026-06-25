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
      let val
      if (c.key === '_agent_name') {
        // Virtual: resolve from nested agents object
        val = row.agents?.name || row._agent_name || ''
      } else {
        val = row[c.key]
      }
      if (val === null || val === undefined) return '""'
      const str = String(val).replace(/"/g, '""')
      return `"${str}"`
    }).join(',')
  )
  return [header, ...lines].join('\r\n')
}

function parseLine(line) {
  // Parse a single CSV line respecting quoted fields
  const vals = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"' && !inQ)                        { inQ = true;  continue }
    if (ch === '"' && inQ && line[i+1] === '"')    { cur += '"';  i++; continue }
    if (ch === '"' && inQ)                         { inQ = false; continue }
    if (ch === ',' && !inQ)                        { vals.push(cur); cur = ''; continue }
    cur += ch
  }
  vals.push(cur)
  return vals
}

function parseCSV(text) {
  // Strip UTF-8 BOM that Excel adds (\uFEFF) and normalise line endings
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  const lines  = clean.split('\n').filter(l => l.trim() !== '')
  if (lines.length < 2) return { headers: [], rows: [] }

  // Parse headers — strip outer quotes and whitespace
  const headers = parseLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim())

  if (!headers.length || headers.every(h => !h)) return { headers: [], rows: [] }

  const rows = lines.slice(1).map(line => {
    const vals = parseLine(line)
    const obj  = {}
    headers.forEach((h, i) => {
      // Strip outer quotes and trim whitespace from every value
      let v = (vals[i] || '').replace(/^"|"$/g, '').trim()
      obj[h] = v
    })
    return obj
  }).filter(row => {
    // Skip completely empty rows (all values blank)
    return Object.values(row).some(v => v !== '')
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
  const [importProgress, setImportProgress] = useState('')  // status message during import
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
      if (!headers.length) { toast('Could not read CSV headers — make sure the file is a .csv and not .xlsx', '#DC2626'); return }
      if (!rows.length) { toast('CSV has headers but no data rows', '#DC2626'); return }
      // Auto-map CSV headers to column keys
      const autoMap = {}
      // Extra aliases for common import sources (Monday.com exports, Excel, etc.)
      const ALIASES = {
        'name': 'addr', 'item name': 'addr', 'address': 'addr', 'property': 'addr', 'property address': 'addr',
        'agent': '_agent_name', 'assigned agent': '_agent_name', 'agent name': '_agent_name', 'people': '_agent_name',
        'gci $': 'gci', 'gci': 'gci', 'gross commission': 'gci',
        'production $': 'production', 'production': 'production', 'sale price': 'production', 'price': 'production',
        'a/o date': 'ao_date', 'ao date': 'ao_date', 'accepted offer date': 'ao_date',
        'ctrct date': 'contract_date', 'contract date': 'contract_date', 'contract': 'contract_date',
        'cls date': 'close_date', 'close date': 'close_date', 'closing date': 'close_date', 'closed date': 'close_date',
        'expected closing date': 'expected_close_date', 'exp close': 'expected_close_date',
        'clients legal name': 'client_legal_name', 'client legal name': 'client_legal_name',
        'clients email': 'client_email', 'client email': 'client_email', 'cliant phone': 'client_phone', 'client phone': 'client_phone',
        'attorenys name': 'atty_name', 'attorenys email': 'atty_email', 'attorney name': 'atty_name', 'attorney email': 'atty_email',
        'sale type': 'sale_type', 'sales source': 'sales_source', 'property type': 'property_type',
        'contract to close': 'ctc', 'stage': 'stage', 'side': 'side',
        'commission received': 'commission_received', 'agent commission sent': 'agent_commission_sent',
      }
      headers.forEach(h => {
        const lower = h.toLowerCase().trim()
        // Try exact label match first
        const col = columns.find(c => c.label.toLowerCase() === lower || c.key.toLowerCase() === lower)
        if (col) { autoMap[h] = col.key; return }
        // Try alias map
        if (ALIASES[lower]) { autoMap[h] = ALIASES[lower]; return }
        // Handle A/O Date specifically (slash in key causes issues in object literals)
        if (lower === 'a/o date' || lower === 'a/o') { autoMap[h] = 'ao_date' }
      })
      setMapping(autoMap)
      setPreview({ headers, rows: rows.slice(0, 5), allRows: rows })
      setImportDone(null)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // ── IMPORT: execute (batched — handles 500+ rows without crashing) ───
  async function doImport() {
    if (!preview) return
    setImporting(true)
    const { allRows } = preview
    let inserted = 0, updated = 0, skipped = 0, errors = []

    // ── Step 1: Load agents ───────────────────────────────────────
    let agentCache = []
    try {
      const { data } = await supabase.from('agents').select('id, name').eq('active', true)
      agentCache = data || []
    } catch(e) { /* non-fatal */ }

    setImportProgress('Reading ' + allRows.length + ' rows...')

    // ── Step 2: Build records from CSV ────────────────────────────
    const records = []
    for (let ri = 0; ri < allRows.length; ri++) {
      const row = allRows[ri]
      const record = {}
      let agentName = null

      // Case-insensitive row key lookup
      const rowKeys = Object.keys(row)
      const rowKeyLower = {}
      for (let ki = 0; ki < rowKeys.length; ki++) {
        rowKeyLower[rowKeys[ki].trim().toLowerCase()] = rowKeys[ki]
      }

      // Apply column mapping
      const mappingEntries = Object.entries(mapping)
      for (let mi = 0; mi < mappingEntries.length; mi++) {
        const csvH = mappingEntries[mi][0]
        const dbKey = mappingEntries[mi][1]
        if (!dbKey) continue

        // Find the actual row key (exact or case-insensitive)
        const actualKey = (row[csvH] !== undefined) ? csvH : rowKeyLower[csvH.trim().toLowerCase()]
        if (!actualKey) continue

        const rawVal = row[actualKey]
        const strVal = (rawVal === null || rawVal === undefined) ? '' : String(rawVal).trim()

        if (dbKey === '_agent_name') { agentName = strVal || null; continue }

        const col = columns.find(c => c.key === dbKey)
        if (strVal === '' || strVal === 'null' || strVal === 'None' || strVal === 'undefined') {
          record[dbKey] = null
        } else if (col && col.type === 'number') {
          record[dbKey] = parseFloat(strVal) || null
        } else if (col && col.type === 'date') {
          record[dbKey] = strVal.slice(0, 10) || null
        } else {
          record[dbKey] = strVal
        }
      }

      // Resolve agent name → agent_id
      if (agentName) {
        const nameLower = agentName.toLowerCase()
        const found = agentCache.find(function(a) {
          const al = a.name.toLowerCase()
          const af = al.split(' ')[0]
          return al === nameLower || af === nameLower || nameLower.includes(af)
        })
        if (found) record.agent_id = found.id
      }

      // Find identifier field (addr for deals, name for contacts, title for tasks)
      let idField = null
      const idCandidates = ['addr', 'name', 'title']
      for (let ic = 0; ic < idCandidates.length; ic++) {
        const cand = idCandidates[ic]
        if (record[cand] && String(record[cand]).trim().length > 0) {
          idField = cand
          break
        }
      }

      if (!idField) {
        const nonEmpty = Object.keys(record).filter(function(k) { return record[k] && String(record[k]).trim() })
        const firstRaw = String(Object.values(row)[0] || '').slice(0, 60)
        errors.push('Row ' + (ri+1) + ' skipped — address empty after mapping. First cell: "' + firstRaw + '". Mapped: ' + (nonEmpty.join(', ') || 'nothing'))
        continue
      }

      records.push({ record: record, idField: idField })
    }

    setImportProgress('Checking for duplicates (' + records.length + ' rows)...')
    // ── Step 3: Fetch ALL existing records in ONE query ───────────
    // Instead of one query per row, grab all identifiers at once
    const BATCH = 50  // Supabase IN() limit
    const idField0 = records[0]?.idField || 'addr'
    const allIds   = records.map(r => r.record[r.idField]).filter(Boolean)
    const existingMap = {}  // identifier+side → db id

    // Fetch in batches of 50
    for (let i = 0; i < allIds.length; i += BATCH) {
      const chunk = allIds.slice(i, i + BATCH)
      try {
        const { data } = await supabase.from(table).select('id, ' + idField0 + (table === 'deals' ? ', side' : '')).in(idField0, chunk)
        ;(data || []).forEach(row => {
          // Normalize key: trim and lowercase for comparison
          const normAddr = String(row[idField0] || '').trim().toLowerCase()
          const key = normAddr + (row.side ? '||' + String(row.side).trim().toLowerCase() : '')
          existingMap[key] = row.id
        })
      } catch(e) { errors.push('Fetch batch failed: ' + e.message) }
    }

    // ── Step 4: Split into inserts vs updates ─────────────────────
    const toInsert = []
    const toUpdate = []

    for (const { record, idField } of records) {
      const normVal = String(record[idField] || '').trim().toLowerCase()
      const normSide = record.side ? String(record.side).trim().toLowerCase() : ''
      const key = normVal + (normSide ? '||' + normSide : '')
      const existingId = existingMap[key]
      if (existingId) {
        if (dupMode === 'skip') skipped++
        else toUpdate.push({ id: existingId, record })
      } else {
        toInsert.push(record)
      }
    }

    setImportProgress('Inserting ' + toInsert.length + ' new records...')
    // ── Step 5: Batch INSERT (up to 50 per call) ──────────────────
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const chunk = toInsert.slice(i, i + BATCH).map(r => ({
        ...r,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }))
      try {
        const { error } = await supabase.from(table).insert(chunk)
        if (error) throw error
        inserted += chunk.length
      } catch(e) {
        errors.push('Insert batch ' + (i/BATCH+1) + ' failed: ' + e.message)
      }
    }

    if (toUpdate.length) setImportProgress('Updating ' + toUpdate.length + ' existing records...')
    // ── Step 6: Batch UPDATE (individual — Supabase requires one per id) ─
    // Run in parallel groups of 10 to stay fast without overwhelming the DB
    const PARALLEL = 10
    for (let i = 0; i < toUpdate.length; i += PARALLEL) {
      const chunk = toUpdate.slice(i, i + PARALLEL)
      await Promise.all(chunk.map(async ({ id, record }) => {
        try {
          const { error } = await supabase.from(table).update({ ...record, updated_at: new Date().toISOString() }).eq('id', id)
          if (error) throw error
          updated++
        } catch(e) { errors.push('Update failed: ' + e.message) }
      }))
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
