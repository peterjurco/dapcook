import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddToPlanButton } from './AddToPlanButton'

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response)
})

describe('AddToPlanButton', () => {
  it('adds the recipe to the next empty planner slot', async () => {
    render(<AddToPlanButton recipeId="recipe-1" />)

    await userEvent.click(screen.getByRole('button', { name: /add to plan/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/planner/slots/next-empty',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ recipe_id: 'recipe-1' }),
      })
    ))
    expect(await screen.findByRole('button', { name: /added/i })).toBeInTheDocument()
  })
})
