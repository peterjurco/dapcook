/**
 * The outside world, faked, while the e2e suite runs.
 *
 * - POST /v1/messages — stand-in for api.anthropic.com. The app under test gets
 *   ANTHROPIC_BASE_URL pointing here, so no test can make a paid call. Every AI
 *   feature has a canned reply below that recognises its prompt and answers
 *   deterministically from the prompt's own input, roughly the way the model
 *   would. An unrecognised prompt gets a non-retryable 400, so the feature takes
 *   its error path. A new AI feature needs a reply here, never the real API.
 * - Failures on demand: a prompt containing `fail-ai:<feature>` (see `Feature`)
 *   gets a 400 from that feature only; `fail-ai-once:<feature>` fails the first
 *   request and answers the retry. Tests put the marker in a recipe title or an
 *   item name, so parallel tests never affect each other.
 * - GET /anthropic/requests?contains=<text> — the prompts received so far that
 *   contain <text>, newest last, for tests that check what was sent to the AI.
 * - GET /recipe-site/<slug> — a recipe website for URL import (see `recipePages`
 *   and `articlePages`). `?title=` overrides the page's recipe title, so a test
 *   can make it unique or add a failure marker. Unknown slugs are a 404.
 *
 *   node e2e/support/fake-services.ts
 */
import { createServer } from 'node:http'

const port = Number(process.env.PORT ?? 3011)

interface MessagesRequest {
  model?: string
  messages?: { role: string; content: string | { type: string; text?: string }[] }[]
}

type Feature = 'parse' | 'extract' | 'transform' | 'tags' | 'shopping'

/** Reply text for a prompt of this feature, or null when the prompt isn't one. */
interface CannedReply {
  feature: Feature
  matches: (prompt: string) => boolean
  reply: (prompt: string) => string
}

function between(text: string, start: string, end: string): string {
  const from = text.indexOf(start)
  if (from === -1) return ''
  const rest = text.slice(from + start.length)
  const to = rest.indexOf(end)
  return to === -1 ? rest : rest.slice(0, to)
}

/** "1. 200 g flour" lines → "200 g flour". */
function numberedLines(block: string): string[] {
  return block
    .split('\n')
    .map((line) => line.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// Tag suggestions (src/lib/ai/suggest-tags.ts, and the import's parse call)
// ---------------------------------------------------------------------------

/** Dish words the fake recognises as belonging to a cuisine, for the one "new" tag. */
const CUISINES: Record<string, string> = {
  shakshuka: 'middle eastern',
  curry: 'indian',
  carbonara: 'italian',
  taco: 'mexican',
  ramen: 'japanese',
}

function householdTagsIn(prompt: string): string[] {
  const line = prompt.match(/The household already uses these tags: (.*)/)?.[1] ?? ''
  return [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1])
}

/** Existing tags: household tags named in the title or ingredients. New: the dish's cuisine, if known. */
function fakeTagSuggestions(prompt: string, title: string, ingredients: string) {
  const householdTags = householdTagsIn(prompt)
  const haystack = `${title} ${ingredients}`.toLowerCase()
  const existing = householdTags.filter((tag) => haystack.includes(tag.toLowerCase()))
  const cuisine = Object.entries(CUISINES).find(([dish]) => title.toLowerCase().includes(dish))?.[1] ?? null
  return { existing, new: cuisine && !householdTags.includes(cuisine) ? cuisine : null }
}

const suggestTags: CannedReply = {
  feature: 'tags',
  matches: (prompt) => prompt.startsWith('Suggest tags for this recipe.'),
  reply: (prompt) => {
    const title = JSON.parse(prompt.match(/Recipe title: (".*")\n/)?.[1] ?? '""') as string
    const ingredients = prompt.match(/Ingredients: (.*)\n/)?.[1] ?? ''
    return JSON.stringify(fakeTagSuggestions(prompt, title, ingredients))
  },
}

// ---------------------------------------------------------------------------
// Structuring ingredient and step lines (src/lib/ai/parse-recipe.ts)
// ---------------------------------------------------------------------------

const UNITS = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'cups', 'oz', 'lb', 'fl oz', 'pinch', 'ČL', 'PL']

function toNumber(text: string): number {
  if (text.includes('/')) {
    const [a, b] = text.split('/').map(Number)
    return a / b
  }
  return Number(text.replace(',', '.'))
}

