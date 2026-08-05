import { JSDOM } from 'jsdom'
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

export function extractArticleContent(html: string, url: string): ArticleContent | null {
  let article: ReturnType<Readability['parse']>
  try {
    const dom = new JSDOM(html, { url })
    article = new Readability(dom.window.document, { charThreshold: CHAR_THRESHOLD }).parse()
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
