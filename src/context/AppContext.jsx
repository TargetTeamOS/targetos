import React, { createContext, useContext, useReducer, useCallback } from 'react'

const AppContext = createContext(null)

const initialState = {
  user: null,
  currentAgent: null,
  theme: 'light',
  contacts: [],
  tasks: [],
  listings: [],
  transactions: [],
  deals: [],
  activityLog: [],
  toast: null,
  loading: {},
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_USER':       return { ...state, user: action.payload }
    case 'SET_AGENT':      return { ...state, currentAgent: action.payload }
    case 'SET_THEME':      return { ...state, theme: action.payload }
    case 'SET_CONTACTS':   return { ...state, contacts: action.payload }
    case 'ADD_CONTACT':    return { ...state, contacts: [action.payload, ...state.contacts] }
    case 'DEL_CONTACT':    return { ...state, contacts: state.contacts.filter(c => c.id !== action.payload) }
    case 'UPD_CONTACT':    return { ...state, contacts: state.contacts.map(c => c.id === action.payload.id ? action.payload : c) }
    case 'SET_TASKS':      return { ...state, tasks: action.payload }
    case 'ADD_TASK':       return { ...state, tasks: [action.payload, ...state.tasks] }
    case 'DEL_TASK':       return { ...state, tasks: state.tasks.filter(t => t.id !== action.payload) }
    case 'UPD_TASK':       return { ...state, tasks: state.tasks.map(t => t.id === action.payload.id ? action.payload : t) }
    case 'SET_LISTINGS':   return { ...state, listings: action.payload }
    case 'SET_DEALS':      return { ...state, deals: action.payload }
    case 'SET_TRANSACTIONS': return { ...state, transactions: action.payload }
    case 'ADD_LOG':        return { ...state, activityLog: [action.payload, ...state.activityLog].slice(0, 2000) }
    case 'SET_LOG':        return { ...state, activityLog: action.payload }
    case 'TOAST':          return { ...state, toast: action.payload }
    case 'SET_LOADING':    return { ...state, loading: { ...state.loading, [action.key]: action.val } }
    default: return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const toast = useCallback((msg, color) => {
    dispatch({ type: 'TOAST', payload: { msg, color, id: Date.now() } })
    setTimeout(() => dispatch({ type: 'TOAST', payload: null }), 2800)
  }, [])

  const log = useCallback((entry) => {
    dispatch({ type: 'ADD_LOG', payload: { ...entry, id: Date.now().toString(), timeLabel: new Date().toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true}), timestamp: new Date().toISOString() } })
  }, [])

  return (
    <AppContext.Provider value={{ state, dispatch, toast, log }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
