'use strict'

const DISABLED_MESSAGE = 'External effects are disabled for this environment'

function externalEffectsEnabled(env = process.env) {
  return String(env.EXTERNAL_EFFECTS_ENABLED || '').trim().toLowerCase() === 'true'
}

function externalEffectsError() {
  const error = new Error(DISABLED_MESSAGE)
  error.code = 'EXTERNAL_EFFECTS_DISABLED'
  error.status = 503
  return error
}

function assertExternalEffectsEnabled(env = process.env) {
  if (!externalEffectsEnabled(env)) throw externalEffectsError()
  return true
}

function requireExternalEffects(res, env = process.env) {
  try {
    assertExternalEffectsEnabled(env)
    return true
  } catch (error) {
    const body = { error: error.message, code: error.code }
    if (typeof res.status === 'function' && typeof res.json === 'function') {
      res.status(error.status || 503).json(body)
    } else {
      res.statusCode = error.status || 503
      if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'application/json')
      if (typeof res.end === 'function') res.end(JSON.stringify(body))
    }
    return false
  }
}

module.exports = {
  DISABLED_MESSAGE,
  externalEffectsEnabled,
  externalEffectsError,
  assertExternalEffectsEnabled,
  requireExternalEffects,
}
