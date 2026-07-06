// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Contacts Page
// Full lead/contact management. Every contact has its own URL.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react'
import { FileAttachments } from '../components/FileAttachments'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { ClickToCall, HeaderCallButton } from '../components/ClickToCall'
import { useContacts, useAgents } from '../lib/hooks'
import { db } from '../lib/db'
import { supabase } from '../lib/supabase'
import { ImportExport } from '../components/ImportExport'
import { FilterBar }        from '../components/FilterBar'
import { BulkEditBar }      from '../components/BulkEditBar'
import { DuplicateDetector } from '../components/DuplicateDetector'
import { ScoreBadge }       from '../lib/leadScoring.jsx'
import { RecordActivityFeed as RecordActivity } from '../components/RecordActivityFeed'
import { AddressAutocomplete } from '../components/AddressAutocomplete'
import { fmt$, fmtDate, fmtPhone, initials, matchSearch } from '../lib/utils'
import { CONTACT_STATUSES, CONTACT_SOURCES } from '../lib/constants'
import {
  PageHeader, Btn, Modal, Field, Input, Select, Textarea, Pill,
  SearchInput, Avatar, ModalActions, Loading, Empty, Tabs, SectionTitle,
  Card, Confirm, Divider
} from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const CONTACT_EXPORT_COLS = [
  { key:'first_name', label:'First Name', example:'John' },
  { key:'last_name',  label:'Last Name',  example:'Smith' },
  { key:'phone',      label:'Phone',      example:'8455551234' },
  { key:'email',      label:'Email',      example:'john@email.com' },
  { key:'address',    label:'Address',    example:'123 Main St' },
  { key:'city',       label:'City',       example:'Spring Valley' },
  { key:'state',      label:'State',      example:'NY' },
  { key:'zip',        label:'Zip',        example:'10977' },
  { key:'status',     label:'Status',     example:'Hot' },
  { key:'source',     label:'Source',     example:'SOI' },
  { key:'type',       label:'Type',       example:'Buyer' },
  { key:'budget_max', label:'Budget Max', example:'500000', type:'number' },
  { key:'notes',      label:'Notes',      example:'' },
  { key:'_agent_name',label:'Agent Name', example:'Lazer Farkas', virtual:true },
]

const BLANK = {
  first_name: '', last_name: '', phone: '', email: '', address: '',
  city: '', state: 'NY', zip: '', status: 'New', source: '', tags: [], notes: ''
}

// ═══════════════════════════════════════════════════════════════
// CONTACT POPUP — Quick info card on card click
// Shows configurable fields + linked deals
// Admin can choose which fields to show via ⚙️ button
// ═══════════════════════════════════════════════════════════════
const ALL_POPUP_FIELDS = [
  { id: 'phone',     label: 'Phone',          icon: '📞' },
  { id: 'email',     label: 'Email',          icon: '📧' },
  { id: 'status',    label: 'Status',         icon: '🏷' },
  { id: 'source',    label: 'Source',         icon: '📌' },
  { id: 'agent',     label: 'Assigned Agent', icon: '👤' },
  { id: 'address',   label: 'Address',        icon: '📍' },
  { id: 'type',      label: 'Type',           icon: '🏠' },
  { id: 'budget_max',label: 'Budget',         icon: '💰' },
  { id: 'notes',     label: 'Notes',          icon: '📝' },
  { id: 'tags',      label: 'Tags',           icon: '🏷' },
]

