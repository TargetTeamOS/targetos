// TargetOS V2 — Custom Fields Manager
// Admin-only page to define extra fields for contacts, deals, listings.
// Fields are stored in system_settings. Values go into custom_data jsonb.
import React, { useState, useEffect } from 'react'
import { useAuth }  from '../context/AuthContext'
import { useApp }   from '../context/AppContext'
import {
  loadFieldDefs, saveFieldDefs, invalidateFieldCache,
  labelToKey, FIELD_TYPES, ENTITY_LABELS
} from '../lib/customFields'
import { PageHeader, Btn, Modal, ModalActions, Field, Input, SectionTitle } from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'
const S  = { width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }
const CARD = { background:'var(--panel)', borderRadius:'var(--radius)', border:'1px solid var(--border)', padding:16, marginBottom:8 }

const BLANK = { label:'', key:'', type:'text', entity:'contacts', options:[], section:'', required:false, active:true, order:0 }

export function CustomFields() {
  const { isAdmin }  = useAuth()
  const { toast }    = useApp()
  const [fields,     setFields]   = useState([])
  const [loading,    setLoading]  = useState(true)
  const [saving,     setSaving]   = useState(false)
  const [showAdd,    setShowAdd]  = useState(false)
  const [editField,  setEditField] = useState(null)
  const [form,       setForm]     = useState(BLANK)
  const [optionText, setOptionText] = useState('')
  const [entityTab,  setEntityTab]  = useState('contacts')

  useEffect(() => {
    loadFieldDefs().then(d => { setFields(d || []); setLoading(false) })
  }, [])

  function set(k, v) {
    setForm(p => {
      const updated = { ...p, [k]: v }
      // Auto-generate key from label if key hasn't been manually set
      if (k === 'label' && (!p.key || p.key === labelToKey(p.label))) {
        updated.key = labelToKey(v)
      }
      return updated
    })
  }

  function openAdd() {
    setForm({ ...BLANK, entity: entityTab, order: fields.filter(f=>f.entity===entityTab).length })
    setOptionText('')
    setEditField(null)
    setShowAdd(true)
  }

  function openEdit(field) {
    setForm({ ...field })
    setOptionText('')
    setEditField(field.id)
    setShowAdd(true)
  }

  async function saveField() {
    if (!form.label.trim()) { toast('Label is required', '#DC2626'); return }
    if (!form.key.trim())   { toast('Key is required', '#DC2626'); return }
    if (form.type === 'select' && (!form.options || form.options.length === 0)) {
      toast('Add at least one option for dropdown fields', '#DC2626'); return
    }

    setSaving(true)
    try {
      let updated
      if (editField) {
        updated = fields.map(f => f.id === editField ? { ...form, id: editField } : f)
      } else {
        const newField = { ...form, id: Date.now().toString() + Math.random().toString(36).slice(2) }
        // Check for duplicate key
        if (fields.some(f => f.entity === form.entity && f.key === form.key)) {
          toast('A field with this key already exists for ' + ENTITY_LABELS[form.entity], '#DC2626')
          setSaving(false); return
        }
        updated = [...fields, newField]
      }
      await saveFieldDefs(updated)
      invalidateFieldCache()
      setFields(updated)
      setShowAdd(false)
      toast('✅ Field saved — will appear on ' + ENTITY_LABELS[form.entity])
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  async function toggleActive(id) {
    const updated = fields.map(f => f.id === id ? { ...f, active: !f.active } : f)
    await saveFieldDefs(updated).catch(() => {})
    invalidateFieldCache()
    setFields(updated)
  }

  async function deleteField(id, label) {
    if (!window.confirm('Delete field "' + label + '"?\n\nValues already saved on records will still be in the database but won\'t be visible.')) return
    const updated = fields.filter(f => f.id !== id)
    await saveFieldDefs(updated)
    invalidateFieldCache()
    setFields(updated)
    toast('Field deleted')
  }

  function moveField(id, dir) {
    const entity = fields.find(f=>f.id===id)?.entity
    const entityFields = fields.filter(f=>f.entity===entity).sort((a,b)=>(a.order||0)-(b.order||0))
    const idx = entityFields.findIndex(f=>f.id===id)
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= entityFields.length) return
    // Swap orders
    const a = entityFields[idx], b = entityFields[newIdx]
    const updated = fields.map(f => {
      if (f.id === a.id) return { ...f, order: b.order ?? newIdx }
      if (f.id === b.id) return { ...f, order: a.order ?? idx }
      return f
    })
    saveFieldDefs(updated).catch(()=>{})
    setFields(updated)
  }

  const entityFields = fields
    .filter(f => f.entity === entityTab)
    .sort((a,b) => (a.order||0) - (b.order||0))

  if (!isAdmin) return (
    <div style={{ padding:40, textAlign:'center', fontFamily:ff }}>
      <div style={{ fontSize:40, marginBottom:12 }}>🔒</div>
      <div style={{ fontSize:14, color:'var(--muted)' }}>Admin access required</div>
    </div>
  )

  return (
    <div style={{ fontFamily:ff }}>
      <PageHeader
        title="Custom Fields"
        sub="Add extra fields to contacts, deals, and listings — no code needed"
        actions={<Btn onClick={openAdd}>+ New Field</Btn>}
      />

      {/* Info box */}
      <div style={{ padding:'12px 14px', background:'rgba(59,130,246,.07)', border:'1px solid rgba(59,130,246,.2)', borderRadius:10, marginBottom:16, fontSize:12, color:'var(--text)', lineHeight:1.7 }}>
        <strong>How it works:</strong> Fields you define here appear automatically on the contact/deal/listing detail page.
        Values are saved with each record. You can reorder, hide, or delete fields at any time.<br/>
        <strong>SQL required (one-time):</strong>{' '}
        <code style={{ background:'rgba(0,0,0,.06)', padding:'1px 5px', borderRadius:4, fontSize:11 }}>
          alter table contacts add column if not exists custom_data jsonb default '{"{}"}';
          alter table deals add column if not exists custom_data jsonb default '{"{}"}';
          alter table listings add column if not exists custom_data jsonb default '{"{}"}';
        </code>
      </div>

      {/* Entity tabs */}
      <div style={{ display:'flex', gap:6, marginBottom:16 }}>
        {Object.entries(ENTITY_LABELS).map(([key, label]) => {
          const count = fields.filter(f=>f.entity===key).length
          const active = entityTab === key
          return (
            <button key={key} onClick={() => { setEntityTab(key) }}
              style={{ padding:'7px 16px', borderRadius:20, border:'1px solid '+(active?'var(--brand)':'var(--border)'), background:active?'rgba(204,34,0,.08)':'transparent', color:active?'var(--brand)':'var(--muted)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
              {label} {count > 0 && <span style={{ opacity:.7 }}>({count})</span>}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ padding:32, textAlign:'center', color:'var(--muted)', fontSize:13 }}>Loading...</div>
      ) : entityFields.length === 0 ? (
        <div style={{ textAlign:'center', padding:48, color:'var(--muted)', fontSize:13 }}>
          <div style={{ fontSize:36, marginBottom:12 }}>📋</div>
          No custom fields for {ENTITY_LABELS[entityTab]} yet.<br/>
          <button onClick={openAdd} style={{ marginTop:12, padding:'8px 18px', borderRadius:8, border:'none', background:'var(--brand)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
            + Add First Field
          </button>
        </div>
      ) : (
        <div>
          {entityFields.map((field, idx) => {
            const typeDef = FIELD_TYPES.find(t=>t.value===field.type)
            return (
              <div key={field.id} style={{ ...CARD, opacity: field.active === false ? .5 : 1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  {/* Reorder */}
                  <div style={{ display:'flex', flexDirection:'column', gap:2, flexShrink:0 }}>
                    <button onClick={()=>moveField(field.id,-1)} disabled={idx===0}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:12, padding:'1px 4px', opacity:idx===0?.3:1 }}>▲</button>
                    <button onClick={()=>moveField(field.id,1)} disabled={idx===entityFields.length-1}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:12, padding:'1px 4px', opacity:idx===entityFields.length-1?.3:1 }}>▼</button>
                  </div>

                  {/* Type icon */}
                  <div style={{ fontSize:18, flexShrink:0 }}>{typeDef?.icon || '📝'}</div>

                  {/* Info */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>{field.label}</span>
                      {field.required && <span style={{ fontSize:10, color:'#DC2626', fontWeight:700, background:'rgba(220,38,38,.1)', padding:'1px 6px', borderRadius:99 }}>Required</span>}
                      {field.active === false && <span style={{ fontSize:10, color:'var(--muted)', fontWeight:700, background:'var(--dim)', padding:'1px 6px', borderRadius:99 }}>Hidden</span>}
                    </div>
                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
                      {typeDef?.label} · key: <code style={{ fontSize:10 }}>{field.key}</code>
                      {field.section && <> · section: {field.section}</>}
                      {field.type === 'select' && field.options?.length > 0 && <> · {field.options.length} options</>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                    <button onClick={()=>toggleActive(field.id)}
                      style={{ padding:'4px 10px', borderRadius:6, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', fontSize:11, cursor:'pointer', fontFamily:ff }}>
                      {field.active === false ? '👁 Show' : '🙈 Hide'}
                    </button>
                    <button onClick={()=>openEdit(field)}
                      style={{ padding:'4px 10px', borderRadius:6, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', fontSize:11, cursor:'pointer', fontFamily:ff }}>
                      Edit
                    </button>
                    <button onClick={()=>deleteField(field.id, field.label)}
                      style={{ padding:'4px 10px', borderRadius:6, border:'1px solid rgba(220,38,38,.3)', background:'transparent', color:'#DC2626', fontSize:11, cursor:'pointer', fontFamily:ff }}>
                      ×
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal open={showAdd} onClose={()=>setShowAdd(false)} title={editField ? 'Edit Field' : 'New Custom Field'} width={500}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:5 }}>Entity</div>
            <select value={form.entity} onChange={e=>set('entity',e.target.value)} style={S} disabled={!!editField}>
              {Object.entries(ENTITY_LABELS).map(([k,l])=><option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:5 }}>Field Type</div>
            <select value={form.type} onChange={e=>set('type',e.target.value)} style={S}>
              {FIELD_TYPES.map(t=><option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
            </select>
          </div>
        </div>

        <Field label="Field Label (shown to users)">
          <Input value={form.label} onChange={v=>set('label',v)} placeholder="e.g. HOA Amount" />
        </Field>

        <Field label="Key (auto-generated, used internally)" hint="Letters, numbers, underscores only">
          <Input value={form.key} onChange={v=>set('key', v.toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,40))} placeholder="e.g. hoa_amount" />
        </Field>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
          <Field label="Section / Group (optional)">
            <Input value={form.section||''} onChange={v=>set('section',v)} placeholder="e.g. Financial Info" />
          </Field>
          <div style={{ paddingTop:20 }}>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:'var(--text)' }}>
              <input type="checkbox" checked={!!form.required} onChange={e=>set('required',e.target.checked)} style={{ width:16, height:16, accentColor:'var(--brand)' }} />
              Required field
            </label>
          </div>
        </div>

        {form.type === 'select' && (
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>Dropdown Options</div>
            <div style={{ display:'flex', gap:8, marginBottom:8 }}>
              <input value={optionText} onChange={e=>setOptionText(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter'&&optionText.trim()){ set('options',[...(form.options||[]),optionText.trim()]); setOptionText('') } }}
                placeholder="Type option, press Enter" style={{...S,flex:1}} />
              <button onClick={()=>{ if(optionText.trim()){set('options',[...(form.options||[]),optionText.trim()]);setOptionText('')} }}
                style={{ padding:'7px 14px', borderRadius:8, border:'none', background:'var(--brand)', color:'#fff', fontSize:13, cursor:'pointer', fontFamily:ff }}>Add</button>
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {(form.options||[]).map((opt,i)=>(
                <div key={i} style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 10px', borderRadius:99, background:'var(--dim)', border:'1px solid var(--border)', fontSize:12 }}>
                  <span>{opt}</span>
                  <button onClick={()=>set('options',(form.options||[]).filter((_,j)=>j!==i))}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#DC2626', fontSize:14, padding:0, marginLeft:4 }}>×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <ModalActions>
          <Btn variant="secondary" onClick={()=>setShowAdd(false)}>Cancel</Btn>
          <Btn onClick={saveField} loading={saving}>Save Field</Btn>
        </ModalActions>
      </Modal>
    </div>
  )
}
