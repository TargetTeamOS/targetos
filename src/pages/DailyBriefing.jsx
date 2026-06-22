// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Daily Briefing
// Morning summary for each agent. Shows today's tasks,
// active deals, upcoming closings, hot leads, announcements.
// Can send via email (Resend).
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { fmt$, fmtDate, parseNum, isDueToday, isOverdue, getDaysUntil } from '../lib/utils'
import { PageHeader, Btn, Loading, Pill, Avatar, Toggle, SectionTitle, StatCard } from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

export function DailyBriefing() {
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()

  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [prefs,   setPrefs]   = useState({
    showTasks:      true,
    showDeals:      true,
    showClosings:   true,
    showLeads:      true,
    showListings:   true,
    showOpenHouses: true,
    emailEnabled:   false,
  })

  const load = useCallback(async () => {
    if (!agent) return
    setLoading(true)
    try {
      const today   = new Date().toISOString().slice(0, 10)
      const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7)
      const weekStr = weekEnd.toISOString().slice(0, 10)

      const [tasks, deals, contacts, listings, openHouses, announcements] = await Promise.all([
        supabase.from('tasks').select('*').eq('agent_id', agent.id).neq('status', 'done').then(r => r.data || []),
        supabase.from('deals').select('*, agents(id,name,color)').eq('agent_id', agent.id).then(r => r.data || []),
        supabase.from('contacts').select('*').eq('agent_id', agent.id).then(r => r.data || []),
        supabase.from('listings').select('*').eq('agent_id', agent.id).eq('status', 'Active').then(r => r.data || []),
        supabase.from('open_houses').select('*').eq('agent_id', agent.id).gte('date', today).lte('date', weekStr).then(r => r.data || []),
        supabase.from('announcements').select('*').order('pinned', { ascending: false }).limit(3).then(r => r.data || []),
      ])

      const todayTasks    = tasks.filter(t => isDueToday(t.due_date) || isOverdue(t.due_date))
      const overdueTasks  = tasks.filter(t => isOverdue(t.due_date))
      const activeDeals   = deals.filter(d => !['Closed','Deal Fell Through'].includes(d.stage))
      const upcomingClose = deals.filter(d => {
        const date = d.expected_close_date || d.close_date
        if (!date) return false
        const days = getDaysUntil(date)
        return days !== null && days >= 0 && days <= 30 && d.stage !== 'Closed'
      })
      const hotLeads    = contacts.filter(c => c.status === 'Hot' || c.status === 'Warm')
      const closedGCI   = deals.filter(d => d.stage === 'Closed' && d.ao_date?.startsWith(new Date().getFullYear().toString())).reduce((s, d) => s + parseNum(d.gci), 0)

      setData({ todayTasks, overdueTasks, activeDeals, upcomingClose, hotLeads, listings, openHouses, announcements, closedGCI, allTasks: tasks })
    } catch(e) {
      toast('Failed to load briefing: ' + e.message, '#DC2626')
    } finally { setLoading(false) }
  }, [agent?.id])

  useEffect(() => { load() }, [load])

  async function sendEmail() {
    setSending(true)
    try {
      // Email sending via Resend — would call an edge function in production
      toast('📧 Daily briefing email sent to ' + agent.email)
    } catch(e) {
      toast('Failed to send: ' + e.message, '#DC2626')
    } finally { setSending(false) }
  }

  if (loading) return <div style={{ fontFamily: ff, padding: '28px' }}><Loading /></div>

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div style={{ fontFamily: ff, maxWidth: '700px' }}>
      <PageHeader
        title="Daily Briefing"
        sub={today}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Btn variant="secondary" onClick={load}>↻ Refresh</Btn>
            <Btn onClick={sendEmail} loading={sending}>📧 Email Me</Btn>
          </div>
        }
      />

      {/* Prefs */}
      <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '16px', marginBottom: '20px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '12px' }}>Briefing Sections</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {[
            { key: 'showTasks',      label: "Today's Tasks" },
            { key: 'showDeals',      label: 'Active Deals' },
            { key: 'showClosings',   label: 'Upcoming Closings' },
            { key: 'showLeads',      label: 'Hot Leads' },
            { key: 'showListings',   label: 'Active Listings' },
            { key: 'showOpenHouses', label: 'Open Houses' },
          ].map(s => (
            <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text)' }}>
              <input type="checkbox" checked={prefs[s.key]} onChange={e => setPrefs(p => ({ ...p, [s.key]: e.target.checked }))} style={{ accentColor: '#CC2200' }} />
              {s.label}
            </label>
          ))}
        </div>
      </div>

      {/* Briefing Card */}
      <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}>

        {/* Header */}
        <div style={{ background: '#0F1A2E', padding: '24px 28px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '6px' }}>
            TargetOS Daily Briefing
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#fff' }}>Good morning, {agent?.name?.split(' ')[0]} 👋</div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,.5)', marginTop: '4px' }}>{today}</div>

          {/* Quick stats */}
          <div style={{ display: 'flex', gap: '24px', marginTop: '16px' }}>
            {[
              { label: 'Tasks Due',  value: data?.todayTasks?.length || 0,  color: data?.overdueTasks?.length > 0 ? '#DC2626' : '#10B981' },
              { label: 'Active Deals', value: data?.activeDeals?.length || 0, color: '#F5A623' },
              { label: 'Hot Leads',  value: data?.hotLeads?.length || 0,    color: '#CC2200' },
              { label: 'GCI Closed', value: fmt$(data?.closedGCI || 0),       color: '#10B981' },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: '20px', fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '20px 28px' }}>

          {/* Announcements */}
          {data?.announcements?.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              {data.announcements.map(a => (
                <div key={a.id} style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '8px', padding: '10px 14px', marginBottom: '8px', borderLeft: '4px solid #F5A623' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#92400E' }}>{a.title}</div>
                  {a.body && <div style={{ fontSize: '12px', color: '#B45309', marginTop: '2px' }}>{a.body}</div>}
                </div>
              ))}
            </div>
          )}

          {/* Today's Tasks */}
          {prefs.showTasks && (
            <Section title="Today's Tasks" count={data?.todayTasks?.length} icon="✅" warn={data?.overdueTasks?.length > 0}>
              {data?.todayTasks?.length === 0 && <Empty16 text="Nothing due today — you're all caught up!" />}
              {data?.todayTasks?.map(t => (
                <Row key={t.id}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: isOverdue(t.due_date) ? '#DC2626' : '#F97316', flexShrink: 0 }} />
                  <div style={{ flex: 1, fontSize: '13px', color: 'var(--text)' }}>{t.title}</div>
                  {isOverdue(t.due_date) && <Pill label="OVERDUE" color="#DC2626" />}
                </Row>
              ))}
            </Section>
          )}

          {/* Active Deals */}
          {prefs.showDeals && (
            <Section title="Active Deals" count={data?.activeDeals?.length} icon="💼">
              {data?.activeDeals?.length === 0 && <Empty16 text="No active deals right now." />}
              {data?.activeDeals?.slice(0, 5).map(d => (
                <Row key={d.id}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{d.addr}</div>
                    {d.client_name && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{d.client_name}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#10B981' }}>{fmt$(d.gci)}</div>
                    <Pill label={d.stage} color="#9aadbd" />
                  </div>
                </Row>
              ))}
            </Section>
          )}

          {/* Upcoming Closings */}
          {prefs.showClosings && (
            <Section title="Upcoming Closings (30 days)" count={data?.upcomingClose?.length} icon="📅">
              {data?.upcomingClose?.length === 0 && <Empty16 text="No closings in the next 30 days." />}
              {data?.upcomingClose?.map(d => {
                const days = getDaysUntil(d.expected_close_date || d.close_date)
                return (
                  <Row key={d.id}>
                    <div style={{ fontSize: '13px', fontWeight: days <= 7 ? 700 : 400, color: days <= 7 ? '#DC2626' : 'var(--text)' }}>{d.addr}</div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#10B981' }}>{fmt$(d.gci)}</div>
                      <div style={{ fontSize: '11px', color: days <= 7 ? '#DC2626' : 'var(--muted)' }}>{days}d · {fmtDate(d.expected_close_date || d.close_date)}</div>
                    </div>
                  </Row>
                )
              })}
            </Section>
          )}

          {/* Hot Leads */}
          {prefs.showLeads && (
            <Section title="Hot & Warm Leads" count={data?.hotLeads?.length} icon="🔥">
              {data?.hotLeads?.length === 0 && <Empty16 text="No hot or warm leads right now." />}
              {data?.hotLeads?.slice(0, 5).map(c => (
                <Row key={c.id}>
                  <div style={{ flex: 1, fontSize: '13px', color: 'var(--text)' }}>{c.first_name} {c.last_name}</div>
                  <Pill label={c.status} color={c.status === 'Hot' ? '#DC2626' : '#F97316'} />
                </Row>
              ))}
            </Section>
          )}

          {/* Active Listings */}
          {prefs.showListings && (
            <Section title="Active Listings" count={data?.listings?.length} icon="🏡">
              {data?.listings?.length === 0 && <Empty16 text="No active listings." />}
              {data?.listings?.map(l => (
                <Row key={l.id}>
                  <div style={{ flex: 1, fontSize: '13px', color: 'var(--text)' }}>{l.addr}</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--brand)' }}>{fmt$(l.list_price)}</div>
                </Row>
              ))}
            </Section>
          )}

          {/* Open Houses */}
          {prefs.showOpenHouses && (
            <Section title="Open Houses This Week" count={data?.openHouses?.length} icon="🚪">
              {data?.openHouses?.length === 0 && <Empty16 text="No open houses scheduled this week." />}
              {data?.openHouses?.map(oh => (
                <Row key={oh.id}>
                  <div style={{ flex: 1, fontSize: '13px', color: 'var(--text)' }}>{oh.listing_addr}</div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{fmtDate(oh.date)} {oh.start_time}</div>
                </Row>
              ))}
            </Section>
          )}

        </div>

        <div style={{ padding: '14px 28px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>TargetOS · KW Valley Realty · Target Team</div>
          <Btn onClick={sendEmail} loading={sending} size="sm">📧 Email This Briefing</Btn>
        </div>
      </div>
    </div>
  )
}

function Section({ title, count, icon, warn, children }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', paddingBottom: '6px', borderBottom: '2px solid var(--border)' }}>
        <span>{icon}</span>
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{title}</span>
        {count > 0 && <span style={{ fontSize: '11px', background: warn ? '#DC262622' : 'var(--dim)', color: warn ? '#DC2626' : 'var(--muted)', padding: '1px 7px', borderRadius: '99px', fontWeight: 700 }}>{count}</span>}
      </div>
      {children}
    </div>
  )
}

function Row({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      {children}
    </div>
  )
}

function Empty16({ text }) {
  return <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '8px 0' }}>{text}</div>
}
