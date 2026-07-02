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
  // Phone
  normalizePhone, formatPhone,
  // Business logic
  isBusinessHours, loadFlow, lookupContact,
  // Constants
  BASE_URL, TWILIO_NUMBER, DEFAULT_VOICE, HOLD_MUSIC,
}
