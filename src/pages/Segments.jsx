// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Contact Segments / Smart Lists
// Dynamic saved filters that auto-update.
// Each segment shows a live count and can be used to send
// bulk SMS or emails.
// ═══════════════════════════════════════════════════════════════
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth }  from '../context/AuthContext'
import { useApp }   from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { PageHeader, Btn, Loading, Empty, Modal, ModalActions, Field, Input, Select, SectionTitle } from '../components/UI'
import { CONTACT_STATUSES, CONTACT_SOURCES } from '../lib/constants'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const SEGMENT_CONDITIONS = [
  { key:'status',   label:'Status is',    type:'select', options: CONTACT_STATUSES },
  { key:'source',   label:'Source is',    type:'select', options: (CONTACT_SOURCES||[]).map(s=>({value:s,label:s})) },
  { key:'type',     label:'Type is',      type:'select', options: ['Buyer','Seller','Investor','Renter'].map(v=>({value:v,label:v})) },
  { key:'stage',    label:'Stage is',     type:'select', options: ['SOI','Nurture','Active','Offer Accapted','Under Contract'].map(v=>({value:v,label:v})) },
  { key:'no_activity_days', label:'No activity for', type:'number', suffix:'days' },
  { key:'created_days',     label:'Added in last',   type:'number', suffix:'days' },
  { key:'has_phone',        label:'Has phone',       type:'bool' },
  { key:'has_email',        label:'Has email',       type:'bool' },
  { key:'assigned',         label:'Has assigned agent', type:'bool' },
  { key:'tags_contains',    label:'Tag contains',    type:'text' },
]

const BLANK_SEGMENT = { name:'', description:'', conditions:[], color:'#3B82F6', icon:'👥' }
const ICONS = ['👥','🔥','❄️','⭐','💰','🏠','🎯','📞','✉️','🌱']
const COLORS = ['#3B82F6','#10B981','#F5A623','#CC2200','#8B5CF6','#EC4899','#14B8A6','#6366F1']

