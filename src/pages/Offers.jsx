// TargetOS V2 — Offers
// Agent-grouped view with stats, deal connection, file uploads (offer + POF)
import { AddressAutocomplete } from '../components/AddressAutocomplete'
import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp }  from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { useOffers, useAgents } from '../lib/hooks'
import { fmt$, fmtDate, matchSearch } from '../lib/utils'
import { OFFER_SIDES, OFFER_STATUSES } from '../lib/constants'
import { RecordActivityFeed } from '../components/RecordActivityFeed'
import {
  PageHeader, Btn, Modal, Field, Input, Select, Textarea, Pill,
  SearchInput, Avatar, ModalActions, Loading, Empty, Confirm
} from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const BLANK = {
  listing_addr:'', buyer_name:'', production:'', gci:'',
  side:'Buyer', status:'Sent', submitted_at:'', expiry:'', notes:'',
  offer_url:'', pof_url:'',
}

// ── FILE UPLOADER ─────────────────────────────────────────────────
function FileUploader({ label, fileUrl, onUploaded, accept, folder }) {
  const [uploading, setUploading] = useState(false)
  const ref = useRef(null)

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 20 * 1024 * 1024) { alert('File must be under 20MB'); return }
    setUploading(true)
    try {
      const ext  = file.name.split('.').pop()
      const path = folder + '/' + Date.now() + '.' + ext
      const { error } = await supabase.storage.from('offer-docs').upload(path, file, { upsert: true })
      if (error) throw error
      const { data } = supabase.storage.from('offer-docs').getPublicUrl(path)
      onUploaded(data.publicUrl)
    } catch(e) {
      // Bucket may not exist — show message
      alert('Upload failed: ' + e.message + '\n\nRun this in Supabase Storage: create a bucket named "offer-docs" and set it to public.')
    } finally { setUploading(false) }
  }

  return (
    <div>
      <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>{label}</div>
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <label style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 12px', borderRadius:8,
          border:'1.5px dashed '+(fileUrl?'#10B981':'var(--border)'), cursor:'pointer', background:'var(--dim)', flex:1 }}>
          <input ref={ref} type="file" accept={accept||'application/pdf,image/*'} onChange={handleFile} style={{ display:'none' }} />
          <span style={{ fontSize:16 }}>{fileUrl ? '✅' : '📎'}</span>
          <span style={{ fontSize:12, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {uploading ? 'Uploading...' : fileUrl ? 'Uploaded ✓' : 'Click to upload'}
          </span>
        </label>
        {fileUrl && (
          <a href={fileUrl} target="_blank" rel="noopener noreferrer"
            style={{ padding:'7px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--panel)', color:'#3B82F6', fontSize:12, fontWeight:700, textDecoration:'none', whiteSpace:'nowrap' }}>
            View 📄
          </a>
        )}
      </div>
    </div>
  )
}

