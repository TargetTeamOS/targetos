import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const src = fs.readFileSync(path.join(__dirname, 'ContactDetail.jsx'), 'utf8')

describe('ContactDetail — admin/secretary cross-agent branch selector ("also working this lead")', () => {
  it('only looks up other branches for admin or canManage (secretary) — never for a regular agent', () => {
    const marker = 'if ((isAdmin || canManage) && (c.phone || c.email))'
    expect(src.indexOf(marker)).toBeGreaterThan(-1)
  })

  it('matches other branches by phone OR email — the shared parent identity, not by name (which can collide) or by any private field', () => {
    const marker = 'if ((isAdmin || canManage) && (c.phone || c.email))'
    const start = src.indexOf(marker)
    const block = src.slice(start, start + 700)
    expect(block).toMatch(/phone\.eq\./)
    expect(block).toMatch(/email\.eq\./)
    expect(block).not.toMatch(/notes\.eq\.|status\.eq\./)
  })

  it('excludes the currently-open contact itself from its own "other branches" list', () => {
    const marker = 'if ((isAdmin || canManage) && (c.phone || c.email))'
    const start = src.indexOf(marker)
    const block = src.slice(start, start + 700)
    expect(block).toMatch(/\.neq\('id', id\)/)
  })

  it('the branch selector only queries id/name/agent_id fields for the OTHER branch — never pulls that other agent\'s notes/status/timeline into this view', () => {
    const marker = 'if ((isAdmin || canManage) && (c.phone || c.email))'
    const start = src.indexOf(marker)
    const block = src.slice(start, start + 700)
    const selectMatch = block.match(/\.select\('([^']+)'\)/)
    expect(selectMatch).toBeTruthy()
    expect(selectMatch[1]).not.toMatch(/notes|status|tags|source/)
  })

  it('regular agents (not admin/canManage) get an empty otherBranches list — the else branch explicitly clears it', () => {
    const marker = 'if ((isAdmin || canManage) && (c.phone || c.email))'
    const start = src.indexOf(marker)
    const block = src.slice(start, start + 900)
    expect(block).toMatch(/setOtherBranches\(\[\]\)/)
  })

  it('clicking another branch navigates via goSibling — the existing prev/next navigation path, not a new/duplicate navigation mechanism', () => {
    const marker = 'Also working this lead'
    const start = src.indexOf(marker)
    expect(start).toBeGreaterThan(-1)
    const block = src.slice(start, start + 500)
    expect(block).toMatch(/goSibling\(b\.id\)/)
  })
})
