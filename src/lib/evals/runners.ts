import Anthropic from '@anthropic-ai/sdk'
import type { MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages'
import * as cheerio from 'cheerio'
import { buildExtractRecipeRequest, MAX_ARTICLE_CHARS } from '@/lib/ai/extract-recipe'
import { parseJsonFromText } from '@/lib/ai/json-response'
import { collectJsonLd, fetchPageHtml } from '@/lib/scraper'
import { parseJsonLd } from '@/lib/scraper/jsonld'
import { extractArticleContent } from '@/lib/scraper/readability'
import { detectInputProblem } from './coverage'
import { newId } from './store'
import type { EvalCase, EvalReference, EvalRun, PromptId } from './types'

// Each prompt plugs into the eval tool with two pieces:
//  - prepare: turn what the person typed into the prompt's input, by running
//    the same pipeline production runs before the model call;
//  - buildRequest: the production request builder for that input.
//  - loadReference (optional): what the page itself says the answer is, so the
//    person judging can tell a bad input from a bad model answer.
interface PromptRunner {
  prepare(
    source: Record<string, string>
  ): Promise<Pick<EvalCase, 'label' | 'source' | 'input' | 'meta' | 'reference' | 'inputProblem'>>
  buildRequest(input: EvalCase['input']): MessageCreateParamsNonStreaming
  loadReference?(source: EvalCase['source']): Promise<EvalReference | null>
}

function parseUrl(raw: string | undefined): string {
  const url = raw?.trim()
  if (!url) throw new Error('Enter a URL')
  try {
    new URL(url)
  } catch {
    throw new Error('That is not a valid URL')
  }
  return url
}

type JsonLdRecipe = ReturnType<typeof parseJsonLd>

/** The page's own recipe data, as the importer reads it, to compare against. */
function jsonLdReference(jsonLd: JsonLdRecipe): EvalReference | null {
  if (!jsonLd) return null
  return {
    source: jsonLd.partial ? 'JSON-LD (incomplete)' : 'JSON-LD',
    data: { rawIngredients: jsonLd.rawIngredients, rawSteps: jsonLd.rawSteps },
  }
}

const extractRecipe: PromptRunner = {
  async prepare(source) {
    const url = parseUrl(source.url)
    const html = await fetchPageHtml(url)
    const $ = cheerio.load(html)
    const jsonLd = parseJsonLd(collectJsonLd($), url)
    const article = extractArticleContent(html, url)
    if (!article) {
      throw new Error(
        'Readability found no article content on this page, so production would never call the model for it.'
      )
    }

    const articleText = article.textContent.slice(0, MAX_ARTICLE_CHARS)
    const jsonLdStatus = !jsonLd ? 'none' : jsonLd.partial ? 'partial' : 'complete'
    return {
      label: article.title || jsonLd?.title || url,
      source: { url },
      input: { articleText, sourceUrl: url },
      reference: jsonLdReference(jsonLd),
      inputProblem: detectInputProblem(articleText, jsonLdReference(jsonLd)),
      meta: {
        pageTitle: article.title,
        detectedLanguage: $('html').attr('lang') ?? null,
        articleChars: article.textContent.length,
        truncated: article.textContent.length > MAX_ARTICLE_CHARS,
        jsonLd: jsonLdStatus,
        // With complete JSON-LD the importer uses it and skips the model; the
        // case is still useful as an eval input, but it isn't a production path.
        productionCallsModel: jsonLdStatus !== 'complete',
        fetchedAt: new Date().toISOString(),
      },
    }
  },
  buildRequest(input) {
    return buildExtractRecipeRequest(String(input.articleText ?? ''))
  },
  async loadReference(source) {
    const url = parseUrl(typeof source.url === 'string' ? source.url : undefined)
    const html = await fetchPageHtml(url)
    return jsonLdReference(parseJsonLd(collectJsonLd(cheerio.load(html)), url))
  },
}

const RUNNERS: Partial<Record<PromptId, PromptRunner>> = {
  'extract-recipe': extractRecipe,
}

export function getRunner(prompt: PromptId): PromptRunner {
  const runner = RUNNERS[prompt]
  if (!runner) throw new Error(`The ${prompt} prompt is not wired into the eval tool yet`)
  return runner
}

let client: Anthropic | null = null

/** Calls the model once for a case. API failures are recorded on the run, not thrown. */
export async function executeRun(evalCase: EvalCase): Promise<EvalRun> {
  const request = getRunner(evalCase.prompt).buildRequest(evalCase.input)
  const base = { id: newId(), createdAt: new Date().toISOString(), request, verdict: null, notes: '' }
  const started = Date.now()
  try {
    client ??= new Anthropic()
    const response = await client.messages.create(request)
    const rawText = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
    const parsed = parseJsonFromText(rawText)
    return {
      ...base,
      rawText,
      output: parsed.ok ? parsed.value : null,
      ...(!parsed.ok && { parseError: parsed.error }),
      stopReason: response.stop_reason,
      usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
      durationMs: Date.now() - started,
    }
  } catch (err) {
    return {
      ...base,
      rawText: '',
      output: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    }
  }
}
