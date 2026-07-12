// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Pipeline Page
// Kanban-style deal pipeline view grouped by stage.
// ═══════════════════════════════════════════════════════════════

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useDeals } from '../lib/hooks'
import { fmt$, parseNum } from '../lib/utils'
import { DEAL_STAGES } from '../lib/constants'
import { PageHeader, Loading, Empty, Avatar, Btn } from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

export function Pipeline() {
  const navigate  = useNavigate()
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()

  const filters = isAdmin || canManage ? {} : { agent_id: agent?.id }
  const { deals, loading, update } = useDeals(filters)

  const activeStages = DEAL_STAGES.filter(s => !['Closed','Deal Fell Through'].includes(s.value))

  async function moveDeal(dealId, newStage) {
    try {
      await update(dealId, { stage: newStage }, agent?.id)
      toast("✅ Moved to " + (newStage))
    } catch(e) {
      toast('Failed: ' + e.message, '#DC2626')
    }
  }

  if (loading) return <div style={{ padding: '28px', fontFamily: ff }}><Loading /></div>

  return (
    <div style={{ fontFamily: ff }}>
      <PageHeader
        title="Pipeline"
        sub="Drag-free deal pipeline — click a card to view or move"
        actions={<Btn onClick={() => navigate('/production/new')}>+ Add Deal</Btn>}
      />

      <div style={{ display: 'flex', gap: '14px', overflowX: 'auto', paddingBottom: '16px' }}>
        {activeStages.map(stage => {
          const stageDeals = deals.filter(d => d.stage === stage.value)
          const stageGCI   = stageDeals.reduce((s, d) => s + parseNum(d.gci), 0)

          return (
            <div key={stage.value}
              style={{ minWidth: '240px', width: '240px', background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>

              {/* Column Header */}
              <div style={{ padding: '12px 14px', borderBottom: '2px solid ' + stage.hex, borderRadius: 'var(--radius) var(--radius) 0 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>{stage.label}</div>
                  <span style={{ background: stage.hex + '22', color: stage.hex, fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '99px' }}>{stageDeals.length}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{fmt$(stageGCI)} GCI</div>
              </div>

              {/* Cards */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '60vh' }}>
                {stageDeals.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px', color: 'var(--muted)', fontSize: '12px' }}>Empty</div>
                )}
                {stageDeals.map(deal => (
                  <div key={deal.id}
                    onClick={() => navigate('/production/' + deal.id)}
                    style={{ background: 'var(--dim)', borderRadius: '8px', padding: '12px', cursor: 'pointer', border: '1px solid var(--border)', transition: 'box-shadow .12s' }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.addr}</div>
                    {deal.client_name && <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' }}>{deal.client_name}</div>}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#10B981' }}>{fmt$(deal.gci)}</div>
                      {deal.agents && <Avatar agent={deal.agents} size={22} />}
                    </div>
                    {deal.side && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>{deal.side}</div>}

                    {/* Move buttons */}
                    <div style={{ display: 'flex', gap: '4px', marginTop: '8px', flexWrap: 'wrap' }}>
                      {activeStages.filter(s => s.value !== stage.value).map(s => (
                        <button key={s.value}
                          onClick={(e) => { e.stopPropagation(); moveDeal(deal.id, s.value) }}
                          style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', border: "1px solid " + (s.hex) + "44", background: s.hex + '11', color: s.hex, cursor: 'pointer', fontFamily: ff, fontWeight: 600 }}>
                          → {s.label.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
