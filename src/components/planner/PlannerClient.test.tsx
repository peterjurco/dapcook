import { act, render, screen, waitFor } from '@testing-library/react'
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

vi.mock('./DayHeader', () => ({
  DayHeader: ({ weekday, day }: { weekday: string; day: string }) => <div>{weekday} {day}</div>,
}))

vi.mock('./DaySlot', () => ({
  DaySlot: ({ dayOfWeek, slot }: { dayOfWeek: number; slot: WeekData['slots'][number] | null }) => (
    <div data-testid={`day-${dayOfWeek}`}>{slot?.recipe?.title ?? slot?.custom_label ?? 'Empty'}</div>
  ),
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
  arrayMove: <T,>(items: T[], from: number, to: number) => {
    const next = [...items]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    return next
  },
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
    expect(screen.queryByTestId('day-1')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: /browse recipes/i }))
    expect(mockPush).toHaveBeenCalledWith('/recipes')
  })

  it('keeps the planner grid when the week has a planned slot', async () => {
    global.fetch = vi.fn().mockResolvedValue(response(weekData('Planned Soup')))

    render(<PlannerClient weekStart={new Date('2026-06-15T00:00:00.000Z')} />)

    expect(await screen.findByText('Planned Soup')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /nothing planned for this week/i })).toBeNull()
  })

  it('places planner actions directly under the week picker for planned weeks', async () => {
    global.fetch = vi.fn().mockResolvedValue(response(weekData('Action Pasta')))

    render(<PlannerClient weekStart={new Date('2026-06-22T00:00:00.000Z')} />)

    expect(await screen.findByText('Action Pasta')).toBeInTheDocument()

    const weekPicker = screen.getByRole('navigation')
    const actions = screen.getByRole('region', { name: /planner actions/i })
    const generateButton = screen.getByRole('button', { name: /generate shopping list/i })

    expect(actions).toContainElement(screen.getByRole('button', { name: /edit/i }))
    expect(actions).toContainElement(generateButton)
    expect(weekPicker.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(actions.compareDocumentPosition(screen.getByTestId('day-1')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
