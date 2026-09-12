import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UnitPreferenceSelector } from './UnitPreferenceSelector'
import { mockTranslate } from '@/test/mockMessages'
import type { TranslationValues } from 'use-intl'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))

global.fetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)
})

describe('UnitPreferenceSelector', () => {
  it('renders metric and imperial buttons', () => {
    render(<UnitPreferenceSelector initialValue="metric" currentPreferredLanguage="en" translationEnabled={false} recipeIds={[]} />)
    expect(screen.getByRole('button', { name: 'metric' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'imperial' })).toBeDefined()
  })

  it('highlights the initial value', () => {
    render(<UnitPreferenceSelector initialValue="metric" currentPreferredLanguage="en" translationEnabled={false} recipeIds={[]} />)
    const metricBtn = screen.getByRole('button', { name: 'metric' })
    expect(metricBtn.className).toContain('bg-gray-900')
  })

  it('PATCHes /api/household when value changes', async () => {
    render(<UnitPreferenceSelector initialValue="metric" currentPreferredLanguage="en" translationEnabled={false} recipeIds={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'imperial' }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/household', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ preferred_units: 'imperial' }),
      }))
    })
  })

  it('does not show confirm modal when recipeIds is empty', async () => {
    render(<UnitPreferenceSelector initialValue="metric" currentPreferredLanguage="en" translationEnabled={false} recipeIds={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'imperial' }))
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByText(/will be updated/)).toBeNull()
  })

  it('shows confirm modal when recipeIds is non-empty', async () => {
    render(<UnitPreferenceSelector initialValue="metric" currentPreferredLanguage="en" translationEnabled={false} recipeIds={['r1', 'r2', 'r3']} />)
    fireEvent.click(screen.getByRole('button', { name: 'imperial' }))
    await waitFor(() => {
      expect(screen.getByText('Convert your recipes to imperial units?')).toBeDefined()
      expect(screen.getByText(/3 recipes will be updated/)).toBeDefined()
    })
  })

  it('shows BulkTransformModal when user clicks confirm in modal', async () => {
    render(<UnitPreferenceSelector initialValue="metric" currentPreferredLanguage="en" translationEnabled={false} recipeIds={['r1']} />)
    fireEvent.click(screen.getByRole('button', { name: 'imperial' }))
    await waitFor(() => expect(screen.getByText('Convert your recipes to imperial units?')).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))
    await waitFor(() => {
      expect(screen.getByTestId('bulk-transform-modal')).toBeDefined()
    })
  })

  it('dismisses confirm modal when user clicks Not now', async () => {
    render(<UnitPreferenceSelector initialValue="metric" currentPreferredLanguage="en" translationEnabled={false} recipeIds={['r1']} />)
    fireEvent.click(screen.getByRole('button', { name: 'imperial' }))
    await waitFor(() => expect(screen.getByText('Convert your recipes to imperial units?')).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByText(/will be updated/)).toBeNull()
    expect(screen.queryByTestId('bulk-transform-modal')).toBeNull()
  })

  it('reverts to previous value when API call fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    render(<UnitPreferenceSelector initialValue="metric" currentPreferredLanguage="en" translationEnabled={false} recipeIds={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'imperial' }))
    await waitFor(() => {
      const metricBtn = screen.getByRole('button', { name: 'metric' })
      expect(metricBtn.className).toContain('bg-gray-900')
    })
  })
})
