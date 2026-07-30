// ═══════════════════════════════════════════════════════════════
// ListingFilesPanel — reusable upload/list/open/delete/visibility UI
// over listing_files (Phase A: admin/secretary-only RLS). Used from
// Documents, Marketing Materials, the office thread, and read-only from
// Seller Report. One component, one behavior, everywhere it appears.
//
// PHASE A: gated entirely on `canManage`. A regular agent would get
// empty results from RLS, not a real "no files" state -- showing that
// as if it were normal would be misleading, so non-managers see an
// explicit note instead of an empty uploader.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef } from 'react'
import { listListingFiles, uploadListingFile, deleteListingFile, setFileVisibility, getListingFileUrl, fmtFileSize, fileIcon, VISIBILITY_LABELS } from '../lib/listingFiles'

const ff = 'Inter, system-ui, sans-serif'

export default function ListingFilesPanel({ listingId, relatedType, categories, agent, canManage, title, emptyText, compact, readOnly, filterVisibility, onInsertLink }) {
  const [files, setFiles] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [category, setCategory] = useState(categories?.[0]?.value || '')
  const inputRef = useRef(null)

  async function load() {
    try {
      let rows = await listListingFiles(listingId, relatedType)
      if (filterVisibility) rows = rows.filter(f => f.visibility === filterVisibility)
      setFiles(rows)
    } catch { setFiles([]) }
  }
  useEffect(() => { if (canManage) load(); else setFiles([]) }, [listingId, relatedType, canManage])

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await uploadListingFile({ file, listingId, relatedType, category: category || null, agentId: agent?.id, visibility: 'office' })
      await load()
    } catch (err) { alert('Upload failed: ' + (err.message || err)) }
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleOpen(f) {
    const url = await getListingFileUrl(f.storage_path)
    if (url) window.open(url, '_blank')
    else alert('Could not generate a link for this file')
  }

  async function handleInsertLink(f) {
    // 7-day signed URL -- a 1hr default would go stale before an email
    // recipient opens it days later. Still expires, still not a real
    // MIME attachment -- honest limitation, not hidden.
    const url = await getListingFileUrl(f.storage_path, 604800)
    if (url) onInsertLink?.(f.file_name, url)
    else alert('Could not generate a link for this file')
  }

  async function handleDelete(f) {
    if (!window.confirm('Delete ' + f.file_name + '?')) return
    try { await deleteListingFile(f, agent?.id); await load() } catch (err) { alert('Delete failed: ' + (err.message || err)) }
  }

  async function handleVisibility(f, v) {
    try { await setFileVisibility(f, v, agent?.id); await load() } catch (err) { alert('Could not change visibility: ' + (err.message || err)) }
  }

  const card = { background: 'var(--dim)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }
  const sel = { padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: ff }

  if (!canManage) {
    return (
      <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
        File uploads are rolling out to admin/secretary first (Phase A). Agent access comes in Phase B once account setup is finished.
      </div>
    )
  }

  return (
    <div>
      {title && <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>{title}</div>}
      {!readOnly && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {categories && categories.length > 0 && (
            <select value={category} onChange={e => setCategory(e.target.value)} style={sel}>
              {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          )}
          <label style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--brand)', color: 'var(--brand)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>
            {uploading ? 'Uploading…' : '+ Upload file'}
            <input ref={inputRef} type="file" onChange={handleUpload} disabled={uploading} style={{ display: 'none' }} />
          </label>
        </div>
      )}
      {files === null ? (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Loading…</div>
      ) : files.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>{emptyText || 'No files yet.'}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: compact ? 200 : undefined, overflowY: compact ? 'auto' : undefined }}>
          {files.map(f => (
            <div key={f.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 18 }}>{fileIcon(f.file_name)}</span>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file_name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                  {f.category ? f.category + ' · ' : ''}{fmtFileSize(f.file_size)} · {new Date(f.created_at).toLocaleDateString()}
                </div>
              </div>
              {!readOnly && (
                <select value={f.visibility} onChange={e => handleVisibility(f, e.target.value)} style={{ fontSize: 10.5, padding: '3px 5px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--muted)' }}>
                  {Object.entries(VISIBILITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              )}
              <button onClick={() => handleOpen(f)} style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 11, cursor: 'pointer', fontFamily: ff }}>Open</button>
              {onInsertLink && (
                <button onClick={() => handleInsertLink(f)} style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid var(--brand)', background: 'transparent', color: 'var(--brand)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>Insert in email</button>
              )}
              {!readOnly && (
                <button onClick={() => handleDelete(f)} style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid #DC2626', background: 'transparent', color: '#DC2626', fontSize: 11, cursor: 'pointer', fontFamily: ff }}>Delete</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
