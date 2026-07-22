// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Production Sheet
// Full Monday.com Production Sheet parity:
//   • Board view grouped by stage (Accepted Offers → Sold)
//   • Inline status editing on every row
//   • Full detail drawer with all 40+ fields across 7 tabs
//   • Group totals (GCI, production, deal count)
//   • Search, filter by year/stage/agent/side
//   • Commission tracking, CTC tracking, sign tracking
//   • Client & attorney contacts, file attachments
//   • Activity log per deal
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { authFetch } from '../lib/apiAuth'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { fmt$, fmtFull$, fmtDate, fmtDateShort, parseNum, matchSearch, getDaysUntil } from '../lib/utils'
import {
  DEAL_STAGES, CTC_STAGES, DEAL_SIDES, SALE_TYPES, PROPERTY_TYPES,
  BUYER_TYPES, SALES_SOURCES, COMMAND_STATUSES, REFERRAL_AGENTS
} from '../lib/constants'
import { Btn, Loading, Empty, Confirm, Avatar } from '../components/UI'
import { logRecordChange } from '../lib/recordActivity'
import { notifyAgent } from '../lib/notify'
import { usePageView, LastVisited } from '../components/PageViewTracking'
import { FileAttachments } from '../components/FileAttachments'
import { RecordActivity } from '../pages/ActivityLog'
import { ClickToCall } from '../components/ClickToCall'
import ContactPicker from '../components/ContactPicker'
import { FilterBar } from '../components/FilterBar'
import { ImportExport } from '../components/ImportExport'
import { loadFieldDefs, saveFieldDefs, getFieldsForEntity, labelToKey, FIELD_TYPES, invalidateFieldCache } from '../lib/customFields'
import { CustomFieldRenderer } from '../components/CustomFieldRenderer'
import { AddressAutocomplete } from '../components/AddressAutocomplete'
import { BoardLinks } from '../components/BoardLinks'
import { useAgents } from '../lib/hooks'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// ── Board design tokens (Monday-inspired palette; staff know this UI) ──
const BOARD = {
  blue:'#0073EA', green:'#00C875', purple:'#A25DDC', orange:'#FDAB3D',
  pink:'#E2445C', teal:'#00D2D2', darkGreen:'#037f4c',
  text:'#323338', sub:'#676879', page:'#F5F6F8', border:'#D0D4E4',
  cellBorder:'#E6E9EF', hover:'#F0F3FF', selected:'#DCE9FC',
  ROW_H: 46, HEAD_H: 44,
}
// Consistent stage accent colors, reused for group headers AND status pills.
const STAGE_ACCENT = {
  'Accepted Offers': BOARD.green, 'Offer Accepted': BOARD.green,
  'Under Shtar': BOARD.pink, 'Under Contract': BOARD.blue,
  'Closed': BOARD.darkGreen, 'Sold': BOARD.darkGreen,
  'Deal Fell Through': BOARD.pink, 'Negotiations': BOARD.orange,
}
const stageAccent = (label='') => {
  for (const k in STAGE_ACCENT) if (label.includes(k)) return STAGE_ACCENT[k]
  return BOARD.blue
}

// Fixed leading columns (checkbox + sticky Item). Item narrowed from 260→190
// so horizontal scrolling leaves more room for data on the right.
const COL_CHECK = 44
const COL_ITEM  = 190
const COL_OPEN  = 36

// Shared <colgroup> — the ONE place widths are declared. Rendered identically
// by the header table and every stage-group table so columns can never drift.
function BoardColgroup({ visibleCols }) {
  return (
    <colgroup>
      <col style={{ width: COL_CHECK }} />
      <col style={{ width: COL_ITEM }} />
      {visibleCols.map(c => <col key={c.key} style={{ width: c.width }} />)}
      <col style={{ width: COL_OPEN }} />
    </colgroup>
  )
}


const EXPORT_COLUMNS = [
  { key: 'addr',                 label: 'Address',              example: '123 Main St, Monsey NY 10952' },
  { key: 'unit',                 label: 'Unit',                 example: '201' },
  { key: '_agent_name',          label: 'Agent Name',           example: 'Lazer Farkas', virtual: true },
  { key: 'side',                 label: 'Side',                 example: 'Buyer' },
  { key: 'stage',                label: 'Stage',                example: 'Offer Accapted' },
  { key: 'sale_type',            label: 'Sale Type',            example: 'On Market' },
  { key: 'property_type',        label: 'Property Type',        example: 'Condo' },
  { key: 'sales_source',         label: 'Sales Source',         example: 'SOI' },
  { key: 'referral_agent',       label: 'Referral Agent',       example: 'None' },
  { key: 'production',           label: 'Production $',         example: '500000', type: 'number' },
  { key: 'gci',                  label: 'GCI $',                example: '15000', type: 'number' },
  { key: 'ao_date',              label: 'A/O Date',             example: '2026-01-15', type: 'date' },
  { key: 'contract_date',        label: 'Contract Date',        example: '2026-02-01', type: 'date' },
  { key: 'expected_close_date',  label: 'Expected Close Date',  example: '2026-03-15', type: 'date' },
  { key: 'close_date',           label: 'Close Date',           example: '2026-03-20', type: 'date' },
  { key: 'client_name',          label: 'Client Name',          example: 'John Smith' },
  { key: 'client_legal_name',    label: 'Client Legal Name',    example: 'John B Smith' },
  { key: 'client_phone',         label: 'Client Phone',         example: '8455551234' },
  { key: 'client_email',         label: 'Client Email',         example: 'client@email.com' },
  { key: 'atty_name',            label: 'Attorney Name',        example: 'Jane Atty' },
  { key: 'atty_email',           label: 'Attorney Email',       example: 'atty@law.com' },
  { key: 'command',              label: 'Command',              example: 'Done' },
  { key: 'ctc',                  label: 'Contract to Close',    example: 'Clear to close' },
  { key: 'notes',                label: 'Notes',                example: '' },
]

// ── CONSTANTS ─────────────────────────────────────────────────────

const SIGN_OPTIONS = ['Under Contract Sent', 'Sold Sign Sent']
const DEAL_STATUS_OPTIONS = ['UC', 'AO', 'Financing', 'Clear to Close', 'Closed']
const COMMISSION_OPTIONS   = ['Working on it', 'Done', 'Stuck']
const AGENT_COMM_OPTIONS   = ['Working on it', 'Done', 'Not Yet']

// Board groups match Monday.com exactly
// ── MONDAY.COM STYLE COLUMNS ─────────────────────────────────────
// Single source of truth for column geometry + alignment. The SAME list
// drives the header colgroup AND every group's row table, so headers,
// group rows, and deal rows line up exactly (no flex-vs-table drift).
// align: 'left' | 'center' | 'right' applies to BOTH header and cells.
const ALL_COLUMNS = [
  { key:'_client',             label:'Client',          width:170, type:'contacts', align:'left'   },
  { key:'_agent',              label:'Agent',           width:120, pin:true, align:'left'         },
  { key:'side',                label:'Side',            width:90,  type:'select', align:'center', options:['Buyer','Seller','Dual','Referral'] },
  { key:'stage',               label:'Stage',           width:150, type:'stage', align:'center'   },
  { key:'production',          label:'Production $',    width:120, type:'number', align:'right'   },
  { key:'gci',                 label:'GCI $',           width:100, type:'number', align:'right'   },
  { key:'ao_date',             label:'A/O Date',        width:95,  type:'date', align:'center'    },
  { key:'contract_date',       label:'Contract',        width:95,  type:'date', align:'center'    },
  { key:'expected_close_date', label:'Exp. Close',      width:95,  type:'date', align:'center'    },
  { key:'close_date',          label:'Close Date',      width:95,  type:'date', align:'center', color:'#10B981' },
  { key:'command',             label:'Command',         width:140, type:'command', align:'center' },
  { key:'ctc',                 label:'CTC',             width:140, type:'ctc', align:'center'     },
  { key:'deal_status',         label:'Deal Status',     width:110, type:'select', align:'center', options:['UC','AO','Financing','Clear to Close','Closed'] },
  { key:'sale_type',           label:'Sale Type',       width:100, align:'center'  },
  { key:'property_type',       label:'Prop Type',       width:100, align:'center'  },
  { key:'commission_received', label:'Comm Rcvd',       width:110, type:'select', align:'center', options:['Working on it','Done','Stuck'] },
  { key:'agent_commission_sent',label:'Agent Comm',     width:100, type:'select', align:'center', options:['Working on it','Done','Not Yet'] },
  { key:'sales_source',        label:'Source',          width:95, align:'center'  },
  { key:'client_legal_name',   label:'Client Legal',   width:150, align:'left'   },
  { key:'client_phone',        label:'Client Phone',    width:120, align:'left'   },
  { key:'client_email',        label:'Client Email',    width:150, align:'left'   },
  { key:'atty_name',           label:'Attorney',        width:130, align:'left'   },
  { key:'referral_agent',      label:'Referral',        width:110, align:'left'   },
  { key:'notes',               label:'Notes',           width:180, align:'left'   },
]

// Alignment resolver — falls back sensibly for custom fields by type.
function colAlign(col) {
  if (col.align) return col.align
  if (col.type === 'number' || col.type === 'currency') return 'right'
  if (['stage','select','command','ctc','date','checkbox'].includes(col.type)) return 'center'
  return 'left'
}

// Status color maps
const STATUS_COLORS = {
  'Negotiations':      '#037f4c',  'Offer Accapted': '#00b884',
  'Under Shtar':       '#bb3354',  'Under Contract': '#757575',
  'Closed':            '#225091',  'Deal Fell Through': '#ff007f',
  'Done':              '#037f4c',  'Working on it':  '#fdab3d',
  'Stuck':             '#e2445c',  'Not Yet':        '#94A3B8',
  'UC':                '#5559df',  'AO':             '#00b884',
  'Financing':         '#fdab3d',  'Clear to Close': '#037f4c',
  'Buyer':             '#0086c0',  'Seller':         '#bb3354',
  'Dual':              '#784bd1',  'Referral':       '#ff6b35',
}

function cellColor(col, val) {
  if (!val) return null
  if (col.type === 'stage' || col.type === 'command' || col.type === 'ctc' || col.type === 'select') {
    return STATUS_COLORS[val] || null
  }
  return null
}

const BOARD_GROUPS = [
  { id: 'active',        label: 'Accepted Offers', stages: ['Negotiations','Offer Accapted'], color: '#037f4c', emoji: '🤝' },
  { id: 'under_shtar',   label: 'Under Shtar',      stages: ['Under Shtar'],                   color: '#bb3354', emoji: '📝' },
  { id: 'under_contract',label: 'Under Contract',   stages: ['Under Contract'],                color: '#757575', emoji: '📋' },
  // Closed/Fell-Through groups are generated dynamically per-year at runtime (see buildYearGroups below)
  // so any year present in the data gets its own group automatically — no hardcoded year list needed.
]

// Builds "Sold — YYYY" and "Deal Fell Through — YYYY" groups for every year actually
// present in the dataset, sorted newest-first. Also returns a catch-all for deals
// with a Closed/Deal Fell Through stage but no parseable date.
function buildYearGroups(deals) {
  const closedYears = new Set()
  const fellYears   = new Set()
  let closedNoDate = 0, fellNoDate = 0

  deals.forEach(d => {
    const year = d.close_date?.slice(0,4) || d.ao_date?.slice(0,4) || d.created_at?.slice(0,4) || null
    if (d.stage === 'Closed') {
      if (year) closedYears.add(year); else closedNoDate++
    } else if (d.stage === 'Deal Fell Through') {
      if (year) fellYears.add(year); else fellNoDate++
    }
  })

  const years = [...new Set([...closedYears, ...fellYears])].sort().reverse()
  const groups = []

  years.forEach(year => {
    if (closedYears.has(year)) groups.push({ id:'closed_'+year, label:'Sold — '+year, stages:['Closed'], yearMatch:year, color:'#225091', emoji:'🎉' })
    if (fellYears.has(year))   groups.push({ id:'fell_'+year,   label:'Deal Fell Through — '+year, stages:['Deal Fell Through'], yearMatch:year, color:'#ff007f', emoji:'💔' })
  })

  // Catch-all for rows with a closed/fell-through stage but no usable date —
  // ensures nothing silently disappears from the board
  if (closedNoDate > 0) groups.push({ id:'closed_nodate', label:'Sold — No Date', stages:['Closed'], yearMatch:'__NODATE__', color:'#94A3B8', emoji:'⚪' })
  if (fellNoDate > 0)   groups.push({ id:'fell_nodate',   label:'Deal Fell Through — No Date', stages:['Deal Fell Through'], yearMatch:'__NODATE__', color:'#94A3B8', emoji:'⚪' })

  return groups
}

const BLANK = {
  addr: '', unit: '', agent_id: '', side: 'Buyer', stage: 'Negotiations',
  sale_type: 'On Market', property_type: '', sales_source: '', referral_agent: '',
  buyer_type: '',
  // Status fields
  command: '', ctc: '', deal_status: '', sign: '',
  // Dates
  ao_date: '', contract_date: '', expected_close_date: '', close_date: '',
  ctc_close_date: '',
  // Finance
  production: '', gci: '', commission_received: '', agent_commission_sent: '',
  commission_status: 'pending', collected_gci: '', collected_date: '', payment_method: '',
  // Client
  client_name: '', client_legal_name: '', client_email: '', client_phone: '',
  // Attorney
  atty_name: '', atty_email: '', agent_email: '',
  // Notes
  notes: '',
}

// ── PILL / BADGE HELPERS ──────────────────────────────────────────
function StagePill({ stage, small }) {
  const def = DEAL_STAGES.find(s => s.value === stage)
  const color = def?.hex || '#c4c4c4'
  return (
    <span style={{
      display: 'inline-block',
      padding: small ? '1px 6px' : '2px 8px',
      borderRadius: '20px',
      background: color + '22',
      color,
      fontSize: small ? '10px' : '11px',
      fontWeight: 700,
      border: "1px solid " + (color) + "44",
      whiteSpace: 'nowrap',
    }}>
      {stage || '—'}
    </span>
  )
}

