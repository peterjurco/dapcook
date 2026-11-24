import { parseHTML } from 'linkedom'
import { Readability } from '@mozilla/readability'

export interface ArticleContent {
  title: string
  textContent: string
}

// Recipe posts can be short on prose (an ingredient list + a few steps),
// so use a lower threshold than Readability's news-article-tuned default (500).
// Also used as a hard floor below Readability's own return value: Readability's
// charThreshold only affects which internal heuristic pass it picks, not whether
// it gives up — a low-content page (e.g. bare nav/footer text) can still come
// back non-null with a handful of characters, so we reject those explicitly.
const CHAR_THRESHOLD = 200

// Readability's "clean conditionally" pass strips blocks inside the article that
// look like clutter: list-heavy, link-heavy, few paragraphs. A recipe's
// ingredient list is exactly that shape, especially when ingredients link to a
// shop (gymbeam.sk) or sit in a recipe-plugin box (tinkinerecepty.sk), so the
// model got the steps but no ingredients. Readability has no public option for
// this; it turns the flag off itself as a last resort when the result is too
// short, and we turn it off from the start. readability.test.ts guards it.
type ReadabilityFlags = { _removeFlag(flag: number): void; FLAG_CLEAN_CONDITIONALLY: number }

// textContent keeps the page source's indentation: on themodernproper.com 68%
// of the article text was whitespace, which pushed the recipe past the model's
// character cap (and was paid for as input tokens). Collapse runs of spaces and
// tabs, trim each line and drop blank lines, keeping one line break between
// lines so ingredients and steps stay on their own lines.
export function collapseWhitespace(text: string): string {
  return text
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n\s*/g, '\n')
    .trim()
}

// Elements that start a new line when the page is rendered. textContent ignores
// that: a recipe card written without whitespace between its <li>s came out as
// "olive oil7 cups vegetable broth¾ cup diced shallots" (hellolittlehome.com),
// leaving the model to guess where each ingredient ends.
const BLOCK_ELEMENTS =
  'address,article,aside,blockquote,dd,div,dl,dt,figcaption,figure,footer,h1,h2,h3,h4,h5,h6,header,hr,li,main,nav,ol,p,pre,section,table,tr,ul'

/** Text of an HTML fragment with a line break around every block element and between table cells' rows. */
export function htmlToText(html: string): string {
  const { document } = parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`)
  const newline = () => document.createTextNode('\n')
  for (const br of [...document.querySelectorAll('br')]) br.parentNode?.replaceChild(newline(), br)
  // Cells of one row stay on one line ("800 g" | "panenka bravčová").
  for (const cell of [...document.querySelectorAll('td,th')]) cell.appendChild(document.createTextNode(' '))
  for (const el of [...document.querySelectorAll(BLOCK_ELEMENTS)]) {
    el.parentNode?.insertBefore(newline(), el)
    el.appendChild(newline())
  }
  return document.body.textContent ?? ''
}

// Uses linkedom instead of jsdom: Vercel's Node.js function runtime unconditionally
// passes --no-experimental-require-module, disabling require() of ES modules
// regardless of the selected Node.js version. jsdom (v26+) requires the ESM-only
// @exodus/bytes package from several of its own core files, which crashes there.
// linkedom is pinned to an exact pre-ESM version — see package.json.
export function extractArticleContent(html: string, url: string): ArticleContent | null {
  let article: ReturnType<Readability['parse']>
  try {
    const { document } = parseHTML(html)
    const reader = new Readability(document, { charThreshold: CHAR_THRESHOLD })
    const flags = reader as unknown as ReadabilityFlags
    flags._removeFlag(flags.FLAG_CLEAN_CONDITIONALLY)
    article = reader.parse()
  } catch (err) {
    console.error(`[readability] Failed to parse article content for ${url}:`, err)
    return null
  }

  if (!article) return null

  const textContent = collapseWhitespace(article.content ? htmlToText(article.content) : article.textContent ?? '')
  if (textContent.length < CHAR_THRESHOLD) return null

  return {
    title: article.title?.trim() ?? '',
    textContent,
  }
}
