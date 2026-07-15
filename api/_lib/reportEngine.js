// CommonJS copy of src/lib/reportEngine.js for the cron. Keep in sync.
// ═══════════════════════════════════════════════════════════════
// Report engine — computes metric blocks for a date range and renders
// them to HTML with deep links back into the CRM. Used by both the
// admin preview (client) and the scheduled cron (server), so the
// preview matches the sent email exactly.
//
// Deep links: every task/contact/deal line links to its record in the
// CRM (e.g. https://app.targetreteam.com/contacts/<id>). Clicking a
// line in the email opens that exact item.
// ═══════════════════════════════════════════════════════════════

const BASE = (typeof process !== 'undefined' && process.env && process.env.PUBLIC_BASE_URL) || 'https://app.targetreteam.com'

// Resolve a named range to {from,to} ISO date strings (ET-ish, date only)
function resolveRange(range) {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const d = new Date(now)
  const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()) // Sunday
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const ago7 = new Date(now); ago7.setDate(now.getDate() - 7)
  switch (range) {
    case 'today':       return { from: today, to: today }
    case 'last_7_days': return { from: ago7.toISOString().slice(0,10), to: today }
    case 'this_month':  return { from: startOfMonth.toISOString().slice(0,10), to: today }
    case 'this_week':
    case 'week_to_date':
    default:            return { from: startOfWeek.toISOString().slice(0,10), to: today }
  }
}

// Compute all requested blocks. `supabase` is passed in so this works
// on both client (anon) and server (service key).
async function computeReport(supabase, def) {
  const { from, to } = resolveRange(def.range)
  const toEnd = to + 'T23:59:59'
  const fromStart = from + 'T00:00:00'
  const filters = def.filters || {}
  const agentFilter = (q, col = 'agent_id') => (filters.agent_ids && filters.agent_ids.length) ? q.in(col, filters.agent_ids) : q

  const { data: agents } = await supabase.from('agents').select('id,name').eq('active', true)
  const agentName = id => (agents || []).find(a => a.id === id)?.name || 'Unassigned'

  const out = { range: { from, to }, blocks: [] }
  const blocks = def.blocks || []

  // Pull raw rows once, reuse across blocks
  const [calls, deals, tasks, contacts, listings, offers] = await Promise.all([
    agentFilter(supabase.from('calls').select('id,agent_id,created_at,duration,direction,outcome,contact_id')).gte('created_at', fromStart).lte('created_at', toEnd).then(r => r.data || []),
    agentFilter(supabase.from('deals').select('id,agent_id,addr,gci,stage,created_at')).gte('created_at', fromStart).lte('created_at', toEnd).then(r => r.data || []),
    agentFilter(supabase.from('tasks').select('id,agent_id,title,status,due_date,completed,contact_id,created_at')).gte('created_at', fromStart).lte('created_at', toEnd).then(r => r.data || []),
    supabase.from('contacts').select('id,first_name,last_name,created_at,agent_id').gte('created_at', fromStart).lte('created_at', toEnd).then(r => r.data || []),
    supabase.from('listings').select('id,addr,status,created_at,agent_id').gte('created_at', fromStart).lte('created_at', toEnd).then(r => r.data || []),
    supabase.from('offers').select('id,listing_addr,status,created_at,agent_id').gte('created_at', fromStart).lte('created_at', toEnd).then(r => r.data || []),
  ])

  if (blocks.includes('calls')) {
    out.blocks.push({ type: 'stat', title: '📞 Calls', value: calls.length,
      sub: calls.filter(c => c.direction === 'outbound').length + ' outbound · ' + calls.filter(c => c.direction === 'inbound').length + ' inbound' })
  }
  if (blocks.includes('deals')) {
    const gci = deals.reduce((s, d) => s + (Number(d.gci) || 0), 0)
    out.blocks.push({ type: 'stat', title: '💼 New Deals', value: deals.length, sub: '$' + gci.toLocaleString() + ' GCI' })
  }
  if (blocks.includes('tasks')) {
    const done = tasks.filter(t => t.status === 'completed' || t.completed).length
    const overdue = tasks.filter(t => t.status !== 'completed' && !t.completed && t.due_date && t.due_date < to).length
    out.blocks.push({ type: 'stat', title: '✅ Tasks', value: done + ' done', sub: overdue + ' overdue' })
    // linked list of overdue tasks
    const overdueList = tasks.filter(t => t.status !== 'completed' && !t.completed && t.due_date && t.due_date < to).slice(0, 15)
    if (overdueList.length) out.blocks.push({ type: 'list', title: 'Overdue tasks',
      items: overdueList.map(t => ({ label: t.title || 'Untitled task', meta: agentName(t.agent_id) + ' · due ' + t.due_date, href: BASE + '/tasks/' + t.id })) })
  }
  if (blocks.includes('contacts')) {
    out.blocks.push({ type: 'stat', title: '🧑 New Contacts', value: contacts.length, sub: 'added this period' })
    if (contacts.length) out.blocks.push({ type: 'list', title: 'New contacts',
      items: contacts.slice(0, 15).map(c => ({ label: ((c.first_name||'')+' '+(c.last_name||'')).trim() || 'Unnamed', meta: agentName(c.agent_id), href: BASE + '/contacts/' + c.id + '/detail' })) })
  }
  if (blocks.includes('listings')) {
    out.blocks.push({ type: 'stat', title: '🏡 Listings', value: listings.length, sub: 'new this period' })
    if (listings.length) out.blocks.push({ type: 'list', title: 'New listings',
      items: listings.slice(0, 15).map(l => ({ label: l.addr || 'Listing', meta: (l.status||'') + ' · ' + agentName(l.agent_id), href: BASE + '/listings/' + l.id })) })
  }
  if (blocks.includes('offers')) {
    out.blocks.push({ type: 'stat', title: '📝 Offers', value: offers.length, sub: 'this period' })
  }
  if (blocks.includes('per_agent')) {
    const rows = (agents || []).map(a => ({
      name: a.name,
      calls: calls.filter(c => c.agent_id === a.id).length,
      deals: deals.filter(d => d.agent_id === a.id).length,
      tasksDone: tasks.filter(t => t.agent_id === a.id && (t.status === 'completed' || t.completed)).length,
      contacts: contacts.filter(c => c.agent_id === a.id).length,
    })).filter(r => r.calls || r.deals || r.tasksDone || r.contacts)
    out.blocks.push({ type: 'table', title: '👥 Per-agent activity',
      head: ['Agent', 'Calls', 'Deals', 'Tasks', 'New contacts'],
      rows: rows.map(r => [r.name, r.calls, r.deals, r.tasksDone, r.contacts]) })
  }
  return out
}

