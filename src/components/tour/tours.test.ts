import { describe, expect, it } from 'vitest'
import { TOURS } from './tours'

// Controls that open or replace themselves when clicked: without advanceOnTargetClick the
// click would make the target vanish and the tour would dismiss and later restart.
const SELF_REPLACING_TARGETS = ['grid-add', 'edit-add', 'shopping-add', 'plan-button', 'planner-edit', 'planner-done', 'item-delete', 'generate-remove']

describe('TOURS', () => {
  it('advances on click for every step targeting a self-replacing control', () => {
    for (const [id, steps] of Object.entries(TOURS)) {
      for (const step of steps) {
        if (SELF_REPLACING_TARGETS.includes(step.target)) {
          expect(step.advanceOnTargetClick, `${id}:${step.target}`).toBe(true)
        }
      }
    }
  })

  it('points the shopping-list tour at Copy list first, then Add item', () => {
    expect(TOURS['shopping-list'].map((s) => s.target)).toEqual(['shopping-copy', 'shopping-add'])
    // Copying is the action the step suggests, so it moves the tour along.
    expect(TOURS['shopping-list'][0].advanceOnTargetClick).toBe(true)
  })
})
