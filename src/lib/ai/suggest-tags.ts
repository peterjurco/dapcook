import { LANGUAGE_NAMES } from '@/lib/constants/languages'
import type { TagSuggestions } from '@/types/recipe'

export const MAX_EXISTING_SUGGESTIONS = 8

export const EMPTY_TAG_SUGGESTIONS: TagSuggestions = { existing: [], new: null }

export interface TagPromptContext {
  householdTags: readonly string[]
  /** Household `preferred_language` code, e.g. "sk". */
  language: string
}

function clean(tag: string): string {
  return tag.trim().toLowerCase()
}

/**
 * Prompt rules for the `existing` / `new` fields. Shared by the standalone
 * suggestion call and the recipe-parse call, which describe the surrounding
 * JSON shape themselves.
 */
export function tagSuggestionRules({ householdTags, language }: TagPromptContext): string {
  const languageName = LANGUAGE_NAMES[language] ?? language
  const list = householdTags.length > 0 ? householdTags.map((tag) => `"${tag}"`).join(', ') : '(none yet)'
  return `Tag suggestion rules:
- The household already uses these tags: ${list}
- "existing": up to ${MAX_EXISTING_SUGGESTIONS} tags copied exactly from that list that genuinely fit this recipe, best fit first. An empty array is fine.
- "new": at most ONE tag that is not in that list, or null. Only suggest one when the recipe obviously belongs to a cuisine (e.g. italian for carbonara, mexican for burrito) or a dish type (e.g. dessert, soup) and no listed tag already covers it. Never suggest dietary, health, difficulty or occasion tags (e.g. low-fat, healthy, easy, party) as new. Write it in ${languageName}, lowercase, in the same style as the listed tags. When in doubt, use null.`
}

/**
 * Enforces the suggestion rules in code, whatever the model returned:
 * existing tags must be household tags (max 8), the new tag must not be one,
 * and there is at most one new tag.
 */
export function sanitizeTagSuggestions(raw: unknown, householdTags: readonly string[]): TagSuggestions {
  if (!raw || typeof raw !== 'object') return EMPTY_TAG_SUGGESTIONS
  const { existing, new: newTag } = raw as { existing?: unknown; new?: unknown }
  if (!Array.isArray(existing)) return EMPTY_TAG_SUGGESTIONS

  const known = new Set(householdTags.map(clean))
  const picked: string[] = []
  for (const item of existing) {
    if (picked.length === MAX_EXISTING_SUGGESTIONS) break
    if (typeof item !== 'string') continue
    const tag = clean(item)
    if (known.has(tag) && !picked.includes(tag)) picked.push(tag)
  }

  const candidate = Array.isArray(newTag) ? newTag[0] : newTag
  const cleanedNew = typeof candidate === 'string' ? clean(candidate) : ''

  return { existing: picked, new: cleanedNew && !known.has(cleanedNew) ? cleanedNew : null }
}
