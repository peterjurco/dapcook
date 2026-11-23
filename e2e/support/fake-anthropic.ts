/**
 * Stand-in for api.anthropic.com while the e2e suite runs. The app under test
 * gets ANTHROPIC_BASE_URL pointing here, so no test can make a paid call.
 *
 * A request whose prompt one of the `cannedReplies` recognises gets a
 * deterministic answer built from its own input. Anything else gets a
 * non-retryable 400, so the feature takes its error path. A test that needs
 * another AI feature adds a reply here rather than reach the real API.
 *
 *   node e2e/support/fake-anthropic.ts
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

createServer((req, res) => {
  if (req.method === 'GET') {
    // Playwright's webServer readiness probe.
    res.writeHead(200).end('fake anthropic')
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
