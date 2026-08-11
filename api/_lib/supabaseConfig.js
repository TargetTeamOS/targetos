'use strict'

function configurationError(message) {
  const error = new Error(message)
  error.code = 'SUPABASE_CONFIGURATION_ERROR'
  error.status = 503
  return error
}

function normalizeHttpsOrigin(name, value) {
  const raw = String(value || '').trim().replace(/\/$/, '')
  if (!raw) throw configurationError(name + ' is not configured')
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'https:' || parsed.origin !== raw) {
      throw new Error('invalid origin')
    }
    return raw
  } catch {
    throw configurationError(name + ' must be an exact HTTPS origin')
  }
}

function getServerSupabaseConfig(env = process.env) {
  const url = normalizeHttpsOrigin('SUPABASE_URL', env.SUPABASE_URL)
  const key = String(env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!key) {
    throw configurationError('SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY is not configured')
  }
  return { url, key }
}

function createServiceClient(options = {}) {
  const config = getServerSupabaseConfig(options.env || process.env)
  const factory = options.createClient || require('@supabase/supabase-js').createClient
  const clientOptions = options.clientOptions || { auth: { persistSession: false } }
  return factory(config.url, config.key, clientOptions)
}

module.exports = {
  configurationError,
  normalizeHttpsOrigin,
  getServerSupabaseConfig,
  createServiceClient,
}
