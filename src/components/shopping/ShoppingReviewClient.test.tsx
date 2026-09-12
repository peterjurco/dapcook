import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { createTranslator } from 'use-intl'
import { ShoppingReviewClient } from './ShoppingReviewClient'
import { mockTranslate } from '@/test/mockMessages'
import skMessages from '../../../messages/sk/shopping.json'
import type { TranslationValues } from 'use-intl'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))

interface PreviewItem {
  name: string
  quantity: number | null
  unit: string | null
  category: string | null
}

function setPreview(items: PreviewItem[]) {
  sessionStorage.setItem(
    'shopping_preview',
    JSON.stringify({ items, categories: [] }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
})

describe('ShoppingReviewClient', () => {
  it('pluralizes the item count and add-to-list button for a single item (English)', () => {
    setPreview([{ name: 'Milk', quantity: null, unit: null, category: null }])
    const { getByText } = render(<ShoppingReviewClient />)
    expect(getByText('1 item')).toBeTruthy()
    expect(getByText('Add 1 item to shopping list')).toBeTruthy()
  })

  it('pluralizes the item count and add-to-list button for multiple items (English)', () => {
    setPreview([
      { name: 'Milk', quantity: null, unit: null, category: null },
      { name: 'Eggs', quantity: null, unit: null, category: null },
    ])
    const { getByText } = render(<ShoppingReviewClient />)
    expect(getByText('2 items')).toBeTruthy()
    expect(getByText('Add 2 items to shopping list')).toBeTruthy()
  })

  // Slovak has a distinct "few" plural category (2-4) that English doesn't —
  // spot-check it directly against the real message catalog so the 3-way ICU
  // plural (one/few/other) isn't accidentally collapsed to a single form.
  it('uses the Slovak "few" plural category for counts 2-4', () => {
    const t = createTranslator({ locale: 'sk', namespace: 'shopping', messages: { shopping: skMessages } })
    expect(t('review.itemCount', { count: 1 })).toBe('1 položka')
    expect(t('review.itemCount', { count: 3 })).toBe('3 položky')
    expect(t('review.itemCount', { count: 5 })).toBe('5 položiek')
    expect(t('review.addToList', { count: 1 })).toBe('Pridať 1 položku do zoznamu')
    expect(t('review.addToList', { count: 3 })).toBe('Pridať 3 položky do zoznamu')
    expect(t('review.addToList', { count: 5 })).toBe('Pridať 5 položiek do zoznamu')
  })
})
