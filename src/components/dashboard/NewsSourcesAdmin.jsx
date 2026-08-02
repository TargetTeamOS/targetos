// NewsSourcesAdmin — admin-only editor for the configurable news feeds. Every
// mutation goes through the security-definer RPCs (app_news_sources_list /
// app_news_source_upsert / app_news_source_delete), which re-check admin rights
// server-side, so this UI is a convenience layer, not the security boundary.

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { categoryLabel } from '../../lib/marketFormat'

const FF = 'Inter, system-ui, -apple-system, sans-serif'
const CATEGORIES = ['real_estate', 'housing', 'zoning', 'development', 'taxes', 'local_business', 'community']

export function NewsSourcesAdmin({ open, onClose, onChanged }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState({ name: '', url: '', category: 'community' })

  const load = useCallback(async () => {
    setError(null)
    const { data, error } = await supabase.rpc('app_news_sources_list')
    if (error) { setError(error.message); return }
    const arr = Array.isArray(data) ? data : (data && !data.error ? data : [])
    if (data && data.error) { setError('You need admin access to manage sources.'); setRows([]); return }
    setRows(arr)
  }, [])

  useEffect(() => { if (open) load() }, [open, load])

  const save = useCallback(async (p) => {
    setBusy(true); setError(null)
    const { data, error } = await supabase.rpc('app_news_source_upsert', { p })
    setBusy(false)
    if (error || (data && data.error)) { setError((error && error.message) || 'Save failed.'); return false }
    await load(); onChanged && onChanged()
    return true
  }, [load, onChanged])

  const remove = useCallback(async (id) => {
    setBusy(true); setError(null)
    const { data, error } = await supabase.rpc('app_news_source_delete', { p_id: id })
    setBusy(false)
    if (error || (data && data.error)) { setError((error && error.message) || 'Delete failed.'); return }
    await load(); onChanged && onChanged()
  }, [load, onChanged])

  if (!open) return null

  const addNew = async () => {
    if (!draft.name.trim()) { setError('Give the source a name.'); return }
    const ok = await save({ ...draft, enabled: !!draft.url, position: (rows?.length || 0) + 10 })
    if (ok) setDraft({ name: '', url: '', category: 'community' })
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Manage news sources"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose && onClose() }}
         style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 24, fontFamily: FF }}>
      <div style={{ background: '#fff', width: 'min(640px,100%)', maxHeight: '85vh', borderRadius: 12, boxShadow: '0 20px 60px rgba(2,6,23,.28)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ padding: '16px 18px', borderBottom: '1px solid #eef2f7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>News sources</h2>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 16 }}>×</button>
        </header>

        <div style={{ padding: 16, overflowY: 'auto' }}>
          {error && <p role="status" style={{ margin: '0 0 10px', color: '#b42318', fontSize: 13 }}>{error}</p>}
          {rows == null ? (
            <p style={{ color: '#64748b', fontSize: 13 }}>Loading sources…</p>
          ) : (
            <>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                {rows.map((s) => (
                  <li key={s.id} style={{ border: '1px solid #eef2f7', borderRadius: 10, padding: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{s.name} {s.is_fallback && <span style={badge}>fallback</span>}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.url || 'No feed URL yet'} · {categoryLabel(s.category)}</div>
                    </div>
                    <label style={{ fontSize: 12, color: '#475569', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <input type="checkbox" checked={!!s.enabled} disabled={busy || !s.url}
                             onChange={(e) => save({ id: s.id, name: s.name, url: s.url, category: s.category, enabled: e.target.checked, position: s.position })} />
                      Enabled
                    </label>
                    <button onClick={() => remove(s.id)} disabled={busy} aria-label={'Delete ' + s.name} style={smallBtn}>Delete</button>
                  </li>
                ))}
                {rows.length === 0 && <li style={{ color: '#64748b', fontSize: 13 }}>No sources yet.</li>}
              </ul>

              <div style={{ marginTop: 14, borderTop: '1px solid #eef2f7', paddingTop: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Add a source</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input placeholder="Name (e.g. Rockland County News)" value={draft.name} aria-label="Source name"
                         onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={input} />
                  <select value={draft.category} aria-label="Category" onChange={(e) => setDraft({ ...draft, category: e.target.value })} style={input}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
                  </select>
                  <input placeholder="Feed URL (https://…)" value={draft.url} aria-label="Feed URL"
                         onChange={(e) => setDraft({ ...draft, url: e.target.value })} style={{ ...input, gridColumn: '1 / -1' }} />
                </div>
                <button onClick={addNew} disabled={busy} style={{ ...smallBtn, marginTop: 10 }}>Add source</button>
                <p style={{ margin: '8px 0 0', fontSize: 11, color: '#94a3b8' }}>A source is fetched and enabled only once it has a valid feed URL.</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const input = { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontFamily: FF, fontSize: 13, boxSizing: 'border-box', width: '100%' }
const smallBtn = { padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontFamily: FF, fontSize: 12 }
const badge = { fontSize: 10, color: '#64748b', background: '#f1f5f9', borderRadius: 999, padding: '1px 6px', marginLeft: 6 }

export default NewsSourcesAdmin
