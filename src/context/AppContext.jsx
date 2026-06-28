// TargetOS V2 — App Context
// Theme, custom branding, toast, sidebar state
// All custom settings saved to localStorage and applied to CSS variables

import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react'
import { lsGet, lsSet } from '../lib/utils'

const AppContext = createContext(null)

// Default custom settings — applied as CSS vars on top of the theme
const DEFAULT_CUSTOM = {
  brandColor:    '#CC2200',
  brandColor2:   '#E8650A',
  sidebarColor:  '#1B2B4B',
  accentColor:   '#F5A623',
  borderRadius:  '12',        // px
  fontSize:      '13',        // px base
  fontFamily:    'Inter',
  sidebarWidth:  '220',       // px
  compactMode:   false,
  orgName:       'Target Team',
  orgSubtitle:   'KW Valley Realty',
  logoUrl:       '',
  navOrder:      [],          // [] = default order
}

function loadCustom() {
  try {
    const saved = lsGet('tos_custom', null)
    return saved ? { ...DEFAULT_CUSTOM, ...JSON.parse(saved) } : { ...DEFAULT_CUSTOM }
  } catch { return { ...DEFAULT_CUSTOM } }
}

const initialState = {
  theme:     lsGet('tos_theme', 'light'),
  collapsed: lsGet('tos_sidebar', false),
  toast:     null,
  custom:    loadCustom(),
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_THEME':     return { ...state, theme: action.theme }
    case 'SET_COLLAPSED': return { ...state, collapsed: action.collapsed }
    case 'SET_TOAST':     return { ...state, toast: action.toast }
    case 'SET_CUSTOM':    return { ...state, custom: { ...state.custom, ...action.custom } }
    case 'RESET_CUSTOM':  return { ...state, custom: { ...DEFAULT_CUSTOM } }
    default: return state
  }
}

function applyCustom(custom) {
  const root = document.documentElement
  root.style.setProperty('--brand',     custom.brandColor)
  root.style.setProperty('--brand2',    custom.brandColor2)
  root.style.setProperty('--sb-active', custom.brandColor)
  root.style.setProperty('--gold',      custom.accentColor)
  root.style.setProperty('--sidebar',   custom.sidebarColor)
  root.style.setProperty('--radius',    custom.borderRadius + 'px')
  root.style.setProperty('--radius-sm', Math.max(4, parseInt(custom.borderRadius) - 4) + 'px')
  root.style.setProperty('--radius-lg', (parseInt(custom.borderRadius) + 4) + 'px')
  root.style.setProperty('--base-font', custom.fontSize + 'px')

  // Font family
  const fontMap = {
    'Inter':        'Inter, system-ui, sans-serif',
    'Roboto':       'Roboto, system-ui, sans-serif',
    'Poppins':      'Poppins, system-ui, sans-serif',
    'DM Sans':      'DM Sans, system-ui, sans-serif',
    'Nunito':       'Nunito, system-ui, sans-serif',
    'System':       'system-ui, -apple-system, sans-serif',
  }
  document.body.style.fontFamily = fontMap[custom.fontFamily] || fontMap['Inter']

  // Compact mode
  if (custom.compactMode) {
    root.style.setProperty('--compact', '1')
    root.setAttribute('data-compact', 'true')
  } else {
    root.style.removeProperty('--compact')
    root.removeAttribute('data-compact')
  }

  // Sidebar width
  const sidebar = document.querySelector('.sidebar')
  if (sidebar && !document.documentElement.classList.contains('collapsed')) {
    sidebar.style.width = custom.sidebarWidth + 'px'
    sidebar.style.minWidth = custom.sidebarWidth + 'px'
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  // Persist
  useEffect(() => { lsSet('tos_theme', state.theme) }, [state.theme])
  useEffect(() => { lsSet('tos_sidebar', state.collapsed) }, [state.collapsed])
  useEffect(() => {
    lsSet('tos_custom', JSON.stringify(state.custom))
    applyCustom(state.custom)
  }, [state.custom])

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme)
    // Re-apply custom on theme change (theme CSS vars override, then custom re-applies on top)
    setTimeout(() => applyCustom(state.custom), 10)
  }, [state.theme])

  // Apply custom on first load
  useEffect(() => { applyCustom(state.custom) }, [])

  const setTheme          = useCallback((t) => dispatch({ type: 'SET_THEME', theme: t }), [])
  const setSidebarCollapsed = useCallback((v) => dispatch({ type: 'SET_COLLAPSED', collapsed: v }), [])
  const setCustom         = useCallback((c) => dispatch({ type: 'SET_CUSTOM', custom: c }), [])
  const resetCustom       = useCallback(() => dispatch({ type: 'RESET_CUSTOM' }), [])

  const showToast = useCallback((msg, color = '#10B981', duration = 3000) => {
    dispatch({ type: 'SET_TOAST', toast: { msg, color } })
    setTimeout(() => dispatch({ type: 'SET_TOAST', toast: null }), duration)
  }, [])

  const toast = useCallback((msg, color) => showToast(msg, color), [showToast])

  return (
    <AppContext.Provider value={{ state, setTheme, setSidebarCollapsed, setCustom, resetCustom, showToast, toast }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
