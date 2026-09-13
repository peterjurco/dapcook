# First-Load Splash Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a branded "dap" tap animation on the first hard page load of a browser session, with zero flash and zero click-blocking after it finishes.

**Architecture:** A server-rendered component (`SplashScreen`) mounted as the first child of `<body>` in the root layout. A synchronous inline `<script>` (rendered before the overlay markup) checks `sessionStorage` and, on a repeat load, stamps `data-splash="skip"` onto `<html>` so a CSS rule hides the overlay before first paint. All motion is pure CSS keyframes — no client JS, no hydration dependency.

**Tech Stack:** Next.js 14 (App Router) server components, plain CSS in `globals.css`, Vitest + Testing Library for the gate-script and markup tests.

**Spec:** [docs/superpowers/specs/2026-09-13-splash-screen-design.md](../specs/2026-09-13-splash-screen-design.md)

---

## File Structure

| File | Responsibility |
|------|-----------------|
| `src/components/ui/SplashScreen.tsx` | New. Exports `SPLASH_SESSION_KEY`, `SPLASH_GATE_SCRIPT` (string), and the `SplashScreen` server component (gate `<script>` + overlay markup). |
| `src/components/ui/SplashScreen.test.tsx` | New. Tests the gate script's storage logic directly (not through a browser reload) and the rendered markup. |
| `src/app/globals.css` | Modified. Adds the `#dapcook-splash` overlay rules, all keyframes, the `data-splash="skip"` hiding rule, and the reduced-motion override. |
| `src/app/layout.tsx` | Modified. Renders `<SplashScreen />` as the first child of `<body>`, before `NextTopLoader`. |

---

### Task 1: `SplashScreen` component and its gate script

**Files:**
- Create: `src/components/ui/SplashScreen.tsx`
- Test: `src/components/ui/SplashScreen.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/ui/SplashScreen.test.tsx
import { afterEach, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { SplashScreen, SPLASH_GATE_SCRIPT, SPLASH_SESSION_KEY } from './SplashScreen'

function runGateScript() {
  // eslint-disable-next-line no-new-func
  new Function(SPLASH_GATE_SCRIPT)()
}

afterEach(() => {
  sessionStorage.clear()
  document.documentElement.removeAttribute('data-splash')
})

describe('SplashScreen gate script', () => {
  it('shows the splash and sets the session flag on first load', () => {
    runGateScript()

    expect(sessionStorage.getItem(SPLASH_SESSION_KEY)).toBe('1')
    expect(document.documentElement.getAttribute('data-splash')).toBeNull()
  })

  it('skips the splash on a later load in the same session', () => {
    sessionStorage.setItem(SPLASH_SESSION_KEY, '1')

    runGateScript()

    expect(document.documentElement.getAttribute('data-splash')).toBe('skip')
  })

  it('falls back to showing the splash if sessionStorage throws', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage')
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem() {
          throw new Error('blocked')
        },
        setItem() {
          throw new Error('blocked')
        },
      },
    })

    expect(runGateScript).not.toThrow()
    expect(document.documentElement.getAttribute('data-splash')).toBeNull()

    Object.defineProperty(window, 'sessionStorage', original!)
  })
})

describe('SplashScreen markup', () => {
  it('renders the dap/cook lockup hidden from assistive tech', () => {
    const { container } = render(<SplashScreen />)

    const overlay = container.querySelector('#dapcook-splash')
    expect(overlay).not.toBeNull()
    expect(overlay).toHaveAttribute('aria-hidden', 'true')
    expect(overlay!.querySelectorAll('.splash-letter')).toHaveLength(3)
    expect(overlay!.querySelector('.splash-tile')).toHaveTextContent('d')
    expect(overlay!.querySelector('.splash-word')).toHaveTextContent('dapcook')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/ui/SplashScreen.test.tsx`
