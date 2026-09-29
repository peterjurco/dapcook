import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddToPlanButton } from './AddToPlanButton'
import { WeekStartProvider } from '@/components/providers/WeekStartProvider'
import { getWeekStart, nextWeekStart, toDateString } from '@/lib/utils/week'
import { mockTranslate } from '@/test/mockMessages'
import type { TranslationValues } from 'use-intl'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))

const mockCapture = vi.fn()
vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture: mockCapture }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response)
})

function lastFetchBody() {
  const calls = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
  const init = calls[calls.length - 1][1] as RequestInit
  return JSON.parse(init.body as string) as { date: string; recipe_id: string }
}

describe('AddToPlanButton', () => {
  it('captures meal_planned with source recipe after adding from the picker', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'slot-1' }) } as Response)
    render(<AddToPlanButton recipeId="recipe-1" />)

    await userEvent.click(screen.getByRole('button', { name: /add to plan/i }))
    await userEvent.click(await screen.findByRole('button', { name: /add to \w+ \d+/i }))

    await waitFor(() =>
      expect(mockCapture).toHaveBeenCalledWith(
        'meal_planned',
        expect.objectContaining({ source: 'recipe', kind: 'recipe' }),
      ),
    )
  })

  it('opens a destination picker and adds the recipe to the chosen day', async () => {
    render(<AddToPlanButton recipeId="recipe-1" />)

    await userEvent.click(screen.getByRole('button', { name: /add to plan/i }))

    // Picker confirm button is "Add to <Weekday> <Day>" — has a digit, unlike "Add to Plan"
    const confirm = await screen.findByRole('button', { name: /add to \w+ \d+/i })
    await userEvent.click(confirm)

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/planner/slots', expect.objectContaining({ method: 'POST' })),
    )

    const body = lastFetchBody()
    expect(body.recipe_id).toBe('recipe-1')
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    expect(await screen.findByText(/added to/i)).toBeInTheDocument()
  })

  it('defaults a later week to its first day', async () => {
    render(<AddToPlanButton recipeId="recipe-1" />)

    await userEvent.click(screen.getByRole('button', { name: /add to plan/i }))
    await userEvent.click(screen.getByRole('button', { name: /next week/i }))
    await userEvent.click(screen.getByRole('button', { name: /add to \w+ \d+/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const expectedDate = toDateString(nextWeekStart(getWeekStart(today, 'monday')))
    expect(lastFetchBody().date).toBe(expectedDate)
  })

  // Regression: "Change" should move the just-placed meal, not create a second slot.
  it('deletes the previous placement when Change is used, instead of duplicating', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'slot-A' }) } as unknown as Response) // POST 1
      .mockResolvedValueOnce({ ok: true } as Response) // DELETE slot-A
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'slot-B' }) } as unknown as Response) // POST 2
    global.fetch = fetchMock as unknown as typeof fetch

    render(<AddToPlanButton recipeId="recipe-1" />)

    await userEvent.click(screen.getByRole('button', { name: /add to plan/i }))
    await userEvent.click(screen.getByRole('button', { name: /add to \w+ \d+/i }))
    await userEvent.click(await screen.findByRole('button', { name: /change/i }))
    await userEvent.click(screen.getByRole('button', { name: /add to \w+ \d+/i }))

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          (c) => String(c[0]) === '/api/planner/slots/slot-A' && (c[1] as RequestInit | undefined)?.method === 'DELETE',
        ),
      ).toBe(true),
    )
  })

  // Regression: on the recipes grid the button sits inside a card-wide link; opening
  // and using the picker must never trigger the enclosing element's click handler.
  it('does not bubble picker interactions to an enclosing clickable card', async () => {
    const onCardClick = vi.fn()
    render(
      <div onClick={onCardClick}>
        <AddToPlanButton recipeId="recipe-1" variant="overlay" />
      </div>,
    )

    await userEvent.click(screen.getByRole('button', { name: /add to plan/i }))
    await userEvent.click(screen.getByRole('button', { name: /this week/i }))
    await userEvent.click(screen.getByRole('button', { name: /add to \w+ \d+/i }))

    expect(onCardClick).not.toHaveBeenCalled()
  })
})

describe('AddToPlanButton with a Sunday week', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 30, 12)) // Wednesday 2026-09-30, local
  })
  afterEach(() => vi.useRealTimers())

  it('uses the household week and preselects today', async () => {
    render(
      <WeekStartProvider value="sunday">
        <AddToPlanButton recipeId="recipe-1" />
      </WeekStartProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: /add to plan/i }))
    await userEvent.click(screen.getByRole('button', { name: /add to \w+ \d+/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(lastFetchBody()).toMatchObject({ date: '2026-09-30' })
  })
})
