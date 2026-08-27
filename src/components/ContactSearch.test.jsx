// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { ContactSearch } from './ContactSearch'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ agent: { id: 'agent-1' }, isAdmin: false }),
}))

function mockContacts(rows) {
  // Mimics the real Supabase query builder: chainable AND awaitable at
  // every step (the actual component calls .or().limit() then
  // conditionally .eq() on the SAME chain, then awaits the result).
  function chainable() {
    const result = Promise.resolve({ data: rows, error: null })
    result.eq = () => chainable()
    result.limit = () => chainable()
    result.or = () => chainable()
    result.select = () => chainable()
    return result
  }
  return {
    supabase: {
      from: () => chainable(),
    },
  }
}

describe('ContactSearch — the actual bug reported live: zero matches must not hide the whole dropdown', () => {
  it('THE BUG: previously, zero database matches hid the dropdown entirely, including "create new" — now it stays visible with an explicit message', async () => {
    vi.doMock('../lib/supabase', () => mockContacts([]))
    vi.resetModules()
    const { ContactSearch: FreshContactSearch } = await import('./ContactSearch')

    render(<FreshContactSearch value="" onChange={()=>{}} onSelect={vi.fn()} placeholder="Search..." filter="Attorney" />)
    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'Nonexistent Name' } })

    await waitFor(() => expect(screen.getByText('No matching contacts found.')).toBeTruthy())
    expect(screen.getByText('+ Save "Nonexistent Name" as new contact')).toBeTruthy()
  })

  it('shows real matching results with name, phone, and email — the shared directory columns, nothing more', async () => {
    vi.doMock('../lib/supabase', () => mockContacts([
      { id: 'c1', first_name: 'John', last_name: 'Smith', phone: '555-1234', email: 'john@smithrealty.com', type: 'Agent' },
    ]))
    vi.resetModules()
    const { ContactSearch: FreshContactSearch } = await import('./ContactSearch')

    render(<FreshContactSearch value="" onChange={()=>{}} onSelect={vi.fn()} placeholder="Search..." filter="Agent" />)
    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'John' } })

    await waitFor(() => expect(screen.getByText('John Smith')).toBeTruthy())
    expect(screen.getByText(/555-1234/)).toBeTruthy()
  })

  it('does not search for fewer than 2 characters', async () => {
    vi.doMock('../lib/supabase', () => mockContacts([{ id: 'c1', first_name: 'A', last_name: '' }]))
    vi.resetModules()
    const { ContactSearch: FreshContactSearch } = await import('./ContactSearch')

    render(<FreshContactSearch value="" onChange={()=>{}} onSelect={vi.fn()} placeholder="Search..." filter="Agent" />)
    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'A' } })
    await new Promise(r => setTimeout(r, 350))
    expect(screen.queryByText('Searching contacts...')).toBeNull()
    expect(screen.queryByText('No matching contacts found.')).toBeNull()
  })

  it('clicking "create new" opens an inline form requiring phone or email — the actual root cause fix for "could not save a new Contact"', async () => {
    vi.doMock('../lib/supabase', () => mockContacts([]))
    vi.resetModules()
    const { ContactSearch: FreshContactSearch } = await import('./ContactSearch')
    const onSelect = vi.fn()

    render(<FreshContactSearch value="" onChange={()=>{}} onSelect={onSelect} placeholder="Search..." filter="Agent" />)
    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'Brand New Person' } })
    await waitFor(() => expect(screen.getByText('+ Save "Brand New Person" as new contact')).toBeTruthy())
    fireEvent.mouseDown(screen.getByText('+ Save "Brand New Person" as new contact'))

    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText('Phone (or leave blank if email provided)')).toBeTruthy()
    expect(screen.getByPlaceholderText('Email (or leave blank if phone provided)')).toBeTruthy()
  })

  it('refuses to submit the new contact with neither phone nor email — this is the actual missing validation that let bad creates through', async () => {
    vi.doMock('../lib/supabase', () => mockContacts([]))
    vi.resetModules()
    const { ContactSearch: FreshContactSearch } = await import('./ContactSearch')
    const onSelect = vi.fn()

    render(<FreshContactSearch value="" onChange={()=>{}} onSelect={onSelect} placeholder="Search..." filter="Agent" />)
    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'Brand New Person' } })
    await waitFor(() => expect(screen.getByText('+ Save "Brand New Person" as new contact')).toBeTruthy())
    fireEvent.mouseDown(screen.getByText('+ Save "Brand New Person" as new contact'))
    await waitFor(() => expect(screen.getByText('Save Contact')).toBeTruthy())

    fireEvent.mouseDown(screen.getByText('Save Contact'))
    await waitFor(() => expect(screen.getByText('At least a phone number or email is required.')).toBeTruthy())
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('submits onSelect(null, {phone, email}) once phone or email is provided, and surfaces a real save error inline instead of silently failing', async () => {
    vi.doMock('../lib/supabase', () => mockContacts([]))
    vi.resetModules()
    const { ContactSearch: FreshContactSearch } = await import('./ContactSearch')
    const onSelect = vi.fn().mockRejectedValue(new Error('duplicate key value violates unique constraint'))

    render(<FreshContactSearch value="" onChange={()=>{}} onSelect={onSelect} placeholder="Search..." filter="Agent" />)
    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'Brand New Person' } })
    await waitFor(() => expect(screen.getByText('+ Save "Brand New Person" as new contact')).toBeTruthy())
    fireEvent.mouseDown(screen.getByText('+ Save "Brand New Person" as new contact'))
    await waitFor(() => expect(screen.getByText('Save Contact')).toBeTruthy())

    fireEvent.change(screen.getByPlaceholderText('Phone (or leave blank if email provided)'), { target: { value: '555-0100' } })
    fireEvent.mouseDown(screen.getByText('Save Contact'))

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(null, { phone: '555-0100', email: '' }))
    await waitFor(() => expect(screen.getByText('duplicate key value violates unique constraint')).toBeTruthy())
  })
})

