/**
 * Folds a string for loose, accent-insensitive matching: "Česnak" and
 * "cesnak" compare equal. NFD splits each accented letter into its base
 * letter plus a combining mark, and the marks are then dropped.
 */
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}
