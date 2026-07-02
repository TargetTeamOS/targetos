// TargetOS V2 — IVR Debug endpoint
// Visit: https://app.targetreteam.com/api/twilio-debug
// Shows exactly what the IVR system sees — flow, agents, columns, etc.
'use strict'

const { getSupabase } = require('./_lib/phone')

function parseJ(v) {
  if (!v) return null
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return null } }
  return v
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  const supabase = getSupabase()
  const out = { ok: false, timestamp: new Date().toISOString(), checks: {} }

  if (!supabase) {
    out.error = 'Supabase not configured — SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in Vercel'
    return res.status(500).json(out)
  }

  // 1. Check phone_ivr table + columns
  try {
    const { data, error } = await supabase.from('phone_ivr').select('*').limit(1).maybeSingle()
    if (error) {
      out.checks.phone_ivr = { ok: false, error: error.message }
    } else if (!data) {
      out.checks.phone_ivr = { ok: false, error: 'Table exists but NO rows — flow was never saved. Click "Load & Save Template" in Call Flow editor.' }
    } else {
      const nodes = parseJ(data.flow_nodes) || []
      const edges = parseJ(data.flow_edges) || []
      const hasIncoming = nodes.some(n => n.type === 'incoming')
      const hasMenu     = nodes.some(n => n.type === 'menu')
      out.checks.phone_ivr = {
        ok:          nodes.length > 0,
        row_id:      data.id,
        is_active:   data.is_active,
        name:        data.name || '(unnamed)',
        nodes_count: nodes.length,
        edges_count: edges.length,
        has_incoming: hasIncoming,
        has_menu:     hasMenu,
        node_types:   nodes.map(n => n.type),
        menu_options: nodes.find(n=>n.type==='menu')?.config?.options?.map(o=>({key:o.key,label:o.label})) || [],
        has_flow_nodes_col: data.flow_nodes !== undefined,
        has_flow_edges_col: data.flow_edges !== undefined,
        has_is_active_col:  data.is_active  !== undefined,
        error: !nodes.length ? 'flow_nodes column is empty or null — run ALTER TABLE and save flow again' : null,
      }
    }
  } catch(e) {
    out.checks.phone_ivr = { ok: false, error: e.message }
  }

  // 2. Check agents with phones
  try {
    const { data: agents } = await supabase.from('agents').select('id,name,phone,active').eq('active', true)
    const withPhone = (agents||[]).filter(a => a.phone)
    out.checks.agents = {
      ok:         withPhone.length > 0,
      total:      (agents||[]).length,
      with_phone: withPhone.length,
      agents:     withPhone.map((a,i) => ({ name: a.name, ext: 101+i, has_phone: !!a.phone })),
      error:      withPhone.length === 0 ? 'No agents have a phone number — Ring All and Directory will go straight to voicemail. Add phone numbers in Settings → Profile.' : null,
    }
  } catch(e) {
    out.checks.agents = { ok: false, error: e.message }
  }

  // 3. Check twilio env vars
  out.checks.twilio = {
    ok:              !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    has_account_sid: !!process.env.TWILIO_ACCOUNT_SID,
    has_auth_token:  !!process.env.TWILIO_AUTH_TOKEN,
    has_phone:       !!process.env.TWILIO_PHONE_NUMBER,
    has_twiml_app:   !!process.env.TWILIO_TWIML_APP_SID,
    phone_number:    process.env.TWILIO_PHONE_NUMBER || '(not set)',
    error:           !process.env.TWILIO_ACCOUNT_SID ? 'TWILIO_ACCOUNT_SID not set in Vercel env vars' : null,
  }

  // 4. Check call_flow_contexts table (nice to have, not required)
  try {
    const { error } = await supabase.from('call_flow_contexts').select('id').limit(1)
    out.checks.call_flow_contexts = {
      ok:    !error,
      note:  error ? 'Table does not exist — not required with new architecture but run the SQL if you want' : 'Table exists ✓',
      error: error?.message || null,
    }
  } catch(e) {
    out.checks.call_flow_contexts = { ok: false, error: e.message }
  }

  // 5. Summary
  const allOk = out.checks.phone_ivr?.ok && out.checks.agents?.ok && out.checks.twilio?.ok
  out.ok = allOk
  out.summary = allOk
    ? '✅ Everything looks good — IVR should be working'
    : '❌ Issues found — see checks above for what to fix'
  out.action_items = []
  if (!out.checks.phone_ivr?.ok) out.action_items.push('Go to /call-flow and click "Load & Save Template"')
  if (!out.checks.agents?.with_phone) out.action_items.push('Add phone numbers to agents in Settings → Profile')
  if (!out.checks.twilio?.ok) out.action_items.push('Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in Vercel env vars')

  return res.status(200).json(out)
}
