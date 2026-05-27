# Shopping List Redesign

**Date:** 2026-05-27

## Goal

Replace the date-range-driven shopping list with a persistent household list. Move list generation into a guided modal flow on the planner page, with a temporary review step before items are appended to the main list. Move AI rules to Settings.

---

## Database Changes

### `shopping_lists`
- Make `date_from` and `date_to` **nullable** (persistent lists have no date range)
- All existing rows are unaffected; nullable allows coexistence

### Household creation
- When a new household is created, an empty `shopping_list` row is inserted for it automatically (no items, no dates)
- Find where household creation happens and add this insert there

---

## Route Structure

```
app/
  (app)/                      ← existing, uses AppShell with bottom nav
    shopping/page.tsx          ← simplified persistent list
    planner/page.tsx           ← adds generate modal
    settings/page.tsx          ← adds shopping rules section
  (flow)/                     ← new route group, minimal layout (auth only, no nav)
    shopping/
      review/page.tsx          ← temporary review step
    layout.tsx
```

The `(flow)` layout: auth check (redirect to `/login` if not authenticated), no AppShell, no bottom nav. Just renders `{children}`.

---

## 1. Shopping Page (`/shopping`)

### What's removed
- Date range pickers
- Generate button
- AI rules section
- Overwrite confirmation modal

### What stays / changes
- Page title "Shopping list" + Copy button
- Categorised item list with check/uncheck, edit, delete
- Inline "Add item" row
- Empty state: *"Your shopping list is empty. Add items manually or generate from the planner."*
- No more `ShoppingList.date_from` / `date_to` displayed anywhere

### Data
- Always fetches the single household shopping list (same as now — latest list)
- Since every household has a list from creation, no empty-list-creation logic needed here

---

## 2. Planner Page — Generate Modal

### Trigger
The existing "Generate shopping list" button opens `GenerateShoppingModal` instead of navigating/calling the API directly.

### Modal: `GenerateShoppingModal`

**Data shown:** All meal slots in the currently viewed week that have a `recipe_id` (skip custom labels). Group by recipe (a recipe that spans multiple days or appears multiple times shows once with day info in a subtitle).

**Each row:**
- Recipe title
- Subtitle: days it appears (e.g. "Monday, Wednesday")
- Portions input (number, min 1) — pre-filled with `recipe.servings` if defined, else `1`
- Warning badge if `recipe.servings` is null: *"No servings defined — using 1"*
- Remove (×) button — removes the row from the list (excluded from generation)

**Footer:**
- Cancel button
- **Generate** button — disabled if no recipes remain

### On "Generate" click
1. Call `POST /api/shopping/preview` with `[{ recipe_id, portions }]`
2. Show loading state in modal
3. On success: store result in `sessionStorage` under key `shopping_preview`, navigate to `/shopping/review`
4. On error: show inline error in modal

---

## 3. Review Page (`/shopping/review`)

### Layout
`(flow)` layout — no bottom nav. Header bar with back arrow ("← Planner") and title "Review shopping list".

### Behaviour
- On mount: read `shopping_preview` from `sessionStorage`
- If empty (user navigated directly or session expired): show empty state — *"Nothing to review. Go back to the planner and generate a list."* with a link to `/planner`
- Items shown in same categorised layout as the shopping page
- User can delete individual items (client-side only, no API — these are not yet persisted)
- User can edit item name / quantity / unit inline (client-side only)

### Footer
- **"Add to shopping list"** button
  - Calls `POST /api/shopping/items/append` with the current (possibly edited) item list
  - On success: clears `sessionStorage` key, navigates to `/shopping`
  - Shows loading state while in flight

---

## 4. Settings Page — Shopping Rules

Add a **"Shopping rules"** section to the existing settings page (below Shopping categories, above Members).

UI is identical to the current rules UI on the shopping page:
- List of existing rules as removable chips
- "Add rule" inline input
- Rules stored in `shopping_rules` table (no schema change)

Remove the rules section from the shopping page entirely.

---

## New API Routes

### `POST /api/shopping/preview`

**Input:**
```ts
{ recipes: Array<{ recipe_id: string; portions: number }> }
```

**Logic:**
1. Fetch recipes with ingredients for all given `recipe_id`s
2. Scale each ingredient: `quantity * (portions / recipe.servings)` — if `recipe.servings` is null, treat as 1 (so scale = `portions`)
3. Flatten all ingredients into a raw item list (same format as current generate route)
4. Run make-smarter AI pass (categorise + merge duplicates) — reuse existing `makeShoppingListSmart` logic but without persisting
5. Return processed items + categories

**Output:**
```ts
{
  items: Array<{ name: string; quantity: number | null; unit: string | null; category: string | null }>;
  categories: Array<{ name: string; color: string | null }>;
}
```

**Nothing is saved to the database.**

---

### `POST /api/shopping/items/append`

**Input:**
```ts
{ items: Array<{ name: string; quantity: number | null; unit: string | null; category: string | null }> }
```

**Logic:**
1. Find the household's current shopping list (create one if somehow missing)
2. Insert all items with incrementing `sort_order` (appended after existing items)
3. No deduplication

**Output:** `{ count: number }` — number of items added

---

## Deprecated / Removed

- `POST /api/shopping/generate` — no longer called from UI (keep the file, do not delete yet)
- `POST /api/shopping/make-smarter` — still used internally by `/api/shopping/preview`; no longer called directly from UI
- Generate controls in `ShoppingClient`
- Rules UI in `ShoppingClient`

---

## SessionStorage Schema

Key: `shopping_preview`

```ts
{
  items: Array<{ name: string; quantity: number | null; unit: string | null; category: string | null }>;
  categories: Array<{ name: string; color: string | null }>;
}
```

Cleared after successful append or on new generation (overwritten).

---

## Implementation Order

1. DB migration — make `date_from` / `date_to` nullable; find household creation and add empty list insert
2. `POST /api/shopping/preview` — new endpoint
3. `POST /api/shopping/items/append` — new endpoint
4. Simplify `ShoppingClient` — remove generate controls and rules
5. `(flow)` route group + minimal layout
6. `ShoppingReviewClient` + `/shopping/review` page
7. `GenerateShoppingModal` component
8. Wire modal into `PlannerClient`
9. Add shopping rules section to Settings page
