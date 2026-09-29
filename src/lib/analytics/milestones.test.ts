import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trackMilestone } from './milestones'

describe('trackMilestone', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-29T10:00:00.000Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('captures the event with its props and a first-occurrence person property', () => {
    const capture = vi.fn()
    trackMilestone({ capture }, 'meal_planned', { source: 'recipe', kind: 'recipe' })
    expect(capture).toHaveBeenCalledWith('meal_planned', {
      source: 'recipe',
      kind: 'recipe',
      $set_once: { first_meal_planned_at: '2026-09-29T10:00:00.000Z' },
    })
  })

  it('works without props', () => {
    const capture = vi.fn()
    trackMilestone({ capture }, 'shopping_item_checked')
    expect(capture).toHaveBeenCalledWith('shopping_item_checked', {
      $set_once: { first_shopping_item_checked_at: '2026-09-29T10:00:00.000Z' },
    })
  })
})
