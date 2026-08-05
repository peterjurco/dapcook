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

// Uses linkedom instead of jsdom: Vercel's Node.js function runtime unconditionally
// passes --no-experimental-require-module, disabling require() of ES modules
// regardless of the selected Node.js version. jsdom (v26+) requires the ESM-only
// @exodus/bytes package from several of its own core files, which crashes there.
// linkedom is pinned to an exact pre-ESM version — see package.json.
export function extractArticleContent(html: string, url: string): ArticleContent | null {
  let article: ReturnType<Readability['parse']>
  try {
    const { document } = parseHTML(html)
    article = new Readability(document, { charThreshold: CHAR_THRESHOLD }).parse()
  } catch (err) {
    console.error(`[readability] Failed to parse article content for ${url}:`, err)
    return null
  }

  if (!article) return null

  const textContent = article.textContent?.trim() ?? ''
  if (textContent.length < CHAR_THRESHOLD) return null

  return {
    title: article.title?.trim() ?? '',
    textContent,
  }
}
