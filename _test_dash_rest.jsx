
function CustomWidgetContent({ config, agentId, allAgents }) {
  const navigate = useNavigate()
  const [items,       setItems]       = useState([])
  const [count,       setCount]       = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [activeSlice, setActiveSlice] = useState(null)
  const [drillItems,  setDrillItems]  = useState(null)

  useEffect(function() {
    if (!config?.board) return
    const boardDef = BOARD_OPTIONS.find(function(b){ return b.id === config.board })
    if (!boardDef) return
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        let q = supabase.from(boardDef.table).select('*').limit(config.limitRows || 10)

        // Scope
        const scope = config.agentScope || 'mine'
        if (scope === 'mine' && agentId) q = q.eq('agent_id', agentId)
        else if (scope !== 'all' && scope !== 'mine') q = q.eq('agent_id', scope)

        // Status filter
        if (config.statuses?.length && boardDef.statusField) {
          q = q.in(boardDef.statusField, config.statuses)
        }

        // Date range — use the correct date field per board type
        const dr = getDateRange(config.dateRange || 'all')
        if (dr) {
          const dateField = {
            deals: 'ao_date',
            calls: 'called_at',
            offers: 'offer_date',
            open_houses: 'date',
          }[config.board] || 'created_at'
          q = q.gte(dateField, dr.from).lte(dateField, dr.to + 'T23:59:59')
        }

        // Sort
        const sortField = config.sortBy || 'created_at'
        q = q.order(sortField, { ascending: false, nullsFirst: false })

        const { data, error } = await q
        if (!cancelled) {
          setItems(data || [])
          setCount(data?.length || 0)
        }
      } catch(e) {
        if (!cancelled) { setItems([]); setCount(0) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    setActiveSlice(null)
    setDrillItems(null)
    return function() { cancelled = true }
  }, [config?.board, JSON.stringify(config?.statuses), config?.dateRange, config?.agentScope, config?.sortBy, config?.limitRows, agentId])

  const boardDef = BOARD_OPTIONS.find(function(b){ return b.id === config?.board })
  if (!boardDef) return <div style={{ color:'var(--muted)', fontSize:12 }}>Board not configured</div>
  if (loading)   return <div style={{ color:'var(--muted)', fontSize:12, padding:'12px 0', textAlign:'center' }}>Loading...</div>

  const route = {
    contacts:'contacts', deals:'production', tasks:'tasks',
    listings:'listings', calls:'calls', gifts:'gifts', offers:'offers',
    open_houses:'open-house',
  }[config.board] || config.board

  // ── COUNT MODE — click to drill down into records ──
  if (config.display === 'count') {
    return (
      <div>
        <div style={{ textAlign:'center', padding:'8px 0 4px', cursor:'pointer' }}
          onClick={function(){ setActiveSlice(activeSlice ? null : 'all'); setDrillItems(activeSlice ? null : items) }}>
          <div style={{ fontSize:52, fontWeight:900, color:'var(--text)', lineHeight:1 }}>{count}</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginTop:4 }}>
            {config.statuses?.length ? config.statuses.join(', ') : 'Total'} {boardDef.label}
          </div>
          {config.dateRange && config.dateRange !== 'all' && (
            <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>({config.dateRange})</div>
          )}
          <div style={{ fontSize:10, color:'var(--brand)', marginTop:6, fontWeight:700 }}>
            {activeSlice ? '▲ Hide details' : '▼ Click to see records'}
          </div>
        </div>
      </div>
    )
  }
}
