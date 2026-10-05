import { useEffect } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ShoppingClient } from './ShoppingClient'
import { TourProvider } from '@/components/tour/TourProvider'
import { mockTranslate } from '@/test/mockMessages'
import type { TranslationValues } from 'use-intl'
import type { ShoppingItem, ShoppingList, ShoppingCategory } from '@/types/database'

const mockCapture = vi.fn()
const realtime = vi.hoisted(() => ({
  insertHandler: null as null | ((payload: { new: ShoppingItem }) => void),
}))

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))

vi.mock('next/navigation', () => ({ usePathname: () => '/shopping' }))

vi.mock('@/components/tour/TourOverlay', () => ({
  // Mirrors the real overlay's advanceOnTargetClick behaviour: clicking the target advances the tour.
  TourOverlay: ({ step, onNext }: { step: { target: string }; onNext: () => void }) => {
    useEffect(() => {
      const el = document.querySelector(`[data-tour="${step.target}"]`)
      el?.addEventListener('click', onNext)
      return () => el?.removeEventListener('click', onNext)
    }, [step.target, onNext])
    return <div data-testid="tour-stub">{step.target}</div>
  },
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
  generated_weeks: [],
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

  it('pluralizes the item count for singular vs plural', () => {
    const singular = render(
      <ShoppingClient {...defaultProps} initialList={mockList} initialItems={[mockItem]} />
    )
    expect(singular.getByText('1 item')).toBeTruthy()
    singular.unmount()

    const secondItem: ShoppingItem = { ...mockItem, id: 'item-2', name: 'Eggs' }
    const plural = render(
      <ShoppingClient {...defaultProps} initialList={mockList} initialItems={[mockItem, secondItem]} />
    )
    expect(plural.getByText('2 items')).toBeTruthy()
  })

  it('shows empty state when there are no items', () => {
    const { getByText } = render(<ShoppingClient {...defaultProps} />)
    expect(getByText(/add items manually or generate from the planner/i)).toBeTruthy()
  })

  it('shows Clear list button when list has items', () => {
    const { getByRole } = render(
      <ShoppingClient {...defaultProps} initialList={mockList} initialItems={[mockItem]} />
    )
    expect(getByRole('button', { name: 'Clear list' })).toBeTruthy()
  })

  it('captures shopping_item_checked once the check animation completes', async () => {
    const { getByRole } = render(
      <ShoppingClient {...defaultProps} initialList={mockList} initialItems={[mockItem]} />
    )
    fireEvent.click(getByRole('checkbox'))
    await waitFor(() => expect(mockCapture).toHaveBeenCalledWith('shopping_item_checked', expect.anything()), { timeout: 1500 })
  })

  it('does not show Clear list button when list is empty', () => {
    const { queryByRole } = render(
      <ShoppingClient {...defaultProps} initialList={mockList} initialItems={[]} />
    )
    expect(queryByRole('button', { name: 'Clear list' })).toBeNull()
  })

  it('shows confirmation dialog when Clear list is clicked', () => {
    const { getByText, getByRole } = render(
      <ShoppingClient {...defaultProps} initialList={mockList} initialItems={[mockItem]} />
    )
    fireEvent.click(getByRole('button', { name: 'Clear list' }))
    expect(getByText('Remove all items from the list?')).toBeTruthy()
  })

  it('hides confirmation dialog when Cancel is clicked', () => {
    const { getByText, queryByText, getByRole } = render(
      <ShoppingClient {...defaultProps} initialList={mockList} initialItems={[mockItem]} />
    )
    fireEvent.click(getByRole('button', { name: 'Clear list' }))
    fireEvent.click(getByText('Cancel'))
    expect(queryByText('Remove all items from the list?')).toBeNull()
  })

  it('calls DELETE API and closes dialog when Clear is confirmed', () => {
    const { queryByText, getByRole } = render(
      <ShoppingClient {...defaultProps} initialList={mockList} initialItems={[mockItem]} />
    )
    fireEvent.click(getByRole('button', { name: 'Clear list' }))
    fireEvent.click(getByRole('button', { name: 'Clear' }))
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

  it('shows an Add item row that appends an editable item and saves it on Enter', async () => {
    const itemId = '33333333-3333-4333-8333-333333333333'
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValueOnce(itemId)
    vi.mocked(fetch).mockImplementation((url) =>
      Promise.resolve(
        url === '/api/shopping/items'
          ? { ok: true, json: () => Promise.resolve({ ...mockItem, id: itemId, name: 'Eggs', sort_order: 1 }) }
          : { ok: true },
      ) as Promise<Response>,
    )
    render(<ShoppingClient {...defaultProps} initialList={mockList} initialItems={[mockItem]} />)

    const addRow = screen.getByRole('button', { name: 'Add item' })
    expect(addRow).toHaveAttribute('data-tour', 'shopping-add')
    fireEvent.click(addRow)

    const input = screen.getByRole('textbox')
    expect(input).toHaveFocus()
    fireEvent.change(input, { target: { value: 'Eggs' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    const createRequest = vi.mocked(fetch).mock.calls.find(([url]) => url === '/api/shopping/items')
    expect(JSON.parse(createRequest?.[1]?.body as string)).toMatchObject({ id: itemId, name: 'Eggs' })
    await waitFor(() => expect(screen.getByText('Milk')).toBeTruthy())
  })

  it('walks the shopping-list tour from Copy list to Add item and finishes it', async () => {
    vi.useFakeTimers()
    const write = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { write, writeText: vi.fn() }, configurable: true })
    vi.stubGlobal('ClipboardItem', class { constructor(public items: unknown) {} })
    try {
      render(
        <TourProvider initialSeen={[]}>
          <ShoppingClient {...defaultProps} initialList={mockList} initialItems={[mockItem]} />
        </TourProvider>,
      )
      expect(screen.queryByTestId('tour-stub')).toBeNull()
      await act(async () => { vi.advanceTimersByTime(700) })
      expect(screen.getByTestId('tour-stub')).toHaveTextContent('shopping-copy')

      // Copying is what the step suggests, so it moves on to the next step.
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /copy list/i }))
      })
      expect(write).toHaveBeenCalled()
      expect(screen.getByTestId('tour-stub')).toHaveTextContent('shopping-add')
      expect(vi.mocked(fetch)).not.toHaveBeenCalledWith('/api/profile', expect.anything())

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
      })
      expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/profile', expect.objectContaining({
        body: JSON.stringify({ tour_seen: 'shopping-list' }),
      }))
      expect(screen.queryByTestId('tour-stub')).toBeNull()
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it('keeps the empty-state Add item button working', () => {
    render(<ShoppingClient {...defaultProps} initialList={mockList} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    expect(screen.getByRole('textbox')).toHaveFocus()
  })

  describe('checking off an item', () => {
    const checkFailedText = "Couldn't save the change. Check your connection and try again."

    it('puts the item back and says so when the server rejects the change', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
      render(<ShoppingClient {...defaultProps} initialList={mockList} initialItems={[mockItem]} />)

      fireEvent.click(screen.getByRole('checkbox'))

      expect(await screen.findByRole('alert', {}, { timeout: 1500 })).toHaveTextContent(checkFailedText)
      expect(screen.getByText('Milk')).toBeTruthy()
      expect(screen.getByRole('checkbox')).not.toBeChecked()
      expect(screen.getByText('1 item')).toBeTruthy()
    })

    it('puts the item back when offline', async () => {
      vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))
      render(<ShoppingClient {...defaultProps} initialList={mockList} initialItems={[mockItem]} />)

      fireEvent.click(screen.getByRole('checkbox'))

      expect(await screen.findByRole('alert', {}, { timeout: 1500 })).toHaveTextContent(checkFailedText)
      expect(screen.getByText('Milk')).toBeTruthy()
    })

    it('clears the warning once a later change saves', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))
      render(<ShoppingClient {...defaultProps} initialList={mockList} initialItems={[mockItem]} />)

      fireEvent.click(screen.getByRole('checkbox'))
      await screen.findByRole('alert', {}, { timeout: 1500 })

      fireEvent.click(screen.getByRole('checkbox'))
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull(), { timeout: 1500 })
      expect(screen.queryByText('Milk')).toBeNull()
    })
  })

  describe('adding an item below another', () => {
    function mockCreate() {
      vi.mocked(fetch).mockImplementation((url, init) =>
        Promise.resolve(
          url === '/api/shopping/items'
            ? { ok: true, json: () => Promise.resolve({ ...mockItem, ...JSON.parse(init!.body as string), sort_order: 99 }) }
            : { ok: true },
        ) as Promise<Response>,
      )
    }

    async function addBelow(name: string) {
      fireEvent.click(screen.getByText(name))
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Eggs' } })
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
      await waitFor(() => expect(sortOrderPatch()).toBeDefined())
    }

    function sortOrderPatch() {
      const call = vi.mocked(fetch).mock.calls.find(
        ([url, init]) => String(url).startsWith('/api/shopping/items/') && init?.method === 'PATCH' && String(init.body).includes('sort_order'),
      )
      return call && JSON.parse(call[1]!.body as string).sort_order
    }

    it('lands halfway to the next item, even when that one sits half a step away', async () => {
      mockCreate()
      const bread: ShoppingItem = { ...mockItem, id: 'item-2', name: 'Bread', sort_order: 0.5 }
      render(<ShoppingClient {...defaultProps} initialList={mockList} initialItems={[mockItem, bread]} />)

      await addBelow('Milk')

      expect(sortOrderPatch()).toBe(0.25)
    })

    it('goes one step past the last item of its category', async () => {
      mockCreate()
      const bread: ShoppingItem = { ...mockItem, id: 'item-2', name: 'Bread', category: 'Bakery', sort_order: 0.5 }
      render(
        <ShoppingClient
          {...defaultProps}
          initialList={mockList}
          initialItems={[mockItem, bread]}
          initialCategories={[{ id: 'c1', household_id: 'hh-1', name: 'Bakery', color: null, sort_order: 0 } as ShoppingCategory]}
        />,
      )

      await addBelow('Milk')

      expect(sortOrderPatch()).toBe(1)
    })
  })
})
