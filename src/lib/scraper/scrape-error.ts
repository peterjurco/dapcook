export interface ScrapeErrorInfo {
  message: string
}

// Categorizes scrapeRecipe() failures into user-facing messages. The underlying
// error is always either `Failed to fetch URL: {status} {statusText}` (from a
// non-ok HTTP response) or a raw fetch/timeout error, since scrapeRecipe() doesn't
// otherwise throw.
export function categorizeScrapeError(err: unknown): ScrapeErrorInfo {
  const msg = err instanceof Error ? err.message : String(err)

  if (msg.includes('403') || msg.includes('429')) {
    return { message: 'This site is blocking automated imports. Try adding the recipe manually instead.' }
  }
  if (msg.includes('404')) {
    return { message: "That page couldn't be found. Double-check the URL." }
  }
  if (msg.includes('abort') || msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
    return { message: 'That page took too long to respond. Try again, or add the recipe manually.' }
  }
  if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
    return { message: "Couldn't reach that page. Check the URL, or add the recipe manually." }
  }
  return { message: 'Could not import this recipe automatically. Try adding it manually instead.' }
}
