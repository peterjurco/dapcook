import * as cheerio from 'cheerio'
import { parseJsonLd } from './jsonld'
import { parseMetaFallback } from './meta'
import type { RecipeDraft } from '@/types/recipe'

export type ScrapeResult = {
  raw: Omit<RecipeDraft, 'ingredients' | 'steps'> & {
    rawIngredients: string[]
    rawSteps: string[]
  }
}

export async function scrapeRecipe(url: string): Promise<ScrapeResult> {
  const response = await fetch(url, {
    headers: {
      // Mimic a real browser to avoid blocks
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`)
  }

  const html = await response.text()
  const $ = cheerio.load(html)

  // Collect all JSON-LD script tag contents
  const jsonLdContents: string[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    const content = $(el).html()
    if (content) jsonLdContents.push(content)
  })

  const jsonLdResult = parseJsonLd(jsonLdContents, url)
  if (jsonLdResult) {
    return { raw: jsonLdResult }
  }

  // Fall back to OG/meta tags
  return { raw: parseMetaFallback($, url) }
}
