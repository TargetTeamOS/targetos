// ═══════════════════════════════════════════════════════════════
// ListingWorkspace (Phase 1 — full-width, July 2026)
// Full-page agent listing hub (replaces the side drawer). Inline
// editing with Save; only existing data. Tabs: Overview · Buyer
// Interest & Showings · Seller Updates · Marketing & Ads · Price
// History · Seller Contacts · Documents (placeholder) · Activity Log.
// Add-showing / schedule-OH still use the parent's modals for now.
// No new tables/columns.
// ═══════════════════════════════════════════════════════════════
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmt$, fmtDate } from '../lib/utils'
import { Avatar } from './UI'
import SellerContacts from './SellerContacts'
import { BoardLinks } from './BoardLinks'
import { contactName } from './ContactPicker'
import { THEME_DEFS, themeLabel, mainThemeFor, buildThemeSummary, buildBuyerStats, buildSummarySentences } from '../lib/feedbackThemes'
import { EmailComposeModal } from './EmailComposeModal'

const ff = 'Inter,system-ui,sans-serif'
const ALL_TABS = [
  { id:'tasks',     label:'Summary / Next Action' },
  { id:'feedback',  label:'Buyer Feedback' },
  { id:'report',    label:'Seller Report' },
  { id:'marketing', label:'Marketing' },
  { id:'price',     label:'Price & Activity' },
  { id:'parties',   label:'Contacts / Parties' },
  { id:'notes',     label:'Notes' },
  { id:'timeline',  label:'Timeline' },
  { id:'admin',     label:'Admin Log', adminOnly:true },
]
const LISTING_STATUSES = ['Active','Coming Soon','Under Contract','Sold','Expired','Withdrawn']
const STATUS_COLORS = { 'Active':'#10B981','Coming Soon':'#8B5CF6','Under Contract':'#F97316','Sold':'#3B82F6','Expired':'#DC2626','Withdrawn':'#94A3B8' }

function dom(l) {
  const s = l.listed_date || l.list_date || l.created_at
  return s ? Math.floor((Date.now() - new Date(s).getTime()) / 86400000) : null
}
const interestColor = n => n >= 4 ? '#10B981' : n >= 3 ? '#F5A623' : '#DC2626'
const INTEREST_LABELS = { 5:'Very interested', 4:'Interested', 3:'Neutral', 2:'Lukewarm', 1:'Not interested' }

// Party roles tracked today on the TC Board (mirrors TCBoardPanels.jsx's
// PARTY_ROLES exactly, read-only reference here -- this file does not
// modify TC Board behavior). 'photographer' is intentionally absent: it
// is not a tracked party role in the current schema.
const CONNECTED_PARTY_ROLES = [
  { key:'buyer',            label:'Buyer' },
  { key:'seller',           label:'Seller' },
  { key:'buyer_attorney',   label:"Buyer's Attorney" },
  { key:'seller_attorney',  label:"Seller's Attorney" },
  { key:'mortgage_broker',  label:'Mortgage Broker' },
  { key:'inspector',        label:'Inspector' },
  { key:'appraiser',        label:'Appraiser' },
  { key:'other_agent',      label:'Other Side Agent' },
  { key:'title',            label:'Title Company' },
]

