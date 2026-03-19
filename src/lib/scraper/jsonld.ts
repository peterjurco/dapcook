import type { RecipeDraft } from '@/types/recipe'

// Parse ISO 8601 duration to minutes: PT1H30M → 90
function parseDuration(iso: string | undefined): number | null {
  if (!iso) return null
  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?/)
  if (!match) return null
  const hours = parseInt(match[1] ?? '0', 10)
  const minutes = parseInt(match[2] ?? '0', 10)
  const total = hours * 60 + minutes
  return total > 0 ? total : null
}

// Parse yield to servings number: 4, "4 servings", "Serves 2" → number
function parseYield(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'number') return Math.round(value)
  const str = String(value)
  const match = str.match(/\d+/)
  return match ? parseInt(match[0], 10) : null
}

// Extract image URL from various JSON-LD image formats
function parseImage(image: unknown): string | null {
  if (!image) return null
  if (typeof image === 'string') return image
  if (Array.isArray(image)) {
    const first = image[0]
    if (typeof first === 'string') return first
    if (first && typeof first === 'object' && 'url' in first) return String((first as Record<string, unknown>).url)
    return null
  }
  if (typeof image === 'object' && 'url' in image) {
    return String((image as Record<string, unknown>).url)
  }
  return null
}

// Extract plain text from a step (string or HowToStep or HowToSection)
function extractStepText(step: unknown): string[] {
  if (typeof step === 'string') return [step.trim()].filter(Boolean)
  if (typeof step !== 'object' || !step) return []
  const s = step as Record<string, unknown>
  // HowToSection contains itemListElement
  if (s['@type'] === 'HowToSection' && Array.isArray(s.itemListElement)) {
    return s.itemListElement.flatMap(extractStepText)
  }
  // HowToStep
  if (typeof s.text === 'string') return [s.text.trim()].filter(Boolean)
  return []
}

// Parse keywords string or array into tags
function parseTags(keywords: unknown): string[] {
  if (!keywords) return []
  const raw = Array.isArray(keywords) ? keywords.join(', ') : String(keywords)
  return raw
    .split(/[,;]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 10) // cap at 10 tags
}

// Find the Recipe object in a parsed JSON-LD value (handles arrays and @graph)
function findRecipe(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRecipe(item)
      if (found) return found
    }
    return null
  }
  const obj = data as Record<string, unknown>
  // Check @graph
  if (Array.isArray(obj['@graph'])) {
    for (const item of obj['@graph']) {
      const found = findRecipe(item)
      if (found) return found
    }
  }
  const type = obj['@type']
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) {
    return obj
  }
  return null
}

export function parseJsonLd(
  scriptContents: string[],
  sourceUrl: string
): Omit<RecipeDraft, 'ingredients' | 'steps'> & {
  rawIngredients: string[]
  rawSteps: string[]
} | null {
  for (const content of scriptContents) {
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      continue
    }
    const recipe = findRecipe(parsed)
    if (!recipe) continue

    const rawIngredients: string[] = Array.isArray(recipe.recipeIngredient)
      ? recipe.recipeIngredient.filter((x): x is string => typeof x === 'string')
      : []

    const rawSteps: string[] = Array.isArray(recipe.recipeInstructions)
      ? recipe.recipeInstructions.flatMap(extractStepText)
      : []

    return {
      title: typeof recipe.name === 'string' ? recipe.name.trim() : 'Untitled Recipe',
      description: typeof recipe.description === 'string' ? recipe.description.trim() : '',
      source_url: sourceUrl,
      image_url: parseImage(recipe.image),
      prep_time_min: parseDuration(recipe.prepTime as string | undefined),
      cook_time_min: parseDuration(recipe.cookTime as string | undefined),
      servings: parseYield(recipe.recipeYield),
      tags: parseTags(recipe.keywords),
      rawIngredients,
      rawSteps,
      partial: rawIngredients.length === 0 && rawSteps.length === 0,
    }
  }
  return null
}
