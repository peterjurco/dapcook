# Reorder recipe steps by dragging the step number

## Goal

In the recipe form, the user can reorder method steps by dragging the numbered circle next to each step.

## Scope

Only `src/components/recipe/StepEditor.tsx` (plus i18n keys and a new test file). No API, DB or `RecipeForm` changes — `RecipeForm` already derives `order` from array index on save.

Out of scope: up/down buttons, reordering in the read-only `RecipeView`.

## Design

- Add a `SortableStepRow` inside `StepEditor.tsx`, mirroring `SortableIngredientRow` in `IngredientEditor.tsx`.
- Wrap the step list in `DndContext` (`closestCenter`) + `SortableContext` (`verticalListSortingStrategy`), keyed by `step.id`.
- **Handle:** the number circle gets the sortable `attributes` and `listeners`, `cursor-grab active:cursor-grabbing touch-none`, and a hover state. The textarea is not a drag source.
- **Sensors:**
  - `PointerSensor` with `activationConstraint: { distance: 8 }` (same as `ShoppingClient`, `TagOrganizer`, `ShoppingCategoriesEditor`).
  - `KeyboardSensor` with `sortableKeyboardCoordinates` (focus the number, Space, arrow keys).
- **Drag visuals:** the dragged row gets `opacity: 0.4` and the dnd-kit transform/transition. The number shows `index + 1`, so the numbers update on drop.
- **Drop:** `arrayMove(steps, oldIndex, newIndex)`, then set `order: i + 1` again, the same way `remove()` does. Nothing happens if `over` is null or `active.id === over.id`.
- **Accessibility:** the handle gets `aria-label={t('stepEditor.dragAria', { n })}`. Add `recipes.stepEditor.dragAria` to every messages locale.

## Testing

New `src/components/recipe/StepEditor.test.tsx`. Mock `@dnd-kit` and capture `onDragEnd`, as `IngredientEditor.test.tsx` does. Cover:

- Moving the first step to last: `onChange` gets the reordered steps with `order` set to 1..n.
- Moving the last step to first: the same.
- `over: null` → `onChange` is not called.
- `active.id === over.id` → `onChange` is not called.
- The handle renders with its aria-label for each step.
