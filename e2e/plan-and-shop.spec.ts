import { test, expect, createRecipe, planRecipe, today } from './support/fixtures'

test.describe('Planning and shopping', () => {
  test('adds a recipe to this week and sees it on the planner', async ({ page, user }) => {
    const recipe = await createRecipe(user, { title: 'Sunday roast' })

    await page.goto(`/recipes/${recipe.id}`)
    await page.getByRole('button', { name: 'Add to Plan' }).click()
    await page.getByRole('button', { name: 'This week' }).click()
    // The picker's confirm button, e.g. "Add to Monday 23 Nov".
    await page.getByRole('button', { name: /^Add to \w+day \d+/ }).click()
    await expect(page.getByText(/^Added to /)).toBeVisible()

    await page.getByRole('button', { name: 'View plan' }).click()
    await expect(page).toHaveURL(/\/planner/)
    await expect(page.getByText('Sunday roast').first()).toBeVisible()
  })

  test("turns this week's plan into a shopping list", async ({ page, user }) => {
    const recipe = await createRecipe(user, {
      title: 'Pancakes',
      servings: 2,
      ingredients: [
        { quantity: 200, unit: 'g', name: 'flour' },
        { quantity: 2, unit: '', name: 'eggs' },
      ],
    })
    await planRecipe(user, recipe.id, today())

    await page.goto(`/shopping/generate?week=${today()}`)
    await expect(page.getByText('Pancakes')).toBeVisible()
    await page.getByRole('button', { name: 'Add 2 items to shopping list' }).click()

    await expect(page).toHaveURL(/\/shopping$/)
    await expect(page.getByText('flour')).toBeVisible()
    await expect(page.getByText('eggs')).toBeVisible()
  })
})
