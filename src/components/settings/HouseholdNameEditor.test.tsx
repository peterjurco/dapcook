import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { mockTranslate } from '@/test/mockMessages'
import { HouseholdNameEditor } from './HouseholdNameEditor'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => mockTranslate(namespace, key),
}))

global.fetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)
})

describe('HouseholdNameEditor', () => {
  it('renames the household and refreshes the page', async () => {
    render(<HouseholdNameEditor initialName="Home" />)
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: ' Our kitchen ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Our kitchen')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/household', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ name: 'Our kitchen' }),
    }))
    expect(refresh).toHaveBeenCalled()
  })

  it('cancels without saving', () => {
    render(<HouseholdNameEditor initialName="Home" />)
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps editing and shows an error when saving fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    render(<HouseholdNameEditor initialName="Home" />)
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'New' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText("Couldn't save the name.")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('textbox')).toBeInTheDocument())
  })
})
