// Fallback for WordPress recipe blogs whose HTML pages are behind a bot challenge
// (e.g. Cloudflare's "Just a moment..." page served to Vercel's datacenter IPs).
// WordPress publishes the same post through its public REST API, which sites often
// leave unchallenged because API clients can't run a browser challenge. We fetch the
// post there and rebuild a minimal HTML document from it, so the rest of the
// importer (JSON-LD → article extraction → meta tags) runs unchanged.

interface WordPressPost {
  link?: string
  title?: { rendered?: string }
  content?: { rendered?: string }
  /** Yoast SEO's rendered <head> tags (title, og:*, its JSON-LD schema graph), when installed. */
  yoast_head?: string
}

const FIELDS = 'link,title,content,yoast_head'

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
}

function normalizePath(path: string): string {
  return path.replace(/\/+$/, '') || '/'
}

/**
 * The REST endpoints to try for a post URL, most specific install path first:
 * https://site.com/blog/my-post/ → site.com/blog/wp-json/…, then site.com/wp-json/…
 * Returns [] when the URL has no slug-like last path segment.
 */
export function wordPressApiCandidates(pageUrl: string): string[] {
  let url: URL
  try {
    url = new URL(pageUrl)
  } catch {
    return []
  }
  const segments = url.pathname.split('/').filter(Boolean)
  const slug = segments.at(-1)
  if (!slug || !/^[\w%-]+$/.test(slug)) return []

  // Only the first directory and the site root are realistic WordPress install paths.
  const bases = segments.length >= 2 ? [`${url.origin}/${segments[0]}`, url.origin] : [url.origin]
  return bases.map((base) => `${base}/wp-json/wp/v2/posts?slug=${slug}&_fields=${FIELDS}`)
}

/** Picks the post whose permalink matches the page; a lone result is accepted as-is. */
function matchPost(posts: WordPressPost[], pageUrl: string): WordPressPost | null {
  const wanted = normalizePath(new URL(pageUrl).pathname)
  const exact = posts.find((post) => {
    try {
      return post.link && normalizePath(new URL(post.link).pathname) === wanted
    } catch {
      return false
    }
  })
  if (exact) return exact
  return posts.length === 1 ? posts[0] : null
}

/** Wraps a REST post in the minimal HTML document the importer's parsers expect. */
export function buildPostHtml(post: WordPressPost): string {
  const title = post.title?.rendered ?? ''
  const head = post.yoast_head ?? `<title>${title}</title>`
  return `<!DOCTYPE html><html><head>${head}</head><body><article><h1>${title}</h1>${post.content?.rendered ?? ''}</article></body></html>`
}

/**
 * Fetches the page's post through the WordPress REST API and returns it as HTML,
 * or null when the site isn't WordPress, the API is blocked too, or no post matches.
 */
export async function fetchWordPressPostHtml(pageUrl: string): Promise<string | null> {
  for (const endpoint of wordPressApiCandidates(pageUrl)) {
    let response: Response
    try {
      response = await fetch(endpoint, { headers: HEADERS, signal: AbortSignal.timeout(10_000) })
    } catch (err) {
      console.error(`[scraper] WordPress API request failed for ${endpoint}:`, err)
      continue
    }

    console.info(`[scraper] WordPress API fallback ${endpoint}: ${response.status}`, {
      cfMitigated: response.headers.get('cf-mitigated'),
    })
    if (!response.ok) continue

    const posts = await response.json().catch(() => null) as unknown
    if (!Array.isArray(posts)) continue

    const post = matchPost(posts as WordPressPost[], pageUrl)
    if (post?.content?.rendered) return buildPostHtml(post)
  }
  return null
}
