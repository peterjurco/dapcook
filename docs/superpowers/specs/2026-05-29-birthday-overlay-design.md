# Birthday Overlay Feature

## Overview

A one-time-per-year confetti + message overlay shown to a specific user when they open the app within ±5 days of their birthday. Configured entirely via environment variables.

## Environment Variables

| Variable | Format | Example |
|---|---|---|
| `BIRTHDAY_USER` | Email address | `alice@example.com` |
| `BIRTHDAY_DATE` | `MM-DD` | `05-29` |
| `BIRTHDAY_MESSAGE` | Plain text | `Hope you have a wonderful day!` |

If any of the three variables is unset, the feature is silently disabled.

## Display Conditions

All of the following must be true:
1. The logged-in user's email matches `BIRTHDAY_USER` (case-insensitive)
2. Today's date falls within ±5 days of the birthday (using the current or adjacent year — handles year-boundary birthdays, e.g. Dec 28 → Jan 2)
3. localStorage key `birthday_shown` does not equal the ISO date of the birthday being celebrated (e.g. `2026-05-29`)

## Components

### `BirthdayOverlay` (client component)

Props:
- `birthdayDate: string` — `MM-DD` from env
- `birthdayMessage: string` — message from env
- `userEmail: string` — current user's email

Behaviour:
- On mount: evaluate all three conditions; if met, show overlay and fire confetti
- On dismiss: write the birthday ISO date to `localStorage.birthday_shown`, hide overlay
- No auto-dismiss — user must click the button

### Integration point

`AppLayout` reads `BIRTHDAY_USER`, `BIRTHDAY_DATE`, `BIRTHDAY_MESSAGE` from `process.env` (server-side, not exposed as `NEXT_PUBLIC_`) and passes them as props to `AppShell`. `AppShell` renders `<BirthdayOverlay>` when all three are present.

## UI / Visual Design

- **Backdrop:** fixed full-screen, semi-transparent dark overlay (`bg-black/60`), `z-50`
- **Card:** centered, white, rounded-xl, generous padding; max-w `sm` on mobile, `md` on desktop; responsive horizontal padding
- **Content:**
  - Large emoji or icon (🎂)
  - Heading: "Happy Birthday!" (`text-2xl font-bold`)
  - Message from env (`text-base text-gray-600`, multi-line safe)
  - Dismiss button: primary color, full-width on mobile / auto on desktop
- **Confetti:** `canvas-confetti` fires once on mount — full-width burst from the top, ~3 seconds
- Mobile-friendly: card fills most of the viewport width on small screens, stays centered vertically with `flex items-center justify-center`

## Birthday Window Calculation

```
birthdayThisYear = new Date(currentYear, month, day)
if |today - birthdayThisYear| <= 5 days → in window (birthdayISO = YYYY-MM-DD of birthdayThisYear)
else:
  birthdayNextYear = new Date(currentYear + 1, month, day)
  if |today - birthdayNextYear| <= 5 days → in window (birthdayISO = YYYY-MM-DD of birthdayNextYear)
  else:
    birthdayPrevYear = new Date(currentYear - 1, month, day)
    if |today - birthdayPrevYear| <= 5 days → in window (birthdayISO = YYYY-MM-DD of birthdayPrevYear)
```

The `birthdayISO` string is what gets stored in localStorage. Storing the specific birthday date (not just the year) ensures the shown state resets correctly each year regardless of when in the window the user first opens the app.

## LocalStorage

Key: `birthday_shown`  
Value: ISO date string of the birthday being celebrated, e.g. `2026-05-29`

Reset logic: on next year's birthday, the stored value (`2026-05-29`) won't match the new `birthdayISO` (`2027-05-29`), so the overlay fires again.

## Dependencies

- `canvas-confetti` (new, ~10 KB gzipped)
- `@types/canvas-confetti` (dev)

## Files to Create / Modify

| File | Change |
|---|---|
| `src/components/ui/BirthdayOverlay.tsx` | New client component |
| `src/components/layout/AppShell.tsx` | Render `BirthdayOverlay` when props present |
| `src/app/(app)/layout.tsx` | Read env vars, pass to `AppShell` |
| `.env.local` / Vercel env | Add three new variables |
| `package.json` | Add `canvas-confetti` + `@types/canvas-confetti` |

## Out of Scope

- Multiple birthday users
- Server-side tracking (localStorage-only is sufficient)
- Sound effects
- Admin UI for configuring birthdays
