# Household week start day — design

## Goal

Let a household choose which day its week starts on: **Monday** (default), **Saturday** or
**Sunday**. It is a household setting, editable in Settings and chosen in onboarding.

## Principles

- **Historical data is never rewritten.** A meal planned on a date stays on that date, with the
  same span, regardless of later setting changes.
- The week is a *view*. Meals are stored against absolute dates; the start day only decides how
  dates are grouped into weeks on screen.

## Data model — migration `022_week_start.sql`

### `households`

- `week_start_day TEXT NOT NULL DEFAULT 'monday' CHECK (week_start_day IN ('monday', 'saturday', 'sunday'))`
- `onboarding_step` CHECK gains `'week_start'`:
  `('translation', 'units', 'week_start', 'tags', 'shopping_categories', 'invite')`.

### `meal_slots`

Today a slot belongs to a `week_plans` row and stores `day_of_week` (1–7), which is really the
position from `week_plans.week_start`. It becomes date-based:

1. Add `household_id UUID REFERENCES households(id) ON DELETE CASCADE` and `date DATE`.
2. Backfill from the owning week plan: `household_id = week_plans.household_id`,
   `date = week_plans.week_start + (day_of_week - 1)`. This only makes each meal's existing date
   explicit.
3. Set both `NOT NULL`; add `idx_meal_slots_household_date ON meal_slots(household_id, date)`.
4. Replace the `household_access` RLS policy with
   `USING (household_id = public.user_household_id()) WITH CHECK (household_id = public.user_household_id())`.
5. Drop `idx_meal_slots_week_plan`, then columns `week_plan_id` and `day_of_week`.

`span_days`, `created_at` and the rest are unchanged.

### `week_plans`

Unchanged schema. It remains the anchor for the per-week `week_plan_rules` snapshot. It is
created (with the snapshot of active general rules) the first time a week is opened, as today.
After a start-day change, a newly aligned week gets its own fresh snapshot; old weeks' rules stay
attached to their old `week_start` dates and are no longer shown. Rules are planning hints, not
meal history, so this is acceptable.

`src/types/database.ts` is updated to match.

## Week utilities — `src/lib/utils/week.ts`

- `export type WeekStartDay = 'monday' | 'saturday' | 'sunday'`.
- `getWeekStart(date, startDay)` and `parseWeekParam(param, startDay)` take the start day as a
  **required** argument, so every call site is found by the compiler.
- `isCurrentWeek(weekStart)` / `isNextWeek(weekStart)` become "today (or today + 7) falls within
  `[weekStart, weekStart + 6]`" and need no start day.
- `dayOfWeekNumber` is replaced by `dayIndexInWeek(date, weekStart)` → 1–7.
- An old Monday-anchored `?week=` URL, or a week saved in the picker's `localStorage`, normalizes
  to the week that contains it under the household's start day.

## Server & API

- **Helper:** `getHouseholdWeekStartDay()` beside `getCurrentHouseholdId` in
  `src/lib/auth/household.ts`, used by pages and routes. Falls back to `'monday'`.
- **`GET /api/planner/week?week=`** — resolves the week with the household's start day,
  gets-or-creates the week plan and its rules snapshot (unchanged), and returns slots **overlapping**
  the week: query `date BETWEEN weekStart - 6 AND weekEnd`, then keep those with
  `date + span_days - 1 >= weekStart`.
