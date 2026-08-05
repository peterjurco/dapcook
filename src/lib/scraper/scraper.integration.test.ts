// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { scrapeRecipe } from './index'

const TIMEOUT = 30_000

// Only used by the mocked-network test below (see that describe block) — the
// Anthropic SDK is mocked file-wide here, but it is never touched by the live-site
// tests since RECIPE_IMPORT_USE_AI is 'false' in the test environment (.env.local),
// so their fetches always resolve via the JSON-LD tier before the AI tier is reached.
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function () {
    return { messages: { create: mockCreate } }
  }),
}))

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

// This fixture-based test is fully deterministic — it stubs `fetch` with a static
// HTML fixture and mocks only the Anthropic SDK call, so it never touches the
// network. It still exercises the REAL `extractArticleContent` (Readability/jsdom
// parsing of the fixture below) and the REAL `extractRecipeFromContent` (real
// prompt construction, real JSON-response parsing) — everything in the AI
// extraction tier except the actual Anthropic network call. `fetch`/env stubs are
// scoped to this describe block's own afterEach so the live-site tests above keep
// using the real global `fetch`.
describe('scrapeRecipe — AI extraction tier (mocked network + Anthropic)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  const URL = 'https://example.com/no-json-ld-blog-post'

  const NO_JSONLD_ARTICLE_HTML = `
<!DOCTYPE html>
<html lang="en">
<head><title>My Weeknight Lentil Soup</title>
<meta property="og:image" content="https://example.com/lentil-soup.jpg" />
</head>
<body>
<article>
<h1>My Weeknight Lentil Soup</h1>
<p>This lentil soup has been my go-to weeknight dinner for years now, ever since a
friend shared her family's version with me on a cold winter evening when we needed
something warm and filling after a long day at work.</p>
<h2>Ingredients</h2>
<ul>
<li>1 cup dried green lentils</li>
<li>1 diced yellow onion</li>
<li>2 cloves garlic, minced</li>
<li>4 cups vegetable broth</li>
</ul>
<h2>Instructions</h2>
<ol>
<li>Saute the onion and garlic in a large pot until soft.</li>
<li>Add the lentils and broth, then simmer for 25 minutes until tender.</li>
</ol>
</article>
</body></html>
`

  it('extracts recipe via AI tier from a page with no JSON-LD (mocked network + Anthropic)', async () => {
    vi.stubEnv('RECIPE_IMPORT_USE_AI', 'true')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(NO_JSONLD_ARTICLE_HTML),
      })
    )

    const expectedIngredients = [
      '1 cup dried green lentils',
      '1 diced yellow onion',
      '2 cloves garlic, minced',
      '4 cups vegetable broth',
    ]
    const expectedSteps = [
      'Saute the onion and garlic in a large pot until soft.',
      'Add the lentils and broth, then simmer for 25 minutes until tender.',
    ]

    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ rawIngredients: expectedIngredients, rawSteps: expectedSteps }),
        },
      ],
      usage: { input_tokens: 120, output_tokens: 60 },
    })

    const { raw } = await scrapeRecipe(URL)

    expect(raw.partial).toBe(false)
    expect(raw.rawIngredients).toEqual(expectedIngredients)
    expect(raw.rawSteps).toEqual(expectedSteps)
    expect(mockCreate).toHaveBeenCalledOnce()
  })
})
