import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import { initSentry } from './lib/sentry'
import { initAnalytics } from './lib/analytics'

// Initialize monitoring (production only)
initSentry()
initAnalytics()

const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(<App />)