- **`POST /api/planner/slots`** — body `{ date, span_days?, recipe_id | custom_label }`. No longer
  creates a week plan. Validates `date` format and that the meal does not run past the end of the
  week containing `date` (under the household's start day).
- **`PUT /api/planner/slots/[id]`** — accepts `date` instead of `day_of_week`. When `date` or
  `span_days` changes, the resulting meal must end within the week it starts in. A legacy
  straddling meal can therefore be shortened or moved but never made to straddle again.
- **Shopping generation** (`src/app/api/shopping/generate/route.ts`) — select slots by
  `household_id` and `date BETWEEN date_from AND date_to`; the week-plan lookup and map go away.
  As today, a meal counts by its start date.
- **`src/app/(flow)/shopping/generate/page.tsx`** — resolves the week with the household's start
  day and selects slots by that week's date range.
- **`src/app/(app)/planner/page.tsx`** default week — the week (under the household's start day)
  containing the latest slot with `date >= current week start`, else the current week.
- **`PATCH /api/household`** — accepts `week_start_day`, validated against the three values.

## Client

### Placement layer

New `src/lib/planner/placement.ts` with a pure `placeInWeek(slots, weekStart)` returning, per
slot, the slot plus:

- `startDay` — 1–7 position in the visible week (clamped to 1 for a continuation),
- `span` — days visible in this week (clipped at both edges),
- `continued` — `true` when the meal started in the previous week.

`src/lib/planner/layout.ts`, `PlannerDesktopGrid`, `PlannerMobileAgenda`, `MobileEditList` and
`SlotCard` work on placed slots instead of `day_of_week` / `span_days`. `maxSpanForStart` is
unchanged (it is already relative to the week).

### Straddling meals

A meal can only straddle two weeks if it predates a start-day change. It renders in both weeks:
full-width to the last column in its starting week, and from column 1 in the following week with a
small "continues" cue. In the continuation week it has no resize handle; move/edit/delete act on
the whole meal. Moving it sends a new `date`, subject to the normal span rule.

### Planner client

`PlannerClient` and `plannerWeekCache` stay keyed by the week-start string. Adds and moves send
`date = weekStart + (index - 1)`.

### Add to plan picker

`AddToPlanPicker` receives the household's `WeekStartDay` from `AddToPlanButton`, which gets it
from its server parent (exact path traced in the plan). It builds weeks with it and preselects
today via `dayIndexInWeek`. It posts `{ date }`.

### Settings

`WeekStartSelector` in the Household section of `src/app/(app)/settings/page.tsx`, styled like
`UnitPreferenceSelector`: Monday / Saturday / Sunday, PATCHes the household, then refreshes.

### Onboarding

- `src/lib/onboarding/steps.ts`: `'week_start'` added to `ONBOARDING_STEPS` and `PERSISTED_STEPS`
  directly after `'units'`. Counted steps go from 7 to 8.
- `WeekStartStep` in `src/components/onboarding/steps/`, modeled on `UnitsStep`: three
  `aria-pressed` cards, Monday preselected (or the saved answer when revisited), Skip allowed,
  `settingsNote` shown.
- `OnboardingWizard` holds the answer in its state like `units`; `src/app/onboarding/page.tsx`
  passes the household's current value.

### i18n

New strings (step title/help, three day labels, settings label/help, continuation cue) in `messages/en` and
`messages/sk`. Day names come from translations, not `Intl`, so they match
the rest of the copy.

## Testing

- **Unit:** `week.ts` for all three start days (Saturday/Sunday edges, month/year boundaries, DST
  weeks); `placeInWeek` (inside, straddling into, straddling out of the week); `steps.ts` order and
  `persistedStepAfter('units') === 'week_start'`.
- **Routes:** week GET overlap selection; slots POST/PUT date + span validation (including
  shortening a straddler and rejecting a new straddle); household PATCH validation; shopping
  generation filtering by date.
- **Components:** `WeekStartStep`, `WeekStartSelector`, the continuation cue and missing resize
  handle, updated `PlannerClient`, `AddToPlanPicker`, `OnboardingWizard` and onboarding page tests.

## Rollout

Big feature: branch `feat/week-start-day` off `main` → merge into `staging` and test on
https://dapcook-staging.vercel.app (staging applies the migration itself) → merge the same branch
into `main`.

The migration drops `meal_slots.week_plan_id` and `day_of_week`, so the old code breaks as soon as
it runs and the new code breaks before it runs. In production, apply the migration by hand in the
Supabase SQL editor **right as** the `main` deploy goes live. There are no real users yet, so a
brief mismatch is acceptable.

## Out of scope

- Meals spanning across weeks as a general feature.
- Start days other than Monday, Saturday and Sunday.
- Per-user (rather than per-household) week start.
