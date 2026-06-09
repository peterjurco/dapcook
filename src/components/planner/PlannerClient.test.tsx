import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlannerClient } from './PlannerClient'
import type { WeekData } from '@/types/planner'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture: vi.fn() }),
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
  MobileEditList: () => <div>Mobile edit</div>,
}))

vi.mock('./PlannerDesktopGrid', () => ({
  PlannerDesktopGrid: ({ slots }: { slots: WeekData['slots'] }) => (
    <div data-testid="planner-grid">
      {slots.map((s) => (
        <div key={s.id}>{s.recipe?.title ?? s.custom_label}</div>
      ))}
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

function weekData(recipeTitle: string): WeekData {
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
      week_plan_id: 'week-plan-1',
      day_of_week: 1,
      meal_type: 'lunch',
      recipe_id: 'recipe-1',
      servings_scale: 1,
      custom_label: null,
      span_days: 1,
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
    global.fetch = vi.fn().mockResolvedValue(response(weekData('Planned Soup')))

    render(<PlannerClient weekStart={new Date('2026-06-15T00:00:00.000Z')} />)

    expect(await screen.findByText('Planned Soup')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /nothing planned for this week/i })).toBeNull()
  })

  it('places mobile planner actions in one row directly under the week picker', async () => {
    global.fetch = vi.fn().mockResolvedValue(response(weekData('Action Pasta')))

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
    global.fetch = vi.fn().mockResolvedValue(response(weekData('Desktop Pasta')))

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
    const data = weekData('First Meal')
    data.slots.push({
      id: 'slot-2',
      week_plan_id: 'week-plan-1',
      day_of_week: 1,
      meal_type: 'lunch',
      recipe_id: 'recipe-2',
      servings_scale: 1,
      custom_label: null,
      span_days: 1,
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
    global.fetch = vi.fn().mockResolvedValue(response(weekData('Edit Pasta')))

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
})
