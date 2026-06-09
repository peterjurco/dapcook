import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RecipeSearch } from './RecipeSearch'

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ json: async () => [] } as Response)
})

describe('RecipeSearch', () => {
  it('offers the typed text as a custom meal', async () => {
    const onSelectCustom = vi.fn()
    render(<RecipeSearch onSelectRecipe={vi.fn()} onSelectCustom={onSelectCustom} onClose={vi.fn()} />)

    await userEvent.type(screen.getByPlaceholderText(/search recipes/i), 'Side salad')
    const btn = await screen.findByRole('button', { name: /use .*side salad.* as a custom meal/i })
    await userEvent.click(btn)

    expect(onSelectCustom).toHaveBeenCalledWith('Side salad')
  })

  it('hides the custom-meal row when the query is empty', () => {
    render(<RecipeSearch onSelectRecipe={vi.fn()} onSelectCustom={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /as a custom meal/i })).toBeNull()
  })
})
