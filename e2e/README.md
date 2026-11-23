# End-to-end tests

Playwright drives a **production build** of the app (port 3001) in Chromium, against:

- **A local Supabase in Docker** (`e2e/supabase/config.toml`). It loads every file in `supabase/migrations`
  in filename order, so the suite also proves the migrations still build a working database from empty.
  It never touches staging or production.
- **Fake outside services** (`support/fake-services.ts`, port 3011):
  - an Anthropic API stand-in, so no test can make a paid AI call. It gives a predictable answer to
    prompts it recognises (today: the shopping-list merge, which passes items through unmerged under the
    first category) and an error to everything else — which is how the "conversion failed" paths are tested;
  - a recipe website at `/recipe-site/<slug>` with schema.org JSON-LD pages, for URL import.

Two projects run: **desktop** (everything) and **mobile** (a Pixel 7 viewport, only tests tagged `@mobile`).

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
suite tests the old build. CI runs the whole thing in the `e2e` job of `.github/workflows/ci.yml`.

## What's covered

| Spec | Area |
|---|---|
| `auth.spec.ts` | Signed-out redirects |
| `onboarding.spec.ts` | Wizard, resuming it, joining by invite link |
| `recipes.spec.ts` | Create, validate, paste, edit, delete, cover upload, search, tag filter, tags, isolation |
| `share-and-import.spec.ts` | Public share links (and disabling them), URL import and its errors |
| `planner.spec.ts` | Adding from a recipe and from the grid, custom meals, removing, weeks, shared plans, phone views |
| `shopping.spec.ts` | Generating from the plan (portions, re-adding), editing the list, clearing, categories |
| `settings.spec.ts` | Household name, week start, language, units (and failed conversions), categories, rules, members, tags, sign-out |
| `access.spec.ts` | Cross-household API access, signed-out API calls, the admin page |
| `join-and-tours.spec.ts` | Invite pages, product tours |

**Known issue** — `shopping.spec.ts` › "a household member sees items checked off live" is marked
`test.fixme`: live sync between members doesn't work (see the comment on the test). Remove `fixme` once fixed.

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
