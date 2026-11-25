import type Anthropic from '@anthropic-ai/sdk'
import type { MessageCreateParamsNonStreaming as BetaRequest } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import type { DivisionScore } from './types'

export const JUDGE_MODEL = 'claude-sonnet-5-5'

/** The judge prompt for step division, as written for the dapcook evals. */
export function stepDivisionPrompt(source: string, steps: readonly string[]): string {
  return `You are reviewing how a recipe's instructions were split into steps.

A well-divided step is one stage of cooking that a cook reads and does
at once, for example "Add tomatoes, basil, salt and stir it" or "Preheat the oven to 200 degrees".

Steps are badly divided if any of these is true:
- A step contains several separate stages that a cook would do at
  different times.
- A step is only a note, tip or comment that belongs to another step.
- Steps are split so finely (for example one sentence each) that a
  single stage is spread over several steps.

Judge the logical division only. Ignore wording, typos and formatting.

Source text of the recipe:
<source>
${source}
</source>

Extracted steps:
<steps>
${steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}
</steps>

First explain your reasoning in 2-3 sentences, then give a verdict.
Answer as JSON: {"reasoning": "...", "pass": true or false}`
}

export function buildStepDivisionRequest(source: string, steps: readonly string[]): BetaRequest {
  return {
    model: JUDGE_MODEL,
    max_tokens: 16000,
    // On a safety decline, the API re-runs the request on a fallback model it
    // picks by refusal category; servedBy on the result records which one answered.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {
      effort: 'high',
      // Structured output: the reply is guaranteed to be this JSON object.
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: { reasoning: { type: 'string' }, pass: { type: 'boolean' } },
          required: ['reasoning', 'pass'],
          additionalProperties: false,
        },
      },
    },
    messages: [{ role: 'user', content: stepDivisionPrompt(source, steps) }],
  }
}

/** Asks the judge whether the steps are well divided. Failures are returned, not thrown. */
export async function judgeStepDivision(
  client: Anthropic,
  source: string,
  steps: readonly string[]
): Promise<DivisionScore & { usage?: { input_tokens: number; output_tokens: number } }> {
  try {
    const response = await client.beta.messages.create(buildStepDivisionRequest(source, steps))
    const usage = { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens }
    if (response.stop_reason === 'refusal') {
      return { status: 'error', error: 'The judge declined to answer', servedBy: response.model, usage }
    }
    const text = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('')
    const verdict = JSON.parse(text) as { reasoning: string; pass: boolean }
    return { status: verdict.pass ? 'pass' : 'fail', reasoning: verdict.reasoning, servedBy: response.model, usage }
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) }
  }
}
