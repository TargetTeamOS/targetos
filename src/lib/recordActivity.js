// ═══════════════════════════════════════════════════════════════
// SHARED ACTIVITY + PAGE-VIEW LOGGING
//
// Writes to audit_log -- the table BOTH existing display components
// already read from (RecordActivity in ActivityLog.jsx, used by the
// Production/Deals Activity tab, and RecordActivityFeed.jsx, used by
// Offers). Those two components expect the change info in slightly
// different shapes (direct columns vs nested in `metadata`), so every
// write here includes BOTH representations for compatibility with
// whichever display component a given page uses, rather than forcing
// a rewrite of either display component.
//
// NOTE: there's also an older, separate activityLog.js that writes to
// record_activity/activity_log -- a third, different table nothing
// currently displays from. Don't use it for new work; it's dead.
// ═══════════════════════════════════════════════════════════════
import { supabase } from './supabase'

const FIELD_LABELS = {
  first_name:'First Name', last_name:'Last Name', phone:'Phone', email:'Email',
  status:'Status', source:'Lead Source', agent_id:'Assigned Agent', notes:'Notes',
  addr:'Address', list_price:'Price', status_:'Status', beds:'Bedrooms', baths:'Bathrooms',
  sqft:'Square Footage', property_type:'Property Type', ivr_enabled:'Featured on Phone',
  stage:'Stage', side:'Side', production:'Production', gci:'GCI',
  buyer_name:'Buyer', seller_name:'Seller', purchase_price:'Purchase Price',
}

function labelFor(field) {
  return FIELD_LABELS[field] || field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ── Log a single field change on a record ────────────────────────
export async function logRecordChange({ tableName, recordId, agentId, field, oldValue, newValue, recordName }) {
  if (!recordId || !field) return
  const fieldLabel = labelFor(field)
  const oldStr = oldValue != null && oldValue !== '' ? String(oldValue) : null
  const newStr = newValue != null && newValue !== '' ? String(newValue) : null
  if (oldStr === newStr) return // no real change, don't log a no-op

  try {
    await supabase.from('audit_log').insert({
      agent_id:   agentId || null,
      table_name: tableName,
      record_id:  recordId,
      action:     'updated',
      // Direct columns -- what RecordActivity (ActivityLog.jsx) reads
      field_name: fieldLabel,
      old_value:  oldStr,
      new_value:  newStr,
      // Nested metadata -- what RecordActivityFeed.jsx reads
      metadata: {
        field_label: fieldLabel, field, old_value: oldStr, new_value: newStr,
        description: (recordName || 'Record') + ' — ' + fieldLabel + ' changed',
      },
      created_at: new Date().toISOString(),
    })
  } catch(e) { console.warn('logRecordChange failed:', e.message) }
}

// ── Log a page view (for the "who visited, when" admin widget) ───
// Uses table_name = 'page:' + pageName so it never collides with a
// real record's table_name, and record_id = the viewing agent's own
// id (there's no "record" for a page view -- reusing agent_id as
// record_id lets a per-agent "last visit" query use the same simple
// eq()/order() pattern as everything else here).
export async function logPageView(pageName, agentId) {
  if (!agentId) return
  try {
    await supabase.from('audit_log').insert({
      agent_id:   agentId,
      table_name: 'page:' + pageName,
      record_id:  agentId,
      action:     'viewed',
      metadata:   { description: 'Visited ' + pageName },
      created_at: new Date().toISOString(),
    })
  } catch(e) { console.warn('logPageView failed:', e.message) }
}

// ── Fetch each agent's most recent visit to a given page ──────────
export async function getPageLastVisits(pageName) {
  try {
    const { data } = await supabase
      .from('audit_log')
      .select('agent_id, created_at, agents(id, name, color)')
      .eq('table_name', 'page:' + pageName)
      .eq('action', 'viewed')
      .order('created_at', { ascending: false })
      .limit(500)
    // Keep only the most recent row per agent
    const seen = new Set()
    const out = []
    for (const row of (data || [])) {
      if (seen.has(row.agent_id)) continue
      seen.add(row.agent_id)
      out.push(row)
    }
    return out
  } catch(e) { console.warn('getPageLastVisits failed:', e.message); return [] }
}
