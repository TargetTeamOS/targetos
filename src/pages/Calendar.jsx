// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Calendar Page
// Monthly calendar view + list view. All events with own URLs.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useCalendar, useAgents } from '../lib/hooks'
import { fmtDate, today } from '../lib/utils'
import {
  PageHeader, Btn, Modal, Field, Input, Select, Textarea, Pill,
  ModalActions, Loading, Empty, Confirm, Tabs, Avatar
} from '../components/UI'
import { usePageView, LastVisited } from '../components/PageViewTracking'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const EVENT_TYPES = ['event','showing','closing','inspection','appointment','open house','other']
const EVENT_COLORS = ['#CC2200','#0EA5E9','#10B981','#F5A623','#8B5CF6','#EC4899','#6B7280']

const BLANK = {
  title: '', type: 'event', start_date: today(), start_time: '',
  end_date: '', end_time: '', all_day: false, location: '', description: '',
  color: '#CC2200'
}

export function Calendar() {
  const navigate = useNavigate()
  const { id: urlId } = useParams()
  const { agent, isAdmin, canManage } = useAuth()
  usePageView('calendar')
  const { toast } = useApp()

  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [view,  setView]  = useState('month')

  const startDate = new Date(year, month, 1).toISOString().slice(0,10)
  const endDate   = new Date(year, month + 1, 0).toISOString().slice(0,10)

  const filters = isAdmin || canManage
    ? { from: startDate, to: endDate }
    : { from: startDate, to: endDate, agent_id: agent?.id }

  const { events, loading, add, update, remove } = useCalendar(filters)
  const { agents } = useAgents()

  const [selected, setSelected] = useState(null)
  const [form,     setForm]     = useState(BLANK)
  const [saving,   setSaving]   = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (urlId && events.length > 0 && urlId !== 'new') {
      const e = events.find(x => x.id === urlId)
      if (e) { navigate('/calendar/' + e.id, { replace: true }); setSelected(e); setForm({ ...BLANK, ...e }) }
    }
  }, [urlId, events.length])

  function closePanel() {
    setSelected(null)
    navigate('/calendar', { replace: true })
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function saveEvent() {
    if (!form.title.trim()) { toast('Title required', '#DC2626'); return }
    setSaving(true)
    try {
      if (selected) {
        const updated = await update(selected.id, form, agent?.id)
        setSelected(updated)
        toast('✅ Event saved')
      } else {
        await add({ ...form, agent_id: form.agent_id || agent?.id })
        toast('✅ Event added')
        closePanel()
      }
    } catch(e) {
      toast('Save failed: ' + e.message, '#DC2626')
    } finally { setSaving(false) }
  }

  async function deleteEvent() {
    try {
      await remove(selected.id)
      toast('Event deleted')
      closePanel()
    } catch(e) {
      toast('Delete failed: ' + e.message, '#DC2626')
    } finally { setConfirmDelete(false) }
  }

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = today()

  function eventsOnDay(day) {
    const dateStr = year + '-' + String(month+1).padStart(2,'0') + '-' + String(day).padStart(2,'0')
    return events.filter(e => e.start_date === dateStr)
  }

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y-1) } else setMonth(m => m-1) }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(y => y+1) } else setMonth(m => m+1) }

  return (
    <div style={{ fontFamily: ff }}>
      <PageHeader
        title="Calendar"
        sub={events.length + ' events in ' + MONTHS[month] + ' ' + year}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <LastVisited page="calendar" />
            <Tabs tabs={[{id:'month',label:'Month'},{id:'list',label:'List'}]} active={view} onChange={setView} />
            <Btn onClick={() => { setSelected(null); setForm({ ...BLANK, agent_id: agent?.id }); navigate('/calendar/new') }}>+ Add Event</Btn>
          </div>
        }
      />

      {/* Month Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
        <button onClick={prevMonth} style={{ background: 'var(--dim)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 12px', cursor: 'pointer', color: 'var(--text)', fontFamily: ff }}>←</button>
        <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>{MONTHS[month]} {year}</div>
        <button onClick={nextMonth} style={{ background: 'var(--dim)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 12px', cursor: 'pointer', color: 'var(--text)', fontFamily: ff }}>→</button>
        <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()) }}
          style={{ background: 'var(--dim)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 12px', cursor: 'pointer', color: 'var(--muted)', fontSize: '12px', fontFamily: ff }}>Today</button>
      </div>

      {/* Month View */}
      {view === 'month' && (
        <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '2px solid var(--border)' }}>
            {DAYS.map(d => (
              <div key={d} style={{ padding: '10px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{d}</div>
            ))}
          </div>
          {/* Calendar grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {/* Empty cells for first week */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={"empty-" + (i)} style={{ minHeight: '100px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--dim)' }} />
            ))}
            {/* Day cells */}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
              const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
              const isToday = dateStr === todayStr
              const dayEvents = eventsOnDay(day)

              return (
                <div key={day}
                  style={{ minHeight: '100px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '6px', cursor: 'pointer', background: isToday ? 'rgba(204,34,0,.04)' : '' }}
                  onClick={() => {
                    setSelected(null)
                    setForm({ ...BLANK, start_date: dateStr, agent_id: agent?.id })
                    navigate('/calendar/new')
                  }}>
                  <div style={{ fontSize: '13px', fontWeight: isToday ? 800 : 500, color: isToday ? '#CC2200' : 'var(--muted)', marginBottom: '4px', display: 'inline-flex', width: '24px', height: '24px', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: isToday ? 'rgba(204,34,0,.15)' : 'transparent' }}>
                    {day}
                  </div>
                  {dayEvents.slice(0,3).map(ev => (
                    <div key={ev.id}
                      onClick={(e) => { e.stopPropagation(); navigate('/calendar/' + ev.id); setSelected(ev); setForm({ ...BLANK, ...ev }) }}
                      style={{ fontSize: '11px', fontWeight: 600, color: '#fff', background: ev.color || '#CC2200', borderRadius: '4px', padding: '2px 5px', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ev.start_time && (ev.start_time.slice(0,5)) + " "}{ev.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && <div style={{ fontSize: '10px', color: 'var(--muted)' }}>+{dayEvents.length - 3} more</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
        <div>
          {loading && <Loading />}
          {!loading && events.length === 0 && (
            <Empty icon="📅" title="No events this month" sub="Add an event to get started." action={<Btn onClick={() => navigate('/calendar/new')}>+ Add Event</Btn>} />
          )}
          {events.map(ev => (
            <div key={ev.id} onClick={() => { navigate('/calendar/' + ev.id); setSelected(ev); setForm({ ...BLANK, ...ev }) }}
              style={{ background: 'var(--panel)', borderRadius: '10px', border: '1px solid var(--border)', padding: '14px 16px', marginBottom: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px', borderLeft: "4px solid " + (ev.color || '#CC2200'), transition: 'box-shadow .12s' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
              <div style={{ textAlign: 'center', minWidth: '44px' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: ev.color || '#CC2200' }}>{new Date(ev.start_date + 'T00:00:00').getDate()}</div>
                <div style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase' }}>{MONTHS[new Date(ev.start_date + 'T00:00:00').getMonth()]?.slice(0,3)}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>{ev.title}</div>
                {ev.start_time && <div style={{ fontSize: '12px', color: 'var(--muted)' }}>🕐 {ev.start_time}{ev.end_time ? " — " + (ev.end_time) : ''}</div>}
                {ev.location && <div style={{ fontSize: '12px', color: 'var(--muted)' }}>📍 {ev.location}</div>}
              </div>
              <Pill label={ev.type} color={ev.color || '#CC2200'} />
              {ev.agents && <Avatar agent={ev.agents} size={24} />}
            </div>
          ))}
        </div>
      )}

      {/* Event Modal */}
      <Modal open={!!(selected || urlId === 'new')} onClose={closePanel} title={selected ? 'Edit Event' : 'New Event'} width={500}>
        <Field label="Title" required>
          <Input value={form.title} onChange={v => set('title', v)} placeholder="Event title" />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Field label="Type">
            <Select value={form.type} onChange={v => set('type', v)} options={EVENT_TYPES} />
          </Field>
          <Field label="Color">
            <div style={{ display: 'flex', gap: '6px', paddingTop: '4px' }}>
              {EVENT_COLORS.map(c => (
                <div key={c} onClick={() => set('color', c)}
                  style={{ width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer', border: form.color === c ? '3px solid var(--text)' : '2px solid transparent' }} />
              ))}
            </div>
          </Field>
          <Field label="Start Date">
            <Input value={form.start_date} onChange={v => set('start_date', v)} type="date" />
          </Field>
          <Field label="Start Time">
            <Input value={form.start_time} onChange={v => set('start_time', v)} type="time" />
          </Field>
          <Field label="End Date">
            <Input value={form.end_date} onChange={v => set('end_date', v)} type="date" />
          </Field>
          <Field label="End Time">
            <Input value={form.end_time} onChange={v => set('end_time', v)} type="time" />
          </Field>
        </div>
        <Field label="Location">
          <Input value={form.location} onChange={v => set('location', v)} placeholder="Address or link" />
        </Field>
        <Field label="Description">
          <Textarea value={form.description} onChange={v => set('description', v)} placeholder="Event details..." rows={3} />
        </Field>
        {(isAdmin || canManage) && (
          <Field label="Agent">
            <Select value={form.agent_id || ''} onChange={v => set('agent_id', v)} options={agents.map(a => ({ value: a.id, label: a.name }))} placeholder="Assign agent" />
          </Field>
        )}
        <ModalActions>
          {selected && <Btn variant="ghost" style={{ marginRight: 'auto', color: '#DC2626' }} onClick={() => setConfirmDelete(true)}>Delete</Btn>}
          <Btn variant="secondary" onClick={closePanel}>Cancel</Btn>
          <Btn onClick={saveEvent} loading={saving}>{selected ? 'Save' : 'Add Event'}</Btn>
        </ModalActions>
      </Modal>

      <Confirm open={confirmDelete} message="Delete this event?" onConfirm={deleteEvent} onCancel={() => setConfirmDelete(false)} />
    </div>
  )
}