function renderReportHtml(def, data) {
  const wrap = s => '<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#0F172A">' + s + '</div>'
  const header = '<div style="background:#0F172A;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">' +
    '<div style="font-size:20px;font-weight:800">' + (def.name || 'Team Report') + '</div>' +
    '<div style="font-size:13px;opacity:.75">' + data.range.from + ' → ' + data.range.to + '</div></div>'
  const body = data.blocks.map(b => {
    if (b.type === 'stat') {
      return '<div style="display:inline-block;width:47%;margin:1%;padding:14px 16px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;vertical-align:top">' +
        '<div style="font-size:12px;color:#64748B;font-weight:600">' + b.title + '</div>' +
        '<div style="font-size:24px;font-weight:800;color:#0F172A">' + b.value + '</div>' +
        '<div style="font-size:12px;color:#94A3B8">' + (b.sub || '') + '</div></div>'
    }
    if (b.type === 'list') {
      const items = b.items.map(it =>
        '<a href="' + it.href + '" style="display:block;padding:9px 12px;border-bottom:1px solid #F1F5F9;text-decoration:none;color:#0F172A">' +
        '<span style="font-weight:600;font-size:13px">' + it.label + '</span>' +
        '<span style="float:right;font-size:11px;color:#94A3B8">' + (it.meta || '') + ' ›</span></a>').join('')
      return '<div style="margin:14px 0;border:1px solid #E2E8F0;border-radius:10px;overflow:hidden">' +
        '<div style="padding:9px 12px;background:#F8FAFC;font-size:12px;font-weight:700;color:#334155">' + b.title + '</div>' +
        items + '</div>'
    }
    if (b.type === 'table') {
      const th = b.head.map(h => '<th style="text-align:left;padding:8px 10px;font-size:11px;color:#64748B;border-bottom:2px solid #E2E8F0">' + h + '</th>').join('')
      const tr = b.rows.map(r => '<tr>' + r.map((c, i) => '<td style="padding:8px 10px;font-size:13px;border-bottom:1px solid #F1F5F9;' + (i === 0 ? 'font-weight:600' : 'color:#475569') + '">' + c + '</td>').join('') + '</tr>').join('')
      return '<div style="margin:14px 0"><div style="font-size:12px;font-weight:700;color:#334155;margin-bottom:6px">' + b.title + '</div>' +
        '<table style="width:100%;border-collapse:collapse;border:1px solid #E2E8F0;border-radius:8px"><thead><tr>' + th + '</tr></thead><tbody>' + tr + '</tbody></table></div>'
    }
    return ''
  }).join('')
  const footer = '<div style="padding:16px 4px;font-size:11px;color:#94A3B8;text-align:center">Generated by TargetOS · <a href="' + BASE + '" style="color:#94A3B8">Open CRM</a></div>'
  return wrap(header + '<div style="padding:16px 8px">' + body + '</div>' + footer)
}


module.exports = { computeReport, renderReportHtml, resolveRange }
