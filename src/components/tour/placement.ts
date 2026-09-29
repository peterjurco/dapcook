import type { Placement } from './tours'

export const GAP = 12
export const GUTTER = 16

export interface Box { top: number; left: number; width: number; height: number }
interface Size { width: number; height: number }

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max))

/** Tooltip position next to the spotlight: preferred side, flipped when it would overflow. */
export function placeCard(spot: Box, placement: Placement, viewport: Size, card: Size): { top: number; left: number } {
  const fitsBelow = spot.top + spot.height + GAP + card.height <= viewport.height - GUTTER
  const fitsAbove = spot.top - GAP - card.height >= GUTTER
  const fitsRight = spot.left + spot.width + GAP + card.width <= viewport.width - GUTTER
  const fitsLeft = spot.left - GAP - card.width >= GUTTER

  let side = placement
  if (side === 'right' && !fitsRight) side = fitsLeft ? 'left' : 'bottom'
  if (side === 'left' && !fitsLeft) side = fitsRight ? 'right' : 'bottom'
  if (side === 'bottom' && !fitsBelow && fitsAbove) side = 'top'
  if (side === 'top' && !fitsAbove && fitsBelow) side = 'bottom'

  const centreLeft = spot.left + spot.width / 2 - card.width / 2
  const centreTop = spot.top + spot.height / 2 - card.height / 2
  const pos =
    side === 'bottom' ? { top: spot.top + spot.height + GAP, left: centreLeft }
    : side === 'top' ? { top: spot.top - GAP - card.height, left: centreLeft }
    : side === 'right' ? { top: centreTop, left: spot.left + spot.width + GAP }
    : { top: centreTop, left: spot.left - GAP - card.width }

  return {
    top: clamp(pos.top, GUTTER, viewport.height - GUTTER - card.height),
    left: clamp(pos.left, GUTTER, viewport.width - GUTTER - card.width),
  }
}
