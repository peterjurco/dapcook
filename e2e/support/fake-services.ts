/**
 * The outside world, faked, while the e2e suite runs.
 *
 * - POST /v1/messages — stand-in for api.anthropic.com. The app under test gets
 *   ANTHROPIC_BASE_URL pointing here, so no test can make a paid call. A request
 *   whose prompt one of the `cannedReplies` recognises gets a deterministic
 *   answer built from its own input; anything else gets a non-retryable 400, so
 *   the feature takes its error path. A test that needs another AI feature adds
 *   a reply here rather than reach the real API.
 * - GET /recipe-site/<slug> — a recipe website for URL import (see `recipePages`).
 *   Unknown slugs are a 404.
 *
 *   node e2e/support/fake-services.ts
 */
import { createServer } from 'node:http'

const port = Number(process.env.PORT ?? 3011)

interface MessagesRequest {
  model?: string
  messages?: { role: string; content: string | { type: string; text?: string }[] }[]
}

type CannedReply = (prompt: string) => string | null

/**
 * src/lib/ai/make-shopping-list.ts — every item passes through unmerged, filed
 * under the household's first category, so tests can predict the list exactly.
 */
const shoppingList: CannedReply = (prompt) => {
  const marker = 'Here are the shopping items:'
  if (!prompt.includes(marker)) return null
  const items = JSON.parse(prompt.slice(prompt.indexOf(marker) + marker.length)) as {
    name: string
    quantity: number | null
    unit: string
    source_recipe_ids: string[]
  }[]
  const listed = prompt.match(/Use ONLY these categories \(in this order\): (.*)\.\n/)?.[1]
  const categories = listed ? listed.split(', ') : ['Pantry']
  return JSON.stringify({
    items: items.map(({ name, quantity, unit, source_recipe_ids }) => ({
      name,
      quantity,
      unit,
      category: categories[0],
      source_recipe_ids,
    })),
    categories,
  })
}

const cannedReplies: CannedReply[] = [shoppingList]

function promptOf(request: MessagesRequest): string {
  return (request.messages ?? [])
    .flatMap((m) => (typeof m.content === 'string' ? [m.content] : m.content.map((c) => c.text ?? '')))
    .join('\n')
}

/** Pages of the fake recipe website, with schema.org JSON-LD like real recipe sites. */
export const recipePages: Record<string, object> = {
  'shakshuka': {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: 'Fake-site shakshuka',
    description: 'Eggs poached in a spiced tomato sauce.',
    recipeYield: '2',
    prepTime: 'PT10M',
    cookTime: 'PT20M',
    recipeIngredient: ['4 eggs', '400 g chopped tomatoes', '1 tsp cumin'],
    recipeInstructions: [
      { '@type': 'HowToStep', text: 'Simmer the tomatoes with the cumin.' },
      { '@type': 'HowToStep', text: 'Crack in the eggs and cover until set.' },
    ],
  },
}

function recipePage(slug: string): string | null {
  const recipe = recipePages[slug]
  if (!recipe) return null
  const name = (recipe as { name: string }).name
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${name}</title>
<meta property="og:title" content="${name}">
<script type="application/ld+json">${JSON.stringify(recipe)}</script></head>
<body><article><h1>${name}</h1><p>A recipe from the e2e fake recipe site.</p></article></body></html>`
}

createServer((req, res) => {
  if (req.method === 'GET') {
    const slug = req.url?.match(/^\/recipe-site\/([\w-]+)$/)?.[1]
    if (slug) {
      const html = recipePage(slug)
      res.writeHead(html ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' }).end(html ?? 'Not found')
      return
    }
    // Playwright's webServer readiness probe.
    res.writeHead(200).end('e2e fake services')
    return
  }
  let body = ''
  req.on('data', (chunk) => (body += chunk))
  req.on('end', () => {
    let request: MessagesRequest = {}
    try {
      request = JSON.parse(body) as MessagesRequest
    } catch {
      // Falls through to the 400 below.
    }
    const prompt = promptOf(request)
    const text = cannedReplies.map((reply) => reply(prompt)).find((reply) => reply !== null)

    if (text == null) {
      console.log(`[fake-anthropic] ${req.method} ${req.url}: no canned reply → 400`)
      res.writeHead(400, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          type: 'error',
          error: { type: 'invalid_request_error', message: 'No canned reply for this prompt in the e2e fake Anthropic API.' },
        })
      )
      return
    }

    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        id: `msg_e2e_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        model: request.model ?? 'e2e-fake',
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: prompt.length, output_tokens: text.length },
      })
    )
  })
}).listen(port, () => console.log(`[fake-anthropic] listening on ${port}`))
