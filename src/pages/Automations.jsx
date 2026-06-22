// TargetOS V2 — Automations
import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { PageHeader, Btn, Loading, Empty } from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

export function Automations() {
  const navigate = useNavigate()
  const { id: urlId } = useParams()
  const { agent, isAdmin } = useAuth()

  return (
    <div style={{ fontFamily: ff }}>
      <PageHeader title="Automations" />
      <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>🚧</div>
        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>Automations — Coming Soon</div>
        <div style={{ fontSize: '13px', color: 'var(--muted)' }}>This page is being built. Check back soon.</div>
      </div>
    </div>
  )
}
