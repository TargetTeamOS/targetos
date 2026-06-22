import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [agent,   setAgent]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadAgent(session.user)
      else setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) await loadAgent(session.user)
      else { setAgent(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadAgent(authUser) {
    try {
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .eq('auth_user_id', authUser.id)
        .single()

      if (error || !data) {
        // Try by email as fallback
        const { data: byEmail } = await supabase
          .from('agents')
          .select('*')
          .eq('email', authUser.email)
          .single()
        setAgent(byEmail || null)
      } else {
        setAgent(data)
      }
    } catch(e) {
      console.error('loadAgent error:', e)
      setAgent(null)
    } finally {
      setLoading(false)
    }
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setAgent(null)
  }

  async function updatePassword(password) {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
  }

  const isAdmin     = agent?.role === 'admin' || agent?.role === 'secretary'
  const isSecretary = agent?.role === 'secretary'

  return (
    <AuthContext.Provider value={{ user, agent, loading, isAdmin, isSecretary, signIn, signOut, updatePassword }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
