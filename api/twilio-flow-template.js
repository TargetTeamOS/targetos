// TargetOS V2 — Returns the pre-built Target Team call flow template
// GET /api/twilio-flow-template
// Used by the Call Flow editor "Load Template" button
'use strict'

module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')

  // The complete Target Team main call flow
  // Matches exactly what was requested:
  // Greeting → Menu (1=Agent, 2=Directory, 3=Voicemail, 4=Exclusive Listings, 5=MLS Search)
  // Each agent under Directory gets extension 101, 102, 103...
  const template = {
    name: 'Target Team Main Flow',
    flow_nodes: [
      // ── TRIGGER ──────────────────────────────────────────────────
      { id:'start', type:'incoming', x:60,  y:280, config:{} },

      // ── GREETING ─────────────────────────────────────────────────
      { id:'greeting', type:'greeting', x:320, y:280, config:{
        text:'Thank you for calling Target Team, your local real estate experts in Rockland County. Your call is important to us.',
        voice:'Polly.Joanna'
      }},

      // ── MAIN MENU ────────────────────────────────────────────────
      { id:'menu', type:'menu', x:590, y:180, config:{
        text:'Press 1 to be connected to an agent. Press 2 for our agent directory. Press 3 to leave a voicemail. Press 4 for our exclusive listings. Press 5 to search live M L S listings.',
        voice:'Polly.Joanna',
        timeout:10,
        options:[
          { key:'1', label:'Connect to Agent',       say:'Connecting you to an available agent. Please hold.' },
          { key:'2', label:'Agent Directory',         say:'Opening our agent directory.' },
          { key:'3', label:'Voicemail',               say:'' },
          { key:'4', label:'Exclusive Listings',      say:'Opening our exclusive listings search.' },
          { key:'5', label:'Live MLS Search',         say:'Opening our live M L S search.' },
        ]
      }},

      // ── PRESS 1: Ring All Agents ──────────────────────────────────
      { id:'ringall', type:'ringall', x:880, y:40, config:{
        agent_ids:[], // populated at save time with real agent IDs
        timeout:30
      }},

      // ── PRESS 2: Agent Directory ──────────────────────────────────
      { id:'directory', type:'assigned', x:880, y:160, config:{ timeout:30 } },

      // ── PRESS 3: Voicemail ────────────────────────────────────────
      { id:'voicemail', type:'voicemail', x:880, y:280, config:{
        text:'Thank you for calling Target Team. Please leave your name, number, and a brief message and one of our agents will get back to you shortly.',
        voice:'Polly.Joanna',
        max_length:120,
        transcribe:true,
        notify_agent:true,
        pin_enabled:false,
        pin:'',
        pin_attempts:3
      }},

      // ── PRESS 4: Exclusive Listings ───────────────────────────────
      { id:'listings', type:'listings', x:880, y:400, config:{
        intro:'Welcome to our exclusive listings search. Our listings are searchable by area, price, bedrooms, bathrooms, and property type.',
        voice:'Polly.Joanna',
        max_results:5
      }},

      // ── PRESS 5: Live MLS Search ──────────────────────────────────
      { id:'mlssearch', type:'mlssearch', x:880, y:520, config:{
        intro:'Welcome to our live M L S search for Rockland County.',
        voice:'Polly.Joanna',
        max_results:5,
        area:'Rockland'
      }},

      // ── NO ANSWER fallback → Voicemail ────────────────────────────
      { id:'vm_fallback', type:'voicemail', x:1160, y:40, config:{
        text:'Sorry, all of our agents are currently busy. Please leave a message and we will call you back as soon as possible.',
        voice:'Polly.Joanna',
        max_length:120,
        transcribe:true,
        notify_agent:true,
        pin_enabled:false,
        pin:'',
        pin_attempts:3
      }},
    ],
    flow_edges: [
      { id:'e1', from:'start',     port:'out',      to:'greeting'   },
      { id:'e2', from:'greeting',  port:'out',      to:'menu'       },
      { id:'e3', from:'menu',      port:'key_1',    to:'ringall'    },
      { id:'e4', from:'menu',      port:'key_2',    to:'directory'  },
      { id:'e5', from:'menu',      port:'key_3',    to:'voicemail'  },
      { id:'e6', from:'menu',      port:'key_4',    to:'listings'   },
      { id:'e7', from:'menu',      port:'key_5',    to:'mlssearch'  },
      { id:'e8', from:'ringall',   port:'noanswer', to:'vm_fallback'},
      { id:'e9', from:'directory', port:'notfound', to:'voicemail'  },
    ]
  }

  return res.status(200).json(template)
}