// ── AGENT STATS CARD ──────────────────────────────────────────────
function AgentStatsCard({ ag, agentOffers, deals, onFilter, isActive }) {
  const total    = agentOffers.length
  const accepted = agentOffers.filter(o => ['AO','Accepted','Closed'].includes(o.status)).length
  const pending  = agentOffers.filter(o => o.status === 'Sent').length
  const rejected = agentOffers.filter(o => ['Rejected','Expired','Withdrawn'].includes(o.status)).length
  // deals linked to this agent's offers (by listing_addr match or agent_id)
  const linkedDeals = deals.filter(d => d.agent_id === ag.id && d.stage !== 'Closed').length
  const convRate  = total > 0 ? Math.round(accepted / total * 100) : 0

  return (
    <div onClick={() => onFilter(ag.id)}
      style={{ background:'var(--panel)', borderRadius:12, border:'2px solid '+(isActive?'#CC2200':'var(--border)'), padding:'14px 16px', cursor:'pointer', transition:'all .15s' }}
      onMouseEnter={e=>{ if(!isActive) e.currentTarget.style.borderColor='rgba(204,34,0,.4)' }}
      onMouseLeave={e=>{ if(!isActive) e.currentTarget.style.borderColor='var(--border)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
        <div style={{ width:38, height:38, borderRadius:'50%', background:ag.color||'#CC2200',
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:'#fff', flexShrink:0 }}>
          {(ag.name||'').split(' ').map(n=>n[0]).join('').slice(0,2)}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:800, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ag.name}</div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>{ag.role||'Agent'}</div>
        </div>
        {isActive && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background:'rgba(204,34,0,.1)', color:'#CC2200', fontWeight:700 }}>Filtered</span>}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        <div style={{ textAlign:'center', padding:'8px', background:'var(--dim)', borderRadius:8 }}>
          <div style={{ fontSize:22, fontWeight:900, color:'var(--text)' }}>{total}</div>
          <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em' }}>Total</div>
        </div>
        <div style={{ textAlign:'center', padding:'8px', background:'rgba(16,185,129,.08)', borderRadius:8 }}>
          <div style={{ fontSize:22, fontWeight:900, color:'#10B981' }}>{accepted}</div>
          <div style={{ fontSize:10, color:'#10B981', textTransform:'uppercase', letterSpacing:'.05em' }}>Accepted</div>
        </div>
        <div style={{ textAlign:'center', padding:'8px', background:'rgba(245,166,35,.08)', borderRadius:8 }}>
          <div style={{ fontSize:22, fontWeight:900, color:'#F5A623' }}>{pending}</div>
          <div style={{ fontSize:10, color:'#F5A623', textTransform:'uppercase', letterSpacing:'.05em' }}>Pending</div>
        </div>
        <div style={{ textAlign:'center', padding:'8px', background: convRate >= 50 ? 'rgba(16,185,129,.06)' : 'rgba(204,34,0,.06)', borderRadius:8 }}>
          <div style={{ fontSize:22, fontWeight:900, color: convRate >= 50 ? '#10B981' : '#CC2200' }}>{convRate}%</div>
          <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em' }}>Conv. Rate</div>
        </div>
      </div>
      {linkedDeals > 0 && (
        <div style={{ marginTop:8, padding:'5px 10px', background:'rgba(59,130,246,.08)', borderRadius:7, fontSize:11, color:'#3B82F6', fontWeight:700, textAlign:'center' }}>
          💼 {linkedDeals} active deal{linkedDeals!==1?'s':''} in Production
        </div>
      )}
    </div>
  )
}

