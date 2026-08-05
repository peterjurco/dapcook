import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { logAiUsage } from './log-usage'

export interface ExtractedRecipeContent {
  rawIngredients: string[]
  rawSteps: string[]
}

const client = new Anthropic()

export async function extractRecipeFromContent(
  articleText: string,
  sourceUrl: string,
  householdId?: string
): Promise<ExtractedRecipeContent | null> {
  // Guard: skip Claude call unless explicitly enabled
  if (process.env.RECIPE_IMPORT_USE_AI !== 'true') {
    return null
  }

  const prompt = `The text below is the main article content of a web page. Determine whether it contains a cooking recipe.

Article text:
${articleText}

Return a JSON object with EXACTLY this structure, no other text:
{
  "rawIngredients": ["2 cups flour", "1 tsp salt"],
  "rawSteps": ["Preheat the oven to 200°C.", "Mix the dry ingredients."]
}

Rules:
- rawIngredients: each element is one ingredient line, copied verbatim from the text (do not parse quantities/units, do not translate)
- rawSteps: each element is one instruction step, copied verbatim from the text (do not translate, do not merge or split steps)
- If the text is not a recipe, or has no clear ingredient list or steps, return {"rawIngredients": [], "rawSteps": []}
- Ignore unrelated content such as comments, related-post links, or navigation text`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  if (householdId) {
    void logAiUsage(createClient(), householdId, 'recipe_extract', response.usage)
  }

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error(`[extract-recipe] No JSON found in Claude response for ${sourceUrl}`)
    return null
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as { rawIngredients: string[]; rawSteps: string[] }
    const rawIngredients = (parsed.rawIngredients ?? []).map((s) => s.trim()).filter(Boolean)
    const rawSteps = (parsed.rawSteps ?? []).map((s) => s.trim()).filter(Boolean)

    if (rawIngredients.length === 0 || rawSteps.length === 0) {
      return null
    }

    return { rawIngredients, rawSteps }
  } catch (err) {
    console.error(`[extract-recipe] Failed to parse Claude JSON response for ${sourceUrl}:`, err)
    return null
  }
}
