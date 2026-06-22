// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Production Sheet
// The main deal tracking board. Mirrors the Monday.com
// Production Sheet exactly — all stages, sides, statuses.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useDeals, useAgents } from '../lib/hooks'
import { db } from '../lib/db'
import { fmt$, fmtDate, fmtDateShort, parseNum, matchSearch, totalGCI, closedDeals } from '../lib/utils'
import {
  DEAL_STAGES, CTC_STAGES, DEAL_SIDES, SALE_TYPES, PROPERTY_TYPES,
  BUYER_TYPES, SALES_SOURCES, COMMAND_STATUSES, SIGN_STATUSES,
  COMMISSION_STATUSES, AGENT_COMMISSION_STATUSES, REFERRAL_AGENTS
} from '../lib/constants'
import {
  PageHeader, Btn, Modal, Field, Input, Select, Textarea, Pill,
  SearchInput, Avatar, ModalActions, Loading, Empty, Tabs,
  SectionTitle, StatCard, Grid, Confirm, Divider, InlineEdit
} from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const BLANK = {
  addr: '', unit: '', client_name: '', client_legal_name: '', client_email: '',
  client_phone: '', atty_name: '', atty_email: '', side: 'Buyer',
  stage: 'Negotiations', ctc: '', command: '', sign: '', sale_type: 'On Market',
  property_type: '', referral_agent: 'None', sales_source: '', production: '',
  gci: '', commission_received: '', agent_commission_sent: '',
  ao_date: '', contract_date: '', expected_close_date: '', close_date: '',
  notes: ''
}

