import type { TourId } from '@/lib/tours/ids'

export type Placement = 'top' | 'bottom' | 'left' | 'right'

export interface TourStep {
  /** Matches a `data-tour="…"` attribute; the first visible match is highlighted. */
  target: string
  /** Message key under the `tour` namespace; `.title` and `.body` are read. */
  key: string
  placement: Placement
  /** Clicking the highlighted element itself advances (or finishes) the tour. */
  advanceOnTargetClick?: boolean
}

export const TOURS: Record<TourId, TourStep[]> = {
  'plan-recipe': [
    { target: 'plan-button', key: 'planRecipe.planButton', placement: 'bottom', advanceOnTargetClick: true },
  ],
  'planner-mobile-view': [
    { target: 'planner-edit', key: 'plannerMobileView.edit', placement: 'bottom', advanceOnTargetClick: true },
  ],
  'planner-mobile-edit': [
    { target: 'edit-grip', key: 'plannerMobileEdit.grip', placement: 'bottom' },
    { target: 'edit-span', key: 'plannerMobileEdit.span', placement: 'bottom' },
    { target: 'edit-add', key: 'plannerMobileEdit.add', placement: 'top' },
    { target: 'planner-done', key: 'plannerMobileEdit.done', placement: 'bottom', advanceOnTargetClick: true },
  ],
  'planner-desktop': [
    { target: 'grid-slot', key: 'plannerDesktop.slot', placement: 'right' },
    { target: 'grid-resize', key: 'plannerDesktop.resize', placement: 'right' },
    { target: 'grid-add', key: 'plannerDesktop.add', placement: 'right' },
  ],
  'shopping-generate': [
    { target: 'item-name', key: 'shoppingGenerate.itemName', placement: 'bottom' },
    { target: 'item-delete', key: 'shoppingGenerate.itemDelete', placement: 'left' },
    { target: 'generate-portions', key: 'shoppingGenerate.portions', placement: 'top' },
    { target: 'generate-remove', key: 'shoppingGenerate.remove', placement: 'bottom' },
  ],
  'shopping-list': [
    { target: 'shopping-add', key: 'shoppingList.add', placement: 'top' },
  ],
}
