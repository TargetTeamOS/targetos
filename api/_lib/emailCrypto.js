'use strict'
// ═══════════════════════════════════════════════════════════════
// api/_lib/emailCrypto.js — authenticated encryption for OAuth tokens
// at rest (Phase 1B of the Connected Email work).
//
// Envelope (string):  enc:v<version>:<base64( iv[12] | tag[16] | ct )>
//   - AES-256-GCM, random 12-byte IV per message, 16-byte auth tag
//   - version selects the key, so keys can be rotated without a flag day
//
// Keys come ONLY from server env (never the browser, never git):
//   EMAIL_TOKEN_ENCRYPTION_KEY      current key material
//   EMAIL_TOKEN_KEY_VERSION         current version label (default "1")
//   EMAIL_TOKEN_ENCRYPTION_KEY_V<n> older keys, kept for decrypt/rotate
//
// Key material may be base64 (32 bytes), hex (64 chars), or a raw
// 32-byte utf8 string. Errors never contain key or plaintext material.
// ═══════════════════════════════════════════════════════════════

const crypto = require('crypto')

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16
const PREFIX = 'enc:v'

function parseKeyMaterial(raw) {
  if (raw == null || raw === '') return null
  if (Buffer.isBuffer(raw)) return raw.length === 32 ? raw : null
  const s = String(raw)
  // base64 → 32 bytes?
  try { const b = Buffer.from(s, 'base64'); if (b.length === 32) return b } catch (e) {}
  // hex → 32 bytes?
  if (/^[0-9a-fA-F]{64}$/.test(s)) { const b = Buffer.from(s, 'hex'); if (b.length === 32) return b }
  // raw utf8 32 bytes?
  const u = Buffer.from(s, 'utf8'); if (u.length === 32) return u
  return null
}

// A keyring maps version -> 32-byte Buffer, plus the current version and
// config-health flags so callers can distinguish "no key configured"
// (legacy passthrough allowed) from "key present but invalid" (fail closed).
const VERSION_RE = /^[A-Za-z0-9_-]+$/
function keyringFromEnv(env) {
  env = env || process.env
  const rawVersion = env.EMAIL_TOKEN_KEY_VERSION
  const currentVersion = String(rawVersion == null || rawVersion === '' ? '1' : rawVersion)
  const rawKey = env.EMAIL_TOKEN_ENCRYPTION_KEY
  const keyConfigured = rawKey != null && String(rawKey) !== ''
  const versionInvalid = rawVersion != null && rawVersion !== '' && !VERSION_RE.test(String(rawVersion))
  const keys = {}
  let keyInvalid = false
  if (keyConfigured) {
    const cur = parseKeyMaterial(rawKey)
    if (cur) keys[currentVersion] = cur
    else keyInvalid = true            // present but wrong length/format
  }
  for (const k of Object.keys(env)) {
    const m = /^EMAIL_TOKEN_ENCRYPTION_KEY_V(.+)$/.exec(k)
    if (m) {
      if (!VERSION_RE.test(m[1])) { keyInvalid = true; continue }
      const km = parseKeyMaterial(env[k])
      if (km) keys[m[1]] = km; else keyInvalid = true
    }
  }
  return { currentVersion, keys, keyConfigured, keyInvalid, versionInvalid }
}

// Test/DI helper: build a healthy keyring from an explicit {version: material} map.
function makeKeyring(map, currentVersion) {
  const keys = {}
  for (const v of Object.keys(map || {})) {
    if (!VERSION_RE.test(v)) throw new Error('invalid key version')
    const km = parseKeyMaterial(map[v])
    if (!km) throw new Error('invalid key material for version ' + v)
    keys[v] = km
  }
  const cv = String(currentVersion != null ? currentVersion : Object.keys(keys)[0])
  if (!keys[cv]) throw new Error('current version has no key')
  return { currentVersion: cv, keys, keyConfigured: true, keyInvalid: false, versionInvalid: false }
}

