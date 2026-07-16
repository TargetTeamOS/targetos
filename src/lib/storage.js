// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — File Storage (Supabase Storage)
// Attach files to any record — contracts, PDFs, photos, floor plans,
// voice recordings. Files are organized by table/recordId.
//
// PRIVATE BUCKET (July 2026): the bucket is private, so files have no
// permanent public link. We store the storage PATH and generate a
// short-lived SIGNED URL at display/playback time via signedUrl().
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabase'

const BUCKET = 'targetos-files'

// Upload a file — returns the storage path + a fresh signed URL.
// Callers should persist `path` (durable); `url` is temporary.
export async function uploadFile(file, tableName, recordId) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path     = `${tableName}/${recordId}/${Date.now()}_${safeName}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false })

  if (error) throw error

  let url = null
  try { const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600); url = data?.signedUrl || null } catch {}
  return { path, url, name: file.name, size: file.size, type: file.type }
}

// Resolve a stored path to a temporary signed URL for viewing/playing.
// Accepts a path OR a legacy full URL (returns the latter unchanged so
// old public links still work during transition).
export async function signedUrl(pathOrUrl, expiresIn = 3600) {
  if (!pathOrUrl) return null
  if (/^https?:\/\//i.test(pathOrUrl)) {
    // Legacy public URL — try to extract the path after the bucket name
    const marker = '/' + BUCKET + '/'
    const i = pathOrUrl.indexOf(marker)
    if (i === -1) return pathOrUrl
    pathOrUrl = decodeURIComponent(pathOrUrl.slice(i + marker.length).split('?')[0])
  }
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(pathOrUrl, expiresIn)
    if (error) throw error
    return data.signedUrl
  } catch { return null }
}

// List files for a record — returns paths (sign on demand with signedUrl)
export async function listFiles(tableName, recordId) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(`${tableName}/${recordId}`, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })

  if (error) throw error
  const rows = data || []
  // sign all in parallel
  return Promise.all(rows.map(async f => {
    const path = `${tableName}/${recordId}/${f.name}`
    let url = null
    try { const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600); url = s?.signedUrl || null } catch {}
    return { name: f.name, size: f.metadata?.size, type: f.metadata?.mimetype, path, url, created_at: f.created_at }
  }))
}

// Delete a file
export async function deleteFile(path) {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw error
}

// Back-compat alias
export async function getSignedUrl(path, expiresIn = 3600) { return signedUrl(path, expiresIn) }

// Format file size for display
export function fmtFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024)       return bytes + ' B'
  if (bytes < 1024*1024)  return (bytes/1024).toFixed(1) + ' KB'
  return (bytes/1024/1024).toFixed(1) + ' MB'
}

// Get icon for file type
export function fileIcon(name) {
  const ext = (name || '').split('.').pop()?.toLowerCase()
  if (['pdf'].includes(ext))              return '📄'
  if (['doc','docx'].includes(ext))       return '📝'
  if (['xls','xlsx','csv'].includes(ext)) return '📊'
  if (['jpg','jpeg','png','gif','webp'].includes(ext)) return '🖼️'
  if (['mp4','mov','avi'].includes(ext))  return '🎬'
  if (['zip','rar'].includes(ext))        return '🗜️'
  return '📎'
}
