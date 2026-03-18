import { test, expect } from '@playwright/test'

test.describe('Auth routing', () => {
  test('login page renders sign-in button', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: /sign in with google/i })).toBeVisible()
  })

  test('unauthenticated user visiting /recipes is redirected to /login', async ({ page }) => {
    await page.goto('/recipes')
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated user visiting /planner is redirected to /login', async ({ page }) => {
    await page.goto('/planner')
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated user visiting /shopping is redirected to /login', async ({ page }) => {
    await page.goto('/shopping')
    await expect(page).toHaveURL(/\/login/)
  })

  test('root path redirects to /login when unauthenticated', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Onboarding page', () => {
  test('onboarding page is publicly accessible', async ({ page }) => {
    await page.goto('/onboarding')
    // Should not redirect (or if it does, goes to login not 404)
    const url = page.url()
    expect(url).not.toContain('404')
  })
})
