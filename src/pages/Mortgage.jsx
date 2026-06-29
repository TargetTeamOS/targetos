// TargetOS V2 — Mortgage & P&L Calculator
// Mortgage calculator, closing costs estimator, agent P&L, and deal analyzer
import React, { useState, useMemo } from 'react'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const TABS = [
  { id:'mortgage',    label:'🏦 Mortgage',       desc:'Monthly payment calculator' },
  { id:'closing',     label:'📋 Closing Costs',  desc:'Buyer & seller net sheets' },
  { id:'pnl',         label:'💰 Agent P&L',       desc:'Commission & profit breakdown' },
  { id:'deal',        label:'📊 Deal Analyzer',   desc:'Full deal side-by-side' },
  { id:'investment',  label:'🏘 Investment',      desc:'Cash on cash return & cap rate' },
]

function fmt$(n) {
  if (!n && n !== 0) return ''
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits:0, maximumFractionDigits:0 })
}
function fmtPct(n) { return n ? Number(n).toFixed(2) + '%' : '' }
function num(v) { return parseFloat(String(v).replace(/[^0-9.]/g,'')) || 0 }

function Section({ title, children, accent }) {
  return (
    <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', overflow:'hidden', marginBottom:16 }}>
      <div style={{ padding:'10px 16px', background: accent || '#1B2B4B', borderBottom:'1px solid var(--border)' }}>
        <div style={{ fontSize:13, fontWeight:800, color:'#fff' }}>{title}</div>
      </div>
      <div style={{ padding:16 }}>{children}</div>
    </div>
  )
}

function Row({ label, value, bold, color, highlight, muted }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0', borderBottom:'1px solid var(--border)',
      background: highlight ? 'rgba(204,34,0,.04)' : 'transparent' }}>
      <span style={{ fontSize:13, color: muted ? 'var(--muted)' : 'var(--text)', fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ fontSize:13, fontWeight: bold ? 800 : 600, color: color || 'var(--text)' }}>{value}</span>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>{label}</div>
      {children}
    </div>
  )
}

const inp = (extra) => ({
  width:'100%', padding:'8px 10px', borderRadius:8,
  border:'1px solid var(--border)', background:'var(--inp)',
  color:'var(--text)', fontSize:13, fontFamily:ff,
  boxSizing:'border-box', ...extra,
})

function NumInput({ value, onChange, prefix, placeholder }) {
  return (
    <div style={{ position:'relative' }}>
      {prefix && <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontSize:13, color:'var(--muted)', pointerEvents:'none' }}>{prefix}</span>}
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ ...inp(), paddingLeft: prefix ? 22 : 10 }} />
    </div>
  )
}

