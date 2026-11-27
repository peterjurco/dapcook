import Anthropic from '@anthropic-ai/sdk'
import type { MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages'
import { createClient } from '@/lib/supabase/server'
import { logAiUsage } from './log-usage'
import { parseJsonFromText } from './json-response'
import { MAX_ARTICLE_CHARS } from './article-limits'

export interface ExtractedRecipeContent {
  rawIngredients: string[]
  rawSteps: string[]
}

const client = new Anthropic()

export { MAX_ARTICLE_CHARS }

/**
 * The exact request sent to Claude for a page's article text. Exported so the
 * local eval tool (/dev/evals) runs the same prompt production does.
 */
export function buildExtractRecipeRequest(articleText: string): MessageCreateParamsNonStreaming {
  const truncatedArticleText = articleText.slice(0, MAX_ARTICLE_CHARS)

  const prompt = `The text below is the main article content of a web page. Determine whether it contains a cooking recipe.

Article text:
${truncatedArticleText}

Return a JSON object with EXACTLY this structure, no other text:
{
  "rawIngredients": ["2 cups flour", "1 tsp salt"],
  "rawSteps": ["Preheat the oven to 200°C.", "Mix the dry ingredients."]
}

Rules:
- rawIngredients: each element is one ingredient line, copied verbatim from the text (do not parse quantities/units, do not translate). Keep the spelling, grammar and punctuation exactly as written, even if they look wrong
- rawIngredients must include every line of the recipe's ingredient list, including optional toppings, garnishes and serving suggestions. One element per line of the list: never split a line that names several ingredients, and never merge lines. Take rawIngredients only from the ingredient list itself: never add ingredients that are mentioned only in the steps or elsewhere in the text
- rawSteps: each element is one instruction step, copied verbatim from the text (do not translate, do not merge or split steps)
- If the text is not a recipe, or has no clear ingredient list or steps, return {"rawIngredients": [], "rawSteps": []}
- Ignore unrelated content such as comments, related-post links, or navigation text`

  return {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  }
}

/** Normalises the model's parsed JSON; null means "no usable recipe". */
export function toExtractedRecipe(value: unknown): ExtractedRecipeContent | null {
  const obj = (value ?? {}) as { rawIngredients?: unknown; rawSteps?: unknown }
  const clean = (list: unknown) =>
    Array.isArray(list)
      ? list.filter((s): s is string => typeof s === 'string').map((s) => s.trim()).filter(Boolean)
      : []
  const rawIngredients = clean(obj.rawIngredients)
  const rawSteps = clean(obj.rawSteps)

  // One list can legitimately be empty when the page splits its recipe (e.g.
  // ingredients only in JSON-LD); the caller fills the gap from other sources.
  if (rawIngredients.length === 0 && rawSteps.length === 0) {
    return null
  }

  return { rawIngredients, rawSteps }
}

export async function extractRecipeFromContent(
  articleText: string,
  sourceUrl: string,
  householdId?: string
): Promise<ExtractedRecipeContent | null> {
  // Guard: skip Claude call unless explicitly enabled
  if (process.env.RECIPE_IMPORT_USE_AI !== 'true') {
    return null
  }

  const response = await client.messages.create(buildExtractRecipeRequest(articleText))

  if (householdId) {
    void logAiUsage(await createClient(), householdId, 'recipe_extract', response.usage)
  }

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  const parsed = parseJsonFromText(text)
  if (!parsed.ok) {
    console.error(`[extract-recipe] ${parsed.error} in Claude response for ${sourceUrl}`)
    return null
  }

  return toExtractedRecipe(parsed.value)
}
