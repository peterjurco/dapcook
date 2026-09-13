# First-load splash screen — "dap dap dap"

## Goal

A branded launch animation on the first hard load of a browser session. The `d` app icon taps
a rhythm and each tap produces one letter of **dap**; "cook" completes the wordmark and the
overlay lifts away. Route-to-route navigation is untouched — `NextTopLoader` already covers that.

## Behaviour

- **Trigger:** first full document load per browser session. Subsequent loads in the same session
  (reloads, new tabs inherit their own session) skip it entirely, with no flash.
- **Duration:** ~1.65 s, fixed. The splash never waits on data or auth; it plays over whatever is
  loading underneath.
- **Scope:** all routes, because it mounts in the root layout. `/` redirects in middleware, so in
  practice the user sees it over `/recipes` or `/login`.
- **Non-blocking:** the overlay must never intercept a click. It ends on `visibility: hidden` +
  `pointer-events: none` through `animation-fill-mode: forwards`.
- **Accessibility:** `aria-hidden="true"`, no focus trap, no focus steal. Under
  `prefers-reduced-motion: reduce` the taps are dropped — the completed lockup holds ~400 ms,
  then fades.
- **i18n:** none needed. The wordmark is the only content.

## Animation timeline

Overlay: full-bleed `#f9fafb` (matches `bg-gray-50` of the app shell), `position: fixed`, `z-index: 100`
(above the app shell's `z-50` bottom nav and the birthday overlay).
Lockup: emerald `#047857` tile (48–52 px, `rounded-[13px]`, Fraunces `d`) + wordmark in Fraunces 600.

| t (ms) | Event |
|--------|-------|
| 0      | Lockup present, tile raised ~10 px, all three letters at `opacity: 0` |
| 90     | Tap 1 — tile drops, squashes (`scale(1.06, .9)`), ripple ring expands, **d** pops in |
| 270    | Tap 2 — same, **a** pops in |
| 450    | Tap 3 — same, **p** pops in |
| 660    | "cook" wipes open (`max-width` 0 → 220 px, fading in) |
| 1200   | Lockup lifts and fades (`translateY(-14px) scale(.97)`); the overlay background fades with it |
| ~1650  | Overlay `visibility: hidden`, `pointer-events: none` |

Letters pop with `cubic-bezier(.2, 1.5, .4, 1)`; the tap itself uses `cubic-bezier(.3, .7, .3, 1)`.
Ripples are 2 px emerald rings scaling 0.4 → 4.5 while fading out.

## Architecture

The splash must exist in the first paint or not at all, so it is **server-rendered markup with
pure-CSS animation** — never a client component that mounts after hydration.

```
<body>
  <script>…gate…</script>     ← synchronous, runs before the overlay is parsed
  <div id="splash">…</div>    ← static markup, animated entirely by CSS
  …app…
</body>
```

**Gate script** (inline, synchronous, first child of `<body>`):

1. Read `sessionStorage.getItem('dapcook_splash')`.
2. If set → `document.documentElement.dataset.splash = 'skip'`; CSS rule
   `[data-splash="skip"] #splash { display: none }` hides the overlay before it paints.
3. If not set → write the flag immediately, so a reload mid-animation does not replay it.
4. Everything wrapped in `try/catch`. Storage throwing (private mode, blocked cookies) falls
   through to showing the splash — degrading toward the animation, never toward a stuck overlay.

The script is exported from the component module as a string constant so it can be unit-tested by
evaluating it against a mocked `sessionStorage`, rather than being tested only in a browser.

## Files

| File | Change |
|------|--------|
| `src/components/ui/SplashScreen.tsx` | New. Server component: gate `<script>` + overlay markup. Exports `SPLASH_GATE_SCRIPT`. |
| `src/components/ui/SplashScreen.test.tsx` | New. Gate logic and markup tests. |
| `src/app/globals.css` | Add `#splash` styles, keyframes, `[data-splash="skip"]` rule, reduced-motion block. |
| `src/app/layout.tsx` | Render `<SplashScreen />` as the first child of `<body>`. |

## Tests

Vitest + Testing Library, matching existing component tests.

- **Gate — first load:** empty `sessionStorage` → script leaves `data-splash` unset and writes the flag.
- **Gate — second load:** flag present → script sets `data-splash="skip"`.
- **Gate — storage throws:** `sessionStorage` getter throws → no exception escapes, `data-splash`
  stays unset (splash shows).
- **Markup:** overlay renders the letters `d`, `a`, `p` and `cook`, and carries `aria-hidden="true"`.

Visual timing is not unit-tested; it is verified in the browser against the dev server.

## Known risk

Fraunces loads through `next/font` with `display: swap`. On a cold cache the wordmark can start in
the Georgia fallback and swap mid-animation. `next/font` self-hosts and preloads the file, and
`adjustFontFallback` (on by default) limits the size shift, so this is rare and cosmetic.
Gating the reveal on `document.fonts.ready` would remove it entirely at the cost of JS in the
critical path — deliberately not done.

## Out of scope

- Route-transition loaders (`NextTopLoader` covers them).
- Sound. The rhythm is carried visually.
- A "skip" affordance — at 1.65 s it would cost more attention than it saves.
