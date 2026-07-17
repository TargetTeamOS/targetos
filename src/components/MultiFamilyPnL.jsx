// ═══════════════════════════════════════════════════════════════
// MULTI-FAMILY P&L (July 2026) — Toolbox tab
// The team's investment-property proforma, productized: agents pick
// unit count, fill rents (current + optional potential), check off
// only the expenses that apply (or mark them tenant-paid), optionally
// add financing — and generate a branded report that includes ONLY
// what was filled in. Modeled on the office spreadsheet
// (50 Westside Ave / Route 9W examples).
// ═══════════════════════════════════════════════════════════════
import React, { useState, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { AddressAutocomplete } from './AddressAutocomplete'

const ff = 'Inter,system-ui,sans-serif'
const $ = n => (n == null || isNaN(n)) ? '—' : '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })
const pct = n => (n == null || isNaN(n) || !isFinite(n)) ? '—' : n.toFixed(2) + '%'
const num = v => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n }

const EXPENSE_PRESETS = [
  { key: 'taxes',      label: 'Taxes' },
  { key: 'insurance',  label: 'Insurance' },
  { key: 'utilities',  label: 'Utilities',        tenantable: true },
  { key: 'water',      label: 'Water / Sewer',    tenantable: true },
  { key: 'snow',       label: 'Snow / Landscaping', tenantable: true },
  { key: 'maintenance',label: 'Maintenance' },
  { key: 'contract',   label: 'Contract Services' },
  { key: 'communal',   label: 'Communal / Common Area' },
  { key: 'management', label: 'Management', pctable: true },
]

const inp = { padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: 12.5, fontFamily: ff }
const lbl = { fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 3 }

