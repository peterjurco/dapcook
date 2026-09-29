# Product Tour & Activation Milestones — Design

## Goal

Nudge users through the core loop (recipe → plan → shopping list → shopping) with short,
contextual spotlight tours, and record the activation funnel in PostHog.

## Principles

- At most one tour active at a time.
- Every tour is skippable (Esc or "Skip tour") and shows once per user.
- The highlighted element stays clickable; clicking it counts as progress.
- A tour whose target cannot be found never traps the user behind an overlay.
- Mobile and desktop planner tours are separate, because they teach different gestures.

## 1. Tour engine

### Persistence

- Migration `023_tours_seen.sql`: `ALTER TABLE profiles ADD COLUMN tours_seen TEXT[] NOT NULL DEFAULT '{}'`.
- `PATCH /api/profile` accepts `tour_seen: string` (validated against the known tour ids) and
  appends it server-side only if absent (`array_append` guarded by `NOT (id = ANY(tours_seen))`),
  so the client never sends the whole array and concurrent tabs cannot overwrite each other.
- `src/types/database.ts` updated for the new column.
- A tour is marked seen when it is **completed or skipped**.

### Units (`src/components/tour/`)

- **`tours.ts`** — declarative definitions only:
  `{ id: TourId, steps: { target: string; titleKey: string; bodyKey: string; placement: 'top' | 'bottom' | 'left' | 'right' }[] }`.
  `target` matches a `data-tour="…"` attribute. Copy lives in a new namespace `messages/{en,sk}/tour.json`, registered in `src/i18n/request.ts`.
- **`TourProvider`** — context with `seen: Set<TourId>`, `active: { id, stepIndex } | null` and
  `start(id)`, `next()`, `back()`, `skip()`, `finish()`, `markSeen(id)`.
  - `start` is a no-op when the tour is seen or another tour is active.
  - `finish`/`skip` update `seen` optimistically and fire-and-forget the PATCH.
  - `markSeen(id)` lets feature code suppress a tour without showing it (used by tour 1).
  - Mounted in `(app)/layout.tsx` (around `AppShell`) and `(flow)/layout.tsx`, seeded with
    `profile.tours_seen`.
- **`useTour(id, condition)`** — the only API feature components call. When `condition` is true,
  it waits about 600 ms for layout and scroll to settle, then calls `start(id)`. It does not start
  while a modal or picker is open; callers fold that into `condition`.
- **`useTourStep(target)`** — returns `true` while the active step targets `target`. Components use it
  to force hover-only controls visible (resize handle, delete X).
- **`TourOverlay`** — rendered by the provider via a portal:
  - Resolves the target with `document.querySelector('[data-tour="…"]')`. It retries through
    `MutationObserver`/`requestAnimationFrame` for up to about 1 s; if the target is still missing,
    it advances to the next step, or finishes the tour on the last step.
  - Scrolls the target into view and tracks its rect on scroll (capture) and resize.
  - Spotlight: a fixed div at the target rect plus padding and a radius, with
    `box-shadow: 0 0 0 9999px rgb(0 0 0 / 0.5)`. The overlay layer is `pointer-events-none`,
    so the target remains interactive.
  - Tooltip card: title, body, step counter (`2 / 4`), Back, Next / Done, "Skip tour". It flips
    placement when it would overflow, and is clamped to the viewport with a 16 px gutter.
  - Esc = skip.
- **Target clicked:** a capture-phase click listener on the current target calls `next()`
  (or `finish()` on the last step). That is how clicking Plan or Edit completes a tour.

### Mobile vs. desktop

Both planner layouts are in the DOM (`md:hidden` / `hidden md:block`), so planner tours gate on
`matchMedia('(min-width: 768px)')` through a small `useIsDesktop()` hook.

## 2. Tours

Copy is shown in English; Slovak is added alongside it in `messages/sk/tour.json`.

### Tour 1 — `plan-recipe` (recipe detail, `/recipes/[id]`)

- **Trigger:** not seen.
- **Suppression:** any successful planning action (planner or `AddToPlanPicker`) calls
  `markSeen('plan-recipe')`. `meal_slots` has no `created_by`, so this flag is how "has
  this user ever planned" is expressed. It also covers users who joined an existing household.
- **Step 1:** target the `AddToPlanButton` toolbar variant (`plan-button`). Copy: "Plan this recipe" /
  "Add it to a day in your weekly plan." Button: "Got it".

### Tour 2 — `planner-mobile-view` (planner, below `md`, view mode)

- **Trigger:** mobile, not in edit mode, and the current week has at least one slot.
- **Step 1:** target the Edit button (`planner-edit`). Copy: "Edit your plan" / "Move meals, stretch them
  over several days or add your own items." Tapping Edit completes it.

