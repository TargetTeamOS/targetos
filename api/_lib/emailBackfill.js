'use strict'
// api/_lib/emailBackfill.js — PURE mapping helpers for the Phase 2 backfill
// (integration_accounts → email_connections). No I/O here so the transform
// is unit-testable; the DB read/write lives in scripts/email_backfill.js.

// Legacy provider labels → new schema labels.
function mapProvider(p) {
  if (p === 'outlook') return 'microsoft'
  if (p === 'google') return 'google'
  return null // unknown provider → skip
}

// Legacy status → email_connections.status.
function mapStatus(s) {
  switch (s) {
    case 'connected': return 'active'
    case 'error': return 'error'
    case 'disconnected': return 'disconnected'
    default: return 'disconnected' // 'pending' or anything else
  }
}

// Build one email_connections row from an integration_accounts row.
// `encrypt` MUST be a function that returns an AES-256-GCM envelope (it will
// throw if encryption is misconfigured — the caller must not fall back to
// plaintext). Tokens are only ever written encrypted.
function buildConnectionRow(account, encrypt) {
  if (!account) throw new Error('account required')
  const provider = mapProvider(account.provider)
  if (!provider) return null
  const secrets = account.secrets || {}
  const enc = (v) => (v == null || v === '') ? null : encrypt(v)
  return {
    crm_user_id: account.agent_id,
    provider,
    provider_account_id: secrets.provider_account_id || null,
    email_address: account.account_email || null,
    display_name: secrets.display_name || null,
    tenant_id: secrets.tenant_id || null,
    encrypted_access_token: enc(secrets.access_token),
    encrypted_refresh_token: enc(secrets.refresh_token),
    access_token_expires_at: secrets.expires_at || null,
    granted_scopes: secrets.granted_scopes || null,
    status: mapStatus(account.status),
    source_integration_account_id: account.id,
  }
}

// Given all connections for one user, pick which becomes primary: the first
// 'active' one (most recently updated first if the caller sorts), else the
// first row. Returns the index, or -1 if none.
function pickPrimaryIndex(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return -1
  const active = rows.findIndex(r => r.status === 'active')
  return active >= 0 ? active : 0
}

module.exports = { mapProvider, mapStatus, buildConnectionRow, pickPrimaryIndex }
