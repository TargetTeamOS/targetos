// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — File Storage (Supabase Storage)
// Attach files to any record — contracts, PDFs, photos, floor plans.
// Files are organized by table/recordId.
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabase'

const BUCKET = 'targetos-files'

// Upload a file to storage — returns the public URL
export async function uploadFile(file, tableName, recordId) {
  const ext      = file.name.split('.').pop()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path     = `${tableName}/${recordId}/${Date.now()}_${safeName}`

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false })

  if (error) throw error

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { path, url: urlData.publicUrl, name: file.name, size: file.size, type: file.type }
}

// List files for a record
export async function listFiles(tableName, recordId) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(`${tableName}/${recordId}`, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })

  if (error) throw error
  return (data || []).map(f => ({
    name: f.name,
    size: f.metadata?.size,
    type: f.metadata?.mimetype,
    path: `${tableName}/${recordId}/${f.name}`,
    url:  supabase.storage.from(BUCKET).getPublicUrl(`${tableName}/${recordId}/${f.name}`).data.publicUrl,
    created_at: f.created_at,
  }))
}

// Delete a file
export async function deleteFile(path) {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw error
}

// Get a signed URL (for private files)
export async function getSignedUrl(path, expiresIn = 3600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn)
  if (error) throw error
  return data.signedUrl
}

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
