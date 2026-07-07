// TargetOS V2 — Phone System Core Library
'use strict'

// ── CONSTANTS ─────────────────────────────────────────────────────
const SUPABASE_URL     = 'https://sgrnyvdsyahmypibjarx.supabase.co'
const SUPABASE_ANON    = 'sb_publishable_L4MNs2GuBFnmyNKgiIGBMg_nNxeaLkE'
const TWILIO_NUMBER    = '+18453271778'
const BASE_URL         = 'https://app.targetreteam.com'
const DEFAULT_VOICE    = 'Polly.Joanna'

// ── TWIML BUILDERS ────────────────────────────────────────────────
const wrap = xml =>
  '<?xml version="1.0" encoding="UTF-8"?><Response>' + xml + '</Response>'

const say = (text, voice) =>
  '<Say voice="' + (voice || DEFAULT_VOICE) + '">' + esc(String(text || '')) + '</Say>'

const pause = secs => '<Pause length="' + (secs || 1) + '" />'

const play = (url, loop) =>
  '<Play loop="' + (loop || 1) + '">' + esc(url) + '</Play>'

const vmRecord = (maxLen) =>
  '<Record maxLength="' + (maxLen || 120) + '"' +
  ' transcribe="true" playBeep="true"' +
  ' transcribeCallback="' + BASE_URL + '/api/twilio-voicemail" />'

const voicemailTwiml = (greeting, voice, maxLen) =>
  say(greeting || 'Please leave your message after the tone.', voice || DEFAULT_VOICE) +
  vmRecord(maxLen)

const hangup = () => '<Hangup />'

const redirect = (url, method) =>
  '<Redirect method="' + (method || 'GET') + '">' + esc(url) + '</Redirect>'

// Escape XML special chars — prevents TwiML injection from user data
function esc(s) {
  return String(s || '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&apos;')
}

// ── SUPABASE ──────────────────────────────────────────────────────
function getSupabase() {
  // Try service key first (has more permissions, bypasses RLS)
  const url = process.env.SUPABASE_URL || SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY ||
              process.env.SUPABASE_SERVICE_ROLE_KEY ||
              process.env.VITE_SUPABASE_ANON_KEY   ||
              SUPABASE_ANON
  const { createClient } = require('@supabase/supabase-js')
  return createClient(url, key, { auth: { persistSession: false } })
}

// ── BODY PARSING ──────────────────────────────────────────────────
async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  const raw = await new Promise((ok, err) => {
    if (req.body) return ok(req.body)
    let d = ''
    req.on('data', c => { d += c })
    req.on('end',  () => ok(d))
    req.on('error', err)
  })
  if (!raw || typeof raw === 'object') return raw || {}
  const qs = require('querystring')
  return qs.parse(String(raw))
}

function parseQS(req) {
  const url = req.url || ''
  const q   = url.includes('?') ? url.split('?')[1] : ''
  return require('querystring').parse(q)
}

// ── ADMIN/SECRETARY AUTH CHECK ───────────────────────────────────────
// For endpoints that are real features (not Twilio webhooks) but should
// only be usable by a logged-in admin or secretary — e.g. resetting the
// phone flow, running first-time setup. Expects the frontend to send
// 'Authorization: Bearer <supabase access token>'.
async function requireAdminOrSecretary(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, status: 401, message: 'Missing Authorization header — please log in again' }

  try {
    const supabase = getSupabase()
    const { data: userData, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !userData?.user) {
      return { ok: false, status: 401, message: 'Invalid or expired session — please log in again' }
    }

    const { data: agentRow, error: agentErr } = await supabase
      .from('agents').select('role').eq('auth_user_id', userData.user.id).maybeSingle()
    if (agentErr || !agentRow) {
      return { ok: false, status: 403, message: 'No matching agent record found' }
    }
    if (!['admin', 'secretary'].includes(agentRow.role)) {
      return { ok: false, status: 403, message: 'Requires admin or secretary role' }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, status: 500, message: 'Auth check failed: ' + e.message }
  }
}
// Confirms a webhook request actually came from Twilio, not a spoofed
// POST from anyone who found the URL. Added July 2026.
//
// PHASE 1 (current): LOG-ONLY. Call logTwilioValidation(req, params)
// after parsing the body — it warns on failure but never blocks a
// request. This lets us confirm real Twilio traffic validates
// correctly (check Vercel function logs for '[TWILIO-SIG]' warnings)
// before switching to enforcement.
//
// PHASE 2 (future, once Phase 1 logs look clean for a while): change
// call sites to check the return value and return a 403 on failure
// instead of just logging. See handoff doc checklist.
//
// params: for POST requests, the parsed body (from parseBody()).
//         for GET requests, pass {} — query params are already part
//         of the URL itself and don't need to be passed separately.
function validateTwilioSignature(req, params) {
  try {
    const twilio = require('twilio')
    const authToken = process.env.TWILIO_AUTH_TOKEN
    if (!authToken) {
      console.warn('[TWILIO-SIG] TWILIO_AUTH_TOKEN not set — cannot validate, skipping check')
      return null // unknown, not a pass or fail
    }
    const signature = req.headers['x-twilio-signature']
    const url = BASE_URL + req.url
    return twilio.validateRequest(authToken, signature, url, params || {})
  } catch (e) {
    console.warn('[TWILIO-SIG] validation threw an error:', e.message)
    return null
  }
}

