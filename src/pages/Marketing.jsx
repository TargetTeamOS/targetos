// TargetOS V2 — Marketing Hub
// Combines Social Cards and Weekly Ad under one page with tabs,
// rather than two separate top-level nav items for what are really
// both "generate marketing material" tools. Both existing pages are
// reused as-is (imported, not rewritten) to avoid any regression risk
// in either one.
import React, { useState } from 'react'
import { PageHeader, Tabs } from '../components/UI'
import { SocialCards } from './SocialCards'
import { DesignStudio } from './DesignStudio'
import { EmailBlast } from './EmailBlast'
import { WeeklyAd } from './WeeklyAd'
import { MarketUpdateCard } from './MarketUpdateCard'
import { TestimonialCard } from './TestimonialCard'
import { usePageView, LastVisited } from '../components/PageViewTracking'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// Consolidated (July 2026): five separate "make a graphic" tabs were
// really one activity. Two primary tabs — Create (with a type
// selector) and Email Blast.
const TABS = [
  { id: 'create', label: '🎨 Create' },
  { id: 'blast',  label: '📨 Email Blast' },
]
const CREATE_TABS = [
  { id: 'social',      label: '🏠 Property Cards' },
  { id: 'studio',      label: '🎨 Design Studio' },
  { id: 'weekly',      label: '📰 Weekly Ad' },
  { id: 'market',      label: '📊 Market Update' },
  { id: 'testimonial', label: '💬 Testimonial' },
]
const CREATE_TAB_IDS = CREATE_TABS.map(t => t.id)

export function Marketing() {
  const [tab, setTab] = useState('social')
  usePageView('marketing')
  const inCreate = CREATE_TAB_IDS.includes(tab)

  return (
    <div style={{ fontFamily: ff }}>
      <div style={{ display:'flex', alignItems:'center', borderBottom:'2px solid var(--border)', marginBottom: inCreate ? 0 : 20, gap:0 }}>
        {TABS.map(t => {
          const active = tab === t.id || (t.id === 'create' && inCreate)
          return (
            <button key={t.id} onClick={() => setTab(t.id === 'create' ? 'social' : t.id)}
              style={{ padding:'10px 18px', border:'none', borderBottom: active ? '2px solid var(--brand)' : '2px solid transparent',
                background:'transparent', color: active ? 'var(--brand)' : 'var(--muted)', fontWeight: active ? 700 : 500,
                fontSize:13, cursor:'pointer', fontFamily:ff, marginBottom:-2 }}>
              {t.label}
            </button>
          )
        })}
        <div style={{ marginLeft:'auto', paddingBottom:6 }}><LastVisited page="marketing" /></div>
      </div>
      {inCreate && (
        <div style={{ display:'flex', gap:6, padding:'10px 0 0', marginBottom:20, flexWrap:'wrap' }}>
          {CREATE_TABS.map(ct => (
            <button key={ct.id} onClick={() => setTab(ct.id)}
              style={{ padding:'6px 13px', borderRadius:99, border:'1px solid ' + (tab===ct.id ? 'var(--brand)' : 'var(--border)'),
                background: tab===ct.id ? 'rgba(204,34,0,.08)' : 'transparent', color: tab===ct.id ? 'var(--brand)' : 'var(--muted)',
                fontSize:12, fontWeight: tab===ct.id ? 700 : 500, cursor:'pointer', fontFamily:ff }}>
              {ct.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'studio' && <DesignStudio />}
      {tab === 'blast'  && <EmailBlast />}
      {tab === 'social' && <SocialCards />}
      {tab === 'weekly'  && <WeeklyAd />}
      {tab === 'market'  && <MarketUpdateCard />}
      {tab === 'testimonial' && <TestimonialCard />}
    </div>
  )
}
