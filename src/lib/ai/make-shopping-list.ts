import Anthropic from '@anthropic-ai/sdk'
import type { ShoppingItem, ShoppingCategory } from '@/types/database'
import { createClient } from '@/lib/supabase/server'
import { logAiUsage } from './log-usage'

const client = new Anthropic()

interface SmartItem {
  name: string
  quantity: number | null
  unit: string
  category: string
  source_recipe_ids: string[]
}

interface MakeSmartResult {
  items: SmartItem[]
  newCategories: ShoppingCategory[]
}

export async function makeShoppingListSmart(
  rawItems: ShoppingItem[],
  existingCategories: ShoppingCategory[],
  householdId: string,
  preferredUnits: 'metric' | 'imperial' = 'metric',
  rules: string[] = []
): Promise<MakeSmartResult> {
  const hasCategories = existingCategories.length > 0
  const categoryNames = existingCategories.map((c) => c.name)

  const categoryInstruction = hasCategories
    ? `Use ONLY these categories (in this order): ${categoryNames.join(', ')}.`
    : `Invent 5–8 sensible grocery store categories appropriate for a home kitchen. Examples: Produce, Dairy & Eggs, Meat & Fish, Pantry, Bakery, Frozen, Drinks, Household.`

  const inputItems = rawItems.map((item) => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit ?? '',
    source_recipe_ids: item.source_recipe_ids,
  }))

  const unitSystemInstruction = preferredUnits === 'imperial'
    ? `Use imperial units throughout: oz, lb, fl oz, cups, pints, quarts, gallons, tsp, tbsp. Convert metric quantities to imperial equivalents (e.g. 500g → 1.1 lb, 250ml → 1 cup).`
    : `Use metric units throughout: g, kg, ml, l, tsp, tbsp. Convert imperial quantities to metric equivalents (e.g. 1 lb → 450g, 1 cup → 240ml).`

  const rulesSection = rules.length > 0
    ? `\nHousehold rules (must be respected):\n${rules.map((r) => `- ${r}`).join('\n')}\n`
    : ''

  const prompt = `You are a helpful kitchen assistant. You will receive a list of raw shopping items from several recipes (some may overlap or be in different languages).

Your tasks:
1. Merge duplicate ingredients (same ingredient in different quantities) by summing quantities where units are compatible.
2. Normalize all units to the preferred unit system: ${unitSystemInstruction}
3. Assign each merged item to exactly one category.
4. Keep ingredient names in their original language — do not translate.
${rulesSection}
${categoryInstruction}

Return ONLY valid JSON with this exact structure, no other text:
{
  "items": [
    {
      "name": "flour",
      "quantity": 500,
      "unit": "g",
      "category": "Pantry",
      "source_recipe_ids": ["uuid1", "uuid2"]
    }
  ],
  "categories": ["Produce", "Dairy & Eggs", "Meat & Fish", "Pantry"]
}

Rules:
- quantity: number (null if uncountable — e.g. "salt to taste" → null)
- unit: string, empty string if no unit (e.g. "2 eggs" → unit: "")
- source_recipe_ids: combine all source_recipe_ids from merged items (deduplicated)
- categories: the ordered list of all categories used. If categories were provided, return them in the same order (even unused ones). If you invented categories, return your invented list in order.
- Items within each category should be sorted alphabetically

Here are the shopping items:
${JSON.stringify(inputItems, null, 2)}`

  const response = await client.messages.create({
    model: process.env.SHOPPING_AI_MODEL ?? 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  })

  void logAiUsage(createClient(), householdId, 'shopping_smart', response.usage)

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('No JSON found in AI response')
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    items: SmartItem[]
    categories: string[]
  }

  // If AI invented new categories (no existing ones), build ShoppingCategory rows to save
  let newCategories: ShoppingCategory[] = []
  if (!hasCategories && parsed.categories?.length) {
    newCategories = parsed.categories.map((name, index) => ({
      id: crypto.randomUUID(),
      household_id: householdId,
      name,
      color: null,
      sort_order: index,
      created_at: new Date().toISOString(),
    }))
  }

  return { items: parsed.items, newCategories }
}
