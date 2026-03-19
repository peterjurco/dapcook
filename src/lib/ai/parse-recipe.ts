import Anthropic from '@anthropic-ai/sdk'
import type { Ingredient, Step } from '@/types/recipe'

const client = new Anthropic()

interface ParseResult {
  ingredients: Ingredient[]
  steps: Step[]
}

// Fallback when AI is disabled: store raw strings without parsing
function rawFallback(rawIngredients: string[], rawSteps: string[]): ParseResult {
  return {
    ingredients: rawIngredients.map((raw) => ({
      id: crypto.randomUUID(),
      quantity: null,
      unit: '',
      name: raw.trim(),
      notes: '',
    })),
    steps: rawSteps.map((text, i) => ({
      id: crypto.randomUUID(),
      order: i + 1,
      text: text.trim(),
    })),
  }
}

export async function parseRecipeData(
  rawIngredients: string[],
  rawSteps: string[]
): Promise<ParseResult> {
  // Guard: skip Claude call unless explicitly enabled
  if (process.env.RECIPE_IMPORT_USE_AI !== 'true') {
    return rawFallback(rawIngredients, rawSteps)
  }

  if (rawIngredients.length === 0 && rawSteps.length === 0) {
    return { ingredients: [], steps: [] }
  }

  const prompt = `Parse this recipe data into structured JSON.

Raw ingredients (one per line):
${rawIngredients.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Raw steps (one per line):
${rawSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Return a JSON object with EXACTLY this structure, no other text:
{
  "ingredients": [
    {
      "quantity": 200,
      "unit": "g",
      "name": "chicken breast",
      "notes": "sliced"
    }
  ],
  "steps": [
    {
      "order": 1,
      "text": "Preheat the oven to 200°C."
    }
  ]
}

Rules:
- quantity: number (null if none — e.g. "salt to taste" → null)
- unit: string, empty string if no unit (e.g. "2 eggs" → quantity: 2, unit: "")
- name: the ingredient without quantity/unit/prep notes
- notes: preparation notes like "finely chopped", "to serve", "optional" (empty string if none)
- steps: clean up whitespace but preserve the full instruction text
- Handle mixed languages (Slovak, English, etc.) — do not translate, keep original language`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  // Extract JSON from response (handles markdown code blocks too)
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error('[parse-recipe] No JSON found in Claude response, falling back to raw')
    return rawFallback(rawIngredients, rawSteps)
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      ingredients: Array<{ quantity: number | null; unit: string; name: string; notes: string }>
      steps: Array<{ order: number; text: string }>
    }

    return {
      ingredients: parsed.ingredients.map((ing) => ({
        id: crypto.randomUUID(),
        quantity: ing.quantity ?? null,
        unit: ing.unit ?? '',
        name: ing.name ?? '',
        notes: ing.notes ?? '',
      })),
      steps: parsed.steps.map((step, i) => ({
        id: crypto.randomUUID(),
        order: step.order ?? i + 1,
        text: step.text ?? '',
      })),
    }
  } catch (err) {
    console.error('[parse-recipe] Failed to parse Claude JSON response:', err)
    return rawFallback(rawIngredients, rawSteps)
  }
}
