import { decodeHTMLStrict } from 'entities'
import type { RecipeDraft } from '@/types/recipe'

// Some sites HTML-escape the text inside their JSON-LD (kuchynalidla.sk:
// "180 &deg;C", "nakr&aacute;jan&yacute;"). Decode every HTML entity, not a
// hand-picked list: a missed one (e.g. &deg;) used to reach the recipe as-is.
// Strict mode only decodes entities with their closing ";", so plain text like
// "salt&pepper" is left alone. Non-breaking spaces become plain spaces, so
// "200&nbsp;g" parses like "200 g".
function decodeHtmlEntities(str: string): string {
  return decodeHTMLStrict(str).replace(/\u00a0/g, ' ')
}

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

// Escape bare control characters (CR, LF, TAB, etc.) that appear inside JSON
// string values — some sites emit invalid JSON with literal newlines in strings.
function sanitizeJsonControlChars(input: string): string {
  let inString = false
  let escaped = false
  let result = ''
  for (const char of input) {
    if (escaped) { result += char; escaped = false; continue }
    if (char === '\\' && inString) { escaped = true; result += char; continue }
    if (char === '"') { inString = !inString; result += char; continue }
    if (inString) {
      const code = char.charCodeAt(0)
      if (code < 0x20) {
        if (code === 0x0a) result += '\\n'
        else if (code === 0x0d) result += '\\r'
        else if (code === 0x09) result += '\\t'
        else result += `\\u${code.toString(16).padStart(4, '0')}`
        continue
      }
    }
    result += char
  }
  return result
}

function tryParseJson(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    try {
      return JSON.parse(sanitizeJsonControlChars(content))
    } catch {
      return null
    }
  }
}

export function parseJsonLd(
  scriptContents: string[],
  sourceUrl: string
): Omit<RecipeDraft, 'ingredients' | 'steps'> & {
  rawIngredients: string[]
  rawSteps: string[]
} | null {
  for (const content of scriptContents) {
    const parsed = tryParseJson(content)
    if (!parsed) continue
    const recipe = findRecipe(parsed)
    if (!recipe) continue

    // recipeIngredient: standard = string[], non-standard = newline-delimited string
    let rawIngredients: string[] = []
    if (Array.isArray(recipe.recipeIngredient)) {
      rawIngredients = recipe.recipeIngredient
        .filter((x): x is string => typeof x === 'string')
        .map((s) => decodeHtmlEntities(s).trim())
        .filter(Boolean)
    } else if (typeof recipe.recipeIngredient === 'string') {
      rawIngredients = recipe.recipeIngredient
        .split(/[\r\n]+/)
        .map((s) => decodeHtmlEntities(s.replace(/^\t+/, '')).trim())
        .filter((s) => s.length > 1)
    }

    // recipeInstructions: standard = HowToStep[], non-standard = plain string
    let rawSteps: string[] = []
    if (Array.isArray(recipe.recipeInstructions)) {
      rawSteps = recipe.recipeInstructions
        .flatMap(extractStepText)
        .map((s) => decodeHtmlEntities(s))
    } else if (typeof recipe.recipeInstructions === 'string') {
      rawSteps = recipe.recipeInstructions
        .split(/\r?\n\r?\n+/)
        .map((s) => decodeHtmlEntities(s.replace(/^\s+|\s+$/g, '')))
        .filter((s) => s.length > 10)
    }

    return {
      title: typeof recipe.name === 'string' ? decodeHtmlEntities(recipe.name).trim() : 'Untitled Recipe',
      description: typeof recipe.description === 'string' ? decodeHtmlEntities(recipe.description).trim() : '',
      source_url: sourceUrl,
      image_url: parseImage(recipe.image),
      prep_time_min: parseDuration(recipe.prepTime as string | undefined),
      cook_time_min: parseDuration(recipe.cookTime as string | undefined),
      servings: parseYield(recipe.recipeYield),
      tags: parseTags(recipe.keywords),
      rawIngredients,
      rawSteps,
      partial: rawIngredients.length === 0 || rawSteps.length === 0,
    }
  }
  return null
}
