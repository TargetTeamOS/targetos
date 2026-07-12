// TargetOS V2 — Marketing Hub
// Combines Social Cards and Weekly Ad under one page with tabs,
// rather than two separate top-level nav items for what are really
// both "generate marketing material" tools. Both existing pages are
// reused as-is (imported, not rewritten) to avoid any regression risk
// in either one.
import React, { useState } from 'react'
import { PageHeader, Tabs } from '../components/UI'
import { SocialCards } from './SocialCards'
import { WeeklyAd } from './WeeklyAd'
import { MarketUpdateCard } from './MarketUpdateCard'
import { TestimonialCard } from './TestimonialCard'
import { usePageView, LastVisited } from '../components/PageViewTracking'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const TABS = [
  { id: 'social', label: '📱 Social Cards' },
  { id: 'weekly',  label: '📰 Weekly Ad' },
  { id: 'market',  label: '📊 Market Update' },
  { id: 'testimonial', label: '💬 Testimonial' },
]

export function Marketing() {
  const [tab, setTab] = useState('social')
  usePageView('marketing')

  return (
    <div style={{ fontFamily: ff }}>
      <div style={{ display:'flex', alignItems:'center', borderBottom:'2px solid var(--border)', marginBottom:20, gap:0 }}>
        {TABS.map(t => {
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding:'10px 18px', border:'none', borderBottom: active ? '2px solid var(--brand)' : '2px solid transparent',
                background:'transparent', color: active ? 'var(--brand)' : 'var(--muted)', fontWeight: active ? 700 : 500,
                fontSize:13, cursor:'pointer', fontFamily:ff, marginBottom:-2 }}>
              {t.label}
            </button>
          )
        })}
        <div style={{ marginLeft:'auto', paddingBottom:6 }}><LastVisited page="marketing" /></div>
      </div>

      {tab === 'social' && <SocialCards />}
      {tab === 'weekly'  && <WeeklyAd />}
      {tab === 'market'  && <MarketUpdateCard />}
      {tab === 'testimonial' && <TestimonialCard />}
    </div>
  )
}
