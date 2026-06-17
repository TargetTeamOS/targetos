// ═══════════════════════════════════════════════════════════════
// UNIVERSAL ACTIVITY LOG ENGINE
// Tracks every change on every record — contact, listing, deal, etc.
// Saves to Supabase activity_log table
// Format: who did what to which record, before vs after value
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabase'

// Field display names for human-readable logs
const FIELD_LABELS = {
  first_name: 'First Name', last_name: 'Last Name',
  phone: 'Phone', phone2: 'Phone 2', email: 'Email', email2: 'Email 2',
  role: 'Type', status: 'Status', source: 'Lead Source',
  assigned_agent: 'Assigned Agent', tag: 'Tag',
  budget_max: 'Max Budget', budget_min: 'Min Budget',
  preferred_areas: 'Preferred Areas', property_type_interest: 'Property Type',
  min_beds: 'Min Bedrooms', birthday: 'Birthday',
  closing_anniversary: 'Closing Anniversary', city: 'City',
  tax_info: 'Tax Info', notes: 'Notes',
  // Listings
  addr: 'Address', price: 'Price', type: 'Property Type',
  beds: 'Bedrooms', baths: 'Bathrooms', sqft: 'Sqft',
  tax: 'Tax/Year', lock: 'Lockbox Code', mls: 'MLS Link',
  sellerName: 'Seller Name', budget: 'Ad Budget', days: 'Days Listed',
  // Transactions / Deals
  ctc: 'CTC Stage', stage: 'Deal Stage', expectedClose: 'Expected Close',
  contractDate: 'Contract Date', closeDate: 'Close Date',
  commRcvd: 'Commission Received', agentPaid: 'Agent Paid',
  // Tasks
  title: 'Title', priority: 'Priority', due_date: 'Due Date',
}

function getFieldLabel(key) {
  return FIELD_LABELS[key] || key.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())
}

function formatValue(key, val) {
  if(val === null || val === undefined || val === '') return '(empty)'
  if(key.includes('budget') || key === 'price') return '$' + Number(val).toLocaleString()
  if(key === 'commRcvd' || key === 'agentPaid') return val ? 'Yes' : 'No'
  return String(val)
}

// ── CORE LOG FUNCTION ─────────────────────────────────────────
export async function logChange({ recordType, recordId, recordName, action, field, oldValue, newValue, agentName, userId, extra }) {
  const entry = {
    record_type:  recordType,   // 'contact' | 'listing' | 'transaction' | 'task' | 'deal'
    record_id:    recordId,
    record_name:  recordName,   // Human-readable name e.g. "John Smith" or "47 Prairie Ave"
    action:       action,       // 'Created' | 'Updated' | 'Deleted' | 'Status Changed' etc.
    field_name:   field ? getFieldLabel(field) : null,
    field_key:    field || null,
    old_value:    field ? formatValue(field, oldValue) : null,
    new_value:    field ? formatValue(field, newValue) : null,
    agent_name:   agentName || 'System',
    user_id:      userId || null,
    extra_data:   extra ? JSON.stringify(extra) : null,
    created_at:   new Date().toISOString(),
  }

  // Save to Supabase
  try {
    await supabase.from('record_activity').insert([entry])
  } catch(e) {
    // Fallback to activity_log if record_activity doesn't exist yet
    try {
      await supabase.from('activity_log').insert([{
        category:   recordType,
        action:     action,
        subject:    recordName,
        detail:     field ? getFieldLabel(field)+': '+formatValue(field,oldValue)+' → '+formatValue(field,newValue) : (extra||''),
        agent_name: agentName || 'System',
        user_id:    userId || null,
        before_val: oldValue !== undefined ? JSON.stringify({[field]:oldValue}) : null,
        after_val:  newValue !== undefined ? JSON.stringify({[field]:newValue}) : null,
        created_at: new Date().toISOString(),
      }])
    } catch(e2) { /* silent fail */ }
  }

  return entry
}

// ── LOG MULTIPLE FIELD CHANGES AT ONCE ────────────────────────
export async function logFieldChanges({ recordType, recordId, recordName, before, after, agentName, userId }) {
  const changes = []
  for(const key of Object.keys(after)) {
    const oldVal = before ? before[key] : undefined
    const newVal = after[key]
    // Only log if actually changed
    if(String(oldVal||'') !== String(newVal||'')) {
      changes.push({ key, oldVal, newVal })
    }
  }
  if(changes.length === 0) return []

  const entries = await Promise.all(changes.map(c =>
    logChange({
      recordType, recordId, recordName,
      action: 'Updated',
      field: c.key,
      oldValue: c.oldVal,
      newValue: c.newVal,
      agentName, userId,
    })
  ))
  return entries
}

// ── FETCH ACTIVITY FOR A SPECIFIC RECORD ──────────────────────
export async function getRecordActivity(recordType, recordId) {
  // Try record_activity table first
  try {
    const { data, error } = await supabase
      .from('record_activity')
      .select('*')
      .eq('record_type', recordType)
      .eq('record_id', recordId)
      .order('created_at', { ascending: false })

    if(!error && data) return data
  } catch(e) {}

  // Fallback to activity_log
  try {
    const { data } = await supabase
      .from('activity_log')
      .select('*')
      .eq('category', recordType)
      .order('created_at', { ascending: false })
      .limit(100)
    return data || []
  } catch(e) { return [] }
}
