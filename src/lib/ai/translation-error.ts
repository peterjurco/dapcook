export interface TranslationError {
  type: 'rate_limit' | 'billing' | 'timeout' | 'unknown'
  message: string
}

export function categorizeTranslationError(err: unknown): TranslationError {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('429') || msg.includes('rate_limit')) {
    return { type: 'rate_limit', message: 'Translation rate limit reached. Please try again in a moment.' }
  }
  if (msg.includes('402') || msg.includes('credit') || msg.includes('billing') || msg.includes('permission')) {
    return { type: 'billing', message: 'Translation unavailable — API credit limit reached.' }
  }
  if (msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('ECONNRESET')) {
    return { type: 'timeout', message: 'Translation timed out. Please try again.' }
  }
  return { type: 'unknown', message: 'Translation failed unexpectedly. Please try again.' }
}
