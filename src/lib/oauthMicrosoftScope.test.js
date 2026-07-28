import { describe, it, expect } from 'vitest'
import * as msOauth from '../../api/oauth-microsoft.js'

describe('oauth-microsoft authorize URL', () => {
  it('includes prompt=select_account so agents can choose the account', () => {
    const u = msOauth.authorizeUrl('client-123', 'https://app.targetreteam.com/api/oauth-microsoft', 'state-abc')
    expect(u).toContain('prompt=select_account')
    expect(u).toContain('client_id=client-123')
    expect(u).toContain('state=state-abc')
    expect(decodeURIComponent(u)).toContain('offline_access')     // refresh preserved
    expect(decodeURIComponent(u)).toContain('Mail.Send')
  })
})
