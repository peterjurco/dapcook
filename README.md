# Dapcook

A household recipe manager: import recipes from any URL, organize them with tags, plan meals for the week, and generate a shopping list from the plan.

## Features

- **Recipe import** — scrape a recipe from a URL (JSON-LD, meta tags, or Readability fallback) or paste raw text; an AI step extracts and normalizes ingredients/steps and can translate or transform a recipe (e.g. adjust servings).
- **Tagging** — recipes are organized with tags grouped into tag groups (drag-and-drop management, per-user default filters).
- **Meal planner** — schedule recipes into a weekly calendar, with recurring planner rules.
- **Shopping lists** — generate a shopping list from the planner, with categories, rules, and realtime sync across household members.
- **Households** — invite-based household membership (join links, shared plans/lists) with an admin area.
- **Recipe sharing** — share a recipe via an unlisted link.

## Tech Stack

- [Next.js](https://nextjs.org) (App Router) + React + TypeScript
- [Supabase](https://supabase.com) for auth, Postgres, and storage
- [Anthropic SDK](https://docs.anthropic.com) for recipe extraction/transformation
- Tailwind CSS, shadcn/ui, `@dnd-kit` for drag-and-drop
- Vitest (unit) + Playwright (e2e)

## Getting Started

Copy `.env.local.example` to `.env.local` and fill in Supabase/Anthropic credentials, then run the dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the result.

Database schema and migrations live in `supabase/migrations`.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` / `npm run start` — production build/serve
- `npm run lint` — ESLint
- `npm run type-check` — TypeScript check
- `npm run test` / `npm run test:watch` — unit tests (Vitest)
- `npm run test:e2e` — end-to-end tests (Playwright; needs Docker, see below)

## Testing

None of the automated tests call the paid Anthropic API.

| Layer | Command | Runs automatically |
| --- | --- | --- |
| Lint + types | `npm run lint` · `npm run type-check` | CI |
| Unit tests | `npm test` | CI |
| Live scraper tests | `npm test` (included) | never |
| End-to-end | `npm run test:e2e` | CI |
| Production smoke test | `npx playwright test -c playwright.smoke.config.ts` | after each production deploy |

"CI" means every pull request and every push to `main` and `staging` (`.github/workflows/ci.yml`).

- **Lint + types** — code style and type safety across the repo.
- **Unit tests** (Vitest, ~1,300, in `src/**/*.test.ts(x)` next to the code) — logic and components in isolation:
  scraping and JSON-LD parsing, unit conversion, planner layout, API route handlers, React components. The Anthropic
  SDK and Supabase are mocked.
- **Live scraper tests** (`src/lib/scraper/*.integration.test.ts`) — importing still works on a few real recipe
  sites. Left out of CI because real sites change and block bots.
- **End-to-end** (Playwright, 260 runs, in `e2e/`) — real user journeys in a real browser, on a production build,
  against a local database with RLS and every migration applied; includes accessibility checks. Needs Docker.
- **Production smoke test** (`e2e/smoke/`) — read-only and signed out: the live site is up and reaches Supabase.

AI answer quality is judged separately, by hand, with the eval tool at `/dev/evals` (`evals/README.md`); those runs
do call the real API.

### What the end-to-end suite covers

Every test signs in as its own fresh user and household, so tests run in parallel and never share data. Each one runs in
Chromium and in WebKit (Safari's engine), on a desktop screen and, for phone layouts, a phone screen.

- **Recipes** — create, validate, edit, delete, photo upload, search and filters, default view; pasting text that the AI
  splits into fields; AI tag suggestions.
- **Import** — from a recipe site, and from a blog page with no recipe data that the AI has to read; translation into the
  household language, unit conversion, and what happens when each AI step fails (retry, keep as-is, unstructured fallback).
- **Planner** — adding meals, several a day, multi-day meals, dragging between days, stretching and shrinking, weeks,
  meals carried over, shared plans; the phone agenda and edit mode.
- **Shopping** — generating from the plan (portions, repeats, skipped items, AI merging of duplicates, household rules),
  editing, checking off, copying, categories, live sync between household members, failures.
- **Settings** — household, week start, languages, converting or translating all recipes, categories, rules, members,
  tags and tag groups.
- **Onboarding and households** — the wizard, resuming it, invite links, product tours.
- **Security** — another household's data can't be read or changed through the API; signed-out calls get nothing; the
  admin page.
- **Accessibility** — axe (WCAG 2.1 A/AA) on every main page with real content.

How it's set up, how to run a single test or watch it, and how to write new ones: [`e2e/README.md`](e2e/README.md).

## Project Structure

- `src/app` — routes, grouped into `(app)` (main authenticated app: recipes, planner, shopping, settings, admin), `(auth)` (login), `(flow)` (guided flows), and `api` (route handlers)
- `src/lib` — domain logic: `ai`, `scraper`, `recipes`, `planner`, `shopping`, `tags`, `auth`, `supabase`
- `src/components` — UI components by feature area
- `docs/superpowers` — feature specs and implementation plans

## Deployment

| Branch | URL | Supabase project |
| --- | --- | --- |
| `main` | https://dapcook.vercel.app | `dapcook` |
| `staging` | https://dapcook-staging.vercel.app | `dapcook-staging` |

`staging` is a permanent, downstream-only integration branch: it carries `main`
plus whatever is still being tested, and it never merges back into `main`.

- **Small change** — land it on `main`. It deploys to production, and
  `.github/workflows/sync-staging.yml` merges it into `staging` automatically.
- **Big feature** — branch off `main`, merge that branch into `staging` to test
  it on the staging URL, then merge the *same branch* into `main` once approved.

If `staging` ever tangles it can be thrown away, because it holds no unique
history:

```bash
git checkout staging && git reset --hard origin/main && git push --force origin staging
```

### Migrations

`scripts/apply-migrations.ts` applies pending `supabase/migrations/*.sql` to
staging automatically, tracking what it has run in a `schema_migrations` table.
Databases that predate that table are recognised by their existing schema and
seeded from `supabase/baseline.txt` rather than re-migrated. **Production
migrations are applied by hand.**

See [Next.js deployment docs](https://nextjs.org/docs/app/building-your-application/deploying) for details.
