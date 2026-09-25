# Onboarding wizard — design

Date: 2026-09-25
Branch: `feat/onboarding-wizard` (big feature → merge into `staging` first, then the same branch into `main`)

## Goals

- Replace the single "Create / Join household" screen with a multi-step wizard that sets the household up properly for new users.
- Invitees keep the current direct path (`/join/[token]` → Google → `/recipes`) and never see the wizard.
- Joining by invite stays available as a fallback, but it accepts the invite **link** people actually receive.
- Agents can log in locally without Google so they can verify UI in the browser.
- Settings: household name becomes editable.

Out of scope: tag-group delete UI (already exists in `GroupModal`, stays as is).

## 1. Dev login (`/dev/login`)

Route handler `src/app/dev/login/route.ts`:

- Returns 404 unless `process.env.NODE_ENV === 'development'`.
- Uses a service-role client (`SUPABASE_SERVICE_ROLE_KEY`, staging project) to ensure user `dev@dapcook.local` exists (`auth.admin.createUser` with `email_confirm: true` if missing), then `auth.admin.generateLink({ type: 'magiclink', email })`.
- Calls `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })` on the normal SSR client so real session cookies are set; upserts the `profiles` row like `auth/callback` does.
- Query params:
  - `next` — redirect target (default `/recipes`; must start with `/`).
  - `fresh=1` — sets the dev user's `profiles.household_id = NULL` (and `ui_language` back to `en`) before redirecting, so onboarding can be run again. Old dev households are left in place.
- Middleware: `/dev` is a public path in every environment; the route itself returns 404 outside development, so nothing is exposed.
- Documented in `CLAUDE.md` under a new "Local development" section (URL, params, the "no paid AI calls during testing" rule).

## 2. Data model

Migration `supabase/migrations/020_onboarding_step.sql`:

```sql
ALTER TABLE households
  ADD COLUMN onboarding_step TEXT
  CHECK (onboarding_step IN ('translation', 'units', 'tags', 'shopping_categories', 'shopping_rules'));
```

`NULL` = onboarding finished. Existing households get `NULL` (no backfill needed). Update `src/types/database.ts`.

`PATCH /api/household` additionally accepts:
- `name` (trimmed, 1–80 chars)
- `onboarding_step` (one of the allowed values or `null`)

## 3. Routing and guards

- `(app)/layout.tsx`: redirect to `/onboarding` when the profile has no household **or** the household's `onboarding_step` is not null.
- `/onboarding` (server component page) decides the phase:
  - no household → pre-household steps (language → intro → name), local client state; always starts at *language* on revisit.
  - household with `onboarding_step` set → resumes at that step.
  - household with `onboarding_step = NULL` → redirect `/recipes`.
- `onboarding/layout.tsx` loads the profile and renders in `profiles.ui_language` (replaces the current hardcoded default locale). Mounts `PostHogIdentifier` so events are attributed to the user.

## 4. Wizard UI

`src/app/onboarding/page.tsx` renders `OnboardingWizard` (client) from `src/components/onboarding/`. One component per step, each with a single responsibility and props `{ onNext, onSkip }`.

Common frame:
- Heading styled like other pages: `font-fraunces`, first letter `text-emerald-700` ("**W**elcome to dapcook" / Slovak equivalent), via `headingW` + `headingRest` message keys like the other pages.
- Progress indicator "Step n of 8" over steps 2–9 below (the language step is not counted).
- Footer: **Next** (primary) and, for steps 4–8, **Skip**. Steps 4–8 show a small note: "You can change this anytime in Settings."

Steps:

1. **Language** — two large buttons (English / Slovenčina), short bilingual greeting. Click → `PATCH /api/profile { ui_language }` → `router.refresh()` so everything after renders in the chosen language.
2. **Intro** — friendly message: we'll set a few things up, it takes a couple of minutes and makes dapcook work much better for you; everything can be changed later in Settings. Button "Let's start".
3. **Household name** — name input + **Create**. Below: "Got an invite link?" toggles an input that accepts a full invite URL or bare token → `joinHousehold`. Create calls `createHousehold`, which now:
   - inserts household with `onboarding_step = 'translation'`,
   - inserts the 9 default shopping categories localized in the UI language, in order: Veggies & Fruits, Bakery, Pantry, Herbs & Spices, Dairy & Eggs, Frozen, Meat, Household, Drinks (SK: Ovocie a zelenina, Pečivo, Trvanlivé potraviny, Bylinky a koreniny, Mliečne výrobky a vajcia, Mrazené, Mäso, Domácnosť, Nápoje),
   - creates the shopping list as today,
   - redirects back to `/onboarding` (no longer `/recipes?ob=1`).
4. **Translation** — toggle "Translate imported recipes" + language buttons from `SUPPORTED_LANGUAGES`; default target = UI language. Saves via `PATCH /api/household { translation_enabled, preferred_language }`. No bulk re-translation (no recipes yet) → no AI call.
5. **Units** — two selectable cards:
   - Metric: 500 g flour · 250 ml milk · 180 °C
   - Imperial: 1 lb flour · 1 cup milk · 350 °F
   - Shared line under both: spoon measures stay spoons — "1 tbsp / 1 PL oil, 1 tsp / 1 ČL salt" (they follow the recipe language, not the unit system; see `src/lib/units/normalize-unit.ts`).
   Saves via `PATCH /api/household { preferred_units }`.
