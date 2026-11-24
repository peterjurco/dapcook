import { test, expect } from '@playwright/test'

// Runs against the live site (see playwright.smoke.config.ts): read-only, signed out.
// It answers "is the deploy up and talking to Supabase?", not "does every feature work"
// — that's the main e2e suite's job, before merge.

test('a visitor is sent to the sign-in page, which renders without errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  const signIn = page.getByRole('button', { name: /sign in with google/i })
  await expect(signIn).toBeVisible()
  await expect(signIn).toBeEnabled()
  expect(errors, 'uncaught errors on the sign-in page').toEqual([])
})

test('the API answers signed-out requests with a way to sign in, not an error', async ({ request }) => {
  // Getting this far means the server reached Supabase Auth to ask who is calling.
  for (const path of ['/api/recipes', '/api/planner/week', '/api/shopping/list']) {
    const res = await request.get(path, { maxRedirects: 0 })
    const signIn = res.status() === 401 || (res.status() === 307 && (res.headers()['location'] ?? '').includes('/login'))
    expect(signIn, `${path} → ${res.status()}`).toBe(true)
  }
})

test('an unknown share link is a clean 404', async ({ page }) => {
  // The page looks the token up in the database; a broken connection would be a 500.
  const res = await page.goto('/s/smoke-check-no-such-token')
  expect(res?.status()).toBe(404)
})

test('the app manifest and robots.txt are served', async ({ request }) => {
  const manifest = await request.get('/manifest.webmanifest')
  expect(manifest.status()).toBe(200)
  expect((await manifest.json()).name).toBeTruthy()
  expect((await request.get('/robots.txt')).status()).toBe(200)
})
