// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Dashboard
// Admins: full team overview, GCI leaderboard, pipeline stats
// Agents: personal stats, today's tasks, hot leads
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useDeals, useContacts, useTasks, useAgents, useAnnouncements, useListings } from '../lib/hooks'
import { fmt$, fmtDate, parseNum, pct, totalGCI, initials, isDueToday, isOverdue } from '../lib/utils'
import { DEAL_STAGES, TEAM_GOAL_GCI, TEAM_GOAL_DEALS, AGENT_GOAL_GCI } from '../lib/constants'
import {
  StatCard, ProgressBar, Pill, Avatar, Btn, Loading, Empty,
  SectionTitle, Tabs, Card
} from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

export function Dashboard() {
  const navigate  = useNavigate()
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()
  const [tab, setTab] = useState('overview')
  const year = new Date().getFullYear().toString()

  const allDeals   = useDeals({})
  const myDeals    = useDeals(agent?.id ? { agent_id: agent.id } : {})
  const myContacts = useContacts(agent?.id ? { agent_id: agent.id } : {})
  const myTasks    = useTasks(agent?.id ? { agent_id: agent.id } : {})
  const { agents } = useAgents()
  const { announcements } = useAnnouncements()
  const { listings } = useListings(agent?.id && !isAdmin ? { agent_id: agent.id } : {})

  const deals        = (isAdmin || canManage) ? allDeals.deals : myDeals.deals
  const contacts     = myContacts.contacts
  const tasks        = myTasks.tasks
  const loading      = (isAdmin || canManage) ? allDeals.loading : myDeals.loading

  const thisYearDeals  = deals.filter(d => d.ao_date?.startsWith(year))
  const closedDeals    = thisYearDeals.filter(d => d.stage === 'Closed')
  const activeDeals    = deals.filter(d => !['Closed','Deal Fell Through'].includes(d.stage))
  const pipelineGCI    = activeDeals.reduce((s, d) => s + parseNum(d.gci), 0)
  const closedGCI      = closedDeals.reduce((s, d) => s + parseNum(d.gci), 0)
  const totalGCIAll    = thisYearDeals.reduce((s, d) => s + parseNum(d.gci), 0)

  const todayTasks    = tasks.filter(t => t.status !== 'done' && (isDueToday(t.due_date) || isOverdue(t.due_date)))
  const hotContacts   = contacts.filter(c => c.status === 'Hot' || c.status === 'Warm').slice(0, 5)
  const activeListings = listings.filter(l => l.status === 'Active')

  // Team leaderboard (admin only)
  const leaderboard = agents.map(a => {
    const agentDeals = allDeals.deals.filter(d => d.agent_id === a.id && d.ao_date?.startsWith(year))
    const gci        = agentDeals.reduce((s, d) => s + parseNum(d.gci), 0)
    const closed     = agentDeals.filter(d => d.stage === 'Closed').length
    return { agent: a, gci, closed, deals: agentDeals.length }
  }).sort((a, b) => b.gci - a.gci)

  const teamGCI    = allDeals.deals.filter(d => d.ao_date?.startsWith(year) && d.stage === 'Closed').reduce((s,d) => s + parseNum(d.gci), 0)
  const teamDeals  = allDeals.deals.filter(d => d.ao_date?.startsWith(year) && d.stage === 'Closed').length

  const pinnedAnn = announcements.filter(a => a.pinned)

  return (
    <div style={{ fontFamily: ff }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '26px', fontWeight: 900, color: 'var(--text)' }}>
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {agent?.name?.split(' ')[0]} 👋
        </div>
        <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* Pinned Announcements */}
      {pinnedAnn.map(a => (
        <div key={a.id} style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px', borderLeft: '4px solid #F5A623' }}>
          <span style={{ fontSize: '16px' }}>📣</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '13px', color: '#92400E' }}>{a.title}</div>
            {a.body && <div style={{ fontSize: '12px', color: '#B45309', marginTop: '2px' }}>{a.body}</div>}
          </div>
        </div>
      ))}

      {/* Admin Tabs */}
      {(isAdmin || canManage) && (
        <Tabs tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'team',     label: 'Team' },
          { id: 'pipeline', label: 'Pipeline' },
        ]} active={tab} onChange={setTab} />
      )}

      {/* ── OVERVIEW TAB ── */}
      {tab === 'overview' && (
        <>
          {/* My Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
            <StatCard
              label="My GCI (Closed)"
              value={fmt$(closedGCI)}
              sub={`${year} · ${closedDeals.length} closed`}
              accent="#10B981"
              icon="✅"
            />
            <StatCard
              label="Pipeline GCI"
              value={fmt$(pipelineGCI)}
              sub={`${activeDeals.length} active deals`}
              accent="#F5A623"
              icon="🔀"
            />
            <StatCard
              label="My Contacts"
              value={contacts.length}
              sub={`${hotContacts.length} hot/warm leads`}
              accent="#0EA5E9"
              icon="👥"
            />
            <StatCard
              label="Active Listings"
              value={activeListings.length}
              sub="Currently on market"
              accent="#8B5CF6"
              icon="🏡"
            />
          </div>

          {/* GCI Progress */}
          <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '20px', marginBottom: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '14px' }}>
              {isAdmin ? 'Team Goal Progress' : 'My Goal Progress'} — {year}
            </div>
            {isAdmin ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text)' }}>GCI — {fmt$(teamGCI)} of {fmt$(TEAM_GOAL_GCI)}</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{pct(teamGCI, TEAM_GOAL_GCI)}%</span>
                </div>
                <ProgressBar value={teamGCI} max={TEAM_GOAL_GCI} color="#10B981" showPct={false} height={12} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '14px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text)' }}>Deals — {teamDeals} of {TEAM_GOAL_DEALS}</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{pct(teamDeals, TEAM_GOAL_DEALS)}%</span>
                </div>
                <ProgressBar value={teamDeals} max={TEAM_GOAL_DEALS} color="#F5A623" showPct={false} height={12} />
              </>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text)' }}>GCI — {fmt$(closedGCI)} of {fmt$(AGENT_GOAL_GCI)}</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{pct(closedGCI, AGENT_GOAL_GCI)}%</span>
                </div>
                <ProgressBar value={closedGCI} max={AGENT_GOAL_GCI} color="#10B981" showPct={false} height={12} />
              </>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Today's Tasks */}
            <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>📋 Today's Tasks</div>
                <Btn size="sm" variant="ghost" onClick={() => navigate('/tasks')}>View All →</Btn>
              </div>
              {todayTasks.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted)', fontSize: '12px' }}>All clear — no tasks due today!</div>
              )}
              {todayTasks.map(t => (
                <div key={t.id} onClick={() => navigate('/tasks/' + t.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: isOverdue(t.due_date) ? '#DC2626' : '#F97316' }} />
                  <div style={{ flex: 1, fontSize: '13px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                  {isOverdue(t.due_date) && <span style={{ fontSize: '10px', color: '#DC2626', fontWeight: 700 }}>OVERDUE</span>}
                </div>
              ))}
              <button onClick={() => navigate('/tasks/new')}
                style={{ marginTop: '10px', width: '100%', padding: '8px', border: '1px dashed var(--border)', borderRadius: '8px', background: 'transparent', color: 'var(--muted)', fontSize: '12px', cursor: 'pointer', fontFamily: ff }}>
                + Quick Add Task
              </button>
            </div>

            {/* Hot Leads */}
            <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>🔥 Hot & Warm Leads</div>
                <Btn size="sm" variant="ghost" onClick={() => navigate('/contacts')}>View All →</Btn>
              </div>
              {hotContacts.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted)', fontSize: '12px' }}>No hot leads right now</div>
              )}
              {hotContacts.map(c => (
                <div key={c.id} onClick={() => navigate('/contacts/' + c.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: c.status === 'Hot' ? '#DC2626' : '#F97316', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>
                    {initials(c.first_name + ' ' + (c.last_name || ''))}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.first_name} {c.last_name}</div>
                    {c.phone && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{c.phone}</div>}
                  </div>
                  <Pill label={c.status} color={c.status === 'Hot' ? '#DC2626' : '#F97316'} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── TEAM TAB (Admin only) ── */}
      {tab === 'team' && (isAdmin || canManage) && (
        <div>
          <SectionTitle>GCI Leaderboard — {year}</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {leaderboard.map((row, i) => (
              <div key={row.agent.id} style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: i === 0 ? '1px solid #F5A623' : '1px solid var(--border)', padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: i < 3 ? '#F5A623' : 'var(--muted)', minWidth: '28px' }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}
                  </div>
                  <Avatar agent={row.agent} size={36} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}>{row.agent.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{row.deals} deals · {row.closed} closed</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#10B981' }}>{fmt$(row.gci)}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>GCI closed</div>
                  </div>
                </div>
                <ProgressBar value={row.gci} max={AGENT_GOAL_GCI} color={row.agent.color || '#CC2200'} showPct={false} height={6} />
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>{pct(row.gci, AGENT_GOAL_GCI)}% of {fmt$(AGENT_GOAL_GCI)} goal</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PIPELINE TAB (Admin only) ── */}
      {tab === 'pipeline' && (isAdmin || canManage) && (
        <div>
          <SectionTitle>Active Pipeline by Stage</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
            {DEAL_STAGES.filter(s => s.value !== 'Closed' && s.value !== 'Deal Fell Through').map(stage => {
              const stageDeals = allDeals.deals.filter(d => d.stage === stage.value)
              const stageGCI   = stageDeals.reduce((s, d) => s + parseNum(d.gci), 0)
              return (
                <div key={stage.value} onClick={() => navigate('/production')}
                  style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '16px', cursor: 'pointer', borderTop: `3px solid ${stage.hex}` }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', marginBottom: '6px' }}>{stage.label}</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text)' }}>{stageDeals.length}</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: stage.hex, marginTop: '4px' }}>{fmt$(stageGCI)}</div>
                </div>
              )
            })}
          </div>

          <SectionTitle>All Agents Pipeline</SectionTitle>
          <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--dim)' }}>
                  {['Agent','Active Deals','Pipeline GCI','Closed GCI','Closed Deals'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '2px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leaderboard.map(row => {
                  const active   = allDeals.deals.filter(d => d.agent_id === row.agent.id && !['Closed','Deal Fell Through'].includes(d.stage))
                  const pipeGCI  = active.reduce((s, d) => s + parseNum(d.gci), 0)
                  return (
                    <tr key={row.agent.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Avatar agent={row.agent} size={28} />
                          <span style={{ fontWeight: 600 }}>{row.agent.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px', color: 'var(--muted)' }}>{active.length}</td>
                      <td style={{ padding: '11px 14px', fontWeight: 600, color: '#F5A623' }}>{fmt$(pipeGCI)}</td>
                      <td style={{ padding: '11px 14px', fontWeight: 700, color: '#10B981' }}>{fmt$(row.gci)}</td>
                      <td style={{ padding: '11px 14px', color: 'var(--muted)' }}>{row.closed}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