6. **Tags** — "What kind of recipes will you add?" Chips grouped by category from `src/lib/onboarding/tag-catalog.ts` (EN/SK labels). Nothing preselected. Each group has "+ Add" for custom tags (inline input, adds a selected chip to that group). On Next → `POST /api/onboarding/tags { groups: [{ name, tags: string[] }] }` which, for each group with ≥1 tag, creates a `tag_groups` row (position = catalog order) and `tags` rows with `group_id`. Names stored in the UI language.
7. **Shopping categories** — explanation: "Order these like the aisles in your usual supermarket — your shopping list will follow this order." Reuses `ShoppingCategoriesEditor` (add, rename, reorder, delete, color) with the prefilled defaults. Edits persist immediately via existing APIs; Next just advances.
8. **Shopping rules** — explanation: when dapcook builds your shopping list with AI, it follows these rules. Tappable example chips that add the rule (localized):
   - Merge all kinds of onions into one item
   - Skip salt, pepper, oil and water — we always have them
   - Round up to whole packages (1 pack of butter, not 125 g)
   - Count eggs in pieces, not grams
   - Merge the same cheese from different recipes
   Plus `ShoppingRulesEditor` for custom rules and removal.
9. **Done** — "You're all set" → sets `onboarding_step = NULL` → `/recipes?ob=1`.

Step advance: Next/Skip on steps 4–8 → `PATCH /api/household { onboarding_step: <next> }` (after the step's own save on Next). Last step sets `null`.

### Tag catalog

| Group | Tags |
|---|---|
| Course | Breakfast, Brunch, Lunch, Dinner, Main dish, Side dish, Soup, Salad, Appetizer, Snack, Dessert, Baking, Sauce & dip, Drink, Cocktail |
| Cuisine | Slovak, Czech, Traditional, Italian, French, Spanish, Greek, Mediterranean, Mexican, American, Asian, Chinese, Japanese, Thai, Vietnamese, Korean, Indian, Middle Eastern |
| Diet | Vegetarian, Vegan, Gluten-free, Dairy-free, Low-carb, High-protein, Keto, Light |
| Main ingredient | Chicken, Beef, Pork, Fish, Seafood, Pasta, Rice, Legumes, Potatoes, Vegetables, Eggs, Mushrooms |
| Effort & time | Quick (under 30 min), Easy, Weekend project, One-pot, Meal prep, Freezer-friendly, Slow cooker, Air fryer |

## 5. Invite handling

- `src/lib/utils/invite.ts`: `extractInviteToken(input: string): string | null` — accepts `https://…/join/<token>[/complete][?…]` or a bare 32-hex token; returns null otherwise. `joinHousehold` uses it and returns `invalidInviteCode` on null.
- `joinHousehold` redirects to `/recipes?ob=1&obm=join`.
- `auth/callback`: when `pending_invite_token` is present but resolves to no household → delete cookie, redirect `/join-invalid` (today it silently falls through to `/onboarding`).
- Remove the debug `console.log`s in the callback while touching it.

## 6. Analytics (PostHog)

- `onboarding_step_completed` `{ step, skipped: boolean }` — captured client-side in the wizard on every Next/Skip (steps: `language`, `intro`, `household`, `translation`, `units`, `tags`, `shopping_categories`, `shopping_rules`).
- `onboarding_completed` `{ method: 'create' | 'join' }` — `PostHogIdentifier` keeps the `?ob=1` mechanism and reads `obm` (`create` default, `join`), stripping both params.

## 7. Settings

- Household name: inline edit (pencil → input → Save/Cancel) in the Household card, `PATCH /api/household { name }`, `router.refresh()`.

## 8. i18n

All new strings in `messages/{en,sk}/auth.json` under `onboarding.*` (wizard) and `messages/{en,sk}/settings.json` under `page.*` (rename). Catalog tag labels and default shopping categories live in TS constants with `{ en, sk }`, not in message files, because they become stored data.

## 9. Testing

Vitest (AI SDK never called; no test hits paid APIs):
- `extractInviteToken` — URL variants, bare token, garbage.
- `tag-catalog` → payload builder: only groups with selections, custom tags included, localized names.
- `POST /api/onboarding/tags` — creates groups/tags, skips empty groups, auth/household checks.
- `PATCH /api/household` — `name` and `onboarding_step` validation.
- `auth/callback` — invalid pending token → `/join-invalid`.
- `(app)` layout / onboarding page guard — redirects by household + `onboarding_step`.
- Component tests per step (language buttons, join fallback toggle, units cards, tag chips + custom add, rule example chips, Skip/Next calls + PostHog capture).
- Settings household rename.
- Update existing `src/app/onboarding/page.test.tsx`.

Manual verification via `/dev/login?fresh=1` in the browser pane, staying away from AI-triggering flows.

## 10. Rollout

- Migration 020 is applied automatically on staging; apply it by hand on production before merging to `main`.
- Existing households are unaffected (`onboarding_step = NULL`).
