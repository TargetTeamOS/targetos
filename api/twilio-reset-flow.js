// TargetOS V2 — Flow Reset (GET or POST)
'use strict'

const { getSupabase } = require('./_lib/phone')

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')

  const supabase = getSupabase()

  try {
    const { data: agents } = await supabase
      .from('agents').select('id,name,phone')
      .eq('active', true).order('created_at', { ascending: true })
    const agentsWithPhone = (agents || []).filter(a => a.phone)
    const agentIds = agentsWithPhone.map(a => a.id)

    const nodes = [
      { id:'start',       type:'incoming',  x:60,   y:300, config:{} },
      { id:'greeting',    type:'greeting',  x:340,  y:300, config:{ text:'Thank you for calling Target Team, Keller Williams Valley Realty. Your call is very important to us.', voice:'Polly.Joanna' } },
      { id:'menu',        type:'menu',      x:640,  y:160, config:{
          text:'Press 1 to be connected to an available agent. Press 2 for our agent directory. Press 3 to leave a voicemail. Press 4 for our exclusive listings. Press 5 to search live MLS listings.',
          voice:'Polly.Joanna', timeout:10,
          options:[
            { key:'1', label:'Connect to Agent',  say:'Connecting you to the next available agent. Please hold.' },
            { key:'2', label:'Agent Directory',    say:'Opening our agent directory.' },
            { key:'3', label:'Leave Voicemail',    say:'' },
            { key:'4', label:'Exclusive Listings', say:'Opening our exclusive listings search.' },
            { key:'5', label:'Live MLS Search',    say:'Opening our live MLS search.' },
          ]
        }
      },
      { id:'ringall',     type:'ringall',   x:960,  y:40,  config:{ agent_ids:agentIds, timeout:30 } },
      { id:'directory',   type:'directory', x:960,  y:160, config:{ voice:'Polly.Joanna' } },
      { id:'voicemail',   type:'voicemail', x:960,  y:280, config:{ text:'Thank you for calling Target Team. Please leave your name, phone number, and a brief message and we will call you back as soon as possible.', voice:'Polly.Joanna', max_length:120, transcribe:true, notify_agent:true, pin_enabled:false } },
      { id:'listings',    type:'listings',  x:960,  y:400, config:{ intro:'Welcome to our exclusive listings search. Search by area, price, bedrooms, bathrooms, and property type.', voice:'Polly.Joanna', max_results:5 } },
      { id:'mlssearch',   type:'mlssearch', x:960,  y:520, config:{ intro:'Welcome to our live MLS search for Rockland County.', voice:'Polly.Joanna', max_results:5, area:'Rockland' } },
      { id:'vm_fallback', type:'voicemail', x:1260, y:40,  config:{ text:'We are sorry, all agents are currently unavailable. Please leave your name and number and we will return your call promptly.', voice:'Polly.Joanna', max_length:120, transcribe:true, notify_agent:true, pin_enabled:false } },
    ]

    const edges = [
      { id:'e1', from:'start',    port:'out',      to:'greeting'    },
      { id:'e2', from:'greeting', port:'out',      to:'menu'        },
      { id:'e3', from:'menu',     port:'key_1',    to:'ringall'     },
      { id:'e4', from:'menu',     port:'key_2',    to:'directory'   },
      { id:'e5', from:'menu',     port:'key_3',    to:'voicemail'   },
      { id:'e6', from:'menu',     port:'key_4',    to:'listings'    },
      { id:'e7', from:'menu',     port:'key_5',    to:'mlssearch'   },
      { id:'e8', from:'ringall',  port:'noanswer', to:'vm_fallback' },
    ]

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
      agents_in_ringall: agentsWithPhone.length,
      agents:       agentsWithPhone.map((a,i) => a.name + ' ext ' + (101+i) + ' ' + a.phone),
      menu:         nodes.find(n=>n.type==='menu').config.options.map(o=>'Press '+o.key+' → '+o.label),
      message:      'SUCCESS — call +18453271778 to test',
    })

  } catch(e) {
    return res.status(500).json({ error: e.message })
  }
}