Expected: FAIL — `Failed to resolve import "./SplashScreen"` (the module doesn't exist yet).

- [ ] **Step 3: Implement the component**

```tsx
// src/components/ui/SplashScreen.tsx

export const SPLASH_SESSION_KEY = 'dapcook_splash'

// Synchronous, runs before #dapcook-splash is parsed. Must never throw —
// a thrown error here would break page load. Falls back to showing the
// splash whenever sessionStorage is unavailable (private browsing, blocked
// storage) rather than risk a stuck overlay.
export const SPLASH_GATE_SCRIPT = `(function(){try{if(sessionStorage.getItem('${SPLASH_SESSION_KEY}')){document.documentElement.setAttribute('data-splash','skip')}else{sessionStorage.setItem('${SPLASH_SESSION_KEY}','1')}}catch(e){}})()`

export function SplashScreen() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SPLASH_GATE_SCRIPT }} />
      <div id="dapcook-splash" aria-hidden="true">
        <div className="splash-lockup">
          <div className="splash-tile-wrap">
            <div className="splash-tile font-fraunces">d</div>
            <span className="splash-ripple splash-ripple--1" />
            <span className="splash-ripple splash-ripple--2" />
            <span className="splash-ripple splash-ripple--3" />
          </div>
          <div className="splash-word font-fraunces">
            <span className="splash-letter splash-letter--1">d</span>
            <span className="splash-letter splash-letter--2">a</span>
            <span className="splash-letter splash-letter--3">p</span>
            <span className="splash-cook">cook</span>
          </div>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/ui/SplashScreen.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/SplashScreen.tsx src/components/ui/SplashScreen.test.tsx
git commit -m "feat: add SplashScreen component with session gate script

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Splash animation CSS

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Append the splash styles**

Add this block to the end of `src/app/globals.css`:

```css
/* ---- Splash screen (first hard load only) ---- */

#dapcook-splash {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f9fafb;
  animation: splash-lift 0.45s ease-in 1200ms forwards;
}

html[data-splash='skip'] #dapcook-splash {
  display: none;
}

@keyframes splash-lift {
  to {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transform: translateY(-14px) scale(0.97);
  }
}

.splash-lockup {
  display: flex;
  align-items: center;
  gap: 12px;
}

.splash-tile-wrap {
  position: relative;
}

.splash-tile {
  width: 52px;
  height: 52px;
  border-radius: 13px;
  background: #047857;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 34px;
  line-height: 1;
  padding-bottom: 4px;
  box-sizing: border-box;
  box-shadow: 0 6px 16px rgba(4, 120, 87, 0.25);
  transform-origin: 50% 100%;
  transform: translateY(-10px);
  animation: splash-tap 1.25s cubic-bezier(0.3, 0.7, 0.3, 1) forwards;
}

@keyframes splash-tap {
  0% {
    transform: translateY(-10px);
  }
  8% {
    transform: translateY(4px) scale(1.06, 0.9);
  }
  14% {
    transform: translateY(-10px);
  }
  22% {
    transform: translateY(4px) scale(1.06, 0.9);
  }
  28% {
    transform: translateY(-10px);
  }
  36% {
    transform: translateY(4px) scale(1.06, 0.9);
  }
  44% {
    transform: translateY(-6px);
  }
  100% {
    transform: translateY(-6px);
  }
}

.splash-ripple {
  position: absolute;
  left: 26px;
  bottom: -6px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid rgba(4, 120, 87, 0.55);
  opacity: 0;
  transform: translate(-50%, 0);
  animation: splash-ring 0.55s ease-out both;
}

.splash-ripple--1 {
  animation-delay: 90ms;
}
.splash-ripple--2 {
  animation-delay: 270ms;
}
.splash-ripple--3 {
  animation-delay: 450ms;
}

@keyframes splash-ring {
  0% {
    opacity: 0.9;
    transform: translate(-50%, 0) scale(0.4);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, 0) scale(4.5);
  }
}

.splash-word {
  display: flex;
  align-items: baseline;
  font-weight: 600;
  font-size: 38px;
  color: #047857;
  letter-spacing: -0.01em;
}

.splash-letter {
  display: inline-block;
  opacity: 0;
  animation: splash-pop-in 0.34s cubic-bezier(0.2, 1.5, 0.4, 1) forwards;
}

.splash-letter--1 {
  animation-delay: 90ms;
}
.splash-letter--2 {
  animation-delay: 270ms;
}
.splash-letter--3 {
  animation-delay: 450ms;
}

@keyframes splash-pop-in {
  0% {
    opacity: 0;
    transform: translateY(-9px) scale(0.45);
  }
  100% {
    opacity: 1;
    transform: none;
  }
}

.splash-cook {
  display: inline-block;
  overflow: hidden;
  white-space: nowrap;
  max-width: 0;
  opacity: 0;
  animation: splash-cook-open 0.42s cubic-bezier(0.2, 0.8, 0.3, 1) 660ms forwards;
}

