export interface ScrapeErrorInfo {
  message: string
}

// Categorizes scrapeRecipe() failures into user-facing messages. The underlying
// error is always either `Failed to fetch URL: {status} {statusText}` (from a
// non-ok HTTP response) or a raw fetch/timeout error, since scrapeRecipe() doesn't
// otherwise throw.
export function categorizeScrapeError(err: unknown, t: (key: string) => string): ScrapeErrorInfo {
  const msg = err instanceof Error ? err.message : String(err)

  if (msg.includes('403') || msg.includes('429')) {
    return { message: t('scrapeBlocked') }
  }
  if (msg.includes('404')) {
    return { message: t('scrapeNotFound') }
  }
  if (msg.includes('abort') || msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
    return { message: t('scrapeTimeout') }
  }
  if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
    return { message: t('scrapeUnreachable') }
  }
  return { message: t('scrapeGeneric') }
}
