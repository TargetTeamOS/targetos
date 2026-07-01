// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Lead Scoring Engine
// Scores contacts 0–100 based on profile completeness,
// engagement activity, status, source quality, and recency.
// Runs client-side — no additional DB tables needed.
// ═══════════════════════════════════════════════════════════════

// ── SCORE WEIGHTS ──────────────────────────────────────────────
const WEIGHTS = {
  // Status (0–30 pts)
  status: {
    'Hot':              30,
    'Warm':             20,
    'Active':           18,
    'Offer Accapted':   25,
    'Under Contract':   22,
    'New':              10,
    'Cold':              5,
    'Past Client':      15,
    'Do Not Contact':    0,
    'Closed':            5,
  },

  // Source quality (0–20 pts)
  source: {
    'Referral':          20,
    'Past Client Repeat':18,
    'SOI':               15,
    'Open House':        12,
    'Sign Call':         14,
    'Zillow':            10,
    'Realtor.com':       10,
    'Facebook':           8,
    'Instagram':          7,
    'Google':             9,
    'Farm':               6,
    'Cold Call':          4,
    'Unknown':            2,
  },

  // Profile completeness (0–20 pts)
  completeness: {
    phone:       4,
    email:       4,
    address:     3,
    source:      3,
    agent_id:    3,
    notes:       2,
    budget_min:  1,
  },

  // Engagement recency bonus (0–20 pts)
  // Based on days since last activity
  recency: {
    today:    20,  // 0 days
    week:     15,  // 1–7 days
    month:    10,  // 8–30 days
    quarter:   5,  // 31–90 days
    older:     1,  // 91+ days
    never:     0,
  },

  // Activity volume bonus (0–10 pts)
  activity: {
    calls:    2,   // per call, max 6
    notes:    1,   // per note, max 3
    emails:   1,   // per email, max 3
  },
}

// ── SCORE A SINGLE CONTACT ────────────────────────────────────
export function scoreContact(contact, activityCount = {}) {
  let score = 0
  const breakdown = {}

  // 1. Status score
  const statusPts = WEIGHTS.status[contact.status] ?? 5
  score += statusPts
  breakdown.status = { pts: statusPts, label: contact.status || 'Unknown' }

  // 2. Source score
  const sourcePts = WEIGHTS.source[contact.source] ?? 3
  score += sourcePts
  breakdown.source = { pts: sourcePts, label: contact.source || 'Unknown' }

  // 3. Profile completeness
  let compPts = 0
  Object.entries(WEIGHTS.completeness).forEach(([field, pts]) => {
    if (contact[field] && String(contact[field]).trim()) compPts += pts
  })
  score += compPts
  breakdown.completeness = { pts: compPts }

  // 4. Recency
  const lastActivity = contact.last_activity || contact.updated_at || contact.created_at
  let recencyPts = 0
  if (lastActivity) {
    const daysAgo = Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86400000)
    if      (daysAgo === 0)  recencyPts = WEIGHTS.recency.today
    else if (daysAgo <= 7)   recencyPts = WEIGHTS.recency.week
    else if (daysAgo <= 30)  recencyPts = WEIGHTS.recency.month
    else if (daysAgo <= 90)  recencyPts = WEIGHTS.recency.quarter
    else                     recencyPts = WEIGHTS.recency.older
  }
  score += recencyPts
  breakdown.recency = { pts: recencyPts, daysAgo: lastActivity ? Math.floor((Date.now()-new Date(lastActivity).getTime())/86400000) : null }

  // 5. Activity volume
  const callPts  = Math.min((activityCount.calls  || 0) * WEIGHTS.activity.calls,  6)
  const notePts  = Math.min((activityCount.notes  || 0) * WEIGHTS.activity.notes,  3)
  const emailPts = Math.min((activityCount.emails || 0) * WEIGHTS.activity.emails, 3)
  const actPts   = callPts + notePts + emailPts
  score += actPts
  breakdown.activity = { pts: actPts, calls: activityCount.calls||0, notes: activityCount.notes||0, emails: activityCount.emails||0 }

  // Cap at 100
  score = Math.min(Math.round(score), 100)

  return { score, breakdown, grade: scoreGrade(score) }
}

// ── SCORE MULTIPLE CONTACTS ────────────────────────────────────
export function scoreContacts(contacts) {
  return contacts.map(c => ({ ...c, _score: scoreContact(c).score, _grade: scoreContact(c).grade }))
}

// ── GRADE FROM SCORE ──────────────────────────────────────────
export function scoreGrade(score) {
  if (score >= 80) return { label:'A', color:'#10B981', bg:'rgba(16,185,129,.12)', desc:'Hot Lead' }
  if (score >= 60) return { label:'B', color:'#3B82F6', bg:'rgba(59,130,246,.12)', desc:'Warm Lead' }
  if (score >= 40) return { label:'C', color:'#F5A623', bg:'rgba(245,166,35,.12)', desc:'Nurture' }
  if (score >= 20) return { label:'D', color:'#94A3B8', bg:'rgba(148,163,184,.12)', desc:'Cold' }
  return                  { label:'F', color:'#DC2626', bg:'rgba(220,38,38,.08)',  desc:'Inactive' }
}

// ── SCORE BADGE COMPONENT ─────────────────────────────────────
import React from 'react'
const ff = 'Inter, system-ui, sans-serif'
export function ScoreBadge({ score, showLabel = false, size = 'sm' }) {
  if (score === undefined || score === null) return null
  const grade = scoreGrade(score)
  const big = size === 'lg'
  return (
    <div style={{ display:'inline-flex', alignItems:'center', gap:4, padding: big ? '4px 10px' : '2px 7px', borderRadius:99, background:grade.bg, border:'1px solid '+grade.color+'44', flexShrink:0 }}>
      <span style={{ fontSize: big ? 13 : 11, fontWeight:800, color:grade.color, fontFamily:ff }}>{score}</span>
      {showLabel && <span style={{ fontSize:10, color:grade.color, fontWeight:700, fontFamily:ff }}>{grade.label}</span>}
    </div>
  )
}
