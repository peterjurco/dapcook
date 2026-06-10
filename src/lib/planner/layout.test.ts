import { describe, it, expect } from 'vitest'
import { compareInDay, buildEditDays, maxSpanForStart, packLanes, buildMobileAgenda } from './layout'
import type { MealSlotWithRecipe } from '@/types/planner'

function slot(
  p: Partial<MealSlotWithRecipe> & { id: string; day_of_week: number; span_days: number },
): MealSlotWithRecipe {
  return {
    id: p.id,
    week_plan_id: 'w',
    day_of_week: p.day_of_week,
    meal_type: 'lunch',
    recipe_id: p.recipe_id ?? null,
    custom_label: p.custom_label ?? null,
    servings_scale: 1,
    span_days: p.span_days,
    created_at: p.created_at ?? '2026-01-01T00:00:00.000Z',
    recipe: p.recipe ?? null,
  }
}

describe('compareInDay', () => {
  it('orders by start day, then longer span first', () => {
    const a = slot({ id: 'a', day_of_week: 3, span_days: 1 })
    const b = slot({ id: 'b', day_of_week: 2, span_days: 1 })
    const c = slot({ id: 'c', day_of_week: 2, span_days: 3 })
    const d = slot({ id: 'd', day_of_week: 2, span_days: 3 })
    const sorted = [a, b, c, d].sort(compareInDay).map((s) => s.id)
    expect(sorted).toEqual(['c', 'd', 'b', 'a'])
  })

  it('orders meals on the same day by creation time so new meals sort last', () => {
    // id order would put 'a-new' first; created_at must win.
    const older = slot({ id: 'z-old', day_of_week: 2, span_days: 1, created_at: '2026-01-01T00:00:00.000Z' })
    const newer = slot({ id: 'a-new', day_of_week: 2, span_days: 1, created_at: '2026-02-01T00:00:00.000Z' })
    expect([newer, older].sort(compareInDay).map((s) => s.id)).toEqual(['z-old', 'a-new'])
  })
})

describe('maxSpanForStart', () => {
  it('clamps span to the remaining days in the week', () => {
    expect(maxSpanForStart(1)).toBe(7)
    expect(maxSpanForStart(5)).toBe(3)
    expect(maxSpanForStart(7)).toBe(1)
  })
})

describe('buildEditDays', () => {
  it('returns 7 days, each with meals starting that day, ordered', () => {
    const s1 = slot({ id: 's1', day_of_week: 2, span_days: 4 })
    const s2 = slot({ id: 's2', day_of_week: 2, span_days: 1 })
    const s3 = slot({ id: 's3', day_of_week: 4, span_days: 1 })
    const days = buildEditDays([s3, s2, s1])
    expect(days).toHaveLength(7)
    expect(days[1].dayOfWeek).toBe(2)
    expect(days[1].slots.map((s) => s.id)).toEqual(['s1', 's2']) // span 4 before span 1
    expect(days[3].slots.map((s) => s.id)).toEqual(['s3'])
    expect(days[0].slots).toEqual([])
  })
})

describe('packLanes', () => {
  it('puts non-overlapping meals on the same lane and overlaps on separate lanes', () => {
    const soup = slot({ id: 'soup', day_of_week: 2, span_days: 4 }) // Tue–Fri
    const kura = slot({ id: 'kura', day_of_week: 3, span_days: 2 }) // Wed–Thu
    const dessert = slot({ id: 'des', day_of_week: 4, span_days: 1 }) // Thu
    const mon = slot({ id: 'mon', day_of_week: 1, span_days: 1 }) // Mon, no overlap with soup
    const lanes = packLanes([soup, kura, dessert, mon])
    expect(lanes.get('soup')).toBe(0)
    expect(lanes.get('mon')).toBe(0) // Mon is free on lane 0 before soup starts
    expect(lanes.get('kura')).toBe(1)
    expect(lanes.get('des')).toBe(2)
  })

  it('stacks two single-day meals on the same day onto different lanes', () => {
    const a = slot({ id: 'a', day_of_week: 3, span_days: 1 })
    const b = slot({ id: 'b', day_of_week: 3, span_days: 1 })
    const lanes = packLanes([a, b])
    expect(new Set([lanes.get('a'), lanes.get('b')])).toEqual(new Set([0, 1]))
  })
})

describe('buildMobileAgenda', () => {
  it('repeats multi-day meals on each covered day with dayIndex/span', () => {
    const soup = slot({ id: 'soup', day_of_week: 2, span_days: 4 })
    const days = buildMobileAgenda([soup])
    expect(days[0].cards).toEqual([]) // Mon
    expect(days[1].cards[0]).toMatchObject({ dayIndex: 1, span: 4 }) // Tue
    expect(days[4].cards[0]).toMatchObject({ dayIndex: 4, span: 4 }) // Fri
    expect(days[5].cards).toEqual([]) // Sat
  })

  it('orders multiple meals within a day by compareInDay', () => {
    const soup = slot({ id: 'soup', day_of_week: 2, span_days: 4 }) // active Thu, started Tue
    const kura = slot({ id: 'kura', day_of_week: 3, span_days: 2 }) // active Thu, started Wed
    const dessert = slot({ id: 'des', day_of_week: 4, span_days: 1 }) // active Thu, started Thu
    const thu = buildMobileAgenda([dessert, kura, soup])[3]
    expect(thu.cards.map((c) => c.slot.id)).toEqual(['soup', 'kura', 'des'])
  })
})
