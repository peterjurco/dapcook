// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockExtract } = vi.hoisted(() => ({ mockExtract: vi.fn() }))
vi.mock('@/lib/ai/extract-recipe', () => ({ extractRecipeFromContent: mockExtract }))

import { scrapeRecipe } from './index'

const URL = 'https://example.com/recipe'

const COMPLETE_JSONLD_HTML = `
<!DOCTYPE html>
<html lang="en"><head>
<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Test Cake',
  recipeIngredient: ['200g flour', '2 eggs'],
  recipeInstructions: ['Mix ingredients', 'Bake at 180C for 30 minutes'],
})}
</script>
</head><body></body></html>
`

const ARTICLE_ONLY_HTML = `
<!DOCTYPE html>
<html lang="en">
<head><title>Grandma's Apple Pie</title>
<meta property="og:image" content="https://example.com/pie.jpg" />
</head>
<body>
<article>
<h1>Grandma's Apple Pie</h1>
<p>This is my grandmother's classic apple pie recipe, passed down for three generations in our family and beloved at every holiday gathering we host each year without fail.</p>
<h2>Ingredients</h2>
<ul>
<li>6 cups thinly sliced apples</li>
<li>3/4 cup white sugar</li>
</ul>
<h2>Instructions</h2>
<ol>
<li>Preheat oven to 425 degrees F.</li>
<li>Bake for 45 minutes, or until golden brown.</li>
</ol>
</article>
</body></html>
`

const PARTIAL_JSONLD_HTML = `
<!DOCTYPE html>
<html lang="en"><head>
<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Rice Bake',
  image: 'https://example.com/rice.jpg',
  recipeIngredient: ['1 cup rice', '2 cups water'],
})}
</script>
</head><body>
<article>
<h1>Rice Bake</h1>
<p>A protein-packed rice bake that comes together in under an hour and works well for meal prep throughout the busy week ahead.</p>
<h2>Instructions</h2>
<ol>
<li>Cook the rice according to package instructions.</li>
<li>Mix with the remaining ingredients and bake for 20 minutes.</li>
</ol>
</article>
</body></html>
`

const NO_ARTICLE_HTML = `
<!DOCTYPE html>
<html lang="en"><head><title>Category Page</title></head>
<body><nav><a href="/">Home</a></nav></body></html>
`

function mockFetch(html: string) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: () => Promise.resolve(html),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('scrapeRecipe — extraction tier', () => {
  it('returns JSON-LD result unchanged and skips AI extraction when JSON-LD is complete', async () => {
    mockFetch(COMPLETE_JSONLD_HTML)

    const { raw } = await scrapeRecipe(URL)

    expect(raw.partial).toBe(false)
    expect(raw.rawIngredients).toEqual(['200g flour', '2 eggs'])
    expect(mockExtract).not.toHaveBeenCalled()
  })

  it('falls back to meta tags without calling AI when Readability finds no article', async () => {
    mockFetch(NO_ARTICLE_HTML)

    const { raw } = await scrapeRecipe(URL)

    expect(raw.partial).toBe(true)
    expect(mockExtract).not.toHaveBeenCalled()
  })

  it('uses AI-extracted ingredients/steps when no JSON-LD is present', async () => {
    mockFetch(ARTICLE_ONLY_HTML)
    mockExtract.mockResolvedValue({
      rawIngredients: ['6 cups thinly sliced apples', '3/4 cup white sugar'],
      rawSteps: ['Preheat oven to 425 degrees F.', 'Bake for 45 minutes, or until golden brown.'],
    })

    const { raw } = await scrapeRecipe(URL)

    expect(raw.partial).toBe(false)
    expect(raw.rawIngredients).toEqual(['6 cups thinly sliced apples', '3/4 cup white sugar'])
    expect(raw.rawSteps).toEqual(['Preheat oven to 425 degrees F.', 'Bake for 45 minutes, or until golden brown.'])
    expect(raw.image_url).toBe('https://example.com/pie.jpg')
  })

  it('replaces both raw arrays with AI results when JSON-LD is only partially populated', async () => {
    mockFetch(PARTIAL_JSONLD_HTML)
    mockExtract.mockResolvedValue({
      rawIngredients: ['1 cup rice', '2 cups water'],
      rawSteps: ['Cook the rice according to package instructions.', 'Mix with the remaining ingredients and bake for 20 minutes.'],
    })

    const { raw } = await scrapeRecipe(URL)

    expect(raw.partial).toBe(false)
    expect(raw.title).toBe('Rice Bake')
    expect(raw.image_url).toBe('https://example.com/rice.jpg')
    expect(raw.rawSteps.length).toBe(2)
  })

  it('falls back to base (partial) result when AI extraction returns null', async () => {
    mockFetch(ARTICLE_ONLY_HTML)
    mockExtract.mockResolvedValue(null)

    const { raw } = await scrapeRecipe(URL)

    expect(raw.partial).toBe(true)
    expect(raw.rawIngredients).toEqual([])
  })

  it('calls onExtracting only when the AI extraction tier actually runs', async () => {
    mockFetch(ARTICLE_ONLY_HTML)
    mockExtract.mockResolvedValue({ rawIngredients: ['x'], rawSteps: ['y'] })
    const onExtracting = vi.fn()

    await scrapeRecipe(URL, { onExtracting })

    expect(onExtracting).toHaveBeenCalledOnce()
  })

  it('passes householdId through to extractRecipeFromContent', async () => {
    mockFetch(ARTICLE_ONLY_HTML)
    mockExtract.mockResolvedValue({ rawIngredients: ['x'], rawSteps: ['y'] })

    await scrapeRecipe(URL, { householdId: 'hh-1' })

    expect(mockExtract).toHaveBeenCalledWith(expect.any(String), URL, 'hh-1')
  })
})
