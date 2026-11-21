// Checks whether lines of a reference recipe actually appear in the text the
// model was given. Spacing and punctuation are ignored: Readability often runs
// list items together ("Suroviny6 jabĺk200 g múky"), and JSON-LD can differ
// from the visible text in whitespace or quotes.
function normalize(s: string): string {
  return s.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

export interface Coverage {
  total: number
  found: number
  missing: string[]
}

/**
 * Why the article text can't be a fair test of the prompt, or null if it can.
 * Only checkable when the page has reference data (JSON-LD).
 */
export function detectInputProblem(
  articleText: string,
  reference: { source: string; data: Record<string, unknown> } | null | undefined
): string | null {
  if (!reference) return null
  const lines = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  const parts = [
    ['ingredients', coverage(lines(reference.data.rawIngredients), articleText)],
    ['steps', coverage(lines(reference.data.rawSteps), articleText)],
  ] as const
  const missing = parts
    .filter(([, c]) => c.found < c.total)
    .map(([label, c]) => `${c.total - c.found} of ${c.total} ${label}`)
  return missing.length
    ? `The article text is missing ${missing.join(' and ')} from the page's ${reference.source}.`
    : null
}

export function coverage(lines: readonly string[], text: string): Coverage {
  const haystack = normalize(text)
  const checked = lines.filter((l) => normalize(l) !== '')
  const missing = checked.filter((l) => !haystack.includes(normalize(l)))
  return { total: checked.length, found: checked.length - missing.length, missing }
}
