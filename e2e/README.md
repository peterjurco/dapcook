# End-to-end tests

Playwright clicks through the real app the way a person would, and checks both what the page shows and what ended up
in the database. 130 tests, each run in two browser engines (260 runs).

- [What is tested](#what-is-tested)
- [How it works](#how-it-works)
- [Running the tests](#running-the-tests)
- [Writing tests](#writing-tests)
- [Smoke test of production](#smoke-test-of-production)

## What is tested

| Spec | Tests | What it checks |
|---|---|---|
| `recipes.spec.ts` | 16 | Creating a recipe by hand (and that a title is required), editing ingredients, steps and tags, deleting, cover photo upload to storage, prep/cook time and servings, search, filters (tag, ingredient, total time, portions), saved default view; another household's recipes stay invisible |
| `share-and-import.spec.ts` | 3 | Public share links (and turning sharing off again); importing from a recipe site; a page that can't be found |
| `ai.spec.ts` | 18 | Everything that uses AI — see [AI features](#ai-features) below |
| `planner.spec.ts` | 21 + 8 phone | Adding meals (from a recipe page, from the grid search), several meals a day, multi-day meals stacked in lanes, dragging a meal to another day, stretching and shrinking it, meals carried over from last week, removing, moving between weeks, a plan shared by household members. **On a phone:** the agenda view and edit mode (add, remove, move, stretch, shrink) |
| `shopping.spec.ts` | 15 | Turning the week's plan into a list (portions, a recipe planned twice, typed meals like "Birthday cake", skipping ingredients you have and recipes you remove, adding the same week twice), adding items from the keyboard, renaming, checking off and deleting, clearing, categories, copying as text, a check-off that fails to save, **live sync** between two household members |
| `settings.spec.ts` | 15 | Household name, week start (Sunday or Saturday, and that the planner follows it), interface language (per member), switching units without converting, shopping categories (add, rename, delete — their items follow), shopping rules, members and invite link, renaming and deleting tags (on every recipe), tag groups, sign-out |
| `onboarding.spec.ts` | 4 | A new user finishing the setup wizard, and that its choices (units, week start, tags) are saved, resuming it after leaving mid-way, joining an existing household by invite link |
| `join-and-tours.spec.ts` | 5 | Invite pages (the household is named; a dead link reveals nothing, signed in or out), a member who joins sees the household's recipes, the planning tour shown once |
| `access.spec.ts` | 7 | **Security:** another household's recipes, meals and shopping items can't be read or changed through the API, nor attached to your own plan; signed-out API calls get only a redirect to sign-in; only the admin sees the admin page |
| `auth.spec.ts` | 6 | The sign-in page renders; signed-out visitors are sent to it from the main pages; onboarding is reachable |
| `a11y.spec.ts` | 11 + 1 phone | **Accessibility:** an [axe](https://github.com/dequelabs/axe-core) scan (WCAG 2.1 A and AA) of every main page filled with real content — sign-in, recipe list, recipe, form, import, shared recipe, planner (desktop and phone), shopping list, list from the plan, settings, onboarding. It catches missing labels, poor contrast and ARIA misuse; it can't judge keyboard flow or wording |

### AI features

None of these call the real (paid) Anthropic API; a fake answers instead (see [the fake AI](#the-fake-ai)).

- **Import:** ingredients split into quantity, unit, name and notes; tag suggestions (existing household tags and one
  new one); reading a blog page that has no recipe data; a page that isn't a recipe imports only its title with a
  warning; translation into the household language (and none when the page is already in it); cups and ounces
  converted to metric.
- **When the AI fails:** an import still reaches review with the ingredients as written; a failed translation can be
  retried, or the recipe kept untranslated.
- **Recipe form:** pasted ingredients and steps split into fields, kept as written when the AI fails; tag suggestions
  for a recipe typed by hand.
- **Settings:** converting all recipes to imperial; reporting recipes that fail to convert; translating all recipes
  when the household language changes.
- **Shopping list:** the same ingredient from two recipes merged into one item; household rules sent to the AI; a
  failure explained, with nothing added.

### Browsers and screens

Every test runs in **Chromium** and in **WebKit** (Safari's engine), as four Playwright projects:

| Project | Browser | Screen | Runs |
|---|---|---|---|
| `desktop` | Chromium | Desktop | every test not tagged `@mobile` |
| `mobile` | Chromium | Pixel 7 | tests tagged `@mobile` (phone layouts) |
| `desktop-webkit` | WebKit | Desktop Safari | same as `desktop` |
| `iphone` | WebKit | iPhone 15 | same as `mobile` |

### Not tested here

- The real AI's answers — judged by hand with the eval tool (`evals/README.md`).
- Real recipe websites — `src/lib/scraper/*.integration.test.ts`, run locally with `npm test`, not in CI.
- Google sign-in itself — tests sign in with a magic link minted by the service role.
- Logic in isolation — the unit tests next to the code (`src/**/*.test.ts`).

## How it works

```
Playwright ──► the app: a production build (`next build && next start`, port 3001)
                 ├──► local Supabase in Docker  (auth, Postgres with RLS, storage, realtime)
                 └──► fake outside services     (port 3011: Anthropic API + a recipe website)
```

- **A production build**, not `next dev`, so tests see what users get.
- **A local Supabase in Docker** (`e2e/supabase/config.toml`). It applies every file in `supabase/migrations` in order,
  so the suite also proves the migrations build a working database from empty. It never touches staging or production.
- **Fake outside services** (`support/fake-services.ts`):
  - <a id="the-fake-ai"></a>**the fake AI** — a stand-in for the Anthropic API (the app gets `ANTHROPIC_BASE_URL`
    pointing at it). It recognises each feature's prompt and answers predictably from the prompt's own input:
    - translation appends ` (<Language>)` to every text ("flour" → "flour (Slovak)");
    - unit conversion uses real factors (100 g → 3.5 oz);
    - the shopping merge sums identical items and files them under the first category;
    - ingredient lines are split with a simple parser, and tags are suggested when they appear in the title or
      ingredients.

    `RECIPE_IMPORT_USE_AI` and `TAG_SUGGEST_USE_AI` are on, so the AI paths really run.
  - **a recipe website** at `/recipe-site/<slug>`: pages with schema.org recipe data, plain blog articles for the AI
    to read, and `?title=` to give a page a unique (or failing) title.
- **Every test gets its own new user and household** (the `user` fixture). Households are the unit of data ownership
  and RLS enforces it, so tests can't see each other's data, run in parallel and in any order, and nothing needs
  cleaning up.

## Running the tests

Needs Docker (OrbStack or Docker Desktop).

```bash
npm run e2e:db:start                       # once; the first start pulls images (a few minutes)
npx playwright install chromium webkit     # once
npm run test:e2e                           # builds the app, starts it on :3001, runs everything
```

Useful variations:

```bash
npx playwright test e2e/planner.spec.ts               # one file
npx playwright test -g "multi-day"                    # tests whose name matches
npx playwright test --project=desktop                 # one browser/screen only
npx playwright test --ui                              # pick tests and watch them run, step by step
npx playwright test --repeat-each=3 --workers=6       # check new tests for flakiness
npx playwright show-report                            # the HTML report of the last run
npm run e2e:db:reset                                  # wipe the database and re-apply all migrations
npm run e2e:db:stop
```

**Ports.** Locally an already-running app on :3001 is reused, so after changing app code stop it, or the suite tests
the old build. If :3001 or :3011 is taken (a `next dev`, another test run or the Playwright UI), pick others:
`E2E_APP_PORT=3002 E2E_FAKE_PORT=3012 npm run test:e2e`.

**In CI** the whole suite runs in the `e2e` job of `.github/workflows/ci.yml` on every pull request and every push to
`main` and `staging`. When it fails, the job uploads `playwright-report/` and `test-results/` (screenshots and traces;
open a trace with `npx playwright show-trace <trace.zip>`).

## Writing tests

Import `test` and `expect` from `./support/fixtures`, not from `@playwright/test`. Never share a user between tests or
depend on test order.

**Fixtures and helpers** (`support/fixtures.ts`):

- `test.use({ household: false })` — signed in but without a household (lands on onboarding).
- `test.use({ skipTours: false })` — product tours not yet seen.
- `createUser({ joinHousehold: user })` + `openAs(browser, partner)` — a second member, in their own browser.
  `openAs(browser, null)` is a signed-out visitor.
- `createRecipe`, `planRecipe`, `addShoppingItems` — set up data that isn't the subject of the test straight in the
  database, instead of clicking through the UI for it.
- `admin()` — service-role client for setup and for checking what was saved. It bypasses RLS, so never use it to test
  who can see what; do that through the UI or API as the user.
- `openRecipeForm`, `openPlanner` — open those pages and wait until they're interactive.

**Testing an AI feature.** Give the fake a reply for any new prompt in `support/fake-services.ts` — never reach the
real API. To exercise a failure, put a marker in the test's input (a recipe title, an ingredient):

- `fail-ai:<feature>` — that feature's AI call always fails;
- `fail-ai-once:<feature>` — it fails the first time, then succeeds (for retry flows).

`<feature>` is one of `parse`, `extract`, `transform`, `tags`, `shopping`. Add a unique suffix to the title so parallel
tests don't share a fail-once marker. `aiPrompts(text)` (`support/env.ts`) returns the prompts the fake received that
contain `text`, to check what the app sent.

**Things that make tests flaky:**

- **Clicking before hydration.** A click or file upload that lands before React has hydrated the page is silently lost.
  Wait for something the page only does once hydrated (`openRecipeForm` and `openPlanner` do this), never for a fixed
  time.
- **`page.goto` while the app is navigating.** After a save that calls `router.refresh()`, or a redirect such as
  finishing onboarding, a `goto` can be "interrupted by another navigation" — WebKit especially. Wait for the page the
  app is heading to, or navigate through the app's links.
- **Drag and drop** (`planner.spec.ts`): drive the real mouse with `page.mouse`, and release only once the day under the
  pointer is highlighted as the drop target (`dropAt`). dnd-kit measures its targets after a drag starts, so an
  immediate release on a busy machine drops on nothing.

Select elements by role, label or visible text (the English UI), the way a user finds them. Check new tests with
`--repeat-each=3` before pushing.

## Smoke test of production

A separate, **read-only** suite for the deployed site: `e2e/smoke/` with its own `playwright.smoke.config.ts` (the main
config ignores it). It signs nobody in and writes nothing. It checks that:

- the sign-in page renders without errors;
- signed-out API calls are redirected to sign-in, so Supabase Auth is reachable;
- an unknown share link is a 404, so the database answers;
- the app manifest and `robots.txt` are served.

`.github/workflows/smoke.yml` runs it after every successful Production deploy that Vercel reports to GitHub, and by
hand (Actions → Smoke test → Run workflow) against a public URL. Staging sits behind Vercel's deployment protection,
so it can't be checked this way without a bypass token. Locally:

```bash
npx playwright test -c playwright.smoke.config.ts   # SMOKE_URL defaults to production
```
