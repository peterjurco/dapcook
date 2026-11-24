// @vitest-environment node
// Regression set for the text the recipe importer sends to the model: one
// synthetic page per real site where part of the recipe used to get lost (see
// recipe-pages.fixtures.ts). The JSON-LD side has its own cases in
// jsonld.test.ts (e.g. HTML entities, kuchynalidla.sk).
import { describe, it, expect } from 'vitest'
import { MAX_ARTICLE_CHARS } from '@/lib/ai/article-limits'
import { extractArticleContent } from './readability'
import { RECIPE_PAGES } from './recipe-pages.fixtures'

describe.each(RECIPE_PAGES)('$site', ({ html, ingredients, steps }) => {
  it('sends every ingredient and step to the model, each on its own line', () => {
    const text = extractArticleContent(html, 'https://example.com/recipe')!.textContent.slice(0, MAX_ARTICLE_CHARS)
    const lines = text.split('\n')
    for (const line of [...ingredients, ...steps]) {
      expect(lines).toContain(line)
    }
  })
})
