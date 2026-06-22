import React, { createContext, useContext, useReducer, useCallback } from 'react'

const AppContext = createContext(null)

const initialState = {
  theme:   localStorage.getItem('tos_theme') || 'light',
  toast:   null,
  sidebarCollapsed: false,
}

function reducer(state, action) {
  switch(action.type) {
    case 'SET_THEME':
      localStorage.setItem('tos_theme', action.theme)
      document.documentElement.setAttribute('data-theme', action.theme)
      return { ...state, theme: action.theme }
    case 'SHOW_TOAST':
      return { ...state, toast: { msg: action.msg, color: action.color } }
    case 'CLEAR_TOAST':
      return { ...state, toast: null }
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed }
    default:
      return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  // Apply saved theme on mount
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme)
  }, [])

  const toast = useCallback((msg, color, duration = 3000) => {
    dispatch({ type: 'SHOW_TOAST', msg, color: color || '#1B2B4B' })
    setTimeout(() => dispatch({ type: 'CLEAR_TOAST' }), duration)
  }, [])

  return (
    <AppContext.Provider value={{ state, dispatch, toast }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
