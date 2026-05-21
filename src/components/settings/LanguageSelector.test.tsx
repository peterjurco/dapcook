import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LanguageSelector } from './LanguageSelector'

global.fetch = vi.fn()
global.confirm = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)
  vi.mocked(confirm).mockReturnValue(false)
})

describe('LanguageSelector', () => {
  it('renders a select with supported languages', () => {
    render(<LanguageSelector initialValue="en" currentPreferredUnits="metric" recipeIds={[]} />)
    const select = screen.getByRole('combobox')
    expect(select).toBeDefined()
    expect(screen.getByRole('option', { name: 'English' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'Slovak' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'French' })).toBeDefined()
  })

  it('shows the initial value as selected', () => {
    render(<LanguageSelector initialValue="sk" currentPreferredUnits="metric" recipeIds={[]} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('sk')
  })

  it('PATCHes /api/household when value changes', async () => {
    render(<LanguageSelector initialValue="en" currentPreferredUnits="metric" recipeIds={[]} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'fr' } })
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/household', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ preferred_language: 'fr' }),
      }))
    })
  })

  it('does not show confirm dialog when recipeIds is empty', async () => {
    render(<LanguageSelector initialValue="en" currentPreferredUnits="metric" recipeIds={[]} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sk' } })
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(confirm).not.toHaveBeenCalled()
  })

  it('shows confirm dialog when recipeIds is non-empty', async () => {
    render(<LanguageSelector initialValue="en" currentPreferredUnits="metric" recipeIds={['r1', 'r2']} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sk' } })
    await waitFor(() => expect(confirm).toHaveBeenCalled())
    const confirmMsg = vi.mocked(confirm).mock.calls[0][0] as string
    expect(confirmMsg).toContain('2')
  })

  it('shows BulkTransformModal when user confirms', async () => {
    vi.mocked(confirm).mockReturnValue(true)
    render(<LanguageSelector initialValue="en" currentPreferredUnits="metric" recipeIds={['r1']} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sk' } })
    await waitFor(() => {
      expect(screen.getByTestId('bulk-transform-modal')).toBeDefined()
    })
  })
})