function ContactPopup({ contact: c, deals = [], fields, onEdit, onOpenFull, onClose, agents, isAdmin, onFieldsChange }) {
  const [configMode, setConfigMode] = React.useState(false)
  const [localFields, setLocalFields] = React.useState(fields)
  const ff2 = 'Inter,system-ui,sans-serif'
  const STATUS_COLORS = { Hot:'#DC2626',Warm:'#F5A623',Cold:'#3B82F6',Active:'#10B981',New:'#8B5CF6',Nurturing:'#14B8A6',Closed:'#94A3B8',Unresponsive:'#64748B' }
  const sc = STATUS_COLORS[c.status] || '#CC2200'
  const agent = agents.find(a => a.id === c.agent_id)

  function renderField(fieldId) {
    switch(fieldId) {
      case 'phone':     return c.phone     ? <span onClick={e=>e.stopPropagation()}><ClickToCall phone={c.phone} contactName={(c.first_name||'')+' '+(c.last_name||'')} contactId={c.id} showLabel size="sm" /></span> : null
      case 'email':     return c.email     ? <a href={'mailto:' + c.email} onClick={e => e.stopPropagation()} style={{ color:'var(--brand)', textDecoration:'none', fontSize:'13px' }}>{c.email}</a> : null
      case 'status':    return c.status    ? <span style={{ fontSize:'12px', padding:'2px 8px', borderRadius:'12px', background:sc+'22', color:sc, fontWeight:700 }}>{c.status}</span> : null
      case 'source':    return c.source    ? <span style={{ fontSize:'12px', color:'var(--muted)' }}>{c.source}</span> : null
      case 'agent':     return agent       ? <div style={{ display:'flex', alignItems:'center', gap:'5px' }}><div style={{ width:18, height:18, borderRadius:'50%', background:agent.color||'#CC2200', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'8px', fontWeight:800, color:'#fff' }}>{agent.name.split(' ').map(n=>n[0]).join('').slice(0,2)}</div><span style={{ fontSize:'12px', color:'var(--muted)' }}>{agent.name}</span></div> : null
      case 'address':   return c.address   ? <span style={{ fontSize:'12px', color:'var(--muted)' }}>{[c.address, c.city, c.state].filter(Boolean).join(', ')}</span> : null
      case 'type':      return c.type      ? <span style={{ fontSize:'12px', color:'var(--muted)' }}>{c.type}</span> : null
      case 'budget_max':return c.budget_max? <span style={{ fontSize:'12px', fontWeight:700, color:'#10B981' }}>{'Up to $' + Number(c.budget_max).toLocaleString()}</span> : null
      case 'notes':     return c.notes     ? <span style={{ fontSize:'11px', color:'var(--muted)', fontStyle:'italic' }}>{String(c.notes).slice(0,80)}{String(c.notes).length>80?'…':''}</span> : null
      case 'tags':      return c.tags?.length ? <div style={{ display:'flex', gap:'3px', flexWrap:'wrap' }}>{c.tags.slice(0,4).map(t => <span key={t} style={{ fontSize:'10px', padding:'1px 6px', borderRadius:'10px', background:'var(--dim)', color:'var(--muted)', border:'1px solid var(--border)' }}>{t}</span>)}</div> : null
      default:          return null
    }
  }

  return (
    <div onClick={onClose}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.3)', zIndex:800, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', fontFamily:ff2 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:'var(--panel)', borderRadius:'14px', width:'100%', maxWidth:'380px', boxShadow:'0 12px 40px rgba(0,0,0,.2)', overflow:'hidden', border:'1px solid var(--border)' }}>

        {/* Header */}
        <div style={{ padding:'16px 16px 12px', borderBottom:'1px solid var(--border)', background: sc + '0a' }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap:'10px' }}>
            <div style={{ width:44, height:44, borderRadius:'50%', background:sc, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', fontWeight:800, color:'#fff', flexShrink:0 }}>
              {(c.first_name?.[0]||'') + (c.last_name?.[0]||'')}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:'16px', fontWeight:800, color:'var(--text)' }}>{c.first_name} {c.last_name}</div>
              {c.status && <span style={{ fontSize:'11px', padding:'1px 7px', borderRadius:'10px', background:sc+'22', color:sc, fontWeight:700 }}>{c.status}</span>}
            </div>
            <div style={{ display:'flex', gap:'4px' }}>
              {isAdmin && (
                <button onClick={() => setConfigMode(m => !m)}
                  title="Configure popup fields"
                  style={{ background:'none', border:'none', cursor:'pointer', fontSize:'14px', color:'var(--muted)', padding:'3px' }}>⚙️</button>
              )}
              <button onClick={onClose}
                style={{ background:'none', border:'none', cursor:'pointer', fontSize:'16px', color:'var(--muted)', padding:'3px' }}>✕</button>
            </div>
          </div>
        </div>

        {/* Field config mode */}
        {configMode && (
          <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', background:'var(--dim)' }}>
            <div style={{ fontSize:'11px', fontWeight:700, color:'var(--muted)', marginBottom:'8px', textTransform:'uppercase', letterSpacing:'.06em' }}>Choose fields to show</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'5px' }}>
              {ALL_POPUP_FIELDS.map(f => {
                const on = localFields.includes(f.id)
                return (
                  <button key={f.id} onClick={() => {
                    const next = on ? localFields.filter(x => x !== f.id) : [...localFields, f.id]
                    setLocalFields(next)
                    onFieldsChange(next)
                  }}
                    style={{ padding:'3px 9px', borderRadius:'12px', border:'1px solid ' + (on ? '#CC2200' : 'var(--border)') + '', background: on ? 'rgba(204,34,0,.1)' : 'transparent', color: on ? '#CC2200' : 'var(--muted)', fontSize:'11px', fontWeight:600, cursor:'pointer', fontFamily:ff2 }}>
                    {f.icon} {f.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Field values */}
        <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:'8px' }}>
          {localFields.map(fid => {
            const def = ALL_POPUP_FIELDS.find(f => f.id === fid)
            const val = renderField(fid)
            if (!val) return null
            return (
              <div key={fid} style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <span style={{ fontSize:'13px', flexShrink:0, width:18 }}>{def?.icon}</span>
                <div style={{ flex:1, minWidth:0 }}>{val}</div>
              </div>
            )
          })}
        </div>

        {/* Linked deals */}
        {deals.length > 0 && (
          <div style={{ padding:'8px 16px 12px', borderTop:'1px solid var(--border)' }}>
            <div style={{ fontSize:'10px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'6px' }}>Linked Deals</div>
            {deals.slice(0,3).map(d => (
              <div key={d.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 0', borderBottom:'1px solid var(--border)' }}>
                <span style={{ fontSize:'12px', color:'var(--text)', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:200 }}>{d.addr}</span>
                <span style={{ fontSize:'11px', padding:'1px 6px', borderRadius:'10px', background:'#10B98118', color:'#10B981', fontWeight:700, flexShrink:0, marginLeft:8 }}>{d.stage}</span>
              </div>
            ))}
            {deals.length > 3 && <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:'4px' }}>+{deals.length-3} more deals</div>}
          </div>
        )}

        {/* Actions */}
        <div style={{ padding:'10px 16px', borderTop:'1px solid var(--border)', display:'flex', gap:'8px' }}>
          {c.phone && (
            <div onClick={e => e.stopPropagation()} style={{ flex:1 }}>
              <ClickToCall phone={c.phone} contactName={c.first_name + ' ' + (c.last_name||'')} contactId={c.id} size="sm" showLabel />
            </div>
          )}
          {c.phone && (
            <a href={'https://wa.me/' + c.phone.replace(/[^0-9]/g,'')} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
              style={{ flex:1, padding:'8px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--dim)', color:'#25D366', fontSize:'12px', fontWeight:700, textDecoration:'none', textAlign:'center', fontFamily:ff2 }}>
              💬 WhatsApp
            </a>
          )}
          <button onClick={() => { onOpenFull(); onClose() }}
            style={{ flex:1, padding:'8px', borderRadius:'8px', border:'none', background:'#CC2200', color:'#fff', fontSize:'12px', fontWeight:700, cursor:'pointer', fontFamily:ff2 }}>
            Open →
          </button>
        </div>
      </div>
    </div>
  )
}


export function Contacts() {
  const navigate = useNavigate()
  const { id: urlId } = useParams()
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()

  // Paginated loading — 100 at a time, load more on scroll
  const [contacts,    setContacts]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [totalCount,  setTotalCount]  = useState(0)
  const [pageOffset,  setPageOffset]  = useState(0)
  const PAGE_SIZE = 100
  const { agents } = useAgents()

  const [search,      setSearch]      = useState('')
  const [tagFilter,   setTagFilter]   = useState('')
  const [statusF,     setStatusF]     = useState('')
  const [agentF,      setAgentF]      = useState('')
  const [sourceF,     setSourceF]     = useState('')
  const [typeF,       setTypeF]       = useState('')

  // Load contacts with server-side pagination
  async function loadContacts(offset = 0, append = false) {
    if (offset === 0) setLoading(true)
    try {
      const agentFilter = isAdmin || canManage ? null : agent?.id
      let q = supabase.from('contacts').select('*, agents(id,name,color)', { count: 'exact' })
      if (agentFilter) q = q.eq('agent_id', agentFilter)
      if (statusF)     q = q.eq('status', statusF)
      if (typeF)       q = q.eq('type', typeF)
      if (agentF)      q = q.eq('agent_id', agentF)
      if (search && search.length >= 2) {
        q = q.or('first_name.ilike.%'+search+'%,last_name.ilike.%'+search+'%,phone.ilike.%'+search+'%,email.ilike.%'+search+'%')
      }
      q = q.order('last_activity', { ascending:false, nullsFirst:false })
           .order('created_at',    { ascending:false })
           .range(offset, offset + PAGE_SIZE - 1)

      const { data, count, error } = await q
      if (error) throw error
      setTotalCount(count || 0)
      setContacts(prev => append ? [...prev, ...(data||[])] : (data||[]))
      setPageOffset(offset)
    } catch(e) { console.error('Load contacts:', e.message) }
    finally { if (offset === 0) setLoading(false) }
  }

  async function refetch() { await loadContacts(0) }

  // Reload when filters change (debounced for search)
  useEffect(() => {
    const t = setTimeout(() => loadContacts(0), search ? 300 : 0)
    return () => clearTimeout(t)
  }, [search, statusF, typeF, agentF, agent?.id])

  async function add(data)          { const r = await db.contacts.create(data); await refetch(); return r }
  async function update(id, data)   { const r = await db.contacts.update(id, data, agent?.id); await refetch(); return r }
  async function remove(id)         { await db.contacts.delete(id); await refetch() }
  const [dateRange,   setDateRange]   = useState({})
  const [sortKey,     setSortKey]     = useState('created_at')
  const [sortDir,     setSortDir]     = useState('desc')
  const [selected,    setSelected]    = useState(null)
  const [showAdd,     setShowAdd]     = useState(false)
  const [form,        setForm]        = useState(BLANK)
  const [saving,      setSaving]      = useState(false)
  const [tab,         setTab]         = useState('info')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [selectedIds,  setSelectedIds]  = useState([])
  const [bulkDel,      setBulkDel]      = useState(false)
  const [popupContact, setPopupContact] = useState(null)   // quick info popup
  const [popupDeals,   setPopupDeals]   = useState([])     // deals for popup
  const [popupFields,  setPopupFields]  = useState(['phone','email','source','status','agent']) // configurable
  const [viewMode,     setViewMode]     = useState('grid') // 'grid' | 'list'

  // Auto-open from URL param
  useEffect(() => {
    if (urlId && contacts.length > 0 && urlId !== 'new') {
      const c = contacts.find(x => x.id === urlId)
      if (c) openContact(c)
    }
    if (urlId === 'new') openAdd()
  }, [urlId, contacts.length])

  function openContact(c) {
    navigate('/contacts/' + c.id, { replace: true })
    setSelected(c)
    setForm({ ...BLANK, ...c })
    setShowAdd(false)
    setTab('info')
  }

  function openAdd() {
    setSelected(null)
    setForm({ ...BLANK, agent_id: agent?.id })
    setShowAdd(true)
    navigate('/contacts/new', { replace: true })
  }

  function closePanel() {
    setSelected(null)
    setShowAdd(false)
    navigate('/contacts', { replace: true })
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function saveContact() {
    if (!form.first_name.trim())  { toast('First name is required', '#DC2626'); return }
    if (!form.phone?.trim() && !selected)  { toast('Phone number is required', '#DC2626'); return }
    if (!form.source && !selected)         { toast('Source is required', '#DC2626'); return }
    if (!form.agent_id && (isAdmin || canManage) && !selected) { toast('Please assign an agent', '#DC2626'); return }
    setSaving(true)
    try {
      if (selected) {
        const payload = { ...form, agent_id: form.agent_id || selected.agent_id || agent?.id }
        const updated = await update(selected.id, payload)
        setSelected(updated)
        toast('✅ Contact saved')
      } else {
        const isQuickAdd = !form.source && !form.email && !form.address
      const created = await add({ ...form, agent_id: form.agent_id || agent?.id })
      
      if (created && isQuickAdd) {
        // Quick add: create follow-up task for agent + send email
        const assignedAgentId = form.agent_id || agent?.id
        const assignedAgent   = agents.find(a => a.id === assignedAgentId)
        const contactName     = form.first_name + ' ' + (form.last_name || '')
        
        // Create task to fill in missing info
        try {
          await supabase.from('tasks').insert({
            agent_id:   assignedAgentId,
            created_by: agent?.id,
            contact_id: created.id,
            title:      'Complete contact info for ' + contactName,
            notes:      'Quick-added contact needs: source, email, address, buyer type, budget',
            priority:   'high',
            status:     'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
        } catch(e) { console.warn('Task create failed:', e.message) }

        // Send email to assigned agent
        if (assignedAgent?.email) {
          try {
            await fetch('/api/send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from:    'TargetOS <office@targetreteam.com>',
                to:      [assignedAgent.email],
                subject: '📋 New lead added — please complete: ' + contactName,
                html:    '<div style="font-family:Inter,sans-serif;padding:20px"><h2 style="color:#CC2200">New Lead: ' + contactName + '</h2><p>A new contact was quick-added and needs you to fill in the remaining information.</p><p><strong>Name:</strong> ' + contactName + '<br><strong>Phone:</strong> ' + (form.phone || '—') + '</p><p>Please log in to TargetOS and complete the contact profile with source, email, buyer type, and notes.</p><a href="https://app.targetreteam.com/contacts/' + created.id + '/detail" style="background:#CC2200;color:#fff;padding:10px 20px;text-decoration:none;border-radius:7px;display:inline-block;margin-top:12px">Open Contact →</a></div>',
              }),
            })
          } catch(e) { console.warn('Email failed:', e.message) }
        }
        toast('✅ Contact added — task created for ' + (assignedAgent?.name || 'agent') + ' to complete info')
      }
        toast('✅ Contact added')
        closePanel()
        navigate('/contacts/' + created.id)
      }
    } catch(e) {
      toast('Save failed: ' + e.message, '#DC2626')
    } finally { setSaving(false) }
  }

  async function deleteContact() {
    try {
      await remove(selected.id)
      toast('Contact deleted')
      closePanel()
    } catch(e) {
      toast('Delete failed: ' + e.message, '#DC2626')
    } finally { setConfirmDelete(false) }
  }

  // ── FILTER ────────────────────────────────────────────────────
  const filtered = React.useMemo(() => {
    let result = contacts.filter(c => {
      if (statusF && c.status    !== statusF) return false
      if (agentF  && c.agent_id  !== agentF)  return false
      if (sourceF && c.source    !== sourceF) return false
      if (typeF   && c.type      !== typeF)   return false
      if (dateRange?.from && c.created_at && c.created_at.slice(0,10) < dateRange.from) return false
      if (dateRange?.to   && c.created_at && c.created_at.slice(0,10) > dateRange.to)   return false
      if (search  && !matchSearch(c, search, ['first_name','last_name','phone','email','address','notes'])) return false
      if (tagFilter && !(c.tags || []).some(t => String(t).toLowerCase().includes(tagFilter.toLowerCase()))) return false
      return true
    })
    // Sort
    result = [...result].sort((a,b) => {
      const av = a[sortKey]||'', bv = b[sortKey]||''
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return result
  }, [contacts, statusF, agentF, sourceF, typeF, dateRange, search, tagFilter, sortKey, sortDir])

  const statusColor = (s) => CONTACT_STATUSES.find(x => x.value === s)?.color || '#94A3B8'

  async function bulkDelete() {
    if (!selectedIds.length) return
    if (!window.confirm('Delete ' + selectedIds.length + ' contact' + (selectedIds.length !== 1 ? 's' : '') + '? This cannot be undone.')) return
    setBulkDel(true)
    try {
      await supabase.from('contacts').delete().in('id', selectedIds)
      setSelectedIds([])
      toast('Deleted ' + selectedIds.length + ' contact' + (selectedIds.length !== 1 ? 's' : ''))
    } catch(e) { toast('Delete failed: ' + e.message, '#DC2626') }
    finally { setBulkDel(false) }
  }

  return (
    <div style={{ fontFamily: ff }}>
      <PageHeader
        title="Contacts"
        sub={filtered.length + ' contacts'}
        actions={
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <ImportExport
              table="contacts"
              data={filtered}
              columns={CONTACT_EXPORT_COLS}
              label="Contacts"
              onImport={refetch}
            />
            <div style={{ display:'flex', background:'var(--dim)', borderRadius:'8px', padding:'2px', gap:'2px' }}>
              {[['grid','⊞'],['list','☰']].map(([v,icon]) => (
                <button key={v} onClick={() => setViewMode(v)}
                  title={v === 'grid' ? 'Grid view' : 'List view'}
                  style={{ padding:'5px 10px', borderRadius:'6px', border:'none', background: viewMode===v ? 'var(--panel)' : 'transparent', color: viewMode===v ? 'var(--text)' : 'var(--muted)', fontSize:'14px', cursor:'pointer', fontFamily:ff, boxShadow: viewMode===v ? '0 1px 3px rgba(0,0,0,.12)' : 'none' }}>
                  {icon}
                </button>
              ))}
            </div>
            <Btn onClick={openAdd}>+ Add Contact</Btn>
          </div>
        }
      />

      {/* Filters — new FilterBar */}
      <FilterBar
        page="contacts"
        searchKey="search"
        placeholder="Name, phone, email..."
        filters={{ search, statusF, agentF, sourceF, typeF, dateRange, tagFilter }}
        onChange={f => {
          if ('search'    in f) setSearch(f.search)
          if ('tagFilter' in f) setTagFilter(f.tagFilter)
          if ('statusF'   in f) setStatusF(f.statusF)
          if ('agentF'    in f) setAgentF(f.agentF)
          if ('sourceF'   in f) setSourceF(f.sourceF)
          if ('typeF'     in f) setTypeF(f.typeF)
          if ('dateRange' in f) setDateRange(f.dateRange)
        }}
        definitions={[
          { key:'statusF', label:'Status', multiSelect:false, options:(CONTACT_STATUSES||[]).map(s=>({value:s.value||s,label:s.label||s,color:s.color})) },
          ...(isAdmin||canManage?[{ key:'agentF', label:'Agent', options:agents.map(a=>({value:a.id,label:a.name})) }]:[]),
          { key:'sourceF', label:'Source', options:(CONTACT_SOURCES||['SOI','Zillow','Referral','Open House','Referral','Past Client']).map(s=>({value:s,label:s})) },
          { key:'typeF',   label:'Type',   options:['Buyer','Seller','Investor','Renter','Other'].map(s=>({value:s,label:s})) },
          { key:'dateRange', label:'Date Added', type:'date' },
        ]}
        sortDefs={[
          {key:'created_at',label:'Date Added'},{key:'first_name',label:'Name'},{key:'status',label:'Status'},{key:'last_activity',label:'Last Activity'}
        ]}
        sortKey={sortKey} sortDir={sortDir}
        onSortChange={(k,d) => { setSortKey(k); setSortDir(d) }}
        totalCount={totalCount} filteredCount={filtered.length}
      />

      {/* Selection bar */}
      {selectedIds.length > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 14px', background:'#1B2B4B', borderRadius:'10px', marginBottom:'10px', flexWrap:'wrap' }}>
          <span style={{ fontSize:'13px', fontWeight:700, color:'#fff' }}>{selectedIds.length} selected</span>
          <div style={{ flex:1 }} />
          <button onClick={bulkDelete} disabled={bulkDel}
            style={{ padding:'5px 12px', borderRadius:'6px', border:'1px solid rgba(220,38,38,.5)', background:'rgba(220,38,38,.2)', color:'#FCA5A5', fontSize:'12px', fontWeight:700, cursor:'pointer', fontFamily:ff }}>
            {bulkDel ? '⏳' : '🗑️'} Delete {selectedIds.length}
          </button>
          <button onClick={() => setSelectedIds([])}
            style={{ padding:'5px 10px', borderRadius:'6px', border:'1px solid rgba(255,255,255,.2)', background:'transparent', color:'rgba(255,255,255,.7)', fontSize:'12px', cursor:'pointer', fontFamily:ff }}>
            ✕ Clear
          </button>
        </div>
      )}

      {loading && <Loading />}

      {/* Bulk edit bar — appears when contacts are selected */}
      <BulkEditBar
        selectedIds={selectedIds}
        table="contacts"
        agents={agents}
        fields={[
          { key:'status', label:'Status', type:'select', options:(CONTACT_STATUSES||[]).map(s=>({value:s.value||s,label:s.label||s})) },
          { key:'agent_id', label:'Assigned Agent', type:'agent' },
          { key:'source',   label:'Source', type:'select', options:(CONTACT_SOURCES||[]).map(s=>({value:s,label:s})) },
          { key:'stage',    label:'Stage',  type:'select', options:['SOI','Nurture','Active','Offer Accapted','Under Contract'].map(v=>({value:v,label:v})) },
        ]}
        onDone={() => { setSelectedIds([]); refetch() }}
        onClear={() => setSelectedIds([])}
      />

      {!loading && filtered.length === 0 && (
        <Empty icon="👥" title="No contacts yet" sub="Add your first lead using the button above or voice capture." action={<Btn onClick={openAdd}>+ Add Contact</Btn>} />
      )}

      {/* Contact Grid / List */}
      {!loading && filtered.length > 0 && viewMode === 'grid' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
          {filtered.map(c => {
            const isSelected = selectedIds.includes(c.id)
            const isPopup    = popupContact?.id === c.id
            return (
              <div key={c.id} onClick={() => setPopupContact(c)}
                style={{ background: isSelected ? 'rgba(204,34,0,.04)' : 'var(--panel)', borderRadius: 'var(--radius)', border: isSelected ? '2px solid #CC220044' : isPopup ? '2px solid var(--brand)' : '1px solid var(--border)', padding: '14px 16px', cursor: 'pointer', transition: 'box-shadow .15s', position: 'relative' }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.boxShadow = 'var(--shadow-md)' }}
                onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
                <div onClick={e => { e.stopPropagation(); setSelectedIds(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id]) }}
                  style={{ position:'absolute', top:10, left:10, width:16, height:16, borderRadius:'4px', border:'2px solid ' + (isSelected ? '#CC2200' : 'var(--border)'), background: isSelected ? '#CC2200' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2, transition:'all .12s' }}>
                  {isSelected && <span style={{ color:'#fff', fontSize:'9px', fontWeight:900, lineHeight:1 }}>✓</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: statusColor(c.status), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, flexShrink: 0 }}>
                    {initials(c.first_name + ' ' + (c.last_name || ''))}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span onClick={e => { e.stopPropagation(); navigate('/contacts/' + c.id + '/detail') }}
                      style={{ fontWeight: 700, fontSize: '14px', color: 'var(--brand)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
                      {c.first_name} {c.last_name}
                    </span>
                    {c.phone && <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px', userSelect:'none' }} data-nolink='1'>{fmtPhone(c.phone)}</div>}
                    {c.email && <div style={{ fontSize: '12px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div>}
                  </div>
                  <Pill label={c.status} color={statusColor(c.status)} />
                  {c.phone && (
                    <span onClick={e => e.stopPropagation()} style={{ marginLeft:4 }}>
                      <ClickToCall phone={c.phone} contactName={c.first_name + ' ' + (c.last_name||'')} contactId={c.id} size="sm" />
                    </span>
                  )}
                </div>
                {c.address && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📍 {c.address}</div>}
                {c.source  && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>📌 {c.source}</div>}
                {c.agents  && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '8px' }}>
                    <Avatar agent={c.agents} size={18} />
                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{c.agents.name}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {!loading && filtered.length > 0 && viewMode === 'list' && (
        <div style={{ background:'var(--panel)', borderRadius:'var(--radius)', border:'1px solid var(--border)', overflow:'hidden' }}>
          {/* Table header */}
          <div style={{ display:'grid', gridTemplateColumns:'32px 2fr 1.4fr 1.4fr 1fr 1fr 1fr 100px', gap:0, padding:'8px 12px', background:'var(--dim)', borderBottom:'2px solid var(--border)' }}>
            {['','Name','Phone','Email','Status','Source','Agent',''].map((h,i) => (
              <div key={i} style={{ fontSize:'10px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', padding:'0 6px' }}>{h}</div>
            ))}
          </div>
          {filtered.map((c, idx) => {
            const isSelected = selectedIds.includes(c.id)
            const isPopup    = popupContact?.id === c.id
            const sc         = statusColor(c.status)
            return (
              <div key={c.id}
                style={{ display:'grid', gridTemplateColumns:'32px 2fr 1.4fr 1.4fr 1fr 1fr 1fr 100px', gap:0, padding:'9px 12px', borderBottom: idx < filtered.length-1 ? '1px solid var(--border)' : 'none', background: isSelected ? 'rgba(204,34,0,.03)' : isPopup ? 'rgba(204,34,0,.02)' : 'transparent', cursor:'pointer', transition:'background .1s', alignItems:'center' }}
                onClick={() => setPopupContact(c)}
                onMouseEnter={e => { if(!isSelected) e.currentTarget.style.background='var(--hov)' }}
                onMouseLeave={e => e.currentTarget.style.background = isSelected ? 'rgba(204,34,0,.03)' : 'transparent'}>
                {/* Checkbox */}
                <div onClick={e => { e.stopPropagation(); setSelectedIds(prev => prev.includes(c.id) ? prev.filter(x=>x!==c.id) : [...prev,c.id]) }}
                  style={{ width:16, height:16, borderRadius:'4px', border:'2px solid '+(isSelected?'#CC2200':'var(--border)'), background:isSelected?'#CC2200':'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all .12s' }}>
                  {isSelected && <span style={{ color:'#fff', fontSize:'9px', fontWeight:900 }}>✓</span>}
                </div>
                {/* Name + avatar */}
                <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'0 6px', minWidth:0 }}>
                  <div style={{ width:30, height:30, borderRadius:'50%', background:sc, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:700, flexShrink:0 }}>
                    {initials(c.first_name + ' ' + (c.last_name || ''))}
                  </div>
                  <div style={{ minWidth:0 }}>
                    <span onClick={e => { e.stopPropagation(); navigate('/contacts/' + c.id + '/detail') }}
                      style={{ fontWeight:700, fontSize:'13px', color:'var(--brand)', display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer' }}>
                      {c.first_name} {c.last_name}
                    </span>
                    {c.address && <div style={{ fontSize:'11px', color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.address}</div>}
                  </div>
                </div>
                {/* Phone */}
                <div style={{ padding:'0 6px', fontSize:'12px', color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {c.phone ? (
                    <span onClick={e=>e.stopPropagation()}><ClickToCall phone={c.phone} contactName={c.first_name+' '+(c.last_name||'')} contactId={c.id} showLabel size="sm" /></span>
                  ) : '—'}
                </div>
                {/* Email */}
                <div style={{ padding:'0 6px', fontSize:'12px', color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {c.email ? (
                    <a href={'mailto:' + c.email} onClick={e=>e.stopPropagation()} style={{ color:'var(--brand)', textDecoration:'none' }}>{c.email}</a>
                  ) : '—'}
                </div>
                {/* Status */}
                <div style={{ padding:'0 6px' }}>
                  {c.status ? <span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'12px', background:sc+'22', color:sc, fontWeight:700, whiteSpace:'nowrap' }}>{c.status}</span> : '—'}
                </div>
                {/* Source */}
                <div style={{ padding:'0 6px', fontSize:'12px', color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.source || '—'}</div>
                {/* Agent */}
                <div style={{ padding:'0 6px', display:'flex', alignItems:'center', gap:'5px' }}>
                  {c.agents ? (
                    <>
                      <Avatar agent={c.agents} size={18} />
                      <span style={{ fontSize:'11px', color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.agents.name.split(' ')[0]}</span>
                    </>
                  ) : '—'}
                </div>
                {/* Actions */}
                <div style={{ padding:'0 6px', display:'flex', gap:'5px', justifyContent:'flex-end' }}>
                  {c.phone && (
<span onClick={e=>e.stopPropagation()}><ClickToCall phone={c.phone} contactName={c.first_name+' '+(c.last_name||'')} contactId={c.id} size="sm" /></span>
                  )}
                  <button onClick={e => { e.stopPropagation(); openContact(c) }}
                    style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:26, height:26, borderRadius:'6px', border:'1px solid var(--border)', background:'var(--dim)', color:'var(--muted)', cursor:'pointer', fontSize:12, fontFamily:ff }}>
                    ✏️
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Detail / Add Panel */}
      <Modal open={!!(selected || showAdd)} onClose={closePanel} title={selected ? (selected.first_name + ' ' + (selected.last_name || '')) : 'New Contact'} width={560}>

        {selected && (
          <Tabs tabs={['info','notes','files','activity']} active={tab} onChange={setTab} />
        )}

        {(!selected || tab === 'info') && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="First Name" required>
                <Input value={form.first_name} onChange={v => set('first_name', v)} placeholder="John" />
              </Field>
              <Field label="Last Name">
                <Input value={form.last_name} onChange={v => set('last_name', v)} placeholder="Smith" />
              </Field>
              <Field label="Phone" required>
                <Input value={form.phone} onChange={v => set('phone', v)} placeholder="(845) 555-1234" type="tel" />
              </Field>
              <Field label="Email">
                <Input value={form.email} onChange={v => set('email', v)} placeholder="john@email.com" type="email" />
              </Field>
            </div>

            <Field label="Address">
              <AddressAutocomplete value={form.address||''} onChange={v => set('address', v)} placeholder="123 Main St, Monsey NY" />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <Field label="City">
                <Input value={form.city} onChange={v => set('city', v)} placeholder="Monsey" />
              </Field>
              <Field label="State">
                <Input value={form.state} onChange={v => set('state', v)} placeholder="NY" />
              </Field>
              <Field label="Zip">
                <Input value={form.zip} onChange={v => set('zip', v)} placeholder="10952" />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="Status">
                <Select value={form.status} onChange={v => set('status', v)} options={CONTACT_STATUSES} />
              </Field>
              <Field label="Source" required>
                <Select value={form.source} onChange={v => set('source', v)} options={CONTACT_SOURCES} placeholder="How did they find you?" />
              </Field>
            </div>

            {(isAdmin || canManage) && (
              <Field label="Assigned Agent">
                <Select value={form.agent_id || ''} onChange={v => set('agent_id', v)} options={agents.map(a => ({ value: a.id, label: a.name }))} placeholder="Assign to agent" />
              </Field>
            )}
          </div>
        )}

        {selected && tab === 'notes' && (
          <Field label="Notes">
            <Textarea value={form.notes} onChange={v => set('notes', v)} placeholder="Add notes about this contact..." rows={8} />
          </Field>
        )}
        {selected && tab === 'files' && (
          <FileAttachments tableName="contacts" recordId={selected.id} />
        )}
        {selected && tab === 'activity' && (
          <RecordActivity recordType="contacts" recordId={selected.id} />
        )}

        <ModalActions>
          {selected && (
            <Btn variant="ghost" style={{ marginRight: 'auto', color: '#DC2626' }} onClick={() => setConfirmDelete(true)}>Delete</Btn>
          )}
          {selected?.phone && (
            <ClickToCall phone={selected.phone} contactName={(selected.first_name||'') + ' ' + (selected.last_name||'')} contactId={selected.id} size="lg" showLabel />
          )}
          {selected && (
            <Btn variant="secondary" onClick={() => {
              closePanel()
              navigate('/calls?contact=' + selected.id + '&name=' + encodeURIComponent((selected.first_name || '') + ' ' + (selected.last_name || '')))
            }}>Log Call</Btn>
          )}
          <Btn variant="secondary" onClick={closePanel}>Cancel</Btn>
          <Btn onClick={saveContact} loading={saving}>{selected ? 'Save Changes' : 'Add Contact'}</Btn>
        </ModalActions>
      </Modal>

      {/* Contact Popup */}
      {popupContact && (
        <ContactPopup
          contact={popupContact}
          deals={popupDeals}
          fields={popupFields}
          agents={agents}
          isAdmin={isAdmin || canManage}
          onEdit={() => { openContact(popupContact); setPopupContact(null) }}
          onOpenFull={() => navigate('/contacts/' + popupContact.id + '/detail')}
          onClose={() => setPopupContact(null)}
          onFieldsChange={fields => setPopupFields(fields)}
        />
      )}

      <Confirm
        open={confirmDelete}
        message={'Delete ' + (selected?.first_name || '') + ' ' + (selected?.last_name || '') + '? This cannot be undone.'}
        onConfirm={deleteContact}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
