// ═══════════════════════════════════════════════════════════════
// TC Deal Panels — People, Documents, Photography
// Rendered inside the TC Board's Edit Deal modal for existing deals.
// - PeoplePanel: participants linked to the Contacts board
// - DocumentsPanel: KW Command links + admin-editable statuses
// - PhotographyPanel: readiness checklist → services (admin-editable
//   prices) → schedule tracking → agent confirmation notification
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { notifyAgent } from '../lib/notify'
import { Btn } from './UI'
import ContactPicker, { contactName } from './ContactPicker'
import { WeatherForecast, fetchForecast } from './WeatherForecast'
import { ClickToCall } from './ClickToCall'

const inp = { width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--bg)', color: 'var(--text)' }
const sectionTitle = { fontWeight: 700, fontSize: 13, color: 'var(--text)', margin: '14px 0 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
const rowStyle = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }

// ── PEOPLE ─────────────────────────────────────────────────────────
export function PeoplePanel({ dealId, agentId, roles = [], toast }) {
  const [rows, setRows] = useState([])
  const [role, setRole] = useState(roles[0] || 'Seller')
  const [contacts, setContacts] = useState({})   // id → contact

  async function load() {
    const { data } = await supabase.from('tc_participants').select('*').eq('tc_deal_id', dealId).order('created_at')
    setRows(data || [])
    const ids = [...new Set((data || []).map(r => r.contact_id))]
    if (ids.length) {
      const { data: cs } = await supabase.from('contacts').select('id, first_name, last_name, email, phone').in('id', ids)
      setContacts(Object.fromEntries((cs || []).map(c => [c.id, c])))
    }
  }
  useEffect(() => { if (dealId) load() }, [dealId])

  async function add(contact) {
    try {
      const { error } = await supabase.from('tc_participants').insert({ tc_deal_id: dealId, contact_id: contact.id, role })
      if (error) throw error
      toast?.(contactName(contact) + ' added as ' + role)
      load()
    } catch (e) { toast?.('Could not add: ' + e.message, '#DC2626') }
  }

  async function remove(id) {
    await supabase.from('tc_participants').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <div style={sectionTitle}>👥 People on this deal</div>
      <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
        {rows.map(r => {
          const c = contacts[r.contact_id]
          return (
            <div key={r.id} style={rowStyle}>
              <div style={{ minWidth: 120, fontWeight: 600, color: 'var(--brand)' }}>{r.role}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{c ? contactName(c) : '…'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c ? [c.email, c.phone].filter(Boolean).join(' · ') : ''}</div>
              </div>
              {c?.phone && <ClickToCall phone={c.phone} contactName={contactName(c)} contactId={c.id} />}
              {c?.email && <a href={'mailto:' + c.email} title={'Email ' + contactName(c)}
                              style={{ textDecoration: 'none', fontSize: 15 }}>✉️</a>}
              <button onClick={() => remove(r.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>
          )
        })}
        {!rows.length && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No one added yet.</div>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 6 }}>
        <select style={inp} value={role} onChange={e => setRole(e.target.value)}>
          {roles.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <ContactPicker onSelect={add} agentId={agentId} placeholder="Search Contacts board…" />
      </div>
    </div>
  )
}

// ── DOCUMENTS ──────────────────────────────────────────────────────
export function DocumentsPanel({ dealId, statuses = [], toast }) {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({ name: '', url: '' })

  async function load() {
    const { data } = await supabase.from('tc_documents').select('*').eq('tc_deal_id', dealId).order('created_at')
    setRows(data || [])
  }
  useEffect(() => { if (dealId) load() }, [dealId])

  async function add() {
    if (!form.name.trim()) return
    try {
      const { error } = await supabase.from('tc_documents').insert({
        tc_deal_id: dealId, name: form.name.trim(), url: form.url.trim() || null,
        status: statuses[0] || 'Not Sent',
      })
      if (error) throw error
      setForm({ name: '', url: '' })
      load()
    } catch (e) { toast?.('Could not add document: ' + e.message, '#DC2626') }
  }

  async function setStatus(row, status) {
    const patch = { status, updated_at: new Date().toISOString() }
    if (/sent/i.test(status)   && !/not/i.test(status) && !row.sent_at)   patch.sent_at   = new Date().toISOString()
    if (/signed/i.test(status) && !row.signed_at)                          patch.signed_at = new Date().toISOString()
    await supabase.from('tc_documents').update(patch).eq('id', row.id)
    load()
  }

  async function remove(id) {
    await supabase.from('tc_documents').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <div style={sectionTitle}>📄 Documents</div>
      <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
        {rows.map(r => (
          <div key={r.id} style={rowStyle}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{r.name}</div>
              {r.url && <a href={r.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--brand)' }}>Open link ↗</a>}
            </div>
            <select style={{ ...inp, width: 130 }} value={r.status} onChange={e => setStatus(r, e.target.value)}>
              {[...new Set([r.status, ...statuses])].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={() => remove(r.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
          </div>
        ))}
        {!rows.length && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No documents tracked yet.</div>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr auto', gap: 6 }}>
        <input style={inp} placeholder="Document name (e.g. Listing Agreement)" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <input style={inp} placeholder="KW Command URL (optional)" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
        <Btn variant="secondary" onClick={add}>Add</Btn>
      </div>
    </div>
  )
}

// ── PHOTOGRAPHY ────────────────────────────────────────────────────
const PHOTO_STATUSES = ['Needs Prep', 'Ready', 'Scheduled', 'Shot', 'Photos Received']

export function PhotographyPanel({ deal, services = [], checklist = [], toast }) {
  const [order, setOrder]   = useState(null)   // existing tc_photography row or null
  const [loadingP, setLoadingP] = useState(true)
  const [photographer, setPhotographer] = useState(null)
  const [saving, setSaving] = useState(false)
  const [weatherGate, setWeatherGate] = useState(null)   // { forecast, when } when confirming bad weather
  const [checkingWx, setCheckingWx] = useState(false)

  async function load() {
    setLoadingP(true)
    const { data } = await supabase.from('tc_photography').select('*').eq('tc_deal_id', deal.id).order('created_at', { ascending: false }).limit(1)
    const row = data?.[0] || null
    setOrder(row)
    if (row?.photographer_contact_id) {
      const { data: c } = await supabase.from('contacts').select('id, first_name, last_name, email, phone').eq('id', row.photographer_contact_id).maybeSingle()
      setPhotographer(c || null)
    } else setPhotographer(null)
    setLoadingP(false)
  }
  useEffect(() => { if (deal?.id) load() }, [deal?.id])

  async function ensureOrder() {
    if (order) return order
    const { data, error } = await supabase.from('tc_photography')
      .insert({ tc_deal_id: deal.id, status: 'Needs Prep', services: [], readiness: {} })
      .select().single()
    if (error) throw error
    setOrder(data)
    return data
  }

  async function patch(fields, opts = {}) {
    setSaving(true)
    try {
      const row = await ensureOrder()
      const { data, error } = await supabase.from('tc_photography')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', row.id).select().single()
      if (error) throw error
      setOrder(data)

      // Agent confirmation when a shoot gets scheduled
      if (opts.notifySchedule && deal.agent_id) {
        const when = data.scheduled_at ? new Date(data.scheduled_at).toLocaleString() : 'TBD'
        notifyAgent(deal.agent_id, 'task_assigned', {
          title: '📸 Photography scheduled — ' + (deal.addr || ''),
          body: 'Shoot scheduled for ' + when + (photographer ? ' with ' + contactName(photographer) : '') + '. Total: $' + (data.total || 0),
          link: '/tc', type: 'info',
        }).catch(() => {})
        try {
          await supabase.from('calendar_events').insert({
            agent_id: deal.agent_id,
            title: '📸 Photography — ' + (deal.addr || ''),
            start_date: String(data.scheduled_at).slice(0, 10),
            start_time: String(data.scheduled_at).slice(11, 16) || '10:00',
            type: 'task',
            notes: 'Auto-created by TC Board photography tracker',
            created_at: new Date().toISOString(),
          })
        } catch (e) { console.warn('photo calendar sync failed:', e.message) }
        // Automations: photography_scheduled trigger (manageable in the
        // Automations board — e.g. "email the agent: get the house ready")
        try {
          const { trigger } = await import('../lib/automationDispatcher')
          trigger.photographyScheduled({
            id: deal.linked_deal_id || deal.id, deal_id: deal.linked_deal_id || deal.id,
            addr: deal.addr || '', agent_id: deal.agent_id || null,
            photo_when: when, photographer: photographer ? contactName(photographer) : '',
          })
        } catch {}
        toast?.('Photography scheduled — agent notified')
      }
    } catch (e) {
      toast?.('Could not save photography: ' + e.message, '#DC2626')
    } finally { setSaving(false) }
  }

  if (loadingP) return <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 14 }}>Loading photography…</div>

  const selected = order?.services || []
  const readiness = order?.readiness || {}
  const total = selected.reduce((s, x) => s + Number(x.price || 0), 0)
  const readyCount = checklist.filter(item => readiness[item]).length

  function toggleService(svc) {
    const has = selected.some(s => s.id === svc.id)
    const next = has ? selected.filter(s => s.id !== svc.id) : [...selected, { id: svc.id, label: svc.label, price: svc.price }]
    patch({ services: next, total: next.reduce((s, x) => s + Number(x.price || 0), 0) })
  }

  function toggleReady(item) {
    const next = { ...readiness, [item]: !readiness[item] }
    const fields = { readiness: next }
    const allDone = checklist.every(i => next[i])
    if (allDone && order?.status === 'Needs Prep') fields.status = 'Ready'
    patch(fields)
  }

  // Weather gate: before marking scheduled, check the forecast for
  // that day. Bad weather → pop a confirmation showing what's coming
  // and require an explicit "schedule anyway". Good/unknown → proceed.
  async function confirmSchedule() {
    if (!order?.scheduled_at) return
    setCheckingWx(true)
    let fc = null
    try { fc = await fetchForecast(deal.addr, order.scheduled_at) } catch {}
    setCheckingWx(false)
    if (fc && fc.ok && fc.bad) {
      setWeatherGate({ forecast: fc, when: new Date(order.scheduled_at).toLocaleString() })
      return
    }
    patch({ status: 'Scheduled' }, { notifySchedule: true })
  }

  return (
    <div>
      <div style={sectionTitle}>
        <span>📸 Photography</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
          {order?.status || 'Not started'}{selected.length ? ' · $' + total : ''}
        </span>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', margin: '6px 0 4px' }}>
        Ready for photos? ({readyCount}/{checklist.length})
      </div>
      <div style={{ display: 'grid', gap: 4, marginBottom: 10 }}>
        {checklist.map(item => (
          <label key={item} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!readiness[item]} onChange={() => toggleReady(item)} disabled={saving} />
            <span style={{ color: readiness[item] ? 'var(--text-muted)' : 'var(--text)', textDecoration: readiness[item] ? 'line-through' : 'none' }}>{item}</span>
          </label>
        ))}
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', margin: '6px 0 4px' }}>Services needed</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {services.map(svc => {
          const on = selected.some(s => s.id === svc.id)
          return (
            <button key={svc.id} onClick={() => toggleService(svc)} disabled={saving}
              style={{ padding: '6px 10px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
                       border: '1px solid ' + (on ? 'var(--brand)' : 'var(--border)'),
                       background: on ? 'var(--brand)' : 'var(--bg)', color: on ? '#fff' : 'var(--text)' }}>
              {svc.label} ${svc.price}
            </button>
          )
        })}
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', margin: '6px 0 4px' }}>Photographer (from Contacts)</div>
      {photographer ? (
        <div style={{ ...rowStyle, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{contactName(photographer)}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{[photographer.email, photographer.phone].filter(Boolean).join(' · ')}</div>
          </div>
          {photographer.phone && <ClickToCall phone={photographer.phone} contactName={contactName(photographer)} contactId={photographer.id} />}
          {photographer.email && <a href={'mailto:' + photographer.email} style={{ textDecoration: 'none', fontSize: 15 }}>✉️</a>}
          <button onClick={() => { setPhotographer(null); patch({ photographer_contact_id: null }) }}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>
      ) : (
        <div style={{ marginBottom: 8 }}>
          <ContactPicker placeholder="Search photographer…" agentId={deal.agent_id}
                         onSelect={c => { setPhotographer(c); patch({ photographer_contact_id: c.id }) }} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, alignItems: 'center' }}>
        <input type="datetime-local" style={inp}
               value={order?.scheduled_at ? String(order.scheduled_at).slice(0, 16) : ''}
               onChange={e => patch({ scheduled_at: e.target.value || null })} />
        <select style={inp} value={order?.status || 'Needs Prep'} onChange={e => patch({ status: e.target.value })}>
          {PHOTO_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <Btn onClick={() => confirmSchedule()}
             disabled={saving || checkingWx || !order?.scheduled_at}>
          {checkingWx ? 'Checking weather…' : 'Mark Scheduled ✓'}
        </Btn>
      </div>
      {order?.scheduled_at && <WeatherForecast address={deal.addr} date={order.scheduled_at} />}

      {/* Bad-weather confirmation gate */}
      {weatherGate && (
        <div onClick={() => setWeatherGate(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 3200, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--panel)', borderRadius: 14, padding: 22, width: 'min(420px, 94vw)', fontFamily: 'Inter,system-ui,sans-serif', boxShadow: '0 16px 48px rgba(0,0,0,.35)' }}>
            <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 6 }}>{weatherGate.forecast.emoji}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#DC2626', textAlign: 'center', marginBottom: 4 }}>⚠️ Bad weather expected</div>
            <div style={{ fontSize: 13, color: 'var(--text)', textAlign: 'center', marginBottom: 14, lineHeight: 1.5 }}>
              The forecast for <strong>{weatherGate.when}</strong> at<br/><strong>{deal.addr || 'this property'}</strong> is:
              <div style={{ marginTop: 8, fontSize: 15, fontWeight: 800, color: '#DC2626' }}>
                {weatherGate.forecast.label} · {weatherGate.forecast.tmax}°/{weatherGate.forecast.tmin}°F
                {weatherGate.forecast.pop != null && <div style={{ fontSize: 13, fontWeight: 700 }}>{weatherGate.forecast.pop}% chance of precipitation</div>}
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', textAlign: 'center', marginBottom: 16 }}>
              Outdoor/exterior photos may not come out well. Do you still want to schedule the shoot for this day?
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setWeatherGate(null)}
                style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,system-ui,sans-serif' }}>
                Pick another day
              </button>
              <button onClick={() => { setWeatherGate(null); patch({ status: 'Scheduled' }, { notifySchedule: true }) }}
                style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#DC2626', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'Inter,system-ui,sans-serif' }}>
                Schedule anyway
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
        “Mark Scheduled” notifies the agent and adds the shoot to their calendar. Booking with the photographer happens outside the system — this tracks it.
      </div>
    </div>
  )
}
