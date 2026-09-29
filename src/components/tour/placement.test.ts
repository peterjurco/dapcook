import { describe, expect, it } from 'vitest'
import { placeCard, GAP, GUTTER } from './placement'

const viewport = { width: 1000, height: 800 }
const card = { width: 288, height: 150 }

describe('placeCard', () => {
  it('places below and centred on the spotlight', () => {
    const spot = { top: 100, left: 400, width: 200, height: 40 }
    expect(placeCard(spot, 'bottom', viewport, card)).toEqual({ top: 140 + GAP, left: 500 - 144 })
  })

  it('flips to top when there is no room below', () => {
    const spot = { top: 700, left: 400, width: 200, height: 40 }
    expect(placeCard(spot, 'bottom', viewport, card).top).toBe(700 - GAP - 150)
  })

  it('flips to bottom when there is no room above', () => {
    const spot = { top: 20, left: 400, width: 200, height: 40 }
    expect(placeCard(spot, 'top', viewport, card).top).toBe(60 + GAP)
  })

  it('falls back from right to left, then to bottom', () => {
    const nearRight = { top: 300, left: 800, width: 150, height: 100 }
    expect(placeCard(nearRight, 'right', viewport, card).left).toBe(800 - GAP - 288)

    const phone = { width: 375, height: 800 }
    const wide = { top: 300, left: 16, width: 343, height: 60 }
    expect(placeCard(wide, 'right', phone, card).top).toBe(360 + GAP)
  })

  it('clamps inside the viewport gutter', () => {
    const spot = { top: 100, left: 0, width: 40, height: 40 }
    expect(placeCard(spot, 'bottom', viewport, card).left).toBe(GUTTER)
  })
})