// Convenience wrapper for Phase 1 — call this, ignore the return value,
// just watch the logs. Never blocks anything.
function logTwilioValidation(req, params, endpointName) {
  const result = validateTwilioSignature(req, params)
  if (result === false) {
    console.warn('[TWILIO-SIG] FAILED validation for ' + (endpointName || req.url) + ' — would be blocked once Phase 2 is enabled. From: ' + (req.headers['x-forwarded-for'] || 'unknown'))
  }
}

// ── PHONE NORMALIZATION ───────────────────────────────────────────
// Returns E.164 format: +1XXXXXXXXXX
function normalizePhone(p) {
  if (!p) return ''
  const d = String(p).replace(/\D/g, '')
  if (d.length === 10) return '+1' + d
  if (d.length === 11 && d[0] === '1') return '+' + d
  if (d.length > 11) return '+' + d   // international
  return p
}

function formatPhone(p) {
  const d = String(p || '').replace(/\D/g, '').slice(-10)
  if (d.length !== 10) return String(p || '')
  return '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6)
}

// ── BUSINESS HOURS ────────────────────────────────────────────────
function isBusinessHours() {
  try {
    const et  = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
    const d   = new Date(et)
    const day = d.getDay()   // 0=Sun 6=Sat
    const h   = d.getHours()
    return day >= 1 && day <= 5 && h >= 9 && h < 18
  } catch { return true }  // if can't determine, assume open
}

// ── LOAD ACTIVE FLOW ──────────────────────────────────────────────
async function loadFlow(supabase) {
  try {
    // Prefer is_active=true, fall back to most recently updated
    let row = null
    const { data: a, error: ae } = await supabase
      .from('phone_ivr').select('flow_nodes, flow_edges')
      .eq('is_active', true).limit(1).maybeSingle()

    if (ae) console.warn('[phone] loadFlow active query error:', ae.message)
    row = a

    if (!row) {
      const { data: b, error: be } = await supabase
        .from('phone_ivr').select('flow_nodes, flow_edges')
        .order('updated_at', { ascending: false }).limit(1).maybeSingle()
      if (be) console.warn('[phone] loadFlow fallback query error:', be.message)
      row = b
    }

    if (!row) {
      console.warn('[phone] loadFlow: no rows in phone_ivr table')
      return { nodes: [], edges: [] }
    }

    const nodes = parseJson(row.flow_nodes) || []
    const edges = parseJson(row.flow_edges) || []

    if (!nodes.length) {
      console.warn('[phone] loadFlow: flow_nodes is empty or null — SQL migration may be needed')
    }

    return { nodes, edges }
  } catch(e) {
    console.error('[phone] loadFlow crashed:', e.message)
    return { nodes: [], edges: [] }
  }
}

// ── CONTACT LOOKUP ────────────────────────────────────────────────
async function lookupContact(supabase, fromNumber) {
  if (!fromNumber) return null
  try {
    const d10 = fromNumber.replace(/\D/g, '').slice(-10)
    if (d10.length < 10) return null
    const { data } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, phone, agent_id, status')
      .or('phone.ilike.%' + d10 + '%')
      .limit(1).maybeSingle()
    return data || null
  } catch(e) {
    console.warn('[phone] lookupContact:', e.message)
    return null
  }
}

function parseJson(v) {
  if (!v) return null
  if (typeof v === 'object') return v
  try { return JSON.parse(v) } catch { return null }
}

// ── HOLD MUSIC ────────────────────────────────────────────────────
const HOLD_MUSIC = {
  classical: 'https://demo.twilio.com/docs/classic.mp3',
  jazz:      'https://demo.twilio.com/docs/jazz.mp3',
  pop:       'http://com.twilio.sounds.music.s3.amazonaws.com/MARKOVICHAMP-Borghestral.mp3',
  silence:   'https://demo.twilio.com/docs/silence.mp3',
}

module.exports = {
  // TwiML
  wrap, say, pause, play, vmRecord, voicemailTwiml, hangup, redirect, esc,
  // Supabase
  getSupabase, parseJson,
  // HTTP
  parseBody, parseQS,
  // Security
  validateTwilioSignature, logTwilioValidation, requireAdminOrSecretary,
  // Phone
  normalizePhone, formatPhone,
  // Business logic
  isBusinessHours, loadFlow, lookupContact,
  // Constants
  BASE_URL, TWILIO_NUMBER, DEFAULT_VOICE, HOLD_MUSIC,
}
