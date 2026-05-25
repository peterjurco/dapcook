import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShoppingClient } from './ShoppingClient'
import type { ShoppingList, ShoppingItem, ShoppingCategory, ShoppingRule } from '@/types/database'

const mockCapture = vi.fn()

vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture: mockCapture }),
}))

vi.mock('./ShoppingItemRow', () => ({
  ShoppingItemRow: () => null,
}))

vi.mock('@/components/ui/ConfirmModal', () => ({
  ConfirmModal: () => null,
}))

const defaultProps = {
  initialList: null,
  initialItems: [] as ShoppingItem[],
  initialCategories: [] as ShoppingCategory[],
  initialRecipeNames: {},
  initialRules: [] as ShoppingRule[],
  defaultDateFrom: '2026-05-19',
  defaultDateTo: '2026-05-25',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ShoppingClient', () => {
  it('captures shopping_list_viewed on mount', () => {
    render(<ShoppingClient {...defaultProps} />)
    expect(mockCapture).toHaveBeenCalledWith('shopping_list_viewed')
  })

  it('captures shopping_list_generated after successful generation', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          list: { id: 'list-1' } as ShoppingList,
          items: [] as ShoppingItem[],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipeNames: {} }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [], categories: [] }) } as unknown as Response) // make-smarter

    render(<ShoppingClient {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /generate/i }))
    await waitFor(() => expect(mockCapture).toHaveBeenCalledWith('shopping_list_generated'))
  })

  it('does not capture shopping_list_generated on 409 (overwrite prompt)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 409 } as Response)
    render(<ShoppingClient {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /generate/i }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(mockCapture).not.toHaveBeenCalledWith('shopping_list_generated')
  })
})
