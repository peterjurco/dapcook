import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UnitPreferenceSelector } from './UnitPreferenceSelector'

global.fetch = vi.fn()
global.confirm = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)
  vi.mocked(confirm).mockReturnValue(false)
})

describe('UnitPreferenceSelector', () => {
  it('renders metric and imperial buttons', () => {
    render(<UnitPreferenceSelector initialValue="metric" currentPreferredLanguage="en" recipeIds={[]} />)
    expect(screen.getByRole('button', { name: 'metric' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'imperial' })).toBeDefined()
  })

  it('highlights the initial value', () => {
    render(<UnitPreferenceSelector initialValue="metric" currentPreferredLanguage="en" recipeIds={[]} />)
    const metricBtn = screen.getByRole('button', { name: 'metric' })
    expect(metricBtn.className).toContain('bg-gray-900')
  })

  it('PATCHes /api/household when value changes', async () => {
    render(<UnitPreferenceSelector initialValue="metric" currentPreferredLanguage="en" recipeIds={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'imperial' }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/household', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ preferred_units: 'imperial' }),
      }))
    })
  })

  it('does not show confirm dialog when recipeIds is empty', async () => {
    render(<UnitPreferenceSelector initialValue="metric" currentPreferredLanguage="en" recipeIds={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'imperial' }))
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(confirm).not.toHaveBeenCalled()
  })

  it('shows confirm dialog when recipeIds is non-empty', async () => {
    render(<UnitPreferenceSelector initialValue="metric" currentPreferredLanguage="en" recipeIds={['r1', 'r2', 'r3']} />)
    fireEvent.click(screen.getByRole('button', { name: 'imperial' }))
    await waitFor(() => expect(confirm).toHaveBeenCalled())
    const msg = vi.mocked(confirm).mock.calls[0][0] as string
    expect(msg).toContain('3')
  })

  it('shows BulkTransformModal when user confirms', async () => {
    vi.mocked(confirm).mockReturnValue(true)
    render(<UnitPreferenceSelector initialValue="metric" currentPreferredLanguage="en" recipeIds={['r1']} />)
    fireEvent.click(screen.getByRole('button', { name: 'imperial' }))
    await waitFor(() => {
      expect(screen.getByTestId('bulk-transform-modal')).toBeDefined()
    })
  })

  it('reverts to previous value when API call fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    render(<UnitPreferenceSelector initialValue="metric" currentPreferredLanguage="en" recipeIds={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'imperial' }))
    await waitFor(() => {
      const metricBtn = screen.getByRole('button', { name: 'metric' })
      expect(metricBtn.className).toContain('bg-gray-900')
    })
  })
})
