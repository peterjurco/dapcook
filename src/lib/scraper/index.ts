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

/** Fetches a recipe page's HTML the way the importer does; throws on a non-2xx response. */
export async function fetchPageHtml(url: string): Promise<string> {
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
    // Diagnostic logging for blocked/failed fetches (e.g. Cloudflare bot protection
    // rejecting Vercel's serverless IP) — visible in Vercel's function logs, since we
    // can't otherwise tell a WAF/anti-bot block apart from an origin-side 403/404 etc.
    const bodySnippet = await response.text().catch(() => '')
    console.error(`[scraper] Fetch failed for ${url}: ${response.status} ${response.statusText}`, {
      server: response.headers.get('server'),
      cfRay: response.headers.get('cf-ray'),
      cfMitigated: response.headers.get('cf-mitigated'),
      bodySnippet: bodySnippet.slice(0, 500),
    })
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`)
  }

  return response.text()
}

/** Collects the contents of every JSON-LD script tag on the page. */
export function collectJsonLd($: cheerio.CheerioAPI): string[] {
  const jsonLdContents: string[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    const content = $(el).html()
    if (content) jsonLdContents.push(content)
  })
  return jsonLdContents
}

export async function scrapeRecipe(url: string, options: ScrapeOptions = {}): Promise<ScrapeResult> {
  const html = await fetchPageHtml(url)
  const $ = cheerio.load(html)

  // Grab page language from <html lang="..."> (BCP-47, e.g. "sk", "en-US")
  const detectedLanguage = $('html').attr('lang') ?? $('html').attr('xml:lang') ?? undefined

  const jsonLdResult = parseJsonLd(collectJsonLd($), url)
  if (jsonLdResult && !jsonLdResult.partial) {
    return { raw: jsonLdResult, detectedLanguage }
  }

  // JSON-LD missing or incomplete — try extracting from the page's article content via AI
  // before falling back to bare meta tags.
  const base = jsonLdResult ?? parseMetaFallback($, url)

  if (process.env.RECIPE_IMPORT_USE_AI === 'true') {
    const article = extractArticleContent(html, url)
    if (article) {
      options.onExtracting?.()
      try {
        const extracted = await extractRecipeFromContent(article.textContent, url, options.householdId)
        if (extracted) {
          // Prefer what the model read from the page, but keep a list the page's
          // own data already had when the model came back without it (gymbeam.sk:
          // JSON-LD has the ingredients but no steps).
          const rawIngredients = extracted.rawIngredients.length ? extracted.rawIngredients : base.rawIngredients
          const rawSteps = extracted.rawSteps.length ? extracted.rawSteps : base.rawSteps
          const partial = rawIngredients.length === 0 || rawSteps.length === 0
          return {
            raw: {
              ...base,
              rawIngredients,
              rawSteps,
              partial,
              // The base reason ("only title and image") no longer holds once the
              // model added something; the form falls back to its generic warning.
              partial_reason: undefined,
            },
            detectedLanguage,
          }
        }
      } catch (err) {
        console.error(`[scraper] AI extraction failed for ${url}:`, err)
      }
    }
  }

  return { raw: base, detectedLanguage }
}
