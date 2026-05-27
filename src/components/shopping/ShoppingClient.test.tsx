import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { ShoppingClient } from './ShoppingClient'
import type { ShoppingItem, ShoppingCategory } from '@/types/database'

const mockCapture = vi.fn()

vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture: mockCapture }),
}))

vi.mock('./ShoppingItemRow', () => ({
  ShoppingItemRow: () => null,
}))

const defaultProps = {
  initialList: null,
  initialItems: [] as ShoppingItem[],
  initialCategories: [] as ShoppingCategory[],
  initialRecipeNames: {},
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ShoppingClient', () => {
  it('captures shopping_list_viewed on mount', () => {
    render(<ShoppingClient {...defaultProps} />)
    expect(mockCapture).toHaveBeenCalledWith('shopping_list_viewed')
  })

  it('shows empty state when there are no items', () => {
    const { getByText } = render(<ShoppingClient {...defaultProps} />)
    expect(getByText(/add items manually or generate from the planner/i)).toBeTruthy()
  })
})
