// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockExtract } = vi.hoisted(() => ({ mockExtract: vi.fn() }))
vi.mock('@/lib/ai/extract-recipe', () => ({ extractRecipeFromContent: mockExtract }))

import { scrapeRecipe } from './index'
import { buildPostHtml, fetchWordPressPostHtml, wordPressApiCandidates } from './wordpress'

const PAGE_URL = 'https://shop.example/blog/potato-soup/'
const BLOG_API = 'https://shop.example/blog/wp-json/wp/v2/posts?slug=potato-soup&_fields=link,title,content,yoast_head'
const ROOT_API = 'https://shop.example/wp-json/wp/v2/posts?slug=potato-soup&_fields=link,title,content,yoast_head'

const POST = {
  link: PAGE_URL,
  title: { rendered: 'Potato soup with poached egg' },
  content: {
    rendered: `<p>A hearty soup with white beans and a poached egg on top, simple enough for a beginner and filling enough for dinner.</p>
<p>Ingredients:</p><ul><li>600 g potatoes</li><li>2 carrots</li><li>5 eggs</li></ul>
<p>Method:</p><p>Fry the leek in olive oil, add the carrots and potatoes and simmer in the stock until soft.</p>`,
  },
  yoast_head: `<title>Potato soup - Shop Blog</title>
<meta property="og:title" content="Potato soup with poached egg" />
<meta property="og:image" content="https://shop.example/soup.jpg" />
<script type="application/ld+json" class="yoast-schema-graph">{"@context":"https://schema.org","@graph":[{"@type":"Article","headline":"Potato soup"}]}</script>`,
}

function challenged() {
  return {
    ok: false,
    status: 403,
    statusText: 'Forbidden',
    headers: new Headers({ server: 'cloudflare', 'cf-mitigated': 'challenge' }),
    text: () => Promise.resolve('<title>Just a moment...</title>'),
  }
}

function json(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers(),
    json: () => Promise.resolve(body),
  }
}

/** Routes fetch by URL: the page itself is challenged, API endpoints answer from `api`. */
function stubFetch(api: Record<string, ReturnType<typeof json>>) {
  const fetchMock = vi.fn((input: string) =>
    Promise.resolve(input === PAGE_URL ? challenged() : api[input] ?? json({ code: 'rest_no_route' }, 404))
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('RECIPE_IMPORT_USE_AI', 'true')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('wordPressApiCandidates', () => {
  it('tries the first directory as the install path before the site root', () => {
    expect(wordPressApiCandidates(PAGE_URL)).toEqual([BLOG_API, ROOT_API])
  })

  it('only tries the site root for a top-level post URL', () => {
    expect(wordPressApiCandidates('https://shop.example/potato-soup')).toEqual([ROOT_API])
  })

  it('returns nothing for a URL without a path', () => {
    expect(wordPressApiCandidates('https://shop.example/')).toEqual([])
  })
})

describe('buildPostHtml', () => {
  it('keeps the Yoast head tags and wraps the post content in an article', () => {
    const html = buildPostHtml(POST)
    expect(html).toContain('og:image')
    expect(html).toContain('<article><h1>Potato soup with poached egg</h1>')
    expect(html).toContain('600 g potatoes')
  })

  it('falls back to a <title> from the post title without Yoast', () => {
    expect(buildPostHtml({ ...POST, yoast_head: undefined })).toContain('<title>Potato soup with poached egg</title>')
  })
})

describe('fetchWordPressPostHtml', () => {
  it('moves on to the site root when the first install path has no API', async () => {
    const fetchMock = stubFetch({ [ROOT_API]: json([POST]) })

    const html = await fetchWordPressPostHtml(PAGE_URL)

    expect(html).toContain('600 g potatoes')
    expect(fetchMock.mock.calls.map(([u]) => u)).toEqual([BLOG_API, ROOT_API])
  })

  it('picks the post whose permalink matches the page', async () => {
    const other = { ...POST, link: 'https://shop.example/blog/other/potato-soup/', content: { rendered: 'wrong' } }
    stubFetch({ [BLOG_API]: json([other, POST]) })

    expect(await fetchWordPressPostHtml(PAGE_URL)).toContain('600 g potatoes')
  })

  it('returns null when the API is challenged too', async () => {
    stubFetch({ [BLOG_API]: json({}, 403), [ROOT_API]: json({}, 403) })

    expect(await fetchWordPressPostHtml(PAGE_URL)).toBeNull()
  })

  it('returns null when no post has that slug', async () => {
    stubFetch({ [BLOG_API]: json([]) })

    expect(await fetchWordPressPostHtml(PAGE_URL)).toBeNull()
  })
})

describe('scrapeRecipe — WordPress fallback for a challenged page', () => {
  it('imports the post from the REST API, using its og tags and AI-extracted content', async () => {
    stubFetch({ [BLOG_API]: json([POST]) })
    mockExtract.mockResolvedValue({ rawIngredients: ['600 g potatoes', '2 carrots'], rawSteps: ['Simmer.'] })

    const { raw } = await scrapeRecipe(PAGE_URL)

    expect(raw.title).toBe('Potato soup with poached egg')
    expect(raw.image_url).toBe('https://shop.example/soup.jpg')
    expect(raw.rawIngredients).toEqual(['600 g potatoes', '2 carrots'])
    expect(raw.partial).toBe(false)
    expect(mockExtract.mock.calls[0][0]).toContain('600 g potatoes')
  })

  it('uses a Recipe in the Yoast schema graph without calling AI', async () => {
    const recipe = {
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Potato soup',
      recipeIngredient: ['600 g potatoes'],
      recipeInstructions: ['Simmer until soft.'],
    }
    const post = { ...POST, yoast_head: `<script type="application/ld+json">${JSON.stringify(recipe)}</script>` }
    stubFetch({ [BLOG_API]: json([post]) })

    const { raw } = await scrapeRecipe(PAGE_URL)

    expect(raw.rawIngredients).toEqual(['600 g potatoes'])
    expect(mockExtract).not.toHaveBeenCalled()
  })

  it('still throws the original error when the fallback finds nothing', async () => {
    stubFetch({})

    await expect(scrapeRecipe(PAGE_URL)).rejects.toThrow('Failed to fetch URL: 403 Forbidden')
  })

  it('does not try the API for a 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 404, statusText: 'Not Found', headers: new Headers(), text: () => Promise.resolve(''),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(scrapeRecipe(PAGE_URL)).rejects.toThrow('404')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
