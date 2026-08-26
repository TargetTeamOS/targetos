import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const src = fs.readFileSync(path.join(__dirname, 'Contacts.jsx'), 'utf8')

describe('Contacts board — "browse everyone\'s contacts" shared-directory section', () => {
  it('queries contacts_directory (the safe view), not the base contacts table, for the other-agents section', () => {
    const marker = 'if (agentFilter && showAllAgents)'
    const start = src.indexOf(marker)
    expect(start).toBeGreaterThan(-1)
    const block = src.slice(start, start + 700)
    expect(block).toMatch(/from\('contacts_directory'\)/)
  })

  it('excludes contacts the agent already owns from the directory-only list, so nothing is shown twice', () => {
    const marker = 'if (agentFilter && showAllAgents)'
    const start = src.indexOf(marker)
    const block = src.slice(start, start + 1000)
    expect(block).toMatch(/ownedIds\.has\(c\.id\)/)
  })

  it('the directory-only section never references selectedIds, bulk-edit, or delete — it must not be selectable or bulk-actionable', () => {
    const sectionStart = src.indexOf("Other Agents' Contacts")
    expect(sectionStart).toBeGreaterThan(-1)
    // Grab from the section header down to the next major section
    // (the Detail/Add Modal) rather than the whole file, so this is a
    // targeted check on just this new block.
    const sectionEnd = src.indexOf('Detail / Add Panel', sectionStart)
    const block = src.slice(sectionStart, sectionEnd)
    expect(block).not.toMatch(/selectedIds/)
    expect(block).not.toMatch(/BulkEditBar/)
    expect(block).not.toMatch(/onClick.*remove\(/)
  })

  it('the directory-only section renders only name, phone, and email — no status, type, source, tags, or agent fields', () => {
    const sectionStart = src.indexOf("Other Agents' Contacts")
    const sectionEnd = src.indexOf('Detail / Add Panel', sectionStart)
    const block = src.slice(sectionStart, sectionEnd)
    // The directoryOnly.map(...) render body specifically
    const mapStart = block.indexOf('directoryOnly.map')
    const mapBlock = block.slice(mapStart, mapStart + 500)
    expect(mapBlock).toMatch(/c\.first_name/)
    expect(mapBlock).toMatch(/c\.phone/)
    expect(mapBlock).toMatch(/c\.email/)
    expect(mapBlock).not.toMatch(/c\.status/)
    expect(mapBlock).not.toMatch(/c\.type/)
    expect(mapBlock).not.toMatch(/c\.source/)
    expect(mapBlock).not.toMatch(/c\.agents/)
    expect(mapBlock).not.toMatch(/c\.notes/)
    expect(mapBlock).not.toMatch(/c\.address/)
  })

  it('the "browse everyone" toggle is only offered to regular agents — admin/canManage already see everyone in the main list', () => {
    const marker = '"Browse everyone\'s contacts" toggle'
    const start = src.indexOf(marker)
    expect(start).toBeGreaterThan(-1)
    const block = src.slice(start, start + 400)
    expect(block).toMatch(/!\(isAdmin \|\| canManage\)/)
  })

  it('defaults to off — the existing "my contacts" primary view is unchanged unless the agent opts in', () => {
    expect(src).toMatch(/useState\(false\)\s*\/\/ contacts NOT owned by me|const \[showAllAgents, setShowAllAgents\] = useState\(false\)/)
  })
})