export default function ListingWorkspace({
  listing, agent, showings = [], openHouses = [], onBack, onSaved,
  onLogShowing, onScheduleOH, canViewAdminLog = false, canManage = false,
}) {
  const [tab, setTab] = useState('tasks')
  const [adminLog, setAdminLog] = useState([]); const [logLoading, setLogLoading] = useState(false)
  const [mktTasks, setMktTasks] = useState(null)   // null=not loaded, []=none
  const [connected, setConnected] = useState(null) // { tcDeal, productionDeal } | null while loading
  const [parties, setParties] = useState(null)     // { role: contact } | null while loading, {} if no TC deal linked
  const [emailTarget, setEmailTarget] = useState(null) // contact object to email, or null
  const [taskMsg, setTaskMsg] = useState('')
  const [taskAssignee, setTaskAssignee] = useState('')
  const [secretaries, setSecretaries] = useState([])
  const [sendingTask, setSendingTask] = useState(false)
  const [matchCandidates, setMatchCandidates] = useState(null) // [{id,addr,score}] | null while loading, [] if none
  const [saving, setSaving] = useState('')
  const [copyLabel, setCopyLabel] = useState('Copy Seller Report')

  // editable field buffers
  const [status, setStatus] = useState(listing.status || 'Active')
  const [price, setPrice] = useState(listing.list_price || '')
  const [sellerDate, setSellerDate] = useState(listing.seller_updated_at ? listing.seller_updated_at.slice(0,10) : '')
  const [mktStatus, setMktStatus] = useState(listing.marketing_status || '')
  const [notes, setNotes] = useState(listing.notes || '')

  useEffect(() => {
    setStatus(listing.status || 'Active'); setPrice(listing.list_price || '')
    setSellerDate(listing.seller_updated_at ? listing.seller_updated_at.slice(0,10) : '')
    setMktStatus(listing.marketing_status || ''); setNotes(listing.notes || ''); setTab('tasks')
  }, [listing.id])

  async function loadAdminLog() {
    setLogLoading(true)
    try {
      const { data } = await supabase.from('audit_log').select('*, agents(id,name,color)')
        .eq('record_id', listing.id).order('created_at', { ascending:false }).limit(100)
      setAdminLog(data || [])
    } catch { setAdminLog([]) }
    setLogLoading(false)
  }
  useEffect(() => {
    if (tab === 'admin' || tab === 'price' || tab === 'timeline') loadAdminLog()
  }, [tab, listing.id])

  // Marketing: read the linked tc_deal's marketing tasks (read-only)
  useEffect(() => {
    if (tab !== 'marketing') return
    let alive = true
    ;(async () => {
      try {
        const r = await supabase.from('tc_deals').select('id').eq('linked_listing_id', listing.id).maybeSingle()
        if (!r.data?.id) { if (alive) setMktTasks([]); return }
        const t = await supabase.from('tc_tasks').select('id,title,status,due_date,phase').eq('deal_id', r.data.id)
        const MKT = /photo|mls|brochure|social|ad\b|ads|marketing|drone|floor plan|flyer|sign|video|publication|email blast/i
        if (alive) setMktTasks((t.data || []).filter(x => MKT.test(x.title || '')))
      } catch { if (alive) setMktTasks([]) }
    })()
    return () => { alive = false }
  }, [tab, listing.id])

  // Connected Records (read-only): find the linked TC file and/or Production
  // deal for this listing via the existing link columns (tc_deals.linked_
  // listing_id, deals.listing_id) -- same columns BoardLinks.jsx already
  // uses. Loads once per listing since the summary panel is always visible,
  // not gated to a tab. Does not write anything, does not touch TC Board.
  useEffect(() => {
    let alive = true
    setConnected(null)
    ;(async () => {
      try {
        const [tc, prod] = await Promise.all([
          supabase.from('tc_deals').select('id, tc_phase, addr').eq('linked_listing_id', listing.id).maybeSingle(),
          supabase.from('deals').select('id, stage, addr').eq('listing_id', listing.id).maybeSingle(),
        ])
        if (alive) setConnected({ tcDeal: tc.data || null, productionDeal: prod.data || null })
      } catch { if (alive) setConnected({ tcDeal:null, productionDeal:null }) }
    })()
    return () => { alive = false }
  }, [listing.id])

  // Possible-match detection (schema-free, reverse direction of the
  // existing LinkListingControl.jsx logic on the TC Board -- mirrors its
  // scoreMatch algorithm rather than importing from that file, so this
  // never touches TC Board code). Only runs once we know there's no
  // existing link. Scoped to the current agent's own TC files unless the
  // viewer can manage all (admin/secretary/listings.view_all) -- an agent
  // should not see or link to another agent's TC files here.
  useEffect(() => {
    if (!connected || connected.tcDeal) { setMatchCandidates([]); return }
    let alive = true
    ;(async () => {
      try {
        let q = supabase.from('tc_deals').select('id,addr,agent_id,tc_phase').is('linked_listing_id', null)
        if (!canManage) q = q.eq('agent_id', listing.agent_id)
        const { data } = await q.limit(500)
        const norm = s => String(s||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()
        const at = norm(listing.addr).split(' ').filter(Boolean)
        const bset0 = new Set(at)
        const scored = (data||[]).map(d => {
          const bt = norm(d.addr).split(' ').filter(Boolean)
          const bset = new Set(bt)
          let shared = 0; at.forEach(t => { if (bset.has(t)) shared++ })
          const aNum = at.find(t=>/^\d+$/.test(t)), bNum = bt.find(t=>/^\d+$/.test(t))
          const numBonus = aNum && bNum && aNum===bNum ? 2 : 0
          return { ...d, score: (at.length&&bt.length ? shared/Math.max(at.length,bt.length) : 0) + numBonus }
        }).filter(d => d.score > 0.3).sort((a,b)=>b.score-a.score).slice(0,3)
        if (alive) setMatchCandidates(scored)
      } catch { if (alive) setMatchCandidates([]) }
    })()
    return () => { alive = false }
  }, [connected, listing.id, canManage])

  useEffect(() => {
    let alive = true
    supabase.from('agents').select('id,name,role').in('role', ['secretary','admin']).eq('active', true)
      .then(({ data }) => { if (alive) { setSecretaries(data||[]); if ((data||[]).length && !taskAssignee) setTaskAssignee(data[0].id) } })
      .catch(() => { if (alive) setSecretaries([]) })
    return () => { alive = false }
  }, [])

  // Task/message to secretary, tied to this listing. NOTE: the tasks
  // table has no listing_id column, so the connection is via the title
  // and notes text, not a real foreign key -- flagged honestly rather
  // than treated as a clean link. A future tasks.listing_id column would
  // make this properly queryable/filterable per listing.
  async function sendTaskToSecretary() {
    if (!taskMsg.trim()) { alert('Enter a message'); return }
    if (!taskAssignee) { alert('Pick who this goes to'); return }
    setSendingTask(true)
    try {
      const { error } = await supabase.from('tasks').insert({
        title: '[' + listing.addr + '] ' + taskMsg.trim().slice(0,80),
        notes: 'Re: ' + listing.addr + '\n\n' + taskMsg.trim() + '\n\n— sent from My Listings by ' + (agent?.name||'agent'),
        agent_id: taskAssignee, status:'pending', priority:'normal',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      })
      if (error) throw error
      try {
        await supabase.from('audit_log').insert({ agent_id: agent?.id||listing.agent_id, table_name:'listings', record_id:listing.id, action:'task_sent', field_name:'Task', metadata:{ description:'Task sent to office: ' + taskMsg.trim().slice(0,60) }, created_at:new Date().toISOString() })
      } catch {}
      setTaskMsg('')
      alert('Sent to the office.')
    } catch (e) { alert('Could not send: ' + (e.message||e)) }
    setSendingTask(false)
  }

  async function linkToTcDeal(tcDealId) {
    try {
      const { error } = await supabase.from('tc_deals').update({ linked_listing_id: listing.id }).eq('id', tcDealId)
      if (error) throw error
      // Back-sync seller (mirrors LinkListingControl.jsx's linkTo -- same
      // write pattern, kept local here rather than importing from the
      // TC Board's file).
      try {
        const { data: parts } = await supabase.from('tc_participants').select('contact_id').eq('tc_deal_id', tcDealId).eq('role','seller')
        const sellerIds = [...new Set((parts||[]).map(p=>p.contact_id).filter(Boolean))]
        for (let i=0;i<sellerIds.length;i++) {
          const cid = sellerIds[i], isFirst = i===0
          await supabase.from('listing_contacts').upsert({ listing_id:listing.id, contact_id:cid, role:'seller', primary_contact:isFirst }, { onConflict:'listing_id,contact_id' })
          if (isFirst) await supabase.from('listings').update({ seller_contact_id: cid }).eq('id', listing.id)
        }
      } catch {}
      try {
        await supabase.from('audit_log').insert({ agent_id: agent?.id||listing.agent_id, table_name:'listings', record_id:listing.id, action:'linked', field_name:'TC File', metadata:{ description:'Linked to TC Board file' }, created_at:new Date().toISOString() })
      } catch {}
      setConnected(c => ({ ...c, tcDeal:{ id:tcDealId } }))
      setMatchCandidates([])
    } catch (e) { alert('Could not link: ' + (e.message||e)) }
  }

  // Contacts / Parties (read-only): if a TC file is linked, read its
  // tc_participants (same table/roles TCBoardPanels.jsx's TCParties uses)
  // joined to contacts for display names. Never creates or edits a
  // participant from here -- view only, matching 'do not touch TC Board'.
  useEffect(() => {
    if (tab !== 'parties' || !connected) return
    let alive = true
    ;(async () => {
      if (!connected.tcDeal?.id) { if (alive) setParties({}); return }
      try {
        const { data: rows } = await supabase.from('tc_participants')
          .select('role, contact_id').eq('tc_deal_id', connected.tcDeal.id)
        const ids = [...new Set((rows||[]).map(r=>r.contact_id).filter(Boolean))]
        let contactsById = {}
        if (ids.length) {
          const { data: cs } = await supabase.from('contacts').select('id,first_name,last_name,email,phone').in('id', ids)
          ;(cs||[]).forEach(c => { contactsById[c.id] = c })
        }
        const byRole = {}
        ;(rows||[]).forEach(r => { if (r.contact_id && contactsById[r.contact_id]) byRole[r.role] = contactsById[r.contact_id] })
        if (alive) setParties(byRole)
      } catch { if (alive) setParties({}) }
    })()
    return () => { alive = false }
  }, [tab, connected, listing.id])

  async function saveField(key, value, label) {
    setSaving(key)
    try {
      const { error } = await supabase.from('listings').update({ [key]: value, updated_at: new Date().toISOString() }).eq('id', listing.id)
      if (error) throw error
      onSaved?.({ ...listing, [key]: value })
    } catch (e) { alert('Could not save ' + (label||key) + ': ' + (e.message||e)) }
    setSaving('')
  }
  async function savePrice() {
    const newPrice = parseFloat(String(price).replace(/[$,]/g,''))
    if (!newPrice) { alert('Enter a valid price'); return }
    setSaving('price')
    try {
      const oldPrice = listing.list_price
      // Append to price_history jsonb (existing column)
      const existingPH = Array.isArray(listing.price_history) ? listing.price_history : []
      const phEntry = { old_price: oldPrice ?? null, new_price: newPrice, date: new Date().toISOString().slice(0,10), by: agent?.name || null }
      const newPH = [...existingPH, phEntry]
      const { error } = await supabase.from('listings').update({ list_price:newPrice, price_history:newPH, updated_at:new Date().toISOString() }).eq('id', listing.id)
      if (error) throw error
      try {
        await supabase.from('audit_log').insert({ agent_id:agent?.id||listing.agent_id, table_name:'listings', record_id:listing.id,
          action:'updated', field_name:'list_price', old_value:String(oldPrice), new_value:String(newPrice),
          metadata:{ description:'Price changed from '+fmt$(oldPrice)+' to '+fmt$(newPrice) }, created_at:new Date().toISOString() })
      } catch {}
      try {
        const r = await supabase.from('tc_deals').select('id').eq('linked_listing_id', listing.id).maybeSingle()
        if (r.data?.id) await supabase.from('tc_deals').update({ list_price:newPrice, updated_at:new Date().toISOString() }).eq('id', r.data.id)
      } catch {}
      onSaved?.({ ...listing, list_price:newPrice, price_history:newPH })
      if (tab === 'price') loadAdminLog()   // refresh merged view
    } catch (e) { alert('Could not save price: ' + (e.message||e)) }
    setSaving('')
  }
  async function updateShowing(id, patch) {
    try {
      const { error } = await supabase.from('listing_showings').update(patch).eq('id', id)
      if (error) throw error
      onSaved?.(listing, { showingId:id, patch })
      try {
        await supabase.from('audit_log').insert({
          agent_id: agent?.id || listing.agent_id, table_name:'listings', record_id:listing.id,
          action:'showing_updated', field_name:'Showing',
          metadata:{ description:'Showing feedback/details updated' }, created_at:new Date().toISOString(),
        })
      } catch {}
    } catch (e) { alert('Could not update showing: ' + (e.message||e)) }
  }

  const d = dom(listing)
  const sc = STATUS_COLORS[status] || '#94A3B8'
  const avgInterest = showings.length ? (showings.reduce((s,x)=>s+(x.interest_level||3),0)/showings.length).toFixed(1) : null
  const ph = Array.isArray(listing.price_history) ? listing.price_history : []
  const sellerOverdue = !listing.seller_updated_at || (Date.now() - new Date(listing.seller_updated_at).getTime() > 7*86400000)

  // "Since last seller update" -- real data filtered by seller_updated_at,
  // falls back to "since listing" if never updated. Feeds the Seller Report.
  const sinceUpdateCutoff = listing.seller_updated_at ? new Date(listing.seller_updated_at).getTime() : null
  const sinceLabel = listing.seller_updated_at ? 'since last update (' + fmtDate(listing.seller_updated_at) + ')' : 'since listing'
  const showingsSinceUpdate = showings.filter(s => !sinceUpdateCutoff || (s.showing_date && new Date(s.showing_date).getTime() > sinceUpdateCutoff))
  const openHousesSinceUpdate = openHouses.filter(oh => !sinceUpdateCutoff || (oh.date && new Date(oh.date).getTime() > sinceUpdateCutoff))
  const priceChangesSinceUpdate = ph.filter(p => !sinceUpdateCutoff || (p.date && new Date(p.date).getTime() > sinceUpdateCutoff))

  // Days at current price (from the most recent price_history entry, else
  // from the list date) -- derived from existing data, no new column.
  const daysAtCurrentPrice = (() => {
    const lastChange = ph.length ? ph[ph.length-1] : null
    const since = lastChange?.date || listing.listed_date || listing.list_date
    return since ? Math.floor((Date.now() - new Date(since).getTime()) / 86400000) : null
  })()

  // Derive common feedback themes + buyer breakdown from the shared engine
  // (src/lib/feedbackThemes.js) -- same source used by the My Listings row
  // and the Seller Report, so counts can never drift between surfaces.
  const themeSummary = buildThemeSummary(showings)
  // Objections = themes minus the positive/momentum ones, kept as
  // [id, count] tuples so existing 'price' checks below still work.
  const objections = themeSummary.filter(t => !['positive','second_showing','offer_coming'].includes(t.id)).map(t => [t.id, t.count]).slice(0,5)
  const buyerStats = buildBuyerStats(showings)


  // Needs-attention items -- computed once, used by both the header's Key
  // Alerts badge and the Tasks/Next Action tab's detailed list.
  const needsAttentionItems = (() => {
    const items = []
    if (sellerOverdue && (status==='Active'||status==='Coming Soon')) items.push(['⚠️','Seller update overdue','#DC2626'])
    if (showings.length===0 && status==='Active') items.push(['👀','No showings logged yet','#B45309'])
    if (d!=null && d>60 && status==='Active') items.push(['📅','On market 60+ days ('+d+')','#B45309'])
    if (!listing.seller_contact_id) items.push(['🧑','Missing primary seller contact','#B45309'])
    if (objections.some(([w])=>w==='price') && showings.length>=3) items.push(['💰','Price is a recurring objection','#2563EB'])
    if (mktTasks && mktTasks.some(t=>t.status!=='done')) items.push(['📣','Marketing tasks still open on TC file','#B45309'])
    return items
  })()

  // Recommended next action (from existing data)
  const recommendation = (() => {
    if (sellerOverdue && (status==='Active'||status==='Coming Soon')) return 'Seller update is overdue — send a status update to the seller.'
    if (showings.length===0 && status==='Active') return 'No showings yet — review pricing and marketing exposure.'
    if (avgInterest && +avgInterest < 2.5 && showings.length>=3) return 'Interest is low across several showings — consider a price adjustment or addressing common objections.'
    if (objections.some(([w])=>w==='price') && showings.length>=3) return 'Price is a recurring objection — discuss a price adjustment with the seller.'
    if (d!=null && d>60 && status==='Active') return 'On market 60+ days — refresh marketing and reassess price with the seller.'
    return 'On track — keep the seller informed with the latest showing feedback.'
  })()

  // group showings by agent who showed
  const agentName = () => agent?.name
  const groups = {}
  showings.forEach(s => { const k = s.agent_name || agentName() || 'Unknown agent'; (groups[k]=groups[k]||[]).push(s) })

  // Build the plain-text seller report used by the Copy button
  function buildReportText() {
    const lines = []
    lines.push(listing.addr + ([listing.city, listing.state].filter(Boolean).join(', ') ? ', ' + [listing.city, listing.state].filter(Boolean).join(', ') : ''))
    lines.push('Status: ' + status + '  ·  List Price: ' + fmt$(listing.list_price))
    lines.push('')
    lines.push('WHAT HAPPENED ' + sinceLabel.toUpperCase())
    lines.push('- ' + showingsSinceUpdate.length + ' new showing' + (showingsSinceUpdate.length!==1?'s':''))
    lines.push('- ' + openHousesSinceUpdate.length + ' new open house' + (openHousesSinceUpdate.length!==1?'s':''))
    lines.push('- ' + priceChangesSinceUpdate.length + ' price change' + (priceChangesSinceUpdate.length!==1?'s':''))
    lines.push('')
    lines.push('OVERALL SNAPSHOT')
    lines.push('- ' + showings.length + ' showings' + (avgInterest ? ' · average interest ' + avgInterest + '/5' : ''))
    lines.push('- ' + openHouses.length + ' open houses')
    lines.push('- Feedback captured on ' + showings.filter(s=>s.feedback).length + ' of ' + showings.length + ' showings')
    lines.push('- Unique buyers: ' + buyerStats.uniqueBuyers + '  ·  Interested: ' + buyerStats.interested + '  ·  Neutral: ' + buyerStats.neutral + '  ·  Not interested: ' + buyerStats.notInterested)
    if (listing.original_price && listing.list_price && listing.original_price !== listing.list_price) {
      lines.push('- Price moved ' + fmt$(listing.original_price) + ' → ' + fmt$(listing.list_price) + ' (' + ph.length + ' change' + (ph.length!==1?'s':'') + ')')
    }
    lines.push('- Marketing: ' + (mktStatus || 'not set'))
    const positives = themeSummary.filter(t => t.id === 'positive')
    if (objections.length) {
      lines.push('')
      lines.push('MAIN OBJECTIONS')
      objections.forEach(([id,count]) => lines.push('- ' + themeLabel(id) + ' (' + count + ')'))
    }
    if (positives.length) {
      lines.push('')
      lines.push('POSITIVE FEEDBACK')
      positives.forEach(t => lines.push('- ' + t.label + ' (' + t.count + ')'))
    }
    const feedbackLines = showings.filter(s=>s.feedback).slice(0,6)
    if (feedbackLines.length) {
      lines.push('')
      lines.push('RECENT BUYER FEEDBACK')
      feedbackLines.forEach(s => lines.push('- "' + s.feedback + '" — ' + (s.buyer_name||'buyer') + (s.interest_level?' (' + s.interest_level + '/5)':'')))
    }
    lines.push('')
    lines.push('RECOMMENDED NEXT STEP')
    lines.push('- ' + recommendation)
    return lines.join('\n')
  }
  async function copyReport() {
    try {
      await navigator.clipboard.writeText(buildReportText())
      setCopyLabel('Copied!')
      setTimeout(() => setCopyLabel('Copy Seller Report'), 1800)
    } catch (e) { console.warn('clipboard failed:', e.message) }
  }


  const card = { background:'var(--dim)', borderRadius:8, padding:'10px 12px' }
  const cLabel = { fontSize:10.5, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:4 }
  const inp = { padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }
  const saveBtn = k => ({ padding:'7px 12px', borderRadius:8, border:'none', background:'var(--brand)', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff, opacity: saving===k?0.6:1 })
  const sectionTitle = { fontSize:11, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:8 }

  const statTile = (label, value, sub, color, goTab) => (
    <button onClick={goTab ? ()=>setTab(goTab) : undefined}
      onMouseEnter={goTab ? e=>{ e.currentTarget.style.boxShadow='0 4px 14px rgba(0,0,0,.1)'; e.currentTarget.style.transform='translateY(-1px)' } : undefined}
      onMouseLeave={goTab ? e=>{ e.currentTarget.style.boxShadow='none'; e.currentTarget.style.transform='none' } : undefined}
      style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px', minWidth:0,
        cursor: goTab?'pointer':'default', textAlign:'left', fontFamily:ff, transition:'box-shadow .15s, transform .15s' }}>
      <div style={{ fontSize:22, fontWeight:900, color: color||'var(--text)', lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:10.5, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em', marginTop:5 }}>{label}{goTab && <span style={{ opacity:.5 }}> ›</span>}</div>
      {sub && <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{sub}</div>}
    </button>
  )

  return (
    <>
    {/* Full-screen breakout: escape Layout's 1400px padded container */}
    <div style={{ fontFamily:ff, position:'relative', left:'50%', right:'50%', marginLeft:'-50vw', marginRight:'-50vw', width:'100vw', minHeight:'100vh', marginTop:-28, background:'var(--bg)' }}>

      {/* ══ FULL PROPERTY HEADER ══ */}
      <div style={{ background:'linear-gradient(180deg, var(--panel), var(--bg))', borderBottom:'1px solid var(--border)', borderTop:'4px solid '+sc }}>
        <div style={{ maxWidth:1440, margin:'0 auto', padding:'16px 28px 20px' }}>
          <button onClick={onBack} style={{ display:'inline-flex', alignItems:'center', gap:6, marginBottom:14, padding:'7px 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--panel)', color:'var(--text)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:ff }}>← Back to My Listings</button>

          <div style={{ display:'flex', gap:20, flexWrap:'wrap', alignItems:'flex-start' }}>
            {/* Property photo / placeholder */}
            <div style={{ width:140, height:104, borderRadius:12, overflow:'hidden', flexShrink:0, background:'var(--dim)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              {listing.photo_url
                ? <img src={listing.photo_url} alt="listing" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e=>{e.target.style.display='none'; e.target.parentNode.innerHTML='<span style=font-size:32px>🏡</span>'}} />
                : <span style={{ fontSize:32 }}>🏡</span>}
            </div>

            {/* Address + meta */}
            <div style={{ flex:1, minWidth:240 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                <span style={{ fontSize:26, fontWeight:900, color:'var(--text)', letterSpacing:'-.01em' }}>{listing.addr || '—'}</span>
                <span style={{ fontSize:12, fontWeight:800, color:'#fff', background:sc, padding:'3px 12px', borderRadius:99 }}>{status}</span>
              </div>
              <div style={{ fontSize:13.5, color:'var(--muted)', marginTop:5 }}>
                {[listing.city, listing.state, listing.zip].filter(Boolean).join(', ') || listing.city || ''}
              </div>
              <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginTop:8, fontSize:12.5, color:'var(--muted)' }}>
                {d!=null && <span>DOM <strong style={{ color:'var(--text)' }}>{d}</strong></span>}
                {listing.mls_number && <span>MLS <strong style={{ color:'var(--text)' }}>{listing.mls_number}</strong></span>}
                {listing.source && <span>Source <strong style={{ color:'var(--text)' }}>{listing.source}</strong></span>}
                {listing.mls_link && <a href={listing.mls_link} target="_blank" rel="noreferrer" style={{ color:'#3B82F6', fontWeight:700, textDecoration:'none' }}>MLS link ↗</a>}
              </div>
            </div>

            {/* Price + agent */}
            <div style={{ textAlign:'right', minWidth:180 }}>
              <div style={{ fontSize:24, fontWeight:900, color:'var(--text)' }}>{listing.list_price?fmt$(listing.list_price):'—'}</div>
              {listing.original_price && listing.original_price!==listing.list_price && <div style={{ fontSize:12, color:'var(--muted)', textDecoration:'line-through' }}>{fmt$(listing.original_price)}</div>}
              <div style={{ display:'flex', gap:8, alignItems:'center', justifyContent:'flex-end', marginTop:10 }}>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{agent?.name || '—'}</div>
                  <div style={{ fontSize:10.5, color:'var(--muted)' }}>Primary agent</div>
                </div>
                {agent && <Avatar agent={agent} size={38} />}
              </div>
            </div>
          </div>

          {/* Quick actions + clickable stat cards */}
          <div style={{ display:'flex', gap:8, marginTop:16, flexWrap:'wrap' }}>
            <button onClick={()=>onLogShowing?.(listing)} style={{ padding:'8px 14px', borderRadius:9, border:'1px solid var(--brand)', background:'rgba(204,34,0,.06)', color:'var(--brand)', fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:ff }}>👀 Add showing</button>
            <button onClick={()=>onScheduleOH?.(listing)} style={{ padding:'8px 14px', borderRadius:9, border:'1px solid #3B82F6', background:'rgba(59,130,246,.06)', color:'#3B82F6', fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:ff }}>📅 Open house</button>
          </div>
          <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginTop:14, alignItems:'center' }}>
            {needsAttentionItems.length>0 ? (
              <button onClick={()=>setTab('tasks')} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:99, border:'1px solid rgba(220,38,38,.35)', background:'rgba(220,38,38,.08)', color:'#DC2626', fontSize:12, fontWeight:800, cursor:'pointer', fontFamily:ff }}>
                ⚠️ {needsAttentionItems.length} key alert{needsAttentionItems.length!==1?'s':''}
              </button>
            ) : (
              <span style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:99, border:'1px solid rgba(11,122,69,.3)', background:'rgba(11,122,69,.08)', color:'#0B7A45', fontSize:12, fontWeight:800 }}>✅ All caught up</span>
            )}
            {buyerStats.total>0 && (
              <span style={{ fontSize:12.5, color:'var(--muted)' }}>
                👍 {buyerStats.interested} interested · 🤔 {buyerStats.neutral} neutral · 👎 {buyerStats.notInterested} not interested
              </span>
            )}
            {listing.original_price && listing.list_price && listing.original_price!==listing.list_price && (
              <span style={{ fontSize:12.5, color:'var(--muted)' }}>Price moved {fmt$(listing.original_price)} → {fmt$(listing.list_price)}</span>
            )}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:10, marginTop:14 }}>
            {statTile('Showings', showings.length, avgInterest?'avg '+avgInterest+'/5':null, '#8B5CF6', 'feedback')}
            {statTile('Open houses', openHouses.length, null, '#3B82F6', 'feedback')}
            {statTile('Price', listing.list_price?fmt$(listing.list_price):'—', null, null, 'price')}
            {statTile('Price changes', ph.length, null, null, 'price')}
            {statTile('Marketing', mktStatus||'not set', null, null, 'marketing')}
            {statTile('Last seller update', listing.seller_updated_at?fmtDate(listing.seller_updated_at):'never', sellerOverdue?'overdue':null, listing.seller_updated_at&&!sellerOverdue?'var(--text)':'#DC2626', 'report')}
          </div>
        </div>
      </div>

      {/* ══ 3-COLUMN WORKSPACE ══ */}
      <div style={{ maxWidth:1440, margin:'0 auto', padding:'20px 28px 48px', display:'grid', gridTemplateColumns:'260px 1fr 260px', gap:20, alignItems:'start' }}>

        {/* LEFT: Connected Records / Seller Contacts / Documents */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
            <div style={sectionTitle}>Connected Records</div>
            {connected === null ? (
              <div style={{ fontSize:12, color:'var(--muted)' }}>Checking…</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <div>
                  <div style={cLabel}>Internal listing ID</div>
                  <div style={{ fontSize:11, color:'var(--muted)', fontFamily:'monospace' }} title={listing.id}>{listing.id.slice(0,8)}…</div>
                </div>
                {listing.mls_number && (
                  <div><div style={cLabel}>MLS #</div><div style={{ fontSize:12.5, fontWeight:700 }}>{listing.mls_number}</div></div>
                )}
                <div>
                  <div style={cLabel}>TC Board file</div>
                  {connected.tcDeal ? (
                    <div style={{ fontSize:12.5, fontWeight:700, color:'#0B7A45' }}>✓ Linked{connected.tcDeal.tc_phase ? ' · ' + connected.tcDeal.tc_phase : ''}</div>
                  ) : matchCandidates && matchCandidates.length > 0 ? (
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:'#B45309', marginBottom:6 }}>Possible match found</div>
                      {matchCandidates.map(m => (
                        <div key={m.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6, padding:'6px 8px', background:'var(--dim)', borderRadius:8, marginBottom:4 }}>
                          <span style={{ fontSize:11.5 }}>{m.addr}{m.tc_phase?' · '+m.tc_phase:''}</span>
                          <button onClick={()=>linkToTcDeal(m.id)} style={{ padding:'3px 10px', borderRadius:6, border:'none', background:'var(--brand)', color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:ff, flexShrink:0 }}>Link</button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize:12, color:'#B45309', fontWeight:600 }}>Not linked yet</div>
                  )}
                </div>
                <div>
                  <div style={cLabel}>Production deal</div>
                  {connected.productionDeal ? (
                    <div style={{ fontSize:12.5, fontWeight:700, color:'#0B7A45' }}>✓ Linked{connected.productionDeal.stage ? ' · ' + connected.productionDeal.stage : ''}</div>
                  ) : (
                    <div style={{ fontSize:12, color:'var(--muted)' }}>Not linked yet</div>
                  )}
                </div>
                <BoardLinks listingId={listing.id} />
                {!connected.tcDeal && matchCandidates && matchCandidates.length === 0 && (
                  <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
                    No likely TC file match found by address{!canManage ? ' among your own TC files' : ''}. Matching is address-token-based today (case/typo-tolerant, not unit-aware yet) — the drafted Phase 1 normalized-address work would make this more precise.
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
            <SellerContacts listingId={listing.id} listingAgentId={listing.agent_id} />
          </div>
          {listing.photo_url && (
            <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
              <div style={sectionTitle}>Photo</div>
              <a href={listing.photo_url} target="_blank" rel="noreferrer" style={{ color:'#3B82F6', fontWeight:700, fontSize:12.5, textDecoration:'none' }}>Open primary photo ↗</a>
            </div>
          )}
          <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
            <div style={sectionTitle}>Documents — setup needed</div>
            <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.6, marginBottom:8 }}>
              No document storage exists yet for listing agreements, disclosures, brochures, floor plans, ad proofs, or other files.
            </div>
            <div style={{ fontSize:11, color:'var(--muted)' }}>
              Would need: a <code>listing_documents</code> table (listing_id, doc_type, file_url, uploaded_by, uploaded_at) + a storage bucket. Proposal only — not built, not run.
            </div>
          </div>
        </div>


        {/* CENTER: tabs + working area */}
        <div style={{ minWidth:0 }}>
          <div style={{ display:'flex', gap:2, borderBottom:'1px solid var(--border)', marginBottom:18, overflowX:'auto' }}>
            {ALL_TABS.filter(t => !t.adminOnly || canViewAdminLog).map(t => (
              <button key={t.id} onClick={()=>setTab(t.id)}
                style={{ padding:'10px 15px', border:'none', borderBottom: tab===t.id?'2px solid var(--brand)':'2px solid transparent',
                  background:'transparent', color: tab===t.id?'var(--brand)':'var(--muted)', fontSize:13, fontWeight: tab===t.id?800:600,
                  cursor:'pointer', fontFamily:ff, whiteSpace:'nowrap', marginBottom:-1 }}>{t.label}</button>
            ))}
          </div>

          {/* TASKS / NEXT ACTION (default) */}
          {tab==='tasks' && (
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 16px', borderRadius:12, marginBottom:16,
                background: sellerOverdue ? 'rgba(220,38,38,.06)' : 'rgba(11,122,69,.05)',
                border:'1px solid '+(sellerOverdue?'rgba(220,38,38,.25)':'rgba(11,122,69,.2)') }}>
                <span style={{ fontSize:22 }}>{sellerOverdue?'⚠️':'✅'}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:10.5, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.04em' }}>Next action</div>
                  <div style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>{recommendation}</div>
                </div>
                <button onClick={()=>setTab('report')} style={{ padding:'8px 14px', borderRadius:8, border:'1px solid var(--brand)', background:'var(--panel)', color:'var(--brand)', fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:ff, whiteSpace:'nowrap' }}>Seller Report →</button>
              </div>

              <div style={sectionTitle}>Needs attention</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {needsAttentionItems.length===0 ? (
                  <div style={{ padding:16, textAlign:'center', color:'var(--muted)', fontSize:13, background:'var(--dim)', borderRadius:10 }}>✅ Nothing needs attention right now.</div>
                ) : needsAttentionItems.map((it,i)=>(
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'var(--panel)', border:'1px solid var(--border)', borderLeft:'3px solid '+it[2], borderRadius:10 }}>
                    <span style={{ fontSize:16 }}>{it[0]}</span>
                    <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{it[1]}</span>
                  </div>
                ))}
              </div>

              {/* Open TC/listing tasks (read-only marketing-ish already loaded on marketing tab) */}
              <div style={{ marginTop:18 }}>
                <div style={sectionTitle}>Snapshot</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:10 }}>
                  <div style={card}><div style={cLabel}>Showings</div><div style={{ fontSize:15, fontWeight:800 }}>{showings.length}{avgInterest?' · '+avgInterest:''}</div></div>
                  <div style={card}><div style={cLabel}>Open houses</div><div style={{ fontSize:15, fontWeight:800 }}>{openHouses.length}</div></div>
                  <div style={card}><div style={cLabel}>DOM</div><div style={{ fontSize:15, fontWeight:800 }}>{d!=null?d:'—'}</div></div>
                  <div style={card}><div style={cLabel}>Price changes</div><div style={{ fontSize:15, fontWeight:800 }}>{ph.length}</div></div>
                </div>
              </div>

              {/* Inline status/price quick edit */}
              <div style={{ marginTop:18, display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12 }}>
                <div style={card}>
                  <div style={cLabel}>Status</div>
                  <select value={status} onChange={e=>{ setStatus(e.target.value); saveField('status', e.target.value, 'status') }} style={{ ...inp, width:'100%' }}>
                    {LISTING_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div style={card}>
                  <div style={cLabel}>Price</div>
                  <div style={{ display:'flex', gap:6 }}>
                    <input value={price} onChange={e=>setPrice(e.target.value)} placeholder="$0" style={{ ...inp, flex:1 }} />
                    <button onClick={savePrice} style={saveBtn('price')}>Save</button>
                  </div>
                </div>
              </div>

              {/* Send task/message to secretary/admin — real tasks table
                  write. NOTE: tasks has no listing_id column, so the tie
                  to this listing is via the title/notes text, not a real
                  foreign key -- flagged rather than treated as a clean
                  link. A future tasks.listing_id column would make this
                  filterable per listing. */}
              <div style={{ marginTop:18, padding:'14px 16px', background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12 }}>
                <div style={sectionTitle}>Send to Secretary / Admin</div>
                <div style={{ display:'flex', gap:8, marginBottom:8, flexWrap:'wrap' }}>
                  <select value={taskAssignee} onChange={e=>setTaskAssignee(e.target.value)} style={{ ...inp, minWidth:160 }}>
                    {secretaries.length===0 && <option value="">No secretary/admin found</option>}
                    {secretaries.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <input value={taskMsg} onChange={e=>setTaskMsg(e.target.value)} placeholder={'Message about ' + listing.addr + '…'} style={{ ...inp, flex:1, minWidth:200 }} />
                  <button onClick={sendTaskToSecretary} disabled={sendingTask} style={{ padding:'8px 16px', borderRadius:8, border:'none', background:'var(--brand)', color:'#fff', fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:ff, opacity:sendingTask?0.6:1 }}>{sendingTask?'Sending…':'Send'}</button>
                </div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>Creates a task assigned to them, tagged with this address. (No listing-level link column exists yet — this ties them via the task text, not a formal connection.)</div>
              </div>
            </div>
          )}

      {tab==='feedback' && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
            <div style={{ fontSize:14 }}><strong>{showings.length}</strong> showings{avgInterest?<> · avg interest <strong style={{ color:interestColor(+avgInterest) }}>{avgInterest}</strong></>:''}</div>
            <button onClick={()=>onLogShowing?.(listing)} style={{ ...inp, cursor:'pointer', color:'var(--brand)', fontWeight:700 }}>+ Add showing</button>
          </div>
          {showings.length>0 && (
            <div style={{ fontSize:12.5, color:'var(--muted)', marginBottom:16 }}>
              Unique buyers: <strong style={{ color:'var(--text)' }}>{buyerStats.uniqueBuyers}</strong> · 👍 {buyerStats.interested} interested · 🤔 {buyerStats.neutral} neutral · 👎 {buyerStats.notInterested} not interested{buyerStats.noFeedback>0?' · '+buyerStats.noFeedback+' no feedback':''}
            </div>
          )}
          {showings.length>0 && (() => {
            const sentences = buildSummarySentences(themeSummary, buyerStats)
            return (
              <div style={{ background:'rgba(139,92,246,.06)', border:'1px solid rgba(139,92,246,.25)', borderRadius:10, padding:'12px 14px', marginBottom:16 }}>
                <div style={{ fontSize:10.5, fontWeight:800, color:'#8B5CF6', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:6 }}>Summary <span style={{ fontWeight:400, textTransform:'none' }}>— based on feedback notes</span></div>
                {sentences.map((s,i) => (
                  <div key={i} style={{ fontSize:13, color:'var(--text)', marginBottom:i<sentences.length-1?4:0 }}>• {s}</div>
                ))}
              </div>
            )
          })()}
          {themeSummary.length>0 && (
            <div style={{ marginBottom:18 }}>
              <div style={sectionTitle}>Theme summary <span style={{ fontWeight:400, textTransform:'none', fontSize:10.5 }}>— based on feedback text</span></div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {themeSummary.map(t => <ThemeRow key={t.id} theme={t} />)}
              </div>
            </div>
          )}
          {showings.length===0 ? <div style={{ padding:30, textAlign:'center', color:'var(--muted)' }}>No showings logged yet.</div> :
            Object.entries(groups).sort((a,b)=>b[1].length-a[1].length).map(([name,list])=>(
              <div key={name} style={{ marginBottom:14, border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
                <div style={{ padding:'8px 12px', background:'var(--dim)', fontSize:13, fontWeight:800, display:'flex', justifyContent:'space-between' }}>
                  <span>👤 {name}</span><span style={{ color:'var(--muted)' }}>{list.length} showing{list.length!==1?'s':''}</span>
                </div>
                {list.map(s=>(
                  <ShowingRow key={s.id} showing={s} onUpdate={patch => updateShowing(s.id, patch)} />
                ))}
              </div>
            ))}
          {/* Open houses */}
          <div style={{ marginTop:18 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <div style={sectionTitle}>Open houses ({openHouses.length})</div>
              <button onClick={()=>onScheduleOH?.(listing)} style={{ ...inp, cursor:'pointer', color:'var(--brand)', fontWeight:700 }}>+ Schedule</button>
            </div>
            {openHouses.length===0 ? <div style={{ fontSize:12.5, color:'var(--muted)' }}>No open houses scheduled.</div> :
              openHouses.map(oh=>(
                <div key={oh.id} style={{ display:'flex', justifyContent:'space-between', padding:'8px 10px', background:'var(--dim)', borderRadius:8, marginBottom:6, fontSize:12.5 }}>
                  <span>{oh.date?fmtDate(oh.date):''}{oh.start_time?' · '+oh.start_time:''}{oh.end_time?'–'+oh.end_time:''}</span>
                  {oh.visitors_count>0 && <span style={{ color:'var(--muted)' }}>{oh.visitors_count} visitors</span>}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── SELLER REPORT (seller-ready summary from existing data) ── */}
      {tab==='report' && (
        <div>
          <div style={{ display:'flex', gap:10, alignItems:'flex-end', marginBottom:14, flexWrap:'wrap' }}>
            <div style={{ ...card, flex:1, minWidth:240 }}>
              <div style={cLabel}>Last seller update</div>
              <div style={{ fontSize:15, fontWeight:800, color:listing.seller_updated_at?'var(--text)':'#DC2626' }}>{listing.seller_updated_at?fmtDate(listing.seller_updated_at):'never'}{sellerOverdue?' · overdue':''}</div>
            </div>
            <button onClick={()=>{ const today=new Date().toISOString().slice(0,10); setSellerDate(today); saveField('seller_updated_at', today, 'seller update date') }}
              style={{ padding:'11px 16px', borderRadius:9, border:'none', background:'#0B7A45', color:'#fff', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:ff }}>✓ Mark seller updated (today)</button>
            <button onClick={copyReport}
              style={{ padding:'11px 16px', borderRadius:9, border:'1px solid var(--brand)', background:'var(--panel)', color:'var(--brand)', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:ff }}>{copyLabel}</button>
          </div>

          <div style={sectionTitle}>What happened {sinceLabel}</div>
          <div style={{ fontSize:13, lineHeight:1.9, marginBottom:14 }}>
            <div>• <strong>{showingsSinceUpdate.length}</strong> new showing{showingsSinceUpdate.length!==1?'s':''}</div>
            <div>• <strong>{openHousesSinceUpdate.length}</strong> new open house{openHousesSinceUpdate.length!==1?'s':''}</div>
            <div>• <strong>{priceChangesSinceUpdate.length}</strong> price change{priceChangesSinceUpdate.length!==1?'s':''}</div>
            <div>• Marketing: {mktTasks && mktTasks.length ? mktTasks.filter(t=>t.status==='done').length + ' of ' + mktTasks.length + ' items completed' : (mktStatus || 'not set')}</div>
            {showingsSinceUpdate.length===0 && openHousesSinceUpdate.length===0 && priceChangesSinceUpdate.length===0 && (
              <div style={{ color:'var(--muted)', fontStyle:'italic' }}>Nothing new {sinceLabel} — the report below will be quiet.</div>
            )}
          </div>

          <div style={sectionTitle}>Overall snapshot</div>
          <div style={{ fontSize:13, lineHeight:1.9 }}>
            <div>• <strong>{showings.length}</strong> showings{avgInterest?' · average interest '+avgInterest+'/5':''}</div>
            <div>• <strong>{openHouses.length}</strong> open houses</div>
            <div>• Feedback captured on <strong>{showings.filter(s=>s.feedback).length}</strong> of {showings.length} showings</div>
            {showings.length>0 && <div>• Unique buyers: <strong>{buyerStats.uniqueBuyers}</strong> · 👍 {buyerStats.interested} interested · 🤔 {buyerStats.neutral} neutral · 👎 {buyerStats.notInterested} not interested{buyerStats.noFeedback>0?' · '+buyerStats.noFeedback+' no feedback':''}</div>}
            {listing.original_price&&listing.list_price&&listing.original_price!==listing.list_price && <div>• Price moved {fmt$(listing.original_price)} → {fmt$(listing.list_price)} ({ph.length} change{ph.length!==1?'s':''})</div>}
            <div>• Marketing: {mktStatus || 'not set'}</div>
          </div>

          {objections.length>0 && (
            <div style={{ marginTop:14 }}>
              <div style={cLabel}>Common feedback / objections</div>
              {objections.map(([id,count],i)=>(
                <span key={i} style={{ display:'inline-block', fontSize:12, fontWeight:700, color:'#B45309', background:'rgba(245,166,35,.14)', padding:'3px 10px', borderRadius:99, marginRight:6, marginTop:6 }}>{themeLabel(id)} ({count})</span>
              ))}
            </div>
          )}

          {showings.filter(s=>s.feedback).length>0 && (
            <div style={{ marginTop:14 }}>
              <div style={cLabel}>Recent buyer feedback</div>
              {showings.filter(s=>s.feedback).slice(0,6).map(s=>(
                <div key={s.id} style={{ fontSize:12.5, color:'var(--muted)', marginTop:4 }}>"{s.feedback}" — {s.buyer_name||'buyer'}{s.interest_level?' ('+s.interest_level+'/5)':''}</div>
              ))}
            </div>
          )}

          <div style={{ marginTop:16, padding:'12px 14px', background:'rgba(11,122,69,.06)', border:'1px solid rgba(11,122,69,.25)', borderRadius:10 }}>
            <div style={cLabel}>Recommended next action</div>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{recommendation}</div>
          </div>
        </div>
      )}

      {/* ── MARKETING (real listing data + linked TC tasks, read-only) ── */}
      {tab==='marketing' && (
        <div>
          <div style={{ ...card, maxWidth:420 }}>
            <div style={cLabel}>Marketing status</div>
            <div style={{ display:'flex', gap:6 }}>
              <input value={mktStatus} onChange={e=>setMktStatus(e.target.value)} placeholder="e.g. Photos done, MLS live" style={{ ...inp, flex:1 }} />
              <button onClick={()=>saveField('marketing_status', mktStatus||null, 'marketing status')} style={saveBtn('marketing_status')}>Save</button>
            </div>
          </div>
          {listing.photo_url && <div style={{ marginTop:14 }}><div style={sectionTitle}>Primary photo</div><img src={listing.photo_url} alt="listing" style={{ maxWidth:'100%', borderRadius:10, border:'1px solid var(--border)' }} onError={e=>{e.target.style.display='none'}} /></div>}

          {/* Marketing progress from linked TC deal (read-only) */}
          <div style={{ marginTop:16 }}>
            <div style={sectionTitle}>Marketing progress (from TC file)</div>
            {mktTasks === null ? (
              <div style={{ fontSize:12.5, color:'var(--muted)' }}>Loading…</div>
            ) : mktTasks.length === 0 ? (
              <div style={{ fontSize:12.5, color:'var(--muted)' }}>No linked TC file with marketing tasks. Marketing tasks are managed by the office on the TC Board.</div>
            ) : (
              <div>
                {(() => {
                  const done = mktTasks.filter(t=>t.status==='done')
                  const pending = mktTasks.filter(t=>t.status!=='done')
                  const pct = mktTasks.length ? Math.round(done.length/mktTasks.length*100) : 0
                  return (
                    <>
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                        <div style={{ flex:1, height:8, borderRadius:99, background:'var(--dim)', overflow:'hidden' }}>
                          <div style={{ width:pct+'%', height:'100%', background:'#0B7A45', borderRadius:99 }} />
                        </div>
                        <div style={{ fontSize:12.5, fontWeight:800, color:'var(--text)', whiteSpace:'nowrap' }}>{pct}% · {done.length}/{mktTasks.length} done</div>
                      </div>
                      {pending.length>0 && (
                        <div style={{ marginBottom:10 }}>
                          <div style={{ fontSize:10.5, fontWeight:800, color:'#B45309', textTransform:'uppercase', marginBottom:4 }}>Pending ({pending.length})</div>
                          {pending.map(t=>(
                            <div key={t.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 10px', background:'var(--dim)', borderRadius:8, marginBottom:6 }}>
                              <span style={{ fontSize:14 }}>⬜</span>
                              <span style={{ flex:1, fontSize:12.5, color:'var(--text)' }}>{t.title}</span>
                              {t.due_date && <span style={{ fontSize:11, color:'var(--muted)' }}>{fmtDate(t.due_date)}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      {done.length>0 && (
                        <div>
                          <div style={{ fontSize:10.5, fontWeight:800, color:'#0B7A45', textTransform:'uppercase', marginBottom:4 }}>Completed ({done.length})</div>
                          {done.map(t=>(
                            <div key={t.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 10px', background:'var(--dim)', borderRadius:8, marginBottom:6 }}>
                              <span style={{ fontSize:14 }}>✅</span>
                              <span style={{ flex:1, fontSize:12.5, color:'var(--text)', textDecoration:'line-through' }}>{t.title}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )
                })()}
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>Read-only — managed by the office on the TC Board.</div>
              </div>
            )}
          </div>

          <div style={{ marginTop:14, padding:'12px 14px', background:'rgba(120,53,15,.05)', border:'1px solid rgba(120,53,15,.2)', borderRadius:10, fontSize:12.5 }}>
            <div style={{ fontWeight:700, marginBottom:2 }}>💵 Marketing cost — admin-only, future</div>
            Estimated / actual cost tracking needs a dedicated marketing table (proposed, not built — see Phase 3). Not shown here because no reliable cost data exists yet; this section will not display a fake number.
          </div>
          <div style={{ marginTop:10, padding:'12px 14px', background:'rgba(59,130,246,.06)', border:'1px solid rgba(59,130,246,.25)', borderRadius:10, fontSize:12.5 }}>
            📣 A structured marketing checklist with files (drone, floor plans, brochure proofs, publication dates) will be added in a later phase.
          </div>
          <div style={{ marginTop:10, padding:'12px 14px', background:'var(--dim)', borderRadius:10, fontSize:12 }}>
            <div style={{ fontWeight:700, marginBottom:4 }}>Materials storage — setup needed</div>
            <div style={{ color:'var(--muted)', lineHeight:1.6 }}>Photos, video, drone, brochure, flyers, print ads, social posts, WhatsApp images, email blasts, and publication ads all need a storage location and a <code>listing_marketing</code> table (type, file_url, publication, ad_date, cost, completed_by) to track "ads placed by week" and spend. Not built — proposed in Phase 3, not run.</div>
          </div>
        </div>
      )}

      {/* ── PRICE HISTORY ── */}
      {/* ── PRICE & ACTIVITY ── */}
      {tab==='price' && (
        <div>
          <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' }}>
            <div style={{ ...card, flex:1, minWidth:120 }}><div style={cLabel}>Original</div><div style={{ fontSize:16, fontWeight:800 }}>{listing.original_price?fmt$(listing.original_price):'—'}</div></div>
            <div style={{ ...card, flex:1, minWidth:120 }}><div style={cLabel}>Current</div><div style={{ fontSize:16, fontWeight:800 }}>{listing.list_price?fmt$(listing.list_price):'—'}</div></div>
            <div style={{ ...card, flex:1, minWidth:120 }}><div style={cLabel}>Changes</div><div style={{ fontSize:16, fontWeight:800 }}>{ph.length}</div></div>
            {daysAtCurrentPrice!=null && <div style={{ ...card, flex:1, minWidth:120 }}><div style={cLabel}>Days at current price</div><div style={{ fontSize:16, fontWeight:800 }}>{daysAtCurrentPrice}</div></div>}
          </div>
          {/* Inline price change */}
          <div style={{ ...card, maxWidth:360, marginBottom:16 }}>
            <div style={cLabel}>Change price</div>
            <div style={{ display:'flex', gap:6 }}>
              <input value={price} onChange={e=>setPrice(e.target.value)} placeholder="$0" style={{ ...inp, flex:1 }} />
              <button onClick={savePrice} style={saveBtn('price')}>Save</button>
            </div>
          </div>
          <div style={sectionTitle}>Price history</div>
          {ph.length===0 ? <div style={{ padding:14, color:'var(--muted)', fontSize:12.5 }}>No recorded price changes yet.</div> :
            ph.slice().reverse().map((p,i)=>(
              <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'8px 10px', borderBottom:'1px solid var(--border)', fontSize:12.5 }}>
                <span>{(p.old_price!=null?fmt$(p.old_price):'—')+' → '+(p.new_price!=null?fmt$(p.new_price):(p.price!=null?fmt$(p.price):'—'))}{p.reason?' · '+p.reason:''}{p.by?' · '+p.by:''}</span>
                <span style={{ color:'var(--muted)' }}>{p.date?fmtDate(p.date):(p.changed_at?fmtDate(p.changed_at):'')}</span>
              </div>
            ))}
          {/* Historical price changes from audit_log (merged, so nothing is lost) */}
          {(() => {
            const auditPrices = adminLog.filter(a => (a.field_name||'').toLowerCase().includes('price'))
            if (auditPrices.length === 0) return null
            return (
              <div style={{ marginTop:16 }}>
                <div style={cLabel}>From audit log</div>
                {auditPrices.map((a,i)=>(
                  <div key={a.id||i} style={{ display:'flex', justifyContent:'space-between', padding:'6px 10px', borderBottom:'1px solid var(--border)', fontSize:12, color:'var(--muted)' }}>
                    <span>{a.old_value?fmt$(a.old_value):'—'} → {a.new_value?fmt$(a.new_value):'—'}</span>
                    <span>{a.created_at?fmtDate(a.created_at):''}</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      )}

      {/* ── CONTACTS / PARTIES (read-only; seller from listing_contacts via
           SellerContacts panel, other roles from tc_participants if a TC
           file is linked) ── */}
      {tab==='parties' && (
        <div>
          <div style={sectionTitle}>Seller</div>
          <div style={{ fontSize:12.5, color:'var(--muted)', marginBottom:16 }}>See the Seller Contacts panel on the left.</div>

          <div style={sectionTitle}>Other parties {connected?.tcDeal ? '(from TC file)' : ''}</div>
          {!connected ? (
            <div style={{ fontSize:12.5, color:'var(--muted)' }}>Loading…</div>
          ) : !connected.tcDeal ? (
            <div style={{ fontSize:12.5, color:'var(--muted)' }}>No TC file linked — buyer, attorneys, mortgage, inspector, appraiser, and title are managed on the TC Board once this listing is connected to a file.</div>
          ) : parties===null ? (
            <div style={{ fontSize:12.5, color:'var(--muted)' }}>Loading…</div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:8 }}>
              {CONNECTED_PARTY_ROLES.filter(r=>r.key!=='seller').map(r => {
                const c = parties[r.key]
                return (
                  <div key={r.key} style={card}>
                    <div style={cLabel}>{r.label}</div>
                    {c ? (
                      <div>
                        <div style={{ fontSize:12.5, fontWeight:700 }}>{contactName(c)}</div>
                        {c.phone && <div style={{ fontSize:11, color:'var(--muted)' }}>{c.phone}</div>}
                        {c.email && (
                          <button onClick={()=>setEmailTarget(c)} style={{ marginTop:5, padding:'3px 9px', borderRadius:6, border:'1px solid var(--brand)', background:'transparent', color:'var(--brand)', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:ff }}>✉️ Email</button>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize:12, color:'var(--muted)', fontStyle:'italic' }}>Missing</div>
                    )}
                  </div>
                )
              })}
              <div style={card}><div style={cLabel}>Photographer</div><div style={{ fontSize:12, color:'var(--muted)', fontStyle:'italic' }}>Not tracked yet — no photographer role exists on the TC Board today.</div></div>
            </div>
          )}
        </div>
      )}

      {/* ── NOTES ── */}
      {tab==='notes' && (
        <div>
          <div style={sectionTitle}>Listing notes</div>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={10} placeholder="Add listing notes — anything the team should know about this property…"
            style={{ ...inp, width:'100%', resize:'vertical', boxSizing:'border-box', lineHeight:1.6 }} />
          <button onClick={()=>saveField('notes', notes||null, 'notes')} style={{ ...saveBtn('notes'), marginTop:10 }}>Save notes</button>
        </div>
      )}

      {/* ── AGENT-FACING TIMELINE (same audit_log source as Admin Log, but
           friendly sentences, no raw old/new diff clutter -- visible to
           every agent on their own listing, not gated) ── */}
      {tab==='timeline' && (
        <div>
          <div style={sectionTitle}>Activity timeline</div>
          {logLoading ? <div style={{ padding:20, textAlign:'center', color:'var(--muted)' }}>Loading…</div> :
            adminLog.length===0 ? <div style={{ padding:20, textAlign:'center', color:'var(--muted)' }}>No activity recorded yet.</div> :
            adminLog.map((a,i)=>(
              <div key={a.id||i} style={{ display:'flex', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{ width:6, height:6, borderRadius:99, background:'#0B7A45', marginTop:6, flexShrink:0 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12.5 }}>{a.metadata?.description || (a.field_name||'Updated') + ' changed'}</div>
                  <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>{(a.agents?.name||'')}{a.agents?.name?' · ':''}{a.created_at?new Date(a.created_at).toLocaleString():''}</div>
                </div>
              </div>
            ))}
          <div style={{ marginTop:12, fontSize:11, color:'var(--muted)' }}>Shows status, price, seller-update, marketing, and note changes, plus showings added/edited. Task completions and file uploads aren't logged here yet.</div>
        </div>
      )}

      {/* ── ADMIN LOG (gated; reads audit_log) ── */}
      {tab==='admin' && canViewAdminLog && (
        <div>
          <div style={sectionTitle}>Internal change log</div>
          {logLoading ? <div style={{ padding:20, textAlign:'center', color:'var(--muted)' }}>Loading…</div> :
            adminLog.length===0 ? <div style={{ padding:20, textAlign:'center', color:'var(--muted)' }}>No changes recorded yet.</div> :
            adminLog.map((a,i)=>(
              <div key={a.id||i} style={{ display:'flex', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{ width:6, height:6, borderRadius:99, background:'var(--brand)', marginTop:6, flexShrink:0 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12.5 }}>{a.metadata?.description || ((a.field_name||'Updated')+(a.old_value!=null?': '+a.old_value+' → '+a.new_value:''))}</div>
                  <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>{(a.agents?.name||'')}{a.agents?.name?' · ':''}{a.created_at?new Date(a.created_at).toLocaleString():''}</div>
                </div>
              </div>
            ))}
        </div>
      )}
        </div>

        {/* RIGHT: important dates + counts */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
            <div style={sectionTitle}>Important dates</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div><div style={cLabel}>Date listed</div><div style={{ fontSize:13, fontWeight:700 }}>{(listing.listed_date||listing.list_date)?fmtDate(listing.listed_date||listing.list_date):'—'}</div></div>
              {listing.expiration_date && <div><div style={cLabel}>Expiration</div><div style={{ fontSize:13, fontWeight:700 }}>{fmtDate(listing.expiration_date)}</div></div>}
              {listing.contract_date && <div><div style={cLabel}>Contract date</div><div style={{ fontSize:13, fontWeight:700 }}>{fmtDate(listing.contract_date)}</div></div>}
              {listing.close_date && <div><div style={cLabel}>Expected closing</div><div style={{ fontSize:13, fontWeight:700 }}>{fmtDate(listing.close_date)}</div></div>}
              <div>
                <div style={cLabel}>Last seller update</div>
                <div style={{ fontSize:13, fontWeight:700, color: listing.seller_updated_at&&!sellerOverdue?'var(--text)':'#DC2626' }}>
                  {listing.seller_updated_at?fmtDate(listing.seller_updated_at):'never'}{sellerOverdue?' · overdue':''}
                </div>
              </div>
            </div>
          </div>
          <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
            <div style={sectionTitle}>Listing activity</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {[['Showings',showings.length,'feedback'],['Open houses',openHouses.length,'feedback'],['Price changes',ph.length,'price']].map(([lab,val,go],i)=>(
                <button key={i} onClick={()=>setTab(go)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--dim)', border:'none', borderRadius:8, padding:'8px 10px', cursor:'pointer', fontFamily:ff }}>
                  <span style={{ fontSize:12, color:'var(--muted)', fontWeight:700 }}>{lab}</span>
                  <span style={{ fontSize:14, fontWeight:800, color:'var(--text)' }}>{val} ›</span>
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
    <EmailComposeModal
      open={!!emailTarget}
      onClose={()=>setEmailTarget(null)}
      contact={emailTarget}
      agent={agent}
      toast={(msg)=>{ /* fire-and-forget console fallback; this file has no toast system */ console.log(msg) }}
      initialSubject={emailTarget ? 'Re: ' + listing.addr : ''}
      onSent={async (contact, subject) => {
        try {
          await supabase.from('audit_log').insert({
            agent_id: agent?.id||listing.agent_id, table_name:'listings', record_id:listing.id,
            action:'email_sent', field_name:'Email',
            metadata:{ description:'Email sent to ' + (contact?.first_name||contact?.email||'contact') + ': ' + subject },
            created_at:new Date().toISOString(),
          })
        } catch {}
      }}
    />
    </>
  )
}

// Expandable theme row: click to reveal up to 5 example quotes.
function ThemeRow({ theme }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ background:'var(--dim)', borderRadius:8, padding:'8px 10px' }}>
      <div onClick={()=>setOpen(p=>!p)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }}>
        <span style={{ fontSize:12.5, fontWeight:700, color:'var(--text)' }}>{theme.label}</span>
        <span style={{ fontSize:12.5, fontWeight:800, color:'var(--brand)' }}>{theme.count} {open?'▴':'▾'}</span>
      </div>
      {open && (
        <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:4 }}>
          {theme.examples.map((ex,i)=>(
            <div key={i} style={{ fontSize:11.5, color:'var(--muted)' }}>"{ex.text}" — {ex.buyer}{ex.date?', '+fmtDate(ex.date):''}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// Compact, expandable showing row. Collapsed: buyer, date, interest badge,
// main feedback theme chip, note preview. Expanded: inline edit of interest,
// showing date, showing agent, feedback, notes -- all real listing_showings
// columns, no schema change. 'Status' is derived from interest_level since
// there is no separate buyer-status column on listing_showings.
function ShowingRow({ showing, onUpdate }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [buf, setBuf] = useState({
    interest_level: showing.interest_level || 3,
    feedback: showing.feedback || '',
    notes: showing.notes || '',
    showing_date: showing.showing_date ? String(showing.showing_date).slice(0,10) : '',
    agent_name: showing.agent_name || '',
  })
  const mainTheme = mainThemeFor(showing)
  const hasFeedback = !!(showing.feedback || showing.notes)
  const preview = [showing.feedback, showing.notes].filter(Boolean).join(' — ').slice(0, 70)
  const interestLbl = INTEREST_LABELS[showing.interest_level || 3] || 'Neutral'
  const rowInp = { padding:'6px 8px', borderRadius:6, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12.5, fontFamily:ff, width:'100%', boxSizing:'border-box' }
  const miniLabel = { fontSize:10, color:'var(--muted)', marginBottom:3, fontWeight:700, textTransform:'uppercase', letterSpacing:'.03em' }

  async function save() {
    setSaving(true)
    await onUpdate({
      interest_level: parseInt(buf.interest_level) || 3,
      feedback: buf.feedback || null,
      notes: buf.notes || null,
      showing_date: buf.showing_date || null,
      agent_name: buf.agent_name || null,
    })
    setSaving(false)
    setOpen(false)
  }

  return (
    <div style={{ borderTop:'1px solid var(--border)' }}>
      <div onClick={()=>setOpen(p=>!p)} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 12px', cursor:'pointer' }}>
        <span style={{ fontSize:12.5, fontWeight:700, color:'var(--text)', minWidth:88, flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{showing.buyer_name || 'Buyer'}</span>
        <span style={{ fontSize:11, color:'var(--muted)', minWidth:58, flexShrink:0 }}>{showing.showing_date ? fmtDate(showing.showing_date) : '—'}</span>
        <span style={{ fontSize:10, fontWeight:700, color:interestColor(showing.interest_level||3), background:interestColor(showing.interest_level||3)+'18', padding:'2px 7px', borderRadius:99, flexShrink:0, whiteSpace:'nowrap' }}>{interestLbl}</span>
        {mainTheme && <span style={{ fontSize:10, fontWeight:600, color:'#B45309', background:'rgba(245,166,35,.14)', padding:'2px 7px', borderRadius:99, flexShrink:0, whiteSpace:'nowrap' }}>{themeLabel(mainTheme)}</span>}
        <span style={{ fontSize:11.5, color:hasFeedback?'var(--muted)':'#DC2626', fontStyle:hasFeedback?'normal':'italic', flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {hasFeedback ? preview : 'No feedback yet'}
        </span>
        <span style={{ fontSize:11.5, color:'var(--brand)', fontWeight:700, flexShrink:0 }}>{open ? '▴ Close' : '✎ Edit'}</span>
      </div>

      {open && (
        <div style={{ padding:'2px 12px 12px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:8, marginBottom:8 }}>
            <div>
              <div style={miniLabel}>Interest</div>
              <select value={buf.interest_level} onChange={e=>setBuf(p=>({ ...p, interest_level:e.target.value }))} style={rowInp}>
                {[5,4,3,2,1].map(n=><option key={n} value={n}>{n} — {INTEREST_LABELS[n]}</option>)}
              </select>
            </div>
            <div>
              <div style={miniLabel}>Showing date</div>
              <input type="date" value={buf.showing_date} onChange={e=>setBuf(p=>({ ...p, showing_date:e.target.value }))} style={rowInp} />
            </div>
            <div>
              <div style={miniLabel}>Showing agent</div>
              <input value={buf.agent_name} onChange={e=>setBuf(p=>({ ...p, agent_name:e.target.value }))} placeholder="Agent name" style={rowInp} />
            </div>
          </div>
          <div style={{ marginBottom:8 }}>
            <div style={miniLabel}>Feedback</div>
            <input value={buf.feedback} onChange={e=>setBuf(p=>({ ...p, feedback:e.target.value }))} placeholder="What did the buyer say?" style={rowInp} />
          </div>
          <div style={{ marginBottom:10 }}>
            <div style={miniLabel}>Notes</div>
            <input value={buf.notes} onChange={e=>setBuf(p=>({ ...p, notes:e.target.value }))} placeholder="Internal notes…" style={rowInp} />
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={save} disabled={saving} style={{ padding:'6px 14px', borderRadius:7, border:'none', background:'var(--brand)', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff, opacity:saving?0.6:1 }}>{saving?'Saving…':'Save'}</button>
            <button onClick={()=>setOpen(false)} style={{ padding:'6px 14px', borderRadius:7, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:ff }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

