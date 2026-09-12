import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LanguageSelector } from './LanguageSelector'
import { mockTranslate } from '@/test/mockMessages'
import type { TranslationValues } from 'use-intl'

// LanguageSelector is unused dead code left over from before the i18n
// migration (superseded by TranslationSettings), so it isn't itself
// migrated — but it renders ConfirmTransformModal/BulkTransformModal, which
// now call useTranslations, so this test still needs the mock.
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))

global.fetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)
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

  it('does not show confirm modal when recipeIds is empty', async () => {
    render(<LanguageSelector initialValue="en" currentPreferredUnits="metric" recipeIds={[]} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sk' } })
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByText(/will be updated/)).toBeNull()
  })

  it('shows confirm modal when recipeIds is non-empty', async () => {
    render(<LanguageSelector initialValue="en" currentPreferredUnits="metric" recipeIds={['r1', 'r2']} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sk' } })
    await waitFor(() => {
      expect(screen.getByText('Translate your recipes to Slovak?')).toBeDefined()
      expect(screen.getByText(/2 recipes will be updated/)).toBeDefined()
    })
  })

  it('reverts to previous value when API call fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    render(<LanguageSelector initialValue="en" currentPreferredUnits="metric" recipeIds={[]} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sk' } })
    await waitFor(() => {
      const select = screen.getByRole('combobox') as HTMLSelectElement
      expect(select.value).toBe('en')
    })
  })

  it('does not show confirm modal when API call fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    render(<LanguageSelector initialValue="en" currentPreferredUnits="metric" recipeIds={['r1']} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sk' } })
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByText(/will be updated/)).toBeNull()
  })

  it('shows BulkTransformModal when user clicks confirm in modal', async () => {
    render(<LanguageSelector initialValue="en" currentPreferredUnits="metric" recipeIds={['r1']} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sk' } })
    await waitFor(() => expect(screen.getByText('Translate your recipes to Slovak?')).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Translate all' }))
    await waitFor(() => {
      expect(screen.getByTestId('bulk-transform-modal')).toBeDefined()
    })
  })

  it('dismisses confirm modal when user clicks Not now', async () => {
    render(<LanguageSelector initialValue="en" currentPreferredUnits="metric" recipeIds={['r1']} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sk' } })
    await waitFor(() => expect(screen.getByText('Translate your recipes to Slovak?')).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByText(/will be updated/)).toBeNull()
    expect(screen.queryByTestId('bulk-transform-modal')).toBeNull()
  })
})
