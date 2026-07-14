// ═══════════════════════════════════════════════════════════════
// TC Board — Sync Health Check
// Detects drift between tc_deals and the linked deals / listings
// records they're supposed to stay in sync with (the sync in
// TransactionCoordinator.jsx is best-effort: if a linked-board write
// fails mid-sync, the boards silently diverge until someone notices).
//
// Direction of truth: the TC Board. Fixes push TC values OUTWARD to
// deals/listings — the same direction syncToAllBoards() pushes.
//
// Checks per tc_deal:
//   linked deal    → exists? sale_price, ao_date, close_date,
//                    agent_id, stage vs phaseToStage[tc_phase]
//   linked listing → exists? list_price, agent_id,
//                    status vs phaseToStatus[tc_phase]
// ═══════════════════════════════════════════════════════════════

import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import { phaseToStage, phaseToStatus } from '../lib/tcPhaseMap'
import { Btn, Modal, ModalActions } from './UI'

// Normalizers so cosmetic differences don't count as drift
const normDate = v => (v ? String(v).slice(0, 10) : null)
const normNum  = v => (v === null || v === undefined || v === '' ? null : Number(v))
const normStr  = v => (v === null || v === undefined || v === '' ? null : String(v))

function fmtVal(v) {
  if (v === null || v === undefined || v === '') return '—'
  return String(v)
}