### Tour 3 — `planner-mobile-edit` (planner, below `md`, edit mode)

- **Trigger:** mobile, `isMobileEditMode`, and at least one slot. It runs even if tour 2 was skipped.
- Step 1: the first slot's grip handle (`edit-grip`). Copy: "Drag to move" / "Hold and drag a meal to another day."
- Step 2: the first slot's shrink/extend buttons (`edit-span`). Copy: "Cooking in batches?" /
  "Stretch a meal over multiple days."
- Step 3: the first day's add button (`edit-add`). Copy: "Add anything" / "Search a recipe or type your
  own item, like 'rice' or 'eating out'."
- Step 4: the Done button (`planner-done`). Copy: "Tap Done when you're finished."

### Tour 4 — `planner-desktop` (planner, `md` and up)

- **Trigger:** desktop and at least one slot in the current week.
- Step 1: the first slot card (`grid-slot`). Copy: "Drag meals between days."
- Step 2: that card's resize handle (`grid-resize`), forced visible via `useTourStep`. Copy:
  "Drag the edge to stretch a meal over multiple days."
- Step 3: the add field in the first day's column (`grid-add`). Copy: "Add a recipe or your own item."

### Tour 5 — `shopping-generate` (`/shopping/generate`)

- **Trigger:** at least one recipe entry.
- Step 1: the name text of the first ingredient (`generate-item-name`). Copy: "Tap to change the name or quantity."
- Step 2: the first ingredient's X button (`generate-item-delete`), forced visible if hover-only.
  Copy: "Already have it at home? Remove it."
- Step 3: the first recipe's portions stepper (`generate-portions`). Copy: "Cooking for more people?" /
  "Change the portions and the quantities follow."
- Step 4: the first recipe's remove toggle (`generate-remove`). Copy: "Skip a whole recipe this time."
- `ShoppingItemRow` gets an optional `tourTarget` prop so that only the first row carries `data-tour`
  attributes. The component is shared with the shopping list.

### Tour 6 — `shopping-list` (`/shopping`)

- **Trigger:** the list has at least one item.
- Step 1: the new "+ Add item" row (`shopping-add`). Copy: "Take this list to the store" / "Tick items off as
  they go into the cart. Add anything else here."

### New UI: "+ Add item" row

A visible row at the bottom of the shopping list. Clicking it creates a blank item in edit mode,
reusing `ShoppingItemRow`'s existing Enter-saves-and-creates-next flow. It is not tracked in PostHog.

## 3. Activation milestones (PostHog)

Helper `src/lib/analytics/milestones.ts`:
`trackMilestone(posthog, event, props?)` → `posthog.capture(event, { ...props, $set_once: { [`first_${event}_at`]: new Date().toISOString() } })`.

| Event | Where | Props |
|---|---|---|
| `recipe_created` | `RecipeForm` on create (the import page also renders `RecipeForm`) | `source: 'manual' \| 'import'` (import when a `draft` is passed) |
| `meal_planned` | `PlannerClient` (recipe and custom adds) and `AddToPlanPicker` (new) | `source: 'planner' \| 'recipe'`, `kind: 'recipe' \| 'custom'` |
| `shopping_list_generated` | `GenerateShoppingPage` after a successful add | `item_count`, `recipe_count`, `removed_recipe_count` |
| `shopping_item_checked` | `ShoppingClient`, on check only (not uncheck, not the generate page) | — |

Custom items count as planned. Tour telemetry is not recorded; `profiles.tours_seen` can be
queried if completion rates are ever needed.

## Testing

- `TourProvider`: start is a no-op when seen or when another tour is active; next/back/finish; skip
  persists via PATCH; `markSeen` suppresses without showing.
- `TourOverlay`: renders the tooltip for the present target; skips a missing target after the timeout;
  Esc skips; clicking the target advances.
- `useTour`: starts only when the condition is true, after the delay.
- `/api/profile`: accepts a valid `tour_seen`, rejects unknown ids, and appends idempotently.
- `trackMilestone`: passes props and `$set_once` (mocked PostHog).
- Feature components: `data-tour` attributes are present on the right elements; `meal_planned` fires
  from `AddToPlanPicker` and calls `markSeen('plan-recipe')`; `shopping_item_checked` fires only on check;
  the "+ Add item" row creates an editable item.
- Existing tests that render the feature components get a `TourProvider` or a mocked `useTour`.

## Out of scope

- A highlight on the Generate shopping list CTA.
- A "Show tips again" setting.
- Multi-page tours and tour telemetry events.