/** "500 g flour, sifted" → { quantity: 500, unit: "g", name: "flour", notes: "sifted" }. */
function parseIngredient(line: string) {
  const units = UNITS.map((u) => u.replace(' ', '\\s')).join('|')
  const match = line.match(new RegExp(`^(\\d+/\\d+|\\d+(?:[.,]\\d+)?)\\s*(?:(${units})\\s+)?(.+)$`, 'i'))
  const [quantity, unit, rest] = match ? [toNumber(match[1]), match[2] ?? '', match[3]] : [null, '', line]
  const [name, ...notes] = rest.split(', ')
  return { quantity, unit, name: name.trim(), notes: notes.join(', ').trim() }
}

const parseRecipe: CannedReply = {
  feature: 'parse',
  matches: (prompt) => prompt.startsWith('Parse this recipe data into structured JSON.'),
  reply: (prompt) => {
    const ingredientLines = numberedLines(between(prompt, 'Raw ingredients (one per line):\n', '\n\nRaw steps'))
    const stepLines = numberedLines(between(prompt, 'Raw steps (one per line):\n', '\n\nReturn a JSON object'))
    const reply: Record<string, unknown> = {
      ingredients: ingredientLines.map(parseIngredient),
      steps: stepLines.map((text, i) => ({ order: i + 1, text })),
    }
    const tagTitle = prompt.match(/suggesting tags for the recipe titled (".*")\.\n/)?.[1]
    if (tagTitle) {
      reply.suggestedTags = fakeTagSuggestions(prompt, JSON.parse(tagTitle) as string, ingredientLines.join(' '))
    }
    return JSON.stringify(reply)
  },
}

// ---------------------------------------------------------------------------
// Reading a recipe out of a page's article text (src/lib/ai/extract-recipe.ts)
// ---------------------------------------------------------------------------

/** Lines under an "Ingredients" heading, and under a "Method"/"Instructions" one. Nothing if neither. */
const extractRecipe: CannedReply = {
  feature: 'extract',
  matches: (prompt) => prompt.includes('Determine whether it contains a cooking recipe.'),
  reply: (prompt) => {
    const lines = between(prompt, 'Article text:\n', '\n\nReturn a JSON object')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    const ingredientsAt = lines.findIndex((l) => /^ingredients$/i.test(l))
    const stepsAt = lines.findIndex((l) => /^(method|instructions|directions)$/i.test(l))
    const endAt = lines.findIndex((l, i) => i > stepsAt && /^comments$/i.test(l))
    return JSON.stringify({
      rawIngredients: ingredientsAt === -1 ? [] : lines.slice(ingredientsAt + 1, stepsAt === -1 ? undefined : stepsAt),
      rawSteps: stepsAt === -1 ? [] : lines.slice(stepsAt + 1, endAt === -1 ? undefined : endAt),
    })
  },
}

// ---------------------------------------------------------------------------
// Translation and unit conversion (src/lib/ai/transform-recipe.ts)
// ---------------------------------------------------------------------------

/** unit → [target unit, factor], per target system. */
const CONVERSIONS: Record<'metric' | 'imperial', Record<string, [string, number]>> = {
  imperial: { g: ['oz', 1 / 28.35], kg: ['lb', 2.205], ml: ['fl oz', 1 / 29.57], l: ['fl oz', 33.81] },
  metric: { oz: ['g', 28.35], lb: ['g', 453.6], cup: ['ml', 240], cups: ['ml', 240], 'fl oz': ['ml', 29.57] },
}

interface Content {
  title: string
  description: string | null
  ingredients: { quantity: number | null; unit: string; name: string; notes: string }[]
  steps: { text: string }[]
  notes: string | null
}

/**
 * Translation appends " (<Language>)" to every text field — "flour" → "flour
 * (Slovak)" — so a test can see exactly what was translated. Conversion maps
 * metric ⇄ imperial with real factors, rounded to one decimal.
 */
