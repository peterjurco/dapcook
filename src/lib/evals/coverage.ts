// Checks whether the lines of a reference recipe (the page's JSON-LD) reach the
// text the model is given. The two are often worded a little differently:
// "3/4 c." in JSON-LD vs "3/4 cup" on the page (delish.com), "3/4" vs "¾",
// "((about 2 large))" vs "(about 2 large)" (hellolittlehome.com). So a line
// counts as present when most of its words appear close together in the text,
// and an input is only flagged when a real share of a list is missing.

/** Words of a line. NFKC turns "¾" into "3⁄4", so it matches "3/4". */
function words(s: string): string[] {
  return s
    .normalize('NFKC')
    .toLowerCase()
    // Split glued letters and digits ("Suroviny6", "oil7") from older inputs.
    .replace(/(\p{L})(\p{N})/gu, '$1 $2')
    .replace(/(\p{N})(\p{L})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

function squash(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

/** Share of a line's words that must appear near each other in the text. */
const LINE_MATCH = 0.75
/** An input is flagged when less than this share of a list reaches the model. */
const LIST_MATCH = 0.9

class TextIndex {
  private positions = new Map<string, number[]>()
  readonly squashed: string

  constructor(text: string) {
    words(text).forEach((w, i) => {
      const list = this.positions.get(w)
      if (list) list.push(i)
      else this.positions.set(w, [i])
    })
    this.squashed = squash(text)
  }

  private near(word: string, at: number, span: number): boolean {
    return (this.positions.get(word) ?? []).some((p) => Math.abs(p - at) <= span)
  }

  contains(line: string): boolean {
    if (this.squashed.includes(squash(line))) return true
    const lineWords = words(line)
    if (lineWords.length < 2) return false
    const needed = Math.ceil(lineWords.length * LINE_MATCH)
    const span = lineWords.length * 2 + 4
    // Anchor on each occurrence of each of the line's words; count how many of
    // the line's words occur within reach of it.
    for (const anchorWord of new Set(lineWords)) {
      for (const at of this.positions.get(anchorWord) ?? []) {
        const hits = lineWords.filter((w) => this.near(w, at, span)).length
        if (hits >= needed) return true
      }
    }
    return false
  }
}

export interface Coverage {
  total: number
  found: number
  missing: string[]
}

export function coverage(lines: readonly string[], text: string): Coverage {
  const index = new TextIndex(text)
  const checked = lines.filter((l) => squash(l) !== '')
  const missing = checked.filter((l) => !index.contains(l))
  return { total: checked.length, found: checked.length - missing.length, missing }
}

/** Prefix of the problems detectInputProblem reports, so they can be re-checked. */
export const AUTO_PROBLEM_PREFIX = 'The article text is missing'

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
    .filter(([, c]) => c.total > 0 && c.found / c.total < LIST_MATCH)
    .map(([label, c]) => `${c.total - c.found} of ${c.total} ${label}`)
  return missing.length
    ? `${AUTO_PROBLEM_PREFIX} ${missing.join(' and ')} from the page's ${reference.source}.`
    : null
}