export function Segments() {
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()
  const navigate  = useNavigate()

  const [segments, setSegments] = useState([])
  const [counts,   setCounts]   = useState({})
  const [loading,  setLoading]  = useState(true)
  const [showAdd,  setShowAdd]  = useState(false)
  const [form,     setForm]     = useState(BLANK_SEGMENT)
  const [saving,   setSaving]   = useState(false)
  const [agents,   setAgents]   = useState([])

  useEffect(() => { load() }, [])
  useEffect(() => { if (agents.length === 0) supabase.from('agents').select('id,name').eq('active',true).then(r=>setAgents(r.data||[])) }, [])

  async function load() {
    setLoading(true)
    try {
      const { data } = await supabase.from('contact_segments').select('*').order('created_at', {ascending:false})
      setSegments(data||[])
      // Compute live counts for each segment
      computeCounts(data||[])
    } catch(e) { console.warn('segments:', e.message) }
    finally { setLoading(false) }
  }

  async function computeCounts(segs) {
    const results = {}
    for (const seg of segs) {
      try {
        const count = await countContacts(seg.conditions||[])
        results[seg.id] = count
      } catch {}
    }
    setCounts(results)
  }

  async function countContacts(conditions) {
    let q = supabase.from('contacts').select('*', { count:'exact', head:true })
    conditions.forEach(c => q = applyCondition(q, c))
    const { count } = await q
    return count || 0
  }

  function applyCondition(q, cond) {
    if (cond.key === 'status'  && cond.value) return q.eq('status', cond.value)
    if (cond.key === 'source'  && cond.value) return q.eq('source', cond.value)
    if (cond.key === 'type'    && cond.value) return q.eq('type', cond.value)
    if (cond.key === 'stage'   && cond.value) return q.eq('stage', cond.value)
    if (cond.key === 'has_phone'   && cond.value === 'true') return q.not('phone','is',null).neq('phone','')
    if (cond.key === 'has_email'   && cond.value === 'true') return q.not('email','is',null).neq('email','')
    if (cond.key === 'assigned'    && cond.value === 'true') return q.not('agent_id','is',null)
    if (cond.key === 'created_days' && cond.value) {
      const d = new Date(); d.setDate(d.getDate() - parseInt(cond.value))
      return q.gte('created_at', d.toISOString())
    }
    if (cond.key === 'no_activity_days' && cond.value) {
      const d = new Date(); d.setDate(d.getDate() - parseInt(cond.value))
      return q.lt('updated_at', d.toISOString())
    }
    if (cond.key === 'tags_contains' && cond.value) return q.contains('tags', [cond.value])
    return q
  }

  function set(k,v) { setForm(p=>({...p,[k]:v})) }

  function addCondition() {
    setForm(p=>({...p, conditions:[...(p.conditions||[]),{key:'status',value:''}]}))
  }
  function removeCondition(i) {
    setForm(p=>({...p, conditions:p.conditions.filter((_,idx)=>idx!==i)}))
  }
  function setCondition(i,k,v) {
    setForm(p=>({...p, conditions:p.conditions.map((c,idx)=>idx===i?{...c,[k]:v}:c)}))
  }

  async function save() {
    if (!form.name.trim()) { toast('Name required','#DC2626'); return }
    setSaving(true)
    try {
      if (form.id) {
        await supabase.from('contact_segments').update({ ...form, updated_at:new Date().toISOString() }).eq('id', form.id)
      } else {
        await supabase.from('contact_segments').insert({ ...form, agent_id:agent?.id, created_at:new Date().toISOString(), updated_at:new Date().toISOString() })
      }
      toast('✅ Segment saved')
      setShowAdd(false); setForm(BLANK_SEGMENT)
      load()
    } catch(e) { toast('Save failed: '+e.message,'#DC2626') }
    finally { setSaving(false) }
  }

  async function deleteSegment(id) {
    if (!window.confirm('Delete this segment?')) return
    await supabase.from('contact_segments').delete().eq('id', id).catch(()=>{})
    setSegments(p=>p.filter(s=>s.id!==id))
    toast('Segment deleted')
  }

  function openContacts(seg) {
    // Navigate to contacts with this segment's conditions as a filter
    const params = new URLSearchParams({ segment: seg.id, segmentName: seg.name })
    navigate('/contacts?' + params.toString())
  }

  if (loading) return <Loading />

  return (
    <div style={{ fontFamily:ff }}>
      <PageHeader title="Segments" sub={segments.length + ' smart lists'}
        actions={<Btn onClick={() => { setForm(BLANK_SEGMENT); setShowAdd(true) }}>+ New Segment</Btn>} />

      {segments.length === 0 && (
        <Empty icon="👥" title="No segments yet" sub="Create dynamic contact lists that auto-update based on conditions."
          action={<Btn onClick={() => { setForm(BLANK_SEGMENT); setShowAdd(true) }}>+ New Segment</Btn>} />
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:12 }}>
        {segments.map(seg => {
          const count = counts[seg.id]
          return (
            <div key={seg.id} style={{ background:'var(--panel)', borderRadius:'var(--radius)', border:'1px solid var(--border)', padding:18, cursor:'pointer' }}
              onClick={() => openContacts(seg)}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:42, height:42, borderRadius:12, background:seg.color+'18', border:'1px solid '+seg.color+'44', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>
                    {seg.icon||'👥'}
                  </div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:800, color:'var(--text)' }}>{seg.name}</div>
                    {seg.description && <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>{seg.description}</div>}
                  </div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontSize:24, fontWeight:800, color:seg.color }}>{count ?? '...'}</div>
                  <div style={{ fontSize:9, color:'var(--muted)', fontWeight:600, textTransform:'uppercase' }}>contacts</div>
                </div>
              </div>

              {/* Conditions summary */}
              <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:12 }}>
                {(seg.conditions||[]).slice(0,3).map((c,i) => {
                  const def = SEGMENT_CONDITIONS.find(d=>d.key===c.key)
                  return (
                    <div key={i} style={{ fontSize:10, padding:'2px 7px', borderRadius:99, background:'var(--dim)', border:'1px solid var(--border)', color:'var(--muted)', fontWeight:600 }}>
                      {def?.label} {c.value}{def?.suffix?' '+def.suffix:''}
                    </div>
                  )
                })}
                {(seg.conditions||[]).length > 3 && (
                  <div style={{ fontSize:10, padding:'2px 7px', borderRadius:99, background:'var(--dim)', color:'var(--muted)' }}>+{seg.conditions.length-3} more</div>
                )}
              </div>

              <div style={{ display:'flex', gap:6 }} onClick={e=>e.stopPropagation()}>
                <button onClick={() => openContacts(seg)}
                  style={{ flex:1, padding:'6px 0', borderRadius:7, border:'1px solid var(--brand)', background:'rgba(204,34,0,.06)', color:'var(--brand)', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
                  View Contacts
                </button>
                {(isAdmin||canManage||seg.agent_id===agent?.id) && <>
                  <button onClick={() => { setForm({...seg}); setShowAdd(true) }}
                    style={{ padding:'6px 10px', borderRadius:7, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', fontSize:11, cursor:'pointer', fontFamily:ff }}>
                    Edit
                  </button>
                  <button onClick={() => deleteSegment(seg.id)}
                    style={{ padding:'6px 10px', borderRadius:7, border:'1px solid rgba(220,38,38,.3)', background:'transparent', color:'#DC2626', fontSize:11, cursor:'pointer', fontFamily:ff }}>
                    ×
                  </button>
                </>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Add/Edit Modal */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setForm(BLANK_SEGMENT) }} title={form.id?'Edit Segment':'New Segment'} width={520}>
        <Field label="Name"><Input value={form.name} onChange={v=>set('name',v)} placeholder="Hot Buyer Leads" /></Field>
        <Field label="Description (optional)"><Input value={form.description||''} onChange={v=>set('description',v)} placeholder="Buyers with high activity this month" /></Field>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
          <Field label="Color">
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', paddingTop:4 }}>
              {COLORS.map(c => <div key={c} onClick={() => set('color',c)} style={{ width:24, height:24, borderRadius:'50%', background:c, cursor:'pointer', border:form.color===c?'3px solid var(--text)':'2px solid transparent', transition:'border .1s' }} />)}
            </div>
          </Field>
          <Field label="Icon">
            <div style={{ display:'flex', gap:4, flexWrap:'wrap', paddingTop:4 }}>
              {ICONS.map(icon => <button key={icon} onClick={() => set('icon',icon)} style={{ fontSize:18, background:form.icon===icon?'var(--dim)':'transparent', border:form.icon===icon?'1px solid var(--border)':'1px solid transparent', borderRadius:6, padding:'2px 4px', cursor:'pointer' }}>{icon}</button>)}
            </div>
          </Field>
        </div>

        <SectionTitle>Conditions</SectionTitle>
        <div style={{ fontSize:12, color:'var(--muted)', marginBottom:10 }}>Contacts matching ALL conditions will be included.</div>

        {(form.conditions||[]).map((cond,i) => {
          const def = SEGMENT_CONDITIONS.find(d=>d.key===cond.key)
          return (
            <div key={i} style={{ display:'flex', gap:8, marginBottom:8, alignItems:'center' }}>
              <select value={cond.key} onChange={e=>setCondition(i,'key',e.target.value)} style={{ flex:1, padding:'7px 9px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff }}>
                {SEGMENT_CONDITIONS.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              {def?.type === 'select' ? (
                <select value={cond.value||''} onChange={e=>setCondition(i,'value',e.target.value)} style={{ flex:1, padding:'7px 9px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff }}>
                  <option value="">Any</option>
                  {(def.options||[]).map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
                </select>
              ) : def?.type === 'bool' ? (
                <select value={cond.value||'true'} onChange={e=>setCondition(i,'value',e.target.value)} style={{ flex:1, padding:'7px 9px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff }}>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : (
                <input value={cond.value||''} onChange={e=>setCondition(i,'value',e.target.value)} type={def?.type==='number'?'number':'text'}
                  style={{ flex:1, padding:'7px 9px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff }}
                  placeholder={def?.suffix||''} />
              )}
              {def?.suffix && <span style={{ fontSize:11, color:'var(--muted)', flexShrink:0 }}>{def.suffix}</span>}
              <button onClick={()=>removeCondition(i)} style={{ background:'none', border:'none', cursor:'pointer', color:'#DC2626', fontSize:18, padding:'0 4px', flexShrink:0 }}>×</button>
            </div>
          )
        })}

        <button onClick={addCondition} style={{ padding:'6px 14px', borderRadius:7, border:'1px dashed var(--border)', background:'transparent', color:'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:ff, marginBottom:16 }}>
          + Add condition
        </button>

        <ModalActions>
          <Btn variant="secondary" onClick={() => { setShowAdd(false); setForm(BLANK_SEGMENT) }}>Cancel</Btn>
          <Btn onClick={save} loading={saving}>Save Segment</Btn>
        </ModalActions>
      </Modal>
    </div>
  )
}
