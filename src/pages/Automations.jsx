// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Automations Page (Complete Rebuild)
//
// TWO BUILDER MODES:
// 1. Sentence Builder — Monday.com style: click underlined words
//    to pick trigger/action inline. Natural language feel.
// 2. Card Builder — step-by-step cards for complex automations.
//
// All data local — zero automation engine imports.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { invalidateCache } from '../lib/automationDispatcher'
import { fmtDateTime, fmtDate } from '../lib/utils'
import { Btn, Loading, Empty, Confirm } from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// ─────────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────────

const TRIGGER_GROUPS = [
  {
    label: 'Most Used',
    items: [
      { id: 'new_contact',           label: 'New contact added',             icon: '👤', sentence: 'a new contact is added' },
      { id: 'deal_stage_change',     label: 'Deal stage changes',            icon: '📊', sentence: 'a deal stage changes' },
      { id: 'task_overdue',          label: 'Task becomes overdue',          icon: '⚠️', sentence: 'a task becomes overdue' },
      { id: 'closing_soon',          label: 'Deal closing within X days',    icon: '📅', sentence: 'a deal is closing within {days} days', hasDays: true },
      { id: 'no_activity',           label: 'No contact activity for X days',icon: '💤', sentence: 'a contact has no activity for {days} days', hasDays: true },
      { id: 'contact_status_change', label: 'Contact status changes',        icon: '🔄', sentence: 'a contact status changes to {status}', hasStatus: true },
      { id: 'deal_closed',           label: 'Deal closes',                   icon: '🏁', sentence: 'a deal is closed' },
      { id: 'offer_accepted',        label: 'Offer accepted (AO)',           icon: '🤝', sentence: 'an offer is accepted' },
    ],
  },
  {
    label: 'Contacts',
    items: [
      { id: 'new_contact',           label: 'New contact added',             icon: '👤', sentence: 'a new contact is added' },
      { id: 'contact_status_change', label: 'Contact status changes',        icon: '🔄', sentence: 'a contact status changes to {status}', hasStatus: true },
      { id: 'no_activity',           label: 'No activity for X days',        icon: '💤', sentence: 'a contact has no activity for {days} days', hasDays: true },
      { id: 'contact_assigned',      label: 'Contact assigned to agent',     icon: '👤', sentence: 'a contact is assigned to an agent' },
      { id: 'birthday_today',        label: 'Contact birthday today',        icon: '🎂', sentence: "it is a contact's birthday" },
      { id: 'pre_approval_received', label: 'Contact gets pre-approved',     icon: '✅', sentence: 'a contact receives pre-approval' },
      { id: 'followup_date_reached', label: 'Follow-up date arrives',        icon: '📅', sentence: 'a follow-up date arrives for a contact' },
      { id: 'contact_source_added',  label: 'Contact source set',            icon: '📌', sentence: 'a contact source is set' },
      { id: 'new_buyer',             label: 'New buyer added',               icon: '🏠', sentence: 'a new buyer contact is added' },
    ],
  },
  {
    label: 'Deals',
    items: [
      { id: 'deal_created',          label: 'New deal added',                icon: '✨', sentence: 'a new deal is created' },
      { id: 'deal_stage_change',     label: 'Deal stage changes',            icon: '📊', sentence: 'a deal stage changes' },
      { id: 'offer_accepted',        label: 'Offer accepted (AO)',           icon: '🤝', sentence: 'an offer is accepted' },
      { id: 'deal_under_contract',   label: 'Deal goes under contract',      icon: '📝', sentence: 'a deal goes under contract' },
      { id: 'deal_closed',           label: 'Deal closes',                   icon: '🏁', sentence: 'a deal is closed' },
      { id: 'deal_fell_through',     label: 'Deal falls through',            icon: '💔', sentence: 'a deal falls through' },
      { id: 'closing_soon',          label: 'Closing within X days',         icon: '📅', sentence: 'a deal is closing within {days} days', hasDays: true },
      { id: 'mortgage_approved',     label: 'Mortgage approved',             icon: '🏦', sentence: 'a mortgage is approved on a deal' },
      { id: 'inspection_scheduled',  label: 'Inspection scheduled',          icon: '🔍', sentence: 'an inspection is scheduled' },
      { id: 'title_ordered',         label: 'Title ordered',                 icon: '📋', sentence: 'title is ordered on a deal' },
      { id: 'deal_gci_above',        label: 'Deal GCI above amount',         icon: '💰', sentence: 'a deal GCI is above an amount' },
    ],
  },
  {
    label: 'Tasks',
    items: [
      { id: 'task_created',          label: 'Task is created',               icon: '➕', sentence: 'a new task is created' },
      { id: 'task_overdue',          label: 'Task becomes overdue',          icon: '⚠️', sentence: 'a task becomes overdue' },
      { id: 'task_completed',        label: 'Task is completed',             icon: '✅', sentence: 'a task is completed' },
      { id: 'task_assigned',         label: 'Task assigned to agent',        icon: '👤', sentence: 'a task is assigned to an agent' },
      { id: 'task_due_today',        label: 'Task is due today',             icon: '📅', sentence: 'a task is due today' },
      { id: 'task_priority_changed', label: 'Task priority changed',         icon: '🚨', sentence: 'a task priority is changed' },
    ],
  },
  {
    label: 'Listings',
    items: [
      { id: 'listing_created',       label: 'New listing added',             icon: '🏡', sentence: 'a new listing is added' },
      { id: 'listing_status_change', label: 'Listing status changes',        icon: '🔄', sentence: 'a listing status changes' },
      { id: 'listing_price_reduced', label: 'Listing price reduced',         icon: '💲', sentence: 'a listing price is reduced' },
      { id: 'listing_expired',       label: 'Listing expires',               icon: '⏰', sentence: 'a listing expires' },
      { id: 'listing_sold',          label: 'Listing is sold',               icon: '🎉', sentence: 'a listing is sold' },
      { id: 'open_house_created',    label: 'Open house scheduled',          icon: '🚪', sentence: 'an open house is scheduled' },
      { id: 'open_house_today',      label: 'Open house is today',           icon: '🏠', sentence: 'an open house is happening today' },
      { id: 'oh_visitor_added',      label: 'Visitor added to open house',   icon: '🙋', sentence: 'a visitor is added to an open house' },
    ],
  },
  {
    label: 'Calendar & Events',
    items: [
      { id: 'event_created',         label: 'Calendar event created',        icon: '📅', sentence: 'a calendar event is created' },
      { id: 'event_today',           label: 'Event is today',                icon: '⏰', sentence: 'a calendar event is happening today' },
      { id: 'showing_scheduled',     label: 'Showing scheduled',             icon: '🏠', sentence: 'a showing is scheduled' },
    ],
  },
  {
    label: 'Gifts',
    items: [
      { id: 'gift_status_change',    label: 'Gift status changes',           icon: '🎁', sentence: 'a gift status changes' },
      { id: 'gift_created',          label: 'New gift added',                icon: '🎀', sentence: 'a new gift is added' },
    ],
  },
]

