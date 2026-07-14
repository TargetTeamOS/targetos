// ═══════════════════════════════════════════════════════════════
// CallJourney — the "What Happened On This Call" timeline, built
// from call_events rows (each IVR step logs one). Shared by the
// Calls page and the Contact page so both show identical journeys:
// the menu key pressed, area/price picked, listing chosen, routing.
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export const STEP_LABELS = {
  method_selected:          { icon: '📋', label: 'Search method chosen' },
  area_selected:             { icon: '📍', label: 'Area selected' },
  price_selected:            { icon: '💲', label: 'Price range selected' },
  beds_selected:              { icon: '🛏', label: 'Bedroom count selected' },
  listing_selected:           { icon: '🏠', label: 'Listing selected' },
  routed_to_assigned_agent:    { icon: '✅', label: 'Routed to the listing\'s assigned agent' },
  assigned_agent_lookup_failed:{ icon: '⚠️', label: 'Assigned agent could not be reached' },
  no_agent_assigned:           { icon: 'ℹ️', label: 'Listing has no agent assigned' },
  routed_to_roundrobin:        { icon: '🔀', label: 'Routed to the team round-robin' },
  roundrobin_dial_attempt:     { icon: '📞', label: 'Round-robin dial attempt' },
  roundrobin_dialing:          { icon: '📞', label: 'Ringing agents' },
  voicemail_fallback:          { icon: '📭', label: 'Ended up at voicemail' },
}

// New events (July 2026): initial menu keypress + listings entry
STEP_LABELS.menu_selected      = { icon: '☎️', label: 'Menu selection' }
STEP_LABELS.listings_step_intro = { icon: '🏠', label: 'Entered listings search' }

export function CallJourney({ callSid }) {
  const [events, setEvents]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!callSid) { setLoading(false); return }
    supabase.from('call_events').select('*').eq('call_sid', callSid).order('created_at', { ascending: true })
      .then(({ data }) => { setEvents(data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [callSid])

  if (!callSid || loading) return null
  if (events.length === 0) return null

  return (
    <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>
        What Happened On This Call
      </div>
      {events.map(e => {
        const meta = STEP_LABELS[e.step] || { icon: '•', label: e.step }
        return (
          <div key={e.id} style={{ display: 'flex', gap: '8px', padding: '5px 0', fontSize: '12.5px' }}>
            <span>{meta.icon}</span>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{meta.label}</span>
              {e.detail && <span style={{ color: 'var(--muted)' }}> — {e.detail}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
