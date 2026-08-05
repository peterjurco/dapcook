// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { extractArticleContent } from './readability'

const URL = 'https://example.com/grandmas-apple-pie'

const ARTICLE_HTML = `
<!DOCTYPE html>
<html lang="en">
<head><title>Grandma's Apple Pie</title></head>
<body>
<nav><a href="/">Home</a><a href="/about">About</a></nav>
<article>
<h1>Grandma's Apple Pie</h1>
<p>This is my grandmother's classic apple pie recipe, passed down for three generations in our family. It strikes the perfect balance of sweet and tart, with a flaky, buttery crust that never fails to impress guests at every holiday gathering we host.</p>
<h2>Ingredients</h2>
<ul>
<li>6 cups thinly sliced apples</li>
<li>3/4 cup white sugar</li>
<li>2 tablespoons all-purpose flour</li>
<li>1 teaspoon ground cinnamon</li>
<li>1/4 teaspoon ground nutmeg</li>
<li>1 recipe pastry for a 9 inch double crust pie</li>
</ul>
<h2>Instructions</h2>
<ol>
<li>Preheat oven to 425 degrees F (220 degrees C).</li>
<li>In a large bowl, combine apples, sugar, flour, cinnamon and nutmeg, and toss gently to coat evenly.</li>
<li>Line a 9 inch pie pan with the bottom crust, then fill with the apple mixture.</li>
<li>Cover with the top crust, seal the edges, and cut a few slits for steam to escape.</li>
<li>Bake for 45 minutes, or until the crust is golden brown and the filling is bubbly.</li>
</ol>
</article>
<footer>Copyright 2024 Grandma's Kitchen Blog</footer>
</body>
</html>
`

const NON_ARTICLE_HTML = `
<!DOCTYPE html>
<html><head><title>Category Page</title></head>
<body><nav><a href="/">Home</a></nav><footer>Copyright 2024</footer></body></html>
`

// Readability recognizes both of these as article candidates and returns non-null
// for both (verified: extracted textContent is 74 and 234 chars respectively) — the
// CHAR_THRESHOLD floor check inside extractArticleContent is what rejects the short one.
const SHORT_ARTICLE_HTML = `
<!DOCTYPE html>
<html><head><title>Quick Soup</title></head>
<body>
<nav><a href="/">Home</a></nav>
<article>
<h1>Quick Soup</h1>
<p>A quick weeknight soup with just five ingredients and ten minutes of prep.</p>
</article>
<footer>Copyright 2024</footer>
</body></html>
`

const LONG_ARTICLE_HTML = `
<!DOCTYPE html>
<html><head><title>Quick Soup</title></head>
<body>
<nav><a href="/">Home</a></nav>
<article>
<h1>Quick Soup</h1>
<p>A quick weeknight soup with just five ingredients and ten minutes of prep. It comes together in one pot, uses pantry staples you already have, and reheats beautifully for lunch the next day without losing any of its flavor or texture.</p>
</article>
<footer>Copyright 2024</footer>
</body></html>
`

describe('extractArticleContent', () => {
  it('extracts title and text content from a blog article', () => {
    const result = extractArticleContent(ARTICLE_HTML, URL)
    expect(result).not.toBeNull()
    expect(result!.title).toContain('Apple Pie')
    expect(result!.textContent).toContain('6 cups thinly sliced apples')
    expect(result!.textContent).toContain('Preheat oven to 425 degrees F')
  })

  it('returns null when the page has no identifiable article content', () => {
    const result = extractArticleContent(NON_ARTICLE_HTML, URL)
    expect(result).toBeNull()
  })

  it('returns null when extracted content is clearly under CHAR_THRESHOLD', () => {
    const result = extractArticleContent(SHORT_ARTICLE_HTML, URL)
    expect(result).toBeNull()
  })

  it('returns non-null when extracted content is clearly over CHAR_THRESHOLD', () => {
    const result = extractArticleContent(LONG_ARTICLE_HTML, URL)
    expect(result).not.toBeNull()
    expect(result!.textContent.length).toBeGreaterThan(200)
  })
})

describe('extractArticleContent dependencies — Vercel compatibility', () => {
  // Vercel's Node.js serverless function runtime unconditionally passes
  // --no-experimental-require-module, disabling require() of ES modules
  // regardless of the selected Node.js version (confirmed via Vercel community
  // reports; this is NOT fixed by bumping engines.node). jsdom (v26+) fails this
  // because it requires the ESM-only @exodus/bytes package from several of its
  // own core files. This test reproduces that exact restriction locally and
  // would have caught that regression — and would catch it again if a future
  // dependency bump (linkedom or otherwise) reintroduces a synchronous require()
  // of an ES module anywhere in this module's dependency chain.
  it('requires cleanly with Node ESM-require support disabled', () => {
    const script = `
      const { parseHTML } = require('linkedom');
      const { Readability } = require('@mozilla/readability');
      const { document } = parseHTML(
        '<html><body><article><h1>Test</h1><p>' +
        'This is a long enough paragraph of article text for Readability to ' +
        'recognize it as real content worth extracting, rather than discarding it.' +
        '</p></article></body></html>'
      );
      const article = new Readability(document).parse();
      if (!article || !article.textContent.includes('Readability')) {
        throw new Error('extraction did not produce expected content');
      }
      console.log('OK');
    `

    const result = execFileSync(process.execPath, ['--no-require-module', '-e', script], {
      encoding: 'utf-8',
      cwd: process.cwd(),
    })

    expect(result.trim()).toBe('OK')
  })
})
