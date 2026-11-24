# End-to-end tests

Playwright drives a **production build** of the app (port 3001) in Chromium, against:

- **A local Supabase in Docker** (`e2e/supabase/config.toml`). It loads every file in `supabase/migrations`
  in filename order, so the suite also proves the migrations still build a working database from empty.
  It never touches staging or production.
- **Fake outside services** (`support/fake-services.ts`, port 3011):
  - an Anthropic API stand-in, so no test can make a paid AI call. Every AI feature (import parsing,
    reading a page without recipe data, translation, unit conversion, tag suggestions, the shopping-list
    merge) gets a predictable answer computed from its own prompt: translation appends " (<Language>)"
    to each text, conversion uses real factors, the merge sums identical items under the first category.
    `fail-ai:<feature>` anywhere in the input (a recipe title, an ingredient) makes that feature fail,
    `fail-ai-once:<feature>` only on the first try, and `aiPrompts(text)` (`support/env.ts`) returns the
    prompts it received, for checking what the app sent. `RECIPE_IMPORT_USE_AI` and `TAG_SUGGEST_USE_AI` are on;
  - a recipe website at `/recipe-site/<slug>`: schema.org JSON-LD pages, plain blog articles for the AI to
    read, and `?title=` to give a page a unique (or failing) title.

Four projects run: **desktop** (Chromium, everything), **mobile** (a Pixel 7 viewport, only tests tagged
`@mobile`), and the same two in Safari's engine, WebKit: **desktop-webkit** and **iphone** (iPhone 15).
`--project=desktop` runs one. First time: `npx playwright install chromium webkit`.

WebKit is less forgiving of a `page.goto` issued while the app is still navigating or refreshing
(after a save that calls `router.refresh()`, or a redirect on finishing onboarding): the goto is "interrupted by
another navigation". Wait for the page the app is heading to, or navigate through its links, instead.

## Running

Needs Docker (OrbStack or Docker Desktop).

```bash
npm run e2e:db:start   # once; first start pulls images (a few minutes)
npm run test:e2e       # builds the app, starts it on :3001, runs the specs
npx playwright test --ui   # pick and watch tests interactively
npm run e2e:db:reset   # wipe the database and re-apply all migrations
npm run e2e:db:stop
```

Locally an already-running server on :3001 is reused, so after changing app code either stop it or the
suite tests the old build. If :3001 is taken by something else (say a `next dev`), pick another port:
`E2E_APP_PORT=3002 npm run test:e2e` (and `E2E_FAKE_PORT=3012` if another run holds the fake on :3011). CI runs the whole thing in the `e2e` job of `.github/workflows/ci.yml`.

## What's covered

| Spec | Area |
|---|---|
| `auth.spec.ts` | Signed-out redirects |
| `onboarding.spec.ts` | Wizard (and that its units, week start and tags are saved), resuming it, joining by invite link |
| `recipes.spec.ts` | Create, validate, edit (ingredients, steps, tags), delete, cover upload, times, search, filters (tag, ingredient, time, portions), default view, isolation |
| `share-and-import.spec.ts` | Public share links (and disabling them), URL import and its errors |
| `planner.spec.ts` | Adding (recipe page picker and its "Change", grid search), several meals a day, multi-day meals and lanes, dragging to another day, stretching and shrinking, meals carried over from last week, removing, weeks, shared plans; on a phone: agenda, edit mode (add, remove, move, stretch, shrink) |
| `shopping.spec.ts` | Generating from the plan (repeat meals, typed meals, skipped items and recipes, portions, re-adding), editing the list, copying, failed saves, clearing, categories |
| `settings.spec.ts` | Household name, week start, language, units, categories (add, rename, delete), rules, members, tags and tag groups, sign-out |
| `ai.spec.ts` | AI import (structuring, tag suggestions, pages without recipe data, translation and its retry, unit conversion, failures), pasting into the form, tag suggestions, converting and translating existing recipes, the shopping-list merge, rules and failures |
| `access.spec.ts` | Cross-household API access, signed-out API calls, the admin page |
| `join-and-tours.spec.ts` | Invite pages, product tours |

## Writing tests

Import `test` and `expect` from `./support/fixtures`, not from `@playwright/test`.

**Every test gets its own new user and household** (the `user` fixture). Households are the unit of
data ownership and RLS enforces it, so tests can't see each other's data, can run in parallel and in
any order, and nothing needs cleaning up. Never share a user between tests or depend on test order.

- `test.use({ household: false })` — signed in but without a household (lands on onboarding).
- `test.use({ skipTours: false })` — product tours not yet seen.
- `createUser({ joinHousehold: user })` + `openAs(browser, partner)` — a second member, in their own
  browser. `openAs(browser, null)` is a signed-out visitor.
- `createRecipe`, `planRecipe`, `addShoppingItems` — set up data that isn't the subject of the test
  directly in the database, instead of clicking through the UI for it.
- `admin()` — service-role client for setup and for checking what was saved. It bypasses RLS, so
  never use it to test who can see what; do that through the UI or API as the user.

**Wait for hydration before interacting.** A click or file upload that lands before React has hydrated
the page is silently lost, which shows up as a test that fails only sometimes. Use `openRecipeForm` and
`openPlanner` (they wait for the request each page makes on mount); for other pages, wait for something
the page only does once hydrated, never for a fixed time.

Select elements by role, label or visible text (the English UI), the way a user finds them.
Check flakiness before pushing new tests: `npx playwright test --repeat-each=3 --workers=6`.

**Drag and drop** (`planner.spec.ts`): drive the real mouse with `page.mouse`, and release only once the
day under the pointer is highlighted as the drop target (`dropAt`): dnd-kit measures its targets after a
drag begins, so an immediate release on a busy machine drops on nothing.
