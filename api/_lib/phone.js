// TargetOS V2 — Phone System Core Library
// Shared utilities used across all Twilio API endpoints.
// Single source of truth — import from here, never duplicate.
'use strict'

// ── TWIML HELPERS ────────────────────────────────────────────────
const wrap = xml =>
  '<?xml version="1.0" encoding="UTF-8"?><Response>' + xml + '</Response>'

const say = (text, voice) =>
  '<Say voice="' + (voice || 'Polly.Joanna') + '">' +
  sanitize(String(text || '')) + '</Say>'

const pause = (secs) => '<Pause length="' + (secs || 1) + '" />'

const play = (url, loop) =>
  '<Play loop="' + (loop || 1) + '">' + url + '</Play>'

const record = (opts = {}) =>
  '<Record' +
  ' maxLength="' + (opts.maxLength || 120) + '"' +
  ' transcribe="true"' +
  ' transcribeCallback="/api/twilio-voicemail"' +
  (opts.playBeep === false ? ' playBeep="false"' : '') +
  ' />'

const voicemailTwiml = (greeting, voice, maxLength) =>
  say(greeting || 'Please leave your message after the tone.', voice) +
  record({ maxLength })

const redirect = (url, method) =>
  '<Redirect method="' + (method || 'POST') + '">' + url + '</Redirect>'

const hangup = () => '<Hangup />'

// Remove XML special chars to prevent TwiML injection
function sanitize(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// ── SUPABASE CLIENT ───────────────────────────────────────────────
function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY ||
              process.env.SUPABASE_SERVICE_ROLE_KEY ||
              process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  const { createClient } = require('@supabase/supabase-js')
  return createClient(url, key)
}

// ── BODY PARSING ──────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) return resolve(req.body)
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

async function parseBody(req) {
  const raw = await readBody(req)
  if (!raw || typeof raw === 'object') return raw || {}
  const qs = require('querystring')
  try { return qs.parse(raw) } catch { return {} }
}

function parseQS(req) {
  const qs = require('querystring')
  const url = req.url || ''
  const q = url.includes('?') ? url.split('?')[1] : ''
  return qs.parse(q)
}

// ── PHONE NUMBER NORMALIZATION ────────────────────────────────────
// Accepts: (845) 555-1234  /  8455551234  /  +18455551234  /  845-555-1234
// Returns: +18455551234  or  the original if it can't be normalized
function normalizePhone(p) {
  if (!p) return ''
  const digits = String(p).replace(/\D/g, '')
  if (digits.length === 10) return '+1' + digits
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits
  if (digits.length > 7) return '+' + digits   // international
  return p  // can't normalize, return as-is
}

function formatPhone(p) {
  const digits = String(p || '').replace(/\D/g, '').slice(-10)
  if (digits.length !== 10) return p || ''
  return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6)
}

// ── BUSINESS HOURS (Eastern Time, auto-DST) ──────────────────────
function isBusinessHours() {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      hour12: false,
    })
    const h = parseInt(fmt.format(new Date()), 10)
    const day = new Date().toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
    })
    const isWeekend = day === 'Sat' || day === 'Sun'
    return !isWeekend && h >= 9 && h < 18
  } catch { return true }
}

// ── FLOW LOADER ───────────────────────────────────────────────────
// Load the active call flow from phone_ivr. Always returns { nodes, edges }.
async function loadFlow(supabase) {
  if (!supabase) return { nodes: [], edges: [] }
  try {
    // Try active flow first, then most recently updated
    let row = null
    const { data: a } = await supabase
      .from('phone_ivr').select('flow_nodes, flow_edges')
      .eq('is_active', true).limit(1).maybeSingle()
    row = a
    if (!row) {
      const { data: b } = await supabase
        .from('phone_ivr').select('flow_nodes, flow_edges')
        .order('updated_at', { ascending: false }).limit(1).maybeSingle()
      row = b
    }
    if (!row) return { nodes: [], edges: [] }
    const nodes = parseJson(row.flow_nodes) || []
    const edges = parseJson(row.flow_edges) || []
    return { nodes, edges }
  } catch(e) {
    console.error('[phone] loadFlow error:', e.message)
    return { nodes: [], edges: [] }
  }
}

function parseJson(v) {
  if (!v) return null
  if (typeof v === 'object') return v
  try { return JSON.parse(v) } catch { return null }
}

// ── CONTACT LOOKUP ────────────────────────────────────────────────
async function lookupContact(supabase, fromNumber) {
  if (!supabase || !fromNumber) return null
  try {
    const digits = fromNumber.replace(/\D/g, '').slice(-10)
    if (digits.length < 10) return null
    const { data } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, phone, email, agent_id, status, source')
      .or('phone.ilike.%' + digits + '%')
      .limit(1)
      .maybeSingle()
    return data || null
  } catch(e) {
    console.warn('[phone] contact lookup:', e.message)
    return null
  }
}

// ── ERROR RESPONSE (always valid TwiML) ──────────────────────────
function errorTwiml(msg) {
  return wrap(
    say('We are sorry, ' + (msg || 'an error occurred') + '. Please call back shortly.') +
    hangup()
  )
}

// ── HOLD MUSIC URLS ───────────────────────────────────────────────
const HOLD_MUSIC = {
  classical: 'https://demo.twilio.com/docs/classic.mp3',
  jazz:      'https://demo.twilio.com/docs/jazz.mp3',
  pop:       'http://com.twilio.sounds.music.s3.amazonaws.com/MARKOVICHAMP-Borghestral.mp3',
  silence:   'https://demo.twilio.com/docs/silence.mp3',
}

module.exports = {
  wrap, say, pause, play, record, voicemailTwiml, redirect, hangup,
  sanitize, getSupabase, parseBody, parseQS, parseJson,
  normalizePhone, formatPhone, isBusinessHours,
  loadFlow, lookupContact, errorTwiml, HOLD_MUSIC,
}
