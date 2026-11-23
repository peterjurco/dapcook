# End-to-end tests

Playwright drives a **production build** of the app (port 3001) in Chromium, against:

- **A local Supabase in Docker** (`e2e/supabase/config.toml`). It loads every file in `supabase/migrations`
  in filename order, so the suite also proves the migrations still build a working database from empty.
  It never touches staging or production.
- **A fake Anthropic API** (`support/fake-anthropic.ts`), so no test can make a paid AI call. It gives
  a predictable answer to prompts it recognises (today: the shopping-list merge, which passes items
  through unmerged under the first category) and an error to everything else. A test that needs another
  AI feature adds a canned reply there.

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

## Writing tests

Import `test` and `expect` from `./support/fixtures`, not from `@playwright/test`.

**Every test gets its own new user and household** (the `user` fixture). Households are the unit of
data ownership and RLS enforces it, so tests can't see each other's data, can run in parallel and in
any order, and nothing needs cleaning up. Never share a user between tests or depend on test order.

- `test.use({ household: false })` — signed in but without a household (lands on onboarding).
- `createUser()` + `signIn(browser.newContext(), user)` — a second person, in their own browser.
- `createRecipe`, `planRecipe` — set up data that isn't the subject of the test directly in the
  database, instead of clicking through the UI for it.
- `admin()` — service-role client for setup and for checking what was saved. It bypasses RLS, so
  never use it to test who can see what; do that through the UI as the user.

Select elements by role, label or visible text (the English UI), the way a user finds them.
