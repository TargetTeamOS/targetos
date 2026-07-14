// ═══════════════════════════════════════════════════════════════
// TC Stage 2 panels:
//  • TCSignPanel — links the deal to its for-sale sign on the Signs
//    board: create one at the deal's address, or link an existing
//    sign found by address; update riders + status right from the
//    deal (the map/board reflect it instantly — one shared record).
//  • CommissionBillModal — auto-populates a commission bill from the
//    deal (address, seller, buyer, price, rate from TC Settings),
//    everything editable before sending, emails it to the attorneys
//    on the deal (recipients editable too) through the existing
//    Resend integration.
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { sendEmail } from '../lib/emailService'
import { Btn, Modal, ModalActions } from './UI'

const inp = { width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box' }
const lb = { fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', margin: '8px 0 3px' }

const SIGN_STATUSES = ['On Property', 'Order Sent In', 'Missing - broken', 'Took Away', 'Removal Order Sent', 'Auto Remove Order']

// ── SIGN PANEL ─────────────────────────────────────────────────────
export function TCSignPanel({ deal, onLinked, toast }) {
  const [sign, setSign] = useState(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!deal?.linked_sign_id) { setSign(null); return }
    const { data } = await supabase.from('signs').select('*').eq('id', deal.linked_sign_id).maybeSingle()
    setSign(data || null)
  }
  useEffect(() => { load() }, [deal?.linked_sign_id])

  async function createSign() {
    setBusy(true)
    try {
      const { data, error } = await supabase.from('signs').insert({
        addr: deal.addr || '', agent_id: deal.agent_id || null,
        upper_rider: 'For Sale', lower_rider: '',
        status: 'Order Sent In', created_at: new Date().toISOString(),
      }).select().single()
      if (error) throw error
      await supabase.from('tc_deals').update({ linked_sign_id: data.id, updated_at: new Date().toISOString() }).eq('id', deal.id)
      setSign(data); onLinked?.(data.id)
      toast?.('🪧 Sign created on the Signs board and linked')
    } catch (e) { toast?.('Sign create failed: ' + e.message, '#DC2626') }
    finally { setBusy(false) }
  }

  async function linkExisting() {
    setBusy(true)
    try {
      const like = '%' + (deal.addr || '').split(',')[0].trim() + '%'
      const { data } = await supabase.from('signs').select('*').ilike('addr', like).limit(1)
      if (!data?.length) { toast?.('No sign found matching this address — use Create', '#D97706'); return }
      await supabase.from('tc_deals').update({ linked_sign_id: data[0].id, updated_at: new Date().toISOString() }).eq('id', deal.id)
      setSign(data[0]); onLinked?.(data[0].id)
      toast?.('🪧 Linked existing sign')
    } catch (e) { toast?.('Link failed: ' + e.message, '#DC2626') }
    finally { setBusy(false) }
  }

  async function patchSign(patch) {
    const { data, error } = await supabase.from('signs')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', sign.id).select().single()
    if (error) { toast?.('Sign update failed: ' + error.message, '#DC2626'); return }
    setSign(data)
    toast?.('Sign board updated')
  }

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', margin: '14px 0 8px' }}>🪧 For-sale sign</div>
      {!sign && (
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn variant="secondary" onClick={createSign} disabled={busy}>Create sign for this address</Btn>
          <Btn variant="secondary" onClick={linkExisting} disabled={busy}>Link existing</Btn>
        </div>
      )}
      {sign && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          <div>
            <span style={lb}>Status</span>
            <select style={inp} value={sign.status || ''} onChange={e => patchSign({ status: e.target.value })}>
              {[...new Set([sign.status, ...SIGN_STATUSES])].filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <span style={lb}>Upper rider</span>
            <input style={inp} value={sign.upper_rider || ''} onChange={e => setSign(s => ({ ...s, upper_rider: e.target.value }))}
                   onBlur={e => patchSign({ upper_rider: e.target.value })} />
          </div>
          <div>
            <span style={lb}>Lower rider</span>
            <input style={inp} value={sign.lower_rider || ''} onChange={e => setSign(s => ({ ...s, lower_rider: e.target.value }))}
                   onBlur={e => patchSign({ lower_rider: e.target.value })} />
          </div>
        </div>
      )}
      {sign && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Changes here update the Signs board and map directly — same record, no duplicates.</div>}
    </div>
  )
}

// ── COMMISSION BILL ────────────────────────────────────────────────
const money = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? '' : '$' + Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })

