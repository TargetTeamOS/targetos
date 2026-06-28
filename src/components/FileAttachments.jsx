// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — File Attachments Component
// Drop-in component for any record detail panel.
// Usage: <FileAttachments tableName="deals" recordId={deal.id} />
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef } from 'react'
import { uploadFile, listFiles, deleteFile, fmtFileSize, fileIcon } from '../lib/storage'
import { useApp } from '../context/AppContext'
import { Btn, Loading, Confirm } from './UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

export function FileAttachments({ tableName, recordId, readOnly = false }) {
  const { toast } = useApp()
  const [files,    setFiles]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [uploading,setUploading]= useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!recordId) return
    load()
  }, [recordId, tableName])

  async function load() {
    try {
      setLoading(true)
      const list = await listFiles(tableName, recordId)
      setFiles(list)
    } catch(e) {
      // Bucket may not exist yet — silent fail
      setFiles([])
    } finally {
      setLoading(false)
    }
  }

  async function handleUpload(e) {
    const selectedFiles = Array.from(e.target.files || [])
    if (!selectedFiles.length) return
    setUploading(true)
    let uploaded = 0
    for (const file of selectedFiles) {
      try {
        if (file.size > 50 * 1024 * 1024) {
          toast((file.name) + " is too large (max 50MB)", '#DC2626')
          continue
        }
        await uploadFile(file, tableName, recordId)
        uploaded++
      } catch(e) {
        toast('Failed to upload ' + file.name + ': ' + e.message, '#DC2626')
      }
    }
    if (uploaded > 0) {
      toast('✅ ' + uploaded + ' file' + (uploaded > 1 ? 's' : '') + ' uploaded')
      await load()
    }
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleDelete(file) {
    try {
      await deleteFile(file.path)
      setFiles(fs => fs.filter(f => f.path !== file.path))
      toast('File deleted')
    } catch(e) {
      toast('Delete failed: ' + e.message, '#DC2626')
    } finally {
      setConfirmDelete(null)
    }
  }

  if (!recordId) return null

  return (
    <div style={{ fontFamily: ff }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Files & Attachments ({files.length})
        </div>
        {!readOnly && (
          <>
            <input ref={inputRef} type="file" multiple onChange={handleUpload} style={{ display: 'none' }} accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.zip" />
            <Btn size="sm" variant="secondary" onClick={() => inputRef.current?.click()} loading={uploading}>
              {uploading ? 'Uploading...' : '+ Attach File'}
            </Btn>
          </>
        )}
      </div>

      {loading && <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '8px 0' }}>Loading files...</div>}

      {!loading && files.length === 0 && (
        <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '12px 0', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '8px' }}>
          {readOnly ? 'No files attached' : 'No files yet — click Attach File to add'}
        </div>
      )}

      {/* Drop zone */}
      {!readOnly && (
        <div
          onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#CC2200' }}
          onDragLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          onDrop={e => {
            e.preventDefault()
            e.currentTarget.style.borderColor = 'var(--border)'
            const dt = e.dataTransfer
            const dropped = Array.from(dt.files)
            if (dropped.length) {
              const fakeEvent = { target: { files: dropped } }
              handleUpload(fakeEvent)
            }
          }}
          style={{ border: '1px dashed var(--border)', borderRadius: '8px', padding: '8px', marginBottom: '8px', fontSize: '11px', color: 'var(--muted)', textAlign: 'center', transition: 'border-color .15s', display: files.length ? 'none' : 'block' }}>
          Or drag and drop files here
        </div>
      )}

      {files.map(file => (
        <div key={file.path} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'var(--dim)', borderRadius: '8px', marginBottom: '6px', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '18px', flexShrink: 0 }}>{fileIcon(file.name)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <a href={file.url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: '13px', fontWeight: 600, color: 'var(--brand)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
              {file.name}
            </a>
            {file.size && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{fmtFileSize(file.size)}</div>}
          </div>
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <a href={file.url} download={file.name} target="_blank" rel="noopener noreferrer">
              <button style={{ background: 'var(--dim)', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px', color: 'var(--muted)', fontFamily: ff }}>↓</button>
            </a>
            {!readOnly && (
              <button onClick={() => setConfirmDelete(file)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#DC2626', padding: '4px' }}>
                ✕
              </button>
            )}
          </div>
        </div>
      ))}

      <Confirm
        open={!!confirmDelete}
        message={"Delete \"" + (confirmDelete?.name) + "\"?"}
        onConfirm={() => handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
