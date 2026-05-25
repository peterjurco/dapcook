# PostHog Integration Design

**Date:** 2026-05-25  
**Goal:** Add PostHog session recording and event tracking to understand user flows and identify friction points.

---

## Approach

Client-side only using `posthog-js`. No server-side SDK. All session replay, pageview tracking, and custom events are captured in the browser.

---

## Section 1: Provider Setup

Install `posthog-js`. Create `src/components/providers/PostHogProvider.tsx` — a `'use client'` component that initializes PostHog once on mount with:

- `NEXT_PUBLIC_POSTHOG_KEY` — project API key from PostHog Cloud
- `NEXT_PUBLIC_POSTHOG_HOST` — set to `https://eu.i.posthog.com` or `https://us.i.posthog.com` depending on chosen region
- Session recording enabled (`session_recording: { maskAllInputs: false }` — adjust per privacy needs)
- Autocapture enabled (clicks, pageviews, etc.)

Wrap `<body>` children in `src/app/layout.tsx` with this provider.

---

## Section 2: User Identification

Create `src/components/providers/PostHogIdentifier.tsx` — a `'use client'` component placed inside `src/app/(app)/layout.tsx` (the authenticated zone only).

On mount, it reads the Supabase client session and calls:
```ts
posthog.identify(user.id, { email: user.email })
```

This ties all subsequent events and session recordings to the Supabase user ID.

On logout (handled elsewhere in the app), call `posthog.reset()` to detach the session.

Anonymous users on `/login`, `/join`, and `/onboarding` are never identified — PostHog automatically aliases their anonymous session to the identified user when `identify()` fires after auth.

---

## Section 3: Custom Events

All events use `usePostHog()` from `posthog-js/react`. Events fire after the action succeeds (not on initiation).

| Event | File | Trigger |
|---|---|---|
| `recipe_created` | `src/components/recipe/RecipeForm.tsx` | After successful form save |
| `recipe_deleted` | `src/components/recipe/DeleteRecipeButton.tsx` | After confirmed delete |
| `meal_planned` | `src/components/planner/PlannerClient.tsx` | After recipe dropped into a planner slot |
| `onboarding_completed` | `src/app/onboarding/page.tsx` | On completion submit success |
| `shopping_list_viewed` | `src/components/shopping/ShoppingClient.tsx` | On component mount |
| `shopping_list_generated` | `src/components/shopping/ShoppingClient.tsx` | After `generateList()` resolves successfully |

No custom properties are required on events initially — PostHog will associate them with the identified user and session automatically.

---

## Environment Variables

Two new vars required in `.env.local` and Vercel project settings:

```
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
```

---

## Out of Scope

- Server-side tracking with `posthog-node`
- Feature flags
- A/B testing
- Custom dashboards (configured in PostHog UI, not in code)
