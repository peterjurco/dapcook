import type { CheerioAPI } from 'cheerio'
import type { RecipeDraft } from '@/types/recipe'

export function parseMetaFallback(
  $: CheerioAPI,
  sourceUrl: string
): Omit<RecipeDraft, 'ingredients' | 'steps'> & { rawIngredients: string[]; rawSteps: string[] } {
  const og = (name: string) =>
    $(`meta[property="og:${name}"]`).attr('content') ??
    $(`meta[name="og:${name}"]`).attr('content') ??
    null

  const title =
    og('title') ??
    $('title').first().text().trim() ??
    'Untitled Recipe'

  const description = og('description') ?? $('meta[name="description"]').attr('content') ?? ''
  const image_url = og('image') ?? null

  return {
    title,
    description,
    source_url: sourceUrl,
    image_url,
    prep_time_min: null,
    cook_time_min: null,
    servings: null,
    tags: [],
    rawIngredients: [],
    rawSteps: [],
    partial: true,
    partial_reason: 'No recipe data found — only title and image could be extracted. Please fill in the details manually.',
  }
}
