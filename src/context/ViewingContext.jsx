import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

// Centralized dashboard viewing context (Phase 1, Part 5).
// Widgets must NOT invent their own ownership logic — they read scope
// from here. The server (app_dashboard_summary RPC + RLS) is the real
// authority; this context only drives the UI and passes the requested
// scope, which the server re-validates. A saved widget config can never
// override backend authorization.

const ViewingContext = createContext(null)

export function ViewingProvider({ children }) {
  const { agent, isAdmin, isSecretary } = useAuth()
  const [mode, setMode] = useState('self')          // 'self' | 'agent' | 'team'
  const [selectedAgentId, setSelectedAgentId] = useState(null)
  const [allowedAgents, setAllowedAgents] = useState([])
  const [dateRange, setDateRange] = useState({ from: yearStart(), to: yearEnd() })

  // Which agents can this user select? admins: all active; secretaries:
  // only those granted; agents: none (self only).
  useEffect(() => {
    if (!agent) return
    if (isAdmin) {
      supabase.from('agents').select('id,name').eq('active', true).order('name')
        .then(r => setAllowedAgents(r.data || []))
    } else if (isSecretary) {
      supabase.from('secretary_permissions')
        .select('target_agent_id, agents:target_agent_id(id,name)')
        .eq('secretary_id', agent.id).eq('can_view', true)
        .then(r => setAllowedAgents((r.data || []).map(x => x.agents).filter(Boolean)))
    } else {
      setAllowedAgents([])
    }
  }, [agent, isAdmin, isSecretary])

  const canSelectAgents = isAdmin || (isSecretary && allowedAgents.length > 0)
  const canViewTeam = isAdmin || isSecretary  // agents get aggregate-only via RPC

  const label = mode === 'team' ? 'All Agents'
    : mode === 'agent' ? (allowedAgents.find(a => a.id === selectedAgentId)?.name || 'Selected Agent')
    : 'My Dashboard'

  // Fetch secure summary via the RPC (server validates scope).
  const fetchSummary = useCallback(async () => {
    const { data, error } = await supabase.rpc('app_dashboard_summary', {
      mode, target: mode === 'agent' ? selectedAgentId : null,
      from_date: dateRange.from, to_date: dateRange.to,
    })
    if (error) return { error: error.message }
    if (data?.error) return { error: data.error }   // forbidden / no_agent_link
    return data
  }, [mode, selectedAgentId, dateRange])

  return (
    <ViewingContext.Provider value={{
      mode, setMode, selectedAgentId, setSelectedAgentId, allowedAgents,
      canSelectAgents, canViewTeam, dateRange, setDateRange, label, fetchSummary,
      isAdmin,
    }}>
      {children}
    </ViewingContext.Provider>
  )
}

export function useViewing() {
  const ctx = useContext(ViewingContext)
  if (!ctx) throw new Error('useViewing must be used within ViewingProvider')
  return ctx
}

function yearStart() { return new Date().getFullYear() + '-01-01' }
function yearEnd() { return (new Date().getFullYear() + 1) + '-01-01' }
