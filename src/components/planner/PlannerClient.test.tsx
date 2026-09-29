import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlannerClient } from './PlannerClient'
import { mockTranslate } from '@/test/mockMessages'
import type { TranslationValues } from 'use-intl'
import type { WeekData } from '@/types/planner'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))

const mockCapture = vi.fn()
vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture: mockCapture }),
}))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  pointerWithin: vi.fn(),
}))

vi.mock('./SlotCard', () => ({
  SlotCard: ({ slot }: { slot: WeekData['slots'][number] }) => <div>{slot.recipe?.title}</div>,
}))

vi.mock('./CustomLabelCard', () => ({
  CustomLabelCard: ({ slot }: { slot: WeekData['slots'][number] }) => <div>{slot.custom_label}</div>,
}))

vi.mock('./WeekNav', () => ({
  WeekNav: () => <nav>Week nav</nav>,
}))

vi.mock('./MobileEditList', () => ({
  MobileEditList: ({
    onMove,
  }: {
    onMove: (slotId: string, newDay: number) => void
  }) => (
    <div>
      Mobile edit
      <button type="button" onClick={() => onMove('slot-1', 1)}>move slot-1 to day 1</button>
      <button type="button" onClick={() => onMove('slot-1', 4)}>move slot-1 to day 4</button>
    </div>
  ),
}))

vi.mock('./PlannerDesktopGrid', () => ({
  PlannerDesktopGrid: ({
    slots,
    onAddCustom,
    onSpanPreview,
    onSpanCommit,
  }: {
    slots: Array<WeekData['slots'][number] & { day: number; span: number; continued: boolean }>
    onAddCustom: (day: number, label: string) => void
    onSpanPreview: (slotId: string, newSpan: number) => void
    onSpanCommit: (slotId: string, newSpan: number) => void
  }) => (
    <div data-testid="planner-grid">
      {slots.map((s) => (
        <div key={s.id} data-id={s.id} data-day={s.day} data-span={s.span} data-continued={String(s.continued)}>
          {s.recipe?.title ?? s.custom_label}
        </div>
      ))}
      <button type="button" onClick={() => onAddCustom(3, 'Leftovers')}>add on day 3</button>
      <button type="button" onClick={() => { onSpanPreview('slot-1', 2); onSpanPreview('slot-1', 3) }}>drag slot-1 to 3 days</button>
      <button type="button" onClick={() => onSpanCommit('slot-1', 3)}>release slot-1 at 3 days</button>
    </div>
  ),
}))

vi.mock('./PlannerMobileAgenda', () => ({
  PlannerMobileAgenda: () => <div>Mobile agenda</div>,
}))

function response(data: WeekData) {
  return {
    ok: true,
    json: async () => data,
  } as Response
}

function weekData(recipeTitle: string, date = '2026-06-01'): WeekData {
  return {
    weekPlan: {
      id: 'week-plan-1',
      household_id: 'household-1',
      week_start: '2026-06-01',
      generated_by: null,
      ai_reasoning: null,
      created_at: '2026-06-01T00:00:00.000Z',
    },
    slots: [{
      id: 'slot-1',
      household_id: 'household-1',
      date,
      meal_type: 'lunch',
      recipe_id: 'recipe-1',
      servings_scale: 1,
      custom_label: null,
      span_days: 1,
      created_at: '2026-01-01T00:00:00.000Z',
      recipe: {
        id: 'recipe-1',
        title: recipeTitle,
        image_url: null,
        cook_time_min: null,
        prep_time_min: null,
        servings: null,
      },
    }],
    weekRules: [],
  }
}

