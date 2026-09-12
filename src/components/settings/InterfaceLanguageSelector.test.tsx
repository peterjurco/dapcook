import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InterfaceLanguageSelector } from './InterfaceLanguageSelector'

const refreshMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

global.fetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)
})

describe('InterfaceLanguageSelector', () => {
  it('renders both locale options with the initial value selected', () => {
    render(<InterfaceLanguageSelector initialValue="en" />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('en')
    expect(screen.getByRole('option', { name: 'English' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'Slovenčina' })).toBeDefined()
  })

  it('PATCHes /api/profile with ui_language when changed', async () => {
    render(<InterfaceLanguageSelector initialValue="en" />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sk' } })
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ui_language: 'sk' }),
      })
    })
  })

  it('refreshes the router after a successful save', async () => {
    render(<InterfaceLanguageSelector initialValue="en" />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sk' } })
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('disables the select while saving', async () => {
    let resolveFetch: (value: Response) => void = () => {}
    vi.mocked(fetch).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve
      }) as Promise<Response>
    )
    render(<InterfaceLanguageSelector initialValue="en" />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'sk' } })
    await waitFor(() => expect(select.disabled).toBe(true))
    resolveFetch({ ok: true } as Response)
    await waitFor(() => expect(select.disabled).toBe(false))
  })
})