export function Production() {
  const navigate = useNavigate()
  const { id: urlId } = useParams()
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()

  const filters = isAdmin || canManage ? {} : { agent_id: agent?.id }
  const { deals, loading, add, update, remove } = useDeals(filters)
  const { agents } = useAgents()

  const [search,  setSearch]  = useState('')
  const [stageF,  setStageF]  = useState('')
  const [agentF,  setAgentF]  = useState('')
  const [yearF,   setYearF]   = useState(new Date().getFullYear().toString())
  const [selected,setSelected] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form,    setForm]    = useState(BLANK)
  const [saving,  setSaving]  = useState(false)
  const [tab,     setTab]     = useState('deal')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (urlId && deals.length > 0 && urlId !== 'new') {
      const d = deals.find(x => x.id === urlId)
      if (d) openDeal(d)
    }
    if (urlId === 'new') { setSelected(null); setForm({ ...BLANK, agent_id: agent?.id }); setShowAdd(true) }
  }, [urlId, deals.length])

  function openDeal(d) {
    navigate('/production/' + d.id, { replace: true })
    setSelected(d)
    setForm({ ...BLANK, ...d })
    setShowAdd(false)
    setTab('deal')
  }

  function openAdd() {
    setSelected(null)
    setForm({ ...BLANK, agent_id: agent?.id })
    setShowAdd(true)
    navigate('/production/new', { replace: true })
  }

  function closePanel() {
    setSelected(null)
    setShowAdd(false)
    navigate('/production', { replace: true })
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function saveDeal() {
    if (!form.addr.trim()) { toast('Address is required', '#DC2626'); return }
    setSaving(true)
    try {
      if (selected) {
        const updated = await update(selected.id, form)
        setSelected(updated)
        toast('✅ Deal saved')
      } else {
        const created = await add({ ...form, agent_id: form.agent_id || agent?.id })
        toast('✅ Deal added')
        navigate('/production/' + created.id)
        closePanel()
      }
    } catch(e) {
      toast('Save failed: ' + e.message, '#DC2626')
    } finally { setSaving(false) }
  }

  async function deleteDeal() {
    try {
      await remove(selected.id)
      toast('Deal deleted')
      closePanel()
    } catch(e) {
      toast('Delete failed: ' + e.message, '#DC2626')
    } finally { setConfirmDelete(false) }
  }

  // Quick inline stage update
  async function quickUpdate(deal, field, value) {
    try {
      await update(deal.id, { [field]: value })
      toast('✅ Updated')
    } catch(e) {
      toast('Update failed: ' + e.message, '#DC2626')
    }
  }

  const filtered = deals.filter(d => {
    if (stageF  && d.stage    !== stageF)  return false
    if (agentF  && d.agent_id !== agentF)  return false
    if (search  && !matchSearch(d, search, ['addr','client_name','atty_name'])) return false
    if (yearF   && d.ao_date  && !d.ao_date.startsWith(yearF)) return false
    return true
  })

  const stageColor = (s) => DEAL_STAGES.find(x => x.value === s)?.hex || '#c4c4c4'

  // Stats
  const activeDeals = filtered.filter(d => !['Closed','Deal Fell Through'].includes(d.stage))
  const closedDealsArr = filtered.filter(d => d.stage === 'Closed')
  const totalGCIAll = filtered.reduce((s, d) => s + parseNum(d.gci), 0)
  const closedGCI   = closedDealsArr.reduce((s, d) => s + parseNum(d.gci), 0)

  const years = []
  for (let y = new Date().getFullYear(); y >= 2015; y--) years.push(y.toString())

  return (
    <div style={{ fontFamily: ff }}>
      <PageHeader
        title="Production Sheet"
        sub={`${filtered.length} deals · ${fmt$(totalGCIAll)} GCI`}
        actions={
          <Btn onClick={openAdd}>+ Add Deal</Btn>
        }
      />

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <StatCard label="Total Deals" value={filtered.length} icon="📊" />
        <StatCard label="Active" value={activeDeals.length} accent="#037f4c" icon="⚡" />
        <StatCard label="Closed GCI" value={fmt$(closedGCI)} accent="#00c875" icon="✅" />
        <StatCard label="Pipeline GCI" value={fmt$(totalGCIAll - closedGCI)} accent="#F5A623" icon="🔀" />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search address, client..." style={{ flex: 1, minWidth: '200px' }} />
        <select value={yearF} onChange={e => setYearF(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
          <option value="">All Years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={stageF} onChange={e => setStageF(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
          <option value="">All Stages</option>
          {DEAL_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {(isAdmin || canManage) && (
          <select value={agentF} onChange={e => setAgentF(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
            <option value="">All Agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>

      {loading && <Loading />}
      {!loading && filtered.length === 0 && (
        <Empty icon="📊" title="No deals yet" sub="Add your first deal to track production." action={<Btn onClick={openAdd}>+ Add Deal</Btn>} />
      )}

      {/* Deals Table */}
      {!loading && filtered.length > 0 && (
        <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--dim)' }}>
                  {['Address','Client','Agent','Stage','Side','Production','GCI','A/O Date','Command'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((d, i) => (
                  <tr key={d.id} onClick={() => openDeal(d)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selected?.id === d.id ? 'rgba(204,34,0,.04)' : '' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--hov)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = selected?.id === d.id ? 'rgba(204,34,0,.04)' : '' }}>
                    <td style={{ padding: '11px 12px', fontWeight: 600, color: 'var(--text)', maxWidth: '180px' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.addr}</div>
                      {d.unit && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Unit {d.unit}</div>}
                    </td>
                    <td style={{ padding: '11px 12px', color: 'var(--muted)', maxWidth: '140px' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.client_name || '—'}</div>
                    </td>
                    <td style={{ padding: '11px 12px' }}>
                      {d.agents ? <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Avatar agent={d.agents} size={22} /><span style={{ fontSize: '12px', color: 'var(--muted)' }}>{d.agents.name?.split(' ')[0]}</span></div> : '—'}
                    </td>
                    <td style={{ padding: '11px 12px' }}>
                      <Pill label={d.stage} color={stageColor(d.stage)} />
                    </td>
                    <td style={{ padding: '11px 12px', color: 'var(--muted)', fontSize: '12px' }}>{d.side || '—'}</td>
                    <td style={{ padding: '11px 12px', fontWeight: 600, color: 'var(--text)' }}>{fmt$(d.production)}</td>
                    <td style={{ padding: '11px 12px', fontWeight: 700, color: '#10B981' }}>{fmt$(d.gci)}</td>
                    <td style={{ padding: '11px 12px', color: 'var(--muted)', fontSize: '12px' }}>{fmtDateShort(d.ao_date)}</td>
                    <td style={{ padding: '11px 12px' }}>
                      {d.command ? <Pill label={d.command} color={COMMAND_STATUSES.find(x => x.value === d.command)?.hex || '#c4c4c4'} /> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <Modal open={!!(selected || showAdd)} onClose={closePanel} title={selected ? selected.addr : 'New Deal'} width={680}>
        <Tabs tabs={[
          { id: 'deal', label: 'Deal Info' },
          { id: 'contacts', label: 'Client / Atty' },
          { id: 'status', label: 'Status & Dates' },
          { id: 'finance', label: 'Finance' },
          { id: 'notes', label: 'Notes' },
        ]} active={tab} onChange={setTab} />

        {/* DEAL INFO TAB */}
        {tab === 'deal' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="Address" required>
                <Input value={form.addr} onChange={v => set('addr', v)} placeholder="123 Main St" />
              </Field>
              <Field label="Unit">
                <Input value={form.unit} onChange={v => set('unit', v)} placeholder="Apt 2B" />
              </Field>
              <Field label="Side">
                <Select value={form.side} onChange={v => set('side', v)} options={DEAL_SIDES} />
              </Field>
              <Field label="Stage">
                <Select value={form.stage} onChange={v => set('stage', v)} options={DEAL_STAGES} />
              </Field>
              <Field label="Sale Type">
                <Select value={form.sale_type} onChange={v => set('sale_type', v)} options={SALE_TYPES} />
              </Field>
              <Field label="Property Type">
                <Select value={form.property_type} onChange={v => set('property_type', v)} options={PROPERTY_TYPES} placeholder="Select type" />
              </Field>
              <Field label="Sales Source">
                <Select value={form.sales_source} onChange={v => set('sales_source', v)} options={SALES_SOURCES} placeholder="How did this come in?" />
              </Field>
              <Field label="Referral Agent">
                <Select value={form.referral_agent} onChange={v => set('referral_agent', v)} options={REFERRAL_AGENTS} />
              </Field>
            </div>
            {(isAdmin || canManage) && (
              <Field label="Assigned Agent">
                <Select value={form.agent_id || ''} onChange={v => set('agent_id', v)} options={agents.map(a => ({ value: a.id, label: a.name }))} placeholder="Assign to agent" />
              </Field>
            )}
          </div>
        )}

        {/* CLIENT / ATTY TAB */}
        {tab === 'contacts' && (
          <div>
            <SectionTitle>Client Info</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="Client Name">
                <Input value={form.client_name} onChange={v => set('client_name', v)} placeholder="John Smith" />
              </Field>
              <Field label="Client Legal Name">
                <Input value={form.client_legal_name} onChange={v => set('client_legal_name', v)} placeholder="Legal name for closing docs" />
              </Field>
              <Field label="Client Phone">
                <Input value={form.client_phone} onChange={v => set('client_phone', v)} placeholder="(845) 555-1234" type="tel" />
              </Field>
              <Field label="Client Email">
                <Input value={form.client_email} onChange={v => set('client_email', v)} placeholder="client@email.com" type="email" />
              </Field>
            </div>
            <SectionTitle>Attorney</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="Attorney Name">
                <Input value={form.atty_name} onChange={v => set('atty_name', v)} placeholder="Attorney name" />
              </Field>
              <Field label="Attorney Email">
                <Input value={form.atty_email} onChange={v => set('atty_email', v)} placeholder="atty@law.com" type="email" />
              </Field>
            </div>
          </div>
        )}

        {/* STATUS & DATES TAB */}
        {tab === 'status' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="Command">
                <Select value={form.command} onChange={v => set('command', v)} options={COMMAND_STATUSES.filter(c => c.value)} placeholder="Command status" />
              </Field>
              <Field label="Contract to Close">
                <Select value={form.ctc} onChange={v => set('ctc', v)} options={CTC_STAGES} placeholder="CTC stage" />
              </Field>
              <Field label="Sign Status">
                <Select value={form.sign} onChange={v => set('sign', v)} options={SIGN_STATUSES} placeholder="Sign status" />
              </Field>
              <Field label="A/O Date">
                <Input value={form.ao_date} onChange={v => set('ao_date', v)} type="date" />
              </Field>
              <Field label="Contract Date">
                <Input value={form.contract_date} onChange={v => set('contract_date', v)} type="date" />
              </Field>
              <Field label="Expected Closing">
                <Input value={form.expected_close_date} onChange={v => set('expected_close_date', v)} type="date" />
              </Field>
              <Field label="Close Date">
                <Input value={form.close_date} onChange={v => set('close_date', v)} type="date" />
              </Field>
            </div>
          </div>
        )}

        {/* FINANCE TAB */}
        {tab === 'finance' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="Production $">
                <Input value={form.production} onChange={v => set('production', v)} placeholder="500000" type="number" />
              </Field>
              <Field label="GCI $">
                <Input value={form.gci} onChange={v => set('gci', v)} placeholder="15000" type="number" />
              </Field>
              <Field label="Commission Received">
                <Select value={form.commission_received} onChange={v => set('commission_received', v)} options={COMMISSION_STATUSES} placeholder="Status" />
              </Field>
              <Field label="Agent Commission Sent">
                <Select value={form.agent_commission_sent} onChange={v => set('agent_commission_sent', v)} options={AGENT_COMMISSION_STATUSES} placeholder="Status" />
              </Field>
            </div>
          </div>
        )}

        {/* NOTES TAB */}
        {tab === 'notes' && (
          <Field label="Notes">
            <Textarea value={form.notes} onChange={v => set('notes', v)} placeholder="Deal notes..." rows={8} />
          </Field>
        )}

        <ModalActions>
          {selected && (
            <Btn variant="ghost" style={{ marginRight: 'auto', color: '#DC2626' }} onClick={() => setConfirmDelete(true)}>Delete</Btn>
          )}
          <Btn variant="secondary" onClick={closePanel}>Cancel</Btn>
          <Btn onClick={saveDeal} loading={saving}>{selected ? 'Save Changes' : 'Add Deal'}</Btn>
        </ModalActions>
      </Modal>

      <Confirm
        open={confirmDelete}
        message={`Delete deal at ${selected?.addr}? This cannot be undone.`}
        onConfirm={deleteDeal}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
