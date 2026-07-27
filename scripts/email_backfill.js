'use strict'
// scripts/email_backfill.js — STAGED, IDEMPOTENT backfill of legacy
// integration_accounts into the encrypted email_connections table.
//
//   node scripts/email_backfill.js           # dry run (no writes)
//   node scripts/email_backfill.js --apply    # perform the backfill
//   node scripts/email_backfill.js --verify   # decrypt-round-trip a sample
//
// Requires server env: SUPABASE_URL, SUPABASE_SERVICE_KEY (or
// SUPABASE_SERVICE_ROLE_KEY), EMAIL_TOKEN_ENCRYPTION_KEY (+ optional
// EMAIL_TOKEN_KEY_VERSION). FAILS CLOSED if the encryption key is missing or
// invalid — it will not write plaintext. Legacy rows are never modified, so
// this is safe to re-run and safe to roll back.

const { createClient } = require('@supabase/supabase-js')
const emailCrypto = require('../api/_lib/emailCrypto')
const { buildConnectionRow, pickPrimaryIndex } = require('../api/_lib/emailBackfill')

function client() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required')
  return createClient(url, key, { auth: { persistSession: false } })
}

function assertKeyReady() {
  const kr = emailCrypto.keyringFromEnv()
  if (!kr.keyConfigured) throw new Error('EMAIL_TOKEN_ENCRYPTION_KEY is not set — refusing to backfill (would store plaintext)')
  if (kr.keyInvalid || kr.versionInvalid || !kr.keys[kr.currentVersion]) {
    throw new Error('email token encryption is misconfigured — aborting backfill')
  }
}

async function main() {
  const apply = process.argv.includes('--apply')
  const verify = process.argv.includes('--verify')
  assertKeyReady()
  const sb = client()

  const { data: accounts, error } = await sb.from('integration_accounts').select('*')
  if (error) throw new Error('read integration_accounts failed: ' + error.message)

  const rows = []
  for (const acct of accounts || []) {
    const row = buildConnectionRow(acct, emailCrypto.encrypt)
    if (row) rows.push(row)
  }
  console.log(`[backfill] ${accounts?.length || 0} legacy accounts → ${rows.length} connection rows`)

  if (!apply) {
    console.log('[backfill] dry run (no writes). Re-run with --apply to persist.')
  } else {
    // Upsert on the idempotent source key so re-runs don't duplicate.
    const { error: upErr } = await sb.from('email_connections')
      .upsert(rows, { onConflict: 'source_integration_account_id' })
    if (upErr) throw new Error('upsert email_connections failed: ' + upErr.message)

    // Establish exactly one primary per user (partial unique index enforces it).
    const byUser = {}
    for (const r of rows) (byUser[r.crm_user_id] = byUser[r.crm_user_id] || []).push(r)
    for (const uid of Object.keys(byUser)) {
      const { data: existing } = await sb.from('email_connections')
        .select('id, status, updated_at, is_primary')
        .eq('crm_user_id', uid).order('updated_at', { ascending: false })
      if (!existing || existing.length === 0) continue
      if (existing.some(r => r.is_primary)) continue // already has a primary
      const idx = pickPrimaryIndex(existing)
      if (idx >= 0) await sb.from('email_connections').update({ is_primary: true }).eq('id', existing[idx].id)
    }
    console.log('[backfill] applied.')
  }

  if (verify) {
    const { data: sample } = await sb.from('email_connections')
      .select('id, encrypted_refresh_token').not('encrypted_refresh_token', 'is', null).limit(1)
    if (sample && sample[0]) {
      const pt = emailCrypto.decrypt(sample[0].encrypted_refresh_token) // throws if not decryptable
      console.log('[backfill] verify: sample refresh token decrypts OK (len=' + pt.length + ')')
    } else {
      console.log('[backfill] verify: no encrypted refresh tokens present to sample')
    }
  }
}

main().catch(e => { console.error('[backfill] ' + e.message); process.exit(1) })
