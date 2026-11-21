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

export function coverage(lines: readonly string[], text: string): Coverage {
  const haystack = normalize(text)
  const checked = lines.filter((l) => normalize(l) !== '')
  const missing = checked.filter((l) => !haystack.includes(normalize(l)))
  return { total: checked.length, found: checked.length - missing.length, missing }
}
