// ═══════════════════════════════════════════════════════════════
// Listing Files — shared upload/list/delete/visibility helpers over
// the listing_files table (Phase A migration, admin/secretary-only
// RLS) and the existing targetos-files private bucket (via storage.js
// -- no new bucket, no new upload primitives, just the metadata layer
// on top). Every write here also logs to audit_log, per the plan.
//
// PHASE A NOTE: RLS on listing_files currently only allows admin/
// secretary (current_agent_can_manage()). A regular agent calling
// these functions will get an empty list / a permission error, not a
// bug -- callers should gate the UI on `canManage` rather than call
// these for a regular agent and show an empty state that looks broken.
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabase'
import { uploadFile, signedUrl, deleteFile as deleteStorageFile, fmtFileSize, fileIcon } from './storage'

export { fmtFileSize, fileIcon }

// List files for a listing, optionally filtered to one related_type.
// Excludes soft-deleted rows.
export async function listListingFiles(listingId, relatedType) {
  let q = supabase.from('listing_files').select('*').eq('listing_id', listingId).is('deleted_at', null)
  if (relatedType) q = q.eq('related_type', relatedType)
  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// Upload a file + create its listing_files row + log to audit_log.
export async function uploadListingFile({ file, listingId, relatedType, category, relatedId, agentId, visibility = 'office' }) {
  const uploaded = await uploadFile(file, 'listings', listingId + '/' + relatedType)
  const { data, error } = await supabase.from('listing_files').insert({
    listing_id: listingId, related_type: relatedType, related_id: relatedId || null,
    category: category || null, file_name: uploaded.name, storage_path: uploaded.path,
    mime_type: uploaded.type || null, file_size: uploaded.size || null,
    uploaded_by: agentId || null, visibility, created_at: new Date().toISOString(),
  }).select().single()
  if (error) throw error
  try {
    await supabase.from('audit_log').insert({
      agent_id: agentId, table_name: 'listings', record_id: listingId,
      action: 'file_uploaded', field_name: 'File',
      metadata: { description: 'Uploaded ' + uploaded.name + ' (' + relatedType + (category ? '/' + category : '') + ')' },
      created_at: new Date().toISOString(),
    })
  } catch {}
  return data
}

// Soft-delete the row and remove the underlying storage object.
export async function deleteListingFile(fileRow, agentId) {
  const { error } = await supabase.from('listing_files').update({ deleted_at: new Date().toISOString() }).eq('id', fileRow.id)
  if (error) throw error
  try { await deleteStorageFile(fileRow.storage_path) } catch {}
  try {
    await supabase.from('audit_log').insert({
      agent_id: agentId, table_name: 'listings', record_id: fileRow.listing_id,
      action: 'file_deleted', field_name: 'File',
      metadata: { description: 'Deleted ' + fileRow.file_name },
      created_at: new Date().toISOString(),
    })
  } catch {}
}

// Change visibility, logging old -> new.
export async function setFileVisibility(fileRow, newVisibility, agentId) {
  const { error } = await supabase.from('listing_files').update({ visibility: newVisibility }).eq('id', fileRow.id)
  if (error) throw error
  try {
    await supabase.from('audit_log').insert({
      agent_id: agentId, table_name: 'listings', record_id: fileRow.listing_id,
      action: 'file_visibility_changed', field_name: 'File visibility',
      old_value: fileRow.visibility, new_value: newVisibility,
      metadata: { description: fileRow.file_name + ' visibility changed' },
      created_at: new Date().toISOString(),
    })
  } catch {}
}

// Signed URL for viewing/downloading. Longer expiry available for the
// email-attachment-as-link use case (a 1hr default would go stale
// before a recipient opens the email).
export async function getListingFileUrl(storagePath, expiresIn = 3600) {
  return signedUrl(storagePath, expiresIn)
}

export const VISIBILITY_LABELS = {
  agent: 'Agent-visible', office: 'Office-visible', admin: 'Admin only', seller_facing: 'Seller-facing',
}
