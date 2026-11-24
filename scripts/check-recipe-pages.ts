// Measures the text the recipe importer would send to the model, on real pages
// saved by the eval tool (evals/pages/, git-ignored). Run it before and after a
// change to the scraper to see what the change does across every saved site:
//
//   npm run check:recipe-pages [-- <folder>]
//
// For each page: whether production calls the model at all (it doesn't when
// the JSON-LD is complete), how long the text is, and how many of the JSON-LD's
// ingredients and steps reach the model.
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import * as cheerio from 'cheerio'
import { MAX_ARTICLE_CHARS } from '../src/lib/ai/article-limits.ts'
import { coverage, detectInputProblem } from '../src/lib/evals/coverage.ts'
import { parseJsonLd } from '../src/lib/scraper/jsonld.ts'
import { extractArticleContent } from '../src/lib/scraper/readability.ts'

async function main() {
  const dir = process.argv[2] ?? path.join(process.cwd(), 'evals', 'pages')
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.html')).sort()
  if (files.length === 0) {
    console.log(`No saved pages in ${dir}. Add inputs in the eval tool (/dev/evals); it saves each page there.`)
    return
  }

  const rows = []
  for (const file of files) {
    const html = await readFile(path.join(dir, file), 'utf8')
    const $ = cheerio.load(html)
    const scripts = $('script[type="application/ld+json"]').map((_, el) => $(el).html() ?? '').get()
    const jsonLd = parseJsonLd(scripts, 'https://example.com')
    const full = extractArticleContent(html, file)?.textContent ?? ''
    const text = full.slice(0, MAX_ARTICLE_CHARS)
    const count = (lines: string[]) => {
      const c = coverage(lines, text)
      return c.total ? `${c.found}/${c.total}` : '–'
    }
    const reference = jsonLd && { source: 'JSON-LD', data: { rawIngredients: jsonLd.rawIngredients, rawSteps: jsonLd.rawSteps } }
    rows.push({
      page: file.replace(/\.html$/, '').slice(0, 50),
      'model called': jsonLd && !jsonLd.partial ? 'no' : 'yes',
      chars: full.length > MAX_ARTICLE_CHARS ? `${full.length} (cut)` : full.length,
      ingredients: jsonLd ? count(jsonLd.rawIngredients) : '?',
      steps: jsonLd ? count(jsonLd.rawSteps) : '?',
      input: !full ? 'NO ARTICLE' : !reference ? 'check by hand' : detectInputProblem(text, reference) ? 'BAD' : 'ok',
    })
  }
  console.table(rows)
  console.log('ingredients/steps: lines of the JSON-LD found in the text the model gets. "?": no JSON-LD to compare with.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
