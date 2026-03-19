// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { scrapeRecipe } from './index'

const TIMEOUT = 30_000

describe('scrapeRecipe — live integration', () => {
  it('scrapes kuchynalidla.sk', async () => {
    const { raw } = await scrapeRecipe('https://kuchynalidla.sk/recepty/segedinsky-gulas')

    expect(raw.title).toBeTruthy()
    expect(raw.rawIngredients.length).toBeGreaterThan(0)
    expect(raw.rawSteps.length).toBeGreaterThan(0)
    expect(raw.partial).toBe(false)
    expect(raw.source_url).toBe('https://kuchynalidla.sk/recepty/segedinsky-gulas')
  }, TIMEOUT)

  it('scrapes bbcgoodfood.com', async () => {
    const { raw } = await scrapeRecipe('https://www.bbcgoodfood.com/recipes/coconut-cashew-butternut-squash-curry')

    expect(raw.title).toContain('cashew')
    expect(raw.rawIngredients.length).toBeGreaterThanOrEqual(10)
    expect(raw.rawSteps.length).toBeGreaterThan(0)
    expect(raw.prep_time_min).toBe(15)
    expect(raw.cook_time_min).toBe(30)
    expect(raw.servings).toBe(4)
    expect(raw.partial).toBe(false)
  }, TIMEOUT)

  it('scrapes bbc.co.uk/food', async () => {
    const { raw } = await scrapeRecipe('https://www.bbc.co.uk/food/recipes/roasted_pepper_with_19108')

    expect(raw.title).toBeTruthy()
    expect(raw.rawIngredients.length).toBeGreaterThan(0)
    expect(raw.rawSteps.length).toBeGreaterThan(0)
    expect(raw.servings).toBe(2)
    expect(raw.partial).toBe(false)
  }, TIMEOUT)

  it('scrapes gymbeam.sk (ingredients only — site omits instructions from JSON-LD)', async () => {
    const { raw } = await scrapeRecipe('https://gymbeam.sk/blog/fitness-recept-ryzovy-nakyp-plny-bielkovin/')

    expect(raw.title).toBeTruthy()
    expect(raw.rawIngredients.length).toBeGreaterThan(0)
    // gymbeam does not include recipeInstructions in their JSON-LD
    expect(raw.rawSteps.length).toBe(0)
    expect(raw.partial).toBe(true)
  }, TIMEOUT)

  it('scrapes themediterraneandish.com', async () => {
    const { raw } = await scrapeRecipe('https://www.themediterraneandish.com/mediterranean-spicy-spinach-lentil-soup/')

    expect(raw.title).toBeTruthy()
    expect(raw.rawIngredients.length).toBeGreaterThanOrEqual(10)
    expect(raw.rawSteps.length).toBeGreaterThan(0)
    expect(raw.image_url).toBeTruthy()
    expect(raw.partial).toBe(false)
  }, TIMEOUT)
})
