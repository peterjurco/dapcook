# Multi-meal Planner — Design Spec

**Date:** 2026-06-09
**Status:** Approved (brainstorming)

## Problem

The planner lets a household plan meals for a week. Today it assumes **one meal per
day**: meals are keyed by `day_of_week` in a single-slot map, a meal can stretch
across consecutive days via `span_days`, and overlapping meals are *prevented* by
cascade/displacement logic that pushes neighbours out of the way.

We want to plan **multiple meals per day**, category-agnostic (two lunches, a tracked
breakfast, side dishes, salads, spices, desserts…), while keeping the ability to
stretch a meal across multiple days. The hard part is that multi-day meals can now
**overlap intentionally** (e.g. a soup batch Tue–Fri alongside a main Wed–Thu), which
the current single-column mobile layout and the displacement logic cannot express.

### Mental model (drives the whole design)
- **View mode** — opened when about to cook or to check "what are we eating
  today/tomorrow." A consumption view.
- **Edit mode** — opened when planning the upcoming week. An arrangement view.

## Core decisions

### 1. Drop "one meal per day, non-overlapping"
A day holds any number of meals; multi-day meals may freely overlap. Remove:
- the `slotByDay: Map<dayOfWeek, slot>` single-slot assumption,
- `computeDisplacements` / cascade logic in `PlannerClient.tsx`,
- the "no empty day / Full" semantics.

### 2. Data model
A meal entry keeps its existing columns: `day_of_week` (start day, 1–7),
`span_days`, `recipe_id | custom_label`, `servings_scale`.
- **No `sort_index`** — within-day order is *derived*, not stored.
- `meal_type` becomes unused (left at its default; not surfaced in UI).
- **No schema migration required.**

### 3. Derived within-day order
Within a single day, render meals sorted by:
`start day ASC → span_days DESC → created_at ASC`.

Effect: ongoing meals (started earlier — i.e. leftovers) sort above meals that start
today; longer meals sort above shorter. This matches how desktop lane-packing stacks
bars, keeping desktop and mobile visually consistent. There is **no manual within-day
ordering UI**.

### 4. Responsive: one data model, two renderers
The same set of meal entries is projected two ways by breakpoint (the canonical
responsive-calendar pattern — cf. Google/Apple Calendar week grid vs mobile schedule).

#### Desktop — single always-editable calendar
- 7-column grid.
- Single-day meals stack vertically inside their day column.
- Multi-day meals render as **horizontal bars spanning columns**, with
  **lane-packing**: overlapping bars are assigned parallel lanes so they don't
  collide. (This lane assignment is the main new desktop logic.)
- **No edit mode** — always editable inline:
  - drag a bar/card to another day → changes start day,
  - drag a bar's right edge → resize `span_days`,
  - click an empty cell / "+" → add (opens the search component).
- View and Edit are the same screen on desktop.

#### Mobile — day-sections, two modes
- **View (default):** day-by-day agenda. A multi-day meal **repeats on every covered
  day** with a `day x/y` badge. Read-only; tapping a recipe card opens the recipe.
  Empty days show a quiet "Nothing planned" (no add affordance in View).
- **Edit (toggle):** same day-sections, but each meal appears **once, on its start
  day**, labelled with its range ("Tue → Fri · 4 days"). Per-meal controls:
  - `⠿` drag handle → move between days (sets new start day; overlaps allowed, no
    cascade),
  - `‹ ›` → decrease / increase `span_days` (resize only; does **not** move the meal),
  - `🗑` → delete.
  - **"+ Add meal"** under every day — any day can stack more meals.

### 5. Adding a meal inside the planner
Reuse the existing `RecipeSearch` component, anchored to the chosen day. It already
offers recipe search + preset "Quick labels" (Eating out, Leftovers, …).

**New:** add a *"Use '<typed text>' as a custom meal"* row so free-text items
("Side salad", "Rice", "Spices") can be tracked without a recipe. Free-text/custom and
preset-label meals can span multiple days like recipes. They contribute nothing to the
shopping list.

### 6. "Add to Plan" from the recipe page
Replace the "first empty day in next 3 weeks → else Full" logic
(`/api/planner/slots/next-empty`) with a **destination picker** popover:
- week selector (This week / Next week quick chips + `‹ ›` to page weeks),
- a day grid (Mon–Sun),
- defaults to **this week / today**, remembers the last week choice,
- on confirm, inserts the slot and shows a toast:
  *"Added to Tue 9 · this week — Change · View plan."*

The "Full" error state is removed.

### 7. Copy
Planner subtitle "Plan your lunches for the week" → "Plan your meals for the week."

## Components affected (initial map)
- `PlannerClient.tsx` — remove single-slot map + displacement; build per-day grouping;
  feed desktop lane-packing and mobile renderers.
- New: desktop lane-packing helper (pure function, unit-tested).
- `DaySlot.tsx` / `SlotCard.tsx` / `CustomLabelCard.tsx` — render within a day stack;
  bars span columns on desktop.
- `MobileEditList.tsx` — day-sectioned, multiple meals/day, per-day "+ Add meal",
  `⠿`/`‹ ›`/`🗑` controls; meals shown once at start day.
- Mobile **View** renderer — day-sectioned agenda with repeated multi-day cards + `day
  x/y` badges.
- `RecipeSearch.tsx` — add free-text custom-meal row.
- `AddToPlanButton.tsx` — destination picker popover + toast.
- API: deprecate/replace `slots/next-empty`; `slots` POST already takes
  `week_start` + `day_of_week`; `slots/[id]` PUT handles day/span changes.

## Out of scope / assumptions to verify
- Shopping list: `span_days` is one batch → a recipe counts **once** regardless of
  span; multiple meals/day each contribute. Verify current generation matches and
  isn't multiplied by span.
- `meal_type` repurposing (named categories) — explicitly not now.
- Week-plan rules panel — unchanged (currently hidden).

## Testing
- Unit-test the lane-packing function (overlaps, nesting, week-edge clamping).
- Unit-test the within-day ordering rule.
- Component tests: multiple meals per day render; multi-day repeats in mobile View
  with correct `day x/y`; edit shows each meal once at start day; `‹ ›` resizes without
  moving; drag move sets start day without displacing others.
- Add-to-Plan picker: default week/day, week paging, insert + toast.
