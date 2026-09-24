/**
 * The recipe list's last URL, including its filter query, for the recipe
 * page's "All recipes" link. Session-scoped on purpose: it is "take me back
 * to what I was browsing", not a lasting preference — that is the saved
 * default view's job. The bottom-nav tab ignores it and opens plain /recipes.
 */
const KEY = 'dapcook:recipe-list-url'
const FALLBACK = '/recipes'

export function rememberListUrl(url: string) {
  try {
    sessionStorage.setItem(KEY, url)
  } catch {
    // Storage blocked (private mode, disabled site data): the link falls back.
  }
}

export function recallListUrl(): string {
  try {
    const url = sessionStorage.getItem(KEY)
    // Only ever the list itself, so a tampered value can't redirect elsewhere.
    if (url && (url === FALLBACK || url.startsWith(`${FALLBACK}?`))) return url
  } catch {
    // Same as above.
  }
  return FALLBACK
}
