// ═══════════════════════════════════════════════════════════════
// TC Board — Morning Summary
// The at-a-glance strip at the top of the TC Board:
//   Overdue · Due Today · This Week · Upcoming Photography
// Every number is tappable — it opens the exact list of tasks (or
// shoots) behind that number, with one-tap complete, so the
// secretary starts the day from here.
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Modal, Btn } from './UI'
import { contactName } from './ContactPicker'

const today = () => new Date().toISOString().slice(0, 10)
const in7   = () => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10) }

const PRIORITY_COLOR = { urgent: '#DC2626', high: '#D97706', normal: '#2563EB', low: '#6B7280' }

export default function TCMorningSummary({ tasks = [], deals = [], onCompleteTask }) {
  const [openList, setOpenList] = useState(null)   // 'overdue' | 'today' | 'week' | 'photo' | null
  const [shoots, setShoots]     = useState([])

  const t = today(), wk = in7()
  const open = tasks.filter(x => x.status !== 'done')
  const overdue  = open.filter(x => x.due_date && x.due_date < t)
  const dueToday = open.filter(x => x.due_date === t)
  const thisWeek = open.filter(x => x.due_date && x.due_date > t && x.due_date <= wk)

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('tc_photography')
          .select('id, tc_deal_id, scheduled_at, status, total, photographer_contact_id')
          .not('scheduled_at', 'is', null)
          .gte('scheduled_at', new Date().toISOString())
          .in('status', ['Scheduled', 'Ready', 'Needs Prep'])
          .order('scheduled_at')
          .limit(20)
        const rows = data || []
        const pIds = [...new Set(rows.map(r => r.photographer_contact_id).filter(Boolean))]
        let people = {}
        if (pIds.length) {
          const { data: cs } = await supabase.from('contacts').select('id, first_name, last_name').in('id', pIds)
          people = Object.fromEntries((cs || []).map(c => [c.id, c]))
        }
        setShoots(rows.map(r => ({ ...r, photographer: people[r.photographer_contact_id] || null })))
      } catch { setShoots([]) }
    })()
  }, [deals.length])

  const dealAddr = id => deals.find(d => d.id === id)?.addr || ''

  const pill = (label, count, color, key) => (
    <button key={key} onClick={() => count > 0 && setOpenList(key)}
      style={{ flex: 1, minWidth: 110, padding: '10px 12px', borderRadius: 12, cursor: count > 0 ? 'pointer' : 'default',
               border: '1px solid var(--border)', background: 'var(--bg)', textAlign: 'left' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{count}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
    </button>
  )

  const listFor = { overdue, today: dueToday, week: thisWeek }[openList] || []
  const listTitle = { overdue: '🔴 Overdue tasks', today: '📌 Due today', week: '📆 Due this week', photo: '📸 Upcoming photography' }[openList]

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {pill('Overdue', overdue.length, '#DC2626', 'overdue')}
        {pill('Due Today', dueToday.length, '#D97706', 'today')}
        {pill('This Week', thisWeek.length, '#2563EB', 'week')}
        {pill('Upcoming 📸', shoots.length, '#7C3AED', 'photo')}
      </div>

      <Modal open={!!openList} onClose={() => setOpenList(null)} title={listTitle || ''} width={640}>
        {openList !== 'photo' && (
          <div style={{ display: 'grid', gap: 6, maxHeight: 420, overflowY: 'auto' }}>
            {listFor.map(task => (
              <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                                          border: '1px solid var(--border)', borderRadius: 8 }}>
                <input type="checkbox" checked={false} onChange={() => onCompleteTask?.(task)} title="Mark done" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{task.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {dealAddr(task.deal_id)}{task.due_date ? ' · due ' + task.due_date : ''}
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: PRIORITY_COLOR[task.priority] || 'var(--text-muted)' }}>
                  {(task.priority || '').toUpperCase()}
                </span>
              </div>
            ))}
            {!listFor.length && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Nothing here — all caught up 🎉</div>}
          </div>
        )}

        {openList === 'photo' && (
          <div style={{ display: 'grid', gap: 6, maxHeight: 420, overflowY: 'auto' }}>
            {shoots.map(s => (
              <div key={s.id} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{dealAddr(s.tc_deal_id) || 'Unknown address'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {new Date(s.scheduled_at).toLocaleString()} · {s.status}
                  {s.photographer ? ' · ' + contactName(s.photographer) : ''}
                  {s.total ? ' · $' + s.total : ''}
                </div>
              </div>
            ))}
            {!shoots.length && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No upcoming shoots scheduled.</div>}
          </div>
        )}
      </Modal>
    </>
  )
}
