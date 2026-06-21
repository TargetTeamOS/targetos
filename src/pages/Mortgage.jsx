import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { Card, Btn, Grid2, Grid3 } from '../components/UI'

const fmt$ = n => '$' + Math.round(n).toLocaleString()

export function Mortgage() {
  const { state } = useApp()
  const [tab, setTab] = useState('calc')
  const [form, setForm] = useState({price:825000,dp:5,rate:5.99,term:30,tax:18000,ins:2400,pmi:0.875,cc:3,freq:'Monthly'})
  const [calc, setCalc] = useState(null)
  const [selectedClient, setSelectedClient] = useState('')
  const [contacts, setContacts] = useState([])

  useEffect(()=>{
    import('../lib/supabase').then(({supabase})=>{
      supabase.from('contacts').select('id,first_name,last_name,phone,email').order('created_at',{ascending:false}).limit(100).then(({data})=>setContacts(data||[]))
    })
  },[])

  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  useEffect(()=>{ compute() },[form])

  function compute() {
    const {price,dp,rate,term,tax,ins,pmi:pmiR,cc} = form
    const downAmt = price*dp/100
    const loan = price - downAmt
    const r = rate/100/12, n = term*12
    const pi = r===0 ? loan/n : loan*(r*Math.pow(1+r,n))/(Math.pow(1+r,n)-1)
    const monthlyTax = tax/12
    const monthlyIns = ins/12
    const pmiAmt = dp<20 ? (loan*pmiR/100/12) : 0
    const total = pi + monthlyTax + monthlyIns + pmiAmt
    const ccAmt = price*cc/100
    const interest = pi*n - loan
    setCalc({price,downAmt,dp,loan,pi,monthlyTax,monthlyIns,pmiAmt,total,ccAmt,interest,n,r:rate,term})
  }

  function sendToClient() {
    if(!calc) return
    const c = contacts.find(x=>x.id===selectedClient)
    if(!c) { toast('Select a client first','#DC2626'); return }
    const msg = `Mortgage Calculation from Target Team:\n\nHome Price: ${fmt$(calc.price)}\nDown Payment: ${fmt$(calc.downAmt)} (${calc.dp}%)\nLoan Amount: ${fmt$(calc.loan)}\nRate: ${calc.r}%\n\nMonthly P&I: ${fmt$(calc.pi)}\nProperty Tax: ${fmt$(calc.monthlyTax)}/mo\nInsurance: ${fmt$(calc.monthlyIns)}/mo${calc.pmiAmt>0?'\nPMI: '+fmt$(calc.pmiAmt)+'/mo':''}\n\nTOTAL MONTHLY: ${fmt$(calc.total)}\nClosing Costs (est.): ${fmt$(calc.ccAmt)}\n\nCall us: 845.424.1014\nTarget Team — KW Valley Realty`
    if(c.email) window.location.href = 'mailto:'+c.email+'?subject=Your+Mortgage+Calculation+from+Target+Team&body='+encodeURIComponent(msg)
    else if(c.phone) window.location.href = 'sms:'+c.phone.replace(/\D/g,'')+'?body='+encodeURIComponent(msg)
    else { navigator.clipboard?.writeText(msg).then(()=>toast('✅ Copied to clipboard!')) }
  }

  return (
    <div style={{maxWidth:'640px'}}>
      <Card>
        {/* Tabs */}
        <div style={{display:'flex',borderBottom:'1px solid var(--border)'}}>
          {[['calc','Calculator'],['summary','Summary'],['amort','Amortization']].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{padding:'12px 20px',background:'transparent',border:'none',fontFamily:'Inter,system-ui,sans-serif',fontSize:'13px',fontWeight:600,cursor:'pointer',color:tab===k?'var(--red)':'var(--muted)',borderBottom:tab===k?'2px solid var(--red)':'2px solid transparent'}}>
              {l}
            </button>
          ))}
        </div>

        <div style={{padding:'20px'}}>
          {tab==='calc' && (
            <>
              {/* Inputs */}
              <Grid2 gap={12} style={{marginBottom:'6px'}}>
                {[['Home Price ($)','price','number'],['Down Payment (%)','dp','number'],['Interest Rate (%)','rate','number'],['Loan Term (years)','term','number']].map(([l,k,t])=>(
                  <div key={k} style={{marginBottom:'12px'}}>
                    <label style={{display:'block',fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'5px'}}>{l}</label>
                    <input type={t} value={form[k]} onChange={e=>set(k,parseFloat(e.target.value)||0)} step={k==='rate'?'0.01':'1'}
                      style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'10px 13px',outline:'none'}}
                      onFocus={e=>e.target.style.borderColor='var(--red)'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
                  </div>
                ))}
              </Grid2>

              <div style={{borderTop:'1px solid var(--border)',paddingTop:'16px',marginBottom:'16px'}}>
                <div style={{fontSize:'12px',fontWeight:700,marginBottom:'12px'}}>Taxes, Insurance & Expenses</div>
                <Grid2 gap={12}>
                  {[['Property Taxes/year ($)','tax'],['Homeowners Insurance/year ($)','ins'],['PMI/year (%)','pmi'],['Closing Costs (%)','cc']].map(([l,k])=>(
                    <div key={k} style={{marginBottom:'12px'}}>
                      <label style={{display:'block',fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'5px'}}>{l}</label>
                      <input type="number" value={form[k]} onChange={e=>set(k,parseFloat(e.target.value)||0)} step="0.001"
                        style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'10px 13px',outline:'none'}}
                        onFocus={e=>e.target.style.borderColor='var(--red)'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
                    </div>
                  ))}
                </Grid2>
              </div>

              {/* Result */}
              {calc && (
                <div style={{background:'var(--dim)',borderRadius:'12px',padding:'20px',textAlign:'center',marginBottom:'16px'}}>
                  <div style={{color:'var(--muted)',fontSize:'11px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'5px'}}>Monthly Payment</div>
                  <div style={{fontSize:'48px',fontWeight:900,color:'var(--red)',lineHeight:1}}>{fmt$(calc.total)}</div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'8px',marginTop:'16px'}}>
                    {[['P&I',fmt$(calc.pi),'var(--navy)'],['Tax',fmt$(calc.monthlyTax),'#D97706'],['Insurance',fmt$(calc.monthlyIns),'#7C3AED'],['PMI',fmt$(calc.pmiAmt),'#DC2626'],['Total/mo',fmt$(calc.total),'var(--red)'],['Closing',fmt$(calc.ccAmt),'var(--muted)']].map(([l,v,c])=>(
                      <div key={l} style={{background:'var(--panel)',borderRadius:'8px',padding:'10px'}}>
                        <div style={{color:'var(--muted)',fontSize:'9px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px'}}>{l}</div>
                        <div style={{fontSize:'13px',fontWeight:800,color:c,marginTop:'2px'}}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Send to client */}
              <div style={{marginBottom:'8px'}}>
                <label style={{display:'block',fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'5px'}}>Send To Client</label>
                <select value={selectedClient} onChange={e=>setSelectedClient(e.target.value)}
                  style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'10px 13px',outline:'none',marginBottom:'10px'}}>
                  <option value="">Select contact...</option>
                  {contacts.map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name||''}{c.phone?' ('+c.phone+')':c.email?' ('+c.email+')':''}</option>)}
                </select>
                <div style={{display:'flex',gap:'7px'}}>
                  <Btn style={{flex:1}} onClick={sendToClient}>Send to Client</Btn>
                  <Btn variant="ghost" onClick={()=>{if(!calc)return;const msg=`Home: ${fmt$(calc.price)}\nDown: ${fmt$(calc.downAmt)} (${calc.dp}%)\nLoan: ${fmt$(calc.loan)}\nMonthly: ${fmt$(calc.total)}\nP&I: ${fmt$(calc.pi)}\nTax: ${fmt$(calc.monthlyTax)}/mo\nInsurance: ${fmt$(calc.monthlyIns)}/mo\nClosing: ${fmt$(calc.ccAmt)}`;navigator.clipboard?.writeText(msg).then(()=>toast('✅ Copied!')).catch(()=>toast('Copy failed — try manually','#DC2626'))}}>Copy</Btn>
                </div>
              </div>
            </>
          )}

          {tab==='summary' && calc && (
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
              {[['Home Price',fmt$(calc.price),'var(--text)'],['Down Payment',fmt$(calc.downAmt)+' ('+calc.dp+'%)','var(--muted)'],['Loan Amount',fmt$(calc.loan),'var(--navy)'],['P&I Payment',fmt$(calc.pi)+'/mo','var(--text)'],['Property Tax',fmt$(calc.monthlyTax)+'/mo','#D97706'],['Insurance',fmt$(calc.monthlyIns)+'/mo','#7C3AED'],['PMI',fmt$(calc.pmiAmt)+'/mo','#DC2626'],['Total Monthly',fmt$(calc.total)+'/mo','var(--red)'],['Closing Costs',fmt$(calc.ccAmt),'var(--muted)'],['Total Interest',fmt$(calc.interest),'#DC2626'],['Total Cost',fmt$(calc.price+calc.interest),'var(--text)'],['Loan Term',calc.term+' years','var(--muted)']].map(([k,v,c])=>(
                <div key={k} style={{background:'var(--dim)',borderRadius:'9px',padding:'12px'}}>
                  <div style={{color:'var(--muted)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',marginBottom:'3px'}}>{k}</div>
                  <div style={{fontSize:'14px',fontWeight:800,color:c}}>{v}</div>
                </div>
              ))}
            </div>
          )}

          {tab==='summary' && !calc && <div style={{color:'var(--muted)',textAlign:'center',padding:'24px'}}>Calculate first</div>}

          {tab==='amort' && calc && (
            <>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',padding:'8px 0',borderBottom:'2px solid var(--border)',color:'var(--muted)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.7px'}}>
                <span>Year</span><span style={{color:'#7C3AED'}}>Principal</span><span style={{color:'#DC2626'}}>Interest</span><span>Balance</span>
              </div>
              <div style={{maxHeight:'400px',overflowY:'auto'}}>
                {Array.from({length:calc.term}).map((_,yr)=>{
                  let bal = calc.loan
                  let yPri=0, yInt=0
                  for(let m=0;m<12*(yr+1);m++){
                    const iP=bal*calc.r/100/12
                    const prP=calc.pi-iP
                    if(m>=12*yr){yInt+=iP;yPri+=prP}
                    bal-=prP
                  }
                  return (
                    <div key={yr} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:'12px'}}>
                      <span style={{fontWeight:600}}>Year {yr+1}</span>
                      <span style={{color:'#7C3AED',fontWeight:600}}>{fmt$(yPri)}</span>
                      <span style={{color:'#DC2626',fontWeight:600}}>{fmt$(yInt)}</span>
                      <span style={{color:'var(--muted)'}}>{fmt$(Math.max(bal,0))}</span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
          {tab==='amort' && !calc && <div style={{color:'var(--muted)',textAlign:'center',padding:'24px'}}>Calculate first</div>}
        </div>
      </Card>
    </div>
  )
}
