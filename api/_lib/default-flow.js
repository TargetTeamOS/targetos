// TargetOS V2 — Shared Default Call Flow
// Single source of truth, used by both twilio-inbound.js (auto-saves
// this if no flow exists yet) and twilio-reset-flow.js (manual
// "Reset to Template" button). Previously these were two independently
// hand-maintained copies that could silently drift out of sync --
// exactly the kind of duplication bug found repeatedly in this
// codebase. Fixed July 2026.
'use strict'

const DEFAULT_NODES = [
  { id:'start',       type:'incoming',  x:60,   y:400, config:{} },
  { id:'greeting',    type:'greeting',  x:340,  y:400, config:{ text:'Thank you for calling Target Team of Keller Williams.', voice:'Polly.Joanna' } },
  { id:'menu',        type:'menu',      x:640,  y:400, config:{
    text:'Press 1 to be connected to an agent. Press 2 for the office. Press 3 for our agent directory. Press 5 for our exclusive listings. Press 6 to search live MLS listings. Press 0 to leave a voicemail.',
    voice:'Polly.Joanna', timeout:10,
    options:[
      { key:'1', label:'Connect to Agent',   say:'' },
      { key:'2', label:'Office',             say:'' },
      { key:'3', label:'Agent Directory',    say:'Opening our agent directory.' },
      { key:'5', label:'Exclusive Listings', say:'Opening our exclusive listings search.' },
      { key:'6', label:'Live MLS Search',    say:'' },
      { key:'0', label:'Leave Voicemail',    say:'' },
    ]
  }},
  // Option 1: known contact with an assigned agent rings that agent
  // directly; anyone else (or if that agent doesn't answer) falls to
  // the round-robin hunt group among selected agents.
  { id:'assigned',    type:'assigned',  x:960,  y:40,  config:{ timeout:25 } },
  { id:'roundrobin',  type:'roundrobin',x:1260, y:40,  config:{ agent_ids:[], per_agent_seconds:20, total_seconds:60 } },
  { id:'vm_fallback', type:'voicemail', x:1560, y:40,  config:{ text:'We are sorry, all agents are currently unavailable. Please leave your name and number and we will return your call promptly.', voice:'Polly.Joanna', max_length:120, transcribe:true, notify_agent:true, pin_enabled:false } },
  // Option 2: office line -- not wired to real hardware yet, left
  // blank on purpose. Gracefully offers voicemail until a real
  // extension is configured here via the Call Flow builder.
  { id:'office',      type:'dial',      x:960,  y:160, config:{ dial_type:'number', direct_number:'', timeout:25 } },
  { id:'office_vm',   type:'voicemail', x:1260, y:160, config:{ text:'The office is currently unavailable. Please leave your name, number, and a brief message.', voice:'Polly.Joanna', max_length:120, transcribe:true, notify_agent:true, pin_enabled:false } },
  // Option 3: agent directory (only agents marked in_directory)
  { id:'directory',   type:'directory', x:960,  y:280, config:{ voice:'Polly.Joanna' } },
  // Option 5: exclusive listings (only listings marked ivr_enabled)
  { id:'listings',    type:'listings',  x:960,  y:400, config:{ intro:'Welcome to our exclusive listings search. Search by area, price, bedrooms, and bathrooms.', voice:'Polly.Joanna', max_results:5 } },
  // Option 6: MLS search -- real integration exists (twilio-mls-search.js)
  // but isn't properly connected yet per business decision -- "coming
  // soon" message instead of risking demo/fake data, then offers the
  // agent connect path so the caller isn't stranded.
  { id:'mls_soon',    type:'audio',     x:960,  y:520, config:{ say_first:'Our live MLS search is coming soon. Let us connect you with an agent instead. Please hold.' } },
  // Option 0: general voicemail, not tied to a specific agent
  { id:'voicemail',   type:'voicemail', x:960,  y:640, config:{ text:'Please leave your name, phone number, and a brief message and one of our agents will return your call as soon as possible.', voice:'Polly.Joanna', max_length:120, transcribe:true, notify_agent:true, pin_enabled:false } },
]

const DEFAULT_EDGES = [
  { id:'e1',  from:'start',      port:'out',      to:'greeting'    },
  { id:'e2',  from:'greeting',   port:'out',      to:'menu'        },
  { id:'e3',  from:'menu',       port:'key_1',    to:'assigned'    },
  { id:'e4',  from:'assigned',   port:'notfound', to:'roundrobin'  },
  { id:'e5',  from:'roundrobin', port:'noanswer', to:'vm_fallback' },
  { id:'e6',  from:'menu',       port:'key_2',    to:'office'      },
  { id:'e7',  from:'office',     port:'noanswer', to:'office_vm'   },
  { id:'e8',  from:'menu',       port:'key_3',    to:'directory'   },
  { id:'e9',  from:'menu',       port:'key_5',    to:'listings'    },
  { id:'e10', from:'menu',       port:'key_6',    to:'mls_soon'    },
  { id:'e11', from:'mls_soon',   port:'out',      to:'assigned'    },
  { id:'e12', from:'menu',       port:'key_0',    to:'voicemail'   },
]

// Returns a fresh deep copy of DEFAULT_NODES with agent_ids populated
// on the roundrobin node -- callers should never mutate the shared
// constants directly.
function buildDefaultNodes(agentIds) {
  return DEFAULT_NODES.map(n =>
    n.id === 'roundrobin' ? { ...n, config: { ...n.config, agent_ids: agentIds || [] } } : { ...n, config: { ...n.config } }
  )
}

function buildDefaultEdges() {
  return DEFAULT_EDGES.map(e => ({ ...e }))
}

module.exports = { DEFAULT_NODES, DEFAULT_EDGES, buildDefaultNodes, buildDefaultEdges }
