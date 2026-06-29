// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Transactions Page
// Tracks every deal from Offer Accepted through Closing.
// Mirrors the Closing board from Monday.com exactly.
// ═══════════════════════════════════════════════════════════════

import { AddressAutocomplete } from '../components/AddressAutocomplete'
import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useTransactions, useAgents } from '../lib/hooks'
import { fmt$, fmtDate, matchSearch, parseNum } from '../lib/utils'
import { CTC_STAGES } from '../lib/constants'
import { FileAttachments } from '../components/FileAttachments'
import { RecordActivity } from '../pages/ActivityLog'
import {
  PageHeader, Btn, Modal, Field, Input, Select, Textarea, Pill,
  SearchInput, Avatar, ModalActions, Loading, Empty, Tabs,
  StatCard, Confirm, SectionTitle
} from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const SIDES    = ['Buyer','Seller','Dual','Rental']
const STATUSES = ['Active','Closed','Cancelled','On Hold']

const BLANK = {
  addr: '', side: 'Buyer', price: '', gci: '',
  ctc: 'Offer Accapted', ao_date: '', close_date: '',
  client_name: '', atty: '', mtg: '', title_co: '',
  status: 'Active', notes: ''
}

export function Transactions() {
  const navigate = useNavigate()
  const { id: urlId } = useParams()
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()

  const filters = isAdmin || canManage ? {} : { agent_id: agent?.id }
  const { transactions, loading, add, update, remove } = useTransactions(filters)
  const { agents } = useAgents()

  const [search,  setSearch]  = useState('')
  const [ctcF,    setCtcF]    = useState('')
  const [agentF,  setAgentF]  = useState('')
  const [selected,setSelected]= useState(null)
  const [form,    setForm]    = useState(BLANK)
  const [saving,  setSaving]  = useState(false)
  const [tab,     setTab]     = useState('info')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (urlId && transactions.length > 0 && urlId !== 'new') {
      const t = transactions.find(x => x.id === urlId)
      if (t) openTx(t)
    }
    if (urlId === 'new') { setSelected(null); setForm({ ...BLANK, agent_id: agent?.id }) }
  }, [urlId, transactions.length])

  function openTx(t) {
    navigate('/transactions/' + t.id, { replace: true })
    setSelected(t)
    setForm({ ...BLANK, ...t })
    setTab('info')
  }

  function closePanel() {
    setSelected(null)
    navigate('/transactions', { replace: true })
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function saveTx() {
    if (!form.addr.trim()) { toast('Address required', '#DC2626'); return }
    setSaving(true)
    try {
      if (selected) {
        const updated = await update(selected.id, form)
        setSelected(updated)
        toast('✅ Transaction saved')
      } else {
        const created = await add({ ...form, agent_id: form.agent_id || agent?.id })
        toast('✅ Transaction added')
        navigate('/transactions/' + created.id)
        closePanel()
      }
    } catch(e) {
      toast('Save failed: ' + e.message, '#DC2626')
    } finally { setSaving(false) }
  }

  async function deleteTx() {
    try {
      await remove(selected.id)
      toast('Deleted')
      closePanel()
    } catch(e) {
      toast('Delete failed: ' + e.message, '#DC2626')
    } finally { setConfirmDelete(false) }
  }

  const filtered = transactions.filter(t => {
    if (ctcF   && t.ctc      !== ctcF)   return false
    if (agentF && t.agent_id !== agentF) return false
    if (search && !matchSearch(t, search, ['addr','client_name','atty','mtg'])) return false
    return true
  })

  const active   = transactions.filter(t => t.status === 'Active').length
  const totalGCI = transactions.reduce((s, t) => s + parseNum(t.gci), 0)
  const ctcColor = (c) => CTC_STAGES.find(x => x.value === c)?.hex || '#c4c4c4'

  return (
    <div style={{ fontFamily: ff }}>
      <PageHeader
        title="Transactions"
        sub={active + ' active · ' + fmt$(totalGCI) + ' total GCI'}
        actions={<Btn onClick={() => { setSelected(null); setForm({ ...BLANK, agent_id: agent?.id }); navigate('/transactions/new') }}>+ Add Transaction</Btn>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <StatCard label="Active Transactions" value={active} accent="#007eb5" icon="💼" />
        <StatCard label="Total This Year" value={transactions.length} accent="#9d50dd" icon="📊" />
        <StatCard label="Total GCI" value={fmt$(totalGCI)} accent="#10B981" icon="💰" />
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search address, client, attorney..." style={{ flex: 1, minWidth: '200px' }} />
        <select value={ctcF} onChange={e => setCtcF(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
          <option value="">All CTC Stages</option>
          {CTC_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
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
        <Empty icon="💼" title="No transactions" sub="Add a transaction to track closings." action={<Btn onClick={() => navigate('/transactions/new')}>+ Add Transaction</Btn>} />
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--dim)' }}>
                {['Address','Client','Agent','CTC Stage','Price','GCI','AO Date','Close Date','Status'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} onClick={() => openTx(t)}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--hov)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: '11px 12px', fontWeight: 600, color: 'var(--text)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.addr}</td>
                  <td style={{ padding: '11px 12px', color: 'var(--muted)' }}>{t.client_name || '—'}</td>
                  <td style={{ padding: '11px 12px' }}>{t.agents ? <Avatar agent={t.agents} size={24} /> : '—'}</td>
                  <td style={{ padding: '11px 12px' }}><Pill label={t.ctc} color={ctcColor(t.ctc)} /></td>
                  <td style={{ padding: '11px 12px', fontWeight: 600 }}>{fmt$(t.price)}</td>
                  <td style={{ padding: '11px 12px', fontWeight: 700, color: '#10B981' }}>{fmt$(t.gci)}</td>
                  <td style={{ padding: '11px 12px', color: 'var(--muted)', fontSize: '12px' }}>{fmtDate(t.ao_date)}</td>
                  <td style={{ padding: '11px 12px', color: 'var(--muted)', fontSize: '12px' }}>{fmtDate(t.close_date)}</td>
                  <td style={{ padding: '11px 12px' }}><Pill label={t.status} color={t.status === 'Active' ? '#007eb5' : t.status === 'Closed' ? '#10B981' : '#94A3B8'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!(selected || urlId === 'new')} onClose={closePanel} title={selected ? selected.addr : 'New Transaction'} width={620}>
        <Tabs tabs={[
          { id: 'info',     label: 'Info' },
          { id: 'parties',  label: 'Parties' },
          { id: 'notes',    label: 'Notes' },
          { id: 'files',    label: 'Files' },
          { id: 'activity', label: 'Activity' },
        ]} active={tab} onChange={setTab} />

        {tab === 'info' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="Address" required>
                <AddressAutocomplete value={form.addr||''} onChange={v => set('addr', v)} placeholder="123 Main St, Monsey NY" />
              </Field>
              <Field label="Side">
                <Select value={form.side} onChange={v => set('side', v)} options={SIDES} />
              </Field>
              <Field label="CTC Stage">
                <Select value={form.ctc} onChange={v => set('ctc', v)} options={CTC_STAGES} />
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={v => set('status', v)} options={STATUSES} />
              </Field>
              <Field label="Price $">
                <Input value={form.price} onChange={v => set('price', v)} placeholder="500000" type="number" />
              </Field>
              <Field label="GCI $">
                <Input value={form.gci} onChange={v => set('gci', v)} placeholder="15000" type="number" />
              </Field>
              <Field label="A/O Date">
                <Input value={form.ao_date} onChange={v => set('ao_date', v)} type="date" />
              </Field>
              <Field label="Close Date">
                <Input value={form.close_date} onChange={v => set('close_date', v)} type="date" />
              </Field>
            </div>
            {(isAdmin || canManage) && (
              <Field label="Agent">
                <Select value={form.agent_id || ''} onChange={v => set('agent_id', v)} options={agents.map(a => ({ value: a.id, label: a.name }))} placeholder="Assign agent" />
              </Field>
            )}
          </div>
        )}

        {tab === 'parties' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="Client Name">
                <Input value={form.client_name} onChange={v => set('client_name', v)} placeholder="John Smith" />
              </Field>
              <Field label="Attorney">
                <Input value={form.atty} onChange={v => set('atty', v)} placeholder="Attorney name/firm" />
              </Field>
              <Field label="Mortgage Company">
                <Input value={form.mtg} onChange={v => set('mtg', v)} placeholder="Lender name" />
              </Field>
              <Field label="Title Company">
                <Input value={form.title_co} onChange={v => set('title_co', v)} placeholder="Title company" />
              </Field>
            </div>
          </div>
        )}

        {tab === 'notes' && (
          <Field label="Notes">
            <Textarea value={form.notes} onChange={v => set('notes', v)} placeholder="Transaction notes..." rows={8} />
          </Field>
        )}

        {tab === 'files' && selected && <FileAttachments tableName="transactions" recordId={selected.id} />}
        {tab === 'files' && !selected && <div style={{ color: 'var(--muted)', fontSize: '13px', padding: '20px 0' }}>Save first to attach files.</div>}
        {tab === 'activity' && selected && <RecordActivity recordId={selected.id} tableName="transactions" />}

        <ModalActions>
          {selected && <Btn variant="ghost" style={{ marginRight: 'auto', color: '#DC2626' }} onClick={() => setConfirmDelete(true)}>Delete</Btn>}
          <Btn variant="secondary" onClick={closePanel}>Cancel</Btn>
          <Btn onClick={saveTx} loading={saving}>{selected ? 'Save' : 'Add Transaction'}</Btn>
        </ModalActions>
      </Modal>

      <Confirm open={confirmDelete} message={"Delete transaction at " + (selected?.addr) + "?"} onConfirm={deleteTx} onCancel={() => setConfirmDelete(false)} />
    </div>
  )
}
