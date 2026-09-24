# Recipe filters: time, portions, ingredient, mobile search

## Goal

Extend the recipe list filter (currently tags only) with:

- total time range
- portions range
- ingredient substring search
- title search on mobile
- fix: on mobile the filter modal footer is covered by the bottom nav

## Decisions

- **Ingredient search runs on the server.** `ingredients` stays out of the list
  payload (`RECIPE_LIST_FIELDS`, trimmed in 984006d); list load speed matters
  more than ingredient-filter speed. No migration.
- **Ranges:** preset chips + a "Custom" chip revealing from–to inputs.
- **Missing values:** a recipe with no total time / no servings is hidden while
  the corresponding range is active.
- **Total time** = `prep_time_min + cook_time_min`, a missing part counts as 0;
  it is `null` only when both are missing.
- **Mobile search:** its own row under the header on the list page. The
  ingredient input lives in the filter modal only.
- **Default filter** stays tag-only (`profiles.default_recipe_filter` unchanged).
  The "search bypasses the untouched default" behaviour is unchanged.

## Units

### `src/lib/recipes/filters.ts` (pure)

- `type Range = { min: number | null; max: number | null }` — inclusive bounds,
  either side may be `null` (open).
- `type RecipeFilters = { tags: string[]; time: Range | null; servings: Range | null; ingredient: string }`
- `totalTime(recipe): number | null`
- `matchesRange(value: number | null, range: Range | null): boolean` — `range`
  `null` → `true`; `value` `null` with an active range → `false`.
- `TIME_PRESETS`: `≤15` {0,15}, `15–30` {16,30}, `30–60` {31,60}, `60+` {61,null}
- `SERVINGS_PRESETS`: `1–2` {1,2}, `3–4` {3,4}, `5+` {5,null}
- `presetFor(range, presets)` — the preset equal to `range`, or `undefined`.
- `normalizeText(s)` — lowercase, NFD, strip combining marks. Shared with the
  API route.
- `applyFilters(recipes, { filters, taxonomy, search, ingredientIds })` — tags
  via existing `filterRecipesByTags`, then time, servings, `ingredientIds`
  (`null` = no ingredient constraint), then title search.
- `activeFilterCount(filters)` — tags + 1 per active time / servings /
  ingredient (term of 2+ chars).

### `GET /api/recipes/ingredient-search?q=`

- `getCurrentUser()`; no user → 401.
- `q` trimmed, shorter than 2 chars → 400.
- Selects `id, ingredients` where `is_archived = false` (RLS scopes to household).
- Returns `{ ids: string[] }` for recipes where some
  `normalizeText(ingredient.name)` contains `normalizeText(q)`. Only `name` is
  matched — not unit or notes.

### `useIngredientSearch(term)` hook

- 300 ms debounce, `AbortController` cancels superseded requests.
- Term under 2 chars → `{ ids: null }`, no request.
- Returns `{ ids: Set<string> | null, loading: boolean, error: boolean }`.
- On error `ids` is `null` (ingredient constraint skipped) and `error` is true.

### `RangeFilter` component

- Props: `label`, `presets`, `value: Range | null`, `onChange`, `unit?`.
- Chips are single-select; tapping the active chip clears (`onChange(null)`).
- "Custom" chip reveals one row of two numeric inputs (`inputMode="numeric"`),
  pre-filled from the current value. Empty input = open bound. Both empty →
  `null`.
- A value equal to a preset highlights that chip; any other value highlights
  "Custom" and keeps the inputs visible.

### `RecipeFiltersModal` changes

- Section order: Ingredient input → Total time → Portions → tag groups.
- Ingredient input shows a short error line when the search fails.
- Result button shows the previous count dimmed while the search is loading.
- "Clear all" clears tags, ranges and ingredient; enabled when
  `activeFilterCount > 0`.
- Mobile overlap fix: overlay `z-50` → `z-[60]` (bottom nav in `AppShell` is
  `z-50`); footer bottom padding `max(1rem, env(safe-area-inset-bottom))`.

### `RecipeList` changes

- Holds `time`, `servings`, `ingredient` state next to the existing tag state.
- Filter badge uses `activeFilterCount`.
- Mobile-only (`sm:hidden`) search row under the header, bound to the same
  `search` state as the desktop input.

### i18n

New keys in `messages/en/recipes.json` and `messages/sk/recipes.json`:
section labels (Ingredient, Total time, Portions), ingredient placeholder,
ingredient error, "Custom", from/to placeholders, `min` unit.

## Testing

- `filters.test.ts`: `totalTime`, `matchesRange` (open bounds, null values),
  `presetFor`, `normalizeText` (diacritics), `applyFilters` combinations,
  `activeFilterCount`.
- `ingredient-search/route.test.ts`: 401, 400 on short `q`, name-only match,
  diacritics-insensitive match, archived excluded.
- `RangeFilter.test.tsx`: preset select/toggle off, custom inputs, open bounds,
  preset highlighted when custom equals it.
- `RecipeList.test.tsx`: combined filters, badge count, mobile search input.
- Manual: browser pane at 375 px — modal footer visible above nav, mobile search.

## Deployment

Branch `feat/recipe-filters` → merge into `staging` → test on
https://dapcook-staging.vercel.app → merge the same branch into `main`.
