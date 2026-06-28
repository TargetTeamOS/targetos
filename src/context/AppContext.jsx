// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — App Context
// Theme, toast notifications, sidebar state
// ═══════════════════════════════════════════════════════════════

import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react'
import { lsGet, lsSet } from '../lib/utils'

const AppContext = createContext(null)

const initialState = {
  theme:     lsGet('tos_theme', 'light'),
  collapsed: lsGet('tos_sidebar', false),
  toast:     null,
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_THEME':     return { ...state, theme: action.theme }
    case 'SET_COLLAPSED': return { ...state, collapsed: action.collapsed }
    case 'SET_TOAST':     return { ...state, toast: action.toast }
    default: return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  // Persist theme and sidebar to localStorage
  useEffect(() => { lsSet('tos_theme', state.theme) }, [state.theme])
  useEffect(() => { lsSet('tos_sidebar', state.collapsed) }, [state.collapsed])

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme)
  }, [state.theme])

  const setTheme = useCallback((t) => dispatch({ type: 'SET_THEME', theme: t }), [])
  const setSidebarCollapsed = useCallback((v) => dispatch({ type: 'SET_COLLAPSED', collapsed: v }), [])

  const showToast = useCallback((msg, color = '#10B981', duration = 3000) => {
    dispatch({ type: 'SET_TOAST', toast: { msg, color } })
    setTimeout(() => dispatch({ type: 'SET_TOAST', toast: null }), duration)
  }, [])

  const toast = useCallback((msg, color) => showToast(msg, color), [showToast])

  return (
    <AppContext.Provider value={{ state, setTheme, setSidebarCollapsed, showToast, toast }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