@keyframes splash-cook-open {
  to {
    max-width: 220px;
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .splash-tile {
    animation: none;
    transform: translateY(-6px);
  }
  .splash-ripple {
    display: none;
  }
  .splash-letter {
    animation: none;
    opacity: 1;
    transform: none;
  }
  .splash-cook {
    animation: none;
    max-width: 220px;
    opacity: 1;
  }
  #dapcook-splash {
    animation: splash-lift 0.3s ease-in 400ms forwards;
  }
}
```

- [ ] **Step 2: Run the full test suite to confirm nothing else broke**

Run: `npm test`
Expected: PASS — all existing suites plus `SplashScreen.test.tsx` still pass (this task only adds CSS, no test changes expected).

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: add splash screen animation styles

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Mount the splash screen in the root layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Render `SplashScreen` as the first child of `<body>`**

Current `src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import { Fraunces } from 'next/font/google'
import './globals.css'
import { PostHogProvider } from '@/components/providers/PostHogProvider'
import NextTopLoader from 'nextjs-toploader'

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['600'],
  variable: '--font-fraunces',
})

export const metadata: Metadata = {
  title: 'dapcook',
  description: 'Your shared cookbook & meal planner',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fraunces.variable}>
      <body className="font-sans antialiased">
        <NextTopLoader color="#047857" showSpinner={false} />
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  )
}
```

Change it to:

```tsx
import type { Metadata } from 'next'
import { Fraunces } from 'next/font/google'
import './globals.css'
import { PostHogProvider } from '@/components/providers/PostHogProvider'
import { SplashScreen } from '@/components/ui/SplashScreen'
import NextTopLoader from 'nextjs-toploader'

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['600'],
  variable: '--font-fraunces',
})

export const metadata: Metadata = {
  title: 'dapcook',
  description: 'Your shared cookbook & meal planner',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fraunces.variable}>
      <body className="font-sans antialiased">
        <SplashScreen />
        <NextTopLoader color="#047857" showSpinner={false} />
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat: mount splash screen in root layout

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Manual browser verification

No automated test covers real-world timing, the reduced-motion media query, or the cross-reload skip behavior — this task checks all three directly.

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server and open it**

Start the Next.js dev server (`npm run dev`) and open the app in a browser.

- [ ] **Step 2: Verify the animation on first load**

Hard-reload (disable cache, or open in a fresh private window) and confirm:
- The `d` tile taps three times; each tap pops in one letter of "dap".
- "cook" wipes open after the third tap.
- The whole lockup fades/lifts away within ~1.7 s, revealing the app underneath.
- No layout shift or flash of unstyled content before the animation starts.

- [ ] **Step 3: Verify the session-skip behavior**

Without closing the tab, navigate to another route and back, or reload — the splash must **not** replay (same `sessionStorage` session). Open a new private window — it must replay there.

- [ ] **Step 4: Verify the overlay doesn't block clicks after finishing**

After the splash finishes, click something in the top-left corner of the viewport (e.g. a nav link) immediately. It must register — confirming `pointer-events: none` took effect.

- [ ] **Step 5: Verify reduced motion**

Emulate `prefers-reduced-motion: reduce` (browser dev tools rendering emulation) and hard-reload. Confirm: no tapping motion, the finished `dapcook` lockup is shown briefly (~400 ms), then fades — no flash of an unanimated, static splash hanging indefinitely.

- [ ] **Step 6: Check the console**

Confirm no console errors or warnings were introduced (React hydration mismatch warnings would appear here if the gate script and server markup disagreed).

---

## Self-Review Notes

- **Spec coverage:** trigger/gating (Task 1 gate script + Task 3 mount), timeline table (Task 2 CSS timings match the spec's ms values exactly), non-blocking overlay (Task 2 `splash-lift` end state + Task 4 Step 4), accessibility (`aria-hidden` in Task 1, reduced-motion block in Task 2 + Task 4 Step 5), file list (matches spec's table), known Fraunces risk (accepted in spec, no task needed — `font-fraunces` utility already applies `next/font`'s self-hosted, preloaded file).
- **Placeholder scan:** none found — every step has complete code or an exact command with expected output.
- **Type consistency:** `SPLASH_SESSION_KEY` and `SPLASH_GATE_SCRIPT` are defined once in Task 1 and referenced identically (same names) in the Task 1 test; no other task redefines them. Class names (`splash-tile`, `splash-tile-wrap`, `splash-ripple--1/2/3`, `splash-letter--1/2/3`, `splash-word`, `splash-cook`, `#dapcook-splash`) are used identically between Task 1's JSX and Task 2's CSS.