export function CommissionBillModal({ open, onClose, deal, participants = [], contacts = {}, agent, ratePercent = 1.5, toast }) {
  const seller = participants.find(p => p.role === 'Seller')
  const buyer  = participants.find(p => p.role === 'Buyer')
  const attorneyEmails = participants
    .filter(p => /attorney/i.test(p.role || ''))
    .map(p => contacts[p.contact_id]?.email).filter(Boolean)

  const cname = id => { const c = contacts[id]; return c ? ((c.first_name || '') + ' ' + (c.last_name || '')).trim() : '' }

  const [form, setForm] = useState(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open || !deal) return
    const price = Number(deal.sale_price || deal.list_price || 0)
    const rate  = Number(ratePercent) || 1.5
    setForm({
      to: attorneyEmails.join(', '),
      address: deal.addr || '',
      seller: seller ? cname(seller.contact_id) : '',
      buyer:  buyer  ? cname(buyer.contact_id)  : '',
      sale_price: price || '',
      rate,
      amount: price ? Math.round(price * rate) / 100 : '',
      close_date: deal.close_date || '',
      notes: '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deal?.id])

  if (!form) return null
  const set = (k, v) => setForm(f => {
    const next = { ...f, [k]: v }
    if (k === 'sale_price' || k === 'rate') {
      const p = Number(k === 'sale_price' ? v : next.sale_price)
      const r = Number(k === 'rate' ? v : next.rate)
      if (p && r) next.amount = Math.round(p * r) / 100
    }
    return next
  })

  function billHtml() {
    const row = (k, v) => '<tr><td style="padding:6px 12px;color:#64748B;font-size:13px">' + k + '</td><td style="padding:6px 12px;font-size:14px;font-weight:600;color:#0F172A">' + (v || '—') + '</td></tr>'
    return '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">' +
      '<div style="background:#0F172A;color:#fff;padding:18px 24px;border-radius:10px 10px 0 0">' +
        '<div style="font-size:20px;font-weight:800">Commission Bill</div>' +
        '<div style="font-size:13px;opacity:.8">Target Team — Keller Williams</div></div>' +
      '<table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #E2E8F0">' +
        row('Property', form.address) +
        row('Seller', form.seller) +
        row('Buyer', form.buyer) +
        row('Sale price', money(form.sale_price)) +
        row('Commission rate', form.rate + '%') +
        row('<b>Commission due</b>', '<b>' + money(form.amount) + '</b>') +
        row('Expected closing', form.close_date) +
      '</table>' +
      (form.notes ? '<div style="padding:12px;background:#F8FAFC;border:1px solid #E2E8F0;border-top:0;font-size:13px;color:#334155">' + form.notes + '</div>' : '') +
      '<div style="padding:12px 4px;font-size:12px;color:#64748B">Questions: ' + (agent?.name || 'Target Team') + (agent?.email ? ' · ' + agent.email : '') + '</div></div>'
  }

  async function send() {
    const to = form.to.split(',').map(s => s.trim()).filter(Boolean)
    if (!to.length) { toast?.('Add at least one recipient email', '#DC2626'); return }
    setSending(true)
    try {
      const r = await sendEmail({
        to, subject: 'Commission Bill — ' + form.address,
        html: billHtml(), replyTo: agent?.email || undefined,
      })
      if (r && r.ok === false) throw new Error(r.error || 'send failed')
      toast?.('🧾 Commission bill sent to ' + to.length + ' recipient' + (to.length > 1 ? 's' : ''))
      onClose()
    } catch (e) { toast?.('Send failed: ' + e.message, '#DC2626') }
    finally { setSending(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={'🧾 Commission Bill — ' + (deal?.addr || '')} width={620}>
      <span style={lb}>Send to (attorneys on the deal, comma-separated — editable)</span>
      <input style={inp} value={form.to} onChange={e => set('to', e.target.value)} placeholder="attorney@firm.com, attorney2@firm.com" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div><span style={lb}>Seller</span><input style={inp} value={form.seller} onChange={e => set('seller', e.target.value)} /></div>
        <div><span style={lb}>Buyer</span><input style={inp} value={form.buyer} onChange={e => set('buyer', e.target.value)} /></div>
        <div><span style={lb}>Sale price</span><input style={inp} type="number" value={form.sale_price} onChange={e => set('sale_price', e.target.value)} /></div>
        <div><span style={lb}>Rate %</span><input style={inp} type="number" step="0.05" value={form.rate} onChange={e => set('rate', e.target.value)} /></div>
        <div><span style={lb}>Commission due</span><input style={inp} type="number" value={form.amount} onChange={e => set('amount', e.target.value)} /></div>
        <div><span style={lb}>Expected closing</span><input style={inp} type="date" value={form.close_date} onChange={e => set('close_date', e.target.value)} /></div>
      </div>
      <span style={lb}>Notes (appears on the bill)</span>
      <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={form.notes} onChange={e => set('notes', e.target.value)} />
      <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 8, padding: 8, maxHeight: 220, overflowY: 'auto', background: '#fff' }}
           dangerouslySetInnerHTML={{ __html: billHtml() }} />
      <ModalActions>
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn onClick={send} loading={sending}>Send Commission Bill</Btn>
      </ModalActions>
    </Modal>
  )
}
