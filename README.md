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
- `npm run test:e2e` — end-to-end tests (Playwright)

## Project Structure

- `src/app` — routes, grouped into `(app)` (main authenticated app: recipes, planner, shopping, settings, admin), `(auth)` (login), `(flow)` (guided flows), and `api` (route handlers)
- `src/lib` — domain logic: `ai`, `scraper`, `recipes`, `planner`, `shopping`, `tags`, `auth`, `supabase`
- `src/components` — UI components by feature area
- `docs/superpowers` — feature specs and implementation plans

## Deployment

Vercel is the testing ground for this project — after finishing an implementation, push to git so the Vercel deployment picks it up. See [Next.js deployment docs](https://nextjs.org/docs/app/building-your-application/deploying) for details.
