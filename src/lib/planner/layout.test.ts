import { describe, it, expect } from 'vitest'
import { compareInDay, buildEditDays, maxSpanForStart, packLanes, buildMobileAgenda } from './layout'
import type { PlacedSlot } from './placement'

function slot(
  p: Partial<PlacedSlot> & { id: string; day: number; span: number },
): PlacedSlot {
  return {
    id: p.id,
    household_id: 'hh',
    date: '2026-06-01',
    meal_type: 'lunch',
    recipe_id: p.recipe_id ?? null,
    custom_label: p.custom_label ?? null,
    servings_scale: 1,
    span_days: p.span_days ?? p.span + (p.hiddenBefore ?? 0),
    created_at: p.created_at ?? '2026-01-01T00:00:00.000Z',
    recipe: p.recipe ?? null,
    day: p.day,
    span: p.span,
    hiddenBefore: p.hiddenBefore ?? 0,
    continued: (p.hiddenBefore ?? 0) > 0,
  }
}

describe('compareInDay', () => {
  it('orders by start day, then longer span first', () => {
    const a = slot({ id: 'a', day: 3, span: 1 })
    const b = slot({ id: 'b', day: 2, span: 1 })
    const c = slot({ id: 'c', day: 2, span: 3 })
    const d = slot({ id: 'd', day: 2, span: 3 })
    const sorted = [a, b, c, d].sort(compareInDay).map((s) => s.id)
    expect(sorted).toEqual(['c', 'd', 'b', 'a'])
  })

  it('orders meals on the same day by creation time so new meals sort last', () => {
    // id order would put 'a-new' first; created_at must win.
    const older = slot({ id: 'z-old', day: 2, span: 1, created_at: '2026-01-01T00:00:00.000Z' })
    const newer = slot({ id: 'a-new', day: 2, span: 1, created_at: '2026-02-01T00:00:00.000Z' })
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
    const s1 = slot({ id: 's1', day: 2, span: 4 })
    const s2 = slot({ id: 's2', day: 2, span: 1 })
    const s3 = slot({ id: 's3', day: 4, span: 1 })
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
    const soup = slot({ id: 'soup', day: 2, span: 4 }) // Tue–Fri
    const kura = slot({ id: 'kura', day: 3, span: 2 }) // Wed–Thu
    const dessert = slot({ id: 'des', day: 4, span: 1 }) // Thu
    const mon = slot({ id: 'mon', day: 1, span: 1 }) // Mon, no overlap with soup
    const lanes = packLanes([soup, kura, dessert, mon])
    expect(lanes.get('soup')).toBe(0)
    expect(lanes.get('mon')).toBe(0) // Mon is free on lane 0 before soup starts
    expect(lanes.get('kura')).toBe(1)
    expect(lanes.get('des')).toBe(2)
  })

  it('stacks two single-day meals on the same day onto different lanes', () => {
    const a = slot({ id: 'a', day: 3, span: 1 })
    const b = slot({ id: 'b', day: 3, span: 1 })
    const lanes = packLanes([a, b])
    expect(new Set([lanes.get('a'), lanes.get('b')])).toEqual(new Set([0, 1]))
  })
})

describe('buildMobileAgenda', () => {
  it('repeats multi-day meals on each covered day with dayIndex/span', () => {
    const soup = slot({ id: 'soup', day: 2, span: 4 })
    const days = buildMobileAgenda([soup])
    expect(days[0].cards).toEqual([]) // Mon
    expect(days[1].cards[0]).toMatchObject({ dayIndex: 1, span: 4 }) // Tue
    expect(days[4].cards[0]).toMatchObject({ dayIndex: 4, span: 4 }) // Fri
    expect(days[5].cards).toEqual([]) // Sat
  })

  it('orders multiple meals within a day by compareInDay', () => {
    const soup = slot({ id: 'soup', day: 2, span: 4 }) // active Thu, started Tue
    const kura = slot({ id: 'kura', day: 3, span: 2 }) // active Thu, started Wed
    const dessert = slot({ id: 'des', day: 4, span: 1 }) // active Thu, started Thu
    const thu = buildMobileAgenda([dessert, kura, soup])[3]
    expect(thu.cards.map((c) => c.slot.id)).toEqual(['soup', 'kura', 'des'])
  })

  it('counts days of a continued meal from its real start', () => {
    // Started one day before this week, 3 days long → visible on days 1–2 as day 2/3 and 3/3.
    const soup = slot({ id: 'soup', day: 1, span: 2, hiddenBefore: 1 })
    const days = buildMobileAgenda([soup])
    expect(days[0].cards[0]).toMatchObject({ dayIndex: 2, span: 3 })
    expect(days[1].cards[0]).toMatchObject({ dayIndex: 3, span: 3 })
    expect(days[2].cards).toEqual([])
  })
})
