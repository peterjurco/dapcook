import type { PromptId } from './types'

export interface PromptInfo {
  id: PromptId
  title: string
  description: string
  /** Source file of the prompt, for reference. */
  file: string
  /** Whether the eval tool can create inputs and run this prompt yet. */
  ready: boolean
}

export const PROMPTS: PromptInfo[] = [
  {
    id: 'extract-recipe',
    title: 'Extract recipe from page',
    description:
      'Fetches a page, runs it through Readability, and asks the model for the verbatim ingredient lines and steps.',
    file: 'src/lib/ai/extract-recipe.ts',
    ready: true,
  },
  {
    id: 'parse-recipe',
    title: 'Parse ingredients & steps',
    description: 'Turns raw ingredient and step lines into structured ingredients, plus tag suggestions.',
    file: 'src/lib/ai/parse-recipe.ts',
    ready: false,
  },
  {
    id: 'suggest-tags',
    title: 'Suggest tags',
    description: 'Suggests existing and new household tags for a recipe.',
    file: 'src/lib/ai/suggest-tags.ts',
    ready: false,
  },
  {
    id: 'transform-recipe',
    title: 'Translate / convert units',
    description: 'Translates a recipe and/or converts it between metric and imperial.',
    file: 'src/lib/ai/transform-recipe.ts',
    ready: false,
  },
  {
    id: 'make-shopping-list',
    title: 'Make shopping list smarter',
    description: 'Merges and categorises shopping-list items.',
    file: 'src/lib/ai/make-shopping-list.ts',
    ready: false,
  },
]

export function getPromptInfo(id: string): PromptInfo | undefined {
  return PROMPTS.find((p) => p.id === id)
}
