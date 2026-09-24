import type { Range } from './filters'

/**
 * The recipe list's filters as they live in its URL, so going back to the
 * list — browser back, or the recipe page's "All recipes" link — shows the
 * same filtered view. Plain `/recipes` means "apply my default view".
 */
export interface ListFilterState {
  search: string
  /** `null` = the user hasn't touched the tag selection, so the default applies. */
  tags: string[] | null
  time: Range | null
  servings: Range | null
  ingredient: string
}

// `?all=1` records "I cleared the tags myself". Without it an emptied
// selection would serialize like an untouched one and come back as the default.
const ALL = 'all'

function parseRange(raw: string | null): Range | null {
  const match = raw?.match(/^(\d*)-(\d*)$/)
  if (!match) return null
  const min = match[1] === '' ? null : Number(match[1])
  const max = match[2] === '' ? null : Number(match[2])
  return min === null && max === null ? null : { min, max }
}

function formatRange(range: Range): string {
  return `${range.min ?? ''}-${range.max ?? ''}`
}

export function parseFilterParams(params: URLSearchParams): ListFilterState {
  const tags = params.getAll('tag')
  return {
    search: params.get('q') ?? '',
    tags: tags.length > 0 ? tags : params.get(ALL) === '1' ? [] : null,
    time: parseRange(params.get('time')),
    servings: parseRange(params.get('portions')),
    ingredient: params.get('ing') ?? '',
  }
}

export function serializeFilterParams(state: ListFilterState): string {
  const params = new URLSearchParams()
  if (state.search.trim()) params.set('q', state.search)
  if (state.tags?.length === 0) params.set(ALL, '1')
  for (const tag of state.tags ?? []) params.append('tag', tag)
  if (state.time) params.set('time', formatRange(state.time))
  if (state.servings) params.set('portions', formatRange(state.servings))
  if (state.ingredient.trim()) params.set('ing', state.ingredient)
  return params.toString()
}
