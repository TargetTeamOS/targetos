// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { PolishWordingButton } from './PolishWordingButton'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
}))

function mockFetchOnce(body, ok = true) {
  return vi.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok, json: async () => body,
  })
}

describe('PolishWordingButton — never auto-applies, requires explicit Accept', () => {
  it('is disabled when there is no text to polish', () => {
    const onAccept = vi.fn()
    render(<PolishWordingButton text="" fieldLabel="Additional Terms" onAccept={onAccept} />)
    expect(screen.getByText('✨ Polish Wording').disabled).toBe(true)
  })

  it('shows original and suggested side by side, and does NOT call onAccept until the agent clicks Accept', async () => {
    mockFetchOnce({ content: [{ type: 'text', text: 'Closing subject to attorney approval.' }] })
    const onAccept = vi.fn()
    render(<PolishWordingButton text="closing subj 2 atty apprvl" fieldLabel="Additional Terms" onAccept={onAccept} />)

    fireEvent.click(screen.getByText('✨ Polish Wording'))
    await waitFor(() => expect(screen.getByText('Closing subject to attorney approval.')).toBeTruthy())

    // Original text is still visible unchanged, and onAccept has NOT
    // been called just because a suggestion was shown.
    expect(screen.getByText('closing subj 2 atty apprvl')).toBeTruthy()
    expect(onAccept).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Accept'))
    expect(onAccept).toHaveBeenCalledWith('Closing subject to attorney approval.')
  })

  it('Reject discards the suggestion without ever calling onAccept', async () => {
    mockFetchOnce({ content: [{ type: 'text', text: 'Improved wording here.' }] })
    const onAccept = vi.fn()
    render(<PolishWordingButton text="original wording" fieldLabel="Additional Terms" onAccept={onAccept} />)

    fireEvent.click(screen.getByText('✨ Polish Wording'))
    await waitFor(() => expect(screen.getByText('Improved wording here.')).toBeTruthy())

    fireEvent.click(screen.getByText('Reject'))
    expect(onAccept).not.toHaveBeenCalled()
  })

  it('fails safely with a clear message when no AI provider key is configured', async () => {
    mockFetchOnce({ error: 'No AI API key configured. Add OPENAI_API_KEY or ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables.' }, false)
    render(<PolishWordingButton text="some terms" fieldLabel="Additional Terms" onAccept={vi.fn()} />)

    fireEvent.click(screen.getByText('✨ Polish Wording'))
    await waitFor(() => expect(screen.getByText(/AI polishing is not configured yet/)).toBeTruthy())
  })

  it('sends only the field text to the AI, not the whole offer (no contact/financial data leakage)', async () => {
    const fetchSpy = mockFetchOnce({ content: [{ type: 'text', text: 'x' }] })
    render(<PolishWordingButton text="buyer requests a home warranty" fieldLabel="Additional Terms" onAccept={vi.fn()} />)
    fireEvent.click(screen.getByText('✨ Polish Wording'))
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    const [, options] = fetchSpy.mock.calls[0]
    const sentBody = JSON.parse(options.body)
    expect(sentBody.messages).toEqual([{ role: 'user', content: 'buyer requests a home warranty' }])
    expect(JSON.stringify(sentBody)).not.toMatch(/purchase_price|buyer_email|ssn/i)
  })
})