function StatusDot({ value, options, color = '#94A3B8' }) {
  if (!value) return <span style={{ color: 'var(--muted)', fontSize: '11px' }}>—</span>
  return (
    <span style={{
      display: 'inline-block', padding: '1px 7px', borderRadius: '20px',
      background: color + '22', color, fontSize: '10px', fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {value}
    </span>
  )
}

// ── INLINE PICKER ─────────────────────────────────────────────────
// Click a cell → dropdown appears inline; saves immediately
function InlinePicker({ value, options, onSave, color, renderValue }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <div onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        style={{ cursor: 'pointer', userSelect: 'none' }}>
        {renderValue ? renderValue(value) : (
          <span style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: '20px',
            background: (color || '#94A3B8') + '22', color: color || '#94A3B8',
            fontSize: '10px', fontWeight: 700,
          }}>
            {value || '—'}
          </span>
        )}
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 999,
          background: 'var(--panel)', border: '1px solid var(--border)',
          borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,.18)',
          minWidth: '160px', maxHeight: '240px', overflowY: 'auto',
        }}>
          {options.map(o => {
            const val = typeof o === 'string' ? o : o.value
            const lbl = typeof o === 'string' ? o : o.label
            const hex = typeof o === 'string' ? '#64748B' : (o.hex || '#64748B')
            return (
              <div key={val}
                onClick={e => { e.stopPropagation(); onSave(val); setOpen(false) }}
                style={{
                  padding: '7px 12px', cursor: 'pointer', fontSize: '12px',
                  fontWeight: val === value ? 700 : 400,
                  color: val === value ? hex : 'var(--text)',
                  background: val === value ? hex + '11' : 'transparent',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hov)'}
                onMouseLeave={e => e.currentTarget.style.background = val === value ? hex + '11' : 'transparent'}
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: hex, flexShrink: 0 }} />
                {lbl}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── BOARD ROW ──────────────────────────────────────────────────────
// ── CLIENT LINK CELL (reusable — used by both Board and Table views) ──
// Per business rule: an agent sees client names on their OWN deals,
// but not on deals belonging to other agents. Admin/secretary see
// everything, matching this app's existing role model elsewhere.
function ClientLinkCell({ deal, width }) {
  const navigate = useNavigate()
  const { agent: me, isAdmin, canManage, can } = useAuth()
  const [showLinker, setShowLinker] = React.useState(false)
  const [localContacts, setLocalContacts] = React.useState(deal._contacts || [])
  const linkerRef = React.useRef(null)

  React.useEffect(() => { setLocalContacts(deal._contacts || []) }, [deal._contacts])

  async function refreshContacts() {
    try {
      const { data } = await supabase.from('deal_contacts')
        .select('role, contacts(id, first_name, last_name)')
        .eq('deal_id', deal.id)
      setLocalContacts((data || []).filter(r => r.contacts).map(r => ({
        id: r.contacts.id,
        name: [r.contacts.first_name, r.contacts.last_name].filter(Boolean).join(' ') || 'Unnamed',
        role: r.role,
      })))
    } catch(e) { console.warn('refreshContacts failed:', e.message) }
  }

  React.useEffect(() => {
    if (!showLinker) return
    const handler = e => { if (linkerRef.current && !linkerRef.current.contains(e.target)) setShowLinker(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showLinker])

  const canSeeClient = isAdmin || canManage || deal.agent_id === me?.id
  const contacts = localContacts

  return (
    <td style={{ height: 40, padding: 0, borderRight: '1px solid #e6e9ef', width, minWidth: width, position: 'relative', overflow: 'visible' }}>
      <div style={{ display: 'flex', alignItems: 'center', height: 40, padding: '0 10px', gap: 4, overflow: 'hidden' }}>
        {!canSeeClient && contacts.length > 0 && (
          <span style={{ color: '#c5c7d0', fontSize: 12 }} title="Private — another agent's deal">🔒</span>
        )}
        {canSeeClient && contacts.length === 0 && (
          <span onClick={e => { e.stopPropagation(); setShowLinker(true) }}
            style={{ color: '#0086c0', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
            + Add
          </span>
        )}
        {canSeeClient && contacts.map((c, i) => (
          <span key={c.id}
            onClick={e => { e.stopPropagation(); navigate('/contacts/' + c.id + '/detail') }}
            title={c.role ? c.role : ''}
            style={{ fontSize: 12, color: '#0086c0', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', whiteSpace: 'nowrap' }}>
            {c.name}{i < contacts.length - 1 ? ',' : ''}
          </span>
        ))}
        {canSeeClient && contacts.length > 0 && (
          <span onClick={e => { e.stopPropagation(); setShowLinker(true) }}
            title="Manage linked contacts"
            style={{ color: '#8B93A1', fontSize: 12, cursor: 'pointer', marginLeft: 2, flexShrink: 0 }}>
            ✎
          </span>
        )}
      </div>
      {showLinker && (
        <div ref={linkerRef} onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: '100%', left: 0, zIndex: 500,
            background: 'var(--panel)', border: '1px solid var(--border)',
            borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,.2)',
            width: 'min(340px, 92vw)', maxHeight: 420, overflowY: 'auto', padding: 14,
          }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>
            Linked Contacts
          </div>
          <DealContactsPanel dealId={deal.id} agentId={deal.agent_id} onChange={refreshContacts} />
        </div>
      )}
    </td>
  )
}

// ── MONDAY.COM CELL ──────────────────────────────────────────────
// Financial/commission/private columns hidden from agents on OTHER agents' deals.
const SENSITIVE_COLS = new Set([
  'gci','expected_gci','collected_gci','commission_received','agent_commission_sent',
  'commission_status','payment_method','atty_name','atty_email',
])
function MondayCell({ col, deal, onQuickUpdate, agents }) {
  const navigate = useNavigate()
  const { agent: me, isAdmin, canManage, can } = useAuth()
  const [editing, setEditing] = React.useState(false)
  const [val, setVal] = React.useState('')
  const ref = React.useRef(null)
  const raw = col.custom ? (deal.custom_data || {})[col.key] : deal[col.key]

  const isOwn = deal.agent_id === me?.id
  const canEdit = isAdmin || canManage || isOwn
  // Non-admins may not see sensitive fields on another agent's deal.
  const sensitiveHidden = SENSITIVE_COLS.has(col.key) && !(isAdmin || canManage || isOwn)

  function startEdit(e) {
    e.stopPropagation()
    if (!canEdit) return   // read-only for other agents' deals; no inline edit
    setVal(raw || '')
    setEditing(true)
    setTimeout(() => ref.current && ref.current.focus(), 20)
  }
  function save() {
    setEditing(false)
    if (String(val) !== String(raw || '')) onQuickUpdate(deal, col.key, val, col.custom)
  }
  function cancel() { setEditing(false) }

  const base = {
    display: 'flex', alignItems: 'center', justifyContent: colAlign(col) === 'right' ? 'flex-end' : colAlign(col) === 'left' ? 'flex-start' : 'center',
    height: BOARD.ROW_H, padding: '0 10px', fontSize: 13, fontWeight: 500, cursor: 'default',
    boxSizing: 'border-box', overflow: 'hidden', position: 'relative',
  }

  // Agent cell
  // Client cell — linked contacts, clickable to open the full record.
  // Per business rule: an agent sees client names on their OWN deals,
  // but not on deals belonging to other agents. Admin/secretary see
  // everything, matching this app's existing role model elsewhere.
  if (col.key === '_client') {
    return <ClientLinkCell deal={deal} width={col.width} />
  }

  if (col.key === '_agent') {
    const ag = agents.find(a => a.id === deal.agent_id)
    const agentOptions = agents.map(a => ({ value: a.id, label: a.name, hex: a.color || '#0086c0' }))
    const initials = ag ? ag.name.split(' ').map(p => p[0]).slice(0,2).join('').toUpperCase() : '?'
    return (
      <td style={{ height: BOARD.ROW_H, padding: 0, borderRight: '1px solid ' + BOARD.cellBorder, verticalAlign: 'middle', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', height: BOARD.ROW_H, padding: '0 10px', gap: 8, cursor: 'pointer', justifyContent: 'flex-start' }} onClick={e => e.stopPropagation()}>
          <InlinePicker
            value={deal.agent_id}
            options={agentOptions}
            color={ag?.color}
            onSave={v => onQuickUpdate(deal, 'agent_id', v, false)}
            renderValue={() => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {/* Fixed 28px circular avatar / initials — flex-shrink:0 prevents zigzag */}
                <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: ag ? (ag.color || BOARD.blue) : '#c5c7d0' }}>
                  {ag && ag.photo_url
                    ? <img src={ag.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    : <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, lineHeight: 1 }}>{initials}</span>}
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 500, color: ag ? BOARD.text : '#c5c7d0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ag ? ag.name.split(' ')[0] : 'No agent'}
                </span>
              </div>
            )}
          />
        </div>
      </td>
    )
  }

  // Sensitive (financial/commission/private) column on another agent's deal → masked.
  if (sensitiveHidden) {
    return (
      <td style={{ height: BOARD.ROW_H, padding: 0, borderRight: '1px solid ' + BOARD.cellBorder, verticalAlign: 'middle', overflow: 'hidden' }}>
        <div style={{ ...base, color: '#c5c7d0', justifyContent: col.type === 'number' ? 'flex-end' : 'center' }} title="Hidden — another agent's deal">
          <span style={{ fontSize: 12 }}>—</span>
        </div>
      </td>
    )
  }

  // Status/stage/command/ctc cells — colored pill
  if (['stage','command','ctc'].includes(col.type) || col.type === 'select') {
    const optionsMap = {
      stage:   DEAL_STAGES,
      command: COMMAND_STATUSES.filter(c => c.value),
      ctc:     CTC_STAGES,
      select:  (col.options||[]).map(o => ({ value:o, label:o, hex: STATUS_COLORS[o] })),
    }
    const opts = optionsMap[col.type] || []
    const found = opts.find(o => o.value === raw)
    const bg = found?.hex || cellColor(col, raw) || '#c5c7d0'
    return (
      <td style={{ height: BOARD.ROW_H, padding: 0, borderRight: '1px solid ' + BOARD.cellBorder, verticalAlign: 'middle', overflow: 'hidden' }}>
        <div style={{ ...base, overflow: 'visible', cursor: 'pointer' }} onClick={e => e.stopPropagation()}>
          <InlinePicker value={raw} options={opts} color={bg}
            onSave={v => onQuickUpdate(deal, col.key, v, col.custom)} />
        </div>
      </td>
    )
  }

  // Checkbox cell (custom fields)
  if (col.type === 'checkbox') {
    return (
      <td style={{ height: BOARD.ROW_H, padding: 0, borderRight: '1px solid ' + BOARD.cellBorder, verticalAlign: 'middle', overflow: 'hidden' }}>
        <div style={{ ...base, cursor: 'pointer' }} onClick={e => { e.stopPropagation(); onQuickUpdate(deal, col.key, !raw, col.custom) }}>
          <div style={{ width: 18, height: 18, borderRadius: 4, border: '2px solid ' + (raw ? '#0073ea' : '#c5c7d0'), background: raw ? '#0073ea' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {raw && <span style={{ color: '#fff', fontSize: 11, fontWeight: 900 }}>✓</span>}
          </div>
        </div>
      </td>
    )
  }

  // Number / currency cell
  if (col.type === 'number' || col.type === 'currency') {
    if (editing) return (
      <td style={{ height: BOARD.ROW_H, padding: 0, borderRight: '1px solid ' + BOARD.cellBorder, verticalAlign: 'middle', overflow: 'hidden' }}>
        <input ref={ref} type="number" value={val} onChange={e => setVal(e.target.value)}
          onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
          style={{ width: '100%', height: BOARD.ROW_H, padding: '0 10px', border: '2px solid ' + BOARD.blue, outline: 'none', fontSize: 13, fontFamily: ff, textAlign: 'right', background: '#fff', color: BOARD.text, boxSizing: 'border-box' }} />
      </td>
    )
    return (
      <td style={{ height: BOARD.ROW_H, padding: 0, borderRight: '1px solid ' + BOARD.cellBorder, verticalAlign: 'middle', overflow: 'hidden' }} onClick={startEdit}>
        <div style={{ ...base, cursor: 'text', justifyContent: 'flex-end', color: col.key === 'gci' ? '#037f4c' : '#323338', fontWeight: raw ? 600 : 400 }}>
          {raw ? fmtFull$(parseNum(raw)) : <span style={{ color: '#c5c7d0' }}>—</span>}
        </div>
      </td>
    )
  }

  // Date cell
  if (col.type === 'date') {
    const display = raw ? fmtDateShort(raw) : null
    const days = col.key === 'expected_close_date' && raw ? getDaysUntil(raw) : null
    const overdue = days !== null && days < 0
    const urgent  = days !== null && days >= 0 && days <= 7
    if (editing) return (
      <td style={{ height: BOARD.ROW_H, padding: 0, borderRight: '1px solid ' + BOARD.cellBorder, verticalAlign: 'middle', overflow: 'hidden' }}>
        <input ref={ref} type="date" value={val} onChange={e => setVal(e.target.value)}
          onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
          style={{ width: '100%', height: BOARD.ROW_H, padding: '0 8px', border: '2px solid ' + BOARD.blue, outline: 'none', fontSize: 12, fontFamily: ff, background: '#fff', color: BOARD.text, boxSizing: 'border-box' }} />
      </td>
    )
    return (
      <td style={{ height: BOARD.ROW_H, padding: 0, borderRight: '1px solid ' + BOARD.cellBorder, verticalAlign: 'middle', overflow: 'hidden' }} onClick={startEdit}>
        <div style={{ ...base, cursor: 'text', color: overdue ? '#e2445c' : urgent ? '#fdab3d' : (col.color || '#323338'), fontWeight: (overdue || urgent) ? 700 : 400 }}>
          {display || <span style={{ color: '#c5c7d0' }}>—</span>}
          {days !== null && days >= 0 && days <= 14 && (
            <span style={{ marginLeft: 4, fontSize: 10, opacity: .75 }}>({days}d)</span>
          )}
        </div>
      </td>
    )
  }

  // Text cell (default)
  if (editing) return (
    <td style={{ height: BOARD.ROW_H, padding: 0, borderRight: '1px solid ' + BOARD.cellBorder, verticalAlign: 'middle', overflow: 'hidden' }}>
      <input ref={ref} value={val} onChange={e => setVal(e.target.value)}
        onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
        style={{ width: '100%', height: BOARD.ROW_H, padding: '0 10px', border: '2px solid ' + BOARD.blue, outline: 'none', fontSize: 13, fontFamily: ff, background: '#fff', color: BOARD.text, boxSizing: 'border-box' }} />
    </td>
  )
  return (
    <td style={{ height: BOARD.ROW_H, padding: 0, borderRight: '1px solid ' + BOARD.cellBorder, verticalAlign: 'middle', overflow: 'hidden' }} onClick={startEdit}>
      <div style={{ ...base, cursor: 'text', color: '#323338', justifyContent: 'flex-start' }}>
        {raw || <span style={{ color: '#c5c7d0' }}>—</span>}
      </div>
    </td>
  )
}

// ── MONDAY.COM ROW ────────────────────────────────────────────────
function DealRow({ deal, agents, onOpen, onQuickUpdate, isAdmin, isSelected, onToggleSelect, visibleCols, onDealDragStart, onDealDropOnRow }) {
  const [hover, setHover] = React.useState(false)
  const [dragOverRow, setDragOverRow] = React.useState(false)
  const rowBg = isSelected ? BOARD.selected : hover ? BOARD.hover : '#fff'

  return (
    <tr
      draggable={!!onDealDragStart}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', deal.id); onDealDragStart?.(deal.id) }}
      onDragOver={e => { if (onDealDropOnRow) { e.preventDefault(); e.stopPropagation() } }}
      onDragEnter={e => { if (onDealDropOnRow) { e.preventDefault(); e.stopPropagation(); setDragOverRow(true) } }}
      onDragLeave={() => setDragOverRow(false)}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragOverRow(false); onDealDropOnRow?.(deal) }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ height: BOARD.ROW_H, background: rowBg, boxShadow: dragOverRow ? 'inset 0 2px 0 ' + BOARD.blue : 'none', borderBottom: '1px solid ' + BOARD.cellBorder, transition: 'background .08s' }}>

      {/* Checkbox + color bar + drag handle */}
      <td style={{ padding: 0, borderRight: '1px solid ' + BOARD.cellBorder, verticalAlign: 'middle', position: 'sticky', left: 0, background: rowBg, zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', height: BOARD.ROW_H, paddingLeft: 4, gap: 3 }}>
          <span title="Drag to change stage" style={{ cursor: 'grab', color: '#c5c7d0', fontSize: 11, opacity: hover ? 1 : 0, transition: 'opacity .1s', width: 10, flexShrink: 0, userSelect: 'none' }}>⠿</span>
          <div style={{ width: 3, height: 26, borderRadius: 2, background: BOARD.blue, opacity: hover || isSelected ? 1 : 0, transition: 'opacity .1s', flexShrink: 0 }} />
          <div onClick={e => { e.stopPropagation(); onToggleSelect(deal.id) }}
            style={{ width: 16, height: 16, borderRadius: 3, border: '2px solid ' + (isSelected ? BOARD.blue : '#c5c7d0'), background: isSelected ? BOARD.blue : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'all .1s' }}>
            {isSelected && <span style={{ color: '#fff', fontSize: 9, fontWeight: 900, lineHeight: 1 }}>✓</span>}
          </div>
        </div>
      </td>

      {/* Address — sticky item column, single line, tooltip on hover */}
      <td onClick={() => onOpen(deal)} title={(deal.addr || '') + (deal.unit ? ' #' + deal.unit : '')}
        style={{ padding: '0 12px', height: BOARD.ROW_H, borderRight: '1px solid ' + BOARD.cellBorder, verticalAlign: 'middle', position: 'sticky', left: COL_CHECK, background: rowBg, zIndex: 2, cursor: 'pointer', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', height: BOARD.ROW_H, fontSize: 13, fontWeight: 600, color: BOARD.text, overflow: 'hidden' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {deal.addr}
            {deal.unit && <span style={{ color: BOARD.sub, fontWeight: 400 }}> #{deal.unit}</span>}
          </span>
        </div>
      </td>

      {/* Dynamic columns */}
      {visibleCols.map(col => (
        <MondayCell key={col.key} col={col} deal={deal} onQuickUpdate={onQuickUpdate} agents={agents} />
      ))}

      {/* Open icon */}
      <td style={{ width: 36, padding: 0, borderRight: '1px solid ' + BOARD.cellBorder, verticalAlign: 'middle' }} onClick={() => onOpen(deal)}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: BOARD.ROW_H, cursor: 'pointer', opacity: hover ? 1 : 0, transition: 'opacity .1s', color: BOARD.sub, fontSize: 14 }}>
          ↗
        </div>
      </td>
    </tr>
  )
}


// ── MONDAY.COM GROUP ─────────────────────────────────────────────
function BoardGroup({ group, deals, agents, onOpen, onQuickUpdate, isAdmin, selectedIds, onToggleSelect, onSelectAll, visibleCols, onAddDeal, onRename, onDealDragStart, onDropDeal, isDragOver, onDragEnterGroup, onDragLeaveGroup, onDealDropOnRow, collapseSignal }) {
  const { can } = useAuth()
  // Group GCI total spans all agents in the group → requires TEAM gci permission.
  // Production volume stays visible to everyone (goal-driven team visibility).
  const showGci = can('deals.view_team_gci')
  const [collapsed, setCollapsed] = React.useState(false)
  // Sync to collapse-all / expand-all signal (still individually toggleable after).
  React.useEffect(() => {
    if (collapseSignal && collapseSignal.n > 0) setCollapsed(collapseSignal.collapsed)
  }, [collapseSignal?.n])
  const [renaming,  setRenaming]  = React.useState(false)
  const [renameVal, setRenameVal] = React.useState(group.label)
  const totalGCI  = deals.reduce((s, d) => s + parseNum(d.gci), 0)
  const totalProd = deals.reduce((s, d) => s + parseNum(d.production), 0)
  const allSelected = deals.length > 0 && deals.every(d => selectedIds.includes(d.id))

  const headerBg = group.color || stageAccent(group.label)

  return (
    <div
      onDragOver={e => { if (onDropDeal) e.preventDefault() }}
      onDragEnter={e => { e.preventDefault(); onDragEnterGroup?.() }}
      onDragLeave={onDragLeaveGroup}
      onDrop={e => { e.preventDefault(); onDropDeal?.() }}
      style={{ marginBottom: 0, outline: isDragOver ? '2px solid #0073ea' : 'none', outlineOffset: -2, transition: 'outline .1s' }}>
      {/* ── Group header row (sticky below the column header) ── */}
      <div style={{ display: 'flex', alignItems: 'center', height: BOARD.HEAD_H, background: headerBg + '12', borderTop: '1px solid ' + BOARD.cellBorder, borderBottom: '1px solid ' + BOARD.cellBorder, borderLeft: '3px solid ' + headerBg, userSelect: 'none', position: 'sticky', top: BOARD.HEAD_H, zIndex: 5 }}>
        {/* Checkbox */}
        <div style={{ width: 50, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <div onClick={e => { e.stopPropagation(); onSelectAll(deals.map(d => d.id)) }}
            style={{ width: 16, height: 16, borderRadius: 3, border: '2px solid ' + (allSelected ? '#0073ea' : '#c5c7d0'), background: allSelected ? '#0073ea' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            {allSelected && <span style={{ color: '#fff', fontSize: 9, fontWeight: 900, lineHeight: 1 }}>✓</span>}
          </div>
        </div>

        {/* Collapse arrow */}
        <div onClick={() => setCollapsed(c => !c)}
          style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#676879', fontSize: 12, flexShrink: 0, transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)', transition: 'transform .15s' }}>
          ▾
        </div>

        {/* Color dot */}
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: headerBg, marginRight: 8, flexShrink: 0 }} />

        {/* Group name */}
        {renaming ? (
          <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
            onBlur={() => { setRenaming(false); if (renameVal.trim() && onRename) onRename(renameVal.trim()) }}
            onKeyDown={e => { if (e.key === 'Enter') { setRenaming(false); if (renameVal.trim() && onRename) onRename(renameVal.trim()) } if (e.key === 'Escape') setRenaming(false) }}
            style={{ fontSize: 14, fontWeight: 700, color: headerBg, background: 'transparent', border: 'none', borderBottom: '2px solid ' + headerBg, outline: 'none', fontFamily: ff, minWidth: 120 }} />
        ) : (
          <span onDoubleClick={() => { setRenaming(true); setRenameVal(group.label) }}
            style={{ fontSize: 14, fontWeight: 700, color: headerBg, cursor: 'pointer' }}
            title="Double-click to rename">
            {group.label}
          </span>
        )}

        {/* Count badge */}
        <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: headerBg, background: headerBg + '20', padding: '2px 8px', borderRadius: 20 }}>
          {deals.length}
        </span>

        {/* Totals */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 20, alignItems: 'center', paddingRight: 16, fontSize: 12, color: '#676879' }}>
          {showGci && <span>GCI: <strong style={{ color: '#037f4c' }}>{fmtFull$(totalGCI)}</strong></span>}
          <span>Vol: <strong style={{ color: '#323338' }}>{fmtFull$(totalProd)}</strong></span>
        </div>
      </div>

      {/* ── Rows ── */}
      {!collapsed && (
        <div style={{ borderBottom: '1px solid ' + BOARD.cellBorder }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', background: '#fff' }}>
            <BoardColgroup visibleCols={visibleCols} />
            <tbody>
              {deals.map(d => (
                <DealRow key={d.id} deal={d} agents={agents} onOpen={onOpen} onQuickUpdate={onQuickUpdate}
                  isAdmin={isAdmin} isSelected={selectedIds.includes(d.id)}
                  onToggleSelect={onToggleSelect} visibleCols={visibleCols}
                  onDealDragStart={onDealDragStart}
                  onDealDropOnRow={onDealDropOnRow ? (targetDeal) => onDealDropOnRow(targetDeal, group) : undefined} />
              ))}
            </tbody>
            {/* Totals footer */}
            {deals.length > 0 && (
              <tfoot>
                <tr style={{ background: BOARD.page, borderTop: '2px solid ' + BOARD.border }}>
                  <td style={{ borderRight: '1px solid ' + BOARD.cellBorder, height: 34 }} />
                  <td style={{ padding: '0 12px', borderRight: '1px solid ' + BOARD.cellBorder, fontSize: 11, color: BOARD.sub, fontWeight: 700 }}>
                    {deals.length} item{deals.length !== 1 ? 's' : ''}
                  </td>
                  {visibleCols.map(col => (
                    <td key={col.key} style={{ height: 34, padding: '0 10px', borderRight: '1px solid ' + BOARD.cellBorder, textAlign: colAlign(col), fontSize: 12, fontWeight: 700, overflow: 'hidden' }}>
                      {col.key === 'production' ? <span style={{ color: BOARD.text }}>{fmtFull$(totalProd)}</span>
                       : col.key === 'gci' ? (showGci ? <span style={{ color: BOARD.darkGreen }}>{fmtFull$(totalGCI)}</span> : '')
                       : ''}
                    </td>
                  ))}
                  <td style={{ borderRight: '1px solid ' + BOARD.cellBorder }} />
                </tr>
              </tfoot>
            )}
          </table>

          {/* Add item row */}
          <div onClick={() => onAddDeal && onAddDeal(group)}
            style={{ display: 'flex', alignItems: 'center', height: 38, paddingLeft: COL_CHECK + 12, cursor: 'pointer', borderTop: '1px solid ' + BOARD.cellBorder, background: '#fff', gap: 6, color: BOARD.sub, fontSize: 13 }}
            onMouseEnter={e => e.currentTarget.style.background = BOARD.page}
            onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
            <span style={{ fontSize: 16, fontWeight: 700, color: headerBg }}>+</span>
            <span style={{ color: BOARD.sub }}>Add deal</span>
          </div>
        </div>
      )}
    </div>
  )
}


// ── DEAL CONTACTS PANEL ──────────────────────────────────────────
// Displays linked contacts for a deal and lets agents add/remove them
const CONTACT_ROLES = ['Client','Buyer','Seller','Co-Buyer','Co-Seller','Attorney','Mortgage Broker','Lender','Title Company','Referral Source','Other']

function DealContactsPanel({ dealId, agentId, onChange }) {
  const { toast } = useApp()
  const [linked,    setLinked]    = useState([])   // { id, role, contacts: {...} }
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [results,   setResults]   = useState([])
  const [searching, setSearching] = useState(false)
  const [addRole,   setAddRole]   = useState('Client')
  const [showNewForm, setShowNewForm] = useState(false)
  const [newContact,  setNewContact]  = useState({ phone: '', email: '' })
  const searchTimer = useRef(null)

  useEffect(() => { if (dealId) loadLinked() }, [dealId])

  async function loadLinked() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('deal_contacts')
        .select('id, role, contact_id, contacts(id, first_name, last_name, phone, email, status)')
        .eq('deal_id', dealId)
        .order('created_at')
      setLinked(data || [])
    } catch { setLinked([]) }
    finally { setLoading(false) }
  }

  async function searchContacts(q) {
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    const { data } = await supabase.from('contacts')
      .select('id, first_name, last_name, phone, email, status')
      .or('first_name.ilike.%' + q + '%,last_name.ilike.%' + q + '%,phone.ilike.%' + q + '%,email.ilike.%' + q + '%')
      .limit(8)
    setResults(data || [])
    setSearching(false)
  }

  function onSearchChange(e) {
    const q = e.target.value
    setSearch(q)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => searchContacts(q), 250)
  }

  async function createAndAddContact() {
    const trimmed = search.trim()
    if (!trimmed) return
    const parts = trimmed.split(' ')
    const first_name = parts[0]
    const last_name = parts.slice(1).join(' ') || null
    try {
      // Duplicate-phone check, same as db.contacts.create() -- don't
      // silently create a second record for someone who already
      // exists, link to the existing one instead.
      const phone = newContact.phone.trim()
      if (phone) {
        const d10 = phone.replace(/\D/g, '').slice(-10)
        if (d10.length === 10) {
          // Same bug as lookupContact in api/_lib/phone.js: contacts
          // are stored formatted like "(845) 424-1014", so searching
          // only the raw digit string can never match.
          const area = d10.slice(0,3), mid = d10.slice(3,6), last = d10.slice(6)
          const variants = [d10, '(' + area + ') ' + mid + '-' + last, area + '-' + mid + '-' + last, area + '.' + mid + '.' + last, area + ' ' + mid + ' ' + last]
          const orClause = variants.map(v => 'phone.ilike.%' + v + '%').join(',')
          const { data: existing } = await supabase.from('contacts')
            .select('id, first_name, last_name').or(orClause).limit(1).maybeSingle()
          if (existing) {
            toast('Already exists as ' + (existing.first_name||'') + ' ' + (existing.last_name||'') + ' — linking to that contact instead', '#F5A623')
            setShowNewForm(false); setNewContact({ phone:'', email:'' })
            await addContact(existing)
            return
          }
        }
      }
      const { data: newC, error } = await supabase.from('contacts')
        .insert({
          first_name, last_name, agent_id: agentId, status: 'New',
          phone: newContact.phone.trim() || null,
          email: newContact.email.trim() || null,
          created_at: new Date().toISOString(),
        })
        .select().single()
      if (error) throw error
      setShowNewForm(false)
      setNewContact({ phone: '', email: '' })
      await addContact(newC)
    } catch(e) { toast('Failed to create contact: ' + e.message, '#DC2626') }
  }

  async function addContact(contact) {
    if (linked.some(l => l.contact_id === contact.id)) {
      toast('Already linked', '#F5A623'); return
    }
    try {
      const { error } = await supabase.from('deal_contacts').insert({ deal_id: dealId, contact_id: contact.id, role: addRole })
      if (error) throw error
      setSearch(''); setResults([])
      await loadLinked()
      onChange?.()
      toast('✅ Contact linked')
    } catch(e) { toast('Failed to link contact: ' + e.message, '#DC2626') }
  }

  async function removeContact(linkId) {
    try {
      const { error } = await supabase.from('deal_contacts').delete().eq('id', linkId)
      if (error) throw error
      setLinked(prev => prev.filter(l => l.id !== linkId))
      onChange?.()
      toast('Contact removed')
    } catch(e) { toast('Failed to remove: ' + e.message, '#DC2626') }
  }

  async function updateRole(linkId, role) {
    try {
      const { error } = await supabase.from('deal_contacts').update({ role }).eq('id', linkId)
      if (error) throw error
      setLinked(prev => prev.map(l => l.id === linkId ? { ...l, role } : l))
      onChange?.()
    } catch(e) { toast('Failed to update role: ' + e.message, '#DC2626') }
  }

  const STATUS_COLORS = { Hot:'#DC2626', Warm:'#F5A623', Cold:'#3B82F6', Active:'#10B981', New:'#8B5CF6' }

  return (
    <div>
      {/* Linked contacts list */}
      {loading && <div style={{ fontSize:'12px', color:'var(--muted)', padding:'8px 0' }}>Loading...</div>}
      {!loading && linked.length === 0 && (
        <div style={{ fontSize:'12px', color:'var(--muted)', fontStyle:'italic', marginBottom:'12px' }}>
          No contacts linked yet — search below to add.
        </div>
      )}
      {linked.map(link => {
        const c = link.contacts
        if (!c) return null
        return (
          <div key={link.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 10px', background:'var(--dim)', borderRadius:'8px', border:'1px solid var(--border)', marginBottom:'6px' }}>
            {/* Avatar circle */}
            <div style={{ width:32, height:32, borderRadius:'50%', background: STATUS_COLORS[c.status] || '#94A3B8', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:'12px', fontWeight:800, color:'#fff' }}>
              {(c.first_name?.[0] || '') + (c.last_name?.[0] || '')}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:'13px', fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {c.first_name} {c.last_name}
              </div>
              <div style={{ fontSize:'11px', color:'var(--muted)' }}>{c.phone || c.email || '—'}</div>
            </div>
            {/* Role selector */}
            <select value={link.role || 'Client'} onChange={e => updateRole(link.id, e.target.value)}
              style={{ padding:'3px 6px', borderRadius:'6px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'11px', fontFamily:ff }}>
              {CONTACT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            {/* Status badge */}
            {c.status && <span style={{ fontSize:'10px', padding:'1px 6px', borderRadius:'10px', background:(STATUS_COLORS[c.status]||'#94A3B8')+'22', color: STATUS_COLORS[c.status]||'#94A3B8', fontWeight:700, flexShrink:0 }}>{c.status}</span>}
            {/* Remove */}
            <button onClick={() => removeContact(link.id)}
              style={{ background:'none', border:'none', cursor:'pointer', color:'#DC2626', fontSize:'14px', flexShrink:0 }}>✕</button>
          </div>
        )
      })}

      {/* Search to add */}
      <div style={{ marginTop:'10px', position:'relative' }}>
        <div style={{ fontSize:'11px', fontWeight:700, color:'var(--muted)', marginBottom:'6px', textTransform:'uppercase', letterSpacing:'.06em' }}>Add Contact</div>
        <div style={{ display:'flex', flexDirection:'column', gap:'6px', marginBottom:'6px' }}>
          <input
            value={search}
            onChange={onSearchChange}
            placeholder="Search by name, phone, email..."
            style={{ width:'100%', padding:'8px 10px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff, outline:'none', boxSizing:'border-box' }}
          />
          <select value={addRole} onChange={e => setAddRole(e.target.value)}
            style={{ width:'100%', padding:'8px 10px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'12px', fontFamily:ff, boxSizing:'border-box' }}>
            {CONTACT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        {/* Search results dropdown */}
        {(results.length > 0 || searching || search.trim()) && (
          <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'9px', boxShadow:'0 8px 24px rgba(0,0,0,.15)', overflow:'hidden' }}>
            {searching && <div style={{ padding:'10px 14px', fontSize:'12px', color:'var(--muted)' }}>Searching...</div>}
            {results.map(c => (
              <div key={c.id}
                onClick={() => addContact(c)}
                style={{ display:'flex', alignItems:'center', gap:'10px', padding:'9px 14px', cursor:'pointer', borderBottom:'1px solid var(--border)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hov)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                <div style={{ width:28, height:28, borderRadius:'50%', background: STATUS_COLORS[c.status]||'#94A3B8', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:800, color:'#fff', flexShrink:0 }}>
                  {(c.first_name?.[0]||'') + (c.last_name?.[0]||'')}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'13px', fontWeight:600, color:'var(--text)' }}>{c.first_name} {c.last_name}</div>
                  <div style={{ fontSize:'11px', color:'var(--muted)' }}>{c.phone || c.email || '—'}</div>
                </div>
                {c.status && <span style={{ fontSize:'10px', color: STATUS_COLORS[c.status]||'#94A3B8', fontWeight:700 }}>{c.status}</span>}
                <span style={{ fontSize:'11px', color:'var(--brand)', fontWeight:700 }}>+ Add</span>
              </div>
            ))}
            {!searching && search.trim() && !showNewForm && (
              <div onClick={() => setShowNewForm(true)}
                style={{ display:'flex', alignItems:'center', gap:'10px', padding:'9px 14px', cursor:'pointer', color:'var(--brand)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hov)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                <span style={{ fontSize:'14px' }}>+</span>
                <span style={{ fontSize:'13px', fontWeight:600 }}>Create "{search.trim()}" as a new contact</span>
              </div>
            )}
            {showNewForm && (
              <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:'8px' }}>
                <div style={{ fontSize:'12px', fontWeight:700, color:'var(--muted)' }}>New contact: {search.trim()}</div>
                <input value={newContact.phone} onChange={e => setNewContact(p => ({ ...p, phone: e.target.value }))}
                  placeholder="Phone (optional)"
                  style={{ width:'100%', padding:'7px 10px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff, outline:'none', boxSizing:'border-box' }} />
                <input value={newContact.email} onChange={e => setNewContact(p => ({ ...p, email: e.target.value }))}
                  placeholder="Email (optional)"
                  style={{ width:'100%', padding:'7px 10px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff, outline:'none', boxSizing:'border-box' }} />
                <div style={{ display:'flex', gap:'8px', marginTop:'4px' }}>
                  <button onClick={createAndAddContact}
                    style={{ flex:1, padding:'8px', borderRadius:'7px', border:'none', background:'var(--brand)', color:'#fff', fontSize:'13px', fontWeight:700, cursor:'pointer' }}>
                    Create &amp; Link
                  </button>
                  <button onClick={() => setShowNewForm(false)}
                    style={{ padding:'8px 12px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--panel)', color:'var(--muted)', fontSize:'13px', cursor:'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── DEAL DETAIL DRAWER ─────────────────────────────────────────────
function DealDrawer({ deal, agents, onSave, onClose, onDelete, saving, isAdmin, canManage, readOnly = false }) {
  const { can, agent: me } = useAuth()
  // Own deal? Agents see financial/private info only on their own deals.
  const isOwn = !deal || deal.agent_id === me?.id
  const canViewFinance = isAdmin || canManage || (can('deals.view_gci') && isOwn)
  const showGciField = canViewFinance
  const [form, setForm] = useState(() => ({ ...BLANK, ...deal }))
  const [tab,  setTab]  = useState('deal')
  const [confirmDel, setConfirmDel] = useState(false)
  const set = (k, v) => { if (readOnly) return; setForm(f => ({ ...f, [k]: v })) }

  useEffect(() => { setForm({ ...BLANK, ...deal }) }, [deal?.id])

  const TABS = [
    { id: 'deal',          label: '📋 Deal' },
    { id: 'status',        label: '🔄 Status' },
    { id: 'contacts',      label: '👥 Contacts' },
    { id: 'linked',        label: '🔗 Linked Contacts' },
    { id: 'finance',       label: '💰 Finance' },
    { id: 'ctc',           label: '📆 Contract' },
    { id: 'files',         label: '📎 Files' },
    { id: 'activity',      label: '📜 Activity' },
  ]

  const Lbl = ({ children, required }) => (
    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '4px' }}>
      {children}{required && <span style={{ color: '#DC2626' }}> *</span>}
    </div>
  )
  const Inp = ({ k, type = 'text', placeholder, half }) => (
    <input type={type} value={form[k] ?? ''} onChange={e => set(k, e.target.value)} placeholder={placeholder} disabled={readOnly} readOnly={readOnly}
      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: readOnly ? 'var(--dim)' : 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff, boxSizing: 'border-box', cursor: readOnly ? 'not-allowed' : 'text' }} />
  )
  const Sel = ({ k, options, placeholder }) => (
    <select value={form[k] ?? ''} onChange={e => set(k, e.target.value)} disabled={readOnly}
      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: readOnly ? 'var(--dim)' : 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff, cursor: readOnly ? 'not-allowed' : 'pointer' }}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => {
        const val = typeof o === 'string' ? o : o.value
        const lbl = typeof o === 'string' ? o : o.label
        return <option key={val} value={val}>{lbl}</option>
      })}
    </select>
  )
  const Grid2 = ({ children }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
      {children}
    </div>
  )
  const Field = ({ label, children, required, span }) => (
    <div style={{ gridColumn: span ? 'span 2' : undefined }}>
      <Lbl required={required}>{label}</Lbl>
      {children}
    </div>
  )
  const SectionHdr = ({ children }) => (
    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', margin: '16px 0 10px', paddingBottom: '6px', borderBottom: '1px solid var(--border)' }}>
      {children}
    </div>
  )

  // Days to close indicator
  const daysToClose = form.expected_close_date ? getDaysUntil(form.expected_close_date) : null
  const stageHex = DEAL_STAGES.find(s => s.value === form.stage)?.hex || '#c4c4c4'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', pointerEvents: 'none' }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(0,0,0,.4)', pointerEvents: 'auto' }} />
      {/* Drawer */}
      <div style={{
        width: '680px', maxWidth: '92vw', height: '100vh', background: 'var(--panel)',
        borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
        pointerEvents: 'auto', boxShadow: '-8px 0 40px rgba(0,0,0,.2)',
      }}>
        {/* Drawer header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {form.addr || 'New Deal'}
                {form.unit && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> #{form.unit}</span>}
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
                <StagePill stage={form.stage} />
                {form.side && <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)' }}>{form.side}</span>}
                {showGciField && form.gci && <span style={{ fontSize: '12px', fontWeight: 800, color: '#10B981' }}>{fmtFull$(form.gci)} GCI</span>}
                {daysToClose !== null && daysToClose >= 0 && daysToClose <= 30 && (
                  <span style={{ fontSize: '11px', fontWeight: 700, color: daysToClose <= 7 ? '#DC2626' : '#F5A623', background: (daysToClose <= 7 ? '#DC2626' : '#F5A623') + '18', padding: '1px 6px', borderRadius: '10px' }}>
                    Closes in {daysToClose}d
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--muted)', flexShrink: 0 }}>✕</button>
          </div>
          {/* Quick status bar */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Agent quick selector */}
            {(isAdmin || canManage) && (
              <div style={{ display:'flex', alignItems:'center', gap:'4px' }}>
                <span style={{ fontSize:'10px', color:'var(--muted)', fontWeight:700 }}>Agent:</span>
                <select value={form.agent_id || ''} onChange={e => set('agent_id', e.target.value)}
                  style={{ padding:'3px 7px', borderRadius:'6px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'11px', fontFamily:ff }}>
                  <option value="">— Unassigned —</option>
                  {agents.map(a => <option key={a.id} value={a.id} style={{ color: a.color }}>{a.name}</option>)}
                </select>
              </div>
            )}
            {[
              { label: 'Stage', value: form.stage, options: DEAL_STAGES, key: 'stage' },
              { label: 'CTC',   value: form.ctc,   options: CTC_STAGES,  key: 'ctc'   },
            ].map(q => (
              <div key={q.key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700 }}>{q.label}:</span>
                <select value={q.value || ''} onChange={e => set(q.key, e.target.value)}
                  style={{ padding: '3px 6px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '11px', fontFamily: ff }}>
                  <option value="">—</option>
                  {q.options.map(o => <option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
                </select>
              </div>
            ))}
            {/* Won/Lost reason — shown when stage is Closed or Deal Fell Through */}
            {form.stage === 'Closed' && (
              <div style={{ display:'flex', alignItems:'center', gap:4, width:'100%', marginTop:4 }}>
                <span style={{ fontSize:10, color:'var(--muted)', fontWeight:700, flexShrink:0 }}>Won reason:</span>
                <select value={form.won_reason||''} onChange={e=>set('won_reason',e.target.value)}
                  style={{ flex:1, padding:'3px 6px', borderRadius:6, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:11, fontFamily:ff }}>
                  <option value="">Select reason</option>
                  {['Best price','Relationship','Quick close','Agent expertise','Property fit','Referral','Other'].map(r=><option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}
            {form.stage === 'Deal Fell Through' && (
              <div style={{ display:'flex', alignItems:'center', gap:4, width:'100%', marginTop:4 }}>
                <span style={{ fontSize:10, color:'var(--muted)', fontWeight:700, flexShrink:0 }}>Lost reason:</span>
                <select value={form.lost_reason||''} onChange={e=>set('lost_reason',e.target.value)}
                  style={{ flex:1, padding:'3px 6px', borderRadius:6, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:11, fontFamily:ff }}>
                  <option value="">Select reason</option>
                  {['Price too high','Chose another agent','Chose another buyer','Financing fell through','Inspection issues','Title issues','Buyer backed out','Seller backed out','Timeline mismatch','Other'].map(r=><option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', overflowX: 'auto', flexShrink: 0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer',
                borderBottom: tab === t.id ? "2px solid " + (stageHex) : '2px solid transparent',
                marginBottom: '-1px', fontSize: '12px', fontWeight: tab === t.id ? 700 : 500,
                color: tab === t.id ? stageHex : 'var(--muted)', fontFamily: ff, whiteSpace: 'nowrap',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>

          {/* ── DEAL TAB ── */}
          {tab === 'deal' && (
            <div>
              <Grid2>
                <Field label="Address" required>
                {form.id && <BoardLinks dealId={form.id} />}
                <AddressAutocomplete value={form.addr??''} onChange={v=>set('addr',v)}
                  onSelect={s=>{
                    set('addr', s.street||s.full)
                    if(s.unit)  set('unit', s.unit)
                    if(s.city)  set('city', s.city)
                    if(s.state) set('state', s.state)
                    if(s.zip)   set('zip', s.zip)
                  }}
                  placeholder="123 Main St, Monsey NY 10952" />
              </Field>
                <Field label="Unit"><Inp k="unit" placeholder="Apt 2B" /></Field>
                <Field label="Side"><Sel k="side" options={DEAL_SIDES} /></Field>
                <Field label="Stage"><Sel k="stage" options={DEAL_STAGES} /></Field>
                <Field label="Sale Type"><Sel k="sale_type" options={SALE_TYPES} /></Field>
                <Field label="Property Type"><Sel k="property_type" options={PROPERTY_TYPES} placeholder="Select type" /></Field>
                <Field label="Sales Source"><Sel k="sales_source" options={SALES_SOURCES} placeholder="How did this come in?" /></Field>
                <Field label="Referral Agent"><Sel k="referral_agent" options={REFERRAL_AGENTS} placeholder="None" /></Field>
              </Grid2>
              {(isAdmin || canManage) && (
                <div style={{ marginBottom: '12px' }}>
                  <Lbl>Assigned Agent</Lbl>
                  <Sel k="agent_id" options={agents.map(a => ({ value: a.id, label: a.name }))} placeholder="— Assign agent —" />
                </div>
              )}
              <div style={{ marginBottom: '12px' }}>
                <Lbl>Buyer Type</Lbl>
                <Sel k="buyer_type" options={BUYER_TYPES} placeholder="Select type" />
              </div>
            </div>
          )}

          {/* ── STATUS TAB ── */}
          {tab === 'status' && (
            <div>
              <SectionHdr>Deal Status</SectionHdr>
              <Grid2>
                <Field label="Command"><Sel k="command" options={COMMAND_STATUSES.filter(c => c.value)} placeholder="—" /></Field>
                <Field label="Contract to Close"><Sel k="ctc" options={CTC_STAGES} placeholder="—" /></Field>
                <Field label="Deal Status"><Sel k="deal_status" options={DEAL_STATUS_OPTIONS} placeholder="—" /></Field>
                <Field label="Sign Status"><Sel k="sign" options={SIGN_OPTIONS} placeholder="—" /></Field>
              </Grid2>
              <SectionHdr>Important Dates</SectionHdr>
              <Grid2>
                <Field label="A/O Date"><Inp k="ao_date" type="date" /></Field>
                <Field label="Contract Date"><Inp k="contract_date" type="date" /></Field>
                <Field label="Expected Closing"><Inp k="expected_close_date" type="date" /></Field>
                <Field label="Actual Close Date"><Inp k="close_date" type="date" /></Field>
                <Field label="UC/Close Process Date"><Inp k="ctc_close_date" type="date" /></Field>
              </Grid2>
            </div>
          )}

          {/* ── CONTACTS TAB ── */}
          {tab === 'contacts' && (
            <div>
              <SectionHdr>Client Information</SectionHdr>
              <Grid2>
                <Field label="Client Name">
                  <Inp k="client_name" placeholder="John Smith" />
                  <div style={{ marginTop:6 }}>
                    <ContactPicker placeholder="🔍 Link from Contacts board…" agentId={form.agent_id}
                      onSelect={c => setForm(prev => ({ ...prev,
                        client_name:  ((c.first_name||'')+' '+(c.last_name||'')).trim() || prev.client_name,
                        client_email: c.email || prev.client_email,
                        client_phone: c.phone || prev.client_phone }))} />
                  </div>
                </Field>
                <Field label="Client Legal Name"><Inp k="client_legal_name" placeholder="For closing docs" /></Field>
                <Field label="Client Phone">
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <div style={{ flex:1 }}><Inp k="client_phone" type="tel" placeholder="(845) 555-1234" /></div>
                  {form.client_phone && <ClickToCall phone={form.client_phone} contactName={form.client_name} showLabel={false} size="lg" />}
                </div>
              </Field>
                <Field label="Client Email"><Inp k="client_email" type="email" placeholder="client@email.com" /></Field>
              </Grid2>
              <SectionHdr>Attorney</SectionHdr>
              <Grid2>
                <Field label="Attorney Name"><Inp k="atty_name" placeholder="Attorney name" /></Field>
                <Field label="Attorney Email"><Inp k="atty_email" type="email" placeholder="atty@law.com" /></Field>
              </Grid2>
              <SectionHdr>Agent Contact</SectionHdr>
              <div style={{ marginBottom: '12px' }}>
                <Lbl>Agent Email</Lbl>
                <Inp k="agent_email" type="email" placeholder="agent@example.com" />
              </div>
              <SectionHdr>Notes</SectionHdr>
              <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Deal notes, contact info, anything relevant..." rows={4}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff, resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
          )}

          {/* ── FINANCE TAB ── */}
          {tab === 'finance' && (
            <div>
              <SectionHdr>Deal Financials</SectionHdr>
              <Grid2>
                <Field label="Production $"><Inp k="production" type="number" placeholder="500000" /></Field>
                {showGciField && <Field label="GCI $"><Inp k="gci" type="number" placeholder="15000" /></Field>}
              </Grid2>
              <SectionHdr>Commission Tracking</SectionHdr>
              <Grid2>
                <Field label="Commission Received">
                  <select value={form.commission_received || ''} onChange={e => set('commission_received', e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
                    <option value="">—</option>
                    {COMMISSION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="Agent Commission Sent">
                  <select value={form.agent_commission_sent || ''} onChange={e => set('agent_commission_sent', e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
                    <option value="">—</option>
                    {AGENT_COMM_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Field>
              </Grid2>

              {/* Commission collection — $ tracking for reports */}
              <Grid2>
                <Field label="Collection Status">
                  <select value={form.commission_status || 'pending'} onChange={e => {
                      const v = e.target.value; set('commission_status', v)
                      if (v === 'collected' && !form.collected_gci) set('collected_gci', form.gci || '')
                      if (v === 'collected' && !form.collected_date) set('collected_date', new Date().toISOString().slice(0,10))
                    }}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
                    <option value="pending">Pending</option>
                    <option value="partial">Partially paid</option>
                    <option value="collected">Collected</option>
                  </select>
                </Field>
                <Field label="Collected Amount $"><Inp k="collected_gci" type="number" placeholder={form.gci || '0'} /></Field>
              </Grid2>
              {(form.commission_status === 'collected' || form.commission_status === 'partial') && (
                <Grid2>
                  <Field label="Collected Date"><Inp k="collected_date" type="date" /></Field>
                  <Field label="Payment Method / Notes"><Inp k="payment_method" placeholder="Wire, check #123…" /></Field>
                </Grid2>
              )}

              {/* Finance summary card */}
              {(form.production || form.gci) && (
                <div style={{ background: 'var(--dim)', borderRadius: '10px', padding: '14px 16px', border: '1px solid var(--border)', marginTop: '8px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Summary</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <div>
                      <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text)' }}>{fmtFull$(form.production)}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Volume</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '20px', fontWeight: 900, color: '#10B981' }}>{fmtFull$(form.gci)}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>GCI</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text)' }}>
                        {form.production && form.gci ? (parseNum(form.gci) / parseNum(form.production) * 100).toFixed(2) + '%' : '—'}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>GCI Rate</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── CONTRACT TAB ── */}
          {tab === 'ctc' && (
            <div>
              <SectionHdr>Contract to Close Progress</SectionHdr>
              {/* Visual CTC progress */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
                {CTC_STAGES.map((stage, i) => {
                  const isActive = form.ctc === stage.value
                  const isDone   = CTC_STAGES.findIndex(s => s.value === form.ctc) > i
                  return (
                    <div key={stage.value}
                      onClick={() => set('ctc', stage.value)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '8px 12px', borderRadius: '8px', cursor: 'pointer',
                        background: isActive ? stage.hex + '18' : 'var(--dim)',
                        border: "1px solid " + (isActive ? stage.hex : 'var(--border)'),
                        transition: 'all .12s',
                      }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: isActive || isDone ? stage.hex : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {(isActive || isDone) && <span style={{ color: '#fff', fontSize: '10px', fontWeight: 900 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: isActive ? 700 : 400, color: isActive ? stage.hex : 'var(--text)' }}>{stage.label}</span>
                    </div>
                  )
                })}
              </div>
              <SectionHdr>Contract Dates</SectionHdr>
              <Grid2>
                <Field label="Contract Date"><Inp k="contract_date" type="date" /></Field>
                <Field label="Expected Closing"><Inp k="expected_close_date" type="date" /></Field>
                <Field label="Actual Close Date"><Inp k="close_date" type="date" /></Field>
                <Field label="UC/Process Date"><Inp k="ctc_close_date" type="date" /></Field>
              </Grid2>
            </div>
          )}

          {/* ── LINKED CONTACTS TAB ── */}
          {tab === 'linked' && (
            <div>
              <div style={{ fontSize:'13px', fontWeight:700, color:'var(--text)', marginBottom:'4px' }}>Linked Contacts</div>
              <div style={{ fontSize:'12px', color:'var(--muted)', marginBottom:'14px', lineHeight:1.5 }}>
                Link contacts from your Contacts board to this deal. Each contact can have a role (Buyer, Seller, Co-Buyer, etc.).
              </div>
              {deal?.id
                ? <DealContactsPanel dealId={deal.id} agentId={deal?.agent_id} />
                : <div style={{ color:'var(--muted)', fontSize:'13px' }}>Save the deal first to link contacts.</div>
              }
            </div>
          )}

          {/* ── FILES TAB ── */}
          {tab === 'files' && (
            deal?.id
              ? <FileAttachments tableName="deals" recordId={deal.id} />
              : <div style={{ color: 'var(--muted)', fontSize: '13px', padding: '20px 0' }}>Save the deal first to attach files.</div>
          )}

          {/* ── ACTIVITY TAB ── */}
          {tab === 'activity' && deal?.id && <RecordActivity recordId={deal.id} tableName="deals" />}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
          {readOnly ? (
            <>
              <span style={{ fontSize: '12px', color: 'var(--muted)', fontFamily: ff }}>🔒 View only — this deal belongs to another agent.</span>
              <div style={{ flex: 1 }} />
              <button onClick={onClose}
                style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: '13px', cursor: 'pointer', fontFamily: ff }}>
                Close
              </button>
            </>
          ) : (
            <>
              {deal?.id && can('deals.delete') && (
                <button onClick={() => setConfirmDel(true)}
                  style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #DC262644', background: '#FEF2F2', color: '#DC2626', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>
                  Delete
                </button>
              )}
              <div style={{ flex: 1 }} />
              <button onClick={onClose}
                style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: '13px', cursor: 'pointer', fontFamily: ff }}>
                Cancel
              </button>
              <Btn onClick={() => onSave(form)} loading={saving}>
                {deal?.id ? 'Save Changes' : 'Add Deal'}
              </Btn>
            </>
          )}
        </div>
      </div>

      <Confirm
        open={confirmDel}
        message={"Delete deal at \"" + (form.addr) + "\"? This cannot be undone."}
        onConfirm={() => { onDelete(); setConfirmDel(false) }}
        onCancel={() => setConfirmDel(false)}
      />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════
function exportSelected(selectedIds, filtered, agents, includeGci = true) {
  const sel = filtered.filter(d => selectedIds.includes(d.id))
  const cols = ['Address','Side','Stage','Production'].concat(includeGci ? ['GCI'] : []).concat(['A/O Date','Close Date','Client','Agent'])
  const header = cols.join(',')
  const rows = sel.map(d => {
    const a = agents.find(x => x.id === d.agent_id)
    return [d.addr, d.side, d.stage, d.production].concat(includeGci ? [d.gci] : []).concat([d.ao_date, d.close_date, d.client_name, a ? a.name : ''])
      .map(v => '"' + String(v || '').replace(/"/g, '""') + '"').join(',')
  })
  const csv  = [header].concat(rows).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href     = url
  link.download = 'selected_deals_' + sel.length + '.csv'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function Production() {
  const navigate = useNavigate()
  const { id: urlId } = useParams()
  const { agent, isAdmin, canManage, can } = useAuth()
  usePageView('production')
  const { toast } = useApp()
  const { agents } = useAgents()

  const [deals,    setDeals]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [loadError, setLoadError] = useState(null)
  // Collapse-all / expand-all signal: bump a counter with the desired state;
  // each BoardGroup syncs its own collapsed flag when the counter changes,
  // while still allowing per-group toggling afterward.
  const [collapseSignal, setCollapseSignal] = useState({ n: 0, collapsed: false })

  // Own-vs-any edit guard (Access Model A): admins/managers edit any deal;
  // agents edit ONLY their own. Every write handler calls this — not just the
  // hidden buttons — so the guard can't be bypassed via inline edit, drag,
  // reorder, drawer save, or bulk actions. (Frontend guard; DB RLS is still
  // permissive and remains the future server-side boundary.)
  function canEditDeal(deal) {
    if (isAdmin || canManage) return true
    return !!deal && deal.agent_id === agent?.id
  }
  const [search,   setSearch]   = useState('')
  const [stageF,   setStageF]   = useState('')
  const [agentF,   setAgentF]   = useState('')
  const [sideF,    setSideF]    = useState('')
  const [saleTypeF,setSaleTypeF]= useState('')
  const [propTypeF,setPropTypeF]= useState('')
  const [yearF,    setYearF]    = useState('')
  const [selected, setSelected] = useState(null) // deal being edited, or {} for new
  const [saving,   setSaving]   = useState(false)
  const [viewMode,    setViewMode]    = useState('board') // 'board' | 'table'
  const [selectedIds,  setSelectedIds]  = useState([])
  const [bulkDeleting,  setBulkDeleting]  = useState(false)
  const [hiddenCols,    setHiddenCols]    = useState([])
  const [showColPicker, setShowColPicker] = useState(false)
  const [customGroups,  setCustomGroups]  = useState(null)
  const [trueTotals,    setTrueTotals]    = useState(null) // { total_count, total_gci, closed_gci, pipeline_gci } from production_totals() RPC — null until loaded
  const [customFieldDefs, setCustomFieldDefs] = useState([])
  const [colOrder,        setColOrder]        = useState(null) // array of column keys, custom order — null = default
  const [showAddCol,      setShowAddCol]      = useState(false)
  const [draggedDealId,   setDraggedDealId]   = useState(null)
  const [draggedColKey,   setDraggedColKey]   = useState(null)
  const [dragOverGroupId, setDragOverGroupId] = useState(null)

  useEffect(() => {
    getFieldsForEntity('deals').then(setCustomFieldDefs)
    // Column order + hidden columns persisted per-agent (new prefs
    // namespace — Production's hiddenCols had zero persistence before
    // this, resetting on every reload)
    if (agent?.id) {
      import('../lib/userPrefs').then(({ loadPrefs }) => {
        loadPrefs(agent.id).then(p => {
          if (p?.productionColOrder)   setColOrder(p.productionColOrder)
          if (p?.productionHiddenCols) setHiddenCols(p.productionHiddenCols)
        }).catch(() => {})
      })
    }
  }, [agent?.id])

  async function persistColPrefs(newColOrder, newHiddenCols) {
    if (!agent?.id) return
    try {
      const { loadPrefs, savePrefs } = await import('../lib/userPrefs')
      const current = await loadPrefs(agent.id)
      await savePrefs(agent.id, {
        ...current,
        productionColOrder:   newColOrder   !== undefined ? newColOrder   : current.productionColOrder,
        productionHiddenCols: newHiddenCols !== undefined ? newHiddenCols : current.productionHiddenCols,
      })
    } catch(e) { console.warn('persistColPrefs:', e.message) }
  }

  const ALL_COLUMNS_WITH_CUSTOM = useMemo(() => [
    ...ALL_COLUMNS,
    ...customFieldDefs.map(f => ({
      key: f.key, label: f.label, width: 130, type: f.type,
      options: f.options, custom: true,
    })),
  ], [customFieldDefs])

  const canViewGci = can('deals.view_gci')
  const activeGroups  = useMemo(() => customGroups || [...BOARD_GROUPS, ...buildYearGroups(deals)], [customGroups, deals])
  const visibleCols   = useMemo(() => {
    let cols = ALL_COLUMNS_WITH_CUSTOM.filter(c => !hiddenCols.includes(c.key))
    if (agent?.hide_client_column) cols = cols.filter(c => c.key !== '_client')
    if (!canViewGci) cols = cols.filter(c => c.key !== 'gci')
    if (colOrder) {
      const orderMap = new Map(colOrder.map((k, i) => [k, i]))
      cols = [...cols].sort((a, b) => (orderMap.has(a.key) ? orderMap.get(a.key) : 999) - (orderMap.has(b.key) ? orderMap.get(b.key) : 999))
    }
    return cols
  }, [ALL_COLUMNS_WITH_CUSTOM, hiddenCols, colOrder, agent?.hide_client_column, canViewGci])

  const years = []
  for (let y = new Date().getFullYear(); y >= 2015; y--) years.push(y.toString())

  useEffect(() => { load() }, [])

  // Deep link: /production?open=<id> opens that deal
  const location = useLocation()
  const [deepLinked, setDeepLinked] = useState(false)
  useEffect(() => {
    if (deepLinked || !deals.length) return
    const id = new URLSearchParams(location.search).get('open')
    if (id) { const d = deals.find(x => x.id === id); if (d) openDeal(d) }
    setDeepLinked(true)
  }, [deals.length, location.search])

  function renameGroup(id, label) {
    setCustomGroups(prev => (prev || [...BOARD_GROUPS, ...buildYearGroups(deals)]).map(g => g.id === id ? {...g, label} : g))
  }
  function addGroup() {
    const colors = ['#037f4c','#0086c0','#bb3354','#784bd1','#fdab3d','#e2445c','#00b884','#ff6b35']
    setCustomGroups(prev => [...(prev || [...BOARD_GROUPS, ...buildYearGroups(deals)]), {
      id: 'grp_' + Date.now(), label: 'New Group', stages: [],
      color: colors[Math.floor(Math.random() * colors.length)], emoji: '📁', custom: true
    }])
  }
  function openNewWithGroup(group) {
    setSelected({ stage: group.stages?.[0] || 'Negotiations' })
  }

  async function load() {
    setLoading(true)
    setLoadError(null)
    try {
      // Access Model A: everyone with deals.view_all sees the full team board.
      // Only users WITHOUT view_all are scoped to their own deals. This is a
      // FRONTEND read scope; DB RLS is still permissive (not the security boundary).
      const seeAll = can('deals.view_all')
      let q = supabase.from('deals').select('*, agents(id,name,color)', { count: 'exact' }).order('ao_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
      if (!seeAll) q = q.eq('agent_id', agent?.id)
      // Load up to 5,000 deals — raised from 1,000 (July 2026) after the team
      // crossed 600-1000 deals and risked silently truncating the board.
      // True totals (GCI/production) below no longer depend on this cap at all.
      q = q.range(0, 4999)
      const { data: dealsData, count: totalDeals, error: dealsErr } = await q
      if (dealsErr) throw dealsErr
      const deals = dealsData || []

      // True totals via server-side aggregate — always accurate regardless
      // of the row cap above. See production_totals.sql.
      const scopeAgentId = seeAll ? null : agent?.id
      const { data: totalsData, error: totalsErr } = await supabase.rpc('production_totals', { p_agent_id: scopeAgentId })
      if (!totalsErr && totalsData?.[0]) {
        setTrueTotals(totalsData[0])
      } else {
        setTrueTotals(null)
        if (totalsErr) console.warn('production_totals RPC error:', totalsErr.message)
      }

      if (totalDeals > 5000) {
        toast('Showing 5,000 of ' + totalDeals.toLocaleString() + ' deals — use filters to narrow down', '#F5A623')
      }

      // Fetch linked contacts (names + role) for all deals in one query
      if (deals.length > 0) {
        const { data: links } = await supabase
          .from('deal_contacts')
          .select('deal_id, role, contacts(id, first_name, last_name)')
          .in('deal_id', deals.map(d => d.id))
        const byDeal = {}
        ;(links || []).forEach(r => {
          if (!r.contacts) return
          if (!byDeal[r.deal_id]) byDeal[r.deal_id] = []
          byDeal[r.deal_id].push({
            id: r.contacts.id,
            name: [r.contacts.first_name, r.contacts.last_name].filter(Boolean).join(' ') || 'Unnamed',
            role: r.role,
          })
        })
        deals.forEach(d => {
          d._contacts = byDeal[d.id] || []
          d._contact_count = d._contacts.length
        })
      }

      setDeals(deals)
    } catch(e) {
      setLoadError(e.message || 'Failed to load deals')
      toast('Could not load deals: ' + e.message, '#DC2626')
    }
    finally { setLoading(false) }
  }

  // Open deal from URL param
  useEffect(() => {
    if (!urlId || deals.length === 0) return
    if (urlId === 'new') { setSelected({}); return }
    const d = deals.find(x => x.id === urlId)
    if (d) setSelected(d)
  }, [urlId, deals.length])

  function openDeal(d) {
    setSelected(d)
    navigate('/production/' + d.id, { replace: true })
  }
  function openNew() {
    setSelected({})
    navigate('/production/new', { replace: true })
  }
  function closeDrawer() {
    setSelected(null)
    navigate('/production', { replace: true })
  }

  async function saveDeal(form) {
    if (!form.addr?.trim()) { toast('Address is required', '#DC2626'); return }
    // Editing an existing deal requires own-or-admin; creating a new deal is allowed.
    if (form.id && !canEditDeal(form)) { toast('You can only edit your own deals', '#DC2626'); return }
    setSaving(true)
    try {
      if (form.id) {
        // Strip client-side virtual fields before saving to DB
        const { _contact_count, agents, ...cleanForm } = form
        const { data, error } = await supabase.from('deals').update({ ...cleanForm, updated_at: new Date().toISOString() }).eq('id', form.id).select('*, agents(id,name,color)').single()
        if (error) throw error
        setDeals(prev => prev.map(d => d.id === form.id ? data : d))
        setSelected(data)
        toast('✅ Deal saved')
      } else {
        const { _contact_count: _cc, agents: _ag, id: _id, ...cleanFormInsert } = form
        const { data, error } = await supabase.from('deals').insert({ ...cleanFormInsert, agent_id: form.agent_id || agent?.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select('*, agents(id,name,color)').single()
        if (error) throw error
        setDeals(prev => [data, ...prev])
        setSelected(data)
        navigate('/production/' + data.id, { replace: true })
        toast('✅ Deal added')
      }
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  async function deleteDeal() {
    if (!selected?.id) return
    if (!can('deals.delete')) { toast("You don't have permission to delete deals", '#DC2626'); return }
    try {
      await supabase.from('deals').delete().eq('id', selected.id)
      setDeals(prev => prev.filter(d => d.id !== selected.id))
      toast('Deal deleted')
      closeDrawer()
    } catch(e) { toast('Delete failed: ' + e.message, '#DC2626') }
  }

  async function bulkDelete() {
    if (!selectedIds.length) return
    if (!can('deals.delete')) { toast("You don't have permission to delete deals", '#DC2626'); return }
    if (!window.confirm('Delete ' + selectedIds.length + ' deal' + (selectedIds.length !== 1 ? 's' : '') + '? This cannot be undone.')) return
    setBulkDeleting(true)
    try {
      // Batch in chunks of 100 to avoid URL length limits on large selections
      const BATCH = 100
      let deletedCount = 0
      const failedIds = []
      for (let i = 0; i < selectedIds.length; i += BATCH) {
        const chunk = selectedIds.slice(i, i + BATCH)
        const { error } = await supabase.from('deals').delete().in('id', chunk)
        if (error) {
          console.error('Batch delete failed:', error)
          failedIds.push(...chunk)
        } else {
          deletedCount += chunk.length
        }
      }
      setDeals(prev => prev.filter(d => !selectedIds.includes(d.id) || failedIds.includes(d.id)))
      if (failedIds.length === 0) {
        toast('✅ Deleted ' + deletedCount + ' deal' + (deletedCount !== 1 ? 's' : ''))
        setSelectedIds([])
      } else {
        toast('Deleted ' + deletedCount + ', failed on ' + failedIds.length, '#F5A623')
        setSelectedIds(failedIds)
      }
    } catch(e) { toast('Delete failed: ' + e.message, '#DC2626') }
    finally { setBulkDeleting(false) }
  }

  async function bulkUpdateStage(stage) {
    if (!selectedIds.length) return
    // Own-vs-any guard: non-admins may bulk-update only their own deals.
    if (!(isAdmin || canManage)) {
      const foreign = selectedIds.filter(id => { const d = deals.find(x => x.id === id); return d && d.agent_id !== agent?.id })
      if (foreign.length) { toast('You can only update your own deals', '#DC2626'); return }
    }
    try {
      const { error } = await supabase.from('deals').update({ stage, updated_at: new Date().toISOString() }).in('id', selectedIds)
      if (error) throw error
      setDeals(prev => prev.map(d => selectedIds.includes(d.id) ? { ...d, stage } : d))
      toast('✅ Updated ' + selectedIds.length + ' deals to "' + stage + '"')
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
  }

  async function createCustomColumn({ label, type, options }) {
    if (!label?.trim()) { toast('Column name required', '#DC2626'); return }
    try {
      // CRITICAL: load ALL field defs (all entities), not just deals' —
      // saveFieldDefs replaces the whole list, so loading only deals'
      // fields here would silently delete every Contacts/Listings
      // custom field.
      const allDefs = await loadFieldDefs()
      const dealsFields = allDefs.filter(f => f.entity === 'deals')
      const maxOrder = dealsFields.reduce((m, f) => Math.max(m, f.order || 0), 0)
      const newField = {
        id: crypto.randomUUID(),
        entity: 'deals',
        label: label.trim(),
        key: labelToKey(label),
        type: type || 'text',
        options: type === 'select' ? (options || []).filter(Boolean) : undefined,
        required: false,
        section: 'Custom',
        order: maxOrder + 1,
        active: true,
      }
      await saveFieldDefs([...allDefs, newField])
      invalidateFieldCache()
      const refreshed = await getFieldsForEntity('deals')
      setCustomFieldDefs(refreshed)
      setShowAddCol(false)
      toast('✅ Column "' + newField.label + '" added')
    } catch(e) {
      toast('Failed to add column: ' + e.message, '#DC2626')
    }
  }

  // Drag a deal card onto a stage group to change its stage. Only
  // enabled for the 3 static pipeline groups (active/under_shtar/
  // under_contract) -- the Closed/Fell Through groups are generated
  // per-year from real close_date/ao_date values, so a stage-only drag
  // there would land in an arbitrary or wrong year bucket. Those
  // transitions go through the proper modal instead.
  // Drag a column header onto another to reorder it there
  function handleColDrop(targetKey) {
    if (!draggedColKey || draggedColKey === targetKey) { setDraggedColKey(null); return }
    const currentOrder = visibleCols.map(c => c.key)
    const fromIdx = currentOrder.indexOf(draggedColKey)
    const toIdx   = currentOrder.indexOf(targetKey)
    if (fromIdx === -1 || toIdx === -1) { setDraggedColKey(null); return }
    const newOrder = [...currentOrder]
    newOrder.splice(fromIdx, 1)
    newOrder.splice(toIdx, 0, draggedColKey)
    // Include any hidden/undisplayed columns at the end so nothing gets lost from the saved order
    const fullOrder = [...newOrder, ...ALL_COLUMNS_WITH_CUSTOM.map(c => c.key).filter(k => !newOrder.includes(k))]
    setColOrder(fullOrder)
    persistColPrefs(fullOrder, undefined)
    setDraggedColKey(null)
  }

  function handleDealDrop(group) {
    if (!draggedDealId || group.yearMatch) { setDraggedDealId(null); setDragOverGroupId(null); return }
    const deal = deals.find(d => d.id === draggedDealId)
    if (deal && !canEditDeal(deal)) {
      toast('You can only move your own deals', '#DC2626')
      setDraggedDealId(null); setDragOverGroupId(null); return
    }
    if (deal && group.stages?.[0] && deal.stage !== group.stages[0]) {
      quickUpdate(deal, 'stage', group.stages[0])
    }
    setDraggedDealId(null)
    setDragOverGroupId(null)
  }

  // Drop directly onto another deal row — reorders within that row's
  // group (pure organization, independent of stage), and also changes
  // stage if the drop lands in a different group than the dragged
  // deal's current one.
  async function handleRowDrop(targetDeal, group) {
    const draggedId = draggedDealId
    setDraggedDealId(null)
    setDragOverGroupId(null)
    if (!draggedId || draggedId === targetDeal.id || group.yearMatch) return
    const deal = deals.find(d => d.id === draggedId)
    if (!deal) return
    if (!canEditDeal(deal)) { toast('You can only move your own deals', '#DC2626'); return }

    // Build the new order for this group: everyone currently in it
    // (excluding the dragged deal), with the dragged deal inserted
    // right before the target row.
    const groupDeals  = group.deals.filter(d => d.id !== draggedId)
    const targetIdx   = groupDeals.findIndex(d => d.id === targetDeal.id)
    const newOrder    = [...groupDeals]
    newOrder.splice(targetIdx === -1 ? newOrder.length : targetIdx, 0, deal)
    const positionUpdates = newOrder.map((d, i) => ({ id: d.id, board_position: i }))

    // Optimistic update — reorder + stage change (if crossing groups) immediately
    const newStage = (group.stages?.[0] && deal.stage !== group.stages[0]) ? group.stages[0] : null
    setDeals(prev => prev.map(d => {
      const u = positionUpdates.find(x => x.id === d.id)
      if (!u) return d
      return { ...d, board_position: u.board_position, ...(d.id === deal.id && newStage ? { stage: newStage } : {}) }
    }))

    try {
      if (newStage) await quickUpdate(deal, 'stage', newStage)
      await Promise.all(positionUpdates.map(u =>
        supabase.from('deals').update({ board_position: u.board_position }).eq('id', u.id)
      ))
    } catch(e) {
      toast('Reorder failed: ' + e.message, '#DC2626')
    }
  }

  const DEAL_FIELD_LABELS = {
    stage:'Stage', side:'Side', sale_type:'Sale Type', property_type:'Property Type',
    production:'Production', gci:'GCI', agent_id:'Agent', command:'Command',
    ao_date:'A/O Date', contract_date:'Contract Date', expected_close_date:'Expected Close',
    close_date:'Close Date', deal_status:'Deal Status', notes:'Notes',
  }

  async function logDealChange(deal, field, oldValue, newValue) {
    logRecordChange({
      tableName: 'deals', recordId: deal.id, agentId: agent?.id,
      field, oldValue, newValue, recordName: deal.addr,
    })
    // Notify the deal's assigned agent (not necessarily whoever made
    // the change) that the stage moved, per their notification prefs.
    if (field === 'stage' && deal.agent_id) {
      notifyAgent(deal.agent_id, 'dealStageChange', {
        title: 'Deal stage changed',
        body: (deal.addr || 'A deal') + ' moved to ' + newValue,
        link: '/production/' + deal.id,
        type: 'deal',
      })
    }
  }

  async function quickUpdate(deal, field, value, isCustom) {
    if (!canEditDeal(deal)) { toast('You can only edit your own deals', '#DC2626'); return }
    const today = new Date().toISOString().slice(0, 10)

    // Custom field — value lives in deal.custom_data, not a direct column
    if (isCustom) {
      const newCustomData = { ...(deal.custom_data || {}), [field]: value }
      const autoFields = { custom_data: newCustomData, updated_at: new Date().toISOString() }
      setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, ...autoFields } : d))
      try {
        const { data, error } = await supabase
          .from('deals').update(autoFields).eq('id', deal.id)
          .select('*, agents(id,name,color)').maybeSingle()
        if (error) throw error
        if (data) setDeals(prev => prev.map(d => d.id === deal.id ? data : d))
        logDealChange(deal, field, (deal.custom_data || {})[field], value)
      } catch(e) {
        setDeals(prev => prev.map(d => d.id === deal.id ? deal : d))
        toast('Update failed: ' + e.message, '#DC2626')
      }
      return
    }

    // Auto-date logic: set the relevant date if not already set
    const autoFields = { [field]: value, updated_at: new Date().toISOString() }
    if (field === 'stage') {
      if (value === 'Closed'           && !deal.close_date)     autoFields.close_date     = today
      if (value === 'Offer Accapted'   && !deal.ao_date)        autoFields.ao_date        = today
      if (value === 'Under Contract'   && !deal.contract_date)  autoFields.contract_date  = today
      if (value === 'Under Shtar'      && !deal.contract_date)  autoFields.contract_date  = today
    }

    // Optimistic update immediately — UI responds instantly
    setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, ...autoFields } : d))
    try {
      const { data, error } = await supabase
        .from('deals')
        .update(autoFields)
        .eq('id', deal.id)
        .select('*, agents(id,name,color)')
        .maybeSingle()
      if (error) throw error
      if (data) setDeals(prev => prev.map(d => d.id === deal.id ? data : d))
      logDealChange(deal, field, deal[field], value)

      // Automation: Offer Accepted -> Under Contract triggers an email
      // to the deal's agent. Board placement itself needs no extra
      // code -- groups are derived from `stage`, so the deal moves
      // automatically once this update lands.
      if (field === 'stage' && deal.stage === 'Offer Accapted' && value === 'Under Contract') {
        notifyUnderContract(deal)
      }
    } catch(e) {
      // Revert optimistic update on failure
      setDeals(prev => prev.map(d => d.id === deal.id ? deal : d))
      toast('Update failed: ' + e.message, '#DC2626')
    }
  }

  async function notifyUnderContract(deal) {
    try {
      const ag = agents.find(a => a.id === deal.agent_id)
      if (!ag?.email) return
      const { data: { session } } = await supabase.auth.getSession()
      await authFetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': 'Bearer ' + session.access_token } : {}),
        },
        body: JSON.stringify({
          from: 'TargetOS <office@targetreteam.com>',
          to: [ag.email],
          subject: '📝 Now Under Contract — ' + (deal.addr || 'Deal'),
          html: '<div style="font-family:Inter,sans-serif;padding:20px">' +
            '<h2 style="color:#CC2200">Deal Moved to Under Contract</h2>' +
            '<p><strong>' + (deal.addr || 'Address on file') + '</strong> just moved from Offer Accepted to Under Contract.</p>' +
            (deal.gci ? '<p>GCI: <strong>' + fmtFull$(deal.gci) + '</strong></p>' : '') +
            '<a href="https://app.targetreteam.com/production/' + deal.id + '" style="background:#CC2200;color:#fff;padding:10px 20px;text-decoration:none;border-radius:7px;display:inline-block;margin-top:12px">View Deal →</a>' +
            '</div>',
        }),
      })
    } catch(e) { console.warn('notifyUnderContract failed:', e.message) }
  }

  // ── FILTERING ──────────────────────────────────────────────────
  const filtered = useMemo(() => deals.filter(d => {
    if (stageF    && d.stage         !== stageF)    return false
    if (agentF    && d.agent_id      !== agentF)    return false
    if (sideF     && d.side          !== sideF)     return false
    if (saleTypeF && d.sale_type     !== saleTypeF) return false
    if (propTypeF && d.property_type !== propTypeF) return false
    if (search && !matchSearch(d, search, ['addr', 'client_name', 'atty_name'])) return false
    if (yearF) {
      const year = d.ao_date?.slice(0, 4) || d.close_date?.slice(0, 4) || d.created_at?.slice(0, 4)
      if (year !== yearF) return false
    }
    return true
  }), [deals, stageF, agentF, sideF, saleTypeF, propTypeF, search, yearF])

  // Board groups
  // All stage values that are claimed by a group
  const allClaimedStages = new Set(activeGroups.flatMap(g => g.stages || []))

  const groupedDeals = useMemo(() => activeGroups.map(group => ({
    ...group,
    deals: filtered.filter(d => {
      // Custom group with no stages: catch all deals whose stage isn't in any group
      if (group.custom && (!group.stages || group.stages.length === 0)) {
        return !allClaimedStages.has(d.stage)
      }
      const stageMatch = (group.stages || []).includes(d.stage)
      if (!stageMatch) return false
      if (group.yearMatch) {
        const year = d.close_date?.slice(0, 4) || d.ao_date?.slice(0, 4) || d.created_at?.slice(0, 4)
        if (group.yearMatch === '__NODATE__') return !year
        return year === group.yearMatch
      }
      return true
    }).sort((a, b) => {
      // Manual drag-order always wins if the agent has explicitly
      // repositioned a deal. Otherwise, sort by whichever date field
      // is actually relevant to that deal's current stage -- oldest
      // first, so a newly-entered deal naturally lands at the bottom
      // of its group, exactly where you'd look for "what just came in."
      const ap = a.board_position, bp = b.board_position
      if (ap != null && bp != null) return ap - bp
      if (ap != null) return -1
      if (bp != null) return 1

      const dateFor = (d) => {
        if (['Negotiations', 'Offer Accapted'].includes(d.stage)) return d.ao_date
        if (['Under Shtar', 'Under Contract'].includes(d.stage)) return d.contract_date
        if (d.stage === 'Closed') return d.close_date
        // Deal Fell Through or anything else: best available date
        return d.close_date || d.contract_date || d.ao_date || d.created_at
      }
      const da = dateFor(a), db = dateFor(b)
      if (!da && !db) return 0
      if (!da) return -1  // no date yet -- keep near the top, not lost at the bottom
      if (!db) return 1
      return da < db ? -1 : da > db ? 1 : 0
    }),
  })), [activeGroups, filtered])
  const visibleGroups = groupedDeals.filter(g => g.custom ? true : g.yearMatch ? true : g.deals.length > 0 || ['active','under_shtar','under_contract'].includes(g.id))

  // Stats — deliberately calculated from a FIXED "this year's business"
  // scope, NOT from `filtered` (which reflects whatever the user is
  // currently browsing with stage/agent/year filters). The board layout
  // below shows everything, matching Monday.com's full structure; these
  // summary cards should stay consistent regardless of what's being
  // browsed. "This year" = active pipeline stages always count (no
  // date requirement — a deal accepted 2 years ago that's still under
  // contract is still part of this year's active business), while
  // Closed/Deal Fell Through only count if they resolved this year.
  const currentYear = new Date().getFullYear().toString()
  const ACTIVE_STAGES = ['Negotiations', 'Offer Accapted', 'Under Shtar', 'Under Contract']
  const thisYearScope = useMemo(() => deals.filter(d => {
    if (ACTIVE_STAGES.includes(d.stage)) return true
    if (d.stage === 'Closed' || d.stage === 'Deal Fell Through') {
      const year = d.close_date?.slice(0,4) || d.ao_date?.slice(0,4) || d.created_at?.slice(0,4)
      return year === currentYear
    }
    return false
  }), [deals, currentYear])

  const totalGCIAll   = thisYearScope.reduce((s, d) => s + parseNum(d.gci), 0)
  const closedArr     = thisYearScope.filter(d => d.stage === 'Closed')
  const closedGCI     = closedArr.reduce((s, d) => s + parseNum(d.gci), 0)
  const activeArr     = thisYearScope.filter(d => !['Closed','Deal Fell Through'].includes(d.stage))
  const pipelineGCI   = activeArr.reduce((s, d) => s + parseNum(d.gci), 0)
  const isTruncated   = !!(trueTotals && deals.length < trueTotals.total_count)

  return (
    <div style={{ fontFamily: ff }}>

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text)', letterSpacing: '-.3px' }}>📊 Production Board</div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
            {filtered.length} deals · {fmtFull$(totalGCIAll)} GCI
          </div>
        </div>

        {isTruncated && (
          <div style={{ background: 'rgba(245,166,35,.08)', border: '1px solid rgba(245,166,35,.35)', borderRadius: 8, padding: '8px 14px', fontSize: 12, color: '#8a5a00', maxWidth: 480 }}>
            <strong>⚠ Board is showing {deals.length.toLocaleString()} of {trueTotals.total_count.toLocaleString()} deals.</strong>{' '}
            True totals (all deals): {fmtFull$(trueTotals.total_gci)} GCI · {fmtFull$(trueTotals.closed_gci)} closed · {fmtFull$(trueTotals.pipeline_gci)} pipeline.
            Use filters to narrow the board view — the numbers above the board reflect only what's currently loaded.
          </div>
        )}

        <div style={{ marginBottom: -12 }}>
        <FilterBar
          searchKey="search" placeholder="🔍 Address, client, attorney..."
          filters={{ search, yearF, stageF, sideF, agentF, saleTypeF, propTypeF }}
          onChange={next => {
            if ('search'     in next) setSearch(next.search)
            if ('yearF'      in next) setYearF(next.yearF)
            if ('stageF'     in next) setStageF(next.stageF)
            if ('sideF'      in next) setSideF(next.sideF)
            if ('agentF'     in next) setAgentF(next.agentF)
            if ('saleTypeF'  in next) setSaleTypeF(next.saleTypeF)
            if ('propTypeF'  in next) setPropTypeF(next.propTypeF)
          }}
          definitions={[
            { key:'yearF',    label:'Year',      options:years.map(y=>({value:y,label:y})) },
            { key:'stageF',   label:'Stage',     options:DEAL_STAGES.map(s=>({value:s.value,label:s.label})) },
            { key:'sideF',    label:'Side',      options:DEAL_SIDES.map(s=>({value:s,label:s})) },
            ...(isAdmin||canManage?[{ key:'agentF', label:'Agent', options:agents.map(a=>({value:a.id,label:a.name})) }]:[]),
            { key:'saleTypeF',label:'Sale Type', options:['On Market','Off Market','FSBO'].map(s=>({value:s,label:s})) },
            { key:'propTypeF',label:'Type',      options:['Single Family','Condo','New Construction','Multi Family','Duplex','Flip','Land','Commercial'].map(s=>({value:s,label:s})) },
          ]}
        />
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <LastVisited page="production" />
          {/* View mode */}
          <div style={{ display: 'flex', background: 'var(--dim)', borderRadius: '8px', padding: '3px', gap: '2px' }}>
            {/* Column picker */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowColPicker(p => !p)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, border: '1px solid #e6e9ef', background: '#fff', color: '#676879', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: ff }}>
              ⚙ Columns {hiddenCols.length > 0 ? '(' + hiddenCols.length + ' hidden)' : ''}
            </button>
            {showColPicker && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fff', border: '1px solid #e6e9ef', borderRadius: 8, padding: 12, zIndex: 300, width: 220, boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#676879', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Show / Hide Columns</div>
                {ALL_COLUMNS_WITH_CUSTOM.map(col => (
                  <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px', cursor: 'pointer', borderRadius: 4, fontSize: 12, color: '#323338' }}>
                    <input type="checkbox" checked={!hiddenCols.includes(col.key)}
                      onChange={e => {
                        const next = e.target.checked ? hiddenCols.filter(k => k !== col.key) : [...hiddenCols, col.key]
                        setHiddenCols(next)
                        persistColPrefs(undefined, next)
                      }} />
                    {col.label}{col.custom && <span style={{ fontSize: 9, color: '#0073ea', fontWeight: 700 }}>CUSTOM</span>}
                  </label>
                ))}
                <div style={{ borderTop: '1px solid #e6e9ef', marginTop: 8, paddingTop: 8, display: 'flex', gap: 6 }}>
                  <button onClick={() => { setHiddenCols([]); persistColPrefs(undefined, []) }} style={{ flex: 1, padding: 5, borderRadius: 6, border: '1px solid #e6e9ef', background: '#fff', color: '#676879', fontSize: 11, cursor: 'pointer' }}>Show all</button>
                  <button onClick={() => { setColOrder(null); persistColPrefs(null, undefined) }} style={{ flex: 1, padding: 5, borderRadius: 6, border: '1px solid #e6e9ef', background: '#fff', color: '#676879', fontSize: 11, cursor: 'pointer' }}>Reset order</button>
                  <button onClick={() => setShowColPicker(false)} style={{ flex: 1, padding: 5, borderRadius: 6, border: 'none', background: '#0073ea', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>Done</button>
                </div>
                <button onClick={() => { setShowColPicker(false); setShowAddCol(true) }}
                  style={{ width: '100%', marginTop: 6, padding: '7px 5px', borderRadius: 6, border: '1px dashed #0073ea', background: '#f0f7ff', color: '#0073ea', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  + Add New Column
                </button>
              </div>
            )}
          </div>

          {[['board','📋 Board'],['table','📊 Table']].map(([m,l]) => (
              <button key={m} onClick={() => setViewMode(m)}
                style={{ padding: '5px 10px', borderRadius: '6px', border: 'none', background: viewMode === m ? 'var(--panel)' : 'transparent', color: viewMode === m ? 'var(--text)' : 'var(--muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: ff, boxShadow: viewMode === m ? '0 1px 3px rgba(0,0,0,.12)' : 'none' }}>
                {l}
              </button>
            ))}
          </div>
          {viewMode === 'board' && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => setCollapseSignal(s => ({ n: s.n + 1, collapsed: true }))}
                style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: ff }}
                title="Collapse all stage groups">⊟ Collapse All</button>
              <button onClick={() => setCollapseSignal(s => ({ n: s.n + 1, collapsed: false }))}
                style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: ff }}
                title="Expand all stage groups">⊞ Expand All</button>
            </div>
          )}
          <ImportExport
            table="deals"
            data={filtered}
            columns={EXPORT_COLUMNS}
            label="Deals"
            onImport={load}
          />
          <Btn onClick={openNew}>+ Add Deal</Btn>
        </div>
      </div>

      {/* ── STATS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--border)' }}>
        {[
          { label: 'Total Deals',    value: thisYearScope.length, color: '#3B82F6', prefix: '' },
          { label: 'Active',         value: activeArr.length,     color: '#037f4c', prefix: '' },
          { label: 'Closed GCI',     value: fmtFull$(closedGCI),      color: '#10B981', prefix: '' },
          { label: 'Pipeline GCI',   value: fmtFull$(pipelineGCI),    color: '#F5A623', prefix: '' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--panel)', borderRadius: '10px', border: '1px solid var(--border)', padding: '9px 14px', borderLeft: "3px solid " + (s.color) }}>
            <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text)' }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>



      {/* ── SELECTION BAR ── */}
      {selectedIds.length > 0 && (() => {
        const sel = filtered.filter(d => selectedIds.includes(d.id))
        const selGCI  = sel.reduce((s, d) => s + (parseFloat(d.gci)        || 0), 0)
        const selProd = sel.reduce((s, d) => s + (parseFloat(d.production) || 0), 0)
        const byAgent = {}
        sel.forEach(d => { const a = agents.find(x => x.id === d.agent_id); const n = a?.name?.split(' ')[0] || 'Unassigned'; byAgent[n] = (byAgent[n] || 0) + (parseFloat(d.gci) || 0) })
        const byStage = {}
        sel.forEach(d => { byStage[d.stage] = (byStage[d.stage] || 0) + 1 })
        return (
          <div style={{ marginBottom: '14px', background: '#1B2B4B', borderRadius: '12px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', boxShadow: '0 4px 16px rgba(0,0,0,.2)' }}>
            {/* Count */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: 28, height: 28, borderRadius: '8px', background: '#CC2200', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#fff' }}>{sel.length}</span>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>deal{sel.length !== 1 ? 's' : ''} selected</span>
            </div>
            {/* Divider */}
            <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,.15)' }} />
            {/* Production */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 900, color: '#fff' }}>{fmtFull$(selProd)}</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Volume</div>
            </div>
            {/* GCI */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 900, color: '#10B981' }}>{fmtFull$(selGCI)}</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>GCI</div>
            </div>
            {/* Avg GCI */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 900, color: '#F5A623' }}>{sel.length ? fmtFull$(selGCI / sel.length) : '—'}</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Avg GCI</div>
            </div>
            {/* Divider */}
            <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,.15)' }} />
            {/* By agent mini breakdown */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {Object.entries(byAgent).map(([name, gci]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '20px', background: 'rgba(255,255,255,.1)' }}>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,.7)', fontWeight: 600 }}>{name}</span>
                  <span style={{ fontSize: '11px', color: '#10B981', fontWeight: 800 }}>{fmtFull$(gci)}</span>
                </div>
              ))}
            </div>
            {/* By stage mini breakdown */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {Object.entries(byStage).map(([stage, count]) => {
                const hex = DEAL_STAGES.find(s => s.value === stage)?.hex || '#94A3B8'
                return (
                  <div key={stage} style={{ padding: '2px 8px', borderRadius: '12px', background: hex + '33', border: "1px solid " + (hex) + "66" }}>
                    <span style={{ fontSize: '10px', color: hex, fontWeight: 700 }}>{count} {stage}</span>
                  </div>
                )
              })}
            </div>
            {/* Spacer */}
            <div style={{ flex: 1 }} />
            {/* Bulk actions */}
            <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Quick stage change */}
              <select
                onChange={e => { if (e.target.value) { bulkUpdateStage(e.target.value); e.target.value = '' } }}
                defaultValue=""
                style={{ padding: '5px 8px', borderRadius: '7px', border: '1px solid rgba(255,255,255,.2)', background: 'rgba(255,255,255,.1)', color: '#fff', fontSize: '11px', fontFamily: ff, cursor: 'pointer' }}>
                <option value="" disabled>📊 Change stage...</option>
                {DEAL_STAGES.map(s => <option key={s.value} value={s.value} style={{ color: '#1E293B', background: '#fff' }}>{s.label}</option>)}
              </select>
              {can('deals.export') && (
              <button
                onClick={() => exportSelected(selectedIds, filtered, agents, canViewGci)}
                style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid rgba(255,255,255,.2)', background: 'transparent', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: ff }}>
                ⬇ Export {sel.length}
              </button>
              )}
              <button
                onClick={bulkDelete}
                disabled={bulkDeleting}
                style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid rgba(220,38,38,.5)', background: 'rgba(220,38,38,.2)', color: '#FCA5A5', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: ff }}>
                {bulkDeleting ? '⏳' : '🗑️'} Delete {sel.length}
              </button>
              <button
                onClick={() => setSelectedIds([])}
                style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid rgba(255,255,255,.2)', background: 'transparent', color: 'rgba(255,255,255,.7)', fontSize: '12px', cursor: 'pointer', fontFamily: ff }}>
                ✕ Clear
              </button>
            </div>
          </div>
        )
      })()}

      {/* ── CONTENT ── */}
      {loadError ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', background: '#fff', border: '1px solid #e6e9ef', borderRadius: 6 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#323338', marginBottom: 4 }}>Couldn't load the board</div>
          <div style={{ fontSize: 13, color: '#676879', marginBottom: 16 }}>{loadError}</div>
          <Btn onClick={load}>↻ Retry</Btn>
        </div>
      ) : loading ? <Loading /> : filtered.length === 0 ? (
        <Empty icon="📊" title="No deals found" sub="Try adjusting your filters or add your first deal."
          action={<Btn onClick={openNew}>+ Add Deal</Btn>} />
      ) : viewMode === 'board' ? (
        /* BOARD VIEW — Monday.com style */
        <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid ' + BOARD.border, borderRadius: 6 }}>
          {/* Sticky column header — SAME colgroup as every row table → exact alignment */}
          <table style={{ position: 'sticky', top: 0, zIndex: 10, borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%', background: BOARD.page }}>
            <BoardColgroup visibleCols={visibleCols} />
            <thead>
              <tr style={{ height: BOARD.HEAD_H, borderBottom: '2px solid ' + BOARD.border }}>
                <th style={{ borderRight: '1px solid ' + BOARD.cellBorder, position: 'sticky', left: 0, background: BOARD.page, zIndex: 11 }} />
                <th style={{ borderRight: '1px solid ' + BOARD.cellBorder, textAlign: 'left', padding: '0 12px', position: 'sticky', left: COL_CHECK, background: BOARD.page, zIndex: 11 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: BOARD.sub, textTransform: 'uppercase', letterSpacing: '.06em' }}>Item</span>
                </th>
                {visibleCols.map(col => (
                  <th key={col.key}
                    draggable
                    onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', col.key); setDraggedColKey(col.key) }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); handleColDrop(col.key) }}
                    style={{ textAlign: colAlign(col), padding: '0 10px', borderRight: '1px solid ' + BOARD.cellBorder, cursor: 'grab', background: draggedColKey === col.key ? '#e6f0fd' : 'transparent', overflow: 'hidden' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: BOARD.sub, textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{col.label}</span>
                  </th>
                ))}
                <th style={{ borderRight: '1px solid ' + BOARD.cellBorder }} />
              </tr>
            </thead>
          </table>

          {/* Groups */}
          {visibleGroups.map(group => (
            <BoardGroup
              key={group.id}
              group={group}
              deals={group.deals}
              agents={agents}
              onOpen={openDeal}
              onQuickUpdate={quickUpdate}
              isAdmin={isAdmin||canManage}
              selectedIds={selectedIds}
              onToggleSelect={id => setSelectedIds(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id])}
              onSelectAll={ids => setSelectedIds(p => { const s=new Set([...p,...ids]); return [...s] })}
              visibleCols={visibleCols}
              onRename={label => renameGroup(group.id, label)}
              onAddDeal={() => openNewWithGroup(group)}
              onDealDragStart={setDraggedDealId}
              onDropDeal={() => handleDealDrop(group)}
              isDragOver={dragOverGroupId === group.id}
              onDragEnterGroup={() => !group.yearMatch && setDragOverGroupId(group.id)}
              onDragLeaveGroup={() => setDragOverGroupId(null)}
              onDealDropOnRow={handleRowDrop}
              collapseSignal={collapseSignal}
            />
          ))}
          <div onClick={addGroup}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 74px', cursor: 'pointer', color: '#676879', fontSize: 13 }}
            onMouseEnter={e => e.currentTarget.style.background='#f5f6f8'}
            onMouseLeave={e => e.currentTarget.style.background='transparent'}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#0073ea' }}>+</span>
            <span>Add group</span>
          </div>
        </div>
      ) : (
        /* TABLE VIEW — flat list */
        <div style={{ overflowX: 'auto', background: 'var(--panel)', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {(agent?.hide_client_column ? ['','#','Address','Agent','Production','GCI','Stage','Side','A/O Date','Exp Close','Command','Source'] : ['','#','Address','Client','Agent','Production','GCI','Stage','Side','A/O Date','Exp Close','Command','Source']).map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Production' || h === 'GCI' ? 'right' : 'left', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap', background: 'var(--dim)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => {
                const a = agents.find(x => x.id === d.agent_id)
                const cmdDef = COMMAND_STATUSES.find(s => s.value === d.command)
                return (
                  <tr key={d.id} onClick={() => openDeal(d)} style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)', background: selectedIds.includes(d.id) ? 'rgba(204,34,0,.04)' : '' }}
                    onMouseEnter={e => { if (!selectedIds.includes(d.id)) e.currentTarget.style.background = 'var(--hov)' }}
                    onMouseLeave={e => { if (!selectedIds.includes(d.id)) e.currentTarget.style.background = '' }}>
                    <td style={{ padding: '9px 8px', width: '32px' }} onClick={e => { e.stopPropagation(); setSelectedIds(prev => prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id]) }}>
                      <div style={{ width: 16, height: 16, borderRadius: '4px', border: "2px solid " + (selectedIds.includes(d.id) ? '#CC2200' : 'var(--border)'), background: selectedIds.includes(d.id) ? '#CC2200' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', margin: '0 auto' }}>
                        {selectedIds.includes(d.id) && <span style={{ color: '#fff', fontSize: '9px', fontWeight: 900 }}>✓</span>}
                      </div>
                    </td>
                    <td style={{ padding: '9px 12px', fontSize: '11px', color: 'var(--muted)' }}>{i + 1}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '220px' }}>{d.addr}</div>
                    </td>
                    {!agent?.hide_client_column && <ClientLinkCell deal={d} width={170} />}
                    <td style={{ padding: '9px 12px' }}>
                      {a && <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Avatar agent={a} size={20} /><span style={{ fontSize: '11px', color: 'var(--muted)' }}>{a.name.split(' ')[0]}</span></div>}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, fontSize: '12px', whiteSpace: 'nowrap' }}>{fmtFull$(d.production)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#10B981', fontSize: '13px', whiteSpace: 'nowrap' }}>{fmtFull$(d.gci)}</td>
                    <td style={{ padding: '9px 12px' }}><StagePill stage={d.stage} small /></td>
                    <td style={{ padding: '9px 12px', fontSize: '11px', color: 'var(--muted)' }}>{d.side || '—'}</td>
                    <td style={{ padding: '9px 12px', fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDateShort(d.ao_date) || '—'}</td>
                    <td style={{ padding: '9px 12px', fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDateShort(d.expected_close_date) || '—'}</td>
                    <td style={{ padding: '9px 12px' }}>
                      {d.command && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: (cmdDef?.hex || '#94A3B8') + '22', color: cmdDef?.hex || '#94A3B8', fontWeight: 700 }}>{d.command}</span>}
                    </td>
                    <td style={{ padding: '9px 12px', fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{d.sales_source || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── ADD CUSTOM COLUMN ── */}
      {showAddCol && (
        <AddColumnModal onClose={() => setShowAddCol(false)} onCreate={createCustomColumn} />
      )}

      {/* ── DETAIL DRAWER ── */}
      {selected !== null && (
        <DealDrawer
          deal={selected?.id ? selected : null}
          agents={agents}
          saving={saving}
          isAdmin={isAdmin}
          canManage={canManage}
          readOnly={selected?.id ? !canEditDeal(selected) : false}
          onSave={saveDeal}
          onClose={closeDrawer}
          onDelete={deleteDeal}
        />
      )}
    </div>
  )
}

// ── ADD COLUMN MODAL ──────────────────────────────────────────────
function AddColumnModal({ onClose, onCreate }) {
  const [label,   setLabel]   = useState('')
  const [type,    setType]    = useState('text')
  const [optText, setOptText] = useState('')
  const [saving,  setSaving]  = useState(false)

  async function submit() {
    setSaving(true)
    await onCreate({
      label, type,
      options: type === 'select' ? optText.split(',').map(s => s.trim()).filter(Boolean) : undefined,
    })
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: ff }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, width: 360, padding: 20, boxShadow: '0 20px 50px rgba(0,0,0,.25)' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#323338', marginBottom: 14 }}>+ Add Column</div>

        <div style={{ fontSize: 11, fontWeight: 700, color: '#676879', marginBottom: 4 }}>Column Name</div>
        <input autoFocus value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Home Inspector"
          style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #c5c7d0', fontSize: 13, fontFamily: ff, boxSizing: 'border-box', marginBottom: 12 }} />

        <div style={{ fontSize: 11, fontWeight: 700, color: '#676879', marginBottom: 4 }}>Column Type</div>
        <select value={type} onChange={e => setType(e.target.value)}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #c5c7d0', fontSize: 13, fontFamily: ff, marginBottom: 12 }}>
          {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
        </select>

        {type === 'select' && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#676879', marginBottom: 4 }}>Options (comma-separated)</div>
            <input value={optText} onChange={e => setOptText(e.target.value)} placeholder="e.g. Yes, No, Pending"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #c5c7d0', fontSize: 13, fontFamily: ff, boxSizing: 'border-box', marginBottom: 12 }} />
          </>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '8px', borderRadius: 7, border: '1px solid #c5c7d0', background: '#fff', color: '#676879', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: ff }}>Cancel</button>
          <button onClick={submit} disabled={saving || !label.trim()}
            style={{ flex: 1, padding: '8px', borderRadius: 7, border: 'none', background: '#0073ea', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontFamily: ff, opacity: !label.trim() ? 0.5 : 1 }}>
            {saving ? 'Adding…' : 'Add Column'}
          </button>
        </div>
      </div>
    </div>
  )
}
