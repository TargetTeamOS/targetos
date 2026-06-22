// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Admin Page
// Manage team members, roles, data rules, system health.
// Admin and secretary only.
// ═══════════════════════════════════════════════════════════════

import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useAgents } from '../lib/hooks'
import { db } from '../lib/db'
import { fmtDate } from '../lib/utils'
import {
  PageHeader, Field, Input, Select, Btn, Avatar, Modal, ModalActions,
  SectionTitle, Pill, Tabs, Toggle, Confirm, Loading
} from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const ROLES = ['admin','secretary','agent']
const COLORS = ['#CC2200','#0EA5E9','#10B981','#F5A623','#8B5CF6','#EC4899','#14B8A6','#E8650A','#6366F1','#84CC16']

const BLANK = { name: '', email: '', phone: '', color: '#CC2200', role: 'agent', active: true }

export function Admin() {
  const { agent: me, isAdmin } = useAuth()
  const { toast } = useApp()
  const { agents, loading, refetch } = useAgents()

  const [tab,      setTab]      = useState('team')
  const [selected, setSelected] = useState(null)
  const [form,     setForm]     = useState(BLANK)
  const [saving,   setSaving]   = useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = useState(null)

  if (!isAdmin) {
    return (
      <div style={{ fontFamily: ff }}>
        <PageHeader title="Admin" />
        <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔒</div>
          <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)' }}>Admin Access Only</div>
        </div>
      </div>
    )
  }

  function openAgent(a) {
    setSelected(a)
    setForm({ ...BLANK, ...a })
  }

  function closePanel() {
    setSelected(null)
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function saveAgent() {
    if (!form.name.trim() || !form.email.trim()) { toast('Name and email required', '#DC2626'); return }
    setSaving(true)
    try {
      await db.agents.update(selected.id, form, me.id)
      await refetch()
      toast('✅ Agent saved')
      closePanel()
    } catch(e) {
      toast('Save failed: ' + e.message, '#DC2626')
    } finally { setSaving(false) }
  }

  async function deactivateAgent(a) {
    try {
      await db.agents.update(a.id, { active: false }, me.id)
      await refetch()
      toast(`${a.name} deactivated`)
    } catch(e) {
      toast('Failed: ' + e.message, '#DC2626')
    } finally { setConfirmDeactivate(null) }
  }

  const activeAgents = agents.filter(a => a.active)
  const byRole = { admin: agents.filter(a => a.role === 'admin'), secretary: agents.filter(a => a.role === 'secretary'), agent: agents.filter(a => a.role === 'agent') }

  return (
    <div style={{ fontFamily: ff }}>
      <PageHeader title="Admin" sub="Team management and system settings" />

      <Tabs tabs={[
        { id: 'team',   label: 'Team' },
        { id: 'rules',  label: 'Data Rules' },
        { id: 'system', label: 'System' },
      ]} active={tab} onChange={setTab} />

      {/* ── TEAM TAB ── */}
      {tab === 'team' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
            {[
              { label: 'Total Team', value: agents.length },
              { label: 'Agents', value: byRole.agent.length },
              { label: 'Admins', value: byRole.admin.length + byRole.secretary.length },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text)' }}>{s.value}</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {loading && <Loading />}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {agents.map(a => (
              <div key={a.id} onClick={() => openAgent(a)}
                style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', transition: 'box-shadow .12s' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
                <Avatar agent={a} size={40} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>{a.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{a.email}</div>
                </div>
                <Pill label={a.role} color={a.role === 'admin' ? '#CC2200' : a.role === 'secretary' ? '#8B5CF6' : '#10B981'} />
                {!a.active && <Pill label="Inactive" color="#94A3B8" />}
                <div style={{ fontSize: '12px', color: a.auth_user_id ? '#10B981' : '#DC2626', fontWeight: 600 }}>
                  {a.auth_user_id ? '✓ Login' : '✗ No Login'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── DATA RULES TAB ── */}
      {tab === 'rules' && (
        <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '24px' }}>
          <SectionTitle>Data Rules</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[
              { label: 'Agents can see each other\'s contacts', desc: 'Currently: Admins and secretaries only. Agents see their own.' },
              { label: 'Agents can delete contacts', desc: 'Currently: No — only admins can delete records.' },
              { label: 'Agents can export data', desc: 'Currently: Disabled — export requires admin approval.' },
              { label: 'Show GCI to all agents', desc: 'Currently: All agents can see team GCI on dashboard.' },
              { label: 'Auto-log all activity', desc: 'Currently: Enabled — every create/update/delete is logged.' },
            ].map((rule, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{rule.label}</div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>{rule.desc}</div>
                </div>
                <Pill label="Configured" color="#10B981" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SYSTEM TAB ── */}
      {tab === 'system' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[
            { label: 'Database', status: '✅ Connected', detail: 'Supabase Postgres — sgrnyvdsyahmypibjarx', color: '#10B981' },
            { label: 'Authentication', status: '✅ Active', detail: 'Supabase Auth — per-agent login with RLS', color: '#10B981' },
            { label: 'Realtime', status: '✅ Active', detail: 'Supabase Realtime — live data sync', color: '#10B981' },
            { label: 'File Storage', status: '⚠️ Setup Required', detail: 'Create "targetos-files" bucket in Supabase Storage', color: '#F97316' },
            { label: 'Error Tracking', status: '⚠️ Setup Required', detail: 'Add VITE_SENTRY_DSN to Vercel environment variables', color: '#F97316' },
            { label: 'Analytics', status: '⚠️ Setup Required', detail: 'Add VITE_POSTHOG_KEY to Vercel environment variables', color: '#F97316' },
            { label: 'Hosting', status: '✅ Live', detail: 'Vercel — app.targetreteam.com', color: '#10B981' },
            { label: 'Code', status: '✅ Active', detail: 'GitHub — TargetTeamOS/targetos', color: '#10B981' },
          ].map(item => (
            <div key={item.label} style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>{item.label}</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>{item.detail}</div>
              </div>
              <Pill label={item.status} color={item.color} />
            </div>
          ))}
        </div>
      )}

      {/* Edit Agent Modal */}
      <Modal open={!!selected} onClose={closePanel} title={`Edit — ${selected?.name}`} width={460}>
        <Field label="Full Name">
          <Input value={form.name} onChange={v => set('name', v)} placeholder="Full name" />
        </Field>
        <Field label="Email" hint="This must match their Supabase login email">
          <Input value={form.email} onChange={v => set('email', v)} type="email" placeholder="agent@targetreteam.com" />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={v => set('phone', v)} placeholder="(845) 555-1234" type="tel" />
        </Field>
        <Field label="Role">
          <Select value={form.role} onChange={v => set('role', v)} options={ROLES} />
        </Field>
        <Field label="Avatar Color">
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '4px' }}>
            {COLORS.map(c => (
              <div key={c} onClick={() => set('color', c)}
                style={{ width: 26, height: 26, borderRadius: '50%', background: c, cursor: 'pointer', border: form.color === c ? '3px solid var(--text)' : '2px solid transparent' }} />
            ))}
          </div>
        </Field>
        <Field label="">
          <Toggle value={form.active} onChange={v => set('active', v)} label="Active (can log in)" />
        </Field>
        <div style={{ background: 'var(--dim)', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>
          Login status: <strong style={{ color: selected?.auth_user_id ? '#10B981' : '#DC2626' }}>
            {selected?.auth_user_id ? '✓ Linked to Supabase Auth' : '✗ No login yet — create in Supabase → Authentication → Users'}
          </strong>
        </div>
        <ModalActions>
          {selected?.id !== me?.id && selected?.active && (
            <Btn variant="ghost" style={{ marginRight: 'auto', color: '#DC2626' }} onClick={() => setConfirmDeactivate(selected)}>Deactivate</Btn>
          )}
          <Btn variant="secondary" onClick={closePanel}>Cancel</Btn>
          <Btn onClick={saveAgent} loading={saving}>Save</Btn>
        </ModalActions>
      </Modal>

      <Confirm
        open={!!confirmDeactivate}
        message={`Deactivate ${confirmDeactivate?.name}? They will no longer be able to log in.`}
        onConfirm={() => deactivateAgent(confirmDeactivate)}
        onCancel={() => setConfirmDeactivate(null)}
      />
    </div>
  )
}
