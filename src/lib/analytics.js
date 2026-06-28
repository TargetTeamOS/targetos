// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — PostHog Analytics
// See which screens agents use, where they get stuck, what's slow.
// ═══════════════════════════════════════════════════════════════

import posthog from 'posthog-js'

let initialized = false

export function initAnalytics() {
  if (initialized || !import.meta.env.PROD) return
  const key = import.meta.env.VITE_POSTHOG_KEY
  if (!key) return

  posthog.init(key, {
    api_host: 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    session_recording: {
      maskAllInputs: false,
      maskInputOptions: { password: true },
    },
  })
  initialized = true
}

export function identifyUser(agent) {
  if (!initialized || !agent) return
  posthog.identify(agent.id, {
    name:  agent.name,
    email: agent.email,
    role:  agent.role,
  })
}

export function trackEvent(event, props = {}) {
  if (!initialized) return
  posthog.capture(event, props)
}

export function trackPage(path) {
  if (!initialized) return
  posthog.capture('$pageview', { path })
}

export function resetUser() {
  if (!initialized) return
  posthog.reset()
}