export function MultiFamilyPnL() {
  const { agent } = useAuth()
  const { state } = useApp()
  const [addr, setAddr]       = useState('')
  const [asking, setAsking]   = useState('')
  const [propType, setPropType] = useState('')
  const [units, setUnits]     = useState([
    { label: '1', desc: '', rent: '', potential: '', vacant: false },
    { label: '2', desc: '', rent: '', potential: '', vacant: false },
  ])
  const [expenses, setExpenses] = useState(
    EXPENSE_PRESETS.map(p => ({ ...p, on: ['taxes','insurance'].includes(p.key), amount: '', tenantPaid: false, isPct: false, pctVal: '' })))
  const [customExp, setCustomExp] = useState([])   // {label, amount}
  const [financeOn, setFinanceOn] = useState(true)
  const [downPct, setDownPct]     = useState('25')
  const [closing, setClosing]     = useState('')
  const [rate, setRate]           = useState('6.5')
  const [termYrs, setTermYrs]     = useState('30')

  function setUnit(i, k, v) { setUnits(u => u.map((x, j) => j === i ? { ...x, [k]: v } : x)) }
  function addUnit()   { setUnits(u => [...u, { label: String(u.length + 1), desc: '', rent: '', potential: '', vacant: false }]) }
  function delUnit(i)  { setUnits(u => u.filter((_, j) => j !== i)) }
  function setExp(i, patch) { setExpenses(e => e.map((x, j) => j === i ? { ...x, ...patch } : x)) }

  const calc = useMemo(() => {
    const monthlyCur = units.reduce((a, u) => a + num(u.rent), 0)
    const hasPotential = units.some(u => num(u.potential) > 0)
    const monthlyPot = hasPotential ? units.reduce((a, u) => a + (num(u.potential) || num(u.rent)), 0) : monthlyCur
    const annualCur = monthlyCur * 12, annualPot = monthlyPot * 12

    const expLines = []
    let totalExp = 0, totalExpPot = 0
    for (const e of expenses) {
      if (!e.on) continue
      if (e.tenantPaid) { expLines.push({ label: e.label, display: 'Paid by tenant', amt: 0, amtPot: 0 }); continue }
      let amt, amtPot
      if (e.isPct && e.pctable) {
        const p = num(e.pctVal) / 100
        amt = annualCur * p; amtPot = annualPot * p
        expLines.push({ label: e.label + ' (' + num(e.pctVal) + '%)', amt, amtPot })
      } else {
        amt = num(e.amount); amtPot = amt
        if (!amt) continue
        expLines.push({ label: e.label, amt, amtPot })
      }
      totalExp += amt; totalExpPot += amtPot
    }
    for (const c of customExp) {
      const amt = num(c.amount)
      if (!c.label || !amt) continue
      expLines.push({ label: c.label, amt, amtPot: amt })
      totalExp += amt; totalExpPot += amt
    }

    const ask = num(asking)
    const noi = annualCur - totalExp, noiPot = annualPot - totalExpPot
    const cap = ask ? noi / ask * 100 : null, capPot = ask ? noiPot / ask * 100 : null

    let fin = null
    if (financeOn && ask) {
      const down = ask * num(downPct) / 100
      const cc   = num(closing)
      const loan = ask - down
      const r    = num(rate) / 100 / 12
      const n    = num(termYrs) * 12
      const mMort = r > 0 ? loan * r / (1 - Math.pow(1 + r, -n)) : (n ? loan / n : 0)
      const aMort = mMort * 12
      const mExp  = totalExp / 12, mExpPot = totalExpPot / 12
      fin = {
        down, cc, totalIn: down + cc, loan,
        mMort, aMort,
        mPayment: mMort + mExp, mPaymentPot: mMort + mExpPot,
        mProfit: monthlyCur - mMort - mExp, mProfitPot: monthlyPot - mMort - mExpPot,
        coc: noi - aMort, cocPot: noiPot - aMort,
        cocRate: (down + cc) ? (noi - aMort) / (down + cc) * 100 : null,
        cocRatePot: (down + cc) ? (noiPot - aMort) / (down + cc) * 100 : null,
      }
    }
    return { monthlyCur, monthlyPot, annualCur, annualPot, hasPotential, expLines, totalExp, totalExpPot, noi, noiPot, cap, capPot, fin, ask }
  }, [units, expenses, customExp, asking, financeOn, downPct, closing, rate, termYrs])

  // ── BRANDED REPORT: only filled-in sections make it in ──────────
  function generateReport() {
    const c = calc
    const P = c.hasPotential
    const logo = (state.custom || {}).logoUrl || ''
    const row = (label, cur, pot, bold) =>
      '<tr' + (bold ? ' style="font-weight:800;background:#F6F7FB"' : '') + '><td style="padding:7px 10px;border-bottom:1px solid #eee">' + label + '</td>' +
      '<td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:right">' + cur + '</td>' +
      (P ? '<td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:right">' + pot + '</td>' : '') + '</tr>'
    const head3 = (a, b, cc2) => '<tr style="background:#1B2B4B;color:#fff"><th style="padding:8px 10px;text-align:left">' + a + '</th><th style="padding:8px 10px;text-align:right">' + b + '</th>' + (P ? '<th style="padding:8px 10px;text-align:right">' + cc2 + '</th>' : '') + '</tr>'

    let unitsRows = ''
    units.forEach(u => {
      if (!num(u.rent) && !u.desc) return
      unitsRows += row('Unit ' + u.label + (u.vacant ? ' <span style="color:#F5A623;font-weight:700">(Vacant)</span>' : '') + (u.desc ? ' — ' + u.desc : ''), $(num(u.rent)), $(num(u.potential) || num(u.rent)))
    })
    let expRows = ''
    c.expLines.forEach(e => { expRows += row(e.label, e.display || $(e.amt), e.display || $(e.amtPot)) })

    let finBlock = ''
    if (c.fin) {
      finBlock = '<h3 style="margin:22px 0 8px;font-size:15px;color:#1B2B4B">Financing (' + num(downPct) + '% down · ' + num(rate) + '% rate · ' + num(termYrs) + ' yr)</h3>' +
        '<table style="width:100%;border-collapse:collapse;font-size:13px">' + head3('', 'Current', 'Potential') +
        row('Down payment (' + num(downPct) + '%)', $(c.fin.down), $(c.fin.down)) +
        (c.fin.cc ? row('Closing costs', $(c.fin.cc), $(c.fin.cc)) : '') +
        row('Total cash in', $(c.fin.totalIn), $(c.fin.totalIn), true) +
        row('Monthly mortgage', $(c.fin.mMort), $(c.fin.mMort)) +
        row('Monthly payment (mortgage + expenses)', $(c.fin.mPayment), $(c.fin.mPaymentPot)) +
        row('Monthly income', $(c.monthlyCur), $(c.monthlyPot)) +
        row('Monthly profit', $(c.fin.mProfit), $(c.fin.mProfitPot), true) +
        row('Annual cash-on-cash', $(c.fin.coc), $(c.fin.cocPot)) +
        row('Cash-on-cash rate', pct(c.fin.cocRate), pct(c.fin.cocRatePot), true) +
        '</table>'
    }

    const html = '<!DOCTYPE html><html><head><title>' + (addr || 'Investment Analysis') + '</title></head>' +
      '<body style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:760px;margin:0 auto;padding:28px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;border-bottom:4px solid #CC2200;padding-bottom:14px;margin-bottom:18px">' +
        '<div><div style="font-size:21px;font-weight:900;color:#1B2B4B;letter-spacing:.5px">TARGET TEAM</div>' +
        '<div style="font-size:11px;color:#888;letter-spacing:2px">KELLER WILLIAMS VALLEY REALTY</div></div>' +
        (logo ? '<img src="' + logo + '" style="height:46px" />' : '') + '</div>' +
      '<h2 style="margin:0 0 2px;font-size:19px;color:#111">' + (addr || 'Investment Property Analysis') + '</h2>' +
      '<div style="font-size:13px;color:#555;margin-bottom:16px">' + (propType ? propType + ' · ' : '') + (c.ask ? 'Asking ' + $(c.ask) : '') + '</div>' +
      '<h3 style="margin:14px 0 8px;font-size:15px;color:#1B2B4B">Rent Roll</h3>' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px">' + head3('Unit', 'Current Rent', 'Potential') + unitsRows +
      row('Monthly income', $(c.monthlyCur), $(c.monthlyPot), true) +
      row('Annual income', $(c.annualCur), $(c.annualPot), true) + '</table>' +
      (expRows ? '<h3 style="margin:22px 0 8px;font-size:15px;color:#1B2B4B">Annual Expenses</h3>' +
        '<table style="width:100%;border-collapse:collapse;font-size:13px">' + head3('', 'Current', 'Potential') + expRows +
        row('Total expenses', $(c.totalExp), $(c.totalExpPot), true) + '</table>' : '') +
      '<h3 style="margin:22px 0 8px;font-size:15px;color:#1B2B4B">Returns</h3>' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px">' + head3('', 'Current', 'Potential') +
      row('Net operating income', $(c.noi), $(c.noiPot), true) +
      (c.cap != null ? row('Cap rate', pct(c.cap), pct(c.capPot), true) : '') + '</table>' +
      finBlock +
      '<div style="margin-top:26px;padding-top:10px;border-top:1px solid #ddd;font-size:10.5px;color:#999">' +
      'Target Team · Keller Williams Valley Realty · 845.424.1014<br/>' +
      'Estimates for discussion purposes only — not a guarantee of income, expenses, or returns. Buyer to verify all figures.</div>' +
      '<script>window.onload=function(){window.print()}</' + 'script></body></html>'

    const w = window.open('', '_blank')
    if (!w) { alert('Popup blocked — allow popups to generate the report'); return }
    w.document.write(html); w.document.close()
  }

  // ── JPEG for WhatsApp status / social (July 2026) ────────────────
  // Draws the full analysis to a 1080-wide canvas (dynamic height) and
  // downloads a JPEG — everything that's filled in, nothing that isn't.
  function generateJpeg() {
    const c = calc
    const P2 = c.hasPotential
    const rows = []   // {type:'header'|'section'|'row'|'total', l, a, b}
    units.forEach(u => { if (num(u.rent) || u.desc)
      rows.push({ type:'row', l: 'Unit ' + u.label + (u.vacant ? ' (Vacant)' : '') + (u.desc ? ' — ' + u.desc : ''), a: $(num(u.rent)), b: $(num(u.potential) || num(u.rent)) }) })
    const rentRows = rows.length
    rows.push({ type:'total', l:'Monthly income', a:$(c.monthlyCur), b:$(c.monthlyPot) })
    rows.push({ type:'total', l:'Annual income',  a:$(c.annualCur),  b:$(c.annualPot) })
    if (c.expLines.length) {
      rows.push({ type:'section', l:'Annual Expenses' })
      c.expLines.forEach(e => rows.push({ type:'row', l:e.label, a:e.display || $(e.amt), b:e.display || $(e.amtPot) }))
      rows.push({ type:'total', l:'Total expenses', a:$(c.totalExp), b:$(c.totalExpPot) })
    }
    rows.push({ type:'section', l:'Returns' })
    rows.push({ type:'total', l:'Net operating income', a:$(c.noi), b:$(c.noiPot) })
    if (c.cap != null) rows.push({ type:'total', l:'Cap rate', a:pct(c.cap), b:pct(c.capPot) })
    if (c.fin) {
      rows.push({ type:'section', l:'Financing (' + num(downPct) + '% down · ' + num(rate) + '%)' })
      rows.push({ type:'row', l:'Total cash in', a:$(c.fin.totalIn), b:$(c.fin.totalIn) })
      rows.push({ type:'row', l:'Monthly mortgage', a:$(c.fin.mMort), b:$(c.fin.mMort) })
      rows.push({ type:'row', l:'Monthly profit', a:$(c.fin.mProfit), b:$(c.fin.mProfitPot) })
      rows.push({ type:'total', l:'Cash-on-cash', a:pct(c.fin.cocRate), b:pct(c.fin.cocRatePot) })
    }

    const W = 1080, PAD = 60, ROW = 46, SEC = 74
    const headerH = 300
    const bodyH = rows.reduce((h, r) => h + (r.type === 'section' ? SEC : ROW), 0) + 40
    const H = headerH + bodyH + 120
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H
    const x = cv.getContext('2d')
    x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, W, H)
    // Header
    x.fillStyle = '#1B2B4B'; x.fillRect(0, 0, W, 150)
    x.fillStyle = '#CC2200'; x.fillRect(0, 150, W, 8)
    x.fillStyle = '#FFFFFF'; x.font = '900 44px Arial'; x.fillText('TARGET TEAM', PAD, 78)
    x.font = '600 20px Arial'; x.fillStyle = 'rgba(255,255,255,.75)'
    x.fillText('K E L L E R   W I L L I A M S   V A L L E Y   R E A L T Y', PAD, 112)
    x.fillStyle = '#111111'; x.font = '800 34px Arial'
    x.fillText((addr || 'Investment Property Analysis').slice(0, 52), PAD, 215)
    x.font = '600 24px Arial'; x.fillStyle = '#555555'
    x.fillText([propType, c.ask ? 'Asking ' + $(c.ask) : ''].filter(Boolean).join('  ·  '), PAD, 254)
    // Column headers
    const colA = P2 ? W - 480 : W - 320, colB = W - 250
    let y = headerH
    x.font = '800 22px Arial'; x.fillStyle = '#1B2B4B'
    x.fillText('Rent Roll', PAD, y - 14)
    if (P2) { x.font = '700 19px Arial'; x.fillStyle = '#888'
      x.fillText('Current', colA, y - 14); x.fillText('Potential', colB, y - 14) }
    rows.forEach(r => {
      if (r.type === 'section') {
        y += SEC
        x.fillStyle = '#1B2B4B'; x.font = '800 26px Arial'; x.fillText(r.l, PAD, y - 22)
        return
      }
      y += ROW
      if (r.type === 'total') { x.fillStyle = '#F6F7FB'; x.fillRect(PAD - 14, y - 32, W - 2 * PAD + 28, 42) }
      x.fillStyle = '#222222'; x.font = (r.type === 'total' ? '800 ' : '500 ') + '22px Arial'
      x.fillText(String(r.l).slice(0, 58), PAD, y)
      x.textAlign = 'right'
      x.fillText(r.a, P2 ? colA + 110 : W - PAD, y)
      if (P2) { x.fillStyle = r.type === 'total' ? '#0B7A45' : '#222222'; x.fillText(r.b, W - PAD, y) }
      x.textAlign = 'left'
      x.strokeStyle = '#EEEEEE'; x.beginPath(); x.moveTo(PAD, y + 10); x.lineTo(W - PAD, y + 10); x.stroke()
    })
    // Footer
    y = H - 60
    x.fillStyle = '#999999'; x.font = '500 17px Arial'
    x.fillText('Target Team · Keller Williams Valley Realty · 845.424.1014', PAD, y)
    x.fillText('Estimates only — buyer to verify all figures.', PAD, y + 26)

    const a = document.createElement('a')
    a.download = (addr ? addr.replace(/[^a-z0-9]+/gi, '_') : 'investment_analysis') + '.jpg'
    a.href = cv.toDataURL('image/jpeg', 0.92)
    a.click()
  }

  const P = calc.hasPotential
  return (
    <div style={{ fontFamily: ff, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 16, alignItems: 'start' }}>
      <div>
        {/* Property */}
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
            <div><div style={lbl}>Property address</div>
              <AddressAutocomplete value={addr} onChange={setAddr} onSelect={s => setAddr(s.full || s.street)} placeholder="50 Westside Ave, Haverstraw NY" /></div>
            <div><div style={lbl}>Asking price</div><input style={{ ...inp, width: '100%' }} value={asking} onChange={e => setAsking(e.target.value)} placeholder="999,000" /></div>
            <div><div style={lbl}>Type</div><input style={{ ...inp, width: '100%' }} value={propType} onChange={e => setPropType(e.target.value)} placeholder="4 Family" /></div>
          </div>
        </div>

        {/* Units */}
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>🏢 Rent Roll <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 11 }}>— leave Potential blank if same as current</span></div>
          {units.map((u, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '46px 1.4fr 1fr 1fr 60px 26px', gap: 8, marginBottom: 6, alignItems: 'center' }}>
              <input style={inp} value={u.label} onChange={e => setUnit(i, 'label', e.target.value)} title="Unit #" />
              <input style={inp} value={u.desc} onChange={e => setUnit(i, 'desc', e.target.value)} placeholder="2 Bedroom - 1 Bath / 705a Route 9W" />
              <input style={inp} value={u.rent} onChange={e => setUnit(i, 'rent', e.target.value)} placeholder="Current $/mo" />
              <input style={inp} value={u.potential} onChange={e => setUnit(i, 'potential', e.target.value)} placeholder="Potential $/mo" />
              <label style={{ fontSize: 10.5, color: u.vacant ? '#F5A623' : 'var(--muted)', display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={u.vacant} onChange={e => setUnit(i, 'vacant', e.target.checked)} />Vacant</label>
              <button onClick={() => delUnit(i)} style={{ border: 'none', background: 'none', color: '#DC2626', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
          ))}
          <button onClick={addUnit} style={{ marginTop: 4, padding: '7px 14px', borderRadius: 8, border: '1px dashed var(--border)', background: 'var(--dim)', color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>+ Add unit</button>
        </div>

        {/* Expenses */}
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>🧾 Annual Expenses <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 11 }}>— only checked lines appear on the report</span></div>
          {expenses.map((e, i) => (
            <div key={e.key} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 190, fontSize: 12.5, color: 'var(--text)', cursor: 'pointer', fontWeight: e.on ? 700 : 400 }}>
                <input type="checkbox" checked={e.on} onChange={ev => setExp(i, { on: ev.target.checked })} />{e.label}</label>
              {e.on && !e.tenantPaid && !(e.isPct && e.pctable) && (
                <input style={{ ...inp, width: 130 }} value={e.amount} onChange={ev => setExp(i, { amount: ev.target.value })} placeholder="$ / year" />)}
              {e.on && e.pctable && e.isPct && (
                <input style={{ ...inp, width: 90 }} value={e.pctVal} onChange={ev => setExp(i, { pctVal: ev.target.value })} placeholder="% of income" />)}
              {e.on && e.pctable && (
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={e.isPct} onChange={ev => setExp(i, { isPct: ev.target.checked })} />% of income</label>)}
              {e.on && e.tenantable && (
                <label style={{ fontSize: 11, color: e.tenantPaid ? '#10B981' : 'var(--muted)', display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={e.tenantPaid} onChange={ev => setExp(i, { tenantPaid: ev.target.checked })} />Paid by tenant</label>)}
            </div>
          ))}
          {customExp.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <input style={{ ...inp, flex: 1 }} value={c.label} onChange={e => setCustomExp(x => x.map((y, j) => j === i ? { ...y, label: e.target.value } : y))} placeholder="Custom expense" />
              <input style={{ ...inp, width: 130 }} value={c.amount} onChange={e => setCustomExp(x => x.map((y, j) => j === i ? { ...y, amount: e.target.value } : y))} placeholder="$ / year" />
              <button onClick={() => setCustomExp(x => x.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: '#DC2626', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
          <button onClick={() => setCustomExp(x => [...x, { label: '', amount: '' }])} style={{ marginTop: 4, padding: '7px 14px', borderRadius: 8, border: '1px dashed var(--border)', background: 'var(--dim)', color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>+ Custom expense</button>
        </div>

        {/* Financing */}
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={financeOn} onChange={e => setFinanceOn(e.target.checked)} />🏦 Include financing section</label>
          {financeOn && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginTop: 10 }}>
              <div><div style={lbl}>Down %</div><input style={{ ...inp, width: '100%' }} value={downPct} onChange={e => setDownPct(e.target.value)} /></div>
              <div><div style={lbl}>Closing costs $</div><input style={{ ...inp, width: '100%' }} value={closing} onChange={e => setClosing(e.target.value)} placeholder="35,000" /></div>
              <div><div style={lbl}>Rate %</div><input style={{ ...inp, width: '100%' }} value={rate} onChange={e => setRate(e.target.value)} /></div>
              <div><div style={lbl}>Term (years)</div><input style={{ ...inp, width: '100%' }} value={termYrs} onChange={e => setTermYrs(e.target.value)} /></div>
            </div>
          )}
        </div>
      </div>

      {/* Live results */}
      <div style={{ position: 'sticky', top: 12 }}>
        <div style={{ background: '#1B2B4B', borderRadius: 12, padding: 16, color: '#fff', marginBottom: 10 }}>
          <div style={{ fontSize: 11, opacity: .7, textTransform: 'uppercase', letterSpacing: 1 }}>Live Results {P && '· current / potential'}</div>
          {[
            ['Monthly income', $(calc.monthlyCur), $(calc.monthlyPot)],
            ['Annual income', $(calc.annualCur), $(calc.annualPot)],
            ['Total expenses', $(calc.totalExp), $(calc.totalExpPot)],
            ['NOI', $(calc.noi), $(calc.noiPot)],
            ['Cap rate', pct(calc.cap), pct(calc.capPot)],
            ...(calc.fin ? [
              ['Total cash in', $(calc.fin.totalIn), $(calc.fin.totalIn)],
              ['Monthly profit', $(calc.fin.mProfit), $(calc.fin.mProfitPot)],
              ['Cash-on-cash', pct(calc.fin.cocRate), pct(calc.fin.cocRatePot)],
            ] : []),
          ].map(([l, a, b]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.12)', fontSize: 12.5 }}>
              <span style={{ opacity: .85 }}>{l}</span>
              <span style={{ fontWeight: 800 }}>{a}{P && a !== b ? <span style={{ color: '#7BE3A6' }}> / {b}</span> : ''}</span>
            </div>
          ))}
        </div>
        <button onClick={generateReport}
          style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: '#CC2200', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: ff }}>
          🖨 Branded Report (PDF)
        </button>
        <button onClick={generateJpeg}
          style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: '#1B2B4B', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: ff, marginTop: 8 }}>
          📸 JPEG — post on status
        </button>
        <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 6, textAlign: 'center' }}>Only filled-in units and checked expenses appear in both.</div>
      </div>
    </div>
  )
}
