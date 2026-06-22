// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Auth Context
// Per-agent authentication. Loads the agent record from the
// agents table using auth_user_id after Supabase login.
// ═══════════════════════════════════════════════════════════════

import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [agent,   setAgent]   = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadAgent(supabaseUser) {
    if (!supabaseUser) { setAgent(null); return }
    try {
      // Primary: look up by auth_user_id
      let agentData = await db.agents.getByAuthId(supabaseUser.id)
      // Fallback: look up by email (for first-time setup)
      if (!agentData) agentData = await db.agents.getByEmail(supabaseUser.email)
      setAgent(agentData || null)
    } catch {
      setAgent(null)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      loadAgent(session?.user ?? null).finally(() => setLoading(false))
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      loadAgent(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setAgent(null)
  }

  async function refreshAgent() {
    if (user) await loadAgent(user)
  }

  const isAdmin     = agent?.role === 'admin'
  const isSecretary = agent?.role === 'secretary'
  const canManage   = isAdmin || isSecretary

  return (
    <AuthContext.Provider value={{ user, agent, loading, signIn, signOut, refreshAgent, isAdmin, isSecretary, canManage }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
