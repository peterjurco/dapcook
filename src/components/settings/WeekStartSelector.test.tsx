import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TranslationValues } from 'use-intl'
import { mockTranslate } from '@/test/mockMessages'
import { WeekStartSelector } from './WeekStartSelector'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn().mockResolvedValue({ ok: true })
})

describe('WeekStartSelector', () => {
  it('marks the current day and saves a new one', async () => {
    render(<WeekStartSelector initialValue="monday" />)
    expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'Sunday' }))

    expect(global.fetch).toHaveBeenCalledWith('/api/household', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ week_start_day: 'sunday' }),
    }))
    expect(screen.getByRole('button', { name: 'Sunday' })).toHaveAttribute('aria-pressed', 'true')
    expect(refresh).toHaveBeenCalled()
  })

  it('reverts when saving fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    render(<WeekStartSelector initialValue="monday" />)
    await userEvent.click(screen.getByRole('button', { name: 'Saturday' }))
    expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-pressed', 'true')
    expect(refresh).not.toHaveBeenCalled()
  })
})
