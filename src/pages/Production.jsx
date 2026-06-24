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

import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { fmt$, fmtDate, fmtDateShort, parseNum, matchSearch, getDaysUntil } from '../lib/utils'
import {
  DEAL_STAGES, CTC_STAGES, DEAL_SIDES, SALE_TYPES, PROPERTY_TYPES,
  BUYER_TYPES, SALES_SOURCES, COMMAND_STATUSES, REFERRAL_AGENTS
} from '../lib/constants'
import { Btn, Loading, Empty, Confirm, Avatar } from '../components/UI'
import { FileAttachments } from '../components/FileAttachments'
import { RecordActivity } from '../pages/ActivityLog'
import { ImportExport } from '../components/ImportExport'
import { useAgents } from '../lib/hooks'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const EXPORT_COLUMNS = [
  { key: 'addr',                 label: 'Address',              example: '123 Main St, Monsey NY 10952' },
  { key: 'unit',                 label: 'Unit',                 example: '201' },
  { key: 'side',                 label: 'Side',                 example: 'Buyer', type: 'text' },
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
const BOARD_GROUPS = [
  { id: 'active',       label: 'Accepted Offers',      stages: ['Negotiations','Offer Accapted'],        color: '#037f4c', emoji: '🤝' },
  { id: 'under_shtar',  label: 'Under Shtar',           stages: ['Under Shtar'],                         color: '#bb3354', emoji: '📝' },
  { id: 'under_contract',label: 'Under Contract',       stages: ['Under Contract'],                      color: '#757575', emoji: '📋' },
  { id: 'closed_2026',  label: 'Sold — 2026',           stages: ['Closed'],       yearMatch: '2026',      color: '#225091', emoji: '🎉' },
  { id: 'fell_2026',    label: 'Deal Fell Through — 2026',stages: ['Deal Fell Through'],yearMatch:'2026', color: '#ff007f', emoji: '💔' },
  { id: 'closed_2025',  label: 'Sold — 2025',           stages: ['Closed'],       yearMatch: '2025',      color: '#225091', emoji: '🎉' },
  { id: 'fell_2025',    label: 'Deal Fell Through — 2025',stages: ['Deal Fell Through'],yearMatch:'2025', color: '#ff007f', emoji: '💔' },
  { id: 'closed_2024',  label: 'Sold — 2024',           stages: ['Closed'],       yearMatch: '2024',      color: '#225091', emoji: '🎉' },
]

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
      border: `1px solid ${color}44`,
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
function DealRow({ deal, agents, onOpen, onQuickUpdate, isAdmin, isSelected, onToggleSelect }) {
  const agent = agents.find(a => a.id === deal.agent_id)
  const ctcDef = CTC_STAGES.find(s => s.value === deal.ctc)
  const cmdDef = COMMAND_STATUSES.find(s => s.value === deal.command)
  const daysToClose = deal.expected_close_date ? getDaysUntil(deal.expected_close_date) : null

  return (
    <tr
      onClick={() => onOpen(deal)}
      style={{ cursor: 'pointer', borderBottom: `1px solid var(--border)`, transition: 'background .1s', background: isSelected ? 'rgba(204,34,0,.04)' : '' }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--hov)' }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = '' }}
    >
      {/* Checkbox */}
      <td style={{ padding: '9px 8px', width: '32px' }} onClick={e => { e.stopPropagation(); onToggleSelect(deal.id) }}>
        <div style={{ width: 16, height: 16, borderRadius: '4px', border: `2px solid ${isSelected ? '#CC2200' : 'var(--border)'}`, background: isSelected ? '#CC2200' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .12s', margin: '0 auto' }}>
          {isSelected && <span style={{ color: '#fff', fontSize: '9px', fontWeight: 900, lineHeight: 1 }}>✓</span>}
        </div>
      </td>
      {/* Address */}
      <td style={{ padding: '9px 12px', maxWidth: '200px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {deal.addr}
          {deal.unit && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> #{deal.unit}</span>}
        </div>
        {deal.client_name && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.client_name}</div>}
      </td>

      {/* Agent */}
      <td style={{ padding: '9px 12px' }}>
        {agent ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Avatar agent={agent} size={20} />
            <span style={{ fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{agent.name.split(' ')[0]}</span>
          </div>
        ) : <span style={{ color: 'var(--muted)', fontSize: '11px' }}>—</span>}
      </td>

      {/* Production */}
      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, fontSize: '12px', color: 'var(--text)', whiteSpace: 'nowrap' }}>
        {deal.production ? fmt$(deal.production) : '—'}
      </td>

      {/* GCI */}
      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, fontSize: '13px', color: '#10B981', whiteSpace: 'nowrap' }}>
        {deal.gci ? fmt$(deal.gci) : '—'}
      </td>

      {/* Stage — inline */}
      <td style={{ padding: '9px 12px' }} onClick={e => e.stopPropagation()}>
        <InlinePicker
          value={deal.stage}
          options={DEAL_STAGES}
          color={DEAL_STAGES.find(s => s.value === deal.stage)?.hex}
          onSave={v => onQuickUpdate(deal, 'stage', v)}
        />
      </td>

      {/* Side */}
      <td style={{ padding: '9px 12px' }}>
        <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>{deal.side || '—'}</span>
      </td>

      {/* Command — inline */}
      <td style={{ padding: '9px 12px', maxWidth: '130px' }} onClick={e => e.stopPropagation()}>
        <InlinePicker
          value={deal.command}
          options={COMMAND_STATUSES.filter(c => c.value)}
          color={cmdDef?.hex}
          onSave={v => onQuickUpdate(deal, 'command', v)}
        />
      </td>

      {/* CTC — inline */}
      <td style={{ padding: '9px 12px' }} onClick={e => e.stopPropagation()}>
        <InlinePicker
          value={deal.ctc}
          options={CTC_STAGES}
          color={ctcDef?.hex}
          onSave={v => onQuickUpdate(deal, 'ctc', v)}
        />
      </td>

      {/* A/O Date */}
      <td style={{ padding: '9px 12px', fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
        {fmtDateShort(deal.ao_date) || '—'}
      </td>

      {/* Expected Close */}
      <td style={{ padding: '9px 12px', fontSize: '11px', whiteSpace: 'nowrap' }}>
        {deal.expected_close_date ? (
          <span style={{ color: daysToClose !== null && daysToClose <= 7 && daysToClose >= 0 ? '#DC2626' : 'var(--muted)', fontWeight: daysToClose !== null && daysToClose <= 7 ? 700 : 400 }}>
            {fmtDateShort(deal.expected_close_date)}
            {daysToClose !== null && daysToClose >= 0 && daysToClose <= 30 && (
              <span style={{ marginLeft: '4px', fontSize: '10px' }}>({daysToClose}d)</span>
            )}
          </span>
        ) : '—'}
      </td>

      {/* Sale Type */}
      <td style={{ padding: '9px 12px', fontSize: '11px', color: 'var(--muted)' }}>{deal.sale_type || '—'}</td>

      {/* Property Type */}
      <td style={{ padding: '9px 12px', fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{deal.property_type || '—'}</td>

      {/* Commission Received — inline */}
      <td style={{ padding: '9px 12px' }} onClick={e => e.stopPropagation()}>
        <InlinePicker
          value={deal.commission_received}
          options={COMMISSION_OPTIONS}
          color={deal.commission_received === 'Done' ? '#10B981' : deal.commission_received === 'Stuck' ? '#DC2626' : '#F5A623'}
          onSave={v => onQuickUpdate(deal, 'commission_received', v)}
        />
      </td>
    </tr>
  )
}

// ── BOARD GROUP ────────────────────────────────────────────────────
function BoardGroup({ group, deals, agents, onOpen, onQuickUpdate, isAdmin, selectedIds, onToggleSelect, onSelectAll }) {
  const [collapsed, setCollapsed] = useState(false)
  const totalGCI  = deals.reduce((s, d) => s + parseNum(d.gci), 0)
  const totalProd = deals.reduce((s, d) => s + parseNum(d.production), 0)

  return (
    <div style={{ marginBottom: '20px' }}>
      {/* Group Header */}
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '8px 12px',
          background: group.color + '18',
          borderLeft: `4px solid ${group.color}`,
          borderRadius: '8px',
          cursor: 'pointer',
          userSelect: 'none',
          marginBottom: '4px',
        }}
      >
        <span style={{ fontSize: '14px' }}>{group.emoji}</span>
        <span style={{ fontSize: '13px', fontWeight: 800, color: group.color }}>{group.label}</span>
        <span style={{ fontSize: '11px', fontWeight: 600, color: group.color, background: group.color + '22', padding: '1px 7px', borderRadius: '20px' }}>
          {deals.length}
        </span>
        {/* Select all in group */}
        {deals.length > 0 && (
          <div
            onClick={e => { e.stopPropagation(); onSelectAll(deals.map(d => d.id)) }}
            style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 600, cursor: 'pointer', padding: '2px 6px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--panel)' }}
            title="Select all in this group"
          >
            {deals.every(d => selectedIds.includes(d.id)) ? '☑ All' : '☐ Select all'}
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '16px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>GCI: <strong style={{ color: '#10B981' }}>{fmt$(totalGCI)}</strong></span>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Vol: <strong>{fmt$(totalProd)}</strong></span>
          <span style={{ fontSize: '12px', color: 'var(--muted)', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)', transition: 'transform .2s', display: 'inline-block' }}>▾</span>
        </div>
      </div>

      {!collapsed && deals.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {['','Address / Client','Agent','Production','GCI','Stage','Side','Command','CTC','A/O Date','Exp. Close','Sale Type','Prop Type','Commission'].map(h => (
                  <th key={h} style={{ padding: '6px 12px', textAlign: h === 'Production' || h === 'GCI' ? 'right' : 'left', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deals.map(d => (
                <DealRow key={d.id} deal={d} agents={agents} onOpen={onOpen} onQuickUpdate={onQuickUpdate} isAdmin={isAdmin}
                  isSelected={selectedIds.includes(d.id)} onToggleSelect={onToggleSelect} />
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--dim)' }}>
                <td colSpan={2} style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 700, color: 'var(--muted)' }}>
                  {deals.length} deal{deals.length !== 1 ? 's' : ''}
                </td>
                <td style={{ padding: '6px 12px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'var(--text)' }}>{fmt$(totalProd)}</td>
                <td style={{ padding: '6px 12px', textAlign: 'right', fontSize: '12px', fontWeight: 800, color: '#10B981' }}>{fmt$(totalGCI)}</td>
                <td colSpan={9} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {!collapsed && deals.length === 0 && (
        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--muted)', fontSize: '12px', fontStyle: 'italic' }}>No deals in this group</div>
      )}
    </div>
  )
}

// ── DEAL DETAIL DRAWER ─────────────────────────────────────────────
function DealDrawer({ deal, agents, onSave, onClose, onDelete, saving, isAdmin, canManage }) {
  const [form, setForm] = useState(() => ({ ...BLANK, ...deal }))
  const [tab,  setTab]  = useState('deal')
  const [confirmDel, setConfirmDel] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { setForm({ ...BLANK, ...deal }) }, [deal?.id])

  const TABS = [
    { id: 'deal',     label: '📋 Deal' },
    { id: 'status',   label: '🔄 Status' },
    { id: 'contacts', label: '👥 Contacts' },
    { id: 'finance',  label: '💰 Finance' },
    { id: 'ctc',      label: '📆 Contract' },
    { id: 'files',    label: '📎 Files' },
    { id: 'activity', label: '📜 Activity' },
  ]

  const Lbl = ({ children, required }) => (
    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '4px' }}>
      {children}{required && <span style={{ color: '#DC2626' }}> *</span>}
    </div>
  )
  const Inp = ({ k, type = 'text', placeholder, half }) => (
    <input type={type} value={form[k] || ''} onChange={e => set(k, e.target.value)} placeholder={placeholder}
      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff, boxSizing: 'border-box' }} />
  )
  const Sel = ({ k, options, placeholder }) => (
    <select value={form[k] || ''} onChange={e => set(k, e.target.value)}
      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
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
                {form.gci && <span style={{ fontSize: '12px', fontWeight: 800, color: '#10B981' }}>{fmt$(form.gci)} GCI</span>}
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
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {[
              { label: 'Stage', value: form.stage, options: DEAL_STAGES, key: 'stage' },
              { label: 'CTC',   value: form.ctc,   options: CTC_STAGES,  key: 'ctc'   },
            ].map(q => (
              <div key={q.key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700 }}>{q.label}:</span>
                <select value={q.value || ''} onChange={e => set(q.key, e.target.value)}
                  style={{ padding: '3px 6px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '11px', fontFamily: ff }}>
                  <option value="">—</option>
                  {q.options.map(o => <option key={typeof o === 'string' ? o : o.value} value={typeof o === 'string' ? o : o.value}>{typeof o === 'string' ? o : o.label}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', overflowX: 'auto', flexShrink: 0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer',
                borderBottom: tab === t.id ? `2px solid ${stageHex}` : '2px solid transparent',
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
                <Field label="Address" required><Inp k="addr" placeholder="123 Main St, Monsey NY 10952" /></Field>
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
                <Field label="Client Name"><Inp k="client_name" placeholder="John Smith" /></Field>
                <Field label="Client Legal Name"><Inp k="client_legal_name" placeholder="For closing docs" /></Field>
                <Field label="Client Phone"><Inp k="client_phone" type="tel" placeholder="(845) 555-1234" /></Field>
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
                <Field label="GCI $"><Inp k="gci" type="number" placeholder="15000" /></Field>
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

              {/* Finance summary card */}
              {(form.production || form.gci) && (
                <div style={{ background: 'var(--dim)', borderRadius: '10px', padding: '14px 16px', border: '1px solid var(--border)', marginTop: '8px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Summary</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <div>
                      <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text)' }}>{fmt$(form.production)}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Volume</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '20px', fontWeight: 900, color: '#10B981' }}>{fmt$(form.gci)}</div>
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
                        border: `1px solid ${isActive ? stage.hex : 'var(--border)'}`,
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
          {deal?.id && (
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
        </div>
      </div>

      <Confirm
        open={confirmDel}
        message={`Delete deal at "${form.addr}"? This cannot be undone.`}
        onConfirm={() => { onDelete(); setConfirmDel(false) }}
        onCancel={() => setConfirmDel(false)}
      />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════
function exportSelected(selectedIds, filtered, agents) {
  const sel = filtered.filter(d => selectedIds.includes(d.id))
  const header = 'Address,Side,Stage,Production,GCI,A/O Date,Close Date,Client,Agent'
  const rows = sel.map(d => {
    const a = agents.find(x => x.id === d.agent_id)
    return [d.addr, d.side, d.stage, d.production, d.gci, d.ao_date, d.close_date, d.client_name, a ? a.name : '']
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
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()
  const { agents } = useAgents()

  const [deals,    setDeals]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [stageF,   setStageF]   = useState('')
  const [agentF,   setAgentF]   = useState('')
  const [sideF,    setSideF]    = useState('')
  const [yearF,    setYearF]    = useState(new Date().getFullYear().toString())
  const [selected, setSelected] = useState(null) // deal being edited, or {} for new
  const [saving,   setSaving]   = useState(false)
  const [viewMode,    setViewMode]    = useState('board') // 'board' | 'table'
  const [selectedIds, setSelectedIds] = useState([])

  const years = []
  for (let y = new Date().getFullYear(); y >= 2015; y--) years.push(y.toString())

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      let q = supabase.from('deals').select('*, agents(id,name,color)').order('ao_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
      if (!isAdmin && !canManage) q = q.eq('agent_id', agent?.id)
      const { data } = await q
      setDeals(data || [])
    } catch(e) { toast('Could not load deals: ' + e.message, '#DC2626') }
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
    setSaving(true)
    try {
      if (form.id) {
        const { data, error } = await supabase.from('deals').update({ ...form, updated_at: new Date().toISOString() }).eq('id', form.id).select('*, agents(id,name,color)').single()
        if (error) throw error
        setDeals(prev => prev.map(d => d.id === form.id ? data : d))
        setSelected(data)
        toast('✅ Deal saved')
      } else {
        const { data, error } = await supabase.from('deals').insert({ ...form, agent_id: form.agent_id || agent?.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select('*, agents(id,name,color)').single()
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
    try {
      await supabase.from('deals').delete().eq('id', selected.id)
      setDeals(prev => prev.filter(d => d.id !== selected.id))
      toast('Deal deleted')
      closeDrawer()
    } catch(e) { toast('Delete failed: ' + e.message, '#DC2626') }
  }

  async function quickUpdate(deal, field, value) {
    try {
      const { data, error } = await supabase.from('deals').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', deal.id).select('*, agents(id,name,color)').single()
      if (error) throw error
      setDeals(prev => prev.map(d => d.id === deal.id ? data : d))
    } catch(e) { toast('Update failed: ' + e.message, '#DC2626') }
  }

  // ── FILTERING ──────────────────────────────────────────────────
  const filtered = deals.filter(d => {
    if (stageF && d.stage !== stageF) return false
    if (agentF && d.agent_id !== agentF) return false
    if (sideF  && d.side  !== sideF)  return false
    if (search && !matchSearch(d.addr + ' ' + (d.client_name || '') + ' ' + (d.atty_name || ''), search)) return false
    if (yearF) {
      const year = d.ao_date?.slice(0, 4) || d.close_date?.slice(0, 4) || d.created_at?.slice(0, 4)
      if (year !== yearF) return false
    }
    return true
  })

  // Board groups
  const groupedDeals = BOARD_GROUPS.map(group => ({
    ...group,
    deals: filtered.filter(d => {
      const stageMatch = group.stages.includes(d.stage)
      if (!stageMatch) return false
      if (group.yearMatch) {
        const year = d.close_date?.slice(0, 4) || d.ao_date?.slice(0, 4) || d.created_at?.slice(0, 4)
        return year === group.yearMatch
      }
      // Active groups: no year filter needed (show regardless of year)
      if (!group.yearMatch && (group.id === 'active' || group.id === 'under_shtar' || group.id === 'under_contract')) {
        return true
      }
      return false
    }),
  })).filter(g => g.yearMatch ? true : g.deals.length > 0 || ['active','under_shtar','under_contract'].includes(g.id))

  // Stats
  const totalGCIAll   = filtered.reduce((s, d) => s + parseNum(d.gci), 0)
  const closedArr     = filtered.filter(d => d.stage === 'Closed')
  const closedGCI     = closedArr.reduce((s, d) => s + parseNum(d.gci), 0)
  const activeArr     = filtered.filter(d => !['Closed','Deal Fell Through'].includes(d.stage))
  const pipelineGCI   = activeArr.reduce((s, d) => s + parseNum(d.gci), 0)

  return (
    <div style={{ fontFamily: ff }}>

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)' }}>📊 Production Sheet</div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
            {filtered.length} deals · {fmt$(totalGCIAll)} GCI
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* View mode */}
          <div style={{ display: 'flex', background: 'var(--dim)', borderRadius: '8px', padding: '3px', gap: '2px' }}>
            {[['board','📋 Board'],['table','📊 Table']].map(([m,l]) => (
              <button key={m} onClick={() => setViewMode(m)}
                style={{ padding: '5px 10px', borderRadius: '6px', border: 'none', background: viewMode === m ? 'var(--panel)' : 'transparent', color: viewMode === m ? 'var(--text)' : 'var(--muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: ff, boxShadow: viewMode === m ? '0 1px 3px rgba(0,0,0,.12)' : 'none' }}>
                {l}
              </button>
            ))}
          </div>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
        {[
          { label: 'Total Deals',    value: filtered.length,      color: '#3B82F6', prefix: '' },
          { label: 'Active',         value: activeArr.length,     color: '#037f4c', prefix: '' },
          { label: 'Closed GCI',     value: fmt$(closedGCI),      color: '#10B981', prefix: '' },
          { label: 'Pipeline GCI',   value: fmt$(pipelineGCI),    color: '#F5A623', prefix: '' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--panel)', borderRadius: '10px', border: '1px solid var(--border)', padding: '12px 14px', borderLeft: `3px solid ${s.color}` }}>
            <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text)' }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── FILTERS ── */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search address, client, attorney..."
          style={{ flex: 1, minWidth: '200px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }} />
        <select value={yearF} onChange={e => setYearF(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
          <option value="">All Years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={stageF} onChange={e => setStageF(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
          <option value="">All Stages</option>
          {DEAL_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={sideF} onChange={e => setSideF(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
          <option value="">All Sides</option>
          {DEAL_SIDES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(isAdmin || canManage) && (
          <select value={agentF} onChange={e => setAgentF(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
            <option value="">All Agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        {(stageF || agentF || sideF || search) && (
          <button onClick={() => { setStageF(''); setAgentF(''); setSideF(''); setSearch('') }}
            style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px', fontFamily: ff }}>
            ✕ Clear
          </button>
        )}
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
              <div style={{ fontSize: '16px', fontWeight: 900, color: '#fff' }}>{fmt$(selProd)}</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Volume</div>
            </div>
            {/* GCI */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 900, color: '#10B981' }}>{fmt$(selGCI)}</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>GCI</div>
            </div>
            {/* Avg GCI */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 900, color: '#F5A623' }}>{sel.length ? fmt$(selGCI / sel.length) : '—'}</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Avg GCI</div>
            </div>
            {/* Divider */}
            <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,.15)' }} />
            {/* By agent mini breakdown */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {Object.entries(byAgent).map(([name, gci]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '20px', background: 'rgba(255,255,255,.1)' }}>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,.7)', fontWeight: 600 }}>{name}</span>
                  <span style={{ fontSize: '11px', color: '#10B981', fontWeight: 800 }}>{fmt$(gci)}</span>
                </div>
              ))}
            </div>
            {/* By stage mini breakdown */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {Object.entries(byStage).map(([stage, count]) => {
                const hex = DEAL_STAGES.find(s => s.value === stage)?.hex || '#94A3B8'
                return (
                  <div key={stage} style={{ padding: '2px 8px', borderRadius: '12px', background: hex + '33', border: `1px solid ${hex}66` }}>
                    <span style={{ fontSize: '10px', color: hex, fontWeight: 700 }}>{count} {stage}</span>
                  </div>
                )
              })}
            </div>
            {/* Spacer */}
            <div style={{ flex: 1 }} />
            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              <button
                onClick={() => exportSelected(selectedIds, filtered, agents)}
                style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid rgba(255,255,255,.2)', background: 'transparent', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: ff }}>
                ⬇ Export {sel.length}
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
      {loading ? <Loading /> : filtered.length === 0 ? (
        <Empty icon="📊" title="No deals found" sub="Try adjusting your filters or add your first deal."
          action={<Btn onClick={openNew}>+ Add Deal</Btn>} />
      ) : viewMode === 'board' ? (
        /* BOARD VIEW */
        <div>
          {groupedDeals.map(group => (
            <BoardGroup
              key={group.id}
              group={group}
              deals={group.deals}
              agents={agents}
              onOpen={openDeal}
              onQuickUpdate={quickUpdate}
              isAdmin={isAdmin}
              selectedIds={selectedIds}
              onToggleSelect={id => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
              onSelectAll={ids => setSelectedIds(prev => {
                const allSelected = ids.every(id => prev.includes(id))
                return allSelected ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])]
              })}
            />
          ))}
        </div>
      ) : (
        /* TABLE VIEW — flat list */
        <div style={{ overflowX: 'auto', background: 'var(--panel)', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {['','#','Address','Agent','Production','GCI','Stage','Side','A/O Date','Exp Close','Command','Source'].map(h => (
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
                      <div style={{ width: 16, height: 16, borderRadius: '4px', border: `2px solid ${selectedIds.includes(d.id) ? '#CC2200' : 'var(--border)'}`, background: selectedIds.includes(d.id) ? '#CC2200' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', margin: '0 auto' }}>
                        {selectedIds.includes(d.id) && <span style={{ color: '#fff', fontSize: '9px', fontWeight: 900 }}>✓</span>}
                      </div>
                    </td>
                    <td style={{ padding: '9px 12px', fontSize: '11px', color: 'var(--muted)' }}>{i + 1}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '220px' }}>{d.addr}</div>
                      {d.client_name && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{d.client_name}</div>}
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      {a && <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Avatar agent={a} size={20} /><span style={{ fontSize: '11px', color: 'var(--muted)' }}>{a.name.split(' ')[0]}</span></div>}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, fontSize: '12px', whiteSpace: 'nowrap' }}>{fmt$(d.production)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#10B981', fontSize: '13px', whiteSpace: 'nowrap' }}>{fmt$(d.gci)}</td>
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

      {/* ── DETAIL DRAWER ── */}
      {selected !== null && (
        <DealDrawer
          deal={selected?.id ? selected : null}
          agents={agents}
          saving={saving}
          isAdmin={isAdmin}
          canManage={canManage}
          onSave={saveDeal}
          onClose={closeDrawer}
          onDelete={deleteDeal}
        />
      )}
    </div>
  )
}
