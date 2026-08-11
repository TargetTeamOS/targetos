import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { requireBrowserSupabaseConfig } from './supabaseConfig'
import * as serverConfigModule from '../../api/_lib/supabaseConfig.js'

const serverConfig = serverConfigModule.default || serverConfigModule

function apiJavaScriptFiles(dir = 'api') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? apiJavaScriptFiles(full) : (entry.name.endsWith('.js') ? [full] : [])
  })
}

describe('fail-closed Supabase configuration', () => {
  it('requires both browser variables', () => {
    expect(() => requireBrowserSupabaseConfig({})).toThrow(/VITE_SUPABASE_URL.*VITE_SUPABASE_ANON_KEY/)
    expect(() => requireBrowserSupabaseConfig({
      VITE_SUPABASE_URL: 'https://staging-project.supabase.co',
    })).toThrow(/VITE_SUPABASE_URL.*VITE_SUPABASE_ANON_KEY/)
  })

  it('requires an exact HTTPS browser origin', () => {
    expect(() => requireBrowserSupabaseConfig({
      VITE_SUPABASE_URL: 'http://staging-project.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-browser-key',
    })).toThrow(/exact HTTPS origin/)
    expect(requireBrowserSupabaseConfig({
      VITE_SUPABASE_URL: 'https://staging-project.supabase.co/',
      VITE_SUPABASE_ANON_KEY: 'test-browser-key',
    })).toEqual({
      url: 'https://staging-project.supabase.co',
      key: 'test-browser-key',
    })
  })

  it('requires the server URL and a service-role key', () => {
    expect(() => serverConfig.getServerSupabaseConfig({})).toThrow(/SUPABASE_URL/)
    expect(() => serverConfig.getServerSupabaseConfig({
      SUPABASE_URL: 'https://staging-project.supabase.co',
    })).toThrow(/SUPABASE_SERVICE_KEY.*SUPABASE_SERVICE_ROLE_KEY/)
    expect(serverConfig.getServerSupabaseConfig({
      SUPABASE_URL: 'https://staging-project.supabase.co/',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    })).toEqual({
      url: 'https://staging-project.supabase.co',
      key: 'test-service-key',
    })
  })

  it('creates server clients only from validated server variables', () => {
    const factory = vi.fn(() => ({ ok: true }))
    expect(serverConfig.createServiceClient({
      env: {
        SUPABASE_URL: 'https://staging-project.supabase.co',
        SUPABASE_SERVICE_KEY: 'test-service-key',
      },
      createClient: factory,
    })).toEqual({ ok: true })
    expect(factory).toHaveBeenCalledWith(
      'https://staging-project.supabase.co',
      'test-service-key',
      { auth: { persistSession: false } },
    )
  })

  it('contains no embedded Supabase project or browser-key fallback in active application code', () => {
    const files = [...apiJavaScriptFiles(), 'src/lib/supabase.js', 'src/pages/Admin.jsx']
    const source = files.map(file => fs.readFileSync(file, 'utf8')).join('\n')
    expect(source).not.toContain('sgrnyvdsyahmypibjarx')
    expect(source).not.toContain('sb_publishable_L4MNs2GuBFnmyNKgiIGBMg_nNxeaLkE')

    const serverSource = apiJavaScriptFiles().map(file => fs.readFileSync(file, 'utf8')).join('\n')
    expect(serverSource).not.toContain('process.env.VITE_SUPABASE_URL')
    expect(serverSource).not.toContain('process.env.VITE_SUPABASE_ANON_KEY')
  })
})
