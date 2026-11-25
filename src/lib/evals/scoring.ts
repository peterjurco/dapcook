// Code checks for the extract-recipe eval: no AI, deterministic.
import type { ListScore } from './types'

const VULGAR_FRACTION = /[¼-¾⅐-⅞]/

/**
 * Words of a text, compared case-, whitespace- and punctuation-insensitively.
 * Fractions are unified: "½", "1/2" and "1⁄2" all become "1 2", and "1½" reads
 * as "1 ½" so it matches "1 1/2".
 */
export function matchWords(text: string): string[] {
  return text
    .replace(new RegExp(`(\\d)(${VULGAR_FRACTION.source})`, 'g'), '$1 $2')
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/** Ingredients: the same lines in any order, each compared as a whole after normalising. */
export function scoreIngredients(expected: readonly string[], actual: readonly string[]): ListScore {
  const key = (line: string) => matchWords(line).join(' ')
  // How many output lines of each normalised form haven't been matched yet.
  const unmatched = new Map<string, number>()
  for (const line of actual) unmatched.set(key(line), (unmatched.get(key(line)) ?? 0) + 1)

  const missing = expected.filter((line) => {
    const count = unmatched.get(key(line)) ?? 0
    if (count === 0) return true
    unmatched.set(key(line), count - 1)
    return false
  })
  // Whatever is left over is extra; report it in the output's own wording.
  const extra = actual.filter((line) => {
    const count = unmatched.get(key(line)) ?? 0
    if (count === 0) return false
    unmatched.set(key(line), count - 1)
    return true
  })
  return { pass: missing.length === 0 && extra.length === 0, missing, extra }
}

/**
 * Instructions: all steps joined, compared word by word, so how the text is
 * split into steps doesn't matter (step division is judged separately).
 * Missing and extra passages come from a word-level diff.
 */
export function scoreStepCompleteness(expected: readonly string[], actual: readonly string[]): ListScore {
  const a = matchWords(expected.join(' '))
  const b = matchWords(actual.join(' '))
  if (a.length === b.length && a.every((w, i) => w === b[i])) return { pass: true, missing: [], extra: [] }

  // Longest common subsequence table over words, filled from the end.
  const cols = b.length + 1
  const lcs = new Uint32Array((a.length + 1) * cols)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * cols + j] = a[i] === b[j] ? lcs[(i + 1) * cols + j + 1] + 1 : Math.max(lcs[(i + 1) * cols + j], lcs[i * cols + j + 1])
    }
  }

  const missing: string[] = []
  const extra: string[] = []
  let gone: string[] = []
  let added: string[] = []
  const flush = () => {
    if (gone.length) missing.push(gone.join(' '))
    if (added.length) extra.push(added.join(' '))
    gone = []
    added = []
  }
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      flush()
      i++
      j++
    } else if (j < b.length && (i === a.length || lcs[i * cols + j + 1] >= lcs[(i + 1) * cols + j])) {
      added.push(b[j++])
    } else {
      gone.push(a[i++])
    }
  }
  flush()
  return { pass: false, missing, extra }
}
