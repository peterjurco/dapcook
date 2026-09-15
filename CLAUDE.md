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

## Database migrations

Add SQL to `supabase/migrations`. Staging applies pending migrations by itself
once the change reaches that branch; **production is applied by hand** in the
Supabase SQL editor. Never edit `supabase/baseline.txt`.