// Flat list for easy lookup
const TRIGGER_LIST = TRIGGER_GROUPS.flatMap(g => g.items).filter((t, i, arr) => arr.findIndex(x => x.id === t.id) === i)

const ACTION_GROUPS = [
  {
    label: 'Notifications & Messages',
    items: [
      { id: 'send_notification',    label: 'Notify someone',               icon: '🔔', sentence: 'notify {agent}' },
      { id: 'send_email',           label: 'Send email',                   icon: '📧', sentence: 'send an email to {agent}' },
      { id: 'notify_all_agents',    label: 'Notify all agents',            icon: '📢', sentence: 'notify all agents' },
      { id: 'notify_admin',         label: 'Notify admin',                 icon: '👑', sentence: 'notify the admin' },
      { id: 'send_sms',             label: 'Send SMS (Twilio)',             icon: '💬', sentence: 'send an SMS to {agent}' },
      { id: 'send_webhook',         label: 'Send to Zapier (webhook)',      icon: '⚡', sentence: 'push data to a webhook' },
    ],
  },
  {
    label: 'Tasks & Follow-ups',
    items: [
      { id: 'create_task',          label: 'Create a task',                icon: '✅', sentence: 'create a task for {agent}' },
      { id: 'create_followup',      label: 'Schedule a follow-up',         icon: '📅', sentence: 'schedule a follow-up in {days} days' },
      { id: 'mark_task_done',       label: 'Mark task as done',            icon: '☑️', sentence: 'mark the task as done' },
      { id: 'log_call',             label: 'Log a call note',              icon: '📞', sentence: 'log a call note' },
      { id: 'create_note',          label: 'Add a note to contact',        icon: '📝', sentence: 'add a note to the contact' },
    ],
  },
  {
    label: 'Update Records',
    items: [
      { id: 'update_contact_status',label: 'Change contact status',        icon: '🔄', sentence: 'change contact status to {status}' },
      { id: 'update_deal_stage',    label: 'Change deal stage',            icon: '📊', sentence: 'change deal stage to {stage}' },
      { id: 'assign_agent',         label: 'Assign to agent',              icon: '👤', sentence: 'assign to {agent}' },
      { id: 'set_followup_date',    label: 'Set follow-up date',           icon: '📅', sentence: 'set follow-up date to {days} days from now' },
      { id: 'update_contact_field', label: 'Update contact field',         icon: '✏️', sentence: 'update a contact field' },
    ],
  },
  {
    label: 'Tags & Labels',
    items: [
      { id: 'add_tag',              label: 'Add tag to contact',           icon: '🏷', sentence: 'add tag "{tag}" to contact' },
      { id: 'remove_tag',           label: 'Remove tag from contact',      icon: '🗑️', sentence: 'remove tag "{tag}" from contact' },
    ],
  },
  {
    label: 'Create Records',
    items: [
      { id: 'create_gift',          label: 'Create a gift order',          icon: '🎁', sentence: 'create a gift order' },
      { id: 'schedule_event',       label: 'Create a calendar event',      icon: '📅', sentence: 'create a calendar event' },
    ],
  },
]

const ACTION_LIST = ACTION_GROUPS.flatMap(g => g.items)

const CONTACT_STATUSES = ['New', 'Hot', 'Warm', 'Cold', 'Active', 'Nurturing', 'Under Contract', 'Closed', 'Unresponsive']
const DEAL_STAGES      = ['Negotiations', 'Offer Accapted', 'Under Shtar', 'Under Contract', 'Closed', 'Deal Fell Through']

const BLANK = {
  name:           '',
  description:    '',
  active:         false,
  trigger_type:   '',
  trigger_config: {},
  conditions:     [],
  action_nodes:   [],
}

