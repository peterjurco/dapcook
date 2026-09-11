# UI Interface Language Design

**Date:** 2026-09-11

## Overview

Add a per-user "Interface language" setting (English / Slovenčina) that translates the entire app UI — not just recipe content. This is distinct from the existing household-level `preferred_language` (recipe-translation) feature, which is unaffected. Introduces `next-intl` as the app's i18n framework, in non-routing mode, with locale resolved server-side from the user's profile.

---

## 1. Data Layer

### New column: `profiles.ui_language`

```sql
ALTER TABLE profiles ADD COLUMN ui_language TEXT NOT NULL DEFAULT 'en'
  CHECK (ui_language IN ('en', 'sk'));
```

Per-user, not shared with the household — follows the same pattern as the existing `default_recipe_filter` column. Defaults to `'en'`, so existing users see no change until they opt in.

### `database.ts` update

Add `ui_language` to `profiles` Row (`string`), Insert (`string | undefined`), Update (`string | undefined`).

---

## 2. i18n Framework

### Library: `next-intl`, non-routing mode

No `/en`/`/sk` URL prefixes — locale is an account setting, not a URL concern. No middleware-based locale detection either.

### Locale resolution

The authenticated app shell (`src/app/(app)/layout.tsx`) already fetches the current user's profile server-side. It reads `profile.ui_language` and passes it to `NextIntlClientProvider`, wrapping the tree for that request. The database is the single source of truth — no cookie to keep in sync.

### Message files

Organized by feature namespace, mirroring the app's structure, under `messages/en/*.json` and `messages/sk/*.json`:

```
messages/
  en/
    common.json
    nav.json
    recipes.json
    planner.json
    shopping.json
    settings.json
  sk/
    common.json
    nav.json
    recipes.json
    planner.json
    shopping.json
    settings.json
```

### Fallback & error handling

- Missing translation key: falls back to the English string in production (via `getMessageFallback`), and the miss is logged to PostHog (matching the existing PostHog-based server error tracking) rather than crashing the page.
- In development, missing keys throw immediately so gaps are caught before shipping.

---

## 3. Component Migration

Every hardcoded English string in `src/app/**` and `src/components/**` is replaced with:
- `useTranslations(namespace)` in Client Components
- `getTranslations(namespace)` in Server Components

keyed into the namespace matching its feature area.

### Formatting

Date formatting (`src/lib/utils/week.ts`, `src/app/api/shopping/generate/route.ts`) and any `Intl.NumberFormat`/`toLocaleDateString` call sites switch from the hardcoded `'en-GB'` locale to the resolved locale (`'en-GB'` for English, `'sk-SK'` for Slovak), via next-intl's `useFormatter`/`getFormatter` so translated copy and formatting go through one consistent API.

### API-originated error/toast messages

Toast and inline error strings that originate from API routes (e.g. "Failed to save recipe") are keyed and translated client-side rather than rendered as raw strings from the API response.

### Out of scope for this migration

AI-generated content (recipe translation via the existing `preferred_language`/`transform-recipe.ts` feature, meal suggestions, etc.) is unaffected — that pipeline is separate and untouched.

---

## 4. Settings UI

### New "Your account" section

Added to `src/app/(app)/settings/page.tsx`, above the existing Household section. Contains a single "Interface language" selector.

### New component: `src/components/settings/InterfaceLanguageSelector.tsx`

Same shape as the existing household `LanguageSelector.tsx`, but:
- PATCHes `/api/profile` (extending the existing route) with `{ ui_language: newValue }`
- On success, calls `router.refresh()` — Server Components re-render with the new locale; Client Components pick it up via the refreshed provider
- No bulk-migration modal (that concept is specific to the recipe-translation feature and doesn't apply here)

### Existing household `LanguageSelector.tsx`

Copy-only change: label updated from "Preferred language" to "Recipe translation language", with a short description clarifying it applies to recipes translated for the whole household. No behavior change.

---

## 5. Files Changed / Created

| File | Change |
|------|--------|
| `supabase/migrations/018_ui_language.sql` | New — add `profiles.ui_language` column |
| `src/types/database.ts` | Add `ui_language` to profiles |
| `src/app/api/profile/route.ts` | Accept `ui_language` in PATCH body |
| `src/app/(app)/layout.tsx` | Resolve locale from profile, wrap tree in `NextIntlClientProvider` |
| `next.config.ts` (or equivalent) | Wire up `next-intl` plugin |
| `src/i18n/request.ts` (new) | next-intl server config — reads locale, loads messages |
| `messages/en/*.json`, `messages/sk/*.json` | New — translation namespaces |
| `src/lib/utils/week.ts` | Locale-aware date formatting |
| `src/app/api/shopping/generate/route.ts` | Locale-aware date formatting |
| `src/components/settings/InterfaceLanguageSelector.tsx` | New — personal language selector |
| `src/components/settings/LanguageSelector.tsx` | Relabel to "Recipe translation language" |
| `src/app/(app)/settings/page.tsx` | Add "Your account" section |
| `src/app/**`, `src/components/**` | Replace hardcoded strings with translation keys (large, mechanical migration) |

---

## 6. Testing

- Unit tests for `PATCH /api/profile` accepting/rejecting `ui_language` values.
- Unit tests for the updated date-formatting helpers (`week.ts`) across both locales.
- No automated test can verify full translation coverage — after implementation, manually sweep Recipes, Planner, Shopping, and Settings in both languages on the Vercel preview deployment before considering this done.

---

## 7. Out of Scope

- Translating AI-generated recipe content, meal suggestions, or any content the existing `preferred_language`/`transform-recipe.ts` pipeline already handles.
- Any language other than English/Slovak for the UI (the `SUPPORTED_LANGUAGES` list used by recipe translation is unaffected and unrelated).
- URL-based locale routing (`/en/...`, `/sk/...`).
- A cookie-based locale cache — DB is read directly per request.
- Translating tags, user-entered recipe content, or household names.
