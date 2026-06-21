import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { getAgentByAuthId } from '../lib/db/agents'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]         = useState(null)
  const [agent, setAgent]       = useState(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        loadAgent(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user)
        await loadAgent(session.user.id)
      } else {
        setUser(null)
        setAgent(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadAgent(authUserId) {
    try {
      const agentData = await getAgentByAuthId(authUserId)
      setAgent(agentData)
    } catch(e) {
      console.error('Failed to load agent:', e)
    } finally {
      setLoading(false)
    }
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const isAdmin     = agent?.role === 'admin'
  const isSecretary = agent?.role === 'secretary'

  return (
    <AuthContext.Provider value={{ user, agent, loading, signIn, signOut, isAdmin, isSecretary }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