// ── MAIN ─────────────────────────────────────────────────────────
export function Offers() {
  const navigate  = useNavigate()
  const { id: urlId } = useParams()
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()

  const filters = isAdmin || canManage ? {} : { agent_id: agent?.id }
  const { offers, loading, add, update, remove } = useOffers(filters)
  const { agents } = useAgents()

  const [search,    setSearch]    = useState('')
  const [statusF,   setStatusF]   = useState('')
  const [agentF,    setAgentF]    = useState('')  // '' = all, 'none' = no agent, else agentId
  const [view,      setView]      = useState('agents') // 'agents' | 'table'
  const [selected,  setSelected]  = useState(null)
  const [form,      setForm]      = useState(BLANK)
  const [saving,    setSaving]    = useState(false)
  const [confirmDel,setConfirmDel]= useState(false)
  const [deals,     setDeals]     = useState([])
  const [tab,       setTab]       = useState('info')

  // Add/delete agent modal
  const [showAddAgent,  setShowAddAgent]  = useState(false)
  const [agentForm,     setAgentForm]     = useState({ name:'', email:'', phone:'', role:'agent', color:'#CC2200' })
  const [savingAgent,   setSavingAgent]   = useState(false)
  const [confirmDelAg,  setConfirmDelAg]  = useState(null)

  // Load deals for connection
  useEffect(() => {
    supabase.from('deals').select('id,addr,agent_id,stage,gci,production')
      .then(r => setDeals(r.data||[]))
      .catch(()=>{})
  }, [])

  useEffect(() => {
    if (urlId && offers.length > 0 && urlId !== 'new') {
      const o = offers.find(x => x.id === urlId)
      if (o) openOffer(o)
    }
  }, [urlId, offers.length])

  function openOffer(o) {
    navigate('/offers/' + o.id, { replace:true })
    setSelected(o); setForm({ ...BLANK, ...o }); setTab('info')
  }
  function openAdd() {
    setSelected(null)
    setForm({ ...BLANK, agent_id: agentF && agentF !== 'none' ? agentF : (agent?.id || '') })
    navigate('/offers/new', { replace:true })
  }
  function closePanel() { setSelected(null); navigate('/offers', { replace:true }) }
  function set(k, v)    { setForm(f => ({ ...f, [k]:v })) }

  async function saveOffer() {
    if (!form.listing_addr?.trim()) { toast('Listing address is required', '#DC2626'); return }
    setSaving(true)
    try {
      if (selected) {
        const updated = await update(selected.id, form)
        setSelected(updated); toast('✅ Offer saved')
      } else {
        await add({ ...form, agent_id: form.agent_id || agent?.id })
        toast('✅ Offer added'); closePanel()
      }
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  async function deleteOffer() {
    try { await remove(selected.id); toast('Offer deleted'); closePanel() }
    catch(e) { toast('Delete failed: ' + e.message, '#DC2626') }
    finally { setConfirmDel(false) }
  }

  // Add new agent
  async function saveAgent() {
    if (!agentForm.name.trim()) { toast('Name is required', '#F5A623'); return }
    setSavingAgent(true)
    try {
      const { data, error } = await supabase.from('agents').insert({
        name:       agentForm.name.trim(),
        email:      agentForm.email.trim(),
        phone:      agentForm.phone.trim(),
        role:       agentForm.role,
        color:      agentForm.color,
        active:     true,
        created_at: new Date().toISOString(),
      }).select().single()
      if (error) throw error
      toast('✅ Agent added — ' + data.name)
      setShowAddAgent(false)
      setAgentForm({ name:'', email:'', phone:'', role:'agent', color:'#CC2200' })
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
    finally { setSavingAgent(false) }
  }

  // Delete agent
  async function deleteAgent(ag) {
    try {
      await supabase.from('agents').update({ active: false }).eq('id', ag.id)
      toast(ag.name + ' removed')
      setConfirmDelAg(null)
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
  }

  const filtered = offers.filter(o => {
    if (statusF && o.status !== statusF) return false
    if (agentF === 'none' && o.agent_id) return false
    if (agentF && agentF !== 'none' && o.agent_id !== agentF) return false
    if (search && !matchSearch(o, search, ['listing_addr','buyer_name'])) return false
    return true
  })

  const statusColor = (s) => OFFER_STATUSES.find(x => x.value === s)?.hex || '#c4c4c4'
  const totalOffers = offers.length
  const totalAO     = offers.filter(o => ['AO','Accepted','Closed'].includes(o.status)).length
  const totalAmt    = offers.reduce((s,o)=>s+(parseFloat(o.production)||0),0)

  // Find linked deal for an offer
  function linkedDeal(offer) {
    return deals.find(d =>
      d.agent_id === offer.agent_id &&
      (d.addr?.toLowerCase().includes(offer.listing_addr?.toLowerCase().slice(0,15)) ||
       offer.listing_addr?.toLowerCase().includes(d.addr?.toLowerCase().slice(0,15)))
    )
  }

  const AGENT_COLORS = ['#CC2200','#3B82F6','#10B981','#8B5CF6','#F5A623','#EC4899','#14B8A6','#6366F1']

  return (
    <div style={{ fontFamily:ff }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:900, color:'var(--text)' }}>📝 Offers</div>
          <div style={{ fontSize:13, color:'var(--muted)', marginTop:2 }}>
            {totalOffers} total · {totalAO} accepted · {fmt$(totalAmt)} total volume
          </div>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {(isAdmin||canManage) && (
            <button onClick={()=>setShowAddAgent(true)}
              style={{ padding:'8px 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--text)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
              + Add Agent
            </button>
          )}
          <div style={{ display:'flex', background:'var(--dim)', borderRadius:8, padding:2, gap:2 }}>
            {[['agents','👥 By Agent'],['table','📋 Table']].map(([v,l])=>(
              <button key={v} onClick={()=>setView(v)}
                style={{ padding:'6px 12px', borderRadius:6, border:'none', background:view===v?'var(--panel)':'transparent', color:view===v?'var(--text)':'var(--muted)', fontSize:12, fontWeight:view===v?700:400, cursor:'pointer', fontFamily:ff, boxShadow:view===v?'0 1px 3px rgba(0,0,0,.1)':'none' }}>
                {l}
              </button>
            ))}
          </div>
          <Btn onClick={openAdd}>+ Add Offer</Btn>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search address, buyer..." style={{ flex:1, minWidth:200 }} />
        <select value={statusF} onChange={e=>setStatusF(e.target.value)}
          style={{ padding:'9px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }}>
          <option value="">All Statuses</option>
          {OFFER_STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {(isAdmin||canManage) && (
          <select value={agentF} onChange={e=>setAgentF(e.target.value)}
            style={{ padding:'9px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }}>
            <option value="">All Agents</option>
            {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>

      {loading && <Loading />}

      {!loading && (
        <>
          {/* ── AGENT VIEW ── */}
          {view === 'agents' && (isAdmin||canManage) && (
            <div>
              {/* Agent stats grid */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:12, marginBottom:24 }}>
                {agents.map(ag => (
                  <AgentStatsCard
                    key={ag.id}
                    ag={ag}
                    agentOffers={offers.filter(o=>o.agent_id===ag.id)}
                    deals={deals}
                    onFilter={id => setAgentF(agentF===id?'':id)}
                    isActive={agentF===ag.id}
                  />
                ))}
                {(isAdmin||canManage) && (
                  <div onClick={()=>setShowAddAgent(true)}
                    style={{ borderRadius:12, border:'2px dashed var(--border)', padding:'14px 16px', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, minHeight:140 }}
                    onMouseEnter={e=>e.currentTarget.style.borderColor='#CC2200'}
                    onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                    <div style={{ fontSize:28 }}>+</div>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--muted)' }}>Add Agent</div>
                  </div>
                )}
              </div>

              {/* Offers for selected agent (or all) */}
              {filtered.length > 0 && (
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:10 }}>
                    {agentF ? agents.find(a=>a.id===agentF)?.name + '\'s Offers' : 'All Offers'} ({filtered.length})
                  </div>
                  <OfferTable offers={filtered} agents={agents} deals={deals} onOpen={openOffer} statusColor={statusColor} linkedDeal={linkedDeal} />
                </div>
              )}
              {filtered.length === 0 && search && <Empty icon="📝" title="No offers match" sub="Try clearing search or filters." />}
            </div>
          )}

          {/* ── TABLE VIEW (or non-admin) ── */}
          {(view === 'table' || !(isAdmin||canManage)) && (
            <>
              {filtered.length === 0
                ? <Empty icon="📝" title="No offers" sub="Track submitted offers here." action={<Btn onClick={openAdd}>+ Add Offer</Btn>} />
                : <OfferTable offers={filtered} agents={agents} deals={deals} onOpen={openOffer} statusColor={statusColor} linkedDeal={linkedDeal} />
              }
            </>
          )}
        </>
      )}

      {/* ── OFFER MODAL ── */}
      <Modal open={!!(selected || urlId==='new')} onClose={closePanel}
        title={selected ? 'Offer — ' + selected.listing_addr : 'New Offer'} width={560}>
        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)', marginBottom:16, gap:0 }}>
          {[['info','Details'],['docs','📎 Documents'],['activity','📋 Activity']].map(([id,label])=>(
            <button key={id} onClick={()=>setTab(id)}
              style={{ padding:'7px 14px', border:'none', background:'none', cursor:'pointer',
                borderBottom:tab===id?'2px solid #CC2200':'2px solid transparent', marginBottom:'-1px',
                fontSize:12, fontWeight:tab===id?700:400, color:tab===id?'#CC2200':'var(--muted)', fontFamily:ff }}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'info' && (
          <>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <Field label="Listing Address" required>
                <AddressAutocomplete value={form.listing_addr||''} onChange={v=>set('listing_addr',v)} placeholder="123 Main St, Monsey NY" />
              </Field>
              <Field label="Buyer Name">
                <Input value={form.buyer_name} onChange={v=>set('buyer_name',v)} placeholder="John Smith" />
              </Field>
              <Field label="Side">
                <Select value={form.side} onChange={v=>set('side',v)} options={OFFER_SIDES} />
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={v=>set('status',v)} options={OFFER_STATUSES} />
              </Field>
              <Field label="Offer Price $">
                <Input value={form.production} onChange={v=>set('production',v)} placeholder="500,000" type="number" />
              </Field>
              <Field label="GCI $">
                <Input value={form.gci} onChange={v=>set('gci',v)} placeholder="15,000" type="number" />
              </Field>
              <Field label="Date Submitted">
                <Input value={form.submitted_at} onChange={v=>set('submitted_at',v)} type="date" />
              </Field>
              <Field label="Offer Expiry">
                <Input value={form.expiry} onChange={v=>set('expiry',v)} type="date" />
              </Field>
            </div>
            {(isAdmin||canManage) && (
              <Field label="Assigned Agent">
                <Select value={form.agent_id||''} onChange={v=>set('agent_id',v)}
                  options={agents.map(a=>({ value:a.id, label:a.name }))} placeholder="Assign agent" />
              </Field>
            )}
            {/* Link to deal */}
            {selected && linkedDeal(selected) && (
              <div style={{ padding:'10px 14px', background:'rgba(59,130,246,.08)', borderRadius:10, border:'1px solid rgba(59,130,246,.2)', marginBottom:12, display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:18 }}>💼</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#3B82F6' }}>Linked Deal in Production</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>{linkedDeal(selected).addr} · {linkedDeal(selected).stage}</div>
                </div>
                <button onClick={()=>navigate('/production?deal='+linkedDeal(selected).id)}
                  style={{ padding:'4px 10px', borderRadius:7, border:'none', background:'#3B82F6', color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
                  View →
                </button>
              </div>
            )}
            <Field label="Notes">
              <Textarea value={form.notes} onChange={v=>set('notes',v)} placeholder="Offer notes, terms, conditions..." rows={3} />
            </Field>
          </>
        )}

        {tab === 'docs' && (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ padding:'12px 14px', background:'var(--dim)', borderRadius:10, border:'1px solid var(--border)', fontSize:12, color:'var(--muted)', lineHeight:1.6 }}>
              Upload the signed offer document and proof of funds. Files are stored securely and accessible to all team members.
              <br/><strong style={{ color:'var(--text)' }}>Supabase setup:</strong> Create a bucket named <code style={{ fontFamily:'monospace', color:'#CC2200' }}>offer-docs</code> and set it to <strong>Public</strong> in Supabase Storage.
            </div>
            <FileUploader
              label="📄 Offer Document (PDF)"
              fileUrl={form.offer_url}
              onUploaded={url=>set('offer_url',url)}
              accept="application/pdf,image/*"
              folder="offers"
            />
            <FileUploader
              label="💰 Proof of Funds (PDF / Image)"
              fileUrl={form.pof_url}
              onUploaded={url=>set('pof_url',url)}
              accept="application/pdf,image/*"
              folder="pof"
            />
          </div>
        )}

        {tab === 'activity' && selected?.id && (
          <RecordActivityFeed table="offers" recordId={selected.id} />
        )}

        <ModalActions>
          {selected && <Btn variant="ghost" style={{ marginRight:'auto', color:'#DC2626' }} onClick={()=>setConfirmDel(true)}>Delete</Btn>}
          <Btn variant="secondary" onClick={closePanel}>Cancel</Btn>
          <Btn onClick={saveOffer} loading={saving}>{selected?'Save Changes':'Add Offer'}</Btn>
        </ModalActions>
      </Modal>

      {/* ── ADD AGENT MODAL ── */}
      <Modal open={showAddAgent} onClose={()=>setShowAddAgent(false)} title="Add Agent" width={420}>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <Field label="Full Name">
            <Input value={agentForm.name} onChange={v=>setAgentForm(f=>({...f,name:v}))} placeholder="e.g. Mendy Jankovits" />
          </Field>
          <Field label="Email">
            <Input value={agentForm.email} onChange={v=>setAgentForm(f=>({...f,email:v}))} placeholder="agent@example.com" />
          </Field>
          <Field label="Phone">
            <Input value={agentForm.phone} onChange={v=>setAgentForm(f=>({...f,phone:v}))} placeholder="845-555-0100" />
          </Field>
          <Field label="Role">
            <Select value={agentForm.role} onChange={v=>setAgentForm(f=>({...f,role:v}))}
              options={[{value:'agent',label:'Agent'},{value:'secretary',label:'Secretary'},{value:'admin',label:'Admin'}]} />
          </Field>
          <Field label="Color">
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {AGENT_COLORS.map(c=>(
                <div key={c} onClick={()=>setAgentForm(f=>({...f,color:c}))}
                  style={{ width:28, height:28, borderRadius:'50%', background:c, cursor:'pointer', border:agentForm.color===c?'3px solid var(--text)':'2px solid transparent', transition:'border .1s' }} />
              ))}
            </div>
          </Field>
        </div>
        <ModalActions>
          <Btn variant="secondary" onClick={()=>setShowAddAgent(false)}>Cancel</Btn>
          <Btn onClick={saveAgent} loading={savingAgent}>Add Agent</Btn>
        </ModalActions>
      </Modal>

      {/* ── DELETE AGENT CONFIRM ── */}
      {confirmDelAg && (
        <div onClick={()=>setConfirmDelAg(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:ff }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'var(--panel)', borderRadius:14, padding:24, maxWidth:360, width:'100%', margin:16 }}>
            <div style={{ fontSize:16, fontWeight:800, color:'var(--text)', marginBottom:8 }}>Remove {confirmDelAg.name}?</div>
            <div style={{ fontSize:13, color:'var(--muted)', marginBottom:20, lineHeight:1.6 }}>
              This will hide {confirmDelAg.name} from the active agents list. Their offers and deals will remain.
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <Btn variant="secondary" onClick={()=>setConfirmDelAg(null)}>Cancel</Btn>
              <Btn style={{ background:'#DC2626' }} onClick={()=>deleteAgent(confirmDelAg)}>Remove Agent</Btn>
            </div>
          </div>
        </div>
      )}

      <Confirm open={confirmDel} message="Delete this offer?" onConfirm={deleteOffer} onCancel={()=>setConfirmDel(false)} />
    </div>
  )
}

// ── OFFER TABLE COMPONENT ─────────────────────────────────────────
function OfferTable({ offers, agents, deals, onOpen, statusColor, linkedDeal }) {
  return (
    <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', overflow:'hidden' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
        <thead>
          <tr style={{ background:'var(--dim)' }}>
            {['Address','Buyer','Agent','Side','Status','Offer Price','GCI','Submitted','Deal','Files'].map(h=>(
              <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.04em', borderBottom:'2px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {offers.map(o=>{
            const ag   = agents.find(a=>a.id===o.agent_id)
            const deal = linkedDeal(o)
            return (
              <tr key={o.id} onClick={()=>onOpen(o)}
                style={{ borderBottom:'1px solid var(--border)', cursor:'pointer' }}
                onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'}
                onMouseLeave={e=>e.currentTarget.style.background=''}>
                <td style={{ padding:'10px 12px', fontWeight:600, color:'var(--text)' }}>{o.listing_addr}</td>
                <td style={{ padding:'10px 12px', color:'var(--muted)' }}>{o.buyer_name||'—'}</td>
                <td style={{ padding:'10px 12px' }}>
                  {ag ? (
                    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <div style={{ width:22, height:22, borderRadius:'50%', background:ag.color||'#CC2200', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:'#fff', flexShrink:0 }}>
                        {(ag.name||'').split(' ').map(n=>n[0]).join('').slice(0,2)}
                      </div>
                      <span style={{ fontSize:12, color:'var(--muted)' }}>{ag.name?.split(' ')[0]}</span>
                    </div>
                  ) : '—'}
                </td>
                <td style={{ padding:'10px 12px', color:'var(--muted)', fontSize:12 }}>{o.side}</td>
                <td style={{ padding:'10px 12px' }}><Pill label={o.status} color={statusColor(o.status)} /></td>
                <td style={{ padding:'10px 12px', fontWeight:600 }}>{fmt$(o.production)}</td>
                <td style={{ padding:'10px 12px', fontWeight:700, color:'#10B981' }}>{fmt$(o.gci)}</td>
                <td style={{ padding:'10px 12px', color:'var(--muted)', fontSize:12 }}>{fmtDate(o.submitted_at)}</td>
                <td style={{ padding:'10px 12px' }}>
                  {deal
                    ? <span style={{ fontSize:11, padding:'2px 8px', borderRadius:10, background:'rgba(59,130,246,.1)', color:'#3B82F6', fontWeight:700 }}>💼 {deal.stage}</span>
                    : <span style={{ fontSize:11, color:'var(--muted)' }}>—</span>
                  }
                </td>
                <td style={{ padding:'10px 12px' }}>
                  <div style={{ display:'flex', gap:5 }}>
                    {o.offer_url && <a href={o.offer_url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{ fontSize:16, textDecoration:'none' }} title="Offer doc">📄</a>}
                    {o.pof_url   && <a href={o.pof_url}   target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{ fontSize:16, textDecoration:'none' }} title="Proof of funds">💰</a>}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
