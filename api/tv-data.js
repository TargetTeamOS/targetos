'use strict'
// api/tv-data.js — read-only stats feed for the office TV board.
// Auth: ?token= must match the 'display' integration's secret
// (machines/TVs can't log in). No client names are ever returned —
// this may hang in a lobby.

const { sb, getIntegration } = require('./_lib/connectors')

const ACTIVE_STAGES = ['Negotiations', 'Offer Accapted', 'Under Shtar', 'Under Contract']

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'GET') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'GET only' })) }

  try {
    const url = new URL(req.url, 'https://x')
    const integ = await getIntegration('display')
    if (!integ) { res.statusCode = 503; return res.end(JSON.stringify({ error: 'run the display SQL first' })) }
    const expected = (integ.secrets || {}).webhook_secret || ''
    if (!expected || url.searchParams.get('token') !== expected) {
      res.statusCode = 401; return res.end(JSON.stringify({ error: 'bad token' }))
    }

    const now = new Date()
    const year = now.getFullYear()
    const monthStart = year + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01'
    const yearStart = year + '-01-01'
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    const today = now.toISOString().slice(0, 10)

    const cfg = integ.config || {}
    const announceDays = Number(cfg.announce_days) || 3
    const announceSince = new Date(Date.now() - announceDays * 86400000).toISOString()

    const client = sb()
    const nowIso = new Date().toISOString()
    const { data: annRows } = await client.from('announcements')
      .select('id, title, body, type, celebrate, created_at, tv_until, tv_popup_seconds')
      .eq('show_on_tv', true)
      .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
      .order('created_at', { ascending: false })
      .limit(10)
    const tvAnnouncements = (annRows || []).filter(a => {
      if (a.tv_until) return a.tv_until >= nowIso            // explicit run-until wins
      return a.created_at >= announceSince                    // else default window
    }).slice(0, 5)

    // ── playlist: only items scheduled for right now (America/New_York) ──
    const { data: playlistRows } = await client.from('tv_playlist')
      .select('*').eq('enabled', true).order('position').limit(50)
    const nyNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const dayKey = ['sun','mon','tue','wed','thu','fri','sat'][nyNow.getDay()]
    const hhmm = String(nyNow.getHours()).padStart(2, '0') + ':' + String(nyNow.getMinutes()).padStart(2, '0')
    const playlist = (playlistRows || []).filter(item => {
      if (Array.isArray(item.days) && item.days.length && !item.days.includes(dayKey)) return false
      const st = item.start_time ? String(item.start_time).slice(0, 5) : null
      const en = item.end_time   ? String(item.end_time).slice(0, 5)   : null
      if (st && en) {
        if (st <= en) { if (hhmm < st || hhmm > en) return false }
        else { if (hhmm < st && hhmm > en) return false }      // overnight window
      } else if (st && hhmm < st) return false
      else if (en && hhmm > en) return false
      return true
    }).map(i => ({ id: i.id, type: i.type, title: i.title, src: i.src, duration_seconds: Math.max(5, Number(i.duration_seconds) || 30) }))
    const { data: deals, error } = await client.from('deals')
      .select('id, addr, side, stage, production, gci, ao_date, close_date, agent_id, agents(name, color)')
      .gte('created_at', (year - 1) + '-01-01') // enough history for YTD + pipeline
      .limit(5000)
    if (error) throw new Error(error.message)

    const all = deals || []
    const num = v => Number(v) || 0

    const acceptedMTD = all.filter(d => d.ao_date && d.ao_date >= monthStart)
    const closedYTD   = all.filter(d => d.stage === 'Closed' && d.close_date && d.close_date >= yearStart)
    const pipeline    = all.filter(d => ACTIVE_STAGES.includes(d.stage))
    const closingSoon = all.filter(d => d.close_date && d.close_date >= today && d.close_date <= in30 && d.stage !== 'Closed' && d.stage !== 'Deal Fell Through')
      .sort((a, b) => a.close_date.localeCompare(b.close_date)).slice(0, 8)
    const recentAccepted = all.filter(d => d.ao_date)
      .sort((a, b) => b.ao_date.localeCompare(a.ao_date)).slice(0, 6)

    // agent leaderboard — closed YTD volume
    const byAgent = {}
    for (const d of closedYTD) {
      const name = (d.agents && d.agents.name) || 'Team'
      if (!byAgent[name]) byAgent[name] = { name, color: (d.agents && d.agents.color) || '#579bfc', deals: 0, volume: 0 }
      byAgent[name].deals++
      byAgent[name].volume += num(d.production)
    }
    const leaderboard = Object.values(byAgent).sort((a, b) => b.volume - a.volume).slice(0, 6)

    res.statusCode = 200
    res.end(JSON.stringify({
      generated_at: new Date().toISOString(),
      display: {
        mode: cfg.mode || 'dashboard',
        slides_url: cfg.slides_url || '',
        images: Array.isArray(cfg.images) ? cfg.images : [],
        rotate_seconds: Number(cfg.rotate_seconds) || 45,
        popup_seconds: Number(cfg.popup_seconds) || 15,
      },
      announcements: (tvAnnouncements || []).map(a => ({
        id: a.id, title: a.title, body: a.body, type: a.type, celebrate: a.celebrate,
        created_at: a.created_at,
        popup_seconds: Number(a.tv_popup_seconds) || Number(cfg.popup_seconds) || 15,
      })),
      playlist,
      stats: {
        accepted_mtd: acceptedMTD.length,
        accepted_mtd_volume: acceptedMTD.reduce((s, d) => s + num(d.production), 0),
        closed_ytd: closedYTD.length,
        closed_ytd_volume: closedYTD.reduce((s, d) => s + num(d.production), 0),
        pipeline_count: pipeline.length,
        pipeline_volume: pipeline.reduce((s, d) => s + num(d.production), 0),
      },
      closing_soon: closingSoon.map(d => ({ addr: d.addr, close_date: d.close_date, stage: d.stage, agent: (d.agents && d.agents.name) || '' })),
      recent_accepted: recentAccepted.map(d => ({ addr: d.addr, ao_date: d.ao_date, side: d.side, agent: (d.agents && d.agents.name) || '' })),
      leaderboard,
    }))
  } catch (e) {
    console.error('[tv-data] ' + e.message)
    res.statusCode = 500; res.end(JSON.stringify({ error: e.message }))
  }
}
