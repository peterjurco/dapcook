import * as cheerio from 'cheerio'
import { parseJsonLd } from './jsonld'
import { parseMetaFallback } from './meta'
import { extractArticleContent } from './readability'
import { extractRecipeFromContent } from '@/lib/ai/extract-recipe'
import type { RecipeDraft } from '@/types/recipe'

export type ScrapeResult = {
  raw: Omit<RecipeDraft, 'ingredients' | 'steps'> & {
    rawIngredients: string[]
    rawSteps: string[]
  }
  /** BCP-47 language tag from the page's <html lang> attribute, e.g. "sk", "en-US" */
  detectedLanguage?: string
}

export interface ScrapeOptions {
  /** Household id, for AI usage logging on the extraction tier. */
  householdId?: string
  /** Called right before the AI extraction call, so the caller can surface progress. */
  onExtracting?: () => void
}

export async function scrapeRecipe(url: string, options: ScrapeOptions = {}): Promise<ScrapeResult> {
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

  // Grab page language from <html lang="..."> (BCP-47, e.g. "sk", "en-US")
  const detectedLanguage = $('html').attr('lang') ?? $('html').attr('xml:lang') ?? undefined

  // Collect all JSON-LD script tag contents
  const jsonLdContents: string[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    const content = $(el).html()
    if (content) jsonLdContents.push(content)
  })

  const jsonLdResult = parseJsonLd(jsonLdContents, url)
  if (jsonLdResult && !jsonLdResult.partial) {
    return { raw: jsonLdResult, detectedLanguage }
  }

  // JSON-LD missing or incomplete — try extracting from the page's article content via AI
  // before falling back to bare meta tags.
  const base = jsonLdResult ?? parseMetaFallback($, url)

  const article = extractArticleContent(html, url)
  if (article) {
    options.onExtracting?.()
    const extracted = await extractRecipeFromContent(article.textContent, url, options.householdId)
    if (extracted) {
      return {
        raw: {
          ...base,
          rawIngredients: extracted.rawIngredients,
          rawSteps: extracted.rawSteps,
          partial: false,
          partial_reason: undefined,
        },
        detectedLanguage,
      }
    }
  }

  return { raw: base, detectedLanguage }
}