// Resolve a usable keyring or throw a GENERIC config error (never echoing
// key material). Absence is handled by seal()/open(), not here.
function resolveKeyring(explicit) {
  if (explicit && explicit.keys && explicit.keys[explicit.currentVersion] &&
      !explicit.keyInvalid && !explicit.versionInvalid) {
    return explicit
  }
  const kr = explicit && explicit.keys ? explicit : keyringFromEnv()
  if (!kr.keyConfigured && !(kr.keys && kr.keys[kr.currentVersion])) {
    throw new Error('email token encryption key not configured')
  }
  if (kr.keyInvalid || kr.versionInvalid || !kr.keys || !kr.keys[kr.currentVersion]) {
    throw new Error('email token encryption is misconfigured')
  }
  return kr
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

// encrypt(plaintext[, keyring]) -> envelope string
function encrypt(plaintext, keyring) {
  if (plaintext == null) return plaintext
  const kr = resolveKeyring(keyring)
  const key = kr.keys[kr.currentVersion]
  if (!key) throw new Error('no key for current version')
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(Buffer.from(String(plaintext), 'utf8')), cipher.final()])
  const tag = cipher.getAuthTag()
  const packed = Buffer.concat([iv, tag, ct]).toString('base64')
  return PREFIX + kr.currentVersion + ':' + packed
}

// decrypt(envelope[, keyring]) -> plaintext string. Throws (generic) on
// any failure — tamper, wrong key, unknown version, malformed input.
function decrypt(envelope, keyring) {
  if (!isEncrypted(envelope)) throw new Error('not an encrypted value')
  try {
    const rest = envelope.slice(PREFIX.length)
    const sep = rest.indexOf(':')
    if (sep < 0) throw new Error('malformed')
    const version = rest.slice(0, sep)
    const packed = Buffer.from(rest.slice(sep + 1), 'base64')
    if (packed.length < IV_LEN + TAG_LEN + 1) throw new Error('malformed')
    const kr = resolveKeyring(keyring)
    const key = kr.keys[version]
    if (!key) throw new Error('unknown key version')
    const iv = packed.subarray(0, IV_LEN)
    const tag = packed.subarray(IV_LEN, IV_LEN + TAG_LEN)
    const ct = packed.subarray(IV_LEN + TAG_LEN)
    const decipher = crypto.createDecipheriv(ALGO, key, iv)
    decipher.setAuthTag(tag)
    const pt = Buffer.concat([decipher.update(ct), decipher.final()])
    return pt.toString('utf8')
  } catch (e) {
    // Never leak key/plaintext/internal detail.
    throw new Error('token decryption failed')
  }
}

// rotate(envelope[, keyring]) -> re-encrypt under the CURRENT version.
function rotate(envelope, keyring) {
  const pt = decrypt(envelope, keyring)
  return encrypt(pt, keyring)
}

// Backwards-compatible boundary helpers used while old plaintext rows
// still exist: seal only when a key is configured; open transparently
// whether the stored value is an envelope or legacy plaintext.
function seal(value, keyring) {
  if (value == null || value === '') return value
  const kr = keyring || keyringFromEnv()
  // Key completely absent → documented legacy passthrough (until Phase 2).
  if (kr.keyConfigured === false && !(kr.keys && kr.keys[kr.currentVersion])) return value
  // Key present but malformed / bad version → FAIL CLOSED, never store plaintext.
  if (kr.keyInvalid || kr.versionInvalid || !kr.keys || !kr.keys[kr.currentVersion]) {
    throw new Error('email token encryption is misconfigured')
  }
  if (isEncrypted(value)) return value
  return encrypt(value, kr)
}
function open(value, keyring) {
  if (!isEncrypted(value)) return value // legacy plaintext
  return decrypt(value, keyring)
}

// Convenience for ops: generate a fresh base64 key.
function generateKey() { return crypto.randomBytes(32).toString('base64') }

module.exports = {
  encrypt, decrypt, rotate, seal, open,
  isEncrypted, makeKeyring, keyringFromEnv, generateKey,
  ALGO, IV_LEN, TAG_LEN, PREFIX,
}
