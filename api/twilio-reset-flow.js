// TargetOS V2 — One-time flow reset
// POST /api/twilio-reset-flow
// Writes the correct Target Team flow directly to phone_ivr,
// overwriting whatever broken flow exists.
'use strict'

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return require('@supabase/supabase-js').createClient(url, key)
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  // Accept GET too so it can be triggered directly from browser address bar

  const supabase = getSupabase()
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' })

  try {
    // Load agents with phones
    const { data: agents } = await supabase
      .from('agents').select('id,name,phone')
      .eq('active', true).order('created_at', { ascending: true })
    const agentsWithPhone = (agents || []).filter(a => a.phone)
    const agentIds = agentsWithPhone.map(a => a.id)

    // THE CORRECT FLOW — clean, simple, every option wired
    const nodes = [
      {
        id: 'start', type: 'incoming', x: 60, y: 300, config: {}
      },
      {
        id: 'greeting', type: 'greeting', x: 340, y: 300, config: {
          text: 'Thank you for calling Target Team, Keller Williams Valley Realty. Your call is very important to us.',
          voice: 'Polly.Joanna'
        }
      },
      {
        id: 'menu', type: 'menu', x: 640, y: 160, config: {
          text: 'Press 1 to be connected to an available agent. Press 2 for our agent directory with extensions. Press 3 to leave a voicemail. Press 4 for our exclusive listings. Press 5 to search live MLS listings.',
          voice: 'Polly.Joanna',
          timeout: 10,
          options: [
            { key: '1', label: 'Connect to Agent',   say: 'Connecting you to the next available agent. Please hold.' },
            { key: '2', label: 'Agent Directory',     say: 'Opening our agent directory.' },
            { key: '3', label: 'Leave Voicemail',     say: '' },
            { key: '4', label: 'Exclusive Listings',  say: 'Opening our exclusive listings search.' },
            { key: '5', label: 'Live MLS Search',     say: 'Opening our live MLS search.' },
          ]
        }
      },
      // Press 1 → Ring All agents
      {
        id: 'ringall', type: 'ringall', x: 960, y: 40, config: {
          agent_ids: agentIds,
          timeout: 30
        }
      },
      // Press 2 → Agent Directory (101, 102, 103...)
      {
        id: 'directory', type: 'directory', x: 960, y: 160, config: {
          voice: 'Polly.Joanna'
        }
      },
      // Press 3 → Voicemail
      {
        id: 'voicemail', type: 'voicemail', x: 960, y: 280, config: {
          text: 'Thank you for calling Target Team. Please leave your name, phone number, and a brief message and one of our agents will return your call as soon as possible.',
          voice: 'Polly.Joanna',
          max_length: 120,
          transcribe: true,
          notify_agent: true,
          pin_enabled: false
        }
      },
      // Press 4 → CRM Exclusive Listings
      {
        id: 'listings', type: 'listings', x: 960, y: 400, config: {
          intro: 'Welcome to our exclusive listings search. You can search by area, price range, bedrooms, bathrooms, and property type.',
          voice: 'Polly.Joanna',
          max_results: 5
        }
      },
      // Press 5 → Live MLS Search
      {
        id: 'mlssearch', type: 'mlssearch', x: 960, y: 520, config: {
          intro: 'Welcome to our live MLS listings search for Rockland County.',
          voice: 'Polly.Joanna',
          max_results: 5,
          area: 'Rockland'
        }
      },
      // Fallback voicemail when Ring All gets no answer
      {
        id: 'vm_fallback', type: 'voicemail', x: 1260, y: 40, config: {
          text: 'We are sorry, all of our agents are currently unavailable. Please leave your name and phone number and we will return your call promptly.',
          voice: 'Polly.Joanna',
          max_length: 120,
          transcribe: true,
          notify_agent: true,
          pin_enabled: false
        }
      }
    ]

    const edges = [
      { id: 'e1', from: 'start',    port: 'out',      to: 'greeting'    },
      { id: 'e2', from: 'greeting', port: 'out',      to: 'menu'        },
      { id: 'e3', from: 'menu',     port: 'key_1',    to: 'ringall'     },
      { id: 'e4', from: 'menu',     port: 'key_2',    to: 'directory'   },
      { id: 'e5', from: 'menu',     port: 'key_3',    to: 'voicemail'   },
      { id: 'e6', from: 'menu',     port: 'key_4',    to: 'listings'    },
      { id: 'e7', from: 'menu',     port: 'key_5',    to: 'mlssearch'   },
      { id: 'e8', from: 'ringall',  port: 'noanswer', to: 'vm_fallback' },
    ]

    const payload = {
      name:       'Target Team — Main Call Flow',
      flow_nodes: JSON.stringify(nodes),
      flow_edges: JSON.stringify(edges),
      is_active:  true,
      updated_at: new Date().toISOString(),
    }

    // Deactivate ALL existing flows first
    await supabase.from('phone_ivr').update({ is_active: false }).neq('id', '00000000-0000-0000-0000-000000000000')

    // Find the main flow row to update (prefer the previously active one)
    const { data: existing } = await supabase
      .from('phone_ivr').select('id').order('updated_at', { ascending: false }).limit(1).maybeSingle()

    let savedId = null
    if (existing?.id) {
      const { error } = await supabase.from('phone_ivr').update(payload).eq('id', existing.id)
      if (error) throw error
      savedId = existing.id
    } else {
      const { data: ins, error } = await supabase.from('phone_ivr')
        .insert({ ...payload, voicemail_extension: '9', created_at: new Date().toISOString() })
        .select().single()
      if (error) throw error
      savedId = ins?.id
    }

    return res.status(200).json({
      ok:          true,
      id:          savedId,
      nodes:       nodes.length,
      edges:       edges.length,
      agents:      agentsWithPhone.length,
      agent_names: agentsWithPhone.map((a, i) => `${a.name} (ext ${101 + i}, ${a.phone})`),
      menu_options: nodes.find(n => n.type === 'menu').config.options.map(o => `${o.key} → ${o.label}`),
      message:     'Flow saved and active. Call +18453271778 to test.',
    })

  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
