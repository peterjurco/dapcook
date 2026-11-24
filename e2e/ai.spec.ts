import { randomUUID } from 'node:crypto'
import { test, expect, admin, createRecipe, openRecipeForm, planRecipe, thisMonday, weekDay } from './support/fixtures'
import { FAKE_RECIPE_SITE, aiPrompts } from './support/env'
import type { Page } from '@playwright/test'

// AI features against the fake Anthropic API (support/fake-services.ts). Its
// answers are deterministic: a translation appends " (<Language>)" to each text,
// unit conversion uses real factors, and `fail-ai:<feature>` / `fail-ai-once:<feature>`
// anywhere in the input makes that feature's call fail.

/** A unique suffix, so fail-once markers and prompt lookups don't collide across tests and repeats. */
const unique = () => randomUUID().slice(0, 8)

async function importFrom(page: Page, slug: string, title?: string) {
  await page.goto('/recipes/import')
  const url = `${FAKE_RECIPE_SITE}/${slug}${title ? `?title=${encodeURIComponent(title)}` : ''}`
  await page.getByPlaceholder('https://www.bbcgoodfood.com/recipes/...').fill(url)
  await page.getByRole('button', { name: 'Import', exact: true }).click()
}

async function saveRecipe(page: Page) {
  await page.getByRole('button', { name: 'Save recipe' }).click()
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/)
}

async function savedRecipe(householdId: string) {
  const { data } = await admin()
    .from('recipes')
    .select('title, tags, ingredients, steps')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  return data as {
    title: string
    tags: string[]
    ingredients: { quantity: number | null; unit: string; name: string; notes: string }[]
    steps: { text: string }[]
  }
}

const ingredientsOf = (recipe: { ingredients: { quantity: number | null; unit: string; name: string; notes: string }[] }) =>
  recipe.ingredients.map(({ quantity, unit, name, notes }) => ({ quantity, unit, name, notes }))

async function setHousehold(householdId: string, values: { translation_enabled?: boolean; preferred_language?: string; preferred_units?: 'metric' | 'imperial' }) {
  const { error } = await admin().from('households').update(values).eq('id', householdId)
  if (error) throw new Error(`e2e setup: update household: ${error.message}`)
}

