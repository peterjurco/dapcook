import Anthropic from '@anthropic-ai/sdk'
import type { Ingredient, Step } from '@/types/recipe'
import { createClient } from '@/lib/supabase/server'
import { logAiUsage } from './log-usage'
import { LANGUAGE_NAMES } from '@/lib/constants/languages'

export interface RecipeContent {
  title: string
  description: string | null
  ingredients: Ingredient[]
  steps: Step[]
  notes: string | null
}

interface TransformOptions {
  targetLanguage?: string
  targetUnits?: 'metric' | 'imperial'
}

const client = new Anthropic()

export async function transformRecipe(
  content: RecipeContent,
  options: TransformOptions,
  householdId: string | undefined
): Promise<RecipeContent> {
  const { targetLanguage, targetUnits } = options

  // Short-circuit: nothing to do
  const needsTranslation = targetLanguage && targetLanguage !== 'en'
  const needsUnitConversion = targetUnits && targetUnits !== 'metric'
  if (!needsTranslation && !needsUnitConversion) {
    return content
  }

  const instructions: string[] = []
  if (needsTranslation) {
    const langName = LANGUAGE_NAMES[targetLanguage] ?? targetLanguage
    instructions.push(`Translate all text fields to ${langName}.`)
  }
  if (needsUnitConversion) {
    instructions.push(
      `Convert all quantities to ${targetUnits} units (e.g. ${
        targetUnits === 'imperial'
          ? 'oz, lb, fl oz, cups, pints, tsp, tbsp'
          : 'g, kg, ml, l, tsp, tbsp'
      }).`
    )
  }

  const prompt = `You are a recipe transformation assistant.

${instructions.join(' ')} Return the same JSON structure with ONLY the specified fields changed. Do not add or remove any fields. Leave these fields EXACTLY as-is: id fields, order fields, source_url, image_url, prep_time_min, cook_time_min, servings, tags, partial.

Recipe JSON:
${JSON.stringify(content, null, 2)}

Return ONLY valid JSON matching the exact same structure. No other text.`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  })

  if (householdId) {
    void logAiUsage(createClient(), householdId, 'recipe_transform', response.usage)
  }

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error('[transform-recipe] No JSON in AI response, returning original')
    return content
  }

  let parsed: RecipeContent
  try {
    parsed = JSON.parse(jsonMatch[0]) as RecipeContent
  } catch {
    console.error('[transform-recipe] Failed to parse AI JSON, returning original')
    return content
  }

  // Re-inject original ids/order that AI must not change (defensive)
  return {
    ...parsed,
    ingredients: (parsed.ingredients ?? content.ingredients).map((ing, i) => ({
      ...ing,
      id: content.ingredients[i]?.id ?? ing.id ?? crypto.randomUUID(),
    })),
    steps: (parsed.steps ?? content.steps).map((step, i) => ({
      ...step,
      id: content.steps[i]?.id ?? step.id ?? crypto.randomUUID(),
      order: content.steps[i]?.order ?? step.order ?? i + 1,
    })),
  }
}