const transformRecipe: CannedReply = {
  feature: 'transform',
  matches: (prompt) => prompt.startsWith('You are a recipe transformation assistant.'),
  reply: (prompt) => {
    const content = JSON.parse(between(prompt, 'Recipe JSON:\n', '\n\nReturn ONLY valid JSON')) as Content
    const language = prompt.match(/Translate all text fields to ([^.]+)\./)?.[1]
    const target = prompt.match(/Convert all quantities to (metric|imperial) units/)?.[1] as 'metric' | 'imperial' | undefined
    const tr = <T extends string | null>(text: T): T => (language && text ? (`${text} (${language})` as T) : text)

    return JSON.stringify({
      ...content,
      title: tr(content.title),
      description: tr(content.description),
      notes: tr(content.notes),
      ingredients: content.ingredients.map((ing) => {
        const conversion = target ? CONVERSIONS[target][ing.unit.toLowerCase()] : undefined
        return {
          ...ing,
          name: tr(ing.name),
          notes: tr(ing.notes || null) ?? '',
          ...(conversion && ing.quantity != null
            ? { unit: conversion[0], quantity: Math.round(ing.quantity * conversion[1] * 10) / 10 }
            : {}),
        }
      }),
      steps: content.steps.map((step) => ({ ...step, text: tr(step.text) })),
    })
  },
}

// ---------------------------------------------------------------------------
// Shopping list merge (src/lib/ai/make-shopping-list.ts)
// ---------------------------------------------------------------------------

/**
 * Merges items with the same name and unit (summing quantities, joining their
 * recipes) and files everything under the household's first category, so tests
 * can predict the list exactly.
 */
const shoppingList: CannedReply = {
  feature: 'shopping',
  matches: (prompt) => prompt.includes('Here are the shopping items:'),
  reply: (prompt) => {
    const marker = 'Here are the shopping items:'
    const items = JSON.parse(prompt.slice(prompt.indexOf(marker) + marker.length)) as {
      name: string
      quantity: number | null
      unit: string
      source_recipe_ids: string[]
    }[]
    const listed = prompt.match(/Use ONLY these categories \(in this order\): (.*)\.\n/)?.[1]
    const categories = listed ? listed.split(', ') : ['Pantry']

    const merged = new Map<string, { name: string; quantity: number | null; unit: string; category: string; source_recipe_ids: string[] }>()
    for (const { name, quantity, unit, source_recipe_ids } of items) {
      const key = `${name.toLowerCase()}|${unit}`
      const seen = merged.get(key)
      if (!seen) {
        merged.set(key, { name, quantity, unit, category: categories[0], source_recipe_ids: [...source_recipe_ids] })
        continue
      }
      seen.quantity = seen.quantity == null || quantity == null ? seen.quantity ?? quantity : seen.quantity + quantity
      seen.source_recipe_ids = [...new Set([...seen.source_recipe_ids, ...source_recipe_ids])]
    }
    return JSON.stringify({ items: [...merged.values()], categories })
  },
}

const cannedReplies: CannedReply[] = [parseRecipe, extractRecipe, transformRecipe, suggestTags, shoppingList]

/** Prompts seen with a `fail-ai-once:` marker, keyed by the marked text, so the retry succeeds. */
const failedOnce = new Set<string>()

function shouldFail(feature: Feature, prompt: string): boolean {
  if (prompt.includes(`fail-ai:${feature}`)) return true
  const once = prompt.match(new RegExp(`[^"\\n]*fail-ai-once:${feature}[^"\\n]*`))?.[0]
  if (!once || failedOnce.has(once)) return false
  failedOnce.add(once)
  return true
}

const received: string[] = []

function promptOf(request: MessagesRequest): string {
  return (request.messages ?? [])
    .flatMap((m) => (typeof m.content === 'string' ? [m.content] : m.content.map((c) => c.text ?? '')))
    .join('\n')
}

// ---------------------------------------------------------------------------
// The fake recipe website
// ---------------------------------------------------------------------------

/** Pages with schema.org JSON-LD, like most real recipe sites. `lang` is the page's <html lang>. */
const recipePages: Record<string, { lang: string; recipe: Record<string, unknown> }> = {
  shakshuka: {
    lang: 'en',
    recipe: {
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Fake-site shakshuka',
      description: 'Eggs poached in a spiced tomato sauce.',
      recipeYield: '2',
      prepTime: 'PT10M',
      cookTime: 'PT20M',
      recipeIngredient: ['4 eggs', '400 g chopped tomatoes', '1 tsp cumin, ground'],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Simmer the tomatoes with the cumin.' },
        { '@type': 'HowToStep', text: 'Crack in the eggs and cover until set.' },
      ],
    },
  },
  'american-pancakes': {
    lang: 'en-US',
    recipe: {
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Fluffy American pancakes',
      recipeYield: '4',
      recipeIngredient: ['2 cups flour', '8 oz milk', '2 eggs'],
      recipeInstructions: [{ '@type': 'HowToStep', text: 'Whisk everything and fry in small rounds.' }],
    },
  },
}

