// ═══════════════════════════════════════════════════════════════
// TEAM & AGENT GOALS — 2026
// Three metrics tracked: Units, Production (volume), GCI
// ═══════════════════════════════════════════════════════════════

export const TEAM_GOALS = {
  units:      50,
  production: 30000000, // $30M
  gci:        2000000,  // $2M
}

export const AGENT_GOALS = {
  a1: { name:'Lazer Farkas',       units:12, production:5000000,  gci:200000 },
  a2: { name:'Mendy Jankovits',    units:10, production:4000000,  gci:150000 },
  a3: { name:'Isaac Leibowitz',    units:11, production:4500000,  gci:180000 },
  a4: { name:'Yanky Lichtenstein', units:6,  production:2500000,  gci:100000 },
  a5: { name:'Gitty Fogel',        units:4,  production:1500000,  gci:80000  },
  a6: { name:'Joel Rottenstein',   units:8,  production:3500000,  gci:120000 },
  a7: { name:'Eli Hoffman',        units:5,  production:2000000,  gci:90000  },
  a8: { name:'Avraham Weinberger', units:10, production:4500000,  gci:160000 },
}

// Current actuals from Production board
export const AGENT_ACTUALS = {
  a1: { name:'Lazer Farkas',       units:3, production:2362000, gci:77440  },
  a2: { name:'Mendy Jankovits',    units:2, production:2300000, gci:34000  },
  a3: { name:'Isaac Leibowitz',    units:2, production:1842000, gci:46090  },
  a4: { name:'Yanky Lichtenstein', units:0, production:0,       gci:0      },
  a5: { name:'Gitty Fogel',        units:0, production:0,       gci:0      },
  a6: { name:'Joel Rottenstein',   units:1, production:2650000, gci:39750  },
  a7: { name:'Eli Hoffman',        units:5, production:6559000, gci:146735 },
  a8: { name:'Avraham Weinberger', units:1, production:800000,  gci:24000  },
}

export const TEAM_ACTUALS = {
  units:      Object.values(AGENT_ACTUALS).reduce((s,a)=>s+a.units,0),
  production: Object.values(AGENT_ACTUALS).reduce((s,a)=>s+a.production,0),
  gci:        Object.values(AGENT_ACTUALS).reduce((s,a)=>s+a.gci,0),
}

export const fmt$ = n => '$' + Number(n).toLocaleString()
export const pct = (actual, goal) => Math.min(Math.round(actual/goal*100), 100)
