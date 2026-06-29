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
  const header = columns.map(c => "\"" + (c.label) + "\"").join(',')
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
      return "\"" + (str) + "\""
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
  // Strip BOM and normalize line endings
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rawLines = clean.split('\n')

  // Find the real header row: first row with 3+ non-empty quoted/unquoted cells
  let headerIdx = -1
  let headers = []
  for (let i = 0; i < Math.min(10, rawLines.length); i++) {
    const line = rawLines[i].trim()
    if (!line) continue
    const cells = parseLine(line).map(c => c.replace(/^"|"$/g, '').trim())
    const filled = cells.filter(c => c.length > 0)
    if (filled.length >= 3) {
      // Make sure it looks like a header (not all numbers)
      const looksLikeHeader = cells.some(c => c.length > 0 && !/^\d+$/.test(c))
      if (looksLikeHeader) {
        headerIdx = i
        headers = cells
        break
      }
    }
  }

  if (headerIdx === -1 || headers.length === 0) {
    return { headers: [], rows: [], rawCount: 0, skippedCount: 0 }
  }

  const rows = []
  let skippedCount = 0

  for (let i = headerIdx + 1; i < rawLines.length; i++) {
    const line = rawLines[i]
    if (!line.trim()) { skippedCount++; continue }

    const vals = parseLine(line).map(c => c.replace(/^"|"$/g, '').trim())
    const obj = {}
    headers.forEach((h, idx) => { if (h) obj[h] = vals[idx] || '' })

    // Count non-empty cells
    const filledCount = Object.values(obj).filter(v => v.length > 0).length
    if (filledCount === 0) { skippedCount++; continue }

    // Monday.com group header: only 1 cell has content and it's not numeric
    if (filledCount === 1) {
      const onlyVal = Object.values(obj).find(v => v.length > 0) || ''
      const isGroupHeader = !/\d{3,}/.test(onlyVal) // no 3+ digit numbers = probably a label
      if (isGroupHeader) { skippedCount++; continue }
    }

    rows.push(obj)
  }

  return { headers, rows, rawCount: rawLines.length - headerIdx - 1, skippedCount }
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
  const [dupMode,     setDupMode]     = useState('update')  // 'skip' | 'update' | 'force'
  const [importing,   setImporting]   = useState(false)
  const [importProgress, setImportProgress] = useState('')  // status message during import
  const [importDone,  setImportDone]  = useState(null)    // { inserted, skipped, updated, errors }
  const fileRef = useRef(null)

  // ── EXPORT ─────────────────────────────────────────────────────
  function doExport() {
    if (!data.length) { toast('No data to export', '#F5A623'); return }
    const csv  = toCSV(data, columns)
    const name = table + '_export_' + new Date().toISOString().slice(0,10) + '.csv'
    downloadFile(csv, name)
    toast('✅ Exported ' + data.length + ' ' + label.toLowerCase())
    setOpen(false)
  }

  function doExportTemplate() {
    const header = columns.map(c => "\"" + (c.label) + "\"").join(',')
    const sample = columns.map(c => "\"" + (c.example || '') + "\"" ).join(',')
    const csv    = [header, sample].join('\r\n')
    downloadFile(csv, (table) + "_import_template.csv")
    toast('✅ Template downloaded')
  }

  // ── IMPORT: file pick ─────────────────────────────────────────
  function onFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const isExcel = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')
    if (isExcel) {
      // Parse Excel using SheetJS loaded from CDN
      const script = document.createElement('script')
      script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'
      script.onload = () => {
        const XLSX = window.XLSX
        const reader2 = new FileReader()
        reader2.onload = ev2 => {
          try {
            const wb   = XLSX.read(ev2.target.result, { type: 'array', cellDates: true })
            const ws   = wb.Sheets[wb.SheetNames[0]]
            const data = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, dateNF: 'YYYY-MM-DD' })
            if (!data.length) { toast('Excel file appears empty', '#DC2626'); return }
            const excelHeaders = Object.keys(data[0])
            const autoMap2 = {}
            const EXCEL_ALIASES = {
              'property': 'addr', 'name': 'addr', 'item name': 'addr', 'address': 'addr',
              'agent name': '_agent_name', 'agent': '_agent_name',
              'production $': 'production', 'gci $': 'gci',
              'a/o date': 'ao_date', 'contract date': 'contract_date',
              'expected close date': 'expected_close_date', 'close date': 'close_date',
              'client name': 'client_name', 'client legal name': 'client_legal_name',
              'client phone': 'client_phone', 'client email': 'client_email',
              'attorney name': 'atty_name', 'attorney email': 'atty_email',
              'sale type': 'sale_type', 'property type': 'property_type',
              'sales source': 'sales_source', 'referral agent': 'referral_agent',
              'contract to close': 'ctc', 'stage': 'stage', 'side': 'side', 'notes': 'notes', 'command': 'command', 'unit': 'unit',
            }
            excelHeaders.forEach(h => {
              const lower = h.toLowerCase().trim()
              const col = columns.find(c => c.label.toLowerCase() === lower || c.key.toLowerCase() === lower)
              if (col) { autoMap2[h] = col.key; return }
              if (EXCEL_ALIASES[lower]) autoMap2[h] = EXCEL_ALIASES[lower]
            })
            setMapping(autoMap2)
            setPreview({ headers: excelHeaders, rows: data.slice(0,5), allRows: data, rawCount: data.length, skippedCount: 0 })
            setImportDone(null)
          } catch(err) { toast('Excel parse error: ' + err.message, '#DC2626') }
        }
        reader2.readAsArrayBuffer(file)
      }
      if (!window.XLSX) { document.head.appendChild(script) } else { script.onload() }
      e.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = ev => {
      const allParsed = parseCSV(ev.target.result)
        const { headers, rows } = allParsed
      if (!headers.length) { toast('Could not read CSV headers', '#DC2626'); return }
      if (!rows.length) {
          toast('CSV parsed but found 0 data rows. Raw rows: ' + (allParsed.rawCount||0) + ', skipped: ' + (allParsed.skippedCount||0) + '. Check your CSV has an Address/Name column.', '#DC2626')
          return
        }
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
      setPreview({ headers, rows: rows.slice(0, 5), allRows: rows, rawCount: allParsed.rawCount || rows.length, skippedCount: allParsed.skippedCount || 0 })
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

        if (dbKey === '_agent_name' || dbKey.startsWith('_')) { if (dbKey === '_agent_name') agentName = strVal || null; continue }

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

      // Find identifier field - try all possible primary key fields
      let idField = null
      const idCandidates = ['addr', 'first_name', 'name', 'title', 'phone', 'email', 'label']
      for (let ic = 0; ic < idCandidates.length; ic++) {
        const cand = idCandidates[ic]
        if (record[cand] && String(record[cand]).trim().length > 0) {
          idField = cand
          break
        }
      }

      if (!idField) {
        // Row has no identifier — likely a blank row, group header, or subtotal row
        // Silently skip these (they're common in Monday.com / Excel exports)
        const allVals = Object.values(row).map(function(v) { return String(v||'').trim() })
        const hasAnyData = allVals.some(function(v) { return v && v.length > 0 })
        if (hasAnyData) {
          // Has some data but no identifier — log as minor warning
          const nonEmpty = Object.keys(record).filter(function(k) { return record[k] && String(record[k]).trim() })
          if (nonEmpty.length > 0) {
            errors.push('Row ' + (ri+1) + ': skipped — address column is blank. Only found: [' + nonEmpty.join(', ') + ']')
          }
        }
        // else: truly blank row — skip silently
        continue
      }

      // Skip group header rows: rows where only 1-2 fields have values
      // (common in Monday.com exports where group names appear as rows)
      const filledFields = Object.keys(record).filter(function(k) { 
        return record[k] !== null && record[k] !== undefined && String(record[k]).trim() !== ''
      })
      if (filledFields.length < 2) {
        // Only 1 field filled (just the addr/name) — likely a group header row
        // Skip silently unless it has a meaningful identifier
        const addrVal = String(record[idField] || '')
        const looksLikeGroupHeader = addrVal.length < 4 || /^[A-Za-z\s]+$/.test(addrVal)
        if (looksLikeGroupHeader) {
          continue  // skip group headers
        }
      }
      records.push({ record: record, idField: idField })
    }

    console.log('ImportExport: allRows=' + allRows.length + ' valid records=' + records.length + ' pre-import errors=' + errors.length)
    if (records.length === 0) {
      setImportDone({ inserted: 0, updated: 0, skipped: 0, errors: errors.length > 0 ? errors : ['No valid rows found — check that your address/name column is mapped correctly'] })
      setImporting(false)
      return
    }

    // ── FORCE MODE: skip all dup detection, insert everything ──────
    if (dupMode === 'force') {
      setImportProgress('Inserting all ' + records.length + ' rows (force mode)...')
      console.log('FORCE IMPORT: records to insert:', records.length)
      console.log('Sample record[0]:', JSON.stringify(records[0]))
      const BATCH = 50
      for (let i = 0; i < records.length; i += BATCH) {
        const chunk = records.slice(i, i + BATCH).map(r => ({
          ...r.record,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }))
        console.log('Inserting batch', i/BATCH+1, 'size:', chunk.length, 'sample:', JSON.stringify(chunk[0]))
        try {
          const { data: inserted_data, error } = await supabase.from(table).insert(chunk).select('id')
          if (error) {
            console.error('Insert error:', error)
            errors.push('Batch ' + (i/BATCH+1) + ' failed: ' + error.message + ' | code: ' + error.code + ' | hint: ' + (error.hint||''))
          } else {
            inserted += (inserted_data || chunk).length
            console.log('Batch', i/BATCH+1, 'inserted:', (inserted_data||chunk).length)
          }
        } catch(e) {
          console.error('Insert exception:', e)
          errors.push('Batch ' + (i/BATCH+1) + ' exception: ' + e.message)
        }
        setImportProgress('Inserted ' + inserted + ' of ' + records.length + '...')
      }
      setImportDone({ inserted, updated, skipped, errors })
      setImporting(false)
      if (onImport) onImport()
      const blankCount = allRows.length - records.length - errors.length
    const msg = inserted > 0
      ? '✅ ' + inserted + ' deals added' + (blankCount > 0 ? ' (' + blankCount + ' blank/header rows skipped)' : '') + (errors.length ? ', ' + errors.length + ' errors' : '')
      : '❌ Import failed — 0 rows inserted. Check column mapping.'
    toast(msg)
    return
    }

    setImportProgress('Checking for duplicates (' + records.length + ' rows)...')
    // ── Step 3: Smart duplicate detection ─────────────────────────
    // For contacts: match on normalized phone number (most reliable)
    //   fallback to first_name+last_name if no phone
    // For deals: match on addr+side
    // For other tables: match on first idField
    // Records that existed but were deleted → re-import (not in existingMap → treated as new)

    const BATCH = 50
    const existingMap = {}  // normalized key → { id, record } for change detection

    if (table === 'contacts') {
      // Fetch ALL contacts: id + phone + first_name + last_name for matching
      try {
        let offset = 0, done = false
        while (!done) {
          const { data } = await supabase.from('contacts')
            .select('id, phone, first_name, last_name, email, status, source, address, city, state, zip, agent_id, notes, type, budget_max')
            .range(offset, offset + 999)
          if (!data || data.length === 0) { done = true; break }
          data.forEach(function(row) {
            // Key 1: normalized phone (digits only, last 10)
            const phone = String(row.phone || '').replace(/\D/g,'').slice(-10)
            if (phone && phone.length >= 7) {
              existingMap['phone:' + phone] = { id: row.id, row }
            }
            // Key 2: first+last name (fallback)
            const nameKey = (String(row.first_name||'').trim() + ' ' + String(row.last_name||'').trim()).toLowerCase().trim()
            if (nameKey && nameKey.length > 1) {
              existingMap['name:' + nameKey] = { id: row.id, row }
            }
          })
          offset += 1000
          if (data.length < 1000) done = true
        }
      } catch(e) { errors.push('Could not fetch existing contacts: ' + e.message) }
    } else {
      // Fetch ALL existing records for this table (prevents missed matches)
      const idField0 = records[0]?.idField || 'addr'
      try {
        let offset = 0, done = false
        while (!done) {
          const selectFields = 'id, ' + idField0 + (table === 'deals' ? ', side, agent_id' : '')
          const { data } = await supabase.from(table).select(selectFields).range(offset, offset + 999)
          if (!data || data.length === 0) { done = true; break }
          data.forEach(function(row) {
            // Normalize: lowercase, collapse whitespace, trim
            const normVal  = String(row[idField0] || '').toLowerCase().replace(/\s+/g,' ').trim()
            const normSide = row.side ? String(row.side).trim().toLowerCase() : ''
            if (normVal) {
              existingMap[normVal] = { id: row.id, row }
              if (normSide) existingMap[normVal + '||' + normSide] = { id: row.id, row }
            }
          })
          offset += 1000
          if (data.length < 1000) done = true
        }
        console.log('Loaded', Object.keys(existingMap).length, 'existing records for dup detection')
      } catch(e) { errors.push('Could not fetch existing records: ' + e.message) }
    }

    // ── Step 4: Split into inserts vs updates ─────────────────────
    const toInsert = []
    const toUpdate = []

    for (const { record, idField } of records) {
      let existingEntry = null

      if (table === 'contacts') {
        // Try phone match first
        const phone = String(record.phone || '').replace(/\D/g,'').slice(-10)
        if (phone && phone.length >= 7) existingEntry = existingMap['phone:' + phone]
        // Fallback: name match
        if (!existingEntry) {
          const nameKey = (String(record.first_name||'').trim() + ' ' + String(record.last_name||'').trim()).toLowerCase().trim()
          if (nameKey && nameKey.length > 1) existingEntry = existingMap['name:' + nameKey]
        }
      } else {
        // Normalize the same way as the existingMap keys
        const normVal  = String(record[idField] || '').toLowerCase().replace(/\s+/g,' ').trim()
        const normSide = record.side ? String(record.side).trim().toLowerCase() : ''
        // Try with side first, then without
        existingEntry = existingMap[normVal + (normSide ? '||' + normSide : '')] || existingMap[normVal]
      }

      if (existingEntry) {
        if (dupMode === 'skip') {
          skipped++
        } else {
          // Check if anything actually changed before updating
          const existing = existingEntry.row || {}
          const hasChange = Object.keys(record).some(function(k) {
            if (k === 'agent_id') return false // skip agent comparison
            const newVal = record[k] === null ? '' : String(record[k] || '').trim()
            const oldVal = existing[k] === null ? '' : String(existing[k] || '').trim()
            return newVal !== oldVal && newVal !== ''
          })
          if (hasChange) toUpdate.push({ id: existingEntry.id, record })
          else skipped++
        }
      } else {
        // Not found = either brand new OR was deleted → always insert
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
    const blankSkipped2 = allRows.length - records.length
    toast('✅ Import complete: ' + inserted + ' added, ' + updated + ' updated, ' + skipped + ' skipped' + 
      (blankSkipped2 > 0 ? ', ' + blankSkipped2 + ' blank/header rows skipped' : '') +
      (errors.length ? ', ' + errors.length + ' errors' : ''))
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
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>CSV or Excel (.xlsx) · drag and drop or click</div>
              </div>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style={{ display: 'none' }} onChange={onFileChange} />

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
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--text)', fontSize: 14 }}>{preview.allRows.length} data rows</strong> ready to import.
                {preview.skippedCount > 0 && <span style={{ color: '#F5A623' }}> ({preview.skippedCount} blank/header rows auto-skipped from your CSV)</span>}
              </div>
              {preview.allRows.length < 200 && preview.rawCount > preview.allRows.length + preview.skippedCount && (
                <div style={{ padding: '8px 12px', background: '#FEF2F2', borderRadius: 8, border: '1px solid #FECACA', fontSize: 12, color: '#DC2626', marginBottom: 10 }}>
                  ⚠️ Only {preview.allRows.length} of {preview.rawCount} raw CSV rows were parsed.
                  This usually means the address column isn't mapped — make sure "Address" (or "Name", "Item Name") maps to the <strong>Address</strong> field below.
                </div>
              )}

              {/* Duplicate handling */}
              <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 12px', background:'var(--dim)', borderRadius:'8px', border:'1px solid var(--border)', marginBottom:'14px' }}>
                <span style={{ fontSize:'14px' }}>🔁</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'12px', fontWeight:700, color:'var(--text)' }}>If a record already exists (matched by phone/name/address):</div>
                  <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:2 }}>
                    <strong style={{color:'var(--text)'}}>Update</strong> — match by address, update changed fields, add new ones.<br/>
                    <strong style={{color:'var(--text)'}}>Skip</strong> — skip any row that matches an existing record.<br/>
                    <strong style={{color:'var(--text)'}}>Force Add All</strong> — insert every row as new, ignore duplicates.
                  </div>
                </div>
                <div style={{ display:'flex', background:'var(--panel)', borderRadius:'7px', padding:'2px', gap:'2px' }}>
                  {[['update','✏️ Update'],['skip','⏭ Skip'],['force','➕ Force Add All']].map(([m,l]) => (
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
                  {importing
                    ? ('⏳ ' + importProgress + ' — DO NOT CLOSE')
                    : (dupMode === 'force'
                        ? '➕ Force insert all ' + preview.allRows.length + ' rows as NEW'
                        : '⬆ Import ' + preview.allRows.length + ' rows (' + dupMode + ' duplicates)'
                    )
                  }
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
