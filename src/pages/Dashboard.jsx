
      // computed but the render below used `data.hotLeads` directly,
      // so the ⚙️ Configure filters silently never applied. Fixed to
      // actually render `filteredLeads`, and extended to also honor
      // any custom contact field configured via matchesCustomFilters
      // (see WIDGET_ENTITY / fieldCatalogs above).
      const filteredLeads = data.hotLeads?.filter(c => {
        if (wcfg.agentFilter && c.agent_id !== wcfg.agentFilter) return false
        if (wcfg.statusFilter && wcfg.statusFilter !== 'All' && c.status !== wcfg.statusFilter) return false
        if (wcfg.sourceFilter && wcfg.sourceFilter !== 'All' && c.source !== wcfg.sourceFilter) return false
        if (!matchesCustomFilters(c, wcfg, ['agentFilter','statusFilter','sourceFilter','limit'], fieldCatalogs.contacts)) return false
        return true
      }) || []
      return shell(
      <div>
        {filteredLeads.length === 0 && <div style={{ textAlign: 'center', padding: '14px', color: 'var(--muted)', fontSize: '12px' }}>No hot leads</div>}
        {filteredLeads.slice(0, 5).map(c => (
          <div key={c.id} onClick={() => navigate('/contacts/' + c.id)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: c.status === 'Hot' ? '#DC2626' : '#F97316', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, flexShrink: 0 }}>
              {initials((c.first_name || '') + ' ' + (c.last_name || ''))}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.first_name} {c.last_name}</div>
              {c.phone && <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{c.phone}</div>}
            </div>
            <div onClick={e => e.stopPropagation()} style={{ display:'flex', alignItems:'center', gap:4 }}>
              {c.phone && <ClickToCall phone={c.phone} contactName={c.first_name + ' ' + (c.last_name || '')} contactId={c.id} size="sm" />}
              <Pill label={c.status} color={c.status === 'Hot' ? '#DC2626' : '#F97316'} />
            </div>
          </div>
        ))}
        {filteredLeads.length > 5 && <div onClick={() => setPopup('hot_leads')} style={{ fontSize: '11px', color: color, cursor: 'pointer', marginTop: '6px' }}>+{filteredLeads.length - 5} more →</div>}
      </div>
    ) }

    // ── ACTIVE DEALS ──
    if (w.id === 'active_deals') {
      // NOTE (Sept 2026 Field Catalog follow-up): same fix as
      // hot_leads above -- this filter was computed but never
      // rendered with, plus extended for custom deal fields.
      const filteredDeals = data.activeDeals?.filter(d => {
        if (wcfg.agentFilter && d.agent_id !== wcfg.agentFilter) return false
        if (wcfg.stageFilter && wcfg.stageFilter !== 'All' && d.stage !== wcfg.stageFilter) return false
        if (wcfg.sideFilter  && wcfg.sideFilter  !== 'All' && d.side  !== wcfg.sideFilter)  return false
        if (!matchesCustomFilters(d, wcfg, ['agentFilter','stageFilter','sideFilter','limit'], fieldCatalogs.deals)) return false
        return true
      }) || []
      return shell(
      <div>
        {filteredDeals.slice(0, 4).map(d => (
          <div key={d.id} onClick={() => navigate('/production/' + d.id)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.addr}</div>
              {d.client_name && <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{d.client_name}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#10B981' }}>{fmt$(d.gci)}</div>
              <Pill label={d.stage} color={stageHex(d.stage)} />
            </div>
          </div>
        ))}
        <div onClick={() => setPopup('active_deals')} style={{ fontSize: '11px', color: color, cursor: 'pointer', marginTop: '8px' }}>View all {filteredDeals.length} →</div>
      </div>
    ) }

    // ── UPCOMING CLOSINGS ──
    if (w.id === 'upcoming_close') return shell(
      <div>
        {data.upcoming?.length === 0 && <div style={{ textAlign: 'center', padding: '14px', color: 'var(--muted)', fontSize: '12px' }}>No closings in 30 days</div>}
        {data.upcoming?.slice(0, 4).map(d => {
          const days = getDaysUntil(d.expected_close_date || d.close_date)
          return (
            <div key={d.id} onClick={() => navigate('/production/' + d.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
              <div style={{ width: 32, height: 32, borderRadius: '8px', background: days <= 7 ? '#FEF2F2' : '#F0FDF4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: days <= 7 ? '#DC2626' : '#10B981' }}>{days}</div>
                <div style={{ fontSize: '8px', color: days <= 7 ? '#DC2626' : '#10B981' }}>days</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.addr}</div>
                <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{fmtDate(d.expected_close_date || d.close_date)}</div>
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#10B981' }}>{fmt$(d.gci)}</div>
            </div>
          )
        })}
        {data.upcoming?.length > 4 && <div onClick={() => setPopup('upcoming_close')} style={{ fontSize: '11px', color: color, cursor: 'pointer', marginTop: '6px' }}>+{data.upcoming.length - 4} more →</div>}
      </div>
    )

    // ── ACTIVE LISTINGS ──
    if (w.id === 'active_listings') {
      // NOTE (Sept 2026 Field Catalog follow-up): the widget's own
      // ⚙️ Configure options (agentFilter/statusFilter/limit) were
      // never applied at all here before -- unlike hot_leads/
      // active_deals above, there wasn't even a computed-but-unused
      // filter variable. statusFilter is deliberately left alone:
      // `data.activeListings` is already pre-filtered server-side to
      // status==='Active' by the myListings.filter() that builds it
      // further up, so any other status value would always show
      // nothing -- a separate, pre-existing data-pipeline issue, not
      // something to reshape in this pass. agentFilter, limit, and
      // any custom listing field (see WIDGET_ENTITY above) DO vary
      // within the Active set, so those are wired for real here.
      const filteredListings = data.activeListings?.filter(l => {
        if (wcfg.agentFilter && l.agent_id !== wcfg.agentFilter) return false
        if (!matchesCustomFilters(l, wcfg, ['agentFilter','statusFilter','limit'], fieldCatalogs.listings)) return false
        return true
      }) || []
      return shell(
      <div>
        {filteredListings.length === 0 && <div style={{ textAlign: 'center', padding: '14px', color: 'var(--muted)', fontSize: '12px' }}>No active listings</div>}
        {filteredListings.slice(0, wcfg.limit || 5).map(l => (
          <div key={l.id} onClick={() => navigate('/listings/' + l.id)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.addr}</div>
              {l.city && <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{l.city}</div>}
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: color }}>{fmt$(l.list_price)}</div>
          </div>
        ))}
        <div onClick={() => setPopup('active_listings')} style={{ fontSize: '11px', color: color, cursor: 'pointer', marginTop: '8px' }}>View all listings →</div>
      </div>
    ) }

    // ── LEADERBOARD ──
    if (w.id === 'leaderboard') return shell(
      <div>
        {data.leaderboard?.filter(r => r.gci > 0 || r.closed > 0).slice(0, 6).map((row, i) => (
          <div key={row.agent.id} onClick={() => { setAgentFilter(row.agent.id); setPopup('gci_goal') }}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
            <div style={{ fontSize: '14px', minWidth: '22px' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i+1) + "."}</div>
            <Avatar agent={row.agent} size={26} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.agent.name}</div>
              <div style={{ height: '3px', background: 'var(--dim)', borderRadius: '99px', marginTop: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: row.agent.color || '#CC2200', width: (pct(row.gci, agentGoals.goal_gci)) + "%" }} />
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#10B981' }}>{fmt$(row.gci)}</div>
              <div style={{ fontSize: '9px', color: 'var(--muted)' }}>{row.closed} closed</div>
            </div>
          </div>
        ))}
      </div>
    )

    // ── GCI CHART ──
    if (w.id === 'gci_chart') return shell(
      <div>
        <div style={{ marginBottom: '8px' }}>
          <span style={{ fontSize: '18px', fontWeight: 800, color: '#10B981' }}>{fmt$(data.closedGCI)}</span>
          <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '6px' }}>closed {yearFilter}</span>
        </div>
        <MiniBar data={data.monthlyGCI} color={color} />
      </div>
    )

    // ── OPEN HOUSES ──
    if (w.id === 'open_houses') return shell(
      <div>
        {data.upcomingOH?.length === 0 && <div style={{ textAlign: 'center', padding: '14px', color: 'var(--muted)', fontSize: '12px' }}>No open houses this week</div>}
        {data.upcomingOH?.map(oh => (
          <div key={oh.id} onClick={() => navigate('/openhouse/' + oh.id)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{oh.listing_addr}</div>
              <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{fmtDate(oh.date)} {oh.start_time && "· " + (oh.start_time)}</div>
            </div>
            {oh.agents && <Avatar agent={oh.agents} size={20} />}
          </div>
        ))}
      </div>
    )

    // ── GIFTS PENDING ──
    if (w.id === 'gifts_pending' && (isAdmin || canManage)) return shell(
      <div>
        {data.pendingGifts?.length === 0 && <div style={{ textAlign: 'center', padding: '14px', color: 'var(--muted)', fontSize: '12px' }}>All delivered ✅</div>}
        {data.pendingGifts?.slice(0, 5).map(g => (
          <div key={g.id} onClick={() => navigate('/gifts/' + g.id)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
            <div style={{ flex: 1, fontSize: '12px', color: 'var(--text)' }}>{g.client_name}</div>
            <Pill label={g.status} color="#9d50dd" />
          </div>
        ))}
        {data.pendingGifts?.length > 5 && <div onClick={() => setPopup('gifts_pending')} style={{ fontSize: '11px', color: color, cursor: 'pointer', marginTop: '6px' }}>+{data.pendingGifts.length - 5} more →</div>}
      </div>
    )

    // ── QUICK ADD ──
    if (w.id === 'quick_add') return shell(
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {[
          { label: '+ Lead',    path: '/contacts/new',   c: '#0EA5E9' },
          { label: '+ Deal',    path: '/production/new', c: '#10B981' },
          { label: '+ Task',    path: '/tasks/new',      c: '#8B5CF6' },
          { label: '+ Listing', path: '/listings/new',   c: '#F5A623' },
          { label: '+ Offer',   path: '/offers/new',     c: '#6366F1' },
          { label: '+ OH',      path: '/openhouse/new',  c: '#14B8A6' },
          { label: '+ Gift',    path: '/gifts/new',      c: '#EC4899' },
          { label: '+ Event',   path: '/calendar/new',   c: '#CC2200' },
        ].map(item => (
          <button key={item.path} onClick={() => navigate(item.path)}
            style={{ padding: '6px 12px', borderRadius: '8px', border: "1px solid " + (item.c) + "33", background: item.c + '11', color: item.c, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>
            {item.label}
          </button>
        ))}
      </div>
    )

    // ── OVERDUE ALERT ──
    if (w.id === 'overdue_alert') return shell(
      <div onClick={() => setPopup('overdue_alert')} style={{ cursor: 'pointer' }}>
        {data.overdueTasks?.length === 0
          ? <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--muted)', fontSize: '12px', padding: '2px 0' }}>
              <span style={{ fontSize: '13px' }}>✅</span> No overdue tasks — nice work
            </div>
          : <div style={{ background: '#FEF2F2', borderRadius: '8px', padding: '12px', display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #FECACA' }}>
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <div style={{ fontWeight: 700, color: '#DC2626', fontSize: '13px' }}>{data.overdueTasks?.length} overdue task{data.overdueTasks?.length > 1 ? 's' : ''} — click to view</div>
            </div>
        }
      </div>
    )

    // ── ANNOUNCEMENTS ──
    if (w.id === 'announcements') return shell(
      <div>
        {data.announcements?.length === 0 && <div style={{ textAlign: 'center', padding: '14px', color: 'var(--muted)', fontSize: '12px' }}>No announcements</div>}
        {data.announcements?.map(a => (
          <div key={a.id} onClick={() => navigate('/announcements/' + a.id)}
            style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>{a.title}</div>
            {a.body && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.body}</div>}
          </div>
        ))}
      </div>
    )

    // ── PRODUCTION STATS ─────────────────────────────────────────────
    if (w.id === 'production_stats') {
      const wYear   = wcfg.year        || yearFilter
      const wAgent  = wcfg.agentFilter || null
      const wStage  = wcfg.stageFilter && wcfg.stageFilter !== 'All' ? wcfg.stageFilter : null
      const wSide   = wcfg.sideFilter  && wcfg.sideFilter  !== 'All' ? wcfg.sideFilter  : null
      const wMetric = wcfg.metric  || 'GCI'
      const wDisp   = wcfg.display || 'numbers'
      const allD = [...(data.closedDeals || []), ...(data.activeDeals || [])].filter((d,i,a) => a.findIndex(x=>x.id===d.id)===i)
      const fd = allD.filter(d => {
        const ds = d.close_date || d.ao_date || d.created_at || ''
        if (wYear  && !ds.startsWith(wYear))        return false
        if (wAgent && d.agent_id !== wAgent)         return false
        if (wStage && d.stage    !== wStage)         return false
        if (wSide  && d.side     !== wSide)          return false
        // Field Catalog (Sept 2026): any custom deal field configured
        // via ⚙️ Configure -- see WIDGET_ENTITY/matchesCustomFilters above.
        if (!matchesCustomFilters(d, wcfg, ['year','agentFilter','stageFilter','sideFilter','metric','display'], fieldCatalogs.deals)) return false
        return true
      })
      const totGCI = fd.reduce((s,d) => s + (parseFloat(d.gci)||0), 0)
      const totVol = fd.reduce((s,d) => s + (parseFloat(d.production)||0), 0)
      const cnt    = fd.length
      const avgGCI = cnt > 0 ? totGCI / cnt : 0
      const SC     = { 'Offer Accapted':'#037f4c','Under Shtar':'#bb3354','Under Contract':'#757575','Closed':'#225091','Deal Fell Through':'#ff007f' }
      const byStage = {}
      fd.forEach(d => { byStage[d.stage] = byStage[d.stage] || {gci:0,count:0}; byStage[d.stage].gci += parseFloat(d.gci)||0; byStage[d.stage].count++ })
      const stageE = Object.entries(byStage).sort((a,b)=>b[1].gci-a[1].gci)
      const maxSGCI = Math.max(...stageE.map(([,v])=>v.gci), 1)
      const primVal = wMetric==='Deal Count' ? cnt : wMetric==='Volume' ? fmt$(totVol) : wMetric==='Avg GCI' ? fmt$(avgGCI) : fmt$(totGCI)
      const agentName = wAgent ? agents.find(a=>a.id===wAgent)?.name?.split(' ')[0] : null
      return shell(
        <div>
          <div style={{ marginBottom:'10px' }}>
            <div style={{ fontSize:'26px', fontWeight:900, color:'var(--text)' }}>{primVal}</div>
            <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:'2px' }}>
              {wMetric} · {cnt} deal{cnt!==1?'s':''}
              {wStage ? ' · '+wStage : ''}{wSide ? ' · '+wSide : ''}{agentName ? ' · '+agentName : ''} · {wYear}
            </div>
          </div>
          {wDisp === 'numbers' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' }}>
              {[['GCI',fmt$(totGCI),'#10B981'],['Volume',fmt$(totVol),'#3B82F6'],['Deals',cnt,'#F5A623'],['Avg GCI',fmt$(avgGCI),'#8B5CF6']].map(([lbl,val,c]) => (
                <div key={lbl} style={{ padding:'7px 9px', background:'var(--dim)', borderRadius:'7px', border:'1px solid var(--border)', borderLeft:'3px solid '+c }}>
                  <div style={{ fontSize:'14px', fontWeight:800, color:c }}>{val}</div>
                  <div style={{ fontSize:'10px', color:'var(--muted)', marginTop:'1px' }}>{lbl}</div>
                </div>
              ))}
            </div>
          )}
          {(wDisp==='bar'||wDisp==='breakdown') && stageE.length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
              {stageE.slice(0,5).map(([stage,vals]) => {
                const pct = (vals.gci/maxSGCI)*100
                const sc  = SC[stage] || '#94A3B8'
                return (
                  <div key={stage}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'2px' }}>
                      <span style={{ fontSize:'10px', color:'var(--muted)', fontWeight:600 }}>{stage}</span>
                      <span style={{ fontSize:'10px', color:sc, fontWeight:800 }}>{fmt$(vals.gci)} · {vals.count}</span>
                    </div>
                    <div style={{ height:5, background:'var(--border)', borderRadius:3, overflow:'hidden' }}>
                      <div style={{ width:pct+'%', height:'100%', background:sc, borderRadius:3, transition:'width .5s' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    // ── CUSTOM WIDGET FALLBACK ──
    if (isCustom && w.customConfig) {
      return shell(
        <CustomWidgetContent
          config={w.customConfig}
          agentId={agent?.id}
          allAgents={agents}
        />
      )
    }

    return null
  }

  return (
    <div style={{ fontFamily: ff }}>

      {/* ── MARKET PULSE — rates + news, always visible ── */}
      <div style={{ marginBottom: 16 }}>
        <MarketWidget />
      </div>

      {/* ── NEW LISTINGS — MLS watch areas + team, custom timeframe ── */}
      <DashboardListingTiles />

      {/* ── PINNED CUSTOM FILTERS — live, auto-updating ── */}
      <DashboardPins />

      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text)' }}>{greeting}, {agent?.name?.split(' ')[0]} 👋</div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            {savingPrefs && <span style={{ marginLeft: '8px', color: 'var(--brand)', fontSize: '11px' }}>💾 Saving layout...</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Filters — hidden during edit mode */}
          {!editMode && (
            <>
              {/* Year selector */}
              <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '12px', fontFamily: ff, width: 'auto', flex: '0 0 auto' }}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>

              {/* Agent filter */}
              {(isAdmin || canManage) && (
                <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
                  style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '12px', fontFamily: ff, width: 'auto', flex: '0 0 auto', maxWidth: '160px' }}>
                  <option value="">All Agents</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}

              {/* Side filter */}
              <select value={sideFilter} onChange={e => setSideFilter(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '12px', fontFamily: ff, width: 'auto', flex: '0 0 auto' }}>
                <option value="">All Sides</option>
                {['Buyer','Listing','Dual Buyer','Dual Listing','Flip'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>

              {/* Stage quick filters — pill toggles */}
              <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', alignItems:'center' }}>
                {[
                  { id:'ao',       label:'AO',              stages:['Offer Accapted'],                      color:'#037f4c' },
                  { id:'uc',       label:'Under Contract',  stages:['Under Shtar','Under Contract'],        color:'#757575' },
                  { id:'closed',   label:'Sold',            stages:['Closed'],                              color:'#225091' },
                ].map(f => {
                  const isOn = f.stages.every(s => stageFilter.includes(s))
                  return (
                    <button key={f.id}
                      onClick={() => {
                        setStageFilter(prev => {
                          if (isOn) return prev.filter(s => !f.stages.includes(s))
                          return [...new Set([...prev, ...f.stages])]
                        })
                      }}
                      style={{ padding:'4px 10px', borderRadius:'20px', border:"1px solid " + (isOn ? f.color : 'var(--border)'), background: isOn ? f.color : 'transparent', color: isOn ? '#fff' : 'var(--muted)', fontSize:'11px', fontWeight:700, cursor:'pointer', fontFamily:ff, transition:'all .15s' }}>
                      {f.label}
                    </button>
                  )
                })}
                {(stageFilter.length > 0 || sideFilter || agentFilter) && (
                  <button onClick={() => { setStageFilter([]); setSideFilter(''); setAgentFilter('') }}
                    style={{ padding:'4px 8px', borderRadius:'20px', border:'1px solid #DC262644', background:'#FEF2F2', color:'#DC2626', fontSize:'11px', fontWeight:700, cursor:'pointer', fontFamily:ff }}>
                    ✕ Clear
                  </button>
                )}
              </div>

              <button onClick={loadData}
                style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--muted)', cursor: 'pointer', fontSize: '13px', fontFamily: ff }}
                title="Refresh">↻</button>
              <Btn size="sm" variant="secondary" onClick={() => setShowGoals(true)}>🎯 Goals</Btn>
              {isAdmin && <Btn size="sm" variant="secondary" onClick={() => setShowAgentView(true)}>👥 Agent Views</Btn>}
              {isAdmin && <Btn size="sm" variant="secondary" onClick={() => setShowCustomWidget(true)}>🔲 Add Widget</Btn>}
              {isAdmin && <Btn size="sm" variant="secondary" onClick={() => setShowWidgetMgr(true)}>⚙️ Customize</Btn>}
            </>
          )}

          {/* Edit Mode controls — admin only */}
          {isAdmin && (editMode ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '10px' }}>
              <span style={{ fontSize: '12px', color: '#92400E', fontWeight: 600 }}>🎛 Edit Mode — drag widgets to reorder</span>
              <Btn size="sm" variant="secondary" onClick={cancelEdit}>Cancel</Btn>
              <Btn size="sm" onClick={saveLayout} loading={savingPrefs} style={{ background: '#10B981', border: 'none' }}>
                💾 Save Layout
              </Btn>
            </div>
          ) : (
            <Btn size="sm" variant="secondary" onClick={() => { setEditMode(true); setPendingWidgets(null) }}>🎛 Edit Layout</Btn>
          ))}
        </div>
      </div>

      {/* Active filter summary bar — shows totals for current filter combination */}
      {!loading && (stageFilter.length > 0 || sideFilter || agentFilter) && (
        <div style={{ display:'flex', gap:'16px', padding:'12px 16px', background:'var(--dim)', borderRadius:'10px', border:'1px solid var(--border)', marginBottom:'12px', flexWrap:'wrap', alignItems:'center' }}>
          <div style={{ fontSize:'11px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em' }}>Filtered Results</div>
          {(() => {
            // Calculate production totals for the current filter combo
            const allDeals = data.closedDeals || []
            const filtered = allDeals.filter(d => {
              if (stageFilter.length > 0 && !stageFilter.includes(d.stage)) return false
              if (sideFilter && d.side !== sideFilter) return false
              return true
            })
            const allActive = data.activeDeals || []
            const filteredActive = allActive.filter(d => {
              if (stageFilter.length > 0 && !stageFilter.includes(d.stage)) return false
              if (sideFilter && d.side !== sideFilter) return false
              return true
            })
            const gci   = filtered.reduce((s, d) => s + (parseFloat(d.gci) || 0), 0)
            const vol   = filtered.reduce((s, d) => s + (parseFloat(d.production) || 0), 0)
            const agci  = filteredActive.reduce((s, d) => s + (parseFloat(d.gci) || 0), 0)
            return (
              <>
                <div>
                  <div style={{ fontSize:'16px', fontWeight:900, color:'#10B981' }}>{fmt$(gci)}</div>
                  <div style={{ fontSize:'10px', color:'var(--muted)' }}>Closed GCI</div>
                </div>
                <div>
                  <div style={{ fontSize:'16px', fontWeight:900, color:'var(--text)' }}>{fmt$(vol)}</div>
                  <div style={{ fontSize:'10px', color:'var(--muted)' }}>Volume</div>
                </div>
                <div>
                  <div style={{ fontSize:'16px', fontWeight:900, color:'#F5A623' }}>{fmt$(agci)}</div>
                  <div style={{ fontSize:'10px', color:'var(--muted)' }}>Pipeline GCI</div>
                </div>
                <div>
                  <div style={{ fontSize:'16px', fontWeight:900, color:'var(--text)' }}>{filtered.length}</div>
                  <div style={{ fontSize:'10px', color:'var(--muted)' }}>Closed Deals</div>
                </div>
                <div>
                  <div style={{ fontSize:'16px', fontWeight:900, color:'var(--text)' }}>{filteredActive.length}</div>
                  <div style={{ fontSize:'10px', color:'var(--muted)' }}>Active Deals</div>
                </div>
              </>
            )
          })()}
          <div style={{ flex:1, textAlign:'right' }}>
            <span style={{ fontSize:'11px', color:'var(--muted)' }}>
              {[agentFilter ? agents.find(a=>a.id===agentFilter)?.name : null, sideFilter||null, stageFilter.length ? stageFilter.join(', ') : null, yearFilter].filter(Boolean).join(' · ')}
            </span>
          </div>
        </div>
      )}

      {!loading && !hasBackupLayout && (
        <div style={{
          background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
          borderRadius: '14px', padding: '16px 20px', marginBottom: '16px',
          display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap',
          boxShadow: '0 4px 16px rgba(99,102,241,.25)',
        }}>
          <span style={{ fontSize: '26px' }}>✨</span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#fff' }}>A new dashboard layout is available</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,.85)', marginTop: '2px' }}>
              Better widget sizing and a more useful order. Your current layout is saved automatically — switch back anytime.
            </div>
          </div>
          <Btn onClick={tryNewLayout} style={{ background: '#fff', color: '#6366F1', flexShrink: 0, fontWeight: 800 }}>
            Try the New Layout
          </Btn>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}><Loading /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', alignItems: 'start' }}>
          {visibleOrdered.map(w => <WidgetErrorBoundary key={w.id}>{renderWidget(w)}</WidgetErrorBoundary>)}
        </div>
      )}

      {/* ══════════════════════ DETAIL POPUPS ══════════════════════ */}

      {/* GCI Goal Detail */}
      <DetailPopup open={popup === 'gci_goal'} onClose={() => setPopup(null)} title="Closed Deals — GCI Detail" icon="🎯">
        <div style={{ display: 'flex', gap: '16px', marginBottom: '14px', padding: '12px', background: 'var(--dim)', borderRadius: '8px' }}>
          <div><div style={{ fontSize: '20px', fontWeight: 800, color: '#10B981' }}>{fmt$(data.closedGCI)}</div><div style={{ fontSize: '11px', color: 'var(--muted)' }}>Closed GCI</div></div>
          <div><div style={{ fontSize: '20px', fontWeight: 800, color: '#F5A623' }}>{fmt$(data.pipelineGCI)}</div><div style={{ fontSize: '11px', color: 'var(--muted)' }}>Pipeline GCI</div></div>
          <div><div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)' }}>{data.closedDeals?.length || 0}</div><div style={{ fontSize: '11px', color: 'var(--muted)' }}>Closed Deals</div></div>
        </div>
        {data.closedDeals?.map(d => (
          <DetailRow key={d.id} left={d.addr} sub={(d.client_name || '—') + ' · ' + (d.side || '') + ' · ' + fmtDate(d.ao_date)}
            right={fmt$(d.gci)} onClick={() => { navigate('/production/' + d.id); setPopup(null) }} />
        ))}
        {!data.closedDeals?.length && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>No closed deals in {yearFilter}</div>}
      </DetailPopup>

      {/* Team Goal Detail */}
      <DetailPopup open={popup === 'team_goal'} onClose={() => setPopup(null)} title="Team Goal — All Agents" icon="🏆">
        {data.leaderboard?.map((row, i) => (
          <DetailRow key={row.agent.id}
            left={<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span>{i===0?'🥇':i===1?'🥈':i===2?'🥉':"#" + (i+1)}</span><Avatar agent={row.agent} size={24} /><span style={{ fontWeight: 600 }}>{row.agent.name}</span></div>}
            sub={row.closed + ' closed · ' + row.active + ' active'} right={fmt$(row.gci)} />
        ))}
      </DetailPopup>

      {/* Active Deals Detail */}
      <DetailPopup open={popup === 'active_deals'} onClose={() => setPopup(null)} title="All Active Deals" icon="💼" width={640}>
        <div style={{ marginBottom: '10px', fontSize: '12px', color: 'var(--muted)' }}>{data.activeDeals?.length} deals · {fmt$(data.pipelineGCI)} pipeline GCI</div>
        {data.activeDeals?.map(d => (
          <DetailRow key={d.id} left={d.addr} sub={(d.client_name || '—') + ' · ' + (d.side || '')}
            right={fmt$(d.gci)} badge={<Pill label={d.stage} color={stageHex(d.stage)} />}
            onClick={() => { navigate('/production/' + d.id); setPopup(null) }} />
        ))}
        {!data.activeDeals?.length && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>No active deals</div>}
      </DetailPopup>

      {/* Accepted Offers Detail */}
      <DetailPopup open={popup === 'accepted_offers'} onClose={() => setPopup(null)} title="Accepted Offers (AO)" icon="✅">
        {data.acceptedOffers?.map(d => (
          <DetailRow key={d.id} left={d.addr} sub={d.client_name || '—'}
            right={fmt$(d.production)} onClick={() => { navigate('/production/' + d.id); setPopup(null) }} />
        ))}
        {!data.acceptedOffers?.length && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>No accepted offers</div>}
      </DetailPopup>

      {/* Under Contract Detail */}
      <DetailPopup open={popup === 'under_contract'} onClose={() => setPopup(null)} title="Under Contract" icon="📝">
        {data.underContract?.map(d => (
          <DetailRow key={d.id} left={d.addr} sub={d.client_name || '—'}
            right={fmt$(d.production)} onClick={() => { navigate('/production/' + d.id); setPopup(null) }} />
        ))}
        {!data.underContract?.length && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>No deals under contract</div>}
      </DetailPopup>

      {/* Hot Leads Detail */}
      <DetailPopup open={popup === 'hot_leads'} onClose={() => setPopup(null)} title="Hot & Warm Leads" icon="🔥">
        {data.hotLeads?.map(c => (
          <DetailRow key={c.id} left={c.first_name + ' ' + (c.last_name || '')} sub={c.phone || c.source || ''}
            badge={<Pill label={c.status} color={c.status === 'Hot' ? '#DC2626' : '#F97316'} />}
            right={c.phone ? <span onClick={e=>e.stopPropagation()}><ClickToCall phone={c.phone} contactName={c.first_name + ' ' + (c.last_name||'')} contactId={c.id} size="sm" /></span> : null}
            onClick={() => { navigate('/contacts/' + c.id); setPopup(null) }} />
        ))}
        {!data.hotLeads?.length && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>No hot leads</div>}
      </DetailPopup>

      {/* Active Listings Detail */}
      <DetailPopup open={popup === 'active_listings'} onClose={() => setPopup(null)} title="Active Listings" icon="🏡">
        {data.activeListings?.map(l => (
          <DetailRow key={l.id} left={l.addr} sub={l.city || ''}
            right={fmt$(l.list_price)} onClick={() => { navigate('/listings/' + l.id); setPopup(null) }} />
        ))}
        {!data.activeListings?.length && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>No active listings</div>}
      </DetailPopup>

      {/* Today's Tasks Detail */}
      <DetailPopup open={popup === 'todays_tasks'} onClose={() => setPopup(null)} title="Today's Tasks" icon="✅">
        {data.todayTasks?.map(t => (
          <DetailRow key={t.id} left={t.title} sub={isOverdue(t.due_date) ? '⚠️ Overdue' : 'Due today'}
            badge={<Pill label={t.priority} color={t.priority === 'urgent' ? '#DC2626' : '#F97316'} />}
            onClick={() => { navigate('/tasks/' + t.id); setPopup(null) }} />
        ))}
        {!data.todayTasks?.length && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>Nothing due today!</div>}
      </DetailPopup>

      {/* Overdue Tasks Detail */}
      <DetailPopup open={popup === 'overdue_alert'} onClose={() => setPopup(null)} title="Overdue Tasks" icon="⚠️">
        {data.overdueTasks?.map(t => (
          <DetailRow key={t.id} left={t.title} sub={"Due " + (fmtDate(t.due_date))}
            badge={<Pill label="OVERDUE" color="#DC2626" />}
            onClick={() => { navigate('/tasks/' + t.id); setPopup(null) }} />
        ))}
        {!data.overdueTasks?.length && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>No overdue tasks!</div>}
      </DetailPopup>

      {/* Upcoming Closings Detail */}
      <DetailPopup open={popup === 'upcoming_close'} onClose={() => setPopup(null)} title="Upcoming Closings (30 days)" icon="📅">
        {data.upcoming?.map(d => {
          const days = getDaysUntil(d.expected_close_date || d.close_date)
          return (
            <DetailRow key={d.id} left={d.addr} sub={(d.client_name || '—') + ' · Closes ' + fmtDate(d.expected_close_date || d.close_date)}
              right={fmt$(d.gci)} badge={<Pill label={(days) + "d"} color={days <= 7 ? '#DC2626' : '#10B981'} />}
              onClick={() => { navigate('/production/' + d.id); setPopup(null) }} />
          )
        })}
        {!data.upcoming?.length && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>No closings in 30 days</div>}
      </DetailPopup>

      {/* Pipeline Stage Popups */}
      {DEAL_STAGES.map(s => (
        <DetailPopup key={s.value} open={popup === 'stage_' + s.value} onClose={() => setPopup(null)} title={(s.label)} icon="🔀">
          {data.pipeByStage?.find(x => x.value === s.value)?.deals?.map(d => (
            <DetailRow key={d.id} left={d.addr} sub={(d.client_name || '—') + ' · ' + (d.side || '')}
              right={fmt$(d.gci)} onClick={() => { navigate('/production/' + d.id); setPopup(null) }} />
          ))}
        </DetailPopup>
      ))}

      {/* Gifts Pending Detail */}
      <DetailPopup open={popup === 'gifts_pending'} onClose={() => setPopup(null)} title="Pending Gifts" icon="🎁">
        {data.pendingGifts?.map(g => (
          <DetailRow key={g.id} left={g.client_name} badge={<Pill label={g.status} color="#9d50dd" />}
            onClick={() => { navigate('/gifts/' + g.id); setPopup(null) }} />
        ))}
      </DetailPopup>

      {/* ── OVERLAYS ── */}
      {/* Edit mode — hidden widgets tray */}
      {editMode && (
        <div style={{ marginTop: '16px', padding: '14px 16px', background: 'var(--dim)', borderRadius: '12px', border: '2px dashed var(--border)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Hidden Widgets — click to show
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {widgets.filter(w => !w.visible && WIDGET_DEFS[w.id]?.roles.includes(agent.role)).map(w => {
              const def = WIDGET_DEFS[w.id]
              if (!def) return null
              return (
                <button key={w.id}
                  onClick={() => {
                    const updated = widgets.map(x => x.id === w.id ? { ...x, visible: true } : x)
                    setWidgets(updated)
                    setPendingWidgets(updated)
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: ff }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--brand)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                  <span>{def.icon}</span> + {def.label}
                </button>
              )
            })}
            {widgets.filter(w => !w.visible && WIDGET_DEFS[w.id]?.roles.includes(agent.role)).length === 0 && (
              <span style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>All widgets are visible</span>
            )}
            {/* Add custom widget button — visible to all */}
            <button
              onClick={() => setShowCustomWidget(true)}
              style={{ display:'flex', alignItems:'center', gap:'6px', padding:'6px 12px', borderRadius:'8px', border:'2px dashed #CC2200', background:'rgba(204,34,0,.04)', color:'#CC2200', fontSize:'12px', fontWeight:700, cursor:'pointer', fontFamily:ff }}>
              🔲 + Custom Widget
            </button>
          </div>
        </div>
      )}

      {showCustomize && (
        <CustomizePanel widgets={widgets} role={agent.role}
          hasBackupLayout={hasBackupLayout}
          onTryNewLayout={async () => { await tryNewLayout(); setShowCustomize(false) }}
          onRestorePreviousLayout={async () => { await restorePreviousLayout(); setShowCustomize(false) }}
          onSave={newW => { persistWidgets(newW); toast('✅ Layout saved') }}
          onClose={() => setShowCustomize(false)} />
      )}

      {/* Widget Manager */}
      {showWidgetMgr && (
        <WidgetManager
          widgets={widgets}
          role={agent.role}
          onSave={newWids => {
            persistWidgets(newWids)
            toast('✅ Widget layout saved')
          }}
          onClose={() => setShowWidgetMgr(false)}
          onAddCustom={() => { setShowWidgetMgr(false); setShowCustomWidget(true) }}
        />
      )}

      {/* Widget config modal */}
      {configWidget && (
        <WidgetConfigModal
          widget={configWidget}
          agents={agents}
          customFields={(fieldCatalogs[WIDGET_ENTITY[configWidget?.id]] || []).filter(f => f.custom)}
          onSave={updated => {
            const newWidgets = widgets.map(w => w.id === updated.id ? updated : w)
            persistWidgets(newWidgets)
          }}
          onClose={() => setConfigWidget(null)}
        />
      )}

      {showCustomWidget && (
        <CustomWidgetBuilder
          onSave={async cfg => {
            const newWidget = { ...cfg }
            const updated   = [...widgets, newWidget]
            setWidgets(updated)
            setShowCustomWidget(false)
            // Auto-save immediately — no extra step needed
            try {
              await persistWidgets(updated)
              toast('✅ Custom widget added and saved')
            } catch(e) {
              toast('Widget added but save failed: ' + e.message, '#DC2626')
            }
          }}
          onClose={() => setShowCustomWidget(false)}
          agents={agents}
        />
      )}
      {showGoals && (
        <GoalEditor agents={agents} currentAgent={agent} isAdmin={isAdmin}
          onSaved={() => { loadAgentGoals(agent.id).then(setAgentGoals); loadTeamGoal().then(setTeamGoals) }}
          onClose={() => setShowGoals(false)} />
      )}
      {showAgentView && isAdmin && (
        <AgentViewControl agents={agents} onClose={() => setShowAgentView(false)} />
      )}
    </div>
  )
}
