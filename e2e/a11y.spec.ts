import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import {
  test,
  expect,
  addShoppingItems,
  createRecipe,
  openAs,
  openPlanner,
  openRecipeForm,
  planRecipe,
  thisMonday,
  weekDay,
} from './support/fixtures'

// Automated accessibility checks (axe-core, WCAG 2.1 A and AA) on every main page,
// with enough data that the page shows its real content rather than an empty state.
// axe finds roughly a third of accessibility problems: missing names and labels,
// contrast, landmarks, ARIA misuse. It can't judge keyboard flow or wording.

async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const summary = violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 5).map((n) => `${n.target.join(' ')}: ${n.failureSummary ?? ''}`),
  }))
  expect(summary, JSON.stringify(summary, null, 2)).toEqual([])
}

async function withRecipe(user: Parameters<typeof createRecipe>[0]) {
  return createRecipe(user, {
    title: 'Accessible apple pie',
    servings: 4,
    prepTime: 20,
    cookTime: 45,
    tags: ['dessert'],
    ingredients: [
      { quantity: 6, unit: '', name: 'apples' },
      { quantity: 200, unit: 'g', name: 'flour' },
    ],
    steps: ['Slice the apples.', 'Bake for 45 minutes.'],
  })
}

test.describe('Accessibility', () => {
  test('sign-in page', async ({ browser }) => {
    const page = await openAs(browser, null)
    await page.goto('/login')
    await expect(page.getByRole('button', { name: /sign in with google/i })).toBeVisible()
    await expectAccessible(page)
    await page.context().close()
  })

  test('recipe list', async ({ page, user }) => {
    await withRecipe(user)
    await page.goto('/recipes')
    await expect(page.getByText('Accessible apple pie')).toBeVisible()
    await expectAccessible(page)
  })

  test('recipe page', async ({ page, user }) => {
    const recipe = await withRecipe(user)
    await page.goto(`/recipes/${recipe.id}`)
    await expect(page.getByRole('heading', { name: 'Accessible apple pie' })).toBeVisible()
    await expectAccessible(page)
  })

  test('recipe form', async ({ page, user }) => {
    const recipe = await withRecipe(user)
    await openRecipeForm(page, `/recipes/${recipe.id}/edit`)
    await expect(page.getByLabel('Title *')).toHaveValue('Accessible apple pie')
    await expectAccessible(page)
  })

  test('recipe import', async ({ page }) => {
    await page.goto('/recipes/import')
    await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeVisible()
    await expectAccessible(page)
  })

  test('shared recipe', async ({ page, user, browser }) => {
    const recipe = await withRecipe(user)
    const res = await page.request.post(`/api/recipes/${recipe.id}/share`)
    const { share_token: token } = (await res.json()) as { share_token: string }
    const visitor = await openAs(browser, null)
    await visitor.goto(`/s/${token}`)
    await expect(visitor.getByRole('heading', { name: 'Accessible apple pie' })).toBeVisible()
    await expectAccessible(visitor)
    await visitor.context().close()
  })

  test('planner', async ({ page, user }) => {
    const recipe = await withRecipe(user)
    await planRecipe(user, recipe.id, weekDay(0))
    await planRecipe(user, null, weekDay(2), { customLabel: 'Leftovers' })
    await openPlanner(page, thisMonday())
    await expect(page.getByText('Accessible apple pie').first()).toBeVisible()
    await expectAccessible(page)
  })

  test('planner on a phone @mobile', async ({ page, user }) => {
    const recipe = await withRecipe(user)
    await planRecipe(user, recipe.id, weekDay(0))
    await openPlanner(page, thisMonday())
    await expect(page.getByText('Accessible apple pie').filter({ visible: true }).first()).toBeVisible()
    await expectAccessible(page)
  })

  test('shopping list', async ({ page, user }) => {
    await addShoppingItems(user, [
      { name: 'milk', category: 'Dairy' },
      { name: 'flour', quantity: 500, unit: 'g' },
    ])
    await page.goto('/shopping')
    await expect(page.getByText('milk')).toBeVisible()
    await expectAccessible(page)
  })

  test('shopping list from the plan', async ({ page, user }) => {
    const recipe = await withRecipe(user)
    await planRecipe(user, recipe.id, weekDay(0))
    await page.goto(`/shopping/generate?week=${thisMonday()}`)
    await expect(page.getByRole('region', { name: 'Accessible apple pie' })).toBeVisible()
    await expectAccessible(page)
  })

  test('settings', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('button', { name: 'Sunday', exact: true })).toBeVisible()
    await expectAccessible(page)
  })

  test.describe('without a household', () => {
    test.use({ household: false })

    test('onboarding', async ({ page }) => {
      await page.goto('/onboarding')
      await expect(page.getByRole('button', { name: 'English' })).toBeVisible()
      await expectAccessible(page)
    })
  })
})
