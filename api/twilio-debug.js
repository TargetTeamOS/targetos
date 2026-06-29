// TargetOS V2 — Call Flow Debug
// GET /api/twilio-debug — shows the saved flow and what Twilio would receive
'use strict'

function getSupabase() {
  var url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  var key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return require('@supabase/supabase-js').createClient(url, key)
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')

  var supabase = getSupabase()
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' })

  try {
    // Load all flows
    var { data: flows, error } = await supabase.from('phone_ivr').select('id, name, is_active, updated_at, flow_nodes, flow_edges').order('updated_at', { ascending: false }).limit(5)
    if (error) throw error

    var result = (flows || []).map(function(f) {
      var nodes = f.flow_nodes || []
      var edges = f.flow_edges || []
      var startNode = nodes.find(function(n) { return n.type === 'incoming' })
      return {
        id:          f.id,
        name:        f.name,
        is_active:   f.is_active,
        updated_at:  f.updated_at,
        node_count:  nodes.length,
        edge_count:  edges.length,
        has_start:   !!startNode,
        node_types:  nodes.map(function(n) { return n.type }),
        edges:       edges.map(function(e) { return e.from + ':' + e.port + ' → ' + e.to }),
      }
    })

    return res.status(200).json({
      total_flows: result.length,
      flows:       result,
      webhook_url: 'https://app.targetreteam.com/api/twilio-inbound',
      instructions: 'Set this webhook in Twilio Console → Phone Numbers → 845-327-1778 → Voice webhook (POST)',
    })
  } catch(e) {
    return res.status(500).json({ error: e.message })
  }
}