function emptyWeekData(weekStart = '2026-06-08'): WeekData {
  return {
    weekPlan: {
      id: `week-plan-${weekStart}`,
      household_id: 'household-1',
      week_start: weekStart,
      generated_by: null,
      ai_reasoning: null,
      created_at: `${weekStart}T00:00:00.000Z`,
    },
    slots: [],
    weekRules: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PlannerClient', () => {
  it('renders cached week data immediately while revalidating after remount', async () => {
    let resolveSecondFetch: (res: Response) => void = () => {}
    global.fetch = vi.fn()
      .mockResolvedValueOnce(response(weekData('Cached Pasta')))
      .mockReturnValueOnce(new Promise<Response>((resolve) => {
        resolveSecondFetch = resolve
      }))

    const weekStart = new Date('2026-06-01T00:00:00.000Z')
    const firstRender = render(<PlannerClient weekStart={weekStart} />)
    expect(await screen.findByText('Cached Pasta')).toBeInTheDocument()

    firstRender.unmount()
    render(<PlannerClient weekStart={weekStart} />)

    expect(screen.getByText('Cached Pasta')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(2)

    await act(async () => {
      resolveSecondFetch(response(weekData('Fresh Pasta')))
    })

    await waitFor(() => expect(screen.getByText('Fresh Pasta')).toBeInTheDocument())
  })

  it('shows a recipe CTA empty state when the week has no planned slots', async () => {
    global.fetch = vi.fn().mockResolvedValue(response(emptyWeekData()))

    render(<PlannerClient weekStart={new Date('2026-06-08T00:00:00.000Z')} />)

    expect(await screen.findByRole('heading', { name: /nothing planned for this week/i })).toBeInTheDocument()
    expect(screen.getByText(/pick a recipe you like/i)).toBeInTheDocument()
    expect(screen.queryByTestId('planner-grid')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: /browse recipes/i }))
    expect(mockPush).toHaveBeenCalledWith('/recipes')
  })

  it('keeps the planner grid when the week has a planned slot', async () => {
    global.fetch = vi.fn().mockResolvedValue(response(weekData('Planned Soup', '2026-06-15')))

    render(<PlannerClient weekStart={new Date('2026-06-15T00:00:00.000Z')} />)

    expect(await screen.findByText('Planned Soup')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /nothing planned for this week/i })).toBeNull()
  })

  it('places mobile planner actions in one row directly under the week picker', async () => {
    global.fetch = vi.fn().mockResolvedValue(response(weekData('Action Pasta', '2026-06-22')))

    render(<PlannerClient weekStart={new Date('2026-06-22T00:00:00.000Z')} />)

    expect(await screen.findByText('Action Pasta')).toBeInTheDocument()

    const weekPicker = screen.getByRole('navigation')
    const actions = screen.getByRole('region', { name: /planner actions/i })
    const generateButton = within(actions).getByRole('button', { name: /generate shopping list/i })

    expect(actions).toHaveClass('flex-row')
    expect(actions).toHaveClass('md:hidden')
    expect(actions).toContainElement(within(actions).getByRole('button', { name: /edit/i }))
    expect(actions).toContainElement(generateButton)
    expect(weekPicker.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(actions.compareDocumentPosition(screen.getByTestId('planner-grid')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps the desktop shopping list action below the planner grid', async () => {
    global.fetch = vi.fn().mockResolvedValue(response(weekData('Desktop Pasta', '2026-06-29')))

    render(<PlannerClient weekStart={new Date('2026-06-29T00:00:00.000Z')} />)

    expect(await screen.findByText('Desktop Pasta')).toBeInTheDocument()

    const shoppingActions = screen.getByRole('region', { name: /shopping list actions/i })
    expect(shoppingActions).toHaveClass('hidden')
    expect(shoppingActions).toHaveClass('md:flex')
    expect(shoppingActions).toContainElement(
      within(shoppingActions).getByRole('button', { name: /generate shopping list/i })
    )
    expect(screen.getByTestId('planner-grid').compareDocumentPosition(shoppingActions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders multiple meals planned on the same day', async () => {
    const data = weekData('First Meal', '2026-08-03')
    data.slots.push({
      id: 'slot-2',
      household_id: 'household-1',
      date: '2026-08-03',
      meal_type: 'lunch',
      recipe_id: 'recipe-2',
      servings_scale: 1,
      custom_label: null,
      span_days: 1,
      created_at: '2026-01-01T00:00:00.000Z',
      recipe: {
        id: 'recipe-2',
        title: 'Second Meal',
        image_url: null,
        cook_time_min: null,
        prep_time_min: null,
        servings: null,
      },
    })
    global.fetch = vi.fn().mockResolvedValue(response(data))

    render(<PlannerClient weekStart={new Date('2026-08-03T00:00:00.000Z')} />)

    expect(await screen.findByText('First Meal')).toBeInTheDocument()
    expect(screen.getByText('Second Meal')).toBeInTheDocument()
  })

  it('shows only Done in the mobile planner actions while editing', async () => {
    global.fetch = vi.fn().mockResolvedValue(response(weekData('Edit Pasta', '2026-07-06')))

    render(<PlannerClient weekStart={new Date('2026-07-06T00:00:00.000Z')} />)

    expect(await screen.findByText('Edit Pasta')).toBeInTheDocument()

    const actions = screen.getByRole('region', { name: /planner actions/i })
    expect(within(actions).getByRole('button', { name: /edit/i })).toBeInTheDocument()
    expect(within(actions).getByRole('button', { name: /generate shopping list/i })).toBeInTheDocument()

    await userEvent.click(within(actions).getByRole('button', { name: /edit/i }))

    expect(screen.getByText('Mobile edit')).toBeInTheDocument()
    expect(within(actions).getByRole('button', { name: /done/i })).toBeInTheDocument()
    expect(within(actions).queryByRole('button', { name: /generate shopping list/i })).toBeNull()
  })

  it('places a meal continuing from the previous week at the first column', async () => {
    const data = emptyWeekData('2026-06-08')
    data.slots = [{
      id: 'straddle',
      household_id: 'household-1',
      date: '2026-06-06', // Saturday before the week, 3 days → visible on 06-08 only
      meal_type: 'lunch',
      recipe_id: null,
      servings_scale: 1,
      custom_label: 'Leftovers',
      span_days: 3,
      created_at: '2026-01-01T00:00:00.000Z',
      recipe: null,
    }]
    global.fetch = vi.fn().mockResolvedValue(response(data))

    render(<PlannerClient weekStart={new Date(2026, 5, 8)} />)

    const card = await within(await screen.findByTestId('planner-grid')).findByText('Leftovers')
    expect(card).toHaveAttribute('data-day', '1')
    expect(card).toHaveAttribute('data-span', '1')
    expect(card).toHaveAttribute('data-continued', 'true')
  })

  it('adds a meal by date', async () => {
    const data = emptyWeekData('2026-06-08')
    data.slots = weekData('Something').slots.map((s) => ({ ...s, date: '2026-06-08' }))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(data))
      .mockResolvedValue({ ok: true, json: async () => ({ id: 'new' }) } as Response)
    global.fetch = fetchMock

    render(<PlannerClient weekStart={new Date(2026, 5, 8)} />)
    await userEvent.click(await screen.findByRole('button', { name: 'add on day 3' }))

    const post = fetchMock.mock.calls.find(([url, init]) => url === '/api/planner/slots' && (init as RequestInit)?.method === 'POST')
    expect(JSON.parse((post![1] as RequestInit).body as string)).toEqual({ date: '2026-06-10', custom_label: 'Leftovers' })
    await waitFor(() =>
      expect(mockCapture).toHaveBeenCalledWith(
        'meal_planned',
        expect.objectContaining({ source: 'planner', kind: 'custom' }),
      ),
    )
  })

  it('is a no-op when a continued meal is dropped on the column it is drawn in', async () => {
    const data = emptyWeekData('2026-06-08')
    data.slots = [{
      id: 'slot-1',
      household_id: 'household-1',
      date: '2026-06-06', // Saturday before the week, 3 days → visible on 06-08 only
      meal_type: 'lunch',
      recipe_id: null,
      servings_scale: 1,
      custom_label: 'Leftovers',
      span_days: 3,
      created_at: '2026-01-01T00:00:00.000Z',
      recipe: null,
    }]
    const fetchMock = vi.fn().mockResolvedValue(response(data))
    global.fetch = fetchMock

    render(<PlannerClient weekStart={new Date(2026, 5, 8)} />)
    const actions = await screen.findByRole('region', { name: /planner actions/i })
    await userEvent.click(within(actions).getByRole('button', { name: /edit/i }))

    await userEvent.click(screen.getByRole('button', { name: 'move slot-1 to day 1' }))

    expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/planner/slots/slot-1' && (init as RequestInit)?.method === 'PUT')).toBe(false)
  })

  it('sends a PUT with the new date when moving a normal meal to another day', async () => {
    const data = weekData('Something', '2026-06-08')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(data))
      .mockResolvedValue({ ok: true, json: async () => ({}) } as Response)
    global.fetch = fetchMock

    render(<PlannerClient weekStart={new Date(2026, 5, 8)} />)
    const actions = await screen.findByRole('region', { name: /planner actions/i })
    await userEvent.click(within(actions).getByRole('button', { name: /edit/i }))

    await userEvent.click(screen.getByRole('button', { name: 'move slot-1 to day 4' }))

    const put = fetchMock.mock.calls.find(([url, init]) => url === '/api/planner/slots/slot-1' && (init as RequestInit)?.method === 'PUT')
    expect(put).toBeDefined()
    expect(JSON.parse((put![1] as RequestInit).body as string)).toEqual({ date: '2026-06-11' })
  })

  it('rolls back an optimistic move when the server rejects it', async () => {
    const data = weekData('Something', '2026-06-08')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(data))
      .mockResolvedValue({ ok: false, json: async () => ({}) } as Response)
    global.fetch = fetchMock

    render(<PlannerClient weekStart={new Date(2026, 5, 8)} />)
    const actions = await screen.findByRole('region', { name: /planner actions/i })
    await userEvent.click(within(actions).getByRole('button', { name: /edit/i }))

    await userEvent.click(screen.getByRole('button', { name: 'move slot-1 to day 4' }))

    await waitFor(() => {
      expect(screen.getByTestId('planner-grid').querySelector('[data-id="slot-1"]')).toHaveAttribute('data-day', '1')
    })
  })

  it('rolls a resize back to the span before dragging when the server rejects it', async () => {
    const data = weekData('Something', '2026-06-08')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(data))
      .mockResolvedValue({ ok: false, json: async () => ({}) } as Response)
    global.fetch = fetchMock

    render(<PlannerClient weekStart={new Date(2026, 5, 8)} />)
    const grid = await screen.findByTestId('planner-grid')

    await userEvent.click(within(grid).getByRole('button', { name: 'drag slot-1 to 3 days' }))
    expect(grid.querySelector('[data-id="slot-1"]')).toHaveAttribute('data-span', '3')
    await userEvent.click(within(grid).getByRole('button', { name: 'release slot-1 at 3 days' }))

    await waitFor(() => {
      expect(grid.querySelector('[data-id="slot-1"]')).toHaveAttribute('data-span', '1')
    })
  })

  it('shows no "Generate shopping list" button when the only recipe meal is continued', async () => {
    const data = emptyWeekData('2026-06-08')
    data.slots = [{
      id: 'slot-1',
      household_id: 'household-1',
      date: '2026-06-06', // continues into this week
      meal_type: 'lunch',
      recipe_id: 'recipe-1',
      servings_scale: 1,
      custom_label: null,
      span_days: 3,
      created_at: '2026-01-01T00:00:00.000Z',
      recipe: {
        id: 'recipe-1',
        title: 'Stew',
        image_url: null,
        cook_time_min: null,
        prep_time_min: null,
        servings: null,
      },
    }]
    global.fetch = vi.fn().mockResolvedValue(response(data))

    render(<PlannerClient weekStart={new Date(2026, 5, 8)} />)
    await screen.findByTestId('planner-grid')

    expect(screen.queryByRole('button', { name: /generate shopping list/i })).toBeNull()
  })
})
