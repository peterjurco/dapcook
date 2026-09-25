# Single-step shopping list generation

## Goal

Merge the portions step (`/shopping/generate`) and the review step (`/shopping/review`)
into one page: one box per planned recipe with its ingredients (editable as in the
current review) and an adjustable portion count.

## Current flow (being replaced)

1. `/shopping/generate` — `GenerateShoppingPage` lists unique recipes / custom meals
   with a portions input.
2. `POST /api/shopping/preview` — scales ingredients server-side, runs
   `makeShoppingListSmart` (AI merge across recipes, shopping rules, categories),
   returns items. Client stores them in `sessionStorage.shopping_preview`.
3. `/shopping/review` — `ShoppingReviewClient` shows the merged, categorized list;
   items can be checked (excluded), edited, deleted.
4. `POST /api/shopping/items/append` — appends the unchecked items to the list.

## New flow

`/shopping/generate` is the only step. Pressing "Add to list" sends the final
per-recipe items to a new route that runs the AI merge/categorization and appends
the result in one request, then navigates to `/shopping`. The user does not see
the merged list before it lands; it can be edited on the main list.

## UI

- **Recipe box**
  - Header: recipe title, days it is planned on, X / undo to exclude the whole
    recipe (same behaviour as today; excluded box is dimmed, ingredients hidden).
  - Ingredient list rendered with the existing `ShoppingItemRow`: check (= exclude,
    "I already have it"), inline edit, delete — same as the current review.
    Ingredients keep the recipe's order.
  - Footer of the box: portions input, plus the existing "no servings" warning when
    `recipe.servings` is null.
  - Recipe with no ingredients: shows a short "no ingredients" note; contributes
    nothing.
- **Custom meal box** (typed label like "rice", preset labels still excluded):
  title, days, portions, X / undo. No ingredient list.
- Boxes are always expanded.
- Sticky footer button "Add N items to list", where N = unchecked, non-deleted
  ingredients of non-excluded recipes + non-excluded custom meals. Disabled when
  N = 0 or while submitting.
- Empty plan state stays as today.

## Portion scaling (decision: edits rescale too)

Each ingredient holds `quantityPerPortion` (null when the ingredient has no
quantity). Displayed quantity = `quantityPerPortion × portions`, rounded as
`scaleIngredients` does today (3 decimals).

- Initial: `quantityPerPortion = ingredient.quantity / (recipe.servings ?? 1)`
  (matches `scaleIngredients`; a null `servings` means portions is the multiplier).
- Editing an ingredient sets `quantityPerPortion = editedQuantity / currentPortions`
  (null if the edit has no quantity); name and unit are stored as edited.
- `ShoppingItemRow` saves edits as free text (`{ name: "150g rice", quantity: null,
  unit: null }`), so the edit text is parsed back: a leading number (`150`, `1.5`,
  `1,5`) becomes the quantity; if the text right after it is the ingredient's
  current unit it stays the unit; the rest is the name. Text without a leading
  number leaves the ingredient with no quantity (it no longer scales).
- Changing portions recomputes every displayed quantity from `quantityPerPortion`,
  so edited ingredients scale proportionally and repeated changes (4→5→4) do not
  drift.
- Checked and deleted ingredients stay checked / deleted across portion changes.
- Invalid portions input (empty, < 1) keeps the last valid value, as today.

## Code structure

- `src/app/(flow)/shopping/generate/page.tsx` — also select `ingredients` on the
  recipe join.
- `src/lib/shopping/plan-entries.ts` (new, pure):
  - build entries from meal slots (grouping logic moved out of
    `GenerateShoppingPage`: one entry per unique recipe, one per unique typed
    custom label, days collected);
  - create ingredient state with `quantityPerPortion`;
  - `displayQuantity(item, portions)`;
  - apply an edit at given portions;
  - collect submit payload from entries.
- `src/components/shopping/GenerateShoppingPage.tsx` — state + page layout, uses
  `plan-entries` and a new `ShoppingPlanBox` component.
- `src/components/shopping/ShoppingPlanBox.tsx` (new) — renders one box (recipe or
  custom).
- `recipe_portions` localStorage persistence is kept (planner reads it).

## API

`POST /api/shopping/items/add-from-plan` (new)

- Body: `{ ingredients: { name, quantity, unit, recipe_id }[], customItems: { name, portions }[] }`.
- Auth + household check as in the existing routes. 400 when both arrays are empty
  after filtering out blank names.
- `recipe_id` fills `source_recipe_ids` on the items passed to the AI (as `preview`
  does today); inserted items keep `source_recipe_ids: []` as `/items/append` does.
- Ingredients go through `makeShoppingListSmart` with the household's categories
  and rules; AI-invented categories are saved (same as `preview` today). Custom
  items are appended verbatim (quantity = portions, no unit, no category).
- Appends to the household's latest shopping list (creating one if missing),
  after the current max `sort_order`, sorted by category order so items arrive
  grouped — logic moved from `/items/append` and `ShoppingReviewClient`.
- Responses: `200 { count }`; `500` on AI or insert failure.

## Removed

- `src/app/api/shopping/preview/route.ts`
- `src/app/api/shopping/items/append/route.ts` (only caller was the review page)
- `src/app/(flow)/shopping/review/page.tsx`
- `src/components/shopping/ShoppingReviewClient.tsx` and its test
- `sessionStorage.shopping_preview` handoff
- Unused `review.*` translation keys; stale `/shopping/review` comment in
  `src/app/(flow)/layout.test.tsx`

## Error handling

- AI or network failure: error message in the sticky footer, page state untouched,
  user can retry.

## Testing

- `plan-entries` unit tests: grouping (recipes, custom labels, preset labels
  skipped, days), initial scaling incl. null servings / null quantity, edit then
  rescale, 4→5→4 without drift, payload excludes checked / deleted / excluded
  entries.
- `add-from-plan` route test with the AI mocked: merge + append, custom items
  verbatim, new categories saved, 400 on empty, 500 on AI failure.
- `GenerateShoppingPage` tests: portions change rescales quantities, edited item
  rescales, checked item excluded from submit, excluded recipe not sent, error
  shown on failure.