// ─────────────────────────────────────────────────────────────────
// SHARED DROPDOWN
// A searchable dropdown that pops up from any anchor element
// ─────────────────────────────────────────────────────────────────
function Dropdown({ options, onSelect, onClose, title, width = 300 }) {
  const [search, setSearch] = useState('')
  const ref    = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Options can be flat array of {id,label,icon,category} or grouped array of {label,items:[...]}
  const isGrouped = options[0]?.items !== undefined

  const filterItem = item => !search || item.label.toLowerCase().includes(search.toLowerCase())

  const renderedGroups = isGrouped
    ? options.map(g => ({ ...g, items: g.items.filter(filterItem) })).filter(g => g.items.length > 0)
    : [{ label: null, items: options.filter(filterItem) }]

  return (
    <div ref={ref} style={{ position: 'absolute', top: '100%', left: 0, zIndex: 2000, background: '#fff', borderRadius: '10px', boxShadow: '0 8px 30px rgba(0,0,0,.18)', width, border: '1px solid #E2E8F0', overflow: 'hidden', fontFamily: ff }}>
      {title && <div style={{ padding: '10px 14px 6px', fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.06em' }}>{title}</div>}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#F8FAFC', borderRadius: '7px', padding: '6px 10px', border: '1px solid #E2E8F0' }}>
          <span style={{ color: '#94A3B8', fontSize: '13px' }}>🔍</span>
          <input
            ref={inputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            style={{ border: 'none', background: 'none', outline: 'none', fontSize: '13px', color: '#1E293B', width: '100%', fontFamily: ff }}
          />
        </div>
      </div>
      <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
        {renderedGroups.map((group, gi) => (
          <div key={gi}>
            {group.label && <div style={{ padding: '8px 14px 4px', fontSize: '10px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.06em' }}>{group.label}</div>}
            {group.items.map(item => (
              <div
                key={item.id}
                onClick={() => { onSelect(item); onClose() }}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px', cursor: 'pointer', transition: 'background .1s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                <span style={{ fontSize: '16px', flexShrink: 0 }}>{item.icon}</span>
                <span style={{ fontSize: '13px', color: '#1E293B', fontWeight: 500 }}>{item.label}</span>
              </div>
            ))}
          </div>
        ))}
        {renderedGroups.every(g => g.items.length === 0) && (
          <div style={{ padding: '20px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>No results</div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// SENTENCE BUILDER
// The Monday.com-style inline sentence experience
// "When {trigger} → then {action}"
// Click any blue underlined word to change it
// ─────────────────────────────────────────────────────────────────
function SentenceBuilder({ form, onChange, agents }) {
  const [openPicker, setOpenPicker] = useState(null) // 'trigger' | 'action_{idx}' | 'days' | etc.
  const trigger = TRIGGER_LIST.find(t => t.id === form.trigger_type)

  function setTrigger(t) {
    onChange({ ...form, trigger_type: t.id, trigger_config: { days: 7 }, action_nodes: form.action_nodes })
    setOpenPicker(null)
  }

  function addAction(a) {
    const defaults = { assign_to: 'trigger_agent', notify: 'trigger_agent', priority: 'normal', due_days: 1, to: 'trigger_agent' }
    onChange({ ...form, action_nodes: [...(form.action_nodes || []), { id: Date.now(), type: a.id, config: { ...defaults } }] })
    setOpenPicker(null)
  }

  function updateActionConfig(idx, key, val) {
    const nodes = form.action_nodes.map((n, i) => i === idx ? { ...n, config: { ...n.config, [key]: val } } : n)
    onChange({ ...form, action_nodes: nodes })
  }

  function removeAction(idx) {
    onChange({ ...form, action_nodes: form.action_nodes.filter((_, i) => i !== idx) })
  }

  const agentOptions = [
    { id: 'trigger_agent', label: 'the assigned agent', icon: '👤' },
    ...agents.map(a => ({ id: a.id, label: a.name, icon: '👤' })),
  ]

  // Clickable blue underlined word
  const Chip = ({ label, onClick, dim }) => (
    <span
      onClick={onClick}
      style={{ color: dim ? '#94A3B8' : '#1565C0', textDecoration: 'underline', textDecorationStyle: 'dotted', cursor: 'pointer', fontWeight: 600, padding: '1px 2px', borderRadius: '3px', transition: 'background .1s' }}
      onMouseEnter={e => e.currentTarget.style.background = '#EFF6FF'}
      onMouseLeave={e => e.currentTarget.style.background = ''}
    >
      {label}
    </span>
  )

  const SentenceLine = ({ prefix, children }) => (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px', fontSize: '18px', color: '#1E293B', fontWeight: 500, lineHeight: 1.7, padding: '8px 0' }}>
      {prefix && <span style={{ color: '#64748B', fontSize: '16px', fontWeight: 400 }}>{prefix}</span>}
      {children}
    </div>
  )

  return (
    <div style={{ padding: '28px 32px' }}>

      {/* WHEN */}
      <SentenceLine prefix="When">
        <span style={{ position: 'relative' }}>
          <Chip
            label={trigger ? trigger.sentence.replace(/{days}/g, form.trigger_config?.days || 7).replace(/{status}/g, form.trigger_config?.to_status || 'any status') : 'this happens'}
            dim={!trigger}
            onClick={() => setOpenPicker(openPicker === 'trigger' ? null : 'trigger')}
          />
          {openPicker === 'trigger' && (
            <Dropdown
              options={TRIGGER_GROUPS}
              onSelect={setTrigger}
              onClose={() => setOpenPicker(null)}
              title="Choose a trigger"
              width={340}
            />
          )}
        </span>

        {/* Inline day editor for no_activity / closing_soon */}
        {trigger?.hasDays && (
          <>
            <span style={{ color: '#64748B', fontSize: '14px' }}>—</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <input
                type="number"
                value={form.trigger_config?.days || 7}
                min={1}
                max={365}
                onChange={e => onChange({ ...form, trigger_config: { ...form.trigger_config, days: e.target.value } })}
                style={{ width: '48px', padding: '2px 6px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '14px', fontWeight: 700, color: '#1565C0', textAlign: 'center', fontFamily: ff }}
              />
              <span style={{ fontSize: '14px', color: '#64748B' }}>days</span>
            </span>
          </>
        )}

        {/* Status picker for contact_status_change */}
        {trigger?.hasStatus && (
          <>
            <span style={{ color: '#64748B', fontSize: '14px' }}>to</span>
            <span style={{ position: 'relative' }}>
              <Chip
                label={form.trigger_config?.to_status || 'any status'}
                onClick={() => setOpenPicker(openPicker === 'trigger_status' ? null : 'trigger_status')}
              />
              {openPicker === 'trigger_status' && (
                <Dropdown
                  options={[{ label: null, items: [{ id: '', label: 'Any status', icon: '🔄' }, ...CONTACT_STATUSES.map(s => ({ id: s, label: s, icon: '🏷' }))] }]}
                  onSelect={s => { onChange({ ...form, trigger_config: { ...form.trigger_config, to_status: s.id } }); setOpenPicker(null) }}
                  onClose={() => setOpenPicker(null)}
                  width={220}
                />
              )}
            </span>
          </>
        )}
      </SentenceLine>

      {/* Divider arrow */}
      {trigger && (
        <div style={{ color: '#94A3B8', fontSize: '20px', padding: '4px 0 4px 4px' }}>↓</div>
      )}

      {/* ACTIONS */}
      {(form.action_nodes || []).map((action, idx) => {
        const def = ACTION_LIST.find(a => a.id === action.type)
        if (!def) return null
        const cfg = action.config || {}
        const pickerKey = "action_" + (idx)

        const AgentChip = ({ configKey }) => {
          const chosen = [{ id: 'trigger_agent', label: 'the assigned agent', icon: '👤' }, ...agents.map(a => ({ id: a.id, label: a.name, icon: '👤' }))].find(a => a.id === cfg[configKey])
          return (
            <span style={{ position: 'relative' }}>
              <Chip
                label={chosen?.label || 'the assigned agent'}
                onClick={() => setOpenPicker(openPicker === `${pickerKey}_${configKey}" ? null : "${pickerKey}_${configKey}`)}
              />
              {openPicker === `${pickerKey}_${configKey}` && (
                <Dropdown
                  options={[{ label: null, items: agentOptions }]}
                  onSelect={a => { updateActionConfig(idx, configKey, a.id); setOpenPicker(null) }}
                  onClose={() => setOpenPicker(null)}
                  width={240}
                />
              )}
            </span>
          )
        }

        return (
          <div key={action.id}>
            <SentenceLine prefix="→ Then">
              <span style={{ fontSize: '16px' }}>{def.icon}</span>

              {/* Action type picker */}
              <span style={{ position: 'relative' }}>
                <Chip
                  label={def.label.toLowerCase()}
                  onClick={() => setOpenPicker(openPicker === pickerKey ? null : pickerKey)}
                />
                {openPicker === pickerKey && (
                  <Dropdown
                    options={ACTION_GROUPS}
                    onSelect={a => { const nodes = form.action_nodes.map((n, i) => i === idx ? { ...n, type: a.id } : n); onChange({ ...form, action_nodes: nodes }); setOpenPicker(null) }}
                    onClose={() => setOpenPicker(null)}
                    title="Choose an action"
                    width={300}
                  />
                )}
              </span>

              {/* Action-specific inline fields */}
              {(action.type === 'send_notification' || action.type === 'send_email' || action.type === 'assign_agent' || action.type === 'create_task') && (
                <>{action.type !== 'assign_agent' && action.type !== 'create_task' ? null : null}<AgentChip configKey={action.type === 'send_notification' ? 'notify' : action.type === 'send_email' ? 'to' : 'assign_to'} /></>
              )}

              {action.type === 'create_task' && (
                <>
                  <span style={{ color: '#64748B', fontSize: '14px' }}>due in</span>
                  <input
                    type="number"
                    value={cfg.due_days || 1}
                    min={0}
                    max={90}
                    onChange={e => updateActionConfig(idx, 'due_days', e.target.value)}
                    style={{ width: '44px', padding: '2px 6px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '14px', fontWeight: 700, color: '#1565C0', textAlign: 'center', fontFamily: ff }}
                  />
                  <span style={{ color: '#64748B', fontSize: '14px' }}>days</span>
                </>
              )}

              {action.type === 'update_contact_status' && (
                <>
                  <span style={{ color: '#64748B', fontSize: '14px' }}>to</span>
                  <span style={{ position: 'relative' }}>
                    <Chip
                      label={cfg.status || 'select status'}
                      dim={!cfg.status}
                      onClick={() => setOpenPicker(openPicker === (pickerKey) + "_status" ? null : (pickerKey) + "_status")}
                    />
                    {openPicker === (pickerKey) + "_status" && (
                      <Dropdown
                        options={[{ label: null, items: CONTACT_STATUSES.map(s => ({ id: s, label: s, icon: '🏷' })) }]}
                        onSelect={s => { updateActionConfig(idx, 'status', s.id); setOpenPicker(null) }}
                        onClose={() => setOpenPicker(null)}
                        width={200}
                      />
                    )}
                  </span>
                </>
              )}

              {action.type === 'update_deal_stage' && (
                <>
                  <span style={{ color: '#64748B', fontSize: '14px' }}>to</span>
                  <span style={{ position: 'relative' }}>
                    <Chip
                      label={cfg.stage || 'select stage'}
                      dim={!cfg.stage}
                      onClick={() => setOpenPicker(openPicker === (pickerKey) + "_stage" ? null : (pickerKey) + "_stage")}
                    />
                    {openPicker === (pickerKey) + "_stage" && (
                      <Dropdown
                        options={[{ label: null, items: DEAL_STAGES.map(s => ({ id: s, label: s, icon: '📊' })) }]}
                        onSelect={s => { updateActionConfig(idx, 'stage', s.id); setOpenPicker(null) }}
                        onClose={() => setOpenPicker(null)}
                        width={220}
                      />
                    )}
                  </span>
                </>
              )}

              {action.type === 'add_tag' && (
                <>
                  <span style={{ color: '#64748B', fontSize: '14px' }}>tag</span>
                  <input
                    value={cfg.tag || ''}
                    onChange={e => updateActionConfig(idx, 'tag', e.target.value)}
                    placeholder="tag-name"
                    style={{ padding: '2px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '14px', fontWeight: 700, color: '#1565C0', fontFamily: ff, width: '100px' }}
                  />
                </>
              )}

              {/* Remove action */}
              <button
                onClick={() => removeAction(idx)}
                style={{ marginLeft: '4px', background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: '14px', opacity: 0.6, padding: '2px 4px', borderRadius: '4px' }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
              >
                ✕
              </button>
            </SentenceLine>

            {/* Extended config for webhook */}
            {action.type === 'send_webhook' && (
              <div style={{ marginLeft: '28px', marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <input
                  value={cfg.url || ''}
                  onChange={e => updateActionConfig(idx, 'url', e.target.value)}
                  placeholder="Webhook URL: paste a Zapier Catch Hook (https://hooks.zapier.com/...)"
                  style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#1E293B', fontFamily: ff, background: '#F8FAFC', outline: 'none' }}
                />
                <input
                  value={cfg.payload || ''}
                  onChange={e => updateActionConfig(idx, 'payload', e.target.value)}
                  placeholder="Optional message... use {{contact_name}}, {{stage}}, {{addr}}"
                  style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#1E293B', fontFamily: ff, background: '#F8FAFC', outline: 'none' }}
                />
              </div>
            )}

            {/* Extended config for email/notification */}
            {(action.type === 'send_email' || action.type === 'send_notification') && (
              <div style={{ marginLeft: '28px', marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {action.type === 'send_email' && (
                  <input
                    value={cfg.subject || ''}
                    onChange={e => updateActionConfig(idx, 'subject', e.target.value)}
                    placeholder="Subject: e.g. New lead — {{contact_name}}"
                    style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#1E293B', fontFamily: ff, background: '#F8FAFC', outline: 'none' }}
                  />
                )}
                <textarea
                  value={cfg.body || ''}
                  onChange={e => updateActionConfig(idx, 'body', e.target.value)}
                  placeholder={action.type === 'send_email' ? 'Email body... use {{contact_name}}, {{stage}}, {{addr}}' : 'Notification message...'}
                  rows={2}
                  style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#1E293B', fontFamily: ff, resize: 'vertical', background: '#F8FAFC', outline: 'none' }}
                />
              </div>
            )}

            {action.type === 'create_task' && (
              <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
                <input
                  value={cfg.title || ''}
                  onChange={e => updateActionConfig(idx, 'title', e.target.value)}
                  placeholder="Task title: e.g. Follow up with {{contact_name}}"
                  style={{ width: '100%', padding: '7px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#1E293B', fontFamily: ff, background: '#F8FAFC', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            )}
          </div>
        )
      })}

      {/* Add action button */}
      {trigger && (
        <div style={{ position: 'relative', marginTop: '8px' }}>
          <button
            onClick={() => setOpenPicker(openPicker === 'add_action' ? null : 'add_action')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px', borderRadius: '9px', border: '2px dashed #CBD5E1', background: 'transparent', color: '#64748B', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: ff, transition: 'all .15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.color = '#3B82F6' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.color = '#64748B' }}
          >
            <span style={{ fontSize: '18px' }}>＋</span>
            Add action
          </button>
          {openPicker === 'add_action' && (
            <Dropdown
              options={ACTION_GROUPS}
              onSelect={addAction}
              onClose={() => setOpenPicker(null)}
              title="Then do this..."
              width={300}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// CARD BUILDER (original step-by-step grid — now mode 2)
// ─────────────────────────────────────────────────────────────────
function CardBuilder({ form, onChange, agents }) {
  const nodes = form.action_nodes || []

  function setTrigger(id) {
    onChange({ ...form, trigger_type: id, trigger_config: {} })
  }

  function addAction(type) {
    onChange({ ...form, action_nodes: [...nodes, { id: Date.now(), type, config: { assign_to: 'trigger_agent', notify: 'trigger_agent', priority: 'normal', due_days: 1, to: 'trigger_agent' } }] })
  }

  function updateAction(idx, key, val) {
    const next = nodes.map((n, i) => i === idx ? { ...n, config: { ...n.config, [key]: val } } : n)
    onChange({ ...form, action_nodes: next })
  }

  function removeAction(idx) {
    onChange({ ...form, action_nodes: nodes.filter((_, i) => i !== idx) })
  }

  const agentOptions = [
    { value: 'trigger_agent', label: '👤 Assigned Agent' },
    ...agents.map(a => ({ value: a.id, label: a.name })),
  ]

  const Sel = ({ value, onChange: oc, options, placeholder }) => (
    <select value={value || ''} onChange={e => oc(e.target.value)}
      style={{ width: '100%', padding: '7px 10px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={typeof o === 'string' ? o : o.value} value={typeof o === 'string' ? o : o.value}>{typeof o === 'string' ? o : o.label}</option>)}
    </select>
  )

  const Inp = ({ value, onChange: oc, placeholder, type = 'text' }) => (
    <input type={type} value={value || ''} onChange={e => oc(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', padding: '7px 10px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff, boxSizing: 'border-box' }} />
  )

  const Lbl = ({ children }) => (
    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>{children}</div>
  )

  return (
    <div style={{ padding: '20px' }}>

      {/* Step 1 — Trigger */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#CC2200', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>1</div>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>When this happens... (Trigger)</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
          {TRIGGER_LIST.map(t => (
            <div key={t.id} onClick={() => setTrigger(t.id)}
              style={{ padding: '10px 12px', borderRadius: '8px', border: "2px solid " + (form.trigger_type === t.id ? '#CC2200' : 'var(--border)'), background: form.trigger_type === t.id ? 'rgba(204,34,0,.06)' : 'var(--dim)', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '2px' }}>
                <span style={{ fontSize: '14px' }}>{t.icon}</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: form.trigger_type === t.id ? '#CC2200' : 'var(--text)' }}>{t.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Step 2 — Actions */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#10B981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>2</div>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>Then do this... (Actions)</span>
        </div>

        {nodes.map((action, idx) => {
          const def = ACTION_LIST.find(a => a.id === action.type)
          if (!def) return null
          const cfg = action.config || {}
          return (
            <div key={action.id} style={{ background: 'var(--dim)', borderRadius: '10px', border: '1px solid var(--border)', padding: '14px', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px' }}>{def.icon}</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{def.label}</span>
                </div>
                <button onClick={() => removeAction(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: '16px' }}>✕</button>
              </div>
              {action.type === 'create_task' && <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                <div><Lbl>Task Title</Lbl><Inp value={cfg.title} onChange={v => updateAction(idx,'title',v)} placeholder="Follow up with {{contact_name}}" /></div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                  <div><Lbl>Priority</Lbl><Sel value={cfg.priority} onChange={v => updateAction(idx,'priority',v)} options={[{value:'urgent',label:'Urgent'},{value:'high',label:'High'},{value:'normal',label:'Normal'},{value:'low',label:'Low'}]} /></div>
                  <div><Lbl>Due in (days)</Lbl><Inp type="number" value={cfg.due_days} onChange={v => updateAction(idx,'due_days',v)} placeholder="1" /></div>
                </div>
                <div><Lbl>Assign To</Lbl><Sel value={cfg.assign_to} onChange={v => updateAction(idx,'assign_to',v)} options={agentOptions} /></div>
              </div>}
              {action.type === 'send_notification' && <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                <div><Lbl>Notify</Lbl><Sel value={cfg.notify} onChange={v => updateAction(idx,'notify',v)} options={agentOptions} /></div>
                <div><Lbl>Title</Lbl><Inp value={cfg.title} onChange={v => updateAction(idx,'title',v)} placeholder="New lead assigned" /></div>
                <div><Lbl>Message</Lbl><textarea value={cfg.body||''} onChange={e => updateAction(idx,'body',e.target.value)} placeholder="{{contact_name}} needs a follow up" rows={2} style={{ width:'100%', padding:'7px 10px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff, resize:'vertical', boxSizing:'border-box' }} /></div>
              </div>}
              {action.type === 'send_email' && <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                <div><Lbl>Send To</Lbl><Sel value={cfg.to} onChange={v => updateAction(idx,'to',v)} options={agentOptions} /></div>
                <div><Lbl>Subject</Lbl><Inp value={cfg.subject} onChange={v => updateAction(idx,'subject',v)} placeholder="New lead: {{contact_name}}" /></div>
                <div><Lbl>Message</Lbl><textarea value={cfg.body||''} onChange={e => updateAction(idx,'body',e.target.value)} placeholder="Automated email body..." rows={2} style={{ width:'100%', padding:'7px 10px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff, resize:'vertical', boxSizing:'border-box' }} /></div>
              </div>}
              {action.type === 'update_contact_status' && <div><Lbl>Set Status To</Lbl><Sel value={cfg.status} onChange={v => updateAction(idx,'status',v)} options={CONTACT_STATUSES} placeholder="Select status..." /></div>}
              {action.type === 'update_deal_stage'    && <div><Lbl>Set Stage To</Lbl><Sel value={cfg.stage} onChange={v => updateAction(idx,'stage',v)} options={DEAL_STAGES} placeholder="Select stage..." /></div>}
              {action.type === 'assign_agent'          && <div><Lbl>Assign To Agent</Lbl><Sel value={cfg.agent_id} onChange={v => updateAction(idx,'agent_id',v)} options={agents.map(a => ({ value:a.id, label:a.name }))} placeholder="Select agent..." /></div>}
              {action.type === 'add_tag'               && <div><Lbl>Tag</Lbl><Inp value={cfg.tag} onChange={v => updateAction(idx,'tag',v)} placeholder="e.g. hot-lead" /></div>}
              {action.type === 'remove_tag'            && <div><Lbl>Tag to Remove</Lbl><Inp value={cfg.tag} onChange={v => updateAction(idx,'tag',v)} placeholder="e.g. hot-lead" /></div>}
              {action.type === 'notify_all_agents'     && <div><Lbl>Message</Lbl><textarea value={cfg.body||''} onChange={e => updateAction(idx,'body',e.target.value)} placeholder="Message to all agents..." rows={2} style={{ width:'100%', padding:'7px 10px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff, resize:'vertical', boxSizing:'border-box' }} /></div>}
              {action.type === 'notify_admin'          && <div><Lbl>Message</Lbl><textarea value={cfg.body||''} onChange={e => updateAction(idx,'body',e.target.value)} placeholder="Message to admin..." rows={2} style={{ width:'100%', padding:'7px 10px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff, resize:'vertical', boxSizing:'border-box' }} /></div>}
              {action.type === 'send_sms'              && <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                <div><Lbl>Send To</Lbl><Sel value={cfg.to} onChange={v => updateAction(idx,'to',v)} options={agentOptions} /></div>
                <div><Lbl>Message</Lbl><textarea value={cfg.body||''} onChange={e => updateAction(idx,'body',e.target.value)} placeholder="SMS message... use {{contact_name}}" rows={2} style={{ width:'100%', padding:'7px 10px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff, resize:'vertical', boxSizing:'border-box' }} /></div>
                <div style={{ background:'var(--dim)', padding:'8px 10px', borderRadius:'7px', fontSize:'11px', color:'var(--muted)' }}>📱 Requires Twilio setup in Settings</div>
              </div>}
              {action.type === 'create_followup'       && <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                <div><Lbl>Follow-up in (days)</Lbl><Inp type="number" value={cfg.due_days||7} onChange={v => updateAction(idx,'due_days',v)} placeholder="7" /></div>
                <div><Lbl>Assign To</Lbl><Sel value={cfg.assign_to} onChange={v => updateAction(idx,'assign_to',v)} options={agentOptions} /></div>
                <div style={{ gridColumn:'span 2' }}><Lbl>Note (optional)</Lbl><Inp value={cfg.notes} onChange={v => updateAction(idx,'notes',v)} placeholder="Follow-up note..." /></div>
              </div>}
              {action.type === 'set_followup_date'     && <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                <div><Lbl>Days from now</Lbl><Inp type="number" value={cfg.days||7} onChange={v => updateAction(idx,'days',v)} placeholder="7" /></div>
              </div>}
              {action.type === 'log_call'              && <div><Lbl>Call Notes</Lbl><textarea value={cfg.notes||''} onChange={e => updateAction(idx,'notes',e.target.value)} placeholder="Auto-logged call note..." rows={2} style={{ width:'100%', padding:'7px 10px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff, resize:'vertical', boxSizing:'border-box' }} /></div>}
              {action.type === 'create_note'           && <div><Lbl>Note Content</Lbl><textarea value={cfg.body||''} onChange={e => updateAction(idx,'body',e.target.value)} placeholder="Note text... use {{contact_name}}" rows={2} style={{ width:'100%', padding:'7px 10px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff, resize:'vertical', boxSizing:'border-box' }} /></div>}
              {action.type === 'update_contact_field'  && <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                <div><Lbl>Field</Lbl><Sel value={cfg.field} onChange={v => updateAction(idx,'field',v)} options={[{value:'motivation',label:'Motivation'},{value:'timeline',label:'Timeline'},{value:'financing',label:'Financing'},{value:'budget_max',label:'Max Budget'},{value:'source',label:'Source'}]} placeholder="Select field..." /></div>
                <div><Lbl>Value</Lbl><Inp value={cfg.value} onChange={v => updateAction(idx,'value',v)} placeholder="New value..." /></div>
              </div>}
              {action.type === 'create_gift'           && <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                <div><Lbl>Gift Description</Lbl><Inp value={cfg.description} onChange={v => updateAction(idx,'description',v)} placeholder="Closing gift for {{contact_name}}" /></div>
                <div><Lbl>Assign To</Lbl><Sel value={cfg.assign_to} onChange={v => updateAction(idx,'assign_to',v)} options={agentOptions} /></div>
              </div>}
              {action.type === 'schedule_event'        && <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                <div><Lbl>Event Title</Lbl><Inp value={cfg.title} onChange={v => updateAction(idx,'title',v)} placeholder="Follow-up with {{contact_name}}" /></div>
                <div><Lbl>Days from now</Lbl><Inp type="number" value={cfg.days||1} onChange={v => updateAction(idx,'days',v)} placeholder="1" /></div>
              </div>}
            </div>
          )
        })}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
          {ACTION_LIST.map(a => (
            <button key={a.id} onClick={() => addAction(a.id)}
              style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--panel)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: ff, fontSize: '12px', color: 'var(--text)', fontWeight: 500 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--hov)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--panel)'}>
              <span>{a.icon}</span>{a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// AUTOMATION CARD (list view)
// ─────────────────────────────────────────────────────────────────
function AutomationCard({ automation, onEdit, onToggle, onDelete, onViewRuns }) {
  const trigger = TRIGGER_LIST.find(t => t.id === automation.trigger_type)
  const isActive = automation.active === true

  return (
    <div style={{ background: 'var(--panel)', borderRadius: '12px', border: "1px solid " + (isActive ? '#10B98133' : 'var(--border)'), padding: '16px 20px', transition: 'box-shadow .15s' }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
        <div style={{ width: 36, height: 36, borderRadius: '10px', background: isActive ? '#10B98118' : 'var(--dim)', border: "1px solid " + (isActive ? '#10B98144' : 'var(--border)'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>
          {trigger?.icon || '⚡'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', marginBottom: '2px' }}>{automation.name}</div>
          {automation.description && <div style={{ fontSize: '12px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{automation.description}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <div onClick={() => onToggle(automation)}
            style={{ width: 38, height: 20, borderRadius: '99px', background: isActive ? '#10B981' : 'var(--border)', position: 'relative', cursor: 'pointer', transition: 'background .2s' }}>
            <div style={{ position: 'absolute', top: 2, left: isActive ? 20 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
          </div>
          <span style={{ fontSize: '11px', fontWeight: 600, color: isActive ? '#10B981' : '#94A3B8' }}>{isActive ? 'Active' : 'Inactive'}</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {trigger && <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', background: '#EFF6FF', color: '#1D4ED8', fontWeight: 600 }}>{trigger.icon} {trigger.label}</span>}
        <span style={{ color: 'var(--muted)', fontSize: '12px' }}>→</span>
        <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', background: '#F0FDF4', color: '#166534', fontWeight: 600 }}>
          {(automation.action_nodes || []).length} action{(automation.action_nodes || []).length !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>{automation.fire_count || 0}</span> runs
          {automation.last_fired && <span style={{ marginLeft: '10px' }}>Last: {fmtDate(automation.last_fired)}</span>}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => onViewRuns(automation)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '12px', color: 'var(--muted)', fontFamily: ff }}>📋 History</button>
          <button onClick={() => onEdit(automation)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '12px', color: 'var(--text)', fontFamily: ff }}>✏️ Edit</button>
          <button onClick={() => onDelete(automation)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '12px', color: '#DC2626', fontFamily: ff }}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// RUN HISTORY
// ─────────────────────────────────────────────────────────────────
function RunHistory({ automation, onClose }) {
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!automation?.id) return
    supabase.from('automation_runs').select('*').eq('automation_id', automation.id).order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => { setRuns(data || []); setLoading(false) })
      .catch(() => { setRuns([]); setLoading(false) })
  }, [automation?.id])

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: ff }}>
      <div style={{ background: 'var(--panel)', borderRadius: '14px', width: '100%', maxWidth: '520px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,.3)' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>📋 Run History — {automation.name}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px' }}>
          {loading && <Loading />}
          {!loading && runs.length === 0 && <div style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)', fontSize: '13px' }}>No runs yet — activate this automation to start tracking.</div>}
          {runs.map(run => (
            <div key={run.id} style={{ padding: '10px 12px', borderRadius: '8px', border: "1px solid " + (run.status === 'error' ? '#FECACA' : 'var(--border)'), background: run.status === 'error' ? '#FEF2F2' : 'var(--dim)', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{run.status === 'error' ? '❌' : '✅'}</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: run.status === 'error' ? '#DC2626' : '#10B981' }}>{run.status === 'error' ? 'Failed' : 'Success'}</span>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{run.records_affected || 0} actions</span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{fmtDateTime(run.created_at)}</span>
              </div>
              {run.error && <div style={{ fontSize: '11px', color: '#DC2626', fontFamily: 'monospace', marginTop: '4px' }}>{run.error}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────
export function Automations() {
  const { agent, isAdmin } = useAuth()
  const { toast } = useApp()

  const [automations, setAutomations] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [agents,      setAgents]      = useState([])
  const [selected,    setSelected]    = useState(null)
  const [form,        setForm]        = useState({ ...BLANK })
  const [showBuilder, setShowBuilder] = useState(false)
  const [builderMode, setBuilderMode] = useState('sentence') // 'sentence' | 'card'
  const [viewRuns,    setViewRuns]    = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [confirmDel,  setConfirmDel]  = useState(null)

  useEffect(() => {
    loadAutomations()
    supabase.from('agents').select('id, name, color').eq('active', true).order('name')
      .then(({ data }) => setAgents(data || []))
      .catch(() => setAgents([]))
  }, [])

  async function loadAutomations() {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('automations')
        .select('id, name, description, active, trigger_type, action_nodes, conditions, fire_count, last_fired, created_at')
        .order('created_at', { ascending: false })
      if (error) throw error
      setAutomations((data || []).filter(Boolean))
    } catch(e) {
      toast('Could not load automations: ' + e.message, '#DC2626')
      setAutomations([])
    } finally { setLoading(false) }
  }

  function openNew() {
    setSelected(null)
    setForm({ ...BLANK })
    setShowBuilder(true)
  }

  function openEdit(automation) {
    setSelected(automation)
    setForm({
      name:           automation.name           || '',
      description:    automation.description    || '',
      active:         automation.active         === true,
      trigger_type:   automation.trigger_type   || '',
      trigger_config: automation.trigger_config || {},
      conditions:     automation.conditions     || [],
      action_nodes:   automation.action_nodes   || [],
    })
    setShowBuilder(true)
  }

  function closeBuilder() {
    setShowBuilder(false)
    setSelected(null)
    setForm({ ...BLANK })
  }

  async function save() {
    if (!form.name.trim())          { toast('Give this automation a name', '#DC2626'); return }
    if (!form.trigger_type)         { toast('Select a trigger', '#DC2626'); return }
    if (!form.action_nodes?.length) { toast('Add at least one action', '#DC2626'); return }
    setSaving(true)
    try {
      const payload = {
        name:           form.name.trim(),
        description:    form.description || '',
        active:         form.active === true,
        trigger_type:   form.trigger_type,
        trigger_config: form.trigger_config || {},
        conditions:     form.conditions     || [],
        action_nodes:   form.action_nodes   || [],
        updated_at:     new Date().toISOString(),
      }
      if (selected) {
        const { data, error } = await supabase.from('automations').update(payload).eq('id', selected.id).select().single()
        if (error) throw error
        setAutomations(prev => prev.map(a => a.id === selected.id ? data : a))
        toast('✅ Automation saved')
      } else {
        const { data, error } = await supabase.from('automations').insert({ ...payload, created_by: agent?.id, created_at: new Date().toISOString() }).select().single()
        if (error) throw error
        setAutomations(prev => [data, ...prev])
        toast('✅ Automation created')
      }
      invalidateCache()
      closeBuilder()
    } catch(e) {
      toast('Save failed: ' + e.message, '#DC2626')
    } finally { setSaving(false) }
  }

  async function toggleActive(automation) {
    const nowActive = automation.active === true
    try {
      const { data, error } = await supabase.from('automations').update({ active: !nowActive, updated_at: new Date().toISOString() }).eq('id', automation.id).select().single()
      if (error) throw error
      setAutomations(prev => prev.map(a => a.id === automation.id ? data : a))
      invalidateCache()
      toast(!nowActive ? '✅ Automation activated' : 'Automation paused')
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
  }

  async function deleteAutomation() {
    if (!confirmDel) return
    try {
      const { error } = await supabase.from('automations').delete().eq('id', confirmDel.id)
      if (error) throw error
      setAutomations(prev => prev.filter(a => a.id !== confirmDel.id))
      toast('Automation deleted')
    } catch(e) { toast('Delete failed: ' + e.message, '#DC2626') }
    finally { setConfirmDel(null) }
  }

  const activeCount = automations.filter(a => a.active === true).length
  const totalRuns   = automations.reduce((s, a) => s + (a.fire_count || 0), 0)

  return (
    <div style={{ fontFamily: ff }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)' }}>Automations</div>
          <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '2px' }}>{activeCount} active · {totalRuns} total runs</div>
        </div>
        {isAdmin && <Btn onClick={openNew}>+ New Automation</Btn>}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Total',    value: automations.length,               color: '#3B82F6' },
          { label: 'Active',   value: activeCount,                      color: '#10B981' },
          { label: 'Inactive', value: automations.length - activeCount, color: '#94A3B8' },
          { label: 'Runs',     value: totalRuns,                        color: '#F5A623' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--panel)', borderRadius: '10px', border: '1px solid var(--border)', padding: '14px 16px', borderTop: "3px solid " + (s.color) }}>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text)' }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {loading && <Loading />}
      {!loading && automations.length === 0 && (
        <Empty icon="⚡" title="No automations yet"
          sub={isAdmin ? 'Create your first automation to start automating your workflow.' : 'Ask your admin to set up automations for the team.'}
          action={isAdmin && <Btn onClick={openNew}>+ Create Automation</Btn>} />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {automations.map(a => (
          <AutomationCard key={a.id} automation={a} onEdit={openEdit} onToggle={toggleActive} onDelete={setConfirmDel} onViewRuns={setViewRuns} />
        ))}
      </div>

      {/* ── BUILDER MODAL ── */}
      {showBuilder && (
        <div onClick={e => { if (e.target === e.currentTarget) closeBuilder() }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', fontFamily: ff }}>
          <div style={{ background: builderMode === 'sentence' ? '#fff' : 'var(--panel)', borderRadius: '16px', width: '100%', maxWidth: '860px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,.4)' }}>

            {/* Modal header */}
            <div style={{ padding: '16px 20px', borderBottom: "1px solid " + (builderMode === 'sentence' ? '#E2E8F0' : 'var(--border)'), display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
              <div style={{ flex: 1 }}>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Automation name..."
                  style={{ fontSize: '18px', fontWeight: 700, background: 'none', border: 'none', color: builderMode === 'sentence' ? '#1E293B' : 'var(--text)', fontFamily: ff, outline: 'none', width: '100%' }} />
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description (optional)"
                  style={{ fontSize: '12px', background: 'none', border: 'none', color: '#94A3B8', fontFamily: ff, outline: 'none', width: '100%', marginTop: '2px' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                {/* Mode toggle */}
                <div style={{ display: 'flex', background: builderMode === 'sentence' ? '#F1F5F9' : 'var(--dim)', borderRadius: '8px', padding: '3px', gap: '2px' }}>
                  {[['sentence','✏️ Sentence'],['card','📋 Card']].map(([mode, label]) => (
                    <button key={mode} onClick={() => setBuilderMode(mode)}
                      style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', background: builderMode === mode ? '#fff' : 'transparent', color: builderMode === mode ? '#1E293B' : '#94A3B8', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: ff, boxShadow: builderMode === mode ? '0 1px 3px rgba(0,0,0,.12)' : 'none', transition: 'all .15s' }}>
                      {label}
                    </button>
                  ))}
                </div>
                {/* Active toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                    style={{ width: 34, height: 18, borderRadius: '99px', background: form.active ? '#10B981' : '#CBD5E1', position: 'relative', cursor: 'pointer', transition: 'background .2s' }}>
                    <div style={{ position: 'absolute', top: 1, left: form.active ? 17 : 1, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                  </div>
                  <span style={{ fontSize: '12px', color: '#64748B' }}>{form.active ? 'Active' : 'Inactive'}</span>
                </div>
                <button onClick={closeBuilder} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94A3B8' }}>✕</button>
              </div>
            </div>

            {/* Modal body */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {builderMode === 'sentence'
                ? <SentenceBuilder form={form} onChange={setForm} agents={agents} />
                : <CardBuilder     form={form} onChange={setForm} agents={agents} />
              }
            </div>

            {/* Modal footer */}
            <div style={{ padding: '14px 20px', borderTop: "1px solid " + (builderMode === 'sentence' ? '#E2E8F0' : 'var(--border)'), display: 'flex', gap: '10px', justifyContent: 'flex-end', flexShrink: 0 }}>
              <Btn variant="secondary" onClick={closeBuilder}>Cancel</Btn>
              <Btn onClick={save} loading={saving}>{selected ? 'Save Changes' : 'Create Automation'}</Btn>
            </div>
          </div>
        </div>
      )}

      {viewRuns    && <RunHistory automation={viewRuns} onClose={() => setViewRuns(null)} />}
      <Confirm open={!!confirmDel} message={"Delete \"" + (confirmDel?.name) + "\"? This cannot be undone."} onConfirm={deleteAutomation} onCancel={() => setConfirmDel(null)} />
    </div>
  )
}
