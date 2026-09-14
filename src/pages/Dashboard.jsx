
export function Dashboard() {
  const navigate  = useNavigate()
  const { agent, isAdmin, canManage } = useAuth()
  usePageView('dashboard')
  const { toast } = useApp()
  const year = new Date().getFullYear().toString()

  // Load available years from DB on mount — auto-detects 2015, 2016... whatever exists
  React.useEffect(() => {
    loadAvailableYears(supabase).catch(() => {})
  }, [])

  // State
  const [data,         setData]         = useState({})
  const [loading,      setLoading]      = useState(true)
  const [widgets,      setWidgets]      = useState([])
  const [agentGoals,   setAgentGoals]   = useState({ goal_gci: 250000, goal_deals: 50 })
  const [teamGoals,    setTeamGoals]    = useState({ team_gci: 2000000, team_deals: 200 })
  const [agents,       setAgents]       = useState([])
  const [agentFilter,  setAgentFilter]  = useState('')
  const [yearFilter,   setYearFilter]   = useState(year)
  const [stageFilter,  setStageFilter]  = useState([])   // multi-select stages
  const [sideFilter,   setSideFilter]   = useState('')
  const [showFilters,  setShowFilters]  = useState(false) // filter panel open
  const [showWidgetMgr,setShowWidgetMgr]= useState(false) // widget manager open
  const [popup,        setPopup]        = useState(null)
  const [showCustomize,    setShowCustomize]    = useState(false)
  const [showGoals,        setShowGoals]        = useState(false)
  const [showAgentView,    setShowAgentView]    = useState(false)
  const [showCustomWidget, setShowCustomWidget] = useState(false)
  const [dragId,       setDragId]       = useState(null)
  const [editMode,       setEditMode]       = useState(false)
  const [pendingWidgets, setPendingWidgets]  = useState(null) // staged changes before save
  const [configWidget,   setConfigWidget]    = useState(null) // widget being configured
  const [savingPrefs,  setSavingPrefs]  = useState(false)
  const [hasBackupLayout, setHasBackupLayout] = useState(false)

  // ── FIELD CATALOG (Phase 4 of UNIVERSAL_FIELD_SYSTEM_PROPOSAL.md) ──
  // Built-in + custom fields per entity, loaded once (not per widget
  // render) so: (1) the widget config modal can offer any custom
  // field an admin has added via the Custom Fields page as a filter
  // on the matching widget, and (2) renderWidget()'s own filter-apply
  // logic can honor it via matchesCustomFilters() above. Mirrors the
  // same catalog already wired into Segments/Contacts -- see
  // src/lib/fieldCatalog.js. Degrades to built-ins-only (empty arrays)
  // if custom fields aren't reachable for some reason.
  const [fieldCatalogs, setFieldCatalogs] = useState({ contacts: [], deals: [], listings: [] })
  useEffect(() => {
    Promise.all([
      getFieldCatalog('contacts'),
      getFieldCatalog('deals'),
      getFieldCatalog('listings'),
    ]).then(([contacts, deals, listings]) => setFieldCatalogs({ contacts, deals, listings }))
      .catch(e => console.warn('Dashboard field catalog load failed:', e.message))
  }, [])

  // ── LOAD PREFS AND GOALS FROM DB ──────────────────────────────
  useEffect(() => {
    if (!agent) return
    loadDashPrefs(agent.id).then(p => {
      setWidgets(p.widgets || DEFAULT_WIDGETS)
      setHasBackupLayout(!!p.hasBackup)
    })
    loadAgentGoals(agent.id).then(setAgentGoals)
    loadTeamGoal().then(setTeamGoals)
  }, [agent?.id])

  // ── SAVE WIDGETS TO DB ────────────────────────────────────────
  async function persistWidgets(newWidgets) {
    setWidgets(newWidgets)
    setSavingPrefs(true)
    try {
      await saveDashPrefs(agent.id, newWidgets)
    } catch(e) {
      toast('Could not save layout: ' + e.message, '#DC2626')
    } finally { setSavingPrefs(false) }
  }

  // ── TRY THE NEW RECOMMENDED LAYOUT (backs up current layout first) ──
  async function tryNewLayout() {
    setSavingPrefs(true)
    try {
      await switchToNewDashLayout(agent.id, widgets)
      setWidgets(DEFAULT_WIDGETS)
      setHasBackupLayout(true)
      toast('✅ Switched to the new layout — your old one is saved, switch back anytime')
    } catch(e) {
      toast('Could not switch layout: ' + e.message, '#DC2626')
    } finally { setSavingPrefs(false) }
  }

  // ── RESTORE THE PREVIOUS LAYOUT ───────────────────────────────
  async function restorePreviousLayout() {
    setSavingPrefs(true)
    try {
      const restored = await restoreOldDashLayout(agent.id)
      if (restored) {
        setWidgets(restored)
        toast('✅ Restored your previous layout')
      } else {
        toast('No previous layout found to restore', '#DC2626')
      }
    } catch(e) {
      toast('Could not restore layout: ' + e.message, '#DC2626')
    } finally { setSavingPrefs(false) }
  }

  // ── DRAG TO REORDER ───────────────────────────────────────────
  const dragOver = useRef(null)

  function onDragStart(id) {
    if (!editMode) return
    setDragId(id)
  }
  function onDragEnter(e, id) {
    // Only update if entering the widget root element, not a child
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget)) {
      dragOver.current = id
    }
  }

  function onDragEnd() {
    if (!dragId || !dragOver.current || dragId === dragOver.current) {
      setDragId(null); dragOver.current = null; return
    }
    // Stage changes — don't save until Save Layout is clicked
    const base = pendingWidgets || widgets
    const newW = [...base]
    const fromIdx = newW.findIndex(w => w.id === dragId)
    const toIdx   = newW.findIndex(w => w.id === dragOver.current)
    if (fromIdx < 0 || toIdx < 0) { setDragId(null); return }
    const [moved] = newW.splice(fromIdx, 1)
    newW.splice(toIdx, 0, moved)
    setPendingWidgets(newW)   // stage only — not saved to DB yet
    setWidgets(newW)          // update UI immediately
    setDragId(null)
    dragOver.current = null
  }

  async function saveLayout() {
    const toSave = pendingWidgets || widgets
    await persistWidgets(toSave)
    setPendingWidgets(null)
    setEditMode(false)
    toast('✅ Layout saved and locked')
  }

  function cancelEdit() {
    // Revert unsaved changes
    if (pendingWidgets) {
      loadDashPrefs(agent.id).then(p => setWidgets(p.widgets || DEFAULT_WIDGETS))
      setPendingWidgets(null)
    }
    setEditMode(false)
  }

  // ── LOAD DATA ─────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!agent) return
    setLoading(true)
    try {
      const viewId = agentFilter || ((isAdmin || canManage) ? null : agent.id)
      const filter = arr => viewId ? arr.filter(x => x.agent_id === viewId) : arr

      const [rawDeals, rawContacts, rawTasks, rawListings, rawOH, rawAnn, rawAgents, rawGifts] = await Promise.all([
        supabase.from('deals').select('id,stage,gci,production,ao_date,close_date,expected_close_date,addr,client_name,agent_id,side,agents(id,name,color)').then(r => r.data || []),
        supabase.from('contacts').select('id,first_name,last_name,status,source,agent_id,created_at,phone').then(r => r.data || []),
        supabase.from('tasks').select('id,title,status,priority,due_date,agent_id,agents(id,name,color)').then(r => r.data || []),
        supabase.from('listings').select('id,addr,city,status,list_price,agent_id,agents(id,name,color)').then(r => r.data || []),
        supabase.from('open_houses').select('id,listing_addr,date,start_time,agent_id,agents(id,name,color)').then(r => r.data || []),
        supabase.from('announcements').select('*,agents(id,name,color)').order('pinned', { ascending: false }).limit(5).then(r => r.data || []),
        supabase.from('agents').select('*').eq('active', true).order('name').then(r => r.data || []),
        supabase.from('gifts').select('id,client_name,status,agent_id').then(r => r.data || []),
      ])

      const myDeals    = filter(rawDeals)
      const myContacts = filter(rawContacts)
      const myTasks    = filter(rawTasks)
      const myListings = filter(rawListings)
      const myOH       = filter(rawOH)

      const todayStr = new Date().toISOString().slice(0, 10)
      const weekEnd  = new Date(); weekEnd.setDate(weekEnd.getDate() + 7)
      const weekStr  = weekEnd.toISOString().slice(0, 10)

      const yearDeals   = myDeals.filter(d => {
        if (!d.ao_date?.startsWith(yearFilter)) return false
        if (sideFilter  && d.side  !== sideFilter)           return false
        return true
      })
      const closedDeals = yearDeals.filter(d => d.stage === 'Closed')
      const activeDeals = myDeals.filter(d => !['Closed','Deal Fell Through'].includes(d.stage))
      const closedGCI   = closedDeals.reduce((s, d) => s + parseNum(d.gci), 0)
      const pipelineGCI = activeDeals.reduce((s, d) => s + parseNum(d.gci), 0)

      // Team GCI — always all agents, for team_goal widget
      const teamClosed = rawDeals.filter(d => {
        if (!d.ao_date?.startsWith(yearFilter)) return false
        if (d.stage !== 'Closed') return false
        if (sideFilter && d.side !== sideFilter) return false
        return true
      })
      const teamGCI    = teamClosed.reduce((s, d) => s + parseNum(d.gci), 0)
      const teamDeals  = teamClosed.length

      const todayTasks  = myTasks.filter(t => t.status !== 'done' && (isDueToday(t.due_date) || isOverdue(t.due_date)))
      const overdueTasks = myTasks.filter(t => t.status !== 'done' && isOverdue(t.due_date))
      const hotLeads    = myContacts.filter(c => c.status === 'Hot' || c.status === 'Warm').sort((a, b) => a.status === 'Hot' ? -1 : 1)

      const upcoming = myDeals.filter(d => {
        const date = d.expected_close_date || d.close_date
        if (!date) return false
        const days = getDaysUntil(date)
        return days !== null && days >= 0 && days <= 30 && d.stage !== 'Closed'
      }).sort((a, b) => getDaysUntil(a.expected_close_date||a.close_date) - getDaysUntil(b.expected_close_date||b.close_date))

      const activeListings = myListings.filter(l => l.status === 'Active')
      const upcomingOH     = myOH.filter(oh => oh.date >= todayStr && oh.date <= weekStr)

      const monthlyGCI = Array.from({ length: 12 }, (_, m) => {
        const ms = yearFilter + '-' + String(m+1).padStart(2,'0')
        const gci = myDeals.filter(d => d.ao_date?.startsWith(ms) && d.stage === 'Closed').reduce((s, d) => s + parseNum(d.gci), 0)
        return { label: 'JFMAMJJASOND'[m], value: gci }
      })

      const leaderboard = rawAgents.map(a => {
        const ad  = rawDeals.filter(d => d.agent_id === a.id && d.ao_date?.startsWith(yearFilter))
        const gci = ad.filter(d => d.stage === 'Closed').reduce((s, d) => s + parseNum(d.gci), 0)
        return { agent: a, gci, closed: ad.filter(d => d.stage === 'Closed').length, active: ad.filter(d => !['Closed','Deal Fell Through'].includes(d.stage)).length }
      }).sort((a, b) => b.gci - a.gci)

      const pipeByStage = DEAL_STAGES.map(s => ({
        ...s,
        deals: activeDeals.filter(d => d.stage === s.value),
        gci:   activeDeals.filter(d => d.stage === s.value).reduce((sum, d) => sum + parseNum(d.gci), 0),
      }))

      const acceptedOffers   = myDeals.filter(d => d.stage === 'Offer Accapted')
      const underContract    = myDeals.filter(d => d.stage === 'Under Contract')
      const pendingGifts     = rawGifts.filter(g => !['Delivered'].includes(g.status))

      setAgents(rawAgents)
      setData({
        closedGCI, pipelineGCI, closedDeals, activeDeals, yearDeals,
        teamGCI, teamDeals, todayTasks, overdueTasks, hotLeads,
        upcoming, activeListings, upcomingOH, monthlyGCI, leaderboard,
        pipeByStage, announcements: rawAnn, pendingGifts,
        acceptedOffers, underContract,
        contactCount: myContacts.length,
      })
    } catch(e) {
      toast('Dashboard error: ' + e.message, '#DC2626')
    } finally { setLoading(false) }
  }, [agent?.id, agentFilter, yearFilter, stageFilter, sideFilter, isAdmin, canManage])

  useEffect(() => { loadData() }, [loadData])

  const stageHex = s => DEAL_STAGES.find(x => x.value === s)?.hex || '#c4c4c4'
  const show = id => widgets.find(w => w.id === id)?.visible
  const wColor = id => widgets.find(w => w.id === id)?.color || '#CC2200'
  const wSize  = id => widgets.find(w => w.id === id)?.size  || 'md'
  const visibleOrdered = widgets.filter(w => {
    if (!w.visible) return false
    // Custom widgets (id starts with 'custom_') always pass role check
    if (w.id.startsWith('custom_') || w.id === 'custom') return true
    // Standard widgets check role
    return WIDGET_DEFS[w.id]?.roles.includes(agent?.role || 'agent')
  })

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'
  const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString())

  if (!agent || !widgets.length) return <div style={{ fontFamily: ff }}><Loading /></div>

  // ── RENDER A WIDGET ───────────────────────────────────────────
  function renderWidget(w) {
    // Custom widgets have dynamic id like 'custom_1234'
    const isCustom = w.id.startsWith('custom_') || w.id === 'custom'
    const def   = isCustom ? { ...WIDGET_DEFS.custom, label: w.customConfig?.label || 'Custom Widget', icon: w.customConfig?.icon || '🔲' } : WIDGET_DEFS[w.id]
    const color = w.color || '#CC2200'
    const isLg  = w.size === 'lg'
    // Widget-level config filters (set via ⚙️ button by admin)
    const wcfg  = w.config || {}

    const shell = (widgetContent) => (
      <div key={w.id}
        draggable={editMode}
        onDragStart={() => onDragStart(w.id)}
        onDragEnter={e => onDragEnter(e, w.id)}
        onDragEnd={onDragEnd}
        onDragOver={e => { if (editMode) e.preventDefault() }}
        style={{
          gridColumn:    isLg ? 'span 2' : 'span 1',
          background:    'var(--panel)',
          borderRadius:  '14px',
          border:        editMode ? "2px dashed " + (color) : "1px solid var(--border)",
          boxShadow:     editMode ? 'none' : '0 1px 2px rgba(0,0,0,.04), 0 3px 8px rgba(0,0,0,.05)',
          display:       'flex',
          flexDirection: 'column',
          overflow:      'hidden',
          opacity:       dragId === w.id ? 0.35 : 1,
          transition:    'opacity .15s, box-shadow .15s, border .15s, transform .15s',
          cursor:        editMode ? 'grab' : 'default',
          position:      'relative',
        }}>
        {/* Widget header */}
        <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: editMode ? color + '0a' : 'transparent' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            {editMode && <span style={{ fontSize: '14px', color: 'var(--muted)', cursor: 'grab' }}>⠿</span>}
            <div style={{ width: 20, height: 20, borderRadius: '6px', background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: '11px' }}>{def?.icon}</span>
            </div>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-.1px' }}>{def?.label}</span>
          </div>
          {editMode ? (
            /* Edit mode controls on each widget */
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* Size toggle */}
              <button onClick={() => {
                const updated = widgets.map(x => x.id === w.id ? { ...x, size: x.size === 'lg' ? 'md' : 'lg' } : x)
                setWidgets(updated)
                setPendingWidgets(updated)
              }}
                style={{ padding: '2px 7px', borderRadius: '5px', border: "1px solid " + (color) + "44", background: color + '11', color: color, fontSize: '10px', fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>
                {w.size === 'lg' ? '▭ Full' : '◻ Half'}
              </button>
              {/* Color picker dots */}
              <div style={{ display: 'flex', gap: '3px' }}>
                {['#CC2200','#10B981','#3B82F6','#F5A623','#8B5CF6','#EC4899','#14B8A6'].map(c => (
                  <div key={c} onClick={() => {
                    const updated = widgets.map(x => x.id === w.id ? { ...x, color: c } : x)
                    setWidgets(updated)
                    setPendingWidgets(updated)
                  }}
                    style={{ width: 12, height: 12, borderRadius: '50%', background: c, cursor: 'pointer', border: color === c ? '2px solid var(--text)' : '1px solid transparent', transition: 'border .1s' }} />
                ))}
              </div>
              {/* Hide widget */}
              <button onClick={() => {
                const updated = widgets.map(x => x.id === w.id ? { ...x, visible: false } : x)
                setWidgets(updated)
                setPendingWidgets(updated)
              }}
                style={{ padding: '2px 6px', borderRadius: '5px', border: '1px solid #DC262644', background: '#FEF2F2', color: '#DC2626', fontSize: '11px', cursor: 'pointer', fontFamily: ff, fontWeight: 700 }}>
                ✕
              </button>
            </div>
          ) : (
            <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
              {(isAdmin || canManage) && WIDGET_CONFIG_OPTIONS[w.id] && (
                <button
                  onClick={e => { e.stopPropagation(); setConfigWidget(w) }}
                  title="Configure widget"
                  style={{ background:'none', border:'none', cursor:'pointer', fontSize:'13px', color:'var(--muted)', padding:'2px 4px', borderRadius:'4px', lineHeight:1 }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--hov)'; e.currentTarget.style.color = 'var(--text)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--muted)' }}>
                  ⚙️
                </button>
              )}
              <span style={{ fontSize: '10px', color: 'var(--border)', userSelect: 'none', letterSpacing: '1px' }}>⋮⋮</span>
            </div>
          )}
        </div>
        {/* Widget content — dimmed in edit mode so controls are clear */}
        <div style={{ flex: 1, padding: '11px 14px', overflow: 'hidden', opacity: editMode ? 0.4 : 1, pointerEvents: editMode ? 'none' : 'auto' }}>
          {widgetContent}
        </div>
      </div>
    )

    // ── GCI GOAL ──
    if (w.id === 'gci_goal') return shell(
      <div onClick={() => setPopup('gci_goal')} style={{ display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <GCIRing value={data.closedGCI} goal={agentGoals.goal_gci} color={color} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 900, color: 'var(--text)' }}>{pct(data.closedGCI, agentGoals.goal_gci)}%</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#10B981' }}>{fmt$(data.closedGCI)}</div>
          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>of {fmt$(agentGoals.goal_gci)} goal · {data.closedDeals?.length || 0} closed</div>
          <div style={{ fontSize: '11px', color: color, marginTop: '3px' }}>+ {fmt$(data.pipelineGCI)} pipeline</div>
        </div>
      </div>
    )

    // ── TEAM GOAL ──
    if (w.id === 'team_goal') return shell(
      <div onClick={() => setPopup('team_goal')} style={{ display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <GCIRing value={data.teamGCI} goal={teamGoals.team_gci} color={color} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 900, color: 'var(--text)' }}>{pct(data.teamGCI, teamGoals.team_gci)}%</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: color }}>{fmt$(data.teamGCI)}</div>
          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>of {fmt$(teamGoals.team_gci)} · {data.teamDeals}/{teamGoals.team_deals} deals</div>
        </div>
      </div>
    )

    // ── QUICK STATS ──
    if (w.id === 'quick_stats') return shell(
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
        {[
          { label: 'Active Deals',    value: data.activeDeals?.length || 0,    popup: 'active_deals',   c: '#3B82F6' },
          { label: 'Accepted Offers', value: data.acceptedOffers?.length || 0, popup: 'accepted_offers',c: '#10B981' },
          { label: 'Under Contract',  value: data.underContract?.length || 0,  popup: 'under_contract', c: '#9D50DD' },
          { label: 'Closed GCI',      value: fmt$(data.closedGCI),             popup: 'gci_goal',       c: '#F5A623' },
          { label: 'Hot Leads',       value: data.contactCount || 0,           popup: 'hot_leads',      c: '#DC2626' },
          { label: 'Active Listings', value: data.activeListings?.length || 0, popup: 'active_listings',c: '#14B8A6' },
        ].map(s => (
          <div key={s.label} onClick={() => setPopup(s.popup)}
            style={{ padding: '10px', background: s.c + '0d', borderRadius: '8px', cursor: 'pointer', borderLeft: "3px solid " + (s.c), transition: 'box-shadow .12s' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>{s.value}</div>
            <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>
    )

    // ── PIPELINE ──
    if (w.id === 'pipeline') return shell(
      <div>
        {data.pipeByStage?.filter(s => s.deals.length > 0).map(s => (
          <div key={s.value} onClick={() => setPopup('stage_' + s.value)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.7'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.hex, flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: '12px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)' }}>{s.deals.length}</div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: s.hex }}>{fmt$(s.gci)}</div>
          </div>
        ))}
        {!data.pipeByStage?.some(s => s.deals.length > 0) && <div style={{ textAlign: 'center', padding: '16px', color: 'var(--muted)', fontSize: '12px' }}>No active deals</div>}
        <div onClick={() => navigate('/pipeline')} style={{ fontSize: '11px', color: color, cursor: 'pointer', marginTop: '8px' }}>View Pipeline →</div>
      </div>
    )

    // ── TODAY'S TASKS ──
    if (w.id === 'todays_tasks') {
      // NOTE (Sept 2026 Field Catalog follow-up): this filter was being
      // computed but never actually applied below -- the render used
      // `data.todayTasks` (server-side "today only" list) directly
      // instead of this widget-config-filtered `filteredTasks`. Fixed
      // here to actually honor the ⚙️ Configure filters, same fix
      // applied to hot_leads/active_deals below. `tasks` isn't one of
      // customFields.js's supported entities, so no Field Catalog
      // merge here -- just the pre-existing agent/priority filters.
      const filteredTasks = data.todayTasks?.filter(t => {
        if (wcfg.agentFilter    && t.agent_id !== wcfg.agentFilter) return false
        if (wcfg.priorityFilter && wcfg.priorityFilter !== 'All' && t.priority !== wcfg.priorityFilter) return false
        return true
      }) || []
      return shell(
      <div>
        {filteredTasks.length === 0 && <div style={{ textAlign: 'center', padding: '14px', color: 'var(--muted)', fontSize: '12px' }}>🎉 All clear!</div>}
        {filteredTasks.slice(0, 5).map(t => (
          <div key={t.id} onClick={() => navigate('/tasks/' + t.id)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: isOverdue(t.due_date) ? '#DC2626' : color }} />
            <div style={{ flex: 1, fontSize: '12px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
            {isOverdue(t.due_date) && <span style={{ fontSize: '9px', color: '#DC2626', fontWeight: 700 }}>LATE</span>}
          </div>
        ))}
        {filteredTasks.length > 5 && <div onClick={() => setPopup('todays_tasks')} style={{ fontSize: '11px', color: color, cursor: 'pointer', marginTop: '6px' }}>+{filteredTasks.length - 5} more →</div>}
        <div onClick={() => navigate('/tasks/new')} style={{ marginTop: '8px', padding: '6px', border: '1px dashed var(--border)', borderRadius: '6px', textAlign: 'center', color: 'var(--muted)', fontSize: '11px', cursor: 'pointer' }}>+ Quick Add Task</div>
      </div>
    ) }

    // ── HOT LEADS ──
    if (w.id === 'hot_leads') {
      // NOTE (Sept 2026 Field Catalog follow-up): this filter was