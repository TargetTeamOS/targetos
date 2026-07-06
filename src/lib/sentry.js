// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Sentry Error Tracking
// Catches every crash, tells you who hit it and what page broke.
// ═══════════════════════════════════════════════════════════════

import * as Sentry from '@sentry/react'

export function initSentry() {
  // Only init in production
  if (!import.meta.env.PROD) return

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN || '',
    environment: 'production',
    release: 'targetos-v2',
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: 0.2,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  })
}

export function identifyUser(agent) {
  if (!agent) return
  Sentry.setUser({
    id:    agent.id,
    email: agent.email,
    username: agent.name,
  })
}

export function clearUser() {
  Sentry.setUser(null)
}

export function captureError(error, context = {}) {
  Sentry.captureException(error, { extra: context })
}

export { Sentry }
