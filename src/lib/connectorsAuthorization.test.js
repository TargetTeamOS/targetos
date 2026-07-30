import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import * as connectorsModule from '../../api/connectors.js'
const connectors = connectorsModule.default || connectorsModule

describe('connector authorization policy', () => {
  it('allows personal status/disconnect for any authenticated role', () => {
    expect(connectors.connectorPermission('my_accounts', 'agent')).toBe(true)
    expect(connectors.connectorPermission('disconnect_my_account', 'agent')).toBe(true)
  })

  it('restricts organization connector management to administrators', () => {
    expect(connectors.connectorPermission('save_credentials', 'agent')).toBe(false)
    expect(connectors.connectorPermission('disconnect', 'secretary')).toBe(false)
    expect(connectors.connectorPermission('save_credentials', 'admin')).toBe(true)
  })

  it('ignores caller-supplied agent_id for personal accounts', () => {
    const identity = { agent: { id: 'authenticated-agent' } }
    const body = { agent_id: 'other-agent' }
    expect(connectors.personalAgentId(identity, body)).toBe('authenticated-agent')
    expect(connectors.personalAgentId(identity, body)).not.toBe(body.agent_id)
  })

  it('preserves authenticated organization fallback use without trusting agent_id', () => {
    for (const file of ['api/calendar-push.js', 'api/sheets-export.js']) {
      const source = fs.readFileSync(file, 'utf8')
      expect(source).toContain('const agentId = identity.agent.id')
      expect(source).not.toContain('body.agent_id')
      expect(source).not.toMatch(/if\s*\(!token\s*&&\s*(?:isAdminRole|require\([^)]*\)\.isAdminRole)/)
    }
  })
})
