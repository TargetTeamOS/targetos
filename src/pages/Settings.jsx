// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Settings Page
// Password reset, theme, agent profile, preferences
// ═══════════════════════════════════════════════════════════════

import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import {
  PageHeader, Field, Input, Btn, Avatar, Divider, Toggle, SectionTitle
} from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const THEMES = [
  { id: 'light', label: 'Light', preview: '#F0F2F5' },
  { id: 'dark',  label: 'Dark',  preview: '#0F1A2E' },
  { id: 'slate', label: 'Slate', preview: '#1E293B' },
]

const AGENT_COLORS = [
  '#CC2200','#0EA5E9','#10B981','#F5A623','#8B5CF6',
  '#EC4899','#14B8A6','#E8650A','#6366F1','#84CC16'
]

export function Settings() {
  const { agent, refreshAgent } = useAuth()
  const { state, setTheme, toast } = useApp()

  const [name,       setName]       = useState(agent?.name || '')
  const [phone,      setPhone]      = useState(agent?.phone || '')
  const [color,      setColor]      = useState(agent?.color || '#CC2200')
  const [savingP,    setSavingP]    = useState(false)

  const [oldPwd,     setOldPwd]     = useState('')
  const [newPwd,     setNewPwd]     = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [savingPwd,  setSavingPwd]  = useState(false)

  const [resetEmail, setResetEmail] = useState(agent?.email || '')
  const [sendingReset, setSendingReset] = useState(false)

  async function saveProfile() {
    setSavingP(true)
    try {
      await db.agents.update(agent.id, { name, phone, color }, agent.id)
      await refreshAgent()
      toast('✅ Profile saved')
    } catch(e) {
      toast('Save failed: ' + e.message, '#DC2626')
    } finally { setSavingP(false) }
  }

  async function changePassword() {
    if (!newPwd) { toast('Enter a new password', '#DC2626'); return }
    if (newPwd.length < 8) { toast('Password must be at least 8 characters', '#DC2626'); return }
    if (newPwd !== confirmPwd) { toast('Passwords do not match', '#DC2626'); return }
    setSavingPwd(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPwd })
      if (error) throw error
      toast('✅ Password updated')
      setOldPwd(''); setNewPwd(''); setConfirmPwd('')
    } catch(e) {
      toast('Failed: ' + e.message, '#DC2626')
    } finally { setSavingPwd(false) }
  }

  async function sendPasswordReset() {
    if (!resetEmail) { toast('Enter your email', '#DC2626'); return }
    setSendingReset(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: window.location.origin + '/settings'
      })
      if (error) throw error
      toast('✅ Reset email sent — check your inbox')
    } catch(e) {
      toast('Failed: ' + e.message, '#DC2626')
    } finally { setSendingReset(false) }
  }

  return (
    <div style={{ fontFamily: ff, maxWidth: '600px' }}>
      <PageHeader title="Settings" sub="Your profile, password, and preferences" />

      {/* PROFILE */}
      <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '24px', marginBottom: '16px' }}>
        <SectionTitle>Profile</SectionTitle>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
          <Avatar agent={{ name, color }} size={52} />
          <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
            <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '15px' }}>{agent?.name}</div>
            <div>{agent?.email}</div>
            <div style={{ textTransform: 'capitalize' }}>{agent?.role}</div>
          </div>
        </div>

        <Field label="Display Name">
          <Input value={name} onChange={setName} placeholder="Your full name" />
        </Field>
        <Field label="Phone">
          <Input value={phone} onChange={setPhone} placeholder="(845) 555-1234" type="tel" />
        </Field>

        <Field label="Avatar Color">
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '4px' }}>
            {AGENT_COLORS.map(c => (
              <div key={c} onClick={() => setColor(c)}
                style={{ width: 30, height: 30, borderRadius: '50%', background: c, cursor: 'pointer', border: color === c ? '3px solid var(--text)' : '2px solid transparent', transition: 'border .15s' }} />
            ))}
          </div>
        </Field>

        <Btn onClick={saveProfile} loading={savingP}>Save Profile</Btn>
      </div>

      {/* THEME */}
      <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '24px', marginBottom: '16px' }}>
        <SectionTitle>Appearance</SectionTitle>
        <div style={{ display: 'flex', gap: '12px' }}>
          {THEMES.map(t => (
            <div key={t.id} onClick={() => setTheme(t.id)}
              style={{ flex: 1, padding: '16px', borderRadius: '10px', border: state.theme === t.id ? '2px solid var(--brand)' : '1px solid var(--border)', cursor: 'pointer', textAlign: 'center', background: t.preview }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: t.id === 'light' ? '#0F172A' : '#fff', marginTop: '8px' }}>{t.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CHANGE PASSWORD */}
      <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '24px', marginBottom: '16px' }}>
        <SectionTitle>Change Password</SectionTitle>
        <Field label="New Password">
          <Input value={newPwd} onChange={setNewPwd} type="password" placeholder="At least 8 characters" />
        </Field>
        <Field label="Confirm New Password">
          <Input value={confirmPwd} onChange={setConfirmPwd} type="password" placeholder="Repeat new password" />
        </Field>
        <Btn onClick={changePassword} loading={savingPwd}>Update Password</Btn>
      </div>

      {/* FORGOT PASSWORD */}
      <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '24px' }}>
        <SectionTitle>Forgot Password</SectionTitle>
        <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '12px' }}>
          Send a password reset link to any agent's email address.
        </div>
        <Field label="Email Address">
          <Input value={resetEmail} onChange={setResetEmail} type="email" placeholder="agent@targetreteam.com" />
        </Field>
        <Btn variant="secondary" onClick={sendPasswordReset} loading={sendingReset}>Send Reset Link</Btn>
      </div>
    </div>
  )
}
