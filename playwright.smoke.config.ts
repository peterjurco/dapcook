import { defineConfig, devices } from '@playwright/test'

// Read-only checks against a deployed site — production after every deploy
// (.github/workflows/smoke.yml). Nothing here signs in or writes data.
//
//   SMOKE_URL=https://dapcook.vercel.app npx playwright test -c playwright.smoke.config.ts
export default defineConfig({
  testDir: './e2e/smoke',
  // A deploy can take a moment to reach every edge; retry before calling it broken.
  retries: 2,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.SMOKE_URL ?? 'https://dapcook.vercel.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
