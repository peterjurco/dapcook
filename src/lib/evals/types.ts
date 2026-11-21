// Data model for the local eval-dataset builder (/dev/evals).
// Each case is one input to one AI prompt; each run is one call to the model
// with that input, with a manual verdict and notes. These files are the raw
// material for automated evals later, so they keep exactly what the model saw.

export type PromptId =
  | 'extract-recipe'
  | 'parse-recipe'
  | 'suggest-tags'
  | 'transform-recipe'
  | 'make-shopping-list'

/** Judged against the input the model saw, not the original page. */
export type Verdict = 'correct' | 'incorrect'

/** What the page itself says the answer is, e.g. its JSON-LD recipe data. */
export interface EvalReference {
  source: string
  data: Record<string, unknown>
}

export interface EvalRun {
  id: string
  createdAt: string
  /** The full request sent to the Anthropic API (model, max_tokens, messages). */
  request: unknown
  /** The model's reply text, unmodified. */
  rawText: string
  /** JSON parsed from rawText, or null when it could not be parsed. */
  output: unknown
  parseError?: string
  /** Set instead of rawText/output when the API call itself failed. */
  error?: string
  stopReason?: string | null
  usage?: { input_tokens: number; output_tokens: number }
  durationMs: number
  verdict: Verdict | null
  notes: string
}

export interface EvalCase {
  id: string
  prompt: PromptId
  createdAt: string
  /** Short human label for lists, e.g. the page title. */
  label: string
  /** What the person typed in, e.g. { url }. */
  source: Record<string, unknown>
  /** What the prompt is built from: exactly what goes to the model. */
  input: Record<string, unknown>
  /** Diagnostics about how the input was produced (pipeline decisions, sizes). */
  meta: Record<string, unknown>
  /** Reference answer from the page; null = the page has none, absent = not loaded yet. */
  reference?: EvalReference | null
  /**
   * Set when the input itself is broken (e.g. Readability dropped the
   * ingredients): such a case can't tell anything about the prompt, so it is
   * not run, judged or used in evals. It's a pipeline bug report instead.
   */
  inputProblem?: string | null
  runs: EvalRun[]
}