export default function TCSyncHealth({ agents = [], onFixed }) {
  const [open,    setOpen]    = useState(false)
  const [running, setRunning] = useState(false)
  const [fixing,  setFixing]  = useState(null)   // issue key being fixed, or 'ALL'
  const [issues,  setIssues]  = useState(null)   // null = not run yet
  const [error,   setError]   = useState(null)

  const agentName = id => agents.find(a => a.id === id)?.name || id || '—'

  async function runCheck() {
    setRunning(true); setError(null); setIssues(null)
    try {
      const { data: tcDeals, error: e1 } = await supabase
        .from('tc_deals')
        .select('id, address, tc_phase, sale_price, list_price, ao_date, close_date, agent_id, linked_deal_id, linked_listing_id')
        .range(0, 999)
      if (e1) throw e1

      const dealIds    = [...new Set(tcDeals.map(d => d.linked_deal_id).filter(Boolean))]
      const listingIds = [...new Set(tcDeals.map(d => d.linked_listing_id).filter(Boolean))]

      const [dealsRes, listingsRes] = await Promise.all([
        dealIds.length    ? supabase.from('deals').select('id, sale_price, ao_date, close_date, agent_id, stage').in('id', dealIds)          : { data: [] },
        listingIds.length ? supabase.from('listings').select('id, list_price, agent_id, status').in('id', listingIds)                        : { data: [] },
      ])
      if (dealsRes.error)    throw dealsRes.error
      if (listingsRes.error) throw listingsRes.error

      const dealById    = Object.fromEntries((dealsRes.data    || []).map(d => [d.id, d]))
      const listingById = Object.fromEntries((listingsRes.data || []).map(l => [l.id, l]))

      const found = []

      for (const tc of tcDeals) {
        const label = tc.address || ('TC deal ' + tc.id)

        // ── Linked deal checks ──
        if (tc.linked_deal_id) {
          const deal = dealById[tc.linked_deal_id]
          if (!deal) {
            found.push({ key: tc.id + ':deal:orphan', tcId: tc.id, label, target: 'Production', field: 'linked deal',
                         tcVal: 'link → ' + tc.linked_deal_id, otherVal: 'record missing', orphan: true,
                         fix: { table: 'tc_deals', id: tc.id, patch: { linked_deal_id: null } },
                         fixLabel: 'Clear broken link' })
          } else {
            const checks = [
              ['sale_price', normNum(tc.sale_price),  normNum(deal.sale_price),  tc.sale_price],
              ['ao_date',    normDate(tc.ao_date),    normDate(deal.ao_date),    normDate(tc.ao_date)],
              ['close_date', normDate(tc.close_date), normDate(deal.close_date), normDate(tc.close_date)],
              ['agent_id',   normStr(tc.agent_id),    normStr(deal.agent_id),    tc.agent_id],
            ]
            for (const [field, tcN, otherN, rawTc] of checks) {
              if (tcN === null && otherN === null) continue
              if (tcN !== otherN) {
                found.push({ key: tc.id + ':deal:' + field, tcId: tc.id, label, target: 'Production', field,
                             tcVal: field === 'agent_id' ? agentName(tc.agent_id) : fmtVal(tcN),
                             otherVal: field === 'agent_id' ? agentName(deal.agent_id) : fmtVal(otherN),
                             fix: { table: 'deals', id: deal.id, patch: { [field]: rawTc ?? null } } })
              }
            }
            const wantStage = phaseToStage[tc.tc_phase]
            if (wantStage && normStr(deal.stage) !== wantStage) {
              found.push({ key: tc.id + ':deal:stage', tcId: tc.id, label, target: 'Production', field: 'stage (from phase)',
                           tcVal: tc.tc_phase + ' → ' + wantStage, otherVal: fmtVal(deal.stage),
                           fix: { table: 'deals', id: deal.id, patch: { stage: wantStage } } })
            }
          }
        }

        // ── Linked listing checks ──
        if (tc.linked_listing_id) {
          const listing = listingById[tc.linked_listing_id]
          if (!listing) {
            found.push({ key: tc.id + ':listing:orphan', tcId: tc.id, label, target: 'Listings', field: 'linked listing',
                         tcVal: 'link → ' + tc.linked_listing_id, otherVal: 'record missing', orphan: true,
                         fix: { table: 'tc_deals', id: tc.id, patch: { linked_listing_id: null } },
                         fixLabel: 'Clear broken link' })
          } else {
            if (normNum(tc.list_price) !== normNum(listing.list_price) && !(normNum(tc.list_price) === null && normNum(listing.list_price) === null)) {
              found.push({ key: tc.id + ':listing:list_price', tcId: tc.id, label, target: 'Listings', field: 'list_price',
                           tcVal: fmtVal(normNum(tc.list_price)), otherVal: fmtVal(normNum(listing.list_price)),
                           fix: { table: 'listings', id: listing.id, patch: { list_price: tc.list_price ?? null } } })
            }
            if (normStr(tc.agent_id) !== normStr(listing.agent_id) && !(tc.agent_id == null && listing.agent_id == null)) {
              found.push({ key: tc.id + ':listing:agent_id', tcId: tc.id, label, target: 'Listings', field: 'agent_id',
                           tcVal: agentName(tc.agent_id), otherVal: agentName(listing.agent_id),
                           fix: { table: 'listings', id: listing.id, patch: { agent_id: tc.agent_id ?? null } } })
            }
            const wantStatus = phaseToStatus[tc.tc_phase]
            if (wantStatus && normStr(listing.status) !== wantStatus) {
              found.push({ key: tc.id + ':listing:status', tcId: tc.id, label, target: 'Listings', field: 'status (from phase)',
                           tcVal: tc.tc_phase + ' → ' + wantStatus, otherVal: fmtVal(listing.status),
                           fix: { table: 'listings', id: listing.id, patch: { status: wantStatus } } })
            }
          }
        }
      }

      setIssues(found)
    } catch (e) {
      setError(e.message || 'Check failed')
    } finally {
      setRunning(false)
    }
  }

  async function applyFix(issue) {
    setFixing(issue.key)
    try {
      const { error: e } = await supabase
        .from(issue.fix.table)
        .update({ ...issue.fix.patch, updated_at: new Date().toISOString() })
        .eq('id', issue.fix.id)
      if (e) throw e
      setIssues(prev => prev.filter(i => i.key !== issue.key))
      if (onFixed) onFixed()
    } catch (e) {
      setError('Fix failed: ' + (e.message || 'unknown error'))
    } finally {
      setFixing(null)
    }
  }

  async function fixAll() {
    if (!issues?.length) return
    if (!window.confirm('Push TC Board values to ' + issues.length + ' out-of-sync record' + (issues.length !== 1 ? 's' : '') + '? The TC Board is treated as the source of truth.')) return
    setFixing('ALL')
    const remaining = []
    for (const issue of issues) {
      try {
        const { error: e } = await supabase
          .from(issue.fix.table)
          .update({ ...issue.fix.patch, updated_at: new Date().toISOString() })
          .eq('id', issue.fix.id)
        if (e) remaining.push(issue)
      } catch { remaining.push(issue) }
    }
    setIssues(remaining)
    setFixing(null)
    if (onFixed) onFixed()
    if (remaining.length) setError(remaining.length + ' fix(es) failed — see rows still listed.')
  }

  return (
    <>
      <Btn variant="secondary" onClick={() => { setOpen(true); runCheck() }}>🩺 Sync Check</Btn>

      <Modal open={open} title="TC Board Sync Health" onClose={() => setOpen(false)} width={860}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Compares every TC deal against its linked Production deal and Listing.
            The TC Board is the source of truth — fixes push TC values outward.
          </div>

          {error && (
            <div style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>
              {error}
            </div>
          )}

          {running && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Checking all linked boards…</div>}

          {!running && issues && issues.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
              <div style={{ fontWeight: 700, color: 'var(--text)' }}>All boards in sync</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>No drift detected between the TC Board, Production, and Listings.</div>
            </div>
          )}

          {!running && issues && issues.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                  {issues.length} out-of-sync value{issues.length !== 1 ? 's' : ''} found
                </div>
                <Btn onClick={fixAll} disabled={fixing === 'ALL'}>
                  {fixing === 'ALL' ? 'Fixing…' : 'Fix All (push TC values)'}
                </Btn>
              </div>
              <div style={{ maxHeight: 380, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', background: 'var(--bg-alt, #F9FAFB)' }}>
                      <th style={{ padding: '8px 10px' }}>Deal</th>
                      <th style={{ padding: '8px 10px' }}>Board</th>
                      <th style={{ padding: '8px 10px' }}>Field</th>
                      <th style={{ padding: '8px 10px' }}>TC Board</th>
                      <th style={{ padding: '8px 10px' }}>Linked value</th>
                      <th style={{ padding: '8px 10px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {issues.map(issue => (
                      <tr key={issue.key} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{issue.label}</td>
                        <td style={{ padding: '8px 10px' }}>{issue.target}</td>
                        <td style={{ padding: '8px 10px' }}>{issue.field}</td>
                        <td style={{ padding: '8px 10px', color: '#065F46' }}>{issue.tcVal}</td>
                        <td style={{ padding: '8px 10px', color: issue.orphan ? '#991B1B' : '#92400E' }}>{issue.otherVal}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <Btn variant="secondary" onClick={() => applyFix(issue)} disabled={!!fixing}>
                            {fixing === issue.key ? '…' : (issue.fixLabel || 'Fix')}
                          </Btn>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <ModalActions>
            <Btn variant="secondary" onClick={runCheck} disabled={running || !!fixing}>Re-run Check</Btn>
            <Btn variant="secondary" onClick={() => setOpen(false)}>Close</Btn>
          </ModalActions>
      </Modal>
    </>
  )
}