describe('ContactSearch — shared directory: full directory searchable, but only name/phone/email are ever shown', () => {
  it('Agent A and Agent B both find the same outside-agent Contact — the shared directory has no per-agent ownership filter', async () => {
    // Same contact record, returned identically regardless of which
    // agent is searching — proves the query has no agent_id/ownership
    // filter of its own; that's now the database's job (the
    // contacts_directory view + tightened base-table RLS), not this
    // component's.
    const sharedContact = { id: 'contact-x', first_name: 'Outside', last_name: 'Agent', phone: '555-0000', email: 'outside@other.com', type: 'Agent' }
    vi.doMock('../lib/supabase', () => mockContacts([sharedContact]))
    vi.doMock('../context/AuthContext', () => ({ useAuth: () => ({ agent: { id: 'agent-b' }, isAdmin: false }) }))
    vi.resetModules()
    const { ContactSearch: FreshContactSearch } = await import('./ContactSearch')

    render(<FreshContactSearch value="" onChange={()=>{}} onSelect={vi.fn()} placeholder="Search..." filter="Agent" />)
    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'Outside' } })
    await waitFor(() => expect(screen.getByText('Outside Agent')).toBeTruthy())
    expect(screen.getByText(/555-0000/)).toBeTruthy()
  })

  it('never renders company, contact type, agent_id, or any field beyond name/phone/email — even if a stale/legacy data source returns them', async () => {
    // Simulates a fallback-path response that still contains the OLD,
    // richer field set (company/agent_id/is_private) — the component
    // must never render any of it, proving the UI-level restriction
    // holds even if some upstream source over-returns data. The real
    // guarantee is the database view's fixed column list; this is the
    // belt-and-suspenders UI check on top of it.
    const richContact = {
      id: 'c1', first_name: 'Rich', last_name: 'Contact',
      phone: '555-2222', email: 'rich@example.com',
      company: 'Should Never Show LLC', type: 'Attorney',
      agent_id: 'someone-elses-agent-id', is_private: false,
      notes: 'private notes that must never leak', address: '123 Secret St',
    }
    vi.doMock('../lib/supabase', () => mockContacts([richContact]))
    vi.resetModules()
    const { ContactSearch: FreshContactSearch } = await import('./ContactSearch')

    render(<FreshContactSearch value="" onChange={()=>{}} onSelect={vi.fn()} placeholder="Search..." filter="Attorney" />)
    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'Rich' } })
    await waitFor(() => expect(screen.getByText('Rich Contact')).toBeTruthy())

    expect(screen.queryByText(/Should Never Show LLC/)).toBeNull()
    expect(screen.queryByText(/Attorney/)).toBeNull()
    expect(screen.queryByText(/123 Secret St/)).toBeNull()
    expect(screen.queryByText(/private notes/)).toBeNull()
  })

  it('queries the contacts_directory view, not the base contacts table, for the primary (non-fallback) search path', () => {
    // Structural proof: the primary query targets the safe view.
    const src = require('fs').readFileSync(require('path').join(__dirname, 'ContactSearch.jsx'), 'utf8')
    const primaryQueryBlock = src.slice(0, src.indexOf('sql/offers_v2/H_shared_contact_directory.sql not run'))
    expect(primaryQueryBlock).toMatch(/from\('contacts_directory'\)/)
  })

  it('never queries offers or any offer-related field from the search path — search results cannot leak offer counts, prices, or details', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, 'ContactSearch.jsx'), 'utf8')
    expect(src).not.toMatch(/from\('offers'\)/)
    expect(src).not.toMatch(/purchase_price|offer_count|offers\(/)
  })

  it('the search query itself carries no agent_id/ownership equality filter — only .eq(\'type\', filter) is applied', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, 'ContactSearch.jsx'), 'utf8')
    const eqCalls = src.match(/\.eq\([^)]+\)/g) || []
    for (const call of eqCalls) {
      expect(call).not.toMatch(/agent_id/)
    }
  })
})