// ── MORTGAGE CALCULATOR ───────────────────────────────────────────
function MortgageCalc() {
  const [price,    setPrice]    = useState('750000')
  const [down,     setDown]     = useState('20')
  const [rate,     setRate]     = useState('7.25')
  const [term,     setTerm]     = useState('30')
  const [tax,      setTax]      = useState('1000')
  const [ins,      setIns]      = useState('150')
  const [hoa,      setHoa]      = useState('0')
  const [address,  setAddress]  = useState('')
  const canvasRef = React.useRef(null)

  const calc = useMemo(() => {
    const p      = num(price)
    const dp     = p * (num(down) / 100)
    const loan   = p - dp
    const r      = num(rate) / 100 / 12
    const n      = num(term) * 12
    const pmi    = loan > p * 0.8 ? (loan * 0.005 / 12) : 0
    const pi     = r > 0 ? loan * (r * Math.pow(1+r,n)) / (Math.pow(1+r,n)-1) : loan/n
    const monthly = pi + num(tax) + num(ins) + pmi + num(hoa)

    // Amortization year 1 summary
    let balance = loan, totalInt = 0, totalPrin = 0
    for (let i = 0; i < 12; i++) {
      const interest = balance * r
      const principal = pi - interest
      totalInt  += interest
      totalPrin += principal
      balance   -= principal
    }

    return { p, dp, loan, pi, pmi, monthly, totalInt, totalPrin, balance, n }
  }, [price, down, rate, term, tax, ins, hoa])

  const rates = [6.5, 6.75, 7.0, 7.25, 7.5, 7.75, 8.0]

  // ── Draw WhatsApp/share card on canvas ─────────────────────────
  function drawCard() {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    const W = 1080, H = 1080
    cv.width = W; cv.height = H

    // Background
    ctx.fillStyle = '#0F1A2E'
    ctx.fillRect(0, 0, W, H)

    // Subtle grid pattern
    ctx.strokeStyle = 'rgba(255,255,255,.04)'
    ctx.lineWidth = 1
    for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke() }
    for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke() }

    // Red accent bar top
    ctx.fillStyle = '#CC2200'
    ctx.fillRect(0, 0, W, 8)

    // TARGET TEAM logo area (top right)
    ctx.font = '900 52px Arial'
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'top'
    ctx.fillText('TARGET TEAM', W - 48, 36)
    ctx.font = '500 22px Arial'
    ctx.fillStyle = 'rgba(255,255,255,.4)'
    ctx.fillText('Of Keller Williams Valley Realty', W - 48, 98)

    // Monthly payment — BIG CENTER
    const monthly = fmt$(Math.round(calc.monthly))
    ctx.font = '900 140px Arial'
    ctx.fillStyle = '#CC2200'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(monthly, W/2, 340)

    ctx.font = '700 32px Arial'
    ctx.fillStyle = 'rgba(255,255,255,.5)'
    ctx.fillText('ESTIMATED MONTHLY PAYMENT', W/2, 460)

    // Divider line
    ctx.strokeStyle = 'rgba(204,34,0,.4)'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(80, 520); ctx.lineTo(W-80, 520); ctx.stroke()

    // Key numbers — 3 columns
    const cols = [
      { label: 'Purchase Price',   value: fmt$(calc.p) },
      { label: 'Down Payment',     value: fmt$(Math.round(calc.dp)) + ' (' + num(down) + '%)' },
      { label: 'Loan Amount',      value: fmt$(Math.round(calc.loan)) },
    ]
    cols.forEach(function(col, i) {
      const x = 180 + i * 360
      ctx.font = '900 44px Arial'
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(col.value, x, 560)
      ctx.font = '600 20px Arial'
      ctx.fillStyle = 'rgba(255,255,255,.4)'
      ctx.fillText(col.label.toUpperCase(), x, 616)
    })

    // Second row
    const row2 = [
      { label: 'Interest Rate',    value: rate + '%' },
      { label: 'Loan Term',        value: term + ' Years' },
      { label: 'P & I Only',       value: fmt$(Math.round(calc.pi)) },
    ]
    row2.forEach(function(col, i) {
      const x = 180 + i * 360
      ctx.font = '900 44px Arial'
      ctx.fillStyle = '#10B981'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(col.value, x, 700)
      ctx.font = '600 20px Arial'
      ctx.fillStyle = 'rgba(255,255,255,.4)'
      ctx.fillText(col.label.toUpperCase(), x, 756)
    })

    // Monthly breakdown bar
    ctx.fillStyle = 'rgba(255,255,255,.06)'
    roundRect(ctx, 60, 820, W-120, 120, 16)
    ctx.fill()

    const items = [
      { l: 'P & I',    v: fmt$(Math.round(calc.pi)),      c: '#ffffff' },
      { l: 'Tax',      v: fmt$(num(tax)),                  c: 'rgba(255,255,255,.7)' },
      { l: 'Insurance',v: fmt$(num(ins)),                  c: 'rgba(255,255,255,.7)' },
    ]
    if (calc.pmi > 0) items.push({ l: 'PMI', v: fmt$(Math.round(calc.pmi)), c: '#F5A623' })
    if (num(hoa) > 0) items.push({ l: 'HOA', v: fmt$(num(hoa)), c: 'rgba(255,255,255,.7)' })
    const colW = (W - 120) / items.length
    items.forEach(function(item, i) {
      const x = 60 + colW * i + colW/2
      ctx.font = '800 34px Arial'
      ctx.fillStyle = item.c
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(item.v, x, 840)
      ctx.font = '500 18px Arial'
      ctx.fillStyle = 'rgba(255,255,255,.35)'
      ctx.fillText(item.l, x, 886)
    })

    // Address if set
    if (address) {
      ctx.font = '700 26px Arial'
      ctx.fillStyle = 'rgba(255,255,255,.55)'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(address, W/2, 970)
    }

    // Footer
    ctx.font = '600 22px Arial'
    ctx.fillStyle = 'rgba(255,255,255,.25)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText('845.424.1014  ·  @thetargetteam  ·  targetreteam.com', W/2, 1058)

    // Red bottom bar
    ctx.fillStyle = '#CC2200'
    ctx.fillRect(0, H-8, W, 8)
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x+r, y)
    ctx.lineTo(x+w-r, y)
    ctx.arcTo(x+w, y, x+w, y+r, r)
    ctx.lineTo(x+w, y+h-r)
    ctx.arcTo(x+w, y+h, x+w-r, y+h, r)
    ctx.lineTo(x+r, y+h)
    ctx.arcTo(x, y+h, x, y+h-r, r)
    ctx.lineTo(x, y+r)
    ctx.arcTo(x, y, x+r, y, r)
    ctx.closePath()
  }

  function downloadCard() {
    drawCard()
    setTimeout(function() {
      const url = canvasRef.current.toDataURL('image/jpeg', 0.95)
      const a = document.createElement('a')
      a.href = url
      a.download = 'Mortgage_' + (address || fmt$(num(price))).replace(/[^a-zA-Z0-9]/g,'_').slice(0,30) + '.jpg'
      a.click()
    }, 60)
  }

  function shareCard() {
    drawCard()
    setTimeout(function() {
      canvasRef.current.toBlob(function(blob) {
        if (navigator.share && blob) {
          const file = new File([blob], 'mortgage.jpg', { type:'image/jpeg' })
          navigator.share({ files:[file], title:'Mortgage Estimate', text:'Mortgage estimate from Target Team' }).catch(function(){})
        } else {
          // Fallback: download
          downloadCard()
        }
      }, 'image/jpeg', 0.95)
    }, 60)
  }

  React.useEffect(function() { drawCard() }, [price, down, rate, term, tax, ins, hoa, address])

  return (
    <>
    <div style={{ display:'grid', gridTemplateColumns:'340px 1fr', gap:20, flexWrap:'wrap' }}>
      <div>
        <Section title="Loan Details">
          <Field label="Purchase Price"><NumInput prefix="$" value={price} onChange={setPrice} placeholder="750,000" /></Field>
          <Field label="Down Payment (%)">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <NumInput value={down} onChange={setDown} placeholder="20" />
              <input readOnly value={fmt$(num(price) * num(down) / 100)} style={{ ...inp(), color:'var(--muted)', background:'var(--dim)' }} />
            </div>
            <div style={{ display:'flex', gap:5, marginTop:6, flexWrap:'wrap' }}>
              {[3.5, 5, 10, 20, 25].map(d => (
                <button key={d} onClick={() => setDown(String(d))}
                  style={{ padding:'3px 10px', borderRadius:14, border:'1px solid var(--border)', background: num(down)===d?'#CC2200':'var(--dim)', color: num(down)===d?'#fff':'var(--muted)', fontSize:11, cursor:'pointer', fontFamily:ff }}>
                  {d}%
                </button>
              ))}
            </div>
          </Field>
          <Field label="Interest Rate (%)"><NumInput value={rate} onChange={setRate} placeholder="7.25" /></Field>
          <Field label="Loan Term">
            <div style={{ display:'flex', gap:6 }}>
              {[10,15,20,30].map(t => (
                <button key={t} onClick={() => setTerm(String(t))}
                  style={{ flex:1, padding:'7px', borderRadius:8, border:'1px solid var(--border)', background: num(term)===t?'#1B2B4B':'var(--dim)', color: num(term)===t?'#fff':'var(--muted)', fontSize:12, fontWeight:num(term)===t?700:400, cursor:'pointer', fontFamily:ff }}>
                  {t}yr
                </button>
              ))}
            </div>
          </Field>
        </Section>
        <Section title="Property (optional)">
          <Field label="Address / Label">
            <input value={address} onChange={e=>setAddress(e.target.value)} placeholder="e.g. 15 Oak Lane, Monsey NY"
              style={{ ...inp(), marginBottom:0 }} />
          </Field>
        </Section>
        <Section title="Monthly Extras">
          <Field label="Property Tax / month"><NumInput prefix="$" value={tax} onChange={setTax} placeholder="1,000" /></Field>
          <Field label="Home Insurance / month"><NumInput prefix="$" value={ins} onChange={setIns} placeholder="150" /></Field>
          <Field label="HOA / month"><NumInput prefix="$" value={hoa} onChange={setHoa} placeholder="0" /></Field>
        </Section>
      </div>

      <div>
        <Section title="Monthly Payment Breakdown" accent="#CC2200">
          <div style={{ textAlign:'center', padding:'16px 0 20px', borderBottom:'1px solid var(--border)', marginBottom:12 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:4 }}>Total Monthly Payment</div>
            <div style={{ fontSize:44, fontWeight:900, color:'#CC2200', lineHeight:1 }}>{fmt$(Math.round(calc.monthly))}</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginTop:4 }}>per month</div>
          </div>
          <Row label="Principal & Interest" value={fmt$(Math.round(calc.pi))} />
          <Row label="Property Tax" value={fmt$(num(tax))} />
          <Row label="Home Insurance" value={fmt$(num(ins))} />
          {calc.pmi > 0 && <Row label="PMI (< 20% down)" value={fmt$(Math.round(calc.pmi))} color="#F5A623" />}
          {num(hoa) > 0 && <Row label="HOA" value={fmt$(num(hoa))} />}
          <Row label="Total Monthly" value={fmt$(Math.round(calc.monthly))} bold color="#CC2200" highlight />
        </Section>

        <Section title="Loan Summary">
          <Row label="Purchase Price"    value={fmt$(calc.p)} />
          <Row label="Down Payment"      value={fmt$(Math.round(calc.dp)) + ' (' + num(down) + '%)'} />
          <Row label="Loan Amount"       value={fmt$(Math.round(calc.loan))} bold />
          <Row label="Total Interest Paid" value={fmt$(Math.round(calc.totalInt * calc.n/12))} color="#DC2626" muted />
          <Row label="Total Cost of Loan"  value={fmt$(Math.round(calc.loan + calc.totalInt * calc.n/12))} muted />
          <Row label="Year 1 Interest"   value={fmt$(Math.round(calc.totalInt))} muted />
          <Row label="Year 1 Principal"  value={fmt$(Math.round(calc.totalPrin))} color="#10B981" muted />
        </Section>

        {/* Rate comparison table */}
        <Section title="Rate Comparison">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:0 }}>
            <div style={{ padding:'6px 10px', background:'var(--dim)', fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase' }}>Rate</div>
            <div style={{ padding:'6px 10px', background:'var(--dim)', fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase' }}>P&I</div>
            <div style={{ padding:'6px 10px', background:'var(--dim)', fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase' }}>Total/mo</div>
            {rates.map(r => {
              const rr = r/100/12, n2=num(term)*12
              const pi2 = rr>0 ? calc.loan*(rr*Math.pow(1+rr,n2))/(Math.pow(1+rr,n2)-1) : calc.loan/n2
              const tot = pi2 + num(tax) + num(ins) + num(hoa)
              const isMe = Math.abs(r - num(rate)) < 0.01
              return [
                <div key={r+'r'} style={{ padding:'7px 10px', borderTop:'1px solid var(--border)', fontSize:12, fontWeight:isMe?800:400, color:isMe?'#CC2200':'var(--text)', background:isMe?'rgba(204,34,0,.04)':'' }}>{r}%</div>,
                <div key={r+'p'} style={{ padding:'7px 10px', borderTop:'1px solid var(--border)', fontSize:12, fontWeight:isMe?800:400, color:isMe?'#CC2200':'var(--text)', background:isMe?'rgba(204,34,0,.04)':'' }}>{fmt$(Math.round(pi2))}</div>,
                <div key={r+'t'} style={{ padding:'7px 10px', borderTop:'1px solid var(--border)', fontSize:12, fontWeight:isMe?800:400, color:isMe?'#CC2200':'var(--text)', background:isMe?'rgba(204,34,0,.04)':'' }}>{fmt$(Math.round(tot))}</div>,
              ]
            })}
          </div>
        </Section>
      </div>
    </div>

    {/* ── SHARE CARD ── */}
    <div style={{ marginTop:20 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:800, color:'var(--text)' }}>📲 Share Card</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>One-page visual — ready for WhatsApp status, text, or download</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={shareCard}
            style={{ padding:'9px 18px', borderRadius:9, border:'1px solid var(--border)', background:'var(--panel)', color:'var(--text)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:ff, display:'flex', alignItems:'center', gap:6 }}>
            📤 Share
          </button>
          <button onClick={downloadCard}
            style={{ padding:'9px 18px', borderRadius:9, border:'none', background:'#CC2200', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:ff, display:'flex', alignItems:'center', gap:6 }}>
            ⬇ Download JPG
          </button>
        </div>
      </div>

      {/* Canvas preview */}
      <div style={{ display:'flex', justifyContent:'center' }}>
        <div style={{ boxShadow:'0 8px 32px rgba(0,0,0,.25)', borderRadius:12, overflow:'hidden', maxWidth:400 }}>
          <canvas ref={canvasRef} style={{ display:'block', width:'100%', height:'auto' }} />
        </div>
      </div>
      <div style={{ textAlign:'center', marginTop:8, fontSize:11, color:'var(--muted)' }}>
        👆 Live preview · updates as you type · perfect for WhatsApp status (1080×1080)
      </div>
    </div>
    </>
  )
}

// ── CLOSING COSTS ─────────────────────────────────────────────────
function ClosingCosts() {
  const [price,    setPrice]    = useState('750000')
  const [side,     setSide]     = useState('buyer') // buyer | seller
  const [county,   setCounty]   = useState('rockland')
  const [firstTime,setFirstTime]= useState(false)
  const [commPct,  setCommPct]  = useState('2.5')
  const [loanAmt,  setLoanAmt]  = useState('')

  const p = num(price)
  const loan = loanAmt ? num(loanAmt) : p * 0.8

  // NY transfer tax rates
  const transferTaxRate = county === 'nyc' ? 0.01425 : 0.004
  const mansionTax      = p >= 1000000 ? p * 0.01 : 0

  const seller = {
    commission:   p * (num(commPct)/100),
    transferTax:  p * transferTaxRate,
    titleInsurance: p * 0.004,
    attorneyFee:  1500,
    mortgageSatisfaction: 500,
    miscFees:     750,
  }
  const sellerNet = p - Object.values(seller).reduce((a,b)=>a+b,0)

  const buyer = {
    bankFees:       loan * 0.01,
    appraisal:      750,
    titleSearch:    600,
    titleInsurance: loan * 0.005,
    mortgageTax:    county === 'nyc' ? loan * 0.019 : loan * 0.013,
    prepaids:       p * 0.005,
    inspections:    600,
    attorneyFee:    1500,
    mansionTax,
    miscFees:       500,
  }
  const buyerTotal = Object.values(buyer).reduce((a,b)=>a+b,0)
  const downPayment = p - loan

  return (
    <div style={{ display:'grid', gridTemplateColumns:'320px 1fr', gap:20 }}>
      <div>
        <Section title="Property Details">
          <Field label="Sale Price"><NumInput prefix="$" value={price} onChange={setPrice} placeholder="750,000" /></Field>
          <Field label="County">
            <select value={county} onChange={e=>setCounty(e.target.value)} style={{ ...inp() }}>
              <option value="rockland">Rockland County</option>
              <option value="westchester">Westchester County</option>
              <option value="orange">Orange County</option>
              <option value="nyc">New York City</option>
            </select>
          </Field>
          <Field label="Show costs for">
            <div style={{ display:'flex', gap:6 }}>
              {[['buyer','🏠 Buyer'],['seller','🏦 Seller'],['both','Both']].map(([v,l]) => (
                <button key={v} onClick={() => setSide(v)}
                  style={{ flex:1, padding:'7px', borderRadius:8, border:'1px solid var(--border)', background:side===v?'#1B2B4B':'var(--dim)', color:side===v?'#fff':'var(--muted)', fontSize:12, fontWeight:side===v?700:400, cursor:'pointer', fontFamily:ff }}>
                  {l}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Commission (%)"><NumInput value={commPct} onChange={setCommPct} placeholder="2.5" /></Field>
          {(side==='buyer'||side==='both') && (
            <Field label="Loan Amount (leave blank = 80%)"><NumInput prefix="$" value={loanAmt} onChange={setLoanAmt} placeholder={fmt$(Math.round(p*0.8))} /></Field>
          )}
        </Section>
      </div>

      <div>
        {(side==='seller'||side==='both') && (
          <Section title="Seller Net Sheet" accent="#1B2B4B">
            <Row label="Sale Price" value={fmt$(p)} bold />
            <div style={{ height:4 }} />
            <Row label={"Commission (" + commPct + "%)"} value={'— ' + fmt$(Math.round(seller.commission))} color="#DC2626" />
            <Row label="Transfer Tax" value={'— ' + fmt$(Math.round(seller.transferTax))} color="#DC2626" />
            <Row label="Title Insurance" value={'— ' + fmt$(Math.round(seller.titleInsurance))} color="#DC2626" />
            <Row label="Attorney Fee" value={'— ' + fmt$(seller.attorneyFee)} color="#DC2626" />
            <Row label="Mortgage Satisfaction" value={'— ' + fmt$(seller.mortgageSatisfaction)} color="#DC2626" />
            <Row label="Misc Fees" value={'— ' + fmt$(seller.miscFees)} color="#DC2626" />
            <div style={{ marginTop:8 }} />
            <Row label="Seller Net Proceeds" value={fmt$(Math.round(sellerNet))} bold color={sellerNet>0?'#10B981':'#DC2626'} highlight />
          </Section>
        )}

        {(side==='buyer'||side==='both') && (
          <Section title="Buyer Closing Costs" accent="#CC2200">
            <Row label="Purchase Price" value={fmt$(p)} bold />
            <Row label="Down Payment" value={fmt$(Math.round(downPayment))} />
            <Row label="Loan Amount" value={fmt$(Math.round(loan))} />
            <div style={{ height:4 }} />
            <Row label="Bank/Origination Fees (1%)" value={fmt$(Math.round(buyer.bankFees))} />
            <Row label="Appraisal" value={fmt$(buyer.appraisal)} />
            <Row label="Title Search" value={fmt$(buyer.titleSearch)} />
            <Row label="Title Insurance" value={fmt$(Math.round(buyer.titleInsurance))} />
            <Row label="Mortgage Recording Tax" value={fmt$(Math.round(buyer.mortgageTax))} />
            <Row label="Pre-paids (taxes, insurance)" value={fmt$(Math.round(buyer.prepaids))} />
            <Row label="Inspections" value={fmt$(buyer.inspections)} />
            <Row label="Attorney Fee" value={fmt$(buyer.attorneyFee)} />
            {buyer.mansionTax > 0 && <Row label="Mansion Tax (1% on $1M+)" value={fmt$(Math.round(buyer.mansionTax))} color="#F5A623" />}
            <Row label="Misc Fees" value={fmt$(buyer.miscFees)} />
            <div style={{ marginTop:8 }} />
            <Row label="Total Closing Costs" value={fmt$(Math.round(buyerTotal))} bold color="#CC2200" highlight />
            <Row label="Cash Needed to Close" value={fmt$(Math.round(downPayment + buyerTotal))} bold color="#1B2B4B" highlight />
          </Section>
        )}
      </div>
    </div>
  )
}

// ── AGENT P&L ─────────────────────────────────────────────────────
function AgentPnL() {
  const [salePrice,   setSalePrice]   = useState('750000')
  const [commPct,     setCommPct]     = useState('2.5')
  const [splitPct,    setSplitPct]    = useState('70')
  const [kwCapMet,    setKwCapMet]    = useState(false)
  const [referralPct, setReferralPct] = useState('0')
  const [expenses,    setExpenses]    = useState('500')
  const [closingGift, setClosingGift] = useState('150')
  const [marketing,   setMarketing]   = useState('200')
  const [teamSplit,   setTeamSplit]    = useState('0')

  const p       = num(salePrice)
  const grossComm = p * (num(commPct)/100)
  const referral  = grossComm * (num(referralPct)/100)
  const afterRef  = grossComm - referral
  const kwSplit   = kwCapMet ? 0 : afterRef * ((100 - num(splitPct))/100)
  const agentComm = afterRef - kwSplit
  const teamFee   = agentComm * (num(teamSplit)/100)
  const agentNet  = agentComm - teamFee
  const totalExp  = num(expenses) + num(closingGift) + num(marketing)
  const netProfit = agentNet - totalExp
  const effectivePct = p > 0 ? (netProfit / p * 100) : 0

  return (
    <div style={{ display:'grid', gridTemplateColumns:'320px 1fr', gap:20 }}>
      <div>
        <Section title="Deal Details">
          <Field label="Sale Price"><NumInput prefix="$" value={salePrice} onChange={setSalePrice} placeholder="750,000" /></Field>
          <Field label="Commission Rate (%)"><NumInput value={commPct} onChange={setCommPct} placeholder="2.5" /></Field>
          <Field label="Referral Fee (%)"><NumInput value={referralPct} onChange={setReferralPct} placeholder="0" /></Field>
        </Section>
        <Section title="KW Split">
          <label style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, cursor:'pointer', fontSize:13, color:'var(--text)' }}>
            <input type="checkbox" checked={kwCapMet} onChange={e=>setKwCapMet(e.target.checked)} />
            Cap already met (100% to agent)
          </label>
          {!kwCapMet && (
            <Field label="Agent Split (%)">
              <NumInput value={splitPct} onChange={setSplitPct} placeholder="70" />
              <div style={{ display:'flex', gap:5, marginTop:6 }}>
                {[60,70,80,90,100].map(s => (
                  <button key={s} onClick={() => setSplitPct(String(s))}
                    style={{ flex:1, padding:'4px', borderRadius:7, border:'1px solid var(--border)', background:num(splitPct)===s?'#1B2B4B':'var(--dim)', color:num(splitPct)===s?'#fff':'var(--muted)', fontSize:11, cursor:'pointer', fontFamily:ff }}>
                    {s}%
                  </button>
                ))}
              </div>
            </Field>
          )}
          <Field label="Team Override (%)"><NumInput value={teamSplit} onChange={setTeamSplit} placeholder="0" /></Field>
        </Section>
        <Section title="Deal Expenses">
          <Field label="Misc Expenses"><NumInput prefix="$" value={expenses} onChange={setExpenses} placeholder="500" /></Field>
          <Field label="Closing Gift"><NumInput prefix="$" value={closingGift} onChange={setClosingGift} placeholder="150" /></Field>
          <Field label="Marketing / Staging"><NumInput prefix="$" value={marketing} onChange={setMarketing} placeholder="200" /></Field>
        </Section>
      </div>

      <div>
        <Section title="Commission Waterfall" accent="#CC2200">
          <div style={{ textAlign:'center', padding:'14px 0 18px', borderBottom:'1px solid var(--border)', marginBottom:12 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:4 }}>Net Profit</div>
            <div style={{ fontSize:44, fontWeight:900, color: netProfit >= 0 ? '#10B981' : '#DC2626', lineHeight:1 }}>{fmt$(Math.round(netProfit))}</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginTop:4 }}>{effectivePct.toFixed(2)}% of sale price</div>
          </div>
          <Row label="Sale Price"           value={fmt$(p)} />
          <Row label={'Commission (' + commPct + '%)'}  value={fmt$(Math.round(grossComm))} bold />
          {referral > 0 && <Row label={'Referral (' + referralPct + '%)'}  value={'— ' + fmt$(Math.round(referral))} color="#F5A623" />}
          {referral > 0 && <Row label="After Referral"  value={fmt$(Math.round(afterRef))} />}
          {!kwCapMet && <Row label={'KW Split (' + (100-num(splitPct)) + '%)'}  value={'— ' + fmt$(Math.round(kwSplit))} color="#DC2626" />}
          {kwCapMet && <Row label="KW Split"     value="Cap met — $0" color="#10B981" />}
          <Row label={'Agent Commission'}   value={fmt$(Math.round(agentComm))} bold color="#10B981" highlight />
          {teamFee > 0 && <Row label={'Team Override (' + teamSplit + '%)'}  value={'— ' + fmt$(Math.round(teamFee))} color="#F5A623" />}
          <Row label="Net Before Expenses" value={fmt$(Math.round(agentNet))} bold />
          <div style={{ height:8 }} />
          <Row label="Misc Expenses"        value={'— ' + fmt$(num(expenses))} color="#DC2626" muted />
          <Row label="Closing Gift"         value={'— ' + fmt$(num(closingGift))} color="#DC2626" muted />
          <Row label="Marketing"            value={'— ' + fmt$(num(marketing))} color="#DC2626" muted />
          <Row label="Total Expenses"       value={'— ' + fmt$(Math.round(totalExp))} color="#DC2626" />
          <div style={{ height:4 }} />
          <Row label="Net Profit"           value={fmt$(Math.round(netProfit))} bold color={netProfit>=0?'#10B981':'#DC2626'} highlight />
        </Section>

        <Section title="Quick GCI Scenarios">
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:0 }}>
            <div style={{ padding:'6px 10px', background:'var(--dim)', fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase' }}>Price</div>
            <div style={{ padding:'6px 10px', background:'var(--dim)', fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase' }}>Gross Comm</div>
            <div style={{ padding:'6px 10px', background:'var(--dim)', fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase' }}>Agent ({splitPct}%)</div>
            <div style={{ padding:'6px 10px', background:'var(--dim)', fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase' }}>Net Est.</div>
            {[400000,500000,600000,750000,900000,1200000,1500000,2000000].map(sp => {
              const gc  = sp * (num(commPct)/100)
              const ac  = kwCapMet ? gc : gc * (num(splitPct)/100)
              const net = ac - totalExp
              const isMe = Math.abs(sp - p) < 1
              return [
                <div key={sp+'p'} style={{ padding:'7px 10px', borderTop:'1px solid var(--border)', fontSize:12, fontWeight:isMe?800:400, background:isMe?'rgba(204,34,0,.05)':'' }}>{fmt$(sp)}</div>,
                <div key={sp+'g'} style={{ padding:'7px 10px', borderTop:'1px solid var(--border)', fontSize:12, background:isMe?'rgba(204,34,0,.05)':'' }}>{fmt$(Math.round(gc))}</div>,
                <div key={sp+'a'} style={{ padding:'7px 10px', borderTop:'1px solid var(--border)', fontSize:12, color:'#10B981', background:isMe?'rgba(204,34,0,.05)':'' }}>{fmt$(Math.round(ac))}</div>,
                <div key={sp+'n'} style={{ padding:'7px 10px', borderTop:'1px solid var(--border)', fontSize:12, fontWeight:700, color:net>0?'#10B981':'#DC2626', background:isMe?'rgba(204,34,0,.05)':'' }}>{fmt$(Math.round(net))}</div>,
              ]
            })}
          </div>
        </Section>
      </div>
    </div>
  )
}

// ── DEAL ANALYZER ─────────────────────────────────────────────────
function DealAnalyzer() {
  const [price,    setPrice]    = useState('750000')
  const [down,     setDown]     = useState('20')
  const [rate,     setRate]     = useState('7.25')
  const [commPct,  setCommPct]  = useState('2.5')
  const [splitPct, setSplitPct] = useState('70')
  const [county,   setCounty]   = useState('rockland')

  const p    = num(price)
  const loan = p * (1 - num(down)/100)
  const r    = num(rate)/100/12
  const n    = 30*12
  const pi   = r > 0 ? loan*(r*Math.pow(1+r,n))/(Math.pow(1+r,n)-1) : loan/n

  const buyerClosing = loan*0.025 + 750 + 600 + loan*0.013 + 750 + 600 + 1500 + 500
  const cashToClose  = (p * num(down)/100) + buyerClosing

  const grossComm = p * (num(commPct)/100)
  const agentComm = grossComm * (num(splitPct)/100)
  const sellerNet = p - grossComm - p*0.004 - p*(county==='nyc'?0.01425:0.004) - 2500

  return (
    <div>
      <Section title="Deal Inputs" accent="#1B2B4B">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:12 }}>
          <Field label="Sale Price"><NumInput prefix="$" value={price} onChange={setPrice} /></Field>
          <Field label="Down Payment %"><NumInput value={down} onChange={setDown} /></Field>
          <Field label="Interest Rate %"><NumInput value={rate} onChange={setRate} /></Field>
          <Field label="Commission %"><NumInput value={commPct} onChange={setCommPct} /></Field>
          <Field label="Agent Split %"><NumInput value={splitPct} onChange={setSplitPct} /></Field>
          <Field label="County">
            <select value={county} onChange={e=>setCounty(e.target.value)} style={{ ...inp() }}>
              <option value="rockland">Rockland</option>
              <option value="westchester">Westchester</option>
              <option value="orange">Orange</option>
              <option value="nyc">NYC</option>
            </select>
          </Field>
        </div>
      </Section>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
        <Section title="🏠 Buyer Summary" accent="#3B82F6">
          <Row label="Purchase Price"   value={fmt$(p)} bold />
          <Row label="Down Payment"     value={fmt$(Math.round(p*num(down)/100))} />
          <Row label="Loan Amount"      value={fmt$(Math.round(loan))} />
          <Row label="Monthly P&I"      value={fmt$(Math.round(pi))} bold />
          <Row label="Est. Total/mo"    value={fmt$(Math.round(pi+1000+150))} bold color="#3B82F6" />
          <Row label="Closing Costs"    value={fmt$(Math.round(buyerClosing))} color="#DC2626" />
          <Row label="Cash to Close"    value={fmt$(Math.round(cashToClose))} bold color="#3B82F6" highlight />
        </Section>

        <Section title="🏦 Seller Summary" accent="#1B2B4B">
          <Row label="Sale Price"       value={fmt$(p)} bold />
          <Row label="Commission"       value={'— ' + fmt$(Math.round(grossComm))} color="#DC2626" />
          <Row label="Transfer Tax"     value={'— ' + fmt$(Math.round(p*(county==='nyc'?0.01425:0.004)))} color="#DC2626" />
          <Row label="Title + Fees"     value={'— ' + fmt$(Math.round(p*0.004 + 2500))} color="#DC2626" />
          <Row label="Seller Net"       value={fmt$(Math.round(sellerNet))} bold color="#10B981" highlight />
        </Section>

        <Section title="💰 Agent Earnings" accent="#CC2200">
          <Row label="Gross Commission" value={fmt$(Math.round(grossComm))} bold />
          <Row label={'KW Split (' + (100-num(splitPct)) + '%)'}  value={'— ' + fmt$(Math.round(grossComm*(100-num(splitPct))/100))} color="#DC2626" />
          <Row label={'Agent Commission'} value={fmt$(Math.round(agentComm))} bold color="#10B981" />
          <Row label="Est. Expenses"    value={'— $850'} color="#DC2626" muted />
          <Row label="Est. Net Profit"  value={fmt$(Math.round(agentComm - 850))} bold color="#CC2200" highlight />
          <div style={{ marginTop:10, padding:'8px 10px', background:'var(--dim)', borderRadius:8, fontSize:11, color:'var(--muted)', lineHeight:1.6 }}>
            {num(commPct)}% of {fmt$(p)} = {fmt$(Math.round(grossComm))} gross<br/>
            {splitPct}/{100-num(splitPct)} split → {fmt$(Math.round(agentComm))} to agent
          </div>
        </Section>
      </div>
    </div>
  )
}


// ── INVESTMENT P&L CALCULATOR ─────────────────────────────────────
function InvestmentCalc() {
  const printRef = React.useRef(null)

  // Purchase
  const [price,       setPrice]       = useState('450000')
  const [down,        setDown]        = useState('25')
  const [rate,        setRate]        = useState('7.25')
  const [term,        setTerm]        = useState('30')
  const [closingPct,  setClosingPct]  = useState('3')

  // Income
  const [units,         setUnits]         = useState('2')
  const [rents,         setRents]         = useState(['3000','2800'])  // potential rents
  const [currentRents,  setCurrentRents]  = useState(['2500','2300'])  // current/actual rents
  const [showPotential, setShowPotential] = useState(false)

  // Operating expenses
  const [propTax,     setPropTax]     = useState('1200')
  const [insurance,   setInsurance]   = useState('250')
  const [waterSewer,  setWaterSewer]  = useState('150')
  const [electric,    setElectric]    = useState('0')
  const [gas,         setGas]         = useState('0')
  const [hoa,         setHoa]         = useState('0')
  const [mgmtPct,     setMgmtPct]     = useState('8')
  const [maintenance, setMaintenance] = useState('300')
  const [vacancy,     setVacancy]     = useState('5')
  const [capex,       setCapex]       = useState('150')
  const [trash,       setTrash]       = useState('75')
  const [other,       setOther]       = useState('0')
  const [propName,    setPropName]    = useState('')

  // Share modal
  const [showShare,   setShowShare]   = useState(false)

  function setRent(i, v) { setRents(prev => { const n=[...prev]; n[i]=v; return n }) }
  function setCurrentRent(i, v) { setCurrentRents(prev => { const n=[...prev]; n[i]=v; return n }) }
  function syncUnits(v) {
    const n = Math.max(1, parseInt(v)||1)
    setUnits(String(n))
    setRents(prev => { const next=[...prev]; while(next.length<n) next.push('0'); return next.slice(0,n) })
    setCurrentRents(prev => { const next=[...prev]; while(next.length<n) next.push('0'); return next.slice(0,n) })
  }

  const calc = React.useMemo(() => {
    const p    = num(price)
    const dpPct = num(down)/100
    const dp   = p * dpPct
    const loan = p - dp
    const closing = p * (num(closingPct)/100)
    const totalInvested = dp + closing

    // Mortgage
    const r = num(rate)/100/12
    const n = num(term)*12
    const mortgage = r > 0 ? loan*(r*Math.pow(1+r,n))/(Math.pow(1+r,n)-1) : loan/n

    // Gross income — potential vs current
    const nUnits = parseInt(units)||1
    const grossMonthly = rents.slice(0, nUnits).reduce((s,v)=>s+num(v),0)
    const grossAnnual  = grossMonthly * 12
    const vacancyLoss  = grossAnnual * (num(vacancy)/100)
    const effectiveIncome = grossAnnual - vacancyLoss

    // Current (as-is) income
    const currentMonthly = currentRents.slice(0, nUnits).reduce((s,v)=>s+num(v),0)
    const currentAnnual  = currentMonthly * 12
    const currentVacancy = currentAnnual * (num(vacancy)/100)
    const currentEffective = currentAnnual - currentVacancy
    const rentUpsideMonthly = grossMonthly - currentMonthly
    const rentUpsideAnnual  = rentUpsideMonthly * 12

    // Operating expenses (monthly → annual)
    const mgmtFee  = effectiveIncome * (num(mgmtPct)/100)
    const opExpenses = {
      propTax:     num(propTax)*12,
      insurance:   num(insurance)*12,
      waterSewer:  num(waterSewer)*12,
      electric:    num(electric)*12,
      gas:         num(gas)*12,
      hoa:         num(hoa)*12,
      management:  mgmtFee,
      maintenance: num(maintenance)*12,
      capex:       num(capex)*12,
      trash:       num(trash)*12,
      other:       num(other)*12,
    }
    const totalOpEx = Object.values(opExpenses).reduce((a,b)=>a+b,0)
    const noi       = effectiveIncome - totalOpEx
    const annualDebt = mortgage * 12
    const cashFlow  = noi - annualDebt
    const monthlyCF = cashFlow / 12

    // Metrics
    const capRate    = p > 0 ? (noi / p * 100) : 0
    const cocReturn  = totalInvested > 0 ? (cashFlow / totalInvested * 100) : 0
    const grm        = grossAnnual > 0 ? (p / grossAnnual) : 0
    const dscr       = annualDebt > 0 ? (noi / annualDebt) : 0
    const breakEven  = grossAnnual > 0 ? ((totalOpEx + annualDebt) / grossAnnual * 100) : 0
    const pricePerUnit = parseInt(units) > 0 ? p / parseInt(units) : p

    // 5-year projection (2% annual rent growth, 3% appreciation)
    const projections = []
    let bal = loan
    for (let yr = 1; yr <= 5; yr++) {
      const rentGrowth = grossAnnual * Math.pow(1.02, yr)
      const appreciation = p * Math.pow(1.03, yr)
      const expGrowth = totalOpEx * Math.pow(1.025, yr)
      // Pay down principal over year
      let interest = 0
      const startBal = bal
      for (let m = 0; m < 12; m++) {
        const mo_int = bal * r
        const mo_prin = mortgage - mo_int
        interest += mo_int
        bal -= mo_prin
      }
      const equity = appreciation - bal
      const cf = rentGrowth * (1-num(vacancy)/100) - expGrowth - annualDebt
      projections.push({ yr, rent: rentGrowth, value: appreciation, equity, cashFlow: cf, equity_built: startBal - bal })
    }

    // Current NOI (as-is)
    const currentMgmt = currentEffective * (num(mgmtPct)/100)
    const currentOpEx = totalOpEx - mgmtFee + currentMgmt
    const currentNOI  = currentEffective - currentOpEx
    const currentCF   = currentNOI - annualDebt
    const currentCocReturn = totalInvested > 0 ? (currentCF / totalInvested * 100) : 0
    const currentCapRate   = p > 0 ? (currentNOI / p * 100) : 0

    return {
      p, dp, loan, closing, totalInvested, mortgage,
      grossMonthly, grossAnnual, vacancyLoss, effectiveIncome,
      opExpenses, totalOpEx, noi, annualDebt, cashFlow, monthlyCF,
      capRate, cocReturn, grm, dscr, breakEven, pricePerUnit, projections,
      currentMonthly, currentAnnual, currentEffective,
      rentUpsideMonthly, rentUpsideAnnual,
      currentNOI, currentCF, currentCocReturn, currentCapRate,
    }
  }, [price, down, rate, term, closingPct, rents, currentRents, units, propTax, insurance, waterSewer, electric, gas, hoa, mgmtPct, maintenance, vacancy, capex, trash, other])

  const c = calc

  // Color helpers
  function metricColor(v, good, ok) { return v >= good ? '#10B981' : v >= ok ? '#F5A623' : '#DC2626' }

  function buildReport() {
    const rows = [
      ['INCOME',                    ''],
      ['Gross Rent (monthly)',       fmt$(Math.round(c.grossMonthly))],
      ['Gross Rent (annual)',        fmt$(Math.round(c.grossAnnual))],
      ['Vacancy Loss (' + vacancy + '%)',  '- ' + fmt$(Math.round(c.vacancyLoss))],
      ['Effective Gross Income',     fmt$(Math.round(c.effectiveIncome))],
      ['',                          ''],
      ['OPERATING EXPENSES',        ''],
      ['Property Tax',               fmt$(Math.round(c.opExpenses.propTax))],
      ['Insurance',                  fmt$(Math.round(c.opExpenses.insurance))],
      ['Water/Sewer',                fmt$(Math.round(c.opExpenses.waterSewer))],
      ['Property Management',        fmt$(Math.round(c.opExpenses.management))],
      ['Maintenance',                fmt$(Math.round(c.opExpenses.maintenance))],
      ['CapEx Reserve',              fmt$(Math.round(c.opExpenses.capex))],
      ['Total Operating Expenses',   fmt$(Math.round(c.totalOpEx))],
      ['',                          ''],
      ['NET OPERATING INCOME (NOI)', fmt$(Math.round(c.noi))],
      ['Annual Debt Service',        '- ' + fmt$(Math.round(c.annualDebt))],
      ['Annual Cash Flow',           fmt$(Math.round(c.cashFlow))],
      ['Monthly Cash Flow',          fmt$(Math.round(c.monthlyCF))],
      ['',                          ''],
      ['KEY METRICS',               ''],
      ['Cap Rate',                   c.capRate.toFixed(2) + '%'],
      ['Cash on Cash Return',        c.cocReturn.toFixed(2) + '%'],
      ['DSCR',                       c.dscr.toFixed(2) + 'x'],
      ['GRM',                        c.grm.toFixed(1) + 'x'],
      ['Break-Even Occupancy',       c.breakEven.toFixed(1) + '%'],
      ['',                          ''],
      ['PURCHASE',                  ''],
      ['Purchase Price',             fmt$(c.p)],
      ['Down Payment (' + down + '%)','+ ' + fmt$(Math.round(c.dp))],
      ['Closing Costs (' + closingPct + '%)','+ ' + fmt$(Math.round(c.closing))],
      ['Total Cash Invested',        fmt$(Math.round(c.totalInvested))],
    ]

    const tableRows = rows.map(([l,v]) => {
      const isSec = l === l.toUpperCase() && l !== ''
      const isBlank = l === ''
      if (isBlank) return '<tr><td colspan="2" style="height:10px"></td></tr>'
      if (isSec) return '<tr><td colspan="2" style="padding:10px 10px 4px;font-size:11px;font-weight:800;color:#1B2B4B;text-transform:uppercase;letter-spacing:.08em;border-top:2px solid #1B2B4B;background:#F8FAFC">' + l + '</td></tr>'
      const hl = l.includes('Cash Flow') || l.includes('NOI') || l.includes('Cap Rate') || l.includes('Cash on Cash') || l.includes('Total Cash')
      return '<tr style="background:' + (hl?'#F0FDF4':'transparent') + '"><td style="padding:7px 10px;border-bottom:1px solid #E8EDF2;font-size:13px;color:#374151">' + l + '</td><td style="padding:7px 10px;border-bottom:1px solid #E8EDF2;font-size:13px;font-weight:' + (hl?'800':'600') + ';color:' + (hl?'#059669':'#1F2937') + ';text-align:right">' + v + '</td></tr>'
    }).join('')

    const projRows = c.projections.map(p2 => {
      const cfColor = p2.cashFlow >= 0 ? '#059669' : '#DC2626'
      return '<tr><td style="padding:7px 10px;border-bottom:1px solid #E8EDF2;font-size:12px">Year ' + p2.yr + '</td>' +
        '<td style="padding:7px 10px;border-bottom:1px solid #E8EDF2;font-size:12px;text-align:right">' + fmt$(Math.round(p2.rent/12)) + '/mo</td>' +
        '<td style="padding:7px 10px;border-bottom:1px solid #E8EDF2;font-size:12px;text-align:right">' + fmt$(Math.round(p2.value)) + '</td>' +
        '<td style="padding:7px 10px;border-bottom:1px solid #E8EDF2;font-size:12px;font-weight:700;color:' + cfColor + ';text-align:right">' + fmt$(Math.round(p2.cashFlow/12)) + '/mo</td>' +
        '<td style="padding:7px 10px;border-bottom:1px solid #E8EDF2;font-size:12px;font-weight:700;color:#059669;text-align:right">' + fmt$(Math.round(p2.equity)) + '</td></tr>'
    }).join('')

    const upsideRow = (showPotential && c.rentUpsideMonthly > 0) ? (
      '<tr style="background:#FFF5F5"><td colspan="2" style="padding:6px 10px;font-size:11px;font-weight:800;color:#CC2200;text-transform:uppercase;letter-spacing:.06em;border-top:2px solid #CC2200">Rent Upside</td></tr>' +
      '<tr><td style="padding:7px 10px;border-bottom:1px solid #E8EDF2;font-size:13px;color:#374151">Current Monthly Rent</td><td style="padding:7px 10px;border-bottom:1px solid #E8EDF2;font-size:13px;font-weight:600;color:#F59E0B;text-align:right">' + fmt$(c.currentMonthly) + '/mo</td></tr>' +
      '<tr><td style="padding:7px 10px;border-bottom:1px solid #E8EDF2;font-size:13px;color:#374151">Potential Monthly Rent</td><td style="padding:7px 10px;border-bottom:1px solid #E8EDF2;font-size:13px;font-weight:600;color:#059669;text-align:right">' + fmt$(c.grossMonthly) + '/mo</td></tr>' +
      '<tr style="background:#FFF5F5"><td style="padding:7px 10px;border-bottom:1px solid #E8EDF2;font-size:13px;font-weight:800;color:#CC2200">Monthly Upside</td><td style="padding:7px 10px;border-bottom:1px solid #E8EDF2;font-size:14px;font-weight:900;color:#CC2200;text-align:right">+' + fmt$(c.rentUpsideMonthly) + '/mo</td></tr>' +
      '<tr style="background:#FFF5F5"><td style="padding:7px 10px;border-bottom:2px solid #CC2200;font-size:13px;font-weight:800;color:#CC2200">Annual Upside</td><td style="padding:7px 10px;border-bottom:2px solid #CC2200;font-size:14px;font-weight:900;color:#CC2200;text-align:right">+' + fmt$(c.rentUpsideAnnual) + '/yr</td></tr>'
    ) : ''

    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Investment Analysis — ' + (propName || fmt$(num(price))) + '</title>' +
      '<style>' +
        '*{margin:0;padding:0;box-sizing:border-box}' +
        'body{font-family:Arial,Helvetica,sans-serif;background:#F1F5F9;color:#1F2937}' +
        '@page{size:A4;margin:15mm}' +
        '@media print{body{background:#fff}button{display:none}.no-print{display:none}}' +
      '</style>' +
    '</head><body>' +

    /* ── BRANDED HEADER ── */
    '<div style="background:#1B2B4B;position:relative;overflow:hidden">' +
      /* Red diagonal banner — Target Team signature */
      '<div style="position:absolute;top:0;left:0;width:220px;height:100px;background:#CC2200;clip-path:polygon(0 0,180px 0,220px 100%,0 100%);display:flex;flex-direction:column;justify-content:center;padding:16px 20px">' +
        '<div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">Investment</div>' +
        '<div style="font-size:15px;font-weight:900;color:#fff;line-height:1.2">PROPERTY<br/>ANALYSIS</div>' +
      '</div>' +
      /* Logo area */
      '<div style="display:flex;justify-content:flex-end;align-items:flex-start;padding:18px 28px 0">' +
        '<div style="text-align:right">' +
          '<div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:-.5px;line-height:1">T<span style="color:#CC2200">A</span>RG<span style="color:#CC2200">E</span>T</div>' +
          '<div style="font-size:14px;font-weight:700;letter-spacing:.3em;color:rgba(255,255,255,.7);margin-top:-2px">TEAM</div>' +
          '<div style="font-size:10px;color:rgba(255,255,255,.45);margin-top:3px">Of Keller Williams Valley Realty</div>' +
        '</div>' +
      '</div>' +
      /* Property + date */
      '<div style="padding:12px 28px 22px 200px">' +
        '<div style="font-size:20px;font-weight:900;color:#fff;margin-bottom:3px">' + (propName || fmt$(num(price))) + '</div>' +
        '<div style="font-size:12px;color:rgba(255,255,255,.45)">' + new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}) + '</div>' +
      '</div>' +
      /* Metrics strip */
      '<div style="background:rgba(0,0,0,.25);padding:14px 28px;display:flex;gap:36px">' +
        '<div><div style="font-size:22px;font-weight:900;color:' + metricColor(c.cocReturn,8,5) + '">' + c.cocReturn.toFixed(2) + '%</div><div style="font-size:10px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.06em">Cash on Cash</div></div>' +
        '<div><div style="font-size:22px;font-weight:900;color:' + metricColor(c.capRate,6,4) + '">' + c.capRate.toFixed(2) + '%</div><div style="font-size:10px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.06em">Cap Rate</div></div>' +
        '<div><div style="font-size:22px;font-weight:900;color:' + (c.monthlyCF>=0?'#4ADE80':'#F87171') + '">' + fmt$(Math.round(c.monthlyCF)) + '</div><div style="font-size:10px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.06em">Monthly CF</div></div>' +
        '<div><div style="font-size:22px;font-weight:900;color:' + metricColor(c.dscr,1.25,1.0) + '">' + c.dscr.toFixed(2) + 'x</div><div style="font-size:10px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.06em">DSCR</div></div>' +
        (c.rentUpsideMonthly>0 ? '<div><div style="font-size:22px;font-weight:900;color:#F87171">+' + fmt$(c.rentUpsideMonthly) + '</div><div style="font-size:10px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.06em">Rent Upside/mo</div></div>' : '') +
      '</div>' +
    '</div>' +
      '<div style="background:#fff;border-radius:0 0 10px 10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0">' +
          '<table style="width:100%;border-collapse:collapse">' + tableRows + upsideRow + '</table>' +
          '<div style="padding:20px;background:#F8FAFC;border-left:1px solid #E2E8F0">' +
            '<div style="font-size:11px;font-weight:800;color:#1B2B4B;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;border-bottom:2px solid #1B2B4B;padding-bottom:5px">5-Year Projection</div>' +
            '<table style="width:100%;border-collapse:collapse">' +
              '<tr style="background:#F0F4F8"><th style="padding:6px 8px;font-size:10px;text-align:left;color:#6B7280">Yr</th><th style="padding:6px 8px;font-size:10px;text-align:right;color:#6B7280">Rent</th><th style="padding:6px 8px;font-size:10px;text-align:right;color:#6B7280">Value</th><th style="padding:6px 8px;font-size:10px;text-align:right;color:#6B7280">CF/mo</th><th style="padding:6px 8px;font-size:10px;text-align:right;color:#6B7280">Equity</th></tr>' +
              projRows +
            '</table>' +
            '<div style="margin-top:16px;font-size:10px;color:#9CA3AF;line-height:1.6">Assumptions: 2% annual rent growth, 3% appreciation, 2.5% expense growth</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="background:#1B2B4B;padding:16px 28px;margin-top:20px;display:flex;justify-content:space-between;align-items:center">' +
        '<div>' +
          '<div style="font-size:14px;font-weight:900;color:#fff">T<span style="color:#CC2200">A</span>RG<span style="color:#CC2200">E</span>T TEAM</div>' +
          '<div style="font-size:10px;color:rgba(255,255,255,.45);margin-top:2px">Of Keller Williams Valley Realty</div>' +
        '</div>' +
        '<div style="text-align:center;font-size:11px;color:rgba(255,255,255,.5)">' +
          '845.424.1014 · @thetargetteam · targetreteam.com' +
        '</div>' +
        '<button onclick="window.print()" class="no-print" style="padding:9px 20px;background:#CC2200;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">🖨 Print / PDF</button>' +
      '</div>' +
      '<script>setTimeout(function(){window.print()},600)</script>' +
    '</body></html>'
  }

  function printReport() {
    const win = window.open('', '_blank')
    win.document.write(buildReport())
    win.document.close()
  }

  function shareReport() {
    const data = {
      address: propName || fmt$(num(price)),
      price: num(price), down: num(down), rate: num(rate),
      units: units, rents, capRate: c.capRate.toFixed(2),
      coc: c.cocReturn.toFixed(2), noi: Math.round(c.noi),
      cashFlow: Math.round(c.monthlyCF),
    }
    const encoded = btoa(JSON.stringify(data))
    const url = window.location.origin + '/mortgage?inv=' + encoded
    navigator.clipboard.writeText(url).then(() => {
      // toast handled below
    }).catch(() => {})
    setShowShare(url)
  }

  const inp2 = { ...inp(), marginBottom:0 }
  const metBg = (v, g, o) => ({ background: v>=g ? '#F0FDF4' : v>=o ? '#FFFBEB' : '#FEF2F2', borderRadius:10, padding:'12px 14px', textAlign:'center' })

  return (
    <div style={{ fontFamily:ff }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontSize:17, fontWeight:900, color:'var(--text)', marginBottom:2 }}>🏘 Investment Property Analyzer</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>NOI · Cap Rate · Cash on Cash Return · DSCR · 5-Year Projection</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={shareReport}
            style={{ padding:'8px 16px', borderRadius:9, border:'1px solid var(--border)', background:'var(--panel)', color:'var(--text)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff, display:'flex', alignItems:'center', gap:6 }}>
            🔗 Share Link
          </button>
          <button onClick={printReport}
            style={{ padding:'8px 16px', borderRadius:9, border:'none', background:'#CC2200', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff, display:'flex', alignItems:'center', gap:6 }}>
            🖨 Download PDF
          </button>
        </div>
      </div>

      {/* Share toast */}
      {showShare && (
        <div style={{ padding:'10px 16px', background:'#EFF6FF', borderRadius:10, border:'1px solid #BFDBFE', marginBottom:14, display:'flex', alignItems:'center', gap:10, justifyContent:'space-between' }}>
          <span style={{ fontSize:12, color:'#1E40AF', fontWeight:700 }}>✅ Link copied to clipboard — share with your client or investor</span>
          <button onClick={() => setShowShare(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#94A3B8', fontSize:16 }}>×</button>
        </div>
      )}

      {/* KEY METRICS — top row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
        {[
          { label:'Cash on Cash', value: c.cocReturn.toFixed(2)+'%', good:8, ok:5, v:c.cocReturn, tip:'Goal: 8%+' },
          { label:'Cap Rate',     value: c.capRate.toFixed(2)+'%',   good:6, ok:4, v:c.capRate,   tip:'Goal: 6%+' },
          { label:'Monthly CF',   value: fmt$(Math.round(c.monthlyCF)), good:0, ok:-200, v:c.monthlyCF, tip:c.monthlyCF>=0?'Positive':'Negative' },
          { label:'DSCR',         value: c.dscr.toFixed(2)+'x',      good:1.25, ok:1.0, v:c.dscr,    tip:'Banks want 1.25x+' },
        ].map(m => (
          <div key={m.label} style={{ ...metBg(m.v, m.good, m.ok) }}>
            <div style={{ fontSize:22, fontWeight:900, color: metricColor(m.v,m.good,m.ok), lineHeight:1 }}>{m.value}</div>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--text)', marginTop:4 }}>{m.label}</div>
            <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>{m.tip}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'340px 1fr', gap:20 }}>

        {/* LEFT: Inputs */}
        <div>
          <Section title="Property">
            <Field label="Property Name / Address">
              <input value={propName} onChange={e=>setPropName(e.target.value)} placeholder="e.g. 15 Oak Lane, Monsey NY" style={inp2} />
            </Field>
            <Field label="Purchase Price"><NumInput prefix="$" value={price} onChange={setPrice} placeholder="450,000" /></Field>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <Field label="Down Payment %"><NumInput value={down} onChange={setDown} placeholder="25" /></Field>
              <Field label="Interest Rate %"><NumInput value={rate} onChange={setRate} placeholder="7.25" /></Field>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <Field label="Loan Term">
                <select value={term} onChange={e=>setTerm(e.target.value)} style={inp2}>
                  {[10,15,20,25,30].map(t=><option key={t} value={t}>{t} years</option>)}
                </select>
              </Field>
              <Field label="Closing Costs %"><NumInput value={closingPct} onChange={setClosingPct} placeholder="3" /></Field>
            </div>
          </Section>

          <Section title="Rental Income">
            <Field label="Number of Units">
              <div style={{ display:'flex', gap:6, marginBottom:8 }}>
                {[1,2,3,4,5,6].map(n=>(
                  <button key={n} onClick={()=>syncUnits(n)}
                    style={{ flex:1, padding:'6px', borderRadius:7, border:'1px solid var(--border)', background:parseInt(units)===n?'#1B2B4B':'var(--dim)', color:parseInt(units)===n?'#fff':'var(--muted)', fontSize:12, fontWeight:parseInt(units)===n?700:400, cursor:'pointer', fontFamily:ff }}>
                    {n}
                  </button>
                ))}
              </div>
            </Field>

            {/* Toggle current vs potential */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em' }}>Track current vs potential</span>
              <div onClick={()=>setShowPotential(p=>!p)}
                style={{ width:40, height:22, borderRadius:11, background:showPotential?'#CC2200':'var(--dim)', border:'1px solid '+(showPotential?'#CC2200':'var(--border)'), position:'relative', cursor:'pointer', transition:'all .2s', flexShrink:0 }}>
                <div style={{ position:'absolute', top:2, left:showPotential?20:2, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,.2)' }} />
              </div>
            </div>

            {!showPotential && Array.from({length:Math.min(parseInt(units)||1,6)},(_,i)=>(
              <Field key={i} label={'Unit ' + (i+1) + ' Monthly Rent'}>
                <NumInput prefix="$" value={rents[i]||''} onChange={v=>setRent(i,v)} placeholder="2,500" />
              </Field>
            ))}

            {showPotential && (
              <div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:6 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', textAlign:'center' }}>Unit</div>
                  <div style={{ fontSize:10, fontWeight:700, color:'#F5A623', textTransform:'uppercase', letterSpacing:'.05em', textAlign:'center' }}>Current</div>
                  <div style={{ fontSize:10, fontWeight:700, color:'#10B981', textTransform:'uppercase', letterSpacing:'.05em', textAlign:'center' }}>Potential</div>
                </div>
                {Array.from({length:Math.min(parseInt(units)||1,6)},(_,i)=>(
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'36px 1fr 1fr', gap:6, alignItems:'center', marginBottom:6 }}>
                    <div style={{ width:32, height:32, borderRadius:8, background:'#1B2B4B', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800 }}>{i+1}</div>
                    <NumInput prefix="$" value={currentRents[i]||''} onChange={v=>setCurrentRent(i,v)} placeholder="current" />
                    <NumInput prefix="$" value={rents[i]||''} onChange={v=>setRent(i,v)} placeholder="potential" />
                  </div>
                ))}
                {/* Upside summary */}
                <div style={{ marginTop:8, padding:'10px 12px', borderRadius:10, background:'rgba(204,34,0,.06)', border:'2px solid rgba(204,34,0,.2)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontSize:12, color:'var(--muted)' }}>Current total</span>
                    <span style={{ fontSize:12, fontWeight:700, color:'#F5A623' }}>{fmt$(c.currentMonthly)}/mo</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontSize:12, color:'var(--muted)' }}>Potential total</span>
                    <span style={{ fontSize:12, fontWeight:700, color:'#10B981' }}>{fmt$(c.grossMonthly)}/mo</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', paddingTop:6, borderTop:'1px solid rgba(204,34,0,.15)' }}>
                    <span style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>Rent upside</span>
                    <span style={{ fontSize:13, fontWeight:900, color:'#CC2200' }}>+{fmt$(c.rentUpsideMonthly)}/mo · +{fmt$(c.rentUpsideAnnual)}/yr</span>
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginTop:8, padding:'8px 10px', background:'var(--dim)', borderRadius:8, fontSize:12, fontWeight:700, color:'var(--text)', display:'flex', justifyContent:'space-between' }}>
              <span>{showPotential?'Potential':'Gross'} Monthly</span>
              <span style={{ color:'#10B981' }}>{fmt$(c.grossMonthly)}</span>
            </div>
          </Section>
        </div>

        {/* RIGHT: Expenses + Results */}
        <div>
          <Section title="Operating Expenses (monthly)">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 16px' }}>
              <Field label="Property Tax"><NumInput prefix="$" value={propTax} onChange={setPropTax} placeholder="1,200" /></Field>
              <Field label="Insurance"><NumInput prefix="$" value={insurance} onChange={setInsurance} placeholder="250" /></Field>
              <Field label="Water / Sewer"><NumInput prefix="$" value={waterSewer} onChange={setWaterSewer} placeholder="150" /></Field>
              <Field label="Electric (if owner pays)"><NumInput prefix="$" value={electric} onChange={setElectric} placeholder="0" /></Field>
              <Field label="Gas (if owner pays)"><NumInput prefix="$" value={gas} onChange={setGas} placeholder="0" /></Field>
              <Field label="HOA"><NumInput prefix="$" value={hoa} onChange={setHoa} placeholder="0" /></Field>
              <Field label={'Property Mgmt (' + mgmtPct + '% of rent)'}>
                <NumInput value={mgmtPct} onChange={setMgmtPct} placeholder="8" />
              </Field>
              <Field label="Maintenance / Repairs"><NumInput prefix="$" value={maintenance} onChange={setMaintenance} placeholder="300" /></Field>
              <Field label="CapEx Reserve"><NumInput prefix="$" value={capex} onChange={setCapex} placeholder="150" /></Field>
              <Field label="Trash / Landscaping"><NumInput prefix="$" value={trash} onChange={setTrash} placeholder="75" /></Field>
              <Field label={'Vacancy Rate (' + vacancy + '%)'}>
                <NumInput value={vacancy} onChange={setVacancy} placeholder="5" />
              </Field>
              <Field label="Other"><NumInput prefix="$" value={other} onChange={setOther} placeholder="0" /></Field>
            </div>
          </Section>

          {/* Current vs Potential comparison — only show when toggle is on */}
          {showPotential && c.rentUpsideMonthly > 0 && (
            <Section title="Current vs Potential Comparison" accent="#CC2200">
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:0 }}>
                {/* Header */}
                <div style={{ padding:'7px 10px', background:'var(--dim)', fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase' }}></div>
                <div style={{ padding:'7px 10px', background:'rgba(245,166,35,.1)', fontSize:10, fontWeight:700, color:'#F5A623', textTransform:'uppercase', textAlign:'center' }}>Current (As-Is)</div>
                <div style={{ padding:'7px 10px', background:'rgba(16,185,129,.1)', fontSize:10, fontWeight:700, color:'#10B981', textTransform:'uppercase', textAlign:'center' }}>Potential</div>
                {/* Rows */}
                {[
                  ['Monthly Rent',    fmt$(c.currentMonthly),              fmt$(c.grossMonthly)],
                  ['Annual Income',   fmt$(Math.round(c.currentAnnual)),   fmt$(Math.round(c.grossAnnual))],
                  ['NOI',            fmt$(Math.round(c.currentNOI)),       fmt$(Math.round(c.noi))],
                  ['Monthly CF',     fmt$(Math.round(c.currentCF/12)),     fmt$(Math.round(c.monthlyCF))],
                  ['Cap Rate',       c.currentCapRate.toFixed(2)+'%',      c.capRate.toFixed(2)+'%'],
                  ['Cash on Cash',   c.currentCocReturn.toFixed(2)+'%',   c.cocReturn.toFixed(2)+'%'],
                ].map(([label, curr, pot], i) => (
                  <React.Fragment key={i}>
                    <div style={{ padding:'8px 10px', borderTop:'1px solid var(--border)', fontSize:12, fontWeight:600, color:'var(--text)' }}>{label}</div>
                    <div style={{ padding:'8px 10px', borderTop:'1px solid var(--border)', fontSize:12, fontWeight:700, color:'#F5A623', textAlign:'center' }}>{curr}</div>
                    <div style={{ padding:'8px 10px', borderTop:'1px solid var(--border)', fontSize:12, fontWeight:700, color:'#10B981', textAlign:'center' }}>{pot}</div>
                  </React.Fragment>
                ))}
                {/* Upside row */}
                <div style={{ padding:'8px 10px', borderTop:'2px solid var(--border)', fontSize:12, fontWeight:800, color:'var(--text)', background:'rgba(204,34,0,.04)' }}>Monthly Upside</div>
                <div style={{ padding:'8px 10px', borderTop:'2px solid var(--border)', fontSize:12, background:'rgba(204,34,0,.04)' }} />
                <div style={{ padding:'8px 10px', borderTop:'2px solid var(--border)', fontSize:13, fontWeight:900, color:'#CC2200', textAlign:'center', background:'rgba(204,34,0,.04)' }}>+{fmt$(c.rentUpsideMonthly)}/mo</div>
              </div>
            </Section>
          )}

          <Section title="Annual Income Statement" accent="#10B981">
            <Row label="Gross Rental Income"       value={fmt$(Math.round(c.grossAnnual))} bold />
            <Row label={'Vacancy (' + vacancy + '%)'}      value={'- ' + fmt$(Math.round(c.vacancyLoss))} color="#F5A623" muted />
            <Row label="Effective Gross Income"    value={fmt$(Math.round(c.effectiveIncome))} />
            <div style={{ height:6 }} />
            {[
              ['Property Tax',        c.opExpenses.propTax],
              ['Insurance',           c.opExpenses.insurance],
              ['Water/Sewer',         c.opExpenses.waterSewer],
              ['Electric',            c.opExpenses.electric],
              ['Gas',                 c.opExpenses.gas],
              ['HOA',                 c.opExpenses.hoa],
              ['Property Management', c.opExpenses.management],
              ['Maintenance',         c.opExpenses.maintenance],
              ['CapEx Reserve',       c.opExpenses.capex],
              ['Trash/Landscaping',   c.opExpenses.trash],
              ['Other',               c.opExpenses.other],
            ].filter(([,v])=>v>0).map(([l,v])=>(
              <Row key={l} label={l} value={'- ' + fmt$(Math.round(v))} color="#DC2626" muted />
            ))}
            <Row label="Total Operating Expenses"  value={'- ' + fmt$(Math.round(c.totalOpEx))} bold color="#DC2626" />
            <div style={{ height:6 }} />
            <Row label="Net Operating Income (NOI)" value={fmt$(Math.round(c.noi))} bold color="#10B981" highlight />
            <Row label="Annual Debt Service"       value={'- ' + fmt$(Math.round(c.annualDebt))} color="#DC2626" />
            <Row label="Annual Cash Flow"          value={fmt$(Math.round(c.cashFlow))} bold color={c.cashFlow>=0?'#10B981':'#DC2626'} highlight />
            <Row label="Monthly Cash Flow"         value={fmt$(Math.round(c.monthlyCF)) + ' / month'} bold color={c.monthlyCF>=0?'#10B981':'#DC2626'} />
          </Section>

          <Section title="Full Investment Summary" accent="#1B2B4B">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 24px' }}>
              <div>
                <Row label="Purchase Price"      value={fmt$(c.p)} />
                <Row label={'Down Payment (' + down + '%)'}   value={fmt$(Math.round(c.dp))} />
                <Row label={'Closing Costs (' + closingPct + '%)'}  value={fmt$(Math.round(c.closing))} />
                <Row label="Total Cash Invested" value={fmt$(Math.round(c.totalInvested))} bold />
                <Row label="Loan Amount"         value={fmt$(Math.round(c.loan))} />
                <Row label="Monthly Mortgage"    value={fmt$(Math.round(c.mortgage))} />
              </div>
              <div>
                <Row label="Cap Rate"            value={c.capRate.toFixed(2)+'%'} bold color={metricColor(c.capRate,6,4)} />
                <Row label="Cash on Cash Return" value={c.cocReturn.toFixed(2)+'%'} bold color={metricColor(c.cocReturn,8,5)} />
                <Row label="GRM"                 value={c.grm.toFixed(1)+'x'} />
                <Row label="DSCR"                value={c.dscr.toFixed(2)+'x'} bold color={metricColor(c.dscr,1.25,1.0)} />
                <Row label="Break-Even Occ."     value={c.breakEven.toFixed(1)+'%'} />
                <Row label="Price / Unit"        value={fmt$(Math.round(c.pricePerUnit))} />
              </div>
            </div>
          </Section>

          {/* 5-year projection */}
          <Section title="5-Year Projection (2% rent growth · 3% appreciation)" accent="#8B5CF6">
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:'var(--dim)' }}>
                    {['Year','Avg Rent/mo','Property Value','Cash Flow/mo','Total Equity'].map(h=>(
                      <th key={h} style={{ padding:'7px 10px', textAlign: h==='Year'?'left':'right', fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', borderBottom:'2px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {c.projections.map((p2,i) => (
                    <tr key={i} style={{ background: i%2===0?'transparent':'var(--dim)' }}>
                      <td style={{ padding:'8px 10px', fontWeight:700, color:'var(--text)', borderBottom:'1px solid var(--border)' }}>Year {p2.yr}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', color:'var(--muted)', borderBottom:'1px solid var(--border)' }}>{fmt$(Math.round(p2.rent/12))}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', color:'var(--text)', borderBottom:'1px solid var(--border)' }}>{fmt$(Math.round(p2.value))}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700, color:p2.cashFlow>=0?'#10B981':'#DC2626', borderBottom:'1px solid var(--border)' }}>{fmt$(Math.round(p2.cashFlow/12))}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700, color:'#8B5CF6', borderBottom:'1px solid var(--border)' }}>{fmt$(Math.round(p2.equity))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}

// ── MAIN ──────────────────────────────────────────────────────────
export function Mortgage() {
  const [tab, setTab] = useState('mortgage')
  const active = TABS.find(t => t.id === tab)

  return (
    <div style={{ fontFamily:ff }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:22, fontWeight:900, color:'var(--text)' }}>🏦 Mortgage & Calculator</div>
        <div style={{ fontSize:13, color:'var(--muted)', marginTop:2 }}>{active?.desc}</div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:'2px solid var(--border)', marginBottom:24, gap:0, overflowX:'auto', flexShrink:0 }}>
        {TABS.map(t => {
          const a = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding:'9px 18px', border:'none', background:'none', cursor:'pointer',
                borderBottom: a?'2px solid #CC2200':'2px solid transparent', marginBottom:'-2px',
                fontSize:13, fontWeight:a?700:500, color:a?'#CC2200':'var(--muted)', fontFamily:ff, whiteSpace:'nowrap' }}>
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'mortgage' && <MortgageCalc />}
      {tab === 'closing'  && <ClosingCosts />}
      {tab === 'pnl'      && <AgentPnL />}
      {tab === 'deal'        && <DealAnalyzer />}
      {tab === 'investment'  && <InvestmentCalc />}
    </div>
  )
}
