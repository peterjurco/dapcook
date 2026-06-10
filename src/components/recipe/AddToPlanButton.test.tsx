import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddToPlanButton } from './AddToPlanButton'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response)
})

function lastFetchBody() {
  const calls = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
  const init = calls[calls.length - 1][1] as RequestInit
  return JSON.parse(init.body as string) as { week_start: string; day_of_week: number; recipe_id: string }
}

describe('AddToPlanButton', () => {
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
    expect(typeof body.day_of_week).toBe('number')
    expect(body.week_start).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    expect(await screen.findByText(/added to/i)).toBeInTheDocument()
  })

  it('defaults next week to Monday', async () => {
    render(<AddToPlanButton recipeId="recipe-1" />)

    await userEvent.click(screen.getByRole('button', { name: /add to plan/i }))
    await userEvent.click(screen.getByRole('button', { name: /next week/i }))
    await userEvent.click(screen.getByRole('button', { name: /add to \w+ \d+/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(lastFetchBody().day_of_week).toBe(1)
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
