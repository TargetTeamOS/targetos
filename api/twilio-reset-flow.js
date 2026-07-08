// TargetOS V2 — Flow Reset (GET or POST)
'use strict'

const { getSupabase, requireAdminOrSecretary } = require('./_lib/phone')
const { buildDefaultNodes, buildDefaultEdges } = require('./_lib/default-flow')

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')

  const authCheck = await requireAdminOrSecretary(req)
  if (!authCheck.ok) return res.status(authCheck.status).json({ error: authCheck.message })

  const supabase = getSupabase()

  try {
    const { data: agents } = await supabase
      .from('agents').select('id,name,phone')
      .eq('active', true).order('created_at', { ascending: true })
    const agentsWithPhone = (agents || []).filter(a => a.phone)
    const agentIds = agentsWithPhone.map(a => a.id)

    const nodes = buildDefaultNodes(agentIds)
    const edges = buildDefaultEdges()

    const payload = {
      name:       'Target Team — Main Call Flow',
      flow_nodes: JSON.stringify(nodes),
      flow_edges: JSON.stringify(edges),
      is_active:  true,
      updated_at: new Date().toISOString(),
    }

    // Deactivate all existing flows
    await supabase.from('phone_ivr').update({ is_active: false })
      .neq('id', '00000000-0000-0000-0000-000000000000')

    // Update most recent row or insert new
    const { data: existing } = await supabase.from('phone_ivr')
      .select('id').order('updated_at', { ascending: false }).limit(1).maybeSingle()

    let savedId = null
    if (existing?.id) {
      const { error } = await supabase.from('phone_ivr').update(payload).eq('id', existing.id)
      if (error) throw error
      savedId = existing.id
    } else {
      const { data: ins, error } = await supabase.from('phone_ivr')
        .insert({ ...payload, voicemail_extension:'9', created_at: new Date().toISOString() })
        .select().single()
      if (error) throw error
      savedId = ins?.id
    }

    return res.status(200).json({
      ok:           true,
      saved_id:     savedId,
      name:         'Target Team — Main Call Flow',
      flow_nodes:   nodes,
      flow_edges:   edges,
      nodes:        nodes.length,
      edges:        edges.length,
      agents_in_roundrobin: agentsWithPhone.length,
      agents:       agentsWithPhone.map((a,i) => a.name + ' ext ' + (101+i) + ' ' + a.phone),
      menu:         nodes.find(n=>n.type==='menu').config.options.map(o=>'Press '+o.key+' → '+o.label),
      message:      'SUCCESS — call +18453271778 to test',
    })

  } catch(e) {
    return res.status(500).json({ error: e.message })
  }
}
