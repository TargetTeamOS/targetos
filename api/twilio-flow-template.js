// TargetOS V2 — Target Team Call Flow Template
// Serves the pre-built flow WITH real agent IDs injected.
// Also handles POST to save the flow directly to phone_ivr.
'use strict'

const { getSupabase } = require('./_lib/phone')

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')

  const supabase = getSupabase()

  // Load real agents so Ring All actually has the right IDs
  let agentIds = []
  let agentList = []
  if (supabase) {
    const { data: agents } = await supabase
      .from('agents').select('id,name,phone')
      .eq('active', true).order('created_at', { ascending: true }).limit(20)
    agentList  = (agents || []).filter(a => a.phone)
    agentIds   = agentList.map(a => a.id)
  }

  // ── LAYOUT POSITIONS ───────────────────────────────────────────
  // Column 1 (x=60):  Incoming call
  // Column 2 (x=340): Greeting
  // Column 3 (x=640): Main menu
  // Column 4 (x=960): Destinations (Ring All, Directory, Voicemail, Listings, MLS)
  // Column 5 (x=1260): No-answer fallback voicemail

  const nodes = [
    // ── TRIGGER ──────────────────────────────────────────────
    {
      id: 'start', type: 'incoming',
      x: 60, y: 320, config: {}
    },

    // ── GREETING ─────────────────────────────────────────────
    {
      id: 'greeting', type: 'greeting',
      x: 340, y: 320,
      config: {
        text: 'Thank you for calling Target Team, Keller Williams Valley Realty, your local real estate experts in Rockland County. Your call is very important to us.',
        voice: 'Polly.Joanna'
      }
    },

    // ── MAIN MENU ─────────────────────────────────────────────
    {
      id: 'menu', type: 'menu',
      x: 640, y: 200,
      config: {
        text: 'Press 1 to be connected to an agent. Press 2 for our agent directory. Press 3 to leave a voicemail. Press 4 for our exclusive listings. Press 5 to search live M L S listings.',
        voice: 'Polly.Joanna',
        timeout: 10,
        options: [
          { key: '1', label: 'Connect to Agent',  say: 'Connecting you to an available agent now. Please hold.' },
          { key: '2', label: 'Agent Directory',    say: 'Opening our agent directory. Please hold.' },
          { key: '3', label: 'Leave Voicemail',    say: '' },
          { key: '4', label: 'Exclusive Listings', say: 'Opening our exclusive listings search.' },
          { key: '5', label: 'Live MLS Search',    say: 'Opening our live M L S listings search.' },
        ]
      }
    },

    // ── KEY 1: Ring All Agents ────────────────────────────────
    {
      id: 'ringall', type: 'ringall',
      x: 960, y: 60,
      config: {
        agent_ids: agentIds,
        timeout: 30
      }
    },

    // ── KEY 2: Agent Directory ────────────────────────────────
    {
      id: 'directory', type: 'directory',
      x: 960, y: 180,
      config: { voice: 'Polly.Joanna' }
    },

    // ── KEY 3: Voicemail ──────────────────────────────────────
    {
      id: 'voicemail', type: 'voicemail',
      x: 960, y: 300,
      config: {
        text: 'Thank you for calling Target Team. Please leave your name, phone number, and a brief message and one of our agents will return your call as soon as possible. Please begin speaking after the tone.',
        voice: 'Polly.Joanna',
        max_length: 120,
        transcribe: true,
        notify_agent: true,
        pin_enabled: false,
        pin: '',
        pin_attempts: 3
      }
    },

    // ── KEY 4: Exclusive CRM Listings ─────────────────────────
    {
      id: 'listings', type: 'listings',
      x: 960, y: 420,
      config: {
        intro: 'Welcome to our exclusive listings search. Search by area, price, bedrooms, bathrooms, and property type.',
        voice: 'Polly.Joanna',
        max_results: 5
      }
    },

    // ── KEY 5: Live MLS Search ────────────────────────────────
    {
      id: 'mlssearch', type: 'mlssearch',
      x: 960, y: 540,
      config: {
        intro: 'Welcome to our live M L S listings search for Rockland County.',
        voice: 'Polly.Joanna',
        max_results: 5,
        area: 'Rockland'
      }
    },

    // ── No-Answer Fallback Voicemail ──────────────────────────
    {
      id: 'vm_fallback', type: 'voicemail',
      x: 1260, y: 60,
      config: {
        text: 'We are sorry, all of our agents are currently busy. Please leave your name and phone number after the tone and we will return your call as soon as possible.',
        voice: 'Polly.Joanna',
        max_length: 120,
        transcribe: true,
        notify_agent: true,
        pin_enabled: false,
        pin: '',
        pin_attempts: 3
      }
    },
  ]

  const edges = [
    { id: 'e1', from: 'start',    port: 'out',      to: 'greeting'   },
    { id: 'e2', from: 'greeting', port: 'out',      to: 'menu'       },
    { id: 'e3', from: 'menu',     port: 'key_1',    to: 'ringall'    },
    { id: 'e4', from: 'menu',     port: 'key_2',    to: 'directory'  },
    { id: 'e5', from: 'menu',     port: 'key_3',    to: 'voicemail'  },
    { id: 'e6', from: 'menu',     port: 'key_4',    to: 'listings'   },
    { id: 'e7', from: 'menu',     port: 'key_5',    to: 'mlssearch'  },
    { id: 'e8', from: 'ringall',  port: 'noanswer', to: 'vm_fallback'},
  ]

  const template = {
    name: 'Target Team — Main Call Flow',
    flow_nodes: nodes,
    flow_edges: edges,
    agents_loaded: agentList.map(a => ({ id: a.id, name: a.name, phone: a.phone })),
  }

  // ── POST: SAVE directly to phone_ivr ────────────────────────────
  if (req.method === 'POST' && supabase) {
    try {
      const payload = {
        name:       template.name,
        flow_nodes: JSON.stringify(nodes),
        flow_edges: JSON.stringify(edges),
        is_active:  true,
        updated_at: new Date().toISOString(),
      }

      // Try to find existing row
      const { data: existing, error: selErr } = await supabase
        .from('phone_ivr').select('id,flow_nodes').limit(1).maybeSingle()

      if (selErr && selErr.message && selErr.message.includes('flow_nodes')) {
        // Column doesn't exist yet
        return res.status(500).json({
          error: 'Missing DB columns',
          fix: 'Run this SQL in Supabase SQL Editor, then try again:',
          sql: [
            'alter table phone_ivr add column if not exists flow_nodes jsonb;',
            'alter table phone_ivr add column if not exists flow_edges jsonb;',
            'alter table phone_ivr add column if not exists is_active boolean default true;',
          ]
        })
      }

      let savedId = null
      if (existing?.id) {
        const { error: upErr } = await supabase.from('phone_ivr').update(payload).eq('id', existing.id)
        if (upErr) throw upErr
        savedId = existing.id
      } else {
        const { data: ins, error: insErr } = await supabase.from('phone_ivr')
          .insert({ ...payload, voicemail_extension: '9', created_at: new Date().toISOString() })
          .select().single()
        if (insErr) throw insErr
        savedId = ins?.id
      }

      return res.status(200).json({
        ok: true,
        saved: true,
        id: savedId,
        agents: agentList.length,
        agent_names: agentList.map(a => a.name),
        nodes: nodes.length,
        edges: edges.length,
        message: 'Flow saved — ' + nodes.length + ' nodes, ' + agentList.length + ' agent' + (agentList.length !== 1 ? 's' : '') + ' in Ring All',
      })
    } catch(e) {
      return res.status(500).json({ error: e.message, detail: 'Check that phone_ivr table has flow_nodes, flow_edges, and is_active columns' })
    }
  }

  return res.status(200).json(template)
}
