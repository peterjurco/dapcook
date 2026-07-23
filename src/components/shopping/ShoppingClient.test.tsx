import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { ShoppingClient } from './ShoppingClient'
import type { ShoppingItem, ShoppingList, ShoppingCategory } from '@/types/database'

const mockCapture = vi.fn()
const realtime = vi.hoisted(() => ({
  insertHandler: null as null | ((payload: { new: ShoppingItem }) => void),
}))

vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture: mockCapture }),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const channel = {
      on: vi.fn((
        _type: string,
        config: { event: string },
        handler: (payload: { new: ShoppingItem }) => void
      ) => {
        if (config.event === 'INSERT') realtime.insertHandler = handler
        return channel
      }),
      subscribe: vi.fn(() => channel),
    }
    return {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    }
  },
}))

const mockList: ShoppingList = {
  id: 'list-1',
  household_id: 'hh-1',
  week_plan_id: null,
  name: 'My List',
  date_from: null,
  date_to: null,
  created_at: '2026-06-08T00:00:00Z',
}

const mockItem: ShoppingItem = {
  id: 'item-1',
  shopping_list_id: 'list-1',
  name: 'Milk',
  quantity: 1,
  unit: 'l',
  category: null,
  is_checked: false,
  sort_order: 0,
  source_recipe_ids: [],
}

const defaultProps = {
  initialList: null,
  initialItems: [] as ShoppingItem[],
  initialCategories: [] as ShoppingCategory[],
  initialRecipeNames: {},
}

beforeEach(() => {
  vi.clearAllMocks()
  realtime.insertHandler = null
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
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

  it('shows Clear list button when list has items', () => {
    const { getByText } = render(
      <ShoppingClient {...defaultProps} initialList={mockList} initialItems={[mockItem]} />
    )
    expect(getByText('Clear list')).toBeTruthy()
  })

  it('does not show Clear list button when list is empty', () => {
    const { queryByText } = render(
      <ShoppingClient {...defaultProps} initialList={mockList} initialItems={[]} />
    )
    expect(queryByText('Clear list')).toBeNull()
  })

  it('shows confirmation dialog when Clear list is clicked', () => {
    const { getByText } = render(
      <ShoppingClient {...defaultProps} initialList={mockList} initialItems={[mockItem]} />
    )
    fireEvent.click(getByText('Clear list'))
    expect(getByText('Remove all items from the list?')).toBeTruthy()
  })

  it('hides confirmation dialog when Cancel is clicked', () => {
    const { getByText, queryByText } = render(
      <ShoppingClient {...defaultProps} initialList={mockList} initialItems={[mockItem]} />
    )
    fireEvent.click(getByText('Clear list'))
    fireEvent.click(getByText('Cancel'))
    expect(queryByText('Remove all items from the list?')).toBeNull()
  })

  it('calls DELETE API and closes dialog when Clear is confirmed', () => {
    const { getByText, queryByText } = render(
      <ShoppingClient {...defaultProps} initialList={mockList} initialItems={[mockItem]} />
    )
    fireEvent.click(getByText('Clear list'))
    fireEvent.click(getByText('Clear'))
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/shopping/list/list-1/items',
      { method: 'DELETE' }
    )
    expect(queryByText('Remove all items from the list?')).toBeNull()
  })

  it('does not append a realtime duplicate while a new item is saving', async () => {
    const itemId = '11111111-1111-4111-8111-111111111111'
    const randomUuid = vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce(itemId)
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222')
    const persistedItem: ShoppingItem = {
      ...mockItem,
      id: itemId,
      name: 'Milk',
    }
    let resolvePost!: (response: { ok: boolean; json: () => Promise<ShoppingItem> }) => void
    const postResponse = new Promise<{ ok: boolean; json: () => Promise<ShoppingItem> }>((resolve) => {
      resolvePost = resolve
    })
    vi.mocked(fetch).mockImplementation((url) => {
      if (url === '/api/shopping/items') return postResponse as Promise<Response>
      return Promise.resolve({ ok: true }) as Promise<Response>
    })

    render(
      <ShoppingClient {...defaultProps} initialList={mockList} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Milk' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })

    const createRequest = vi.mocked(fetch).mock.calls.find(([url]) => url === '/api/shopping/items')
    expect(JSON.parse(createRequest?.[1]?.body as string)).toMatchObject({ id: itemId })
    expect(realtime.insertHandler).not.toBeNull()
    act(() => {
      realtime.insertHandler?.({ new: persistedItem })
    })

    try {
      expect(screen.getAllByText('Milk')).toHaveLength(1)
    } finally {
      await act(async () => {
        resolvePost({
          ok: true,
          json: () => Promise.resolve(persistedItem),
        })
        await postResponse
      })
      randomUuid.mockRestore()
    }
  })
})
