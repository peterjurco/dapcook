import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { ShoppingClient } from './ShoppingClient'
import type { ShoppingItem, ShoppingList, ShoppingCategory } from '@/types/database'

const mockCapture = vi.fn()
const realtime = vi.hoisted(() => ({
  insertHandler: null as null | ((payload: { new: ShoppingItem }) => void),
  /** Called by `.subscribe(cb)` — invoke with 'SUBSCRIBED' to simulate a (re)connect. */
  statusHandler: null as null | ((status: string) => void),
  /** Rows the next `select()` resolves with. */
  serverItems: [] as ShoppingItem[],
  selectCount: 0,
  connected: true,
  connectCount: 0,
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
      subscribe: vi.fn((statusHandler?: (status: string) => void) => {
        realtime.statusHandler = statusHandler ?? null
        return channel
      }),
    }
    return {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
      realtime: {
        isConnected: vi.fn(() => realtime.connected),
        connect: vi.fn(() => { realtime.connectCount += 1 }),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => {
            realtime.selectCount += 1
            return Promise.resolve({ data: realtime.serverItems, error: null })
          }),
        })),
      })),
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
  realtime.statusHandler = null
  realtime.serverItems = []
  realtime.selectCount = 0
  realtime.connected = true
  realtime.connectCount = 0
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

  describe('resyncing after a lost connection', () => {
    const bread: ShoppingItem = {
      id: 'item-2',
      shopping_list_id: 'list-1',
      name: 'Bread',
      quantity: null,
      unit: null,
      category: null,
      is_checked: false,
      sort_order: 1,
      source_recipe_ids: [],
    }

    function renderList(initialItems = [mockItem]) {
      return render(
        <ShoppingClient {...defaultProps} initialList={mockList} initialItems={initialItems} />
      )
    }

    async function becomeVisible() {
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    }

    it('pulls the list whenever the channel (re)connects', async () => {
      renderList()
      expect(screen.queryByText('Bread')).toBeNull()
      realtime.serverItems = [mockItem, bread]

      await act(async () => { realtime.statusHandler?.('SUBSCRIBED') })

      expect(screen.getByText('Bread')).toBeTruthy()
    })

    it('pulls the list when the tab becomes visible again', async () => {
      renderList()
      realtime.serverItems = [mockItem, bread]

      await becomeVisible()

      expect(realtime.selectCount).toBe(1)
      expect(screen.getByText('Bread')).toBeTruthy()
    })

    it('reconnects a dropped socket when the tab becomes visible again', async () => {
      renderList()
      realtime.connected = false

      await becomeVisible()

      expect(realtime.connectCount).toBe(1)
    })

    it('leaves a live socket alone when the tab becomes visible again', async () => {
      renderList()

      await becomeVisible()

      expect(realtime.connectCount).toBe(0)
    })

    it('drops items another device deleted while the tab was hidden', async () => {
      renderList([mockItem, bread])
      realtime.serverItems = [mockItem]

      await becomeVisible()

      expect(screen.queryByText('Bread')).toBeNull()
    })

    it('keeps an unsaved new item across a resync', async () => {
      renderList([])
      fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
      expect(screen.getByRole('textbox')).toBeTruthy()
      realtime.serverItems = [bread]

      await becomeVisible()

      expect(screen.getByText('Bread')).toBeTruthy()
      expect(screen.getByRole('textbox')).toBeTruthy()
    })

    it('does not resurrect an item whose delete is still in flight', async () => {
      renderList([mockItem, bread])
      vi.mocked(fetch).mockReturnValue(new Promise(() => {}) as Promise<Response>)
      fireEvent.click(screen.getAllByTitle('Delete')[1])
      expect(screen.queryByText('Bread')).toBeNull()
      realtime.serverItems = [mockItem, bread]

      await becomeVisible()

      expect(screen.queryByText('Bread')).toBeNull()
    })

    it('does not revert a check-off whose write is still in flight', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      try {
        renderList([mockItem, bread])
        vi.mocked(fetch).mockReturnValue(new Promise(() => {}) as Promise<Response>)
        fireEvent.click(screen.getAllByRole('checkbox')[1])
        // The row cross-out/collapse animation runs before onCheck fires
        await act(async () => { vi.advanceTimersByTime(700) })
        expect(screen.queryByText('Bread')).toBeNull()

        realtime.serverItems = [mockItem, bread]   // server hasn't caught up yet
        await becomeVisible()

        expect(screen.queryByText('Bread')).toBeNull()
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('editing a freshly created item', () => {
    const itemId = '11111111-1111-4111-8111-111111111111'
    const persisted: ShoppingItem = {
      ...mockItem,
      id: itemId,
      name: 'Milk',
      quantity: null,
      unit: null,
    }

    beforeEach(() => {
      // A fresh queue per test — `mockReturnValueOnce` leaks across tests,
      // which would hand a row a different id and remount it.
      const uuids = [itemId, '22222222-2222-4222-8222-222222222222']
      vi.spyOn(globalThis.crypto, 'randomUUID')
        .mockImplementation(() => uuids.shift() as ReturnType<Crypto['randomUUID']>)
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(persisted),
      } as unknown as Response)
    })

    async function addMilk(finish: (input: HTMLElement) => void) {
      render(<ShoppingClient {...defaultProps} initialList={mockList} />)
      fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Milk' } })
      await act(async () => { finish(screen.getByRole('textbox')) })
    }

    function openEditorValue() {
      return (screen.getByRole('textbox') as HTMLInputElement).value
    }

    it('can be re-opened for editing after an Enter-save', async () => {
      // Enter also spawns a blank row below, which starts in edit mode; focusing
      // the Milk editor blurs it and discards it, so one editor stays open.
      await addMilk((input) => fireEvent.keyDown(input, { key: 'Enter' }))
      expect(openEditorValue()).toBe('')

      fireEvent.click(screen.getByText('Milk'))

      expect(openEditorValue()).toBe('Milk')
    })

    it('can be re-opened for editing after a blur-save', async () => {
      await addMilk((input) => fireEvent.blur(input))
      expect(screen.queryAllByRole('textbox')).toHaveLength(0)

      fireEvent.click(screen.getByText('Milk'))

      expect(openEditorValue()).toBe('Milk')
    })

    it('can be re-opened for editing after a failed save is retried', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response)
      await addMilk((input) => fireEvent.blur(input))
      expect(screen.getByText('Failed to save')).toBeTruthy()

      await act(async () => {
        fireEvent.mouseDown(screen.getByText('Retry'))
      })
      expect(screen.queryByText('Failed to save')).toBeNull()
      fireEvent.click(screen.getByText('Milk'))

      expect(openEditorValue()).toBe('Milk')
    })
  })
})
