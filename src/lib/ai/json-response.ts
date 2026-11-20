export type ParsedJson = { ok: true; value: unknown } | { ok: false; error: string }

/**
 * Pulls the outermost `{...}` block out of a model reply and parses it.
 * Models sometimes wrap JSON in prose or a code fence; this tolerates both.
 */
export function parseJsonFromText(text: string): ParsedJson {
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return { ok: false, error: 'No JSON found' }
  try {
    return { ok: true, value: JSON.parse(jsonMatch[0]) }
  } catch (err) {
    return { ok: false, error: `Malformed JSON: ${err instanceof Error ? err.message : String(err)}` }
  }
}
