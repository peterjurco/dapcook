# Project Instructions

## Environments

| Branch | URL | Supabase project |
| --- | --- | --- |
| `main` | https://dapcook.vercel.app | `dapcook` |
| `staging` | https://dapcook-staging.vercel.app | `dapcook-staging` |

`staging` is permanent and downstream-only: it is `main` plus whatever is still
being tested, and it is **never merged back into `main`**. Anything pushed to
`main` is merged into `staging` automatically by `.github/workflows/sync-staging.yml`.

## Deployment

Two modes, decided by the size of the change:

- **Small change** — land it on `main`. It deploys to production and reaches
  staging on its own.
- **Big feature** — branch off `main`, merge the branch into `staging`, and test
  it on https://dapcook-staging.vercel.app. When it is approved, merge **the same
  branch** into `main`. Never merge `staging` into `main`.

After finishing any implementation, push so the deployment picks it up.

## Dependencies

- `package-lock.json` is committed and must stay in sync with `package.json` — CI runs `npm ci`, which fails otherwise.
  Change dependencies with `npm install <pkg>` / `npm uninstall <pkg>`, never by hand-editing `package.json` alone.
- **Dependabot** (`.github/dependabot.yml`) opens grouped minor/patch PRs every Monday against `main`. Merge them
  when CI (`.github/workflows/ci.yml`) and the Vercel preview are green.
- **Major upgrades** are big features: branch, test on staging, then merge the branch into `main`. The ESLint, TypeScript, Tailwind
  and `@types/node` majors are ignored in `dependabot.yml` until someone plans them — remove an ignore once it's done.
- Run `npm audit` before releases. A fix that needs a major bump follows the rule above, not `npm audit fix --force`.

## Database migrations

Add SQL to `supabase/migrations`. Staging applies pending migrations by itself
once the change reaches that branch; **production is applied by hand** in the
Supabase SQL editor. Never edit `supabase/baseline.txt`.

## Local development

- **Dev login:** with `npm run dev` running, open http://localhost:3000/dev/login to sign in as
  `dev@dapcook.local` without Google. `.env.local` points at the **staging** Supabase project.
  - `?next=/shopping` — land on a specific page.
  - `?fresh=1` — detach the dev user from its household (and reset its language to English and its seen product tours) and
    open `/onboarding`, to walk through the wizard again. Old dev households stay in staging.
  - The route returns 404 unless `NODE_ENV === 'development'`.
  - `next dev` listens on all interfaces, so anyone on the LAN can hit `/dev/login` — run
    `npm run dev -- -H localhost` on untrusted networks.
- **No paid AI calls while testing:** do not trigger anything that calls the Anthropic API
  (AI recipe import, translation, shopping-list generation, "make smarter") unless the user
  explicitly asks. Tests must mock the SDK.
