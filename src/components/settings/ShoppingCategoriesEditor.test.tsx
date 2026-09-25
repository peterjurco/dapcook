import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { TranslationValues } from 'use-intl'
import { mockTranslate } from '@/test/mockMessages'
import { ShoppingCategoriesEditor } from './ShoppingCategoriesEditor'
import type { ShoppingCategory } from '@/types/database'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))

global.fetch = vi.fn()

function category(id: string, name: string, sortOrder: number) {
  return { id, household_id: 'hh-1', name, color: null, sort_order: sortOrder } as unknown as ShoppingCategory
}

const categories = [category('c1', 'Bakery', 0), category('c2', 'Dairy', 1)]

/** The modal renders after the rows, so its confirm button is the last "Delete". */
function confirmButton() {
  const buttons = screen.getAllByRole('button', { name: 'Delete' })
  return buttons[buttons.length - 1]
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)
})

describe('ShoppingCategoriesEditor', () => {
  it('reports the categories whenever they change', async () => {
    const onCategoriesChange = vi.fn()
    render(<ShoppingCategoriesEditor initialCategories={categories} onCategoriesChange={onCategoriesChange} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    fireEvent.click(confirmButton())
    await waitFor(() => expect(onCategoriesChange).toHaveBeenLastCalledWith([categories[1]]))
  })
})
