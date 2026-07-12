import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Card, CardHeader, StatCard, Grid4 } from '../components/UI'

export function News() {
  const [stats, setStats] = useState({ active: null, underContract: null })

  useEffect(() => {
    Promise.all([
      supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'Active'),
      supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'Under Contract'),
    ]).then(([activeRes, ucRes]) => {
      setStats({ active: activeRes.count ?? 0, underContract: ucRes.count ?? 0 })
    }).catch(() => {})
  }, [])

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10, fontStyle: 'italic' }}>
        Mortgage rates and market news below are sample data — no live rate/news feed is connected yet. Active listings and pending sales are real, live counts.
      </div>
      <Grid4 style={{marginBottom:'14px'}}>
        <StatCard label="30yr Fixed"      value="7.25%"  sub="Sample rate"  subColor="#DC2626"/>
        <StatCard label="15yr Fixed"      value="6.75%"  sub="Sample rate"             subColor="#D97706"/>
        <StatCard label="Rockland Median" value="$648K"  sub="Sample data" subColor="var(--green)"/>
        <StatCard label="Days on Market"  value="28"     sub="Sample data"    subColor="var(--teal)"/>
      </Grid4>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px'}}>
        <Card>
          <CardHeader>Latest News <span style={{fontSize:10,color:'var(--muted)',fontWeight:400}}>(sample)</span></CardHeader>
          {[['Fed Holds Rates Steady — Q4 Cuts Expected','Mortgage rates remain elevated but stable. Experts predict potential cuts in Q4 2026.','Jun 14, 2026','#0EA5E9'],['Rockland County Prices Hit New High','Median sale prices reached $648K in May, up 4.2% year-over-year.','Jun 12, 2026','#16A34A'],['New Construction Boom in Spring Valley','12 Sherman Drive and neighboring developments driving luxury condo market growth.','Jun 10, 2026','#D97706'],['OneKey MLS Reports Record Showings','Showing activity up 18% month-over-month across Rockland and Orange counties.','Jun 8, 2026','#7C3AED'],['FHA Loan Limits Raised for 2026','FHA limits in Rockland County raised to $1,089,300 for single family.','Jun 5, 2026','#E8650A']].map((n,i)=>(
            <div key={i} style={{display:'flex',gap:'12px',padding:'13px 16px',borderBottom:'1px solid var(--border)',cursor:'pointer'}}
              onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div style={{width:4,height:4,borderRadius:'50%',background:n[3],flexShrink:0,marginTop:'7px'}}/>
              <div>
                <div style={{fontSize:'12px',fontWeight:700,marginBottom:'3px',lineHeight:1.4}}>{n[0]}</div>
                <div style={{fontSize:'11px',color:'var(--muted)',lineHeight:1.5,marginBottom:'3px'}}>{n[1]}</div>
                <div style={{fontSize:'10px',color:'var(--muted)'}}>{n[2]}</div>
              </div>
            </div>
          ))}
        </Card>

        <div>
          <Card style={{marginBottom:'13px'}}>
            <CardHeader>Rockland Market</CardHeader>
            {[
              ['Active Listings', stats.active ?? '…', 'Live count', '#0EA5E9'],
              ['Under Contract',   stats.underContract ?? '…', 'Live count', '#D97706'],
              ['Sale/List Ratio','98.2%','Sample data','#16A34A'],
              ['Inventory Months','1.8','Sample data','#DC2626'],
            ].map(s=>(
              <div key={s[0]} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 16px',borderBottom:'1px solid var(--border)'}}>
                <div style={{fontSize:'12px',color:'var(--muted)'}}>{s[0]}</div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:'15px',fontWeight:800,color:s[3]}}>{s[1]}</div>
                  <div style={{fontSize:'10px',color:'var(--muted)'}}>{s[2]}</div>
                </div>
              </div>
            ))}
          </Card>

          <Card>
            <CardHeader>Mortgage Rates <span style={{fontSize:10,color:'var(--muted)',fontWeight:400}}>(sample)</span></CardHeader>
            {[['30yr Fixed','7.25%','#DC2626'],['15yr Fixed','6.75%','#D97706'],['FHA (30yr)','6.75%','#E8650A'],['Jumbo','7.15%','#7C3AED'],['VA','6.50%','#0EA5E9']].map(r=>(
              <div key={r[0]} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 16px',borderBottom:'1px solid var(--border)'}}>
                <div style={{fontSize:'12px',fontWeight:600}}>{r[0]}</div>
                <div style={{fontSize:'14px',fontWeight:800,color:r[2]}}>{r[1]}</div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  )
}
