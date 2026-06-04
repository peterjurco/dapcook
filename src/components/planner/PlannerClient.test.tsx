import { act, render, screen, waitFor } from '@testing-library/react'
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
})
