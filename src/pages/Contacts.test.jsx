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
    // Window widened past 1000: the engagement-aware merge above this
    // block (Sept 2026) added a long explanatory comment between the
    // marker and the actual ownedIds filter, pushing it past the old
    // fixed window with no functional change.
    const block = src.slice(start, start + 1200)
    expect(block).toMatch(/ownedIds\.has\(c\.id\)/)
  })

  it('the directory-only section never references selectedIds, bulk-edit, or delete — it must not be selectable or bulk-actionable', () => {
    const sectionStart = src.indexOf("showAllAgents && directoryOnly.length > 0")
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
    const sectionStart = src.indexOf("showAllAgents && directoryOnly.length > 0")
    const sectionEnd = src.indexOf('Detail / Add Panel', sectionStart)
    const block = src.slice(sectionStart, sectionEnd)
    // The directoryOnly.map(...) render body specifically
    const mapStart = block.indexOf('directoryOnly.map')
    const mapBlock = block.slice(mapStart, mapStart + 900)
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

  it('defaults to on — shows past deals + custom fields from the shared directory immediately (commit faa046c)', () => {
    expect(src).toMatch(/const \[showAllAgents, setShowAllAgents\] = useState\(true\)/)
  })
})

describe('Contacts board — "Start Working This Lead" claims a private engagement on a shared contact', () => {
  it('startWorkingLead claims the SAME shared contact via a private contact_engagements row scoped to the current agent — no duplicate contact row (superseded the old clone-per-agent design, see the function\'s doc comment)', () => {
    const marker = 'async function startWorkingLead(dirContact)'
    const start = src.indexOf(marker)
    expect(start).toBeGreaterThan(-1)
    const block = src.slice(start, start + 900)
    expect(block).toMatch(/db\.engagements\.startWorking\(dirContact\.id,\s*agent\?\.id/)
    expect(block).toMatch(/status:\s*'New'/)
    expect(block).toMatch(/source:\s*'Shared Directory'/)
  })

  it('if the current agent already has their own engagement for this same person, it reopens that one (keyed off the `created` flag db.engagements.startWorking returns) instead of creating a confusing duplicate', () => {
    const marker = 'async function startWorkingLead(dirContact)'
    const start = src.indexOf(marker)
    const block = src.slice(start, start + 900)
    expect(block).toMatch(/already have your own record for this contact/)
    expect(block).toMatch(/navigate\('\/contacts\/'\s*\+\s*dirContact\.id\)/)
  })

  it('requires explicit confirmation before claiming a lead — not a single accidental click', () => {
    const marker = 'open={!!confirmClaim}'
    expect(src.indexOf(marker)).toBeGreaterThan(-1)
  })

  it('the claim button lives inside the directory-only (limited view) section, not the main authorized-contacts list', () => {
    const sectionStart = src.indexOf("showAllAgents && directoryOnly.length > 0")
    const sectionEnd = src.indexOf('Detail / Add Panel', sectionStart)
    const block = src.slice(sectionStart, sectionEnd)
    expect(block).toMatch(/Start Working This Lead/)
  })
})