/** Pages without recipe data: only the article text, which the AI has to read. */
const articlePages: Record<string, { title: string; paragraphs: string[]; ingredients?: string[]; steps?: string[] }> = {
  'lentil-soup-blog': {
    title: "Grandma's lentil soup",
    paragraphs: [
      'Every winter my grandmother made this soup on Sunday afternoons, and the whole flat smelled of cumin and bay leaves.',
      'It is cheap, it keeps for days in the fridge, and it tastes better on the second day than on the first.',
    ],
    ingredients: ['250 g red lentils', '1 l vegetable stock', '2 carrots, diced'],
    steps: ['Rinse the lentils.', 'Simmer everything for 25 minutes.', 'Blend half of the soup and stir it back in.'],
  },
  'travel-diary': {
    title: 'Three days in Lisbon',
    paragraphs: [
      'We arrived in Lisbon on a rainy Tuesday and spent the first afternoon riding tram 28 up and down the hills.',
      'The second day was all museums and custard tarts, and on the third we took the train out to Sintra and its palaces.',
      'Next time we will stay longer and see more of the coast north of the city.',
    ],
  },
}

function recipePage(slug: string, titleOverride: string | null): string | null {
  const page = recipePages[slug]
  if (page) {
    const recipe = { ...page.recipe, ...(titleOverride && { name: titleOverride }) }
    const name = recipe.name as string
    return `<!doctype html><html lang="${page.lang}"><head><meta charset="utf-8"><title>${name}</title>
<meta property="og:title" content="${name}">
<script type="application/ld+json">${JSON.stringify(recipe)}</script></head>
<body><article><h1>${name}</h1><p>A recipe from the e2e fake recipe site.</p></article></body></html>`
  }

  const article = articlePages[slug]
  if (!article) return null
  const title = titleOverride ?? article.title
  const list = (items: string[], tag: 'ul' | 'ol') => `<${tag}>${items.map((i) => `<li>${i}</li>`).join('')}</${tag}>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<meta property="og:title" content="${title}"></head>
<body><nav><a href="/">Home</a> <a href="/about">About</a></nav>
<main><article><h1>${title}</h1>
${article.paragraphs.map((p) => `<p>${p}</p>`).join('\n')}
${article.ingredients ? `<h2>Ingredients</h2>${list(article.ingredients, 'ul')}` : ''}
${article.steps ? `<h2>Method</h2>${list(article.steps, 'ol')}` : ''}
</article></main><footer><p>© The e2e fake blog</p></footer></body></html>`
}

// ---------------------------------------------------------------------------

function json(res: import('node:http').ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`)
  if (req.method === 'GET') {
    const slug = url.pathname.match(/^\/recipe-site\/([\w-]+)$/)?.[1]
    if (slug) {
      const html = recipePage(slug, url.searchParams.get('title'))
      res.writeHead(html ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' }).end(html ?? 'Not found')
      return
    }
    if (url.pathname === '/anthropic/requests') {
      const contains = url.searchParams.get('contains') ?? ''
      json(res, 200, received.filter((prompt) => prompt.includes(contains)))
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
    received.push(prompt)
    if (received.length > 2000) received.shift()

    const canned = cannedReplies.find((c) => c.matches(prompt))
    const fail = !canned || shouldFail(canned.feature, prompt)
    if (fail) {
      console.log(`[fake-anthropic] ${canned ? `${canned.feature}: failure requested` : 'no canned reply'} → 400`)
      json(res, 400, {
        type: 'error',
        error: { type: 'invalid_request_error', message: 'Rejected by the e2e fake Anthropic API.' },
      })
      return
    }

    const text = canned.reply(prompt)
    json(res, 200, {
      id: `msg_e2e_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      model: request.model ?? 'e2e-fake',
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: prompt.length, output_tokens: text.length },
    })
  })
}).listen(port, () => console.log(`[fake-anthropic] listening on ${port}`))
