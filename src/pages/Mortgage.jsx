// TargetOS V2 — Mortgage & P&L Calculator
// Mortgage calculator, closing costs estimator, agent P&L, and deal analyzer
import React, { useState, useMemo } from 'react'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const TABS = [
  { id:'mortgage',  label:'🏦 Mortgage',       desc:'Monthly payment calculator' },
  { id:'closing',   label:'📋 Closing Costs',  desc:'Buyer & seller net sheets' },
  { id:'pnl',       label:'💰 Agent P&L',       desc:'Commission & profit breakdown' },
  { id:'deal',      label:'📊 Deal Analyzer',   desc:'Full deal side-by-side' },
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

  return (
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
      {tab === 'deal'     && <DealAnalyzer />}
    </div>
  )
}
