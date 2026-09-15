import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import RecipesLoading from './loading'
import { RECIPE_GRID_CLASSES } from '@/components/recipe/gridClasses'

describe('recipes loading skeleton', () => {
  it('lays its placeholders out on the same grid as the real list', () => {
    // If these drift apart the skeleton jumps as the real cards replace it.
    const { container } = render(<RecipesLoading />)

    expect(container.querySelector(`.${CSS.escape(RECIPE_GRID_CLASSES.split(' ')[0])}`)).not.toBeNull()
    const grid = container.querySelector('[data-testid="recipe-grid-skeleton"]')
    expect(grid?.getAttribute('class')).toBe(RECIPE_GRID_CLASSES)
  })

  it('shows enough cards to fill the fold', () => {
    const { container } = render(<RecipesLoading />)

    const cards = container.querySelectorAll('[data-testid="recipe-card-skeleton"]')
    expect(cards.length).toBeGreaterThanOrEqual(8)
  })

  it('is decorative, so assistive tech is not read a wall of empty boxes', () => {
    const { container } = render(<RecipesLoading />)

    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
  })
})