test.describe('AI recipe import', () => {
  test('splits ingredients into quantity, unit and name, and suggests tags', async ({ page, user }) => {
    await createRecipe(user, { title: 'Boiled eggs', tags: ['eggs', 'dinner'] })

    await importFrom(page, 'shakshuka')
    await expect(page.getByLabel('Title *')).toHaveValue('Fake-site shakshuka')

    // "eggs" is a household tag the recipe uses; "middle eastern" would be a new one.
    const suggestions = page.getByTestId('tag-suggestions')
    await expect(suggestions.getByText('Suggested')).toBeVisible()
    await expect(suggestions.getByRole('button', { name: 'eggs', exact: true })).toBeVisible()
    await expect(suggestions.getByRole('button', { name: 'dinner' })).toHaveCount(0)
    await suggestions.getByRole('button', { name: 'middle eastern New' }).click()
    await suggestions.getByRole('button', { name: 'eggs', exact: true }).click()

    await saveRecipe(page)
    const recipe = await savedRecipe(user.householdId!)
    expect(ingredientsOf(recipe)).toEqual([
      { quantity: 4, unit: '', name: 'eggs', notes: '' },
      { quantity: 400, unit: 'g', name: 'chopped tomatoes', notes: '' },
      { quantity: 1, unit: 'tsp', name: 'cumin', notes: 'ground' },
    ])
    expect([...recipe.tags].sort()).toEqual(['eggs', 'middle eastern'])
  })

  test('reads the recipe out of a page that has no recipe data', async ({ page, user }) => {
    await importFrom(page, 'lentil-soup-blog')

    await expect(page.getByLabel('Title *')).toHaveValue("Grandma's lentil soup")
    await expect(page.getByText(/could not be extracted|No recipe data found/)).toHaveCount(0)
    await saveRecipe(page)

    await expect(page.getByText('Blend half of the soup and stir it back in.')).toBeVisible()
    const recipe = await savedRecipe(user.householdId!)
    expect(ingredientsOf(recipe)).toEqual([
      { quantity: 250, unit: 'g', name: 'red lentils', notes: '' },
      { quantity: 1, unit: 'l', name: 'vegetable stock', notes: '' },
      { quantity: 2, unit: '', name: 'carrots', notes: 'diced' },
    ])
    expect(recipe.steps.map((s) => s.text)).toEqual([
      'Rinse the lentils.',
      'Simmer everything for 25 minutes.',
      'Blend half of the soup and stir it back in.',
    ])
  })

  test('a page without a recipe imports only its title, with a warning', async ({ page }) => {
    await importFrom(page, 'travel-diary')

    await expect(page.getByLabel('Title *')).toHaveValue('Three days in Lisbon')
    await expect(page.getByText('No recipe data found — only title and image could be extracted.', { exact: false })).toBeVisible()
  })

  test('still imports, unstructured, when the AI cannot structure the ingredients', async ({ page, user }) => {
    await importFrom(page, 'shakshuka', `Shakshuka fail-ai:parse ${unique()}`)

    await expect(page.getByText('Review imported recipe')).toBeVisible()
    await saveRecipe(page)
    const recipe = await savedRecipe(user.householdId!)
    expect(recipe.ingredients.map((i) => [i.quantity, i.name])).toEqual([
      [null, '4 eggs'],
      [null, '400 g chopped tomatoes'],
      [null, '1 tsp cumin, ground'],
    ])
  })

  test('translates the recipe into the household language', async ({ page, user }) => {
    await setHousehold(user.householdId!, { translation_enabled: true, preferred_language: 'sk' })

    await importFrom(page, 'shakshuka')
    await expect(page.getByLabel('Title *')).toHaveValue('Fake-site shakshuka (Slovak)')
    await saveRecipe(page)

    await expect(page.getByText('Crack in the eggs and cover until set. (Slovak)')).toBeVisible()
    const recipe = await savedRecipe(user.householdId!)
    expect(recipe.ingredients.map((i) => i.name)).toEqual(['eggs (Slovak)', 'chopped tomatoes (Slovak)', 'cumin (Slovak)'])
  })

  test('a page already in the household language is not translated', async ({ page, user }) => {
    await setHousehold(user.householdId!, { translation_enabled: true, preferred_language: 'en' })
    const title = `Shakshuka ${unique()}`

    await importFrom(page, 'shakshuka', title)
    await expect(page.getByLabel('Title *')).toHaveValue(title)
    expect(await aiPrompts(title)).not.toContainEqual(expect.stringContaining('recipe transformation assistant'))
  })

  test("converts a recipe in cups and ounces to the household's metric units", async ({ page, user }) => {
    await importFrom(page, 'american-pancakes')
    await expect(page.getByLabel('Title *')).toHaveValue('Fluffy American pancakes')
    await saveRecipe(page)

    const recipe = await savedRecipe(user.householdId!)
    expect(ingredientsOf(recipe)).toEqual([
      { quantity: 480, unit: 'ml', name: 'flour', notes: '' },
      { quantity: 226.8, unit: 'g', name: 'milk', notes: '' },
      { quantity: 2, unit: '', name: 'eggs', notes: '' },
    ])
  })

  test('a failed translation can be retried', async ({ page, user }) => {
    await setHousehold(user.householdId!, { translation_enabled: true, preferred_language: 'sk' })
    const title = `Shakshuka fail-ai-once:transform ${unique()}`

    await importFrom(page, 'shakshuka', title)
    await expect(page.getByText('Translation failed', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Retry translation' }).click()

    await expect(page.getByText('Review imported recipe')).toBeVisible()
    await expect(page.getByLabel('Title *')).toHaveValue(`${title} (Slovak)`)
  })

  test('a recipe whose translation keeps failing can be kept as it is', async ({ page, user }) => {
    await setHousehold(user.householdId!, { translation_enabled: true, preferred_language: 'sk' })
    const title = `Shakshuka fail-ai:transform ${unique()}`

    await importFrom(page, 'shakshuka', title)
    await expect(page.getByText('Translation failed', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Retry translation' }).click()
    await expect(page.getByRole('button', { name: 'Retry translation' })).toBeEnabled()
    await expect(page.getByText('Translation failed', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Keep as-is' }).click()
    await expect(page.getByLabel('Title *')).toHaveValue(title)
    await saveRecipe(page)
    expect((await savedRecipe(user.householdId!)).title).toBe(title)
  })
})

test.describe('AI in the recipe form', () => {
  test('pasted ingredients and steps are split into fields', async ({ page, user }) => {
    await openRecipeForm(page, '/recipes/new')
    await page.getByLabel('Title *').fill('Pasted bread')

    await page.getByRole('button', { name: 'Paste text' }).first().click()
    await page.getByPlaceholder(/^200g chicken breast/).fill('500 g flour, sifted\n1/2 tsp salt\nwater')
    await page.getByRole('button', { name: 'Parse' }).click()
    await expect(page.getByPlaceholder(/^200g chicken breast/)).toHaveCount(0)

    await page.getByRole('button', { name: 'Paste text' }).last().click()
    await page.getByPlaceholder(/^1\. Preheat the oven/).fill('1. Mix everything.\n2. Bake for an hour.')
    await page.getByRole('button', { name: 'Parse' }).click()
    await expect(page.getByPlaceholder(/^1\. Preheat the oven/)).toHaveCount(0)

    await saveRecipe(page)
    const recipe = await savedRecipe(user.householdId!)
    expect(ingredientsOf(recipe)).toEqual([
      { quantity: 500, unit: 'g', name: 'flour', notes: 'sifted' },
      { quantity: 0.5, unit: 'tsp', name: 'salt', notes: '' },
      { quantity: null, unit: '', name: 'water', notes: '' },
    ])
    expect(recipe.steps.map((s) => s.text)).toEqual(['Mix everything.', 'Bake for an hour.'])
  })

  test('pasted lines are kept as written when the AI fails', async ({ page, user }) => {
    await openRecipeForm(page, '/recipes/new')
    await page.getByLabel('Title *').fill('Unparsed bread')

    await page.getByRole('button', { name: 'Paste text' }).first().click()
    await page.getByPlaceholder(/^200g chicken breast/).fill('500 g flour fail-ai:parse\n1 tsp salt')
    await page.getByRole('button', { name: 'Parse' }).click()
    await expect(page.getByPlaceholder(/^200g chicken breast/)).toHaveCount(0)

    await saveRecipe(page)
    const recipe = await savedRecipe(user.householdId!)
    expect(recipe.ingredients.map((i) => [i.quantity, i.name])).toEqual([
      [null, '500 g flour fail-ai:parse'],
      [null, '1 tsp salt'],
    ])
  })

  test('suggests tags for a recipe typed by hand', async ({ page, user }) => {
    await createRecipe(user, { title: 'Roast chicken', tags: ['chicken', 'baking'] })
    await openRecipeForm(page, '/recipes/new')
    await page.getByLabel('Title *').fill('Chicken curry')

    const suggestions = page.getByTestId('tag-suggestions')
    // Before asking the AI, the row offers the most used tags.
    await expect(suggestions.getByText('Most used')).toBeVisible()
    await page.getByPlaceholder('Type a tag and press Enter').focus()

    await expect(suggestions.getByText('Suggested')).toBeVisible()
    await expect(suggestions.getByRole('button', { name: 'chicken', exact: true })).toBeVisible()
    await expect(suggestions.getByRole('button', { name: 'baking' })).toHaveCount(0)
    await suggestions.getByRole('button', { name: 'indian New' }).click()
    await expect(page.getByRole('button', { name: 'Remove indian' })).toBeVisible()
  })
})

test.describe('AI in settings', () => {
  test('converts existing recipes to imperial units', async ({ page, user }) => {
    await createRecipe(user, { title: 'Metric muffins', ingredients: [{ quantity: 100, unit: 'g', name: 'sugar' }] })

    await page.goto('/settings')
    await page.getByRole('button', { name: 'imperial', exact: true }).click()
    await page.getByRole('button', { name: 'Convert all' }).click()
    await expect(page.getByText('1 updated.')).toBeVisible()

    expect(ingredientsOf(await savedRecipe(user.householdId!))).toEqual([{ quantity: 3.5, unit: 'oz', name: 'sugar', notes: '' }])
  })

  test('reports recipes that fail to convert', async ({ page, user }) => {
    await createRecipe(user, { title: 'Metric scones', ingredients: [{ quantity: 100, unit: 'g', name: 'flour' }] })
    await createRecipe(user, { title: 'Scones fail-ai:transform', ingredients: [{ quantity: 100, unit: 'g', name: 'flour' }] })

    await page.goto('/settings')
    await page.getByRole('button', { name: 'imperial', exact: true }).click()
    await page.getByRole('button', { name: 'Convert all' }).click()
    await expect(page.getByText('1 updated, 1 failed.')).toBeVisible()
  })

  test('translates existing recipes when the household language changes', async ({ page, user }) => {
    await createRecipe(user, { title: 'Goulash', steps: ['Brown the beef.'] })
    await setHousehold(user.householdId!, { translation_enabled: true })

    await page.goto('/settings')
    const languages = page
      .getByRole('switch', { name: 'Translate imported recipes' })
      .locator('xpath=ancestor::label/following-sibling::div//select')
    await languages.selectOption('sk')
    await expect(page.getByText('Translate your recipes to Slovak?')).toBeVisible()
    await page.getByRole('button', { name: 'Translate all' }).click()
    await expect(page.getByText('1 updated.')).toBeVisible()

    const recipe = await savedRecipe(user.householdId!)
    expect(recipe.title).toBe('Goulash (Slovak)')
    expect(recipe.steps.map((s) => s.text)).toEqual(['Brown the beef. (Slovak)'])
  })
})

test.describe('AI shopping list', () => {
  async function listItems(householdId: string) {
    const { data: list } = await admin().from('shopping_lists').select('id').eq('household_id', householdId).single()
    const { data } = await admin()
      .from('shopping_items')
      .select('name, quantity, unit')
      .eq('shopping_list_id', list!.id)
      .order('sort_order')
    return data ?? []
  }

  test('merges the same ingredient from different recipes into one item', async ({ page, user }) => {
    const pancakes = await createRecipe(user, {
      title: 'Pancakes',
      ingredients: [
        { quantity: 200, unit: 'g', name: 'flour' },
        { quantity: 2, unit: '', name: 'eggs' },
      ],
    })
    const omelette = await createRecipe(user, { title: 'Omelette', ingredients: [{ quantity: 3, unit: '', name: 'eggs' }] })
    await planRecipe(user, pancakes.id, weekDay(0))
    await planRecipe(user, omelette.id, weekDay(1))

    await page.goto(`/shopping/generate?week=${thisMonday()}`)
    await page.getByRole('button', { name: 'Add 3 items to shopping list' }).click()
    await expect(page).toHaveURL(/\/shopping$/)

    expect(await listItems(user.householdId!)).toEqual([
      { name: 'flour', quantity: 200, unit: 'g' },
      { name: 'eggs', quantity: 5, unit: null },
    ])
  })

  test("sends the household's shopping rules to the AI", async ({ page, user }) => {
    const rule = `Never buy margarine ${unique()}`
    await admin().from('shopping_rules').insert({ household_id: user.householdId!, rule })
    const recipe = await createRecipe(user, { title: 'Toast', ingredients: [{ quantity: 2, unit: '', name: 'bread slices' }] })
    await planRecipe(user, recipe.id, weekDay(0))

    await page.goto(`/shopping/generate?week=${thisMonday()}`)
    await page.getByRole('button', { name: 'Add 1 item to shopping list' }).click()
    await expect(page).toHaveURL(/\/shopping$/)

    const prompts = await aiPrompts(rule)
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toContain(`Household rules (must be respected):\n- ${rule}`)
  })

  test('explains when the AI fails, and adds nothing', async ({ page, user }) => {
    const recipe = await createRecipe(user, { title: 'Stew', ingredients: [{ quantity: 1, unit: 'kg', name: 'beef fail-ai:shopping' }] })
    await planRecipe(user, recipe.id, weekDay(0))

    await page.goto(`/shopping/generate?week=${thisMonday()}`)
    await page.getByRole('button', { name: 'Add 1 item to shopping list' }).click()

    await expect(page.getByText('Something went wrong. Please try again.')).toBeVisible()
    await expect(page).toHaveURL(/\/shopping\/generate/)
    expect(await listItems(user.householdId!)).toEqual([])
  })
})
